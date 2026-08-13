import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

let capturedPage;
globalThis.Page = (definition) => {
  capturedPage = definition;
};

const homeModule = await import("../miniprogram/pages/home/index/index.ts");
capturedPage = undefined;
await import("../miniprogram/pages/live/entry/entry.ts");
const entryPage = capturedPage;
capturedPage = undefined;
const matchModule = await import("../miniprogram/pages/live/match/match.ts");
capturedPage = undefined;
await import("../miniprogram/pages/live/tournament/tournament.ts");
const tournamentPage = capturedPage;
const teamModule = await import("../miniprogram/pages/my-fpl/team/team.ts");
const { observeSoftTimeout } = await import("../miniprogram/utils/page-request.ts");

test("soft timeout observes a rejected task without creating a rejected finally promise", async () => {
  let timedOut = false;
  observeSoftTimeout(Promise.reject(new Error("expected")), 1, () => {
    timedOut = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(timedOut, false);
  const performancePage = source("miniprogram/utils/performance-page.ts");
  assert.doesNotMatch(performancePage, /Promise\.resolve\(result\)\.finally/);
  assert.match(performancePage, /Promise\.resolve\(result\)\.then\(settled, settled\)/);
});

test("price context is optional while season-scoped deep links await it", () => {
  const price = source("miniprogram/pages/data/price/price.ts");
  const teams = source("miniprogram/pages/data/teams/teams.ts");
  const players = source("miniprogram/pages/data/players/players.ts");
  const playerDetail = source("miniprogram/pages/data/player-detail/player-detail.ts");
  const teamDetail = source("miniprogram/pages/data/team-detail/team-detail.ts");
  assert.match(price, /try \{[\s\S]*await ensureAppContext\(\{ reason: "page-load" \}\);[\s\S]*\} catch \{\}[\s\S]*loadDailyChanges/);
  assert.match(teams, /const context = await ensureAppContext[\s\S]*getTeamList\(context\.season, forceRefresh, trace\)/);
  assert.match(players, /await ensureAppContext\(\{[\s\S]*reason: forceRefresh \? "pull-refresh" : "page-load",[\s\S]*forceRefresh[\s\S]*await this\.fetchPage/);
  assert.match(playerDetail, /await ensureAppContext\(\{[\s\S]*reason: forceRefresh \? "pull-refresh" : "page-load",[\s\S]*forceRefresh[\s\S]*getPlayerInfoByCode/);
  assert.match(teamDetail, /await ensureAppContext\(\{[\s\S]*reason: forceRefresh \? "pull-refresh" : "page-load",[\s\S]*forceRefresh[\s\S]*getTeamSummary/);
});

test("price soft timeout belongs to its originating visible page tracker", () => {
  const price = source("miniprogram/pages/data/price/price.ts");
  assert.match(price, /const tracker = this\.perfTracker;[\s\S]*observeSoftTimeout\(readTask, 2900[\s\S]*if \(!this\.pageActive \|\| !isCurrentRevision/);
  assert.match(price, /tracker\?\.mark\("softFailureAt"\)/);
});

test("player detail consumes an explicit route season when shared context is unavailable", () => {
  const playerService = source("miniprogram/services/player.service.ts");
  assert.match(
    playerService,
    /getPlayerInfoByCode\([\s\S]*code: number \| string,[\s\S]*season\?: string,[\s\S]*trace\?:[\s\S]*cacheVariant: `season:\$\{currentSeason\(season\)\}`,[\s\S]*trace/
  );
  assert.doesNotMatch(playerService, /getPlayerInfoByCode\([^)]*_season/);
});

test("team detail consumes its route season and team cache identity includes it", () => {
  const page = source("miniprogram/pages/data/team-detail/team-detail.ts");
  const service = source("miniprogram/services/team.service.ts");
  assert.match(page, /this\.routeSeason = options\.season \|\| ""/);
  assert.match(page, /season = this\.routeSeason \|\| context\.season \|\| season/);
  assert.match(service, /getTeamSummary\([\s\S]*teamId: number \| string,[\s\S]*season: string,[\s\S]*trace\?: PageRequestTrace[\s\S]*cachePolicy: "team-directory",\s*season,\s*trace/);
  assert.doesNotMatch(service, /_season/);
});

test("tournament chains carry their originating trace through later reads", () => {
  const service = source("miniprogram/services/tournament.service.ts");
  const selections = source("miniprogram/pages/data/selections/selections.ts");
  const summary = source("miniprogram/pages/summary/tournament/tournament.ts");
  const live = source("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(service, /readDirectory\([\s\S]*trace\?: PageRequestTrace[\s\S]*readEntryTournamentDirectory\(entry, season, \{ forceRefresh, trace \}\)/);
  assert.match(selections, /const trace = originatingTrace \|\| capturePageRequestTrace[\s\S]*getEntryPointsRaceTournament\([^;]*trace\)[\s\S]*this\.loadStats\(trace\)/);
  assert.match(summary, /const trace = originatingTrace \|\| capturePageRequestTrace[\s\S]*getEntrySummaryTournaments\([^;]*trace\)[\s\S]*this\.loadSummary\(forceRefresh, trace\)/);
  assert.match(live, /getEntryPointsRaceTournament\([^;]*trace\)[\s\S]*this\.loadRows\(\{[\s\S]*trace[\s\S]*\}\)/);
});

test("entry support cache identities are isolated by the canonical season", () => {
  const service = source("miniprogram/services/summary.service.ts");
  assert.match(service, /currentSeasonCacheVariant\(\)[\s\S]*getAppContextSnapshot\(\)\?\.season[\s\S]*return `season:\$\{season\}`/);
  for (const operation of ["ENTRY_EVENT_RESULT", "ENTRY_HISTORY", "ENTRY_TRANSFER_HISTORY"]) {
    assert.match(service, new RegExp(`${operation}[\\s\\S]*?cacheVariant: currentSeasonCacheVariant\\(\\)`));
  }
});

test("tournament directory recovery resyncs the fallback GW without overriding a user selection", () => {
  const selections = source("miniprogram/pages/data/selections/selections.ts");
  const summary = source("miniprogram/pages/summary/tournament/tournament.ts");
  for (const page of [selections, summary]) {
    assert.match(
      page,
      /const eventBeforeDirectoryRead = this\.data\.event;[\s\S]*const contextMissingBeforeDirectoryRead = !getAppContextSnapshot\(\)\?\.season;[\s\S]*this\.syncRecoveredEvent\(eventBeforeDirectoryRead\)/
    );
    assert.match(
      page,
      /syncRecoveredEvent\(eventBeforeDirectoryRead: number\)[\s\S]*event: this\.data\.event === eventBeforeDirectoryRead \? recoveredEvent : this\.data\.event[\s\S]*maxGw: recoveredEvent/
    );
  }
});

test("Live Match pull refresh surfaces context failures and always stops the spinner", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    match,
    /async onPullDownRefresh\(\)[\s\S]*await this\.ensureContext\("pull-refresh", true\)[\s\S]*catch \(error\) \{\s*this\.showContextError\(error\);\s*\} finally \{\s*wx\.stopPullDownRefresh\(\)/
  );
});

test("wrapped asynchronous pull refresh handlers return their actual work", () => {
  const pages = [
    "miniprogram/pages/explore/fixtures/fixtures.ts",
    "miniprogram/pages/entry/profile/profile.ts",
    "miniprogram/pages/summary/gameweek/gameweek.ts",
    "miniprogram/pages/summary/tournament/tournament.ts",
    "miniprogram/pages/my-fpl/index/index.ts",
    "miniprogram/pages/live/tournament/tournament.ts",
    "miniprogram/pages/data/players/players.ts",
    "miniprogram/pages/data/selections/selections.ts",
    "miniprogram/pages/data/price/price.ts"
  ];
  for (const path of pages) {
    const page = source(path);
    const handler = page.slice(
      page.indexOf("onPullDownRefresh()"),
      page.indexOf("\n  },", page.indexOf("onPullDownRefresh()"))
    );
    assert.match(handler, /return (?:this\.|task\.)/, path);
  }
});

test("cold context failures settle Home and all Live page loading states", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  const match = source("miniprogram/pages/live/match/match.ts");
  const tournament = source("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(home, /startHomeLifecycle\([\s\S]*catch \(error\)[\s\S]*if \(isActiveLifecycle\(\)\) this\.showContextError\(error, tracker\)/);
  for (const page of [entry, match, tournament]) {
    assert.match(page, /let context = getAppContextSnapshot\(\)[\s\S]*catch \(error\)[\s\S]*if \(!context\)[\s\S]*this\.showContextError\(error\)/);
    assert.match(page, /showContextError\(error: unknown\)[\s\S]*loading: false/);
  }
});

test("Explore paints locally then resynchronizes the shared cold context", () => {
  const explore = source("miniprogram/pages/explore/index/index.ts");
  assert.match(explore, /this\.buildGroups\(\)[\s\S]*this\.syncContext\(\)[\s\S]*void this\.refreshContext\("page-load"\)/);
  assert.match(explore, /await ensureAppContext\(\{ reason \}\)[\s\S]*this\.syncContext\(\)/);
});

test("local entry selection commits the canonical binding revision", () => {
  const search = source("miniprogram/pages/entry/search/search.ts");
  assert.match(search, /setEntryId\(entryId\);\s*commitEntryBinding\(entryId, "rebind"\)/);
  assert.doesNotMatch(search, /app\.globalData\.entryId = entryId/);
});

test("home revalidates on context change or one-minute domain freshness expiry", () => {
  assert.equal(homeModule.shouldReloadHome(1_000, 4, 5, 1_100), true);
  assert.equal(homeModule.shouldReloadHome(1_000, 4, 4, 60_999), false);
  assert.equal(homeModule.shouldReloadHome(1_000, 4, 4, 61_000), true);
  assert.match(homeModule.fixtureStaleMessage(new Date(2026, 0, 1, 9, 7).getTime()), /09:07$/);
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(home, /stale: read\.meta\.stale/);
  assert.match(home, /storedAt: read\.meta\.storedAt/);
  assert.match(home, /fixtureStaleStoredAt: staleStoredAt/);
});

test("manual Live Entry force refresh runs once after an ordinary in-flight read", async () => {
  let resolveCurrent;
  const current = new Promise((resolve) => {
    resolveCurrent = resolve;
  });
  const followups = [];
  const context = {
    data: { entryId: 123, event: 33 },
    liveRequest: current,
    liveRequestKey: "123:33",
    liveRequestForced: false,
    liveRequestId: 1,
    liveForcedFollowup: null,
    pageVisible: true,
    loadTransfersAfterLive: false,
    restartForPrincipalChange: () => false,
    loadData(options) {
      followups.push(options);
      return Promise.resolve();
    }
  };

  const first = entryPage.loadData.call(context, { includeTransfers: true, forceRefresh: true });
  const second = entryPage.loadData.call(context, { includeTransfers: true, forceRefresh: true });
  assert.equal(first, second);
  assert.deepEqual(followups, []);
  resolveCurrent();
  await first;
  assert.equal(followups.length, 1);
  assert.equal(followups[0].forceRefresh, true);
  assert.equal(followups[0].includeTransfers, true);
});

test("manual Live Entry force refresh survives failure of the ordinary in-flight read", async () => {
  let rejectCurrent;
  const current = new Promise((_resolve, reject) => {
    rejectCurrent = reject;
  });
  const followups = [];
  const context = {
    data: { entryId: 123, event: 33 },
    liveRequest: current,
    liveRequestKey: "123:33",
    liveRequestForced: false,
    liveRequestId: 1,
    liveForcedFollowup: null,
    pageVisible: true,
    loadTransfersAfterLive: false,
    restartForPrincipalChange: () => false,
    loadData(options) {
      followups.push(options);
      return Promise.resolve();
    }
  };

  const refresh = entryPage.loadData.call(context, { forceRefresh: true });
  rejectCurrent(new Error("ordinary request failed"));
  await refresh;
  assert.equal(followups.length, 1);
  assert.equal(followups[0].forceRefresh, true);
});

test("a later transfer caller upgrades an already queued Live Entry forced follow-up", async () => {
  let resolveCurrent;
  const current = new Promise((resolve) => { resolveCurrent = resolve; });
  const followups = [];
  const context = {
    data: { entryId: 123, event: 33 },
    liveRequest: current,
    liveRequestKey: "123:33",
    liveRequestForced: false,
    liveRequestId: 1,
    liveForcedFollowup: null,
    liveForcedFollowupIncludeTransfers: false,
    pageVisible: true,
    loadTransfersAfterLive: false,
    restartForPrincipalChange: () => false,
    loadData(options) {
      followups.push(options);
      return Promise.resolve();
    }
  };
  const first = entryPage.loadData.call(context, { forceRefresh: true });
  const second = entryPage.loadData.call(context, { forceRefresh: true, includeTransfers: true });
  assert.equal(first, second);
  resolveCurrent();
  await first;
  assert.equal(followups.length, 1);
  assert.equal(followups[0].forceRefresh, true);
  assert.equal(followups[0].includeTransfers, true);
});

test("Match arms an independent context timer at the gameweek deadline", () => {
  assert.equal(matchModule.contextDeadlineTargetAt(20_000, 10_000), 20_000);
  assert.equal(matchModule.contextDeadlineTargetAt(9_000, 10_000), 40_000);
  assert.equal(matchModule.contextDeadlineTargetAt(null, 10_000), null);
  assert.equal(matchModule.contextDeadlineTargetAt(null, 10_000, true), 40_000);
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(match, /contextDeadlineTimer[\s\S]*armContextDeadline\([\s\S]*refreshContextAtDeadline/);
  assert.match(match, /onHide\(\)[\s\S]*clearContextDeadline\(\)/);
  assert.match(match, /onUnload\(\)[\s\S]*clearContextDeadline\(\)/);
});

test("Home selected-GW reads preserve stale metadata and discard superseded responses", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  const start = home.indexOf("async loadFixtureGw");
  const load = home.slice(start, home.indexOf("onRetryFixtures", start));
  assert.match(load, /readCoreEventFixtureSchedule/);
  assert.match(load, /requestId !== this\._fixtureGwRequestId \|\| event !== this\.data\.selectedFixtureGw/);
  assert.match(load, /fixtureStaleMessage: read\.meta\.stale \? fixtureStaleMessage\(staleStoredAt\) : ""/);
  assert.match(load, /fixtureStaleStoredAt: staleStoredAt/);
});

test("Live overlay is authoritative for match play status", () => {
  const merged = matchModule.mergeLiveOverlay(
    [{ id: 1, matchId: 1, status: "not_start", playStatus: "not_start" }],
    [{ id: 1, matchId: 1, playStatus: "playing", minutes: 12 }]
  );
  assert.equal(merged[0].status, "playing");
  assert.equal(merged[0].playStatus, "playing");
  assert.equal(merged[0].statusText, "比赛中");
});

test("Live Tournament rejects event zero before any row request", async () => {
  const context = {
    data: {
      ...tournamentPage.data,
      entryId: 123,
      event: 0,
      selectedTournament: { id: "league-1", name: "League" },
      rows: [{ entry: 123 }]
    },
    _submittedKeyword: "",
    setData(update) {
      Object.assign(this.data, update);
    },
    syncDisplayState() {}
  };
  await tournamentPage.loadRows.call(context);
  assert.deepEqual(context.data.rows, []);
  assert.equal(context.data.loading, false);

  context.data.event = 33;
  context.data.selectedTournament = { id: "league-1", name: "League", participantCount: 0 };
  context.data.rows = [{ entry: 123 }];
  await tournamentPage.loadRows.call(context);
  assert.deepEqual(context.data.rows, []);
  assert.equal(context.data.resultsEmptyTitle, "当前竞赛还没有参赛球队");
});

test("My FPL support payload stays local until principal validation and updates chip totals", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  const loadTab = page.slice(page.indexOf("async loadTab"), page.indexOf("setActiveTab", page.indexOf("async loadTab")));
  assert.match(loadTab, /let historyPayload = this\.historyPayload/);
  assert.match(loadTab, /historyPayload = await getEntryTeamStatsHistory[\s\S]*restartForPrincipalChange\(entryId\)[\s\S]*getEntryTeamStatsTransfers/);
  assert.match(loadTab, /restartForPrincipalChange\(entryId\)[\s\S]*this\.historyPayload = historyPayload/);
  assert.match(loadTab, /chipSummaryStats: buildChipSummaryStats/);
  assert.deepEqual(teamModule.buildChipSummaryStats("Wildcard", 3), [
    { label: "本轮开卡", value: "Wildcard" },
    { label: "开卡次数", value: "3" }
  ]);
});

test("My FPL keeps support tabs available without an event summary", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  const template = source("miniprogram/pages/my-fpl/team/team.wxml");
  assert.match(page, /if \(!eventResult\)[\s\S]*supportAvailable: true[\s\S]*loadTab/);
  assert.match(template, /emptyState && !supportAvailable/);
  assert.match(template, /emptyState === 'event' && !hasTeamData/);
  assert.doesNotMatch(template, /emptyState === 'event' && !hasTeamData && showSquad/);
  assert.match(template, /showSquad && hasTeamData/);
  assert.match(template, /data-tab="history"/);
});
