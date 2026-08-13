import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("My FPL overview re-awaits follow authority on resume", () => {
  const page = source("miniprogram/pages/my-fpl/index/index.ts");
  assert.match(page, /if \(resumed\)[\s\S]*resumeOverview\(\)/);
  assert.match(page, /async resumeOverview\(\)[\s\S]*await waitForAuthoritativeFollow\(\)[\s\S]*lifecycleRevision !== this\.lifecycleRevision[\s\S]*loadOverview\(false, lifecycleRevision\)/);
});

for (const [label, path, loadMethod] of [
  ["Competitions", "miniprogram/pages/competitions/index/index.ts", "loadList"],
  ["Leagues", "miniprogram/pages/my-fpl/leagues/leagues.ts", "loadLeagues"]
]) {
  test(`${label} cancels cold startup and resumes with a visible lifecycle`, () => {
    const page = source(path);
    assert.match(page, /await waitForAuthoritativeFollow\(\)[\s\S]*lifecycleRevision !== this\.lifecycleRevision[\s\S]*initAppData\(false\)[\s\S]*lifecycleRevision !== this\.lifecycleRevision/);
    assert.match(page, new RegExp(`${loadMethod}\\(false, trace, lifecycleRevision\\)`));
    assert.match(page, /onHide\(\)[\s\S]*resumeOnShow = this\.startupPending \|\| this\.data\.loading[\s\S]*lifecycleRevision \+= 1[\s\S]*requestId \+= 1/);
  });
}

test("Entry Profile owns auth and entry reads for its visible lifecycle", () => {
  const page = source("miniprogram/pages/entry/profile/profile.ts");
  assert.match(page, /capturePageRequestTrace\(\{ callerSurface: "entry-profile", trigger: "load" \}\)[\s\S]*await app\.authReady[\s\S]*lifecycleRevision !== this\.lifecycleRevision/);
  assert.match(page, /getEntryInfo\(entryId, forceRefresh, trace\)[\s\S]*if \(!isActiveRequest\(\)\) return/);
  assert.match(page, /onHide\(\)[\s\S]*lifecycleRevision \+= 1[\s\S]*requestId \+= 1/);
});

test("Live landing exposes primary content only after owned context resolution", () => {
  const page = source("miniprogram/pages/live/index/index.ts");
  const template = source("miniprogram/pages/live/index/index.wxml");
  assert.match(page, /onLoad\(\)[\s\S]*loadContext\("page-load"\)/);
  assert.match(page, /loadContext\(reason[\s\S]*await ensureAppContext\(\{ reason \}\)[\s\S]*lifecycleRevision !== this\.lifecycleRevision[\s\S]*contextResolved: true/);
  assert.match(template, /id="\{\{contextResolved \? 'perf-primary-content' : ''\}\}" wx:if="\{\{contextResolved\}\}"/);
});
