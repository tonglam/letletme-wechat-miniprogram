import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.wx = {
  getStorageSync() {
    return undefined;
  },
};

let releaseAuth;
const app = {
  authReady: new Promise((resolve) => {
    releaseAuth = resolve;
  }),
  globalData: { entryId: 22 },
};
globalThis.getApp = () => app;
globalThis.Page = () => {};

const { waitForAuthoritativeFollow } =
  await import("../miniprogram/utils/follow.ts");
const { resolveKeywordAfterPlayerLoad } =
  await import("../miniprogram/pages/data/players/players.ts");

function source(relativePath) {
  return readFileSync(
    new URL(`../${relativePath}`, import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
}

test("personal list pages wait for cold-start auth before reading the follow", async () => {
  let settled = false;
  const waiting = waitForAuthoritativeFollow().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(
    settled,
    false,
    "the restored local follow is not authoritative yet",
  );
  releaseAuth();
  await waiting;
  assert.equal(settled, true);

  for (const path of [
    "miniprogram/pages/my-fpl/leagues/leagues.ts",
    "miniprogram/pages/entry/profile/profile.ts",
    "miniprogram/pages/data/selections/selections.ts",
    "miniprogram/pages/summary/tournament/tournament.ts",
    "miniprogram/pages/live/index/index.ts",
  ]) {
    assert.match(source(path), /await waitForAuthoritativeFollow\(\)/, path);
  }
});

test("completed personal pages revalidate authority on warm show", () => {
  for (const path of [
    "miniprogram/pages/entry/profile/profile.ts",
    "miniprogram/pages/data/selections/selections.ts",
    "miniprogram/pages/summary/tournament/tournament.ts",
  ]) {
    const page = source(path);
    const onShow = page.slice(page.indexOf("onShow()"), page.indexOf("onHide()"));
    assert.match(
      onShow,
      /(?:await waitForAuthoritativeFollow\(\)|if \(!this\.routeEntry\)[\s\S]*await waitForAuthoritativeFollow\(\))[\s\S]*if \(!this\.resumeOnShow\)/,
      path,
    );
    if (path !== "miniprogram/pages/entry/profile/profile.ts") {
      assert.match(onShow, /nextEntryId[\s\S]*initializePage/, path);
    }
  }
});

test("Live landing refreshes the displayed entry name after authority changes", () => {
  const page = source("miniprogram/pages/live/index/index.ts");
  assert.match(page, /const entryChanged = this\.data\.entryId !== entryId/);
  assert.match(page, /let entryName = entryChanged \? "" : this\.data\.entryName \|\| ""/);
});

test("initial request failures do not also claim an empty list", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.wxml");
  assert.match(leagues, /error && !tournaments\.length && !emptyState/);
});

test("failed event metadata is represented as unavailable, not offseason", () => {
  const service = source("miniprogram/services/my-fpl.service.ts");
  assert.match(service, /eventContextAvailable = false/);
  assert.match(
    service,
    /eventContextAvailable =\s*appContext\.phase !== "unresolved"/,
  );
});

test("Home entry errors retain a team-switch escape", () => {
  const template = source("miniprogram/pages/home/index/index.wxml");
  assert.match(
    template,
    /wx:if="\{\{entryError\}\}"[\s\S]*bindtap="onChangeEntry"[^>]*>更换球队/,
  );
});

test("Home starts secondary network reads with Fixtures, not after commit", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  const secondaryStart = home.indexOf("void this.loadSecondaryData");
  const fixtureResult = home.indexOf("const fixtureResult = await fixtureTask");
  const fixtureCommit = home.indexOf("await new Promise<void>", fixtureResult);

  assert.ok(secondaryStart >= 0);
  assert.ok(fixtureResult > secondaryStart);
  assert.ok(fixtureCommit > fixtureResult);
  assert.match(
    home,
    /const contextMissing = !app\.globalData\.season[\s\S]*!app\.globalData\.gw[\s\S]*!app\.globalData\.nextGw[\s\S]*const refreshContext = contextMissing \|\| deadlineExpired[\s\S]*if \(refreshContext\) \{[\s\S]*forceRefresh: true,[\s\S]*reason: "pull-refresh"[\s\S]*await this\.loadPage\(true, tracker\)/,
  );
  assert.doesNotMatch(
    home,
    /const forceContextForUserRefresh = !deadlineTriggered/,
  );
});

test("empty fixture directories clear previously composed cards", () => {
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(
    fixtures,
    /if \(!this\.teams\.length\) \{\s*this\.setData\(\{ runs: \[\] \}\)/,
  );
});

test("player directory completion preserves edits made during the request", () => {
  assert.equal(resolveKeywordAfterPlayerLoad("saka", "palmer", true), "palmer");
  assert.equal(resolveKeywordAfterPlayerLoad("saka", "", false), "saka");
  assert.equal(resolveKeywordAfterPlayerLoad("", "palmer", false), "palmer");
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(
    players,
    /!shouldApplyPlayerResponse\(revision, this\.requestRevision\)/,
  );
  assert.match(players, /searchEditedWhileLoading \? currentKeyword/);
  assert.match(players, /resolveKeywordAfterPlayerLoad\(/);
  assert.match(
    players,
    /const responseKeyword = append \? this\.data\.keyword : resolveKeywordAfterPlayerLoad\(/,
  );
  assert.match(players, /activeKeyword: snapshot\.activeKeyword/);
  assert.doesNotMatch(players, /keyword\.trim\(\) !== snapshot\.activeKeyword\.trim\(\)/);
  assert.match(players, /if \(append && this\.pendingSearchSnapshot\) return/);
  assert.match(players, /loading: Boolean\(this\.pendingSearchSnapshot\)/);
  assert.match(
    players,
    /if \(this\.data\.loading\) this\.searchEditedWhileLoading = true/,
  );
});

test("player directory coalesces latest filters and serializes pagination", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(players, /const PLAYER_SEARCH_DEBOUNCE_MS = 300/);
  assert.match(players, /pendingSearchSnapshot: null/);
  assert.match(players, /activeSearchPromise: null/);
  assert.match(players, /paginationPromise: null/);
  assert.match(
    players,
    /if \(!this\.pageVisible \|\| this\.activeSearchPromise \|\| this\.paginationPromise\) return/,
  );
  assert.match(
    players,
    /if \(this\.paginationPromise\) return this\.paginationPromise/,
  );
  assert.match(players, /fingerprint: playerSearchFingerprint\(base\)/);
  assert.match(players, /onKeywordDraft[\s\S]*this\.setData\(\{ keyword \}\)/);
  assert.match(
    players,
    /onPullDownRefresh\(\)[\s\S]*startSearch\(this\.data\.keyword, true\)/,
  );
});

test("deduped player searches restore the last successful snapshot", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(
    players,
    /const loadedSnapshot = this\.loadedSearchSnapshot[\s\S]*this\.activeSearchSnapshot = loadedSnapshot[\s\S]*error: ""[\s\S]*activeKeyword: loadedSnapshot\.activeKeyword/,
  );
});

test("direct personal Live reads refresh viewer authority before entry snapshots", () => {
  for (const path of [
    "miniprogram/pages/live/entry/entry.ts",
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  ]) {
    const page = source(path);
    assert.match(page, /waitForAuthoritativeFollow\(\)/, path);
    assert.match(page, /await waitForAuthoritativeFollow\(\)[\s\S]*entryId/, path);
  }
});

test("viewer changes clear entry-scoped selection state before reinitializing", () => {
  const selections = source("miniprogram/pages/data/selections/selections.ts");
  assert.match(
    selections,
    /clearEntryScopedState\(\)[\s\S]*await this\.initializePage\(showTrace\)/,
  );
  assert.match(
    selections,
    /clearEntryScopedState\(\)[\s\S]*selectedTournamentName: ""[\s\S]*headerSubtitle: ""[\s\S]*selectedRows: \[\]/,
  );
});

test("GraphQL in-flight cleanup preserves a replacement request", () => {
  const graphql = source("miniprogram/services/graphql.service.ts");
  assert.match(graphql, /inFlightRequest = networkRequest as Promise/);
  assert.match(
    graphql,
    /for \(const requestKey of inFlightKeys\)[\s\S]*inFlightRequests\.get\(requestKey\) === inFlightRequest[\s\S]*inFlightRequests\.delete\(requestKey\)/,
  );
  assert.match(
    graphql,
    /registerSessionRetry[\s\S]*requestIdentity\(query, variables, policy, retryToken\)/,
  );
  assert.match(
    graphql,
    /const existingRequest = onSessionRetry\?\.\(currentToken\)[\s\S]*reject\(new GraphQLInFlightJoin\(existingRequest\)\)/,
  );
  assert.match(
    graphql,
    /if \(error instanceof GraphQLInFlightJoin\)[\s\S]*return joinInFlight\([\s\S]*error\.request/,
  );
});

test("Players prioritize a queued replacement search when resuming", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  const onShow = players.slice(players.indexOf("onShow()"), players.indexOf("onHide()"));
  assert.match(
    onShow,
    /const resumeSearch = resumed && \([\s\S]*Boolean\(this\.pendingSearchSnapshot\)/,
  );
  assert.ok(
    onShow.indexOf("if (resumeSearch)") <
      onShow.indexOf("if (resumePagination && resumeCursor !== null)"),
  );
  assert.match(
    onShow,
    /if \(resumeSearch\)[\s\S]*?if \(this\.pendingSearchSnapshot\) \{[\s\S]*?this\.resumePaginationAfterShow = false[\s\S]*?this\.startSearch\(/,
  );
});

test("Players resume the saved snapshot without submitting a draft", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  const onShow = players.slice(players.indexOf("onShow()"), players.indexOf("onHide()"));
  const resumeBlock = onShow.slice(
    onShow.indexOf("if (resumeSearch)"),
    onShow.indexOf("if (resumePagination && resumeCursor !== null)"),
  );
  assert.match(
    onShow,
    /const resumeSearchSnapshot = this\.pendingSearchSnapshot \|\| this\.activeSearchSnapshot \|\| this\.loadedSearchSnapshot/,
  );
  assert.match(players, /resumeSearchSnapshot\([\s\S]*preserveDraftKeyword/);
  assert.match(players, /preserveDraftKeyword: snapshot\.preserveDraftKeyword/);
  assert.match(players, /keyword: preserveDraftKeyword \?\? keyword/);
  assert.doesNotMatch(resumeBlock, /startSearch\(this\.data\.keyword/);
});

test("Players pull-to-refresh reloads the submitted snapshot without committing a draft", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  const refreshBlock = players.slice(
    players.indexOf("onPullDownRefresh()"),
    players.indexOf("onReachBottom()"),
  );
  assert.match(
    refreshBlock,
    /const snapshot = this\.pendingSearchSnapshot \|\| this\.activeSearchSnapshot \|\| this\.loadedSearchSnapshot/,
  );
  assert.match(
    refreshBlock,
    /const task = snapshot \? this\.resumeSearchSnapshot\(snapshot, true\) : this\.startSearch\(this\.data\.keyword, true\)/,
  );
});

test("Players preserve a pagination resume when hidden during deferred start", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  const onShow = players.slice(players.indexOf("onShow()"), players.indexOf("onHide()"));
  assert.match(
    onShow,
    /const resumeRevision = this\.requestRevision[\s\S]*!this\.pageVisible[\s\S]*this\.requestRevision !== resumeRevision[\s\S]*this\.resumePaginationAfterShow = true[\s\S]*this\.resumePaginationCursor = resumeCursor/,
  );
});

test("My FPL last-good views survive context and refresh failures", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const template = source("miniprogram/pages/my-fpl/team/team.wxml");
  assert.match(
    team,
    /await this\.ensureContext\("page-show"\)[\s\S]*wasCurrentEvent/,
  );
  assert.match(team, /restartForPrincipalChange\(entryId\)/);
  assert.match(template, /error && !hasTeamData/);
  assert.match(template, /当前显示上次成功结果/);
  assert.match(
    team,
    /async loadTab[\s\S]*catch \(error\)[\s\S]*tabError: message/,
  );
});

test("match rollover detaches same-status in-flight work", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    match,
    /nextCurrentEventId !== this\.currentEventId \|\| nextTargetEventId !== this\.targetEventId[\s\S]*this\.liveRequestId \+= 1[\s\S]*this\.liveRequest = null[\s\S]*this\.liveRequestKey = ""/,
  );
});

test("entry lookup results are guarded by request generation and input identity", () => {
  const search = source("miniprogram/pages/entry/search/search.ts");
  const entryService = source("miniprogram/services/entry.service.ts");
  assert.match(search, /getEntryInfo\(entryId, true\)/);
  assert.doesNotMatch(search, /enqueueMiniProgramEntrySync/);
  assert.match(entryService, /persistenceState: lookup\.persistenceState/);
  assert.match(search, /entryPersistencePresentation\(entry\.persistenceState\)/);
  assert.match(
    search,
    /requestId !== this\.lookupRequestId \|\| Number\(this\.data\.manualEntryId\) !== entryId/,
  );
  assert.match(search, /if \(requestId === this\.lookupRequestId\)/);
  assert.match(search, /searchEntries\(keyword, 10\)/);
  assert.match(search, /parseExactEntryId/);
  assert.match(
    source("miniprogram/pages/entry/search/search.wxml"),
    /onSelectSearchHit/,
  );
  assert.match(
    source("miniprogram/pages/entry/search/search.wxml"),
    /如何用名字搜索/,
  );
  assert.match(
    source("miniprogram/pages/entry/search/search.wxml"),
    /网页绑过、用 ID 查过、或进过 LetLetMe 赛事/,
  );
});

test("entry persistence recovery keeps valid UI state actionable", () => {
  const landing = source("miniprogram/pages/live/index/index.ts");
  const liveEntry = source("miniprogram/pages/live/entry/entry.ts");
  const liveEntryTemplate = source("miniprogram/pages/live/entry/entry.wxml");
  const search = source("miniprogram/pages/entry/search/search.ts");

  assert.match(landing, /entryPersistenceNeedsRevalidation/);
  assert.match(
    landing,
    /getEntryInfo\(\s*entryId,\s*forceEntryLookup \|\| persistenceRevalidation/,
  );
  assert.match(search, /hasMatchingEntryPreview/);
  assert.match(
    search,
    /preservePreview && retryable \? \{\} : emptyEntryPreviewData\(\)/,
  );
  assert.match(liveEntry, /isDeterministicEntryIdentityFailure/);
  assert.match(liveEntryTemplate, /retryText="\{\{entryLookupRetryable \? '重试球队查询' : '更换球队'\}\}"/);
  assert.match(liveEntryTemplate, /bind:retry="onEntryLookupAction"/);
});

test("tournament status reports only rows actually retained", () => {
  const tournament = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");
  assert.match(tournament, /retainedRowCount/);
  assert.match(tournament, /options\.lastGood \? rows\.length : 0/);
  assert.match(template, /retainedCount="\{\{retainedRowCount\}\}"/);
  assert.doesNotMatch(template, /retainedCount="\{\{failedRowCount\}\}"/);
  assert.doesNotMatch(tournament, /overallRank: row\.overallRank \?\? row\.rank/);
});

test("team summary requests discard older GW responses", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(team, /const requestId = \+\+this\.loadRequestId/);
  assert.match(
    team,
    /if \(!this\.pageVisible \|\| requestId !== this\.loadRequestId\) return/,
  );
  assert.match(
    team,
    /if \(this\.pageVisible && requestId === this\.loadRequestId\) \{\s*this\.setData\(\{ loading: false \}\)/,
  );
  assert.match(
    team,
    /if \(!eventResult\) \{[\s\S]*hasTeamData: false[\s\S]*emptyState: "event"/,
  );
  assert.match(
    team,
    /async loadTab[\s\S]*getEntryTeamStatsHistory[\s\S]*getEntryTeamStatsTransfers/,
  );
  assert.match(
    team,
    /function mapHistorySupportRows[\s\S]*seasonHistoryRows: \[\.\.\.history\.history\]/,
  );
  assert.match(
    team,
    /catch \(error\) \{[\s\S]*restartForPrincipalChange\(entryId\)/,
  );
});

test("unchanged live probes refresh the displayed check time", () => {
  for (const path of [
    "miniprogram/pages/live/entry/entry.ts",
    "miniprogram/pages/live/match/match.ts",
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  ]) {
    const page = source(path);
    assert.match(
      page,
      /acceptSnapshot:[\s\S]*snapshot\?\.checkedAt[\s\S]*lastUpdated: formatTime\(new Date\(snapshot\.checkedAt\)\)/,
      path,
    );
  }
});

test("fixture windows honor event and season cache identity on open and resume", () => {
  const app = source("miniprogram/app.ts");
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(
    app,
    /await ensureAppContext\(\{[\s\S]*forceRefresh[\s\S]*reason:/,
  );
  assert.match(
    app,
    /await this\._pendingInit;[\s\S]*return this\.initAppData\(true\)/,
  );
  assert.match(
    fixtures,
    /await this\.syncEventContext\(false, lifecycleRevision\)/,
  );
  assert.match(
    fixtures,
    /async onShow\(\)[\s\S]*await this\.syncEventContext\(false, lifecycleRevision\)/,
  );
  assert.match(fixtures, /app\.initAppData\(forceRefresh\)/);
  assert.match(
    fixtures,
    /const startEvent = this\.selectedWindowByUser[\s\S]*this\.setData\(\{ startEvent \}\);[\s\S]*this\.rebuild\(\)/,
  );
  assert.match(
    fixtures,
    /onRetry\(\)[\s\S]*runForcedRefresh\(\)[\s\S]*syncEventContext\(true, lifecycleRevision\)[\s\S]*load\(true, trace, lifecycleRevision\)/,
  );
});

test("website handoffs await clipboard success", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const action = source("miniprogram/utils/canonical-action.ts");
  assert.match(leagues, /if \(await openWebsiteAction\(action\)\)/);
  assert.match(action, /success:[\s\S]*resolve\(true\)/);
  assert.match(action, /fail[\s\S]*resolve\(false\)/);
});

test("league handoff returns bypass the cached official league list", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  assert.match(
    leagues,
    /if \(resumed \|\| this\.resumeOnShow\)[\s\S]*const forceRefresh = this\.resumeForceRefresh[\s\S]*await waitForAuthoritativeFollow\(\)[\s\S]*initAppData\(false\)[\s\S]*shouldReloadLeagues\([\s\S]*this\.loadLeagues\(forceRefresh, trace, lifecycleRevision\)/,
  );
  assert.match(leagues, /cached\.season === season/);
});

test("fixture resume reloads instead of relabeling payload across seasons", () => {
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  const service = source("miniprogram/services/fixture.service.ts");
  const common = source("miniprogram/services/common.service.ts");
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(
    fixtures,
    /const seasonChanged = await this\.syncEventContext\(false, lifecycleRevision\)/,
  );
  assert.match(
    fixtures,
    /async onLoad\(\)[\s\S]*await this\.load\(false, trace, lifecycleRevision\)/,
  );
  assert.match(
    fixtures,
    /await this\.load\(seasonChanged, trace, lifecycleRevision\)/,
  );
  assert.match(
    fixtures,
    /getFixtureWindow\(startEvent, horizon, season, forceRefresh, trace\)/,
  );
  assert.match(fixtures, /getTeamList\(season, forceRefresh, trace\)/);
  assert.doesNotMatch(service, /fixtures\(limit:\s*500\)/);
  assert.match(service, /eventFixtures\(eventId:/);
  assert.match(service, /query CoreEventFixtureSchedule/);
  assert.doesNotMatch(common, /query EventFixtures/);
  assert.match(home, /readCoreEventFixtureSchedule/);
  assert.ok(
    home.indexOf("void this.loadSecondaryData") <
      home.indexOf("const fixtureResult = await fixtureTask"),
    "entry/market/supplement start with fixtures so the personal desk is not gated",
  );
  assert.match(service, /fragment FixtureWindowFields on Fixture/);
  assert.match(service, /if \(!season\) throw new Error/);
  assert.match(service, /cachePolicy: "fixtures",[\s\S]*season,/);
  assert.doesNotMatch(service, /season:unknown/);
  assert.match(fixtures, /error: hadLastGood\s*\?/);
  assert.match(fixtures, /this\.loadedSeason !== season/);
  assert.match(fixtures, /this\.fixtures = \[\];\s*this\.teams = \[\]/);
  assert.match(fixtures, /this\.loadedSeason = season/);
});

test("initial league payloads use named session cache policies", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const common = source("miniprogram/services/common.service.ts");
  assert.match(
    leagues,
    /async onLoad\(\)[\s\S]*this\.loadLeagues\(false, trace, lifecycleRevision\)/,
  );
  assert.match(common, /getTeamList[\s\S]*if \(!_season\) throw new Error/);
  assert.match(common, /getTeamList[\s\S]*season: _season/);
  assert.doesNotMatch(common, /season:unknown/);
});

test("resident tournament rows never cross a season", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  assert.match(
    leagues,
    /loadedSeason: undefined[\s\S]*seasonChanged[\s\S]*tournaments: \[\], tournamentNames: \[\]/,
  );
});

test("cold offline lists retain only their own persisted season cache", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  for (const page of [leagues]) {
    assert.match(page, /readStored\w+Cache\(\)/);
    assert.match(
      page,
      /const offlineCached = season \? null : readStored\w+Cache\(\)/,
    );
    assert.match(page, /offlineCached\?\.entryId === entryId/);
  }
});

test("player route keywords survive a failed first load for Retry", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(
    players,
    /onRetry\(\) \{[\s\S]*const snapshot = this\.pendingSearchSnapshot \|\| this\.activeSearchSnapshot \|\| this\.loadedSearchSnapshot[\s\S]*this\.resumeSearchSnapshot\(snapshot, true\)/,
  );
});

test("tournament row requests are principal- and season-generation guarded", () => {
  const tournament = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  assert.match(
    tournament,
    /seasonChanged \|\| wasCurrentEvent[\s\S]*this\.rowsRequestId \+= 1/,
  );
  assert.match(
    tournament,
    /const variables = this\.buildBoardVariables\(\);[\s\S]*const requestKey = `board:\$\{JSON\.stringify\(variables\)\}:/,
  );
  assert.match(
    tournament,
    /await getEntryLiveCompetitionBoardPage[\s\S]*restartForPrincipalChange\(variables\.entryId\)/,
  );
  assert.match(
    tournament,
    /catch \(error\)[\s\S]*restartForPrincipalChange\(variables\.entryId\)/,
  );
});

test("no-team actions survive context failure and profile checks compare the viewer", () => {
  const app = source("miniprogram/app.ts");
  assert.match(app, /const entryAtStart = getEntryId\(\)/);
  assert.match(app, /const nextEntry = getEntryId\(\)/);
  assert.match(app, /synchronizeMiniProgramAccount\(\)/);
  assert.doesNotMatch(app, /getVerifiedSessionEntryId/);
});

test("forced My FPL refresh reaches the cached team identity read", () => {
  const service = source("miniprogram/services/my-fpl.service.ts");
  assert.match(
    service,
    /getMyFplTeamBrief\([\s\S]*forceRefresh = false[\s\S]*getEntryInfo\(entryId, forceRefresh\)/,
  );
});

test("Home first show cannot race the initial page load", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(
    home,
    /onLoad\(\)[\s\S]*_initialLoadDone = false[\s\S]*startHomeLifecycle\("cold-launch", "page-load"\)/,
  );
  assert.match(
    home,
    /async onShow\(\)[\s\S]*if \(this\._resumeStartupOnShow\)[\s\S]*startHomeLifecycle\("warm-enter", "page-show"\)[\s\S]*if \(!this\._initialLoadDone\) return/,
  );
  assert.match(
    home,
    /startHomeLifecycle\([\s\S]*const isActiveLifecycle = \(\) => \([\s\S]*await this\.loadPage\(false, tracker\)[\s\S]*_initialLoadDone = true/,
  );
});

test("profile and tournament pull-to-refresh bypass reporting caches", () => {
  const profile = source("miniprogram/pages/entry/profile/profile.ts");
  const tournament = source(
    "miniprogram/pages/summary/tournament/tournament.ts",
  );
  const service = source("miniprogram/services/tournament.service.ts");
  assert.match(
    profile,
    /onPullDownRefresh\(\)[\s\S]*loadAuthoritativeEntry\("refresh", this\.lifecycleRevision, true\)/,
  );
  assert.match(
    profile,
    /async loadEntry\([\s\S]*entryId: number,[\s\S]*forceRefresh = false,[\s\S]*getEntryInfo\(entryId, forceRefresh, trace\)/,
  );
  assert.match(
    tournament,
    /async refreshData\(\)[\s\S]*loadTournaments\(true\)/,
  );
  assert.match(
    tournament,
    /loadTournaments\(forceRefresh = false, originatingTrace\?: PageRequestTrace\)[\s\S]*getEntrySummaryTournaments\(this\.data\.entryId, forceRefresh, trace\)[\s\S]*loadSummary\(forceRefresh, trace\)/,
  );
  assert.match(
    tournament,
    /loadSummary\(forceRefresh = false, originatingTrace\?: PageRequestTrace\)[\s\S]*getTournamentSummary\([\s\S]*forceRefresh,[\s\S]*trace/,
  );
  assert.match(
    service,
    /getEntrySummaryTournaments\([\s\S]*forceRefresh = false,[\s\S]*trace\?: PageRequestTrace[\s\S]*cachePolicy: "reporting"[\s\S]*forceRefresh/,
  );
  assert.match(
    service,
    /getTournamentSummary\([\s\S]*forceRefresh = false[\s\S]*cachePolicy: "reporting"[\s\S]*forceRefresh/,
  );
});

test("historical Live selections reset when the season changes", () => {
  for (const path of [
    "miniprogram/pages/live/entry/entry.ts",
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  ]) {
    const page = source(path);
    assert.match(page, /loadedSeason: undefined/, path);
    assert.match(page, /seasonChanged \|\| wasCurrentEvent/, path);
    assert.match(page, /event: nextEventId,[\s\S]*maxGw: nextEventId/, path);
  }
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(
    entry,
    /if \(seasonChanged\) \{[\s\S]*this\.liveRequestId \+= 1[\s\S]*this\.liveRequest = null/,
  );
  assert.match(
    entry,
    /const eventContextChanged = seasonChanged \|\| \(nextEventId > 0/,
  );
  assert.match(
    entry,
    /eventContextChanged && \(seasonChanged \|\| wasCurrentEvent\)/,
  );
  assert.match(entry, /const currentGw = currentLiveEventId\(context\)/);
  assert.match(
    entry,
    /if \(!this\.data\.entryId \|\| currentGw > 0\) \{[\s\S]*this\.loadData[\s\S]*noLiveEventState/,
  );
  assert.match(entry, /nextEventId > 0[\s\S]*noLiveEventState\(\)/);
  const tournament = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  assert.match(
    tournament,
    /const eventContextChanged = seasonChanged \|\| \(nextEventId > 0/,
  );
  assert.match(
    tournament,
    /this\.tournamentListRequestId \+= 1[\s\S]*nextEventId === 0/,
  );
  assert.match(
    tournament,
    /if \(!this\.data\.entryId \|\| currentGw > 0\) \{[\s\S]*this\.loadTournaments/,
  );
});

test("first personal paints honor season-aware event and reporting policies", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(
    team,
    /async onLoad\(\)[\s\S]*capturePageRequestTrace[\s\S]*this\.initializeFromContext\(false, trace, tracker\)/,
  );
  assert.match(
    team,
    /async initializeFromContext\([\s\S]*forceRefresh: boolean,[\s\S]*trace\?: PageRequestTrace,[\s\S]*tracker\?: PagePerformanceTracker[\s\S]*this\.loadData\(forceRefresh, trace\)/,
  );
});

test("Match and Team retries bypass repeating-season caches", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(
    match,
    /loadedSeason: undefined[\s\S]*seasonChanged[\s\S]*liveRequestId \+= 1/,
  );
  assert.match(
    team,
    /onRetry\(\)[\s\S]*data\.error[\s\S]*runForcedRefresh\([\s\S]*activeTab === "squad"[\s\S]*runForcedRefresh\(/,
  );
  assert.match(team, /onEmptyAction\(\)[\s\S]*this\.loadData\(true\)/);
  assert.match(
    team,
    /const contextChanged = seasonChanged \|\| \(eventChanged && wasCurrentEvent\)/,
  );
  assert.match(
    team,
    /if \(!eventResult\) \{[\s\S]*hasTeamData: false[\s\S]*emptyState: "event"/,
  );
  assert.match(
    fixtures,
    /selectedWindowByUser[\s\S]*const startEvent = this\.selectedWindowByUser/,
  );
});

test("season rollover clears row filters derived from player ids", () => {
  const tournament = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  assert.match(
    tournament,
    /seasonChanged \? \{[\s\S]*selectedOwnershipPlayers: \[\][\s\S]*ownershipAvailablePlayers: \[\][\s\S]*teamExposureRules: \[\][\s\S]*pendingExposureTeam: null/,
  );
});

test("live competition Website handoff uses the guarded canonical action", () => {
  const tournament = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  assert.match(
    tournament,
    /async onCopyCompetitionLink\(\)[\s\S]*openWebsiteAction\(canonicalAction\("MANAGE_COMPETITION"\)\)/,
  );
});

test("player route keywords are consumed before the first directory request settles", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(
    players,
    /const keyword = String\(options\?\.keyword \|\| ""\)\.trim\(\);[\s\S]*this\.startSearch\(keyword\)/,
  );
});

test("personal responses never cross an authoritative follow change", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const liveEntry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(
    leagues,
    /currentEntryId !== entryId[\s\S]*this\.loadLeagues\(true\)/,
  );
  assert.match(
    liveEntry,
    /restartForPrincipalChange\(\s*entryId[\s\S]*currentFollowEntryId\(\)/,
  );
  assert.match(
    liveEntry,
    /await getLivePointsByEntrySnapshot[\s\S]*restartForPrincipalChange\(entryId\)/,
  );
  assert.match(
    liveEntry,
    /await getEntryEventTransfers[\s\S]*restartForPrincipalChange\(entryId\)/,
  );
  assert.match(liveEntry, /if \(this\.data\.viewOnly\) return false/);
});

test("league authorization recovery clears retained view state", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  assert.match(
    leagues,
    /refreshedEntryId === entryId[\s\S]*return;[\s\S]*this\.clearEntryScopedViewState\(\)[\s\S]*entryId = refreshedEntryId/,
  );
  assert.match(
    leagues,
    /if \(refreshedEntryId !== entryId\) \{[\s\S]*this\.clearEntryScopedViewState\(\)[\s\S]*this\.loadedEntryId = 0/,
  );
});

test("account and entry search refresh viewer authority before snapshots", () => {
  const account = source("miniprogram/pages/account/index/index.ts");
  const search = source("miniprogram/pages/entry/search/search.ts");
  assert.match(
    account,
    /async onLoad\(\)[\s\S]*await waitForAuthoritativeFollow\(\)[\s\S]*this\.syncEntry\(\)/,
  );
  assert.match(
    account,
    /async onShow\(\)[\s\S]*await waitForAuthoritativeFollow\(\)[\s\S]*this\.syncEntry\(\)/,
  );
  assert.match(
    search,
    /async onShow\(\)[\s\S]*await waitForAuthoritativeFollow\(\)[\s\S]*if \(!this\.pageVisible\) return[\s\S]*this\.syncCurrentEntry\(\)/,
  );
  assert.match(
    search,
    /syncCurrentEntry\(\)[\s\S]*isCurrentEntry:[\s\S]*this\.data\.hasPreview[\s\S]*this\.data\.previewEntryId === entryId/,
  );
});

test("personal recovery avoids duplicate follow writes and restarts live viewers", () => {
  const auth = source("miniprogram/services/auth.service.ts");
  assert.match(
    auth,
    /if \(accountMutationInFlight > 0 && !options\.allowActiveMutation\) \{[\s\S]*return null/,
  );
  assert.match(
    auth,
    /replayPendingFollowEntry\(mutationRevision, undefined, \{ allowActiveMutation: true, \}/,
  );
  assert.match(
    auth,
    /const acceptSession = sessionSnapshot \|\| onSessionAccepted[\s\S]*onSessionAccepted\?\.\(acceptedSession\)[\s\S]*requestProfileWithSessionRetry\([\s\S]*acceptSession/,
  );
  assert.match(
    auth,
    /replayPendingFollowEntry\([\s\S]*\{\},[\s\S]*\(acceptedSession\) => \{[\s\S]*sessionSnapshot = acceptedSession/,
  );

  const tournament = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  assert.match(
    tournament,
    /let previousEntryId = 0[\s\S]*await waitForAuthoritativeFollow\(\)[\s\S]*const principalChanged =[\s\S]*this\.restartForPrincipalChange\(previousEntryId, false\)[\s\S]*if \(principalChanged\)/,
  );
});

test("viewer freshness reaches live entry, team and home banners", () => {
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(
    entry,
    /const restartAfterContext = async[\s\S]*restartForPrincipalChange\(previousEntryId, false\)[\s\S]*loadData\(\{ includeTransfers: true, forceRefresh: true \}/,
  );
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(
    team,
    /await waitForAuthoritativeFollow\(\)[\s\S]*const nextGw[\s\S]*const restartAfterContext = async[\s\S]*restartForPrincipalChange\(entryId, false\)/,
  );
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(
    home,
    /tracker\.mark\("contextReadyAt"\)[\s\S]*await waitForAuthoritativeFollow\(\)[\s\S]*await this\.syncAccountLink\(\)/,
  );
  assert.match(
    home,
    /const app = getApp<IAppOption>\(\)[\s\S]*await waitForAuthoritativeFollow\(\)[\s\S]*await this\.syncAccountLink\(\)/,
  );
});

test("Players block pagination while a replacement search is errored", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  const loadMoreStart = players.lastIndexOf("loadMore(): Promise");
  const loadMore = players.slice(loadMoreStart, players.indexOf("onRetryLoadMore", loadMoreStart));
  assert.match(loadMore, /this\.data\.error/);
});

test("all Live surfaces refresh event context before resume polling", () => {
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(entry, /async onShow\(\)/);
  assert.match(
    entry,
    /if \(resumed\)[\s\S]*await this\.ensureContext\("page-show"\)/,
  );
  assert.match(entry, /nextEventId[\s\S]*forceRefresh: true/);
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(match, /async onShow\(\)/);
  assert.match(
    match,
    /if \(resumed\)[\s\S]*await this\.ensureContext\("page-show"\)/,
  );
  assert.match(
    match,
    /nextCurrentEventId[\s\S]*nextTargetEventId[\s\S]*forceRefresh: true/,
  );
  const tournament = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  assert.match(
    tournament,
    /if \(resumed\)[\s\S]*await this\.ensureContext\("page-show"\)/,
  );
  assert.match(tournament, /nextEventId[\s\S]*forceRefresh: true/);
});

test("explore fixtures colour chips by FDR difficulty like the web", () => {
  const template = source("miniprogram/pages/explore/fixtures/fixtures.wxml");
  const componentTemplate = source(
    "miniprogram/components/fixture-chip/fixture-chip.wxml",
  );
  const componentStyles = source(
    "miniprogram/components/fixture-chip/fixture-chip.wxss",
  );
  assert.match(template, /difficulty="\{\{chip\.difficulty\}\}"/);
  assert.match(template, /difficultyKnown="\{\{chip\.difficulty > 0\}\}"/);
  assert.match(template, /homeAway="\{\{chip\.home \? '主' : '客'\}\}"/);
  assert.match(componentTemplate, /\{\{fdrClass\}\}/);
  for (const band of [1, 2, 3, 4, 5]) {
    assert.match(
      componentStyles,
      new RegExp(`\\.fixture-chip\\.fdr-${band}\\b`),
    );
  }
});
