import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Live Entry preserves a queued historical reload across repeated hides", () => {
  const page = read("miniprogram/pages/live/entry/entry.ts");
  assert.match(page, /const queuedLiveResume = this\.resumeLiveAfterShow/);
  assert.match(page, /resumeLiveAfterShow = queuedLiveResume \|\| \(/);
});

test("Price preserves forced daily refresh and pagination cursor on resume", () => {
  const page = read("miniprogram/pages/data/price/price.ts");
  assert.match(page, /dailyRequestForceRefresh: false/);
  assert.match(page, /resumeStageForceRefresh = this\.resumeStageForceRefresh \|\| this\.dailyRequestForceRefresh/);
  assert.match(page, /paginationPending: false[\s\S]*paginationCursor: null/);
  assert.match(page, /resumePaginationCursor = this\.paginationCursor/);
  assert.match(page, /loadMorePlayers\(resumePaginationCursor\)/);
});

test("My FPL Leagues tracks forced loads independently of the loading placeholder", () => {
  const page = read("miniprogram/pages/my-fpl/leagues/leagues.ts");
  assert.match(page, /loadPending: false[\s\S]*loadForceRefresh: false[\s\S]*resumeForceRefresh: false/);
  assert.match(page, /this\.resumeForceRefresh = this\.resumeForceRefresh \|\| this\.loadForceRefresh/);
  assert.match(page, /loadLeagues\(forceRefresh, trace, lifecycleRevision\)/);
});

test("Gameweek Summary retains a forced refresh after repeated hides", () => {
  const page = read("miniprogram/pages/summary/gameweek/gameweek.ts");
  assert.match(page, /activeLoadForceRefresh: false[\s\S]*resumeForceRefresh: false/);
  assert.match(page, /resumeForceRefresh = this\.resumeForceRefresh \|\| this\.activeLoadForceRefresh/);
  assert.match(page, /loadData\(resumeForceRefresh, trace, this\.lifecycleRevision\)/);
});
