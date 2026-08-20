import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Live Match retry and pull refresh share forced lifecycle ownership", () => {
  const page = read("miniprogram/pages/live/match/match.ts");
  assert.match(page, /runForcedRefresh\(tracker[\s\S]*forcedRefreshPending = true[\s\S]*ensureContext\("pull-refresh", true\)/);
  assert.match(page, /onHide\(\)[\s\S]*resumeForcedRefreshAfterShow = this\.forcedRefreshPending/);
  assert.match(page, /onShow\(\)[\s\S]*resumeForcedRefresh[\s\S]*runForcedRefresh\(this\.perfTracker, resumeForcedRefreshBackground\)/);
  assert.match(page, /onRetry\(\)[\s\S]*runForcedRefresh\(this\.perfTracker, false\)/);
});

test("Live Entry retry uses the resumable forced refresh owner", () => {
  const page = read("miniprogram/pages/live/entry/entry.ts");
  assert.match(page, /onRetry\(\)[\s\S]*runForcedRefresh\(this\.perfTracker\)/);
});

test("Price resumes the complete forced player and history refresh chain", () => {
  const page = read("miniprogram/pages/data/price/price.controller.ts");
  assert.match(page, /runPlayerRefresh\([\s\S]*playerRefreshPending = true[\s\S]*refreshPlayerMode\(\)/);
  assert.match(page, /onHide\(\)[\s\S]*resumePlayerRefreshAfterShow = this\.playerRefreshPending/);
  assert.match(page, /onShow\(\)[\s\S]*resumePlayerRefresh[\s\S]*runPlayerRefresh\(tracker\)/);
  assert.match(page, /refreshPlayerMode\([\s\S]*startPlayerSearch\(true\)[\s\S]*loadSelectedPlayerHistory\([^,]+, true\)/);
});

test("Tournament Summary preserves force semantics for every resumed load stage", () => {
  const page = read("miniprogram/pages/summary/tournament/tournament.ts");
  assert.match(page, /activeLoadForceRefresh = forceRefresh/);
  assert.match(page, /onHide\(\)[\s\S]*resumeForceRefresh = this\.resumeStage !== null/);
  assert.match(page, /resumeStage === "summary"[\s\S]*loadSummary\(resumeForceRefresh, trace\)/);
  assert.match(page, /resumeStage === "tournaments"[\s\S]*loadTournaments\(resumeForceRefresh, trace\)/);
});

test("Players resumes the exact interrupted pagination cursor", () => {
  const page = read("miniprogram/pages/data/players/players.ts");
  assert.match(page, /loadMoreFromCursor\(cursor[\s\S]*paginationPending = true[\s\S]*paginationCursor = cursor/);
  assert.match(page, /onHide\(\)[\s\S]*resumePaginationAfterShow = this\.paginationPending[\s\S]*resumePaginationCursor = this\.paginationCursor/);
  assert.match(page, /onShow\(\)[\s\S]*resumePagination[\s\S]*loadMoreFromCursor\(resumeCursor\)/);
});
