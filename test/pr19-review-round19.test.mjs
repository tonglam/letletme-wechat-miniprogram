import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Home fixture states remain one conditional chain and stale refresh is not reported as success", () => {
  const wxml = source("miniprogram/pages/home/index/index.wxml");
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(
    wxml,
    /fixtureError[\s\S]*wx:elif="\{\{fixtureLoading\}\}"[\s\S]*wx:elif="\{\{fixtureStaleMessage\}\}"[\s\S]*wx:elif="\{\{fixtureRows\.length === 0\}\}"/
  );
  assert.match(home, /return !fixtureResult\.failed && !fixtureResult\.stale/);
  assert.match(home, /const fixtureFresh = await this\.loadPage\(true, tracker\)/);
  assert.match(home, /if \(!deadlineTriggered && fixtureFresh === true\)[\s\S]*刷新成功/);
});

test("cold Live Entry startup stops after the originating page hides", () => {
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(entry, /onLoad\([\s\S]*this\.pageVisible = true[\s\S]*const tracker = this\.perfTracker/);
  assert.match(
    entry,
    /await this\.ensureContext\("page-load"\)[\s\S]*if \(!this\.pageVisible \|\| this\.perfTracker !== tracker\) return[\s\S]*await app\.authReady[\s\S]*if \(!this\.pageVisible \|\| this\.perfTracker !== tracker\) return/
  );
});

test("Tournament and Match do not chain hidden-page reads", () => {
  const tournament = source("miniprogram/pages/live/tournament/tournament.ts");
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    tournament,
    /await getEntryPointsRaceTournament[\s\S]*if \(!this\.pageVisible \|\| requestId !== this\.tournamentListRequestId\) return[\s\S]*await this\.loadRows/
  );
  assert.match(
    match,
    /await readCoreEventFixtureSchedule[\s\S]*if \(!this\.pageVisible \|\| requestId !== this\.liveRequestId\) return[\s\S]*getLiveMatchByStatusSnapshot/
  );
  assert.match(
    match,
    /await getLiveMatchByStatusSnapshot[\s\S]*if \(!this\.pageVisible \|\| requestId !== this\.liveRequestId\) return/
  );
  assert.match(tournament, /if \(this\.pageVisible && requestId === this\.tournamentListRequestId\)[\s\S]*loading: false/);
  assert.match(match, /if \(this\.pageVisible && requestId === this\.liveRequestId\)[\s\S]*loading: false/);
});

test("Match retries create a refresh tracker", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    match,
    /onRetry\(\)[\s\S]*perfTracker\?\.disconnect\(\)[\s\S]*new PagePerformanceTracker\(this, "pages\/live\/match\/match", "refresh"\)[\s\S]*retryWithContext\(\)/
  );
});

test("Price player setup preserves its trace and stops after hide", () => {
  const price = source("miniprogram/pages/data/price/price.ts");
  assert.match(price, /loadTeamOptions\(forceRefresh = false\)[\s\S]*const tracker = this\.perfTracker[\s\S]*capturePageRequestTrace/);
  assert.match(
    price,
    /await ensureAppContext[\s\S]*if \(!this\.pageActive \|\| this\.perfTracker !== tracker\) return[\s\S]*getTeamList\(season, forceRefresh, trace\)/
  );
  assert.match(
    price,
    /getTeamList\(season, forceRefresh, trace\)[\s\S]*if \(!this\.pageActive \|\| this\.perfTracker !== tracker\) return/
  );
});
