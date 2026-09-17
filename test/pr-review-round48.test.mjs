import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8").replace(/\s+/g, " ");
}

test("Price and Players consume resumed pagination only after replacement ownership starts", () => {
  const price = readFileSync(resolve(root, "miniprogram/pages/data/price/price.controller.ts"), "utf8");
  const players = readFileSync(resolve(root, "miniprogram/pages/data/players/players.ts"), "utf8");
  assert.match(price, /const task = this\.loadMorePlayers\(resumePaginationCursor\);[\s\S]*if \(this\.paginationPending && this\.paginationCursor === resumePaginationCursor\)[\s\S]*this\.resumePaginationAfterShow = false/);
  assert.match(players, /const startPagination = \(\) => \{[\s\S]*this\.loadMoreFromCursor\(resumeCursor\)[\s\S]*const task = this\.paginationPromise[\s\S]*startPagination\(\)/);
  assert.match(players, /const resumeSearchSnapshot\s*=\s*this\.pendingSearchSnapshot\s*\|\|\s*this\.activeSearchSnapshot\s*\|\|\s*this\.loadedSearchSnapshot/);
  assert.match(players, /const task = resumeSearchSnapshot[\s\S]*this\.resumeSearchSnapshot\([\s\S]*resumeSearchForceRefresh[\s\S]*this\.searchPendingForceRefresh === resumeSearchForceRefresh/);
});

test("My FPL empty-state action uses the lifecycle-owned retry path", () => {
  const page = readFileSync(resolve(root, "miniprogram/pages/my-fpl/team/team.controller.ts"), "utf8");
  assert.match(page, /onEmptyAction\(\)[\s\S]*if \(this\.contextUnavailable \|\| this\.data\.maxGw <= 0\)[\s\S]*this\.recoverContext\("pull-refresh"\)[\s\S]*this\.loadData\(true\);/);
});

test("scheduled price refreshes do not inherit the completed page trace", () => {
  const page = source("miniprogram/pages/explore/price-changes/price-changes.ts");
  assert.match(page, /onRetry\(\) \{\s*return this\.loadData\("refresh", true\);/);
  assert.match(page, /setInterval\(\(\) => \{[\s\S]*void this\.loadData\("refresh", true, null\);/);
  assert.match(page, /traceOverride === undefined[\s\S]*capturePageRequestTrace/);
});

test("retry handlers wait for their owned request before measuring the result", () => {
  const profile = source("miniprogram/pages/entry/profile/profile.ts");
  const price = source("miniprogram/pages/explore/price-changes/price-changes.ts");
  assert.match(profile, /onRetry\(\) \{\s*return this\.loadAuthoritativeEntry\("refresh", this\.lifecycleRevision, true\);/);
  assert.match(price, /onRetry\(\) \{\s*return this\.loadData\("refresh", true\);/);
});

test("delayed account navigation carries the confirm interaction token", () => {
  const account = source("miniprogram/pages/account/link/link.ts");
  const navigation = source("miniprogram/utils/navigation.ts");
  assert.match(account, /const interaction = getPageInteractionToken\(this, "confirm"\)/);
  assert.match(account, /switchToHome\(interaction\)/);
  assert.match(navigation, /switchToHome\(sourceToken\?: PageInteractionToken \| null\)/);
  assert.match(navigation, /handoffPageInteraction\(routes\.home, sourceToken\)/);
});

test("interaction handoff and rebind keep lifecycle and handler boundaries", () => {
  const page = source("miniprogram/utils/page-performance.ts");
  assert.match(page, /handlerCompletedAt\?: number[\s\S]*sourceTracker/);
  assert.match(page, /handlerCompletedAt: interaction\.handlerCompletedAt \?\? monotonicNow\(\)/);
  assert.match(page, /originatingToken\.lifecycleGeneration !== undefined[\s\S]*currentGeneration !== undefined/);
  assert.match(page, /delete nextTokens\[name\]/);
});

test("direct page lifecycles own generations and deferred surfaces", () => {
  const pagePerformance = source("miniprogram/utils/page-performance.ts");
  const performancePage = source("miniprogram/utils/performance-page.ts");
  const home = source("miniprogram/pages/home/index/index.ts");
  const homeWxml = source("miniprogram/pages/home/index/index.wxml");
  const players = source("miniprogram/pages/data/players/players.ts");
  const search = source("miniprogram/pages/entry/search/search.ts");
  const searchWxml = source("miniprogram/pages/entry/search/search.wxml");

  assert.match(pagePerformance, /manageLifecycleGeneration\?: boolean/);
  assert.match(pagePerformance, /advanceManagedLifecycle\(this, lifecycle\)/);
  assert.match(pagePerformance, /this\.disconnected && status !== "failed"/);
  assert.match(performancePage, /manageLifecycleGeneration: false/);
  assert.match(home, /explicitInteractionHandlers: \["onDreamPlayerTap", "onSelectPriceTab", "onRetryPredictions"\]/);
  assert.match(home, /observePriceTabResult\(interactionId, "likely"\)/);
  assert.match(homeWxml, /id="perf-home-price-desk"/);
  for (const handler of [
    "onTeamFilterChange",
    "onPositionFilterChange",
    "onSortChange",
    "onToggleSortDir",
    "onMaxPriceChange",
    "onOwnBandChange",
  ]) {
    assert.match(players, new RegExp(`${handler}[\\s\\S]*return this\\.scheduleSearch`));
  }
  assert.match(search, /explicitInteractionHandlers: \[[\s\S]*"onLookupEntry"[\s\S]*"onSelectSearchHit"/);
  assert.match(search, /observeLookupResult\(\)/);
  assert.match(searchWxml, /id="perf-entry-search-result"/);
});

test("latest performance findings keep stale actions and optional content out of primary results", () => {
  const pagePerformance = source("miniprogram/utils/page-performance.ts");
  const search = source("miniprogram/pages/entry/search/search.ts");
  const liveEntry = source("miniprogram/pages/live/entry/entry.ts");
  const players = source("miniprogram/pages/data/players/players.ts");

  assert.match(pagePerformance, /excludeInteractionHandlers\?: readonly string\[\]/);
  assert.match(pagePerformance, /isHighFrequencyInputHandler\(name\)/);
  assert.match(pagePerformance, /originatingToken\.tracker\.completeInteraction\([\s\S]*?"failed",?\s*\);/);
  assert.match(search, /lookupInteraction/);
  assert.match(search, /failLookupInteraction\(requestId\);\s*return;/);
  assert.match(search, /this\.failLookupInteraction\(\);\s*this\.lookupRequestId \+= 1/);
  assert.match(liveEntry, /navigationTracker\?\.expectSecondaryCompletion\(\)/);
  assert.match(players, /primaryError: \(data\) =>/);
  assert.match(players, /Array\.isArray\(value\.players\)/);
  assert.match(players, /value\.players\.length === 0/);
});

test("deferred retry and section actions return their owned work", () => {
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  const price = source("miniprogram/pages/data/price/price.controller.ts");
  const players = source("miniprogram/pages/data/players/players.ts");
  const search = source("miniprogram/pages/entry/search/search.ts");
  const gameweek = source("miniprogram/pages/summary/gameweek/gameweek.ts");

  assert.match(fixtures, /onRetry\(\) \{\s*return this\.runForcedRefresh\(\);/);
  assert.match(price, /onRetryDaily\(\) \{[\s\S]*return this\.loadDailyChanges\(true, false\);/);
  assert.match(price, /onRetryPulse\(\) \{\s*return this\.loadMarketPulse\(true\);/);
  assert.match(price, /onRetryPlayers\(\) \{\s*return this\.runPlayerRefresh\(this\.perfTracker\);/);
  assert.match(players, /onCompareRetry\(\) \{\s*return this\.loadCompare\(true\);/);
  assert.match(search, /onUnbind\(\): Promise<void> \{[\s\S]*return new Promise<void>/);
  assert.match(gameweek, /function gameweekPrimaryError\(data: object \| undefined\)/);
  assert.match(gameweek, /primaryError: gameweekPrimaryError/);
  assert.match(gameweek, /onGwChange\([\s\S]*return this\.loadData\(\);/);
  assert.match(gameweek, /onRefreshTap\(\) \{\s*return this\.refreshData\(\);/);
  assert.match(gameweek, /onRetry\(\) \{\s*return this\.loadData\(\);/);
});

test("live retries and compare actions wait for their result surfaces", () => {
  const liveEntry = source("miniprogram/pages/live/entry/entry.ts");
  const liveMatch = source("miniprogram/pages/live/match/match.ts");
  const tournament = source("miniprogram/pages/live/tournament/tournament.controller.ts");
  const tournamentWxml = source("miniprogram/pages/live/tournament/tournament.wxml");

  assert.match(liveEntry, /onRetry\(\) \{[\s\S]*return this\.runForcedRefresh\(this\.perfTracker\);/);
  assert.match(liveMatch, /onRetry\(\) \{[\s\S]*return this\.runForcedRefresh\(this\.perfTracker, false\);/);
  assert.match(tournament, /async loadCompareSquads\(interactionToken\?: PageInteractionToken \| null\)/);
  assert.match(tournament, /observeOnDemandVisible\(\s*"#perf-compare-content"/);
  assert.match(tournament, /onOpenCompareSheet\(\) \{[\s\S]*return this\.loadCompareSquads\(interactionToken\);/);
  assert.match(tournament, /explicitInteractionHandlers: \["onOpenTournamentDetail", "onOpenCompareSheet"\]/);
  assert.match(tournamentWxml, /id="perf-compare-content"/);
});

test("team actions wait for their owned work and setup polls stay untraced", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const tournament = source("miniprogram/pages/live/tournament/tournament.controller.ts");
  const detailService = source("miniprogram/services/tournament-detail.service.ts");

  assert.match(team, /onGwChange\([\s\S]*return this\.loadData\(true\);/);
  assert.match(team, /onTabTap\([\s\S]*return this\.loadTab\(tab, false\);/);
  assert.match(team, /onRetry\(\)[\s\S]*return this\.recoverContext\("pull-refresh"\)/);
  assert.match(team, /onRetry\(\)[\s\S]*return this\.runForcedRefresh\(/);
  assert.match(team, /onRetry\(\)[\s\S]*return this\.loadTab\(this\.data\.activeTab, true\);/);
  assert.match(tournament, /loadH2HDesk\(\{ background: true, trace: null \}\)/);
  assert.match(tournament, /trace\?: PageRequestTrace \| null/);
  assert.match(detailService, /trace\?: PageRequestTrace \| null/);
});

test("default league review and deferred errors own the route-ready boundary", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const pagePerformance = source("miniprogram/utils/page-performance.ts");
  assert.match(
    leagues,
    /expectSecondaryCompletion\(\);[\s\S]*await this\.loadReview\(/,
  );
  assert.match(
    pagePerformance,
    /if \(options\.errorVisible === true\) \{[\s\S]*if \(this\.secondaryCompletionExpected\) \{[\s\S]*mark\("secondaryCompleteAt"\)/,
  );
});

test("home and live tournament retry handlers return their owned requests", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  const tournament = source("miniprogram/pages/live/tournament/tournament.controller.ts");
  assert.match(home, /onRetryFixtures\(\) \{\s*return this\.loadFixtureGw\(/);
  assert.match(tournament, /onRetry\(\) \{[\s\S]*return this\.retryWithContext\(\)[\s\S]*return this\.loadTournaments\(true\)[\s\S]*return this\.loadH2HDesk\([\s\S]*return this\.loadRows\(/);
});
