import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const miniprogramRoot = fileURLToPath(new URL("../miniprogram/", import.meta.url));

function filesWithExtension(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesWithExtension(path, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [path] : [];
  });
}

function expectedShareCopy(handler) {
  return /(?:Pitch|Image)/.test(handler) ? "分享图片" : "分享文字";
}

test("every visible share action uses the canonical text or image label", () => {
  const actions = [];

  for (const file of filesWithExtension(miniprogramRoot, ".wxml")) {
    const source = readFileSync(file, "utf8");
    const actionBlocks = source.matchAll(
      /<(view|button|text)\b(?=[^>]*(?:bindtap|catchtap)="([^"]+)")[^>]*>([\s\S]*?)<\/\1>/g,
    );

    for (const match of actionBlocks) {
      const handler = match[2];
      if (!/^on(?:Copy.*Share|Share)/.test(handler)) continue;

      const nestedLabel = match[3].match(
        /<text\b[^>]*class="[^"]*\btool-label\b[^"]*"[^>]*>([\s\S]*?)<\/text>/,
      );
      const label = nestedLabel?.[1] ?? match[3];
      const path = relative(miniprogramRoot, file);
      const expected = expectedShareCopy(handler);
      assert.match(
        label,
        new RegExp(expected),
        `${path} ${handler} must use ${expected}`,
      );
      // Share-image buttons always carry the image icon so every surface
      // presents the same icon + label affordance.
      if (expected === "分享图片") {
        assert.match(
          match[3],
          /image\.svg/,
          `${path} ${handler} must include the image.svg icon`,
        );
      }
      actions.push({ handler, path, expected });
    }
  }

  assert.equal(actions.length, 28, "the complete set of visible share actions is covered");
  assert.equal(actions.filter((action) => action.expected === "分享文字").length, 14);
  assert.equal(actions.filter((action) => action.expected === "分享图片").length, 14);
});

test("legacy share-button labels cannot return", () => {
  const offenders = [];
  const legacyLabels = [
    /:\s*'分享'\s*}}/,
    /:\s*'图片'\s*}}/,
    /分享阵容/,
    /文字分享/,
  ];

  for (const file of filesWithExtension(miniprogramRoot, ".wxml")) {
    const source = readFileSync(file, "utf8");
    if (legacyLabels.some((label) => label.test(source))) {
      offenders.push(relative(miniprogramRoot, file));
    }
  }

  assert.deepEqual(offenders, []);
});

test("share label state uses the same canonical wording", () => {
  const labels = [];

  for (const extension of [".ts", ".js"]) {
    for (const file of filesWithExtension(miniprogramRoot, extension)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/shareLabel:\s*["']([^"']+)["']/g)) {
        labels.push({ label: match[1], path: relative(miniprogramRoot, file) });
      }
    }
  }

  assert.ok(labels.length > 0, "share label state remains covered");
  for (const { label, path } of labels) {
    assert.equal(label, "分享文字", `${path} must use 分享文字`);
  }
});
