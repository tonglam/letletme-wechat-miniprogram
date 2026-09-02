import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("Leagues cancels cold startup and resumes the V2 lifecycle", () => {
  const page = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const compact = page.replace(/\s+/g, " ");
  assert.match(compact, /await waitForAuthoritativeFollow\(\)/);
  assert.match(compact, /if \(!this\.pageVisible \|\| revision !== this\.lifecycleRevision\) return/);
  assert.match(compact, /initAppData\(false\)/);
  assert.match(compact, /loadCatalog\(\s*false/);
  assert.match(compact, /getMyTournamentReviewCatalog/);
  assert.doesNotMatch(compact, /v2Enabled|loadV2Leagues|loadLeagues/);
  assert.match(
    compact,
    /onHide\(\).*?lifecycleRevision \+= 1.*?requestId \+= 1.*?viewRequestId \+= 1/,
  );
});

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
  assert.match(page, /async loadContext\([\s\S]*reason: "page-load" \| "page-show"[\s\S]*await ensureAppContext\(\{ reason \}\)[\s\S]*lifecycleRevision !== this\.lifecycleRevision[\s\S]*contextResolved: true/);
  assert.match(template, /id="\{\{contextResolved \? 'perf-primary-content' : ''\}\}" wx:if="\{\{contextResolved\}\}"/);
});

test("Live landing does not present the next GW as a live gameweek", () => {
  const template = source("miniprogram/pages/live/index/index.wxml");
  assert.match(template, /currentGw \? 'LIVE CENTRE' : '赛季准备中'/);
  assert.match(template, /currentGw \? 'GW ' \+ currentGw : \(event \? '下轮 GW ' \+ event : '-'\)/);
  assert.doesNotMatch(template, /GW \{\{currentGw \|\| event/);
});
