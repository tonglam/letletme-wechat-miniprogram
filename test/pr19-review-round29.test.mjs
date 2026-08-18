import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("Live landing resumes an unresolved context after hide/show", () => {
  const page = source("miniprogram/pages/live/index/index.ts");
  assert.match(page, /hasShown: false/);
  assert.match(page, /onShow\(\)[\s\S]*const resumed = this\.hasShown[\s\S]*if \(!resumed\) return undefined[\s\S]*shouldReloadLiveIndex\([\s\S]*loadContext\("page-show"\)/);
  assert.doesNotMatch(page, /if \(!this\.data\.contextResolved\) return undefined/);
});

test("Entry Profile repeats authority resolution before a resumed read", () => {
  const page = source("miniprogram/pages/entry/profile/profile.ts");
  assert.match(page, /async loadAuthoritativeEntry\([\s\S]*await app\.authReady[\s\S]*this\.routeEntry \|\| app\.globalData\.entryId/);
  assert.match(page, /onShow\(\)[\s\S]*loadAuthoritativeEntry\("show", this\.lifecycleRevision, forceRefresh\)/);
});

test("Gameweek Summary binds cold startup and GraphQL attribution to page ownership", () => {
  const page = source("miniprogram/pages/summary/gameweek/gameweek.ts");
  const service = source("miniprogram/services/summary.service.ts");
  assert.match(page, /async startPageLoad\([\s\S]*capturePageRequestTrace[\s\S]*await this\.ensureAppDataReady\(\)[\s\S]*lifecycleRevision !== this\.lifecycleRevision[\s\S]*loadData\(false, trace, lifecycleRevision\)/);
  assert.match(page, /getMiniGameweekSummary\(this\.data\.event, forceRefresh, requestTrace\)/);
  assert.match(service, /getMiniGameweekSummary\([\s\S]*trace\?: PageRequestTrace[\s\S]*forceRefresh,[\s\S]*trace/);
});

test("Price resumes pending debounce and forces context recovery on retry", () => {
  const page = source("miniprogram/pages/data/price/price.ts");
  assert.match(page, /pendingSearch = this\.playerSearchTimer !== undefined[\s\S]*clearTimeout\(this\.playerSearchTimer\)[\s\S]*\? "search"/);
  assert.match(page, /resumeStage === "search"[\s\S]*startPlayerSearch\(false\)/);
  assert.match(page, /loadTeamOptions\(forceRefresh = false\)[\s\S]*ensureAppContext\(\{ reason: "page-load", forceRefresh \}\)[\s\S]*getTeamList\(season, forceRefresh, trace\)/);
  assert.match(page, /onRetryPlayers\(\)[\s\S]*loadTeamOptions\(true\)/);
});
