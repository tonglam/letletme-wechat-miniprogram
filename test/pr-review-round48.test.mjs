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
