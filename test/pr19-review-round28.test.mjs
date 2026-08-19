import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

for (const [label, path, loadMethod] of [
  ["Leagues", "miniprogram/pages/my-fpl/leagues/leagues.ts", "loadLeagues"]
]) {
  test(`${label} cancels cold startup and resumes with a visible lifecycle`, () => {
    const page = source(path);
    assert.match(page, /await waitForAuthoritativeFollow\(\)[\s\S]*lifecycleRevision !== this\.lifecycleRevision[\s\S]*initAppData\(false\)[\s\S]*lifecycleRevision !== this\.lifecycleRevision/);
    assert.match(page, new RegExp(`${loadMethod}\\((?:false|forceRefresh), trace, lifecycleRevision\\)`));
    assert.match(page, /onHide\(\)[\s\S]*resumeOnShow = this\.resumeOnShow \|\| this\.startupPending \|\| this\.data\.loading \|\| this\.loadPending[\s\S]*lifecycleRevision \+= 1[\s\S]*requestId \+= 1/);
  });
}

test("Entry Profile owns auth and entry reads for its visible lifecycle", () => {
  const page = source("miniprogram/pages/entry/profile/profile.ts");
  assert.match(page, /async loadAuthoritativeEntry\([\s\S]*capturePageRequestTrace\(\{ callerSurface: "entry-profile", trigger \}\)[\s\S]*await app\.authReady[\s\S]*ownerRevision !== this\.lifecycleRevision/);
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

test("Live landing does not present the next GW as a live gameweek", () => {
  const template = source("miniprogram/pages/live/index/index.wxml");
  assert.match(template, /currentGw \? 'LIVE CENTRE' : '赛季准备中'/);
  assert.match(template, /currentGw \? 'GW ' \+ currentGw : \(event \? '下轮 GW ' \+ event : '-'\)/);
  assert.doesNotMatch(template, /GW \{\{currentGw \|\| event/);
});
