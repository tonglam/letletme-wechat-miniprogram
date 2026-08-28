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

function expectedShareIcon(handler) {
  return /(?:Pitch|Image)/.test(handler) ? "image" : "copy";
}

test("every visible share action is an icon-only button", () => {
  const actions = [];

  for (const file of filesWithExtension(miniprogramRoot, ".wxml")) {
    const source = readFileSync(file, "utf8");
    const actionBlocks = source.matchAll(
      /<(view|button|text)\b(?=[^>]*(?:bindtap|catchtap)="([^"]+)")[^>]*>([\s\S]*?)<\/\1>/g,
    );

    for (const match of actionBlocks) {
      const handler = match[2];
      if (!/^on(?:Copy.*Share|Share)/.test(handler)) continue;

      const path = relative(miniprogramRoot, file);
      const icon = expectedShareIcon(handler);
      // Share actions are icon-only: the copy/image glyph is the whole
      // affordance, and no surface reintroduces a text label.
      assert.doesNotMatch(
        match[3],
        /分享文字|分享图片/,
        `${path} ${handler} stays icon-only (no share text label)`,
      );
      assert.doesNotMatch(
        match[3],
        /tool-label/,
        `${path} ${handler} carries no tool-label text`,
      );
      assert.match(
        match[3],
        new RegExp(`${icon}\\.svg`),
        `${path} ${handler} must include the ${icon}.svg icon`,
      );
      actions.push({ handler, path, icon });
    }
  }

  assert.equal(actions.length, 28, "the complete set of visible share actions is covered");
  assert.equal(actions.filter((action) => action.icon === "copy").length, 14);
  assert.equal(actions.filter((action) => action.icon === "image").length, 14);
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
