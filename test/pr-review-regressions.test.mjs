import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.wx = {
  getStorageSync() {
    return undefined;
  }
};

let releaseAuth;
const app = {
  authReady: new Promise((resolve) => {
    releaseAuth = resolve;
  }),
  globalData: { entryId: 22 }
};
globalThis.getApp = () => app;
globalThis.Page = () => {};

const { waitForAuthoritativeFollow } = await import("../miniprogram/utils/follow.ts");
const { resolveKeywordAfterPlayerLoad } = await import("../miniprogram/pages/data/players/players.ts");
const { mergeTeamBriefWithCache } = await import("../miniprogram/pages/my-fpl/index/index.ts");

function source(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("personal list pages wait for cold-start auth before reading the follow", async () => {
  let settled = false;
  const waiting = waitForAuthoritativeFollow().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false, "the restored local follow is not authoritative yet");
  releaseAuth();
  await waiting;
  assert.equal(settled, true);

  for (const path of [
    "miniprogram/pages/competitions/index/index.ts",
    "miniprogram/pages/my-fpl/index/index.ts",
    "miniprogram/pages/my-fpl/leagues/leagues.ts"
  ]) {
    assert.match(source(path), /await waitForAuthoritativeFollow\(\)/, path);
  }
});

test("initial request failures do not also claim an empty list", () => {
  const competitions = source("miniprogram/pages/competitions/index/index.wxml");
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.wxml");
  assert.match(competitions, /items\.length === 0 && !error/);
  assert.match(competitions, /displayItems\.length === 0 && keyword && !error/);
  assert.match(leagues, /displayLeagues\.length === 0 && !error/);
});

test("failed event metadata is represented as unavailable, not offseason", () => {
  const service = source("miniprogram/services/my-fpl.service.ts");
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  const template = source("miniprogram/pages/my-fpl/index/index.wxml");
  assert.match(service, /eventContextAvailable = false/);
  assert.match(service, /eventContextAvailable = true/);
  assert.match(overview, /if \(!context\.eventContextAvailable\)/);
  assert.match(template, /eventContextAvailable \|\| principalState === 'NO_FOLLOW'/);
});

test("a total overview secondary failure settles the league module", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  assert.match(
    overview,
    /if \(briefUnavailable && leagues === null\)[\s\S]*resolveOverviewLeagueState\(null, cached\?\.leagueCount\)/,
    "terminal failure renders cached availability or an explicit unavailable state"
  );
});

test("overview preserves the deadline fallback before and after snapshot reads", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  assert.equal(
    (overview.match(/nextUtcDeadline:\s*context\.utcDeadline/g) || []).length,
    2
  );
});

test("Home entry errors retain a team-switch escape", () => {
  const template = source("miniprogram/pages/home/index/index.wxml");
  assert.match(
    template,
    /wx:if="\{\{entryError\}\}"[\s\S]*bindtap="onChangeEntry">更换球队/
  );
});

test("empty fixture directories clear previously composed cards", () => {
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(fixtures, /if \(!this\.teams\.length\) \{\s*this\.setData\(\{ runs: \[\] \}\)/);
});

test("Explore waits for shared launch context before syncing its context row", () => {
  const explore = source("miniprogram/pages/explore/index/index.ts");
  assert.match(explore, /async onLoad\(\)/);
  assert.match(explore, /await app\.initAppData\(true\)[\s\S]*this\.syncContext\(\)/);
  assert.match(explore, /onShow\(\)[\s\S]*if \(resumed\)[\s\S]*this\.refreshContext\(\)/);
});

test("player directory completion preserves edits made during the request", () => {
  assert.equal(resolveKeywordAfterPlayerLoad("saka", "palmer", true), "palmer");
  assert.equal(resolveKeywordAfterPlayerLoad("saka", "", false), "saka");
  assert.equal(resolveKeywordAfterPlayerLoad("", "palmer", false), "palmer");
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(players, /this\.searchRevision !== searchRevision/);
  assert.match(players, /searchEditedWhileLoading \? currentKeyword/);
});

test("overview clears secondary content when the event has no matching cache", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  assert.match(overview, /teamBrief: cached\?\.teamBrief \?\? null/);
  assert.match(
    overview,
    /if \(briefUnavailable && leagues === null\)[\s\S]*teamBrief: cached\?\.teamBrief \?\? null/
  );
});

test("My FPL last-good views survive context and refresh failures", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  const team = source("miniprogram/pages/my-fpl/team/team.ts");
  const template = source("miniprogram/pages/my-fpl/team/team.wxml");
  assert.match(overview, /fallbackEvent[\s\S]*if \(cached\)[\s\S]*eventContextAvailable: true/);
  assert.match(team, /await app\.initAppData\(true\)[\s\S]*wasCurrentEvent/);
  assert.match(team, /restartForPrincipalChange\(entryId\)/);
  assert.match(template, /error && !hasTeamData/);
  assert.match(template, /当前显示上次成功结果/);
  assert.match(overview, /cached\.season === season/);
  assert.match(team, /retainTransferRowsAfterFailure/);
});

test("match rollover detaches same-status in-flight work", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    match,
    /nextEventId !== this\.currentEventId[\s\S]*this\.liveRequestId \+= 1[\s\S]*this\.liveRequest = null[\s\S]*this\.liveRequestKey = ""/
  );
});

test("Explore labels an upcoming preseason round separately from the current event", () => {
  const explore = source("miniprogram/pages/explore/index/index.ts");
  assert.match(explore, /const currentGw = Number\(app\.globalData\.currentGw\)/);
  assert.match(explore, /`下轮 GW \$\{resolvedGw\}`/);
});

test("entry lookup results are guarded by request generation and input identity", () => {
  const search = source("miniprogram/pages/entry/search/search.ts");
  assert.match(search, /requestId !== this\.lookupRequestId \|\| Number\(this\.data\.manualEntryId\) !== entryId/);
  assert.match(search, /if \(requestId === this\.lookupRequestId\)/);
});

test("overview paints before starting snapshot and secondary reads", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  const primaryPaint = overview.indexOf("eventContextAvailable: true");
  const snapshotRead = overview.indexOf("const [snapshotState, briefResult, leagues]");
  assert.ok(primaryPaint >= 0 && snapshotRead > primaryPaint);
  assert.match(overview, /storedAt: \(briefPartial \|\| retainedBrief \|\| retainedLeagues\).*cached\.storedAt/);
});

test("tournament status reports only rows actually retained", () => {
  const tournament = source("miniprogram/pages/live/tournament/tournament.ts");
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");
  assert.match(tournament, /this\.retainedRowCount = retainedRows\.length/);
  assert.match(template, /retainedCount="\{\{retainedRowCount\}\}"/);
  assert.doesNotMatch(template, /retainedCount="\{\{failedRowCount\}\}"/);
});

test("team summary requests discard older GW responses", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(team, /const requestId = \+\+this\.loadRequestId/);
  assert.match(team, /if \(requestId !== this\.loadRequestId\) return/);
  assert.match(team, /if \(requestId === this\.loadRequestId\) \{\s*this\.setData\(\{ loading: false \}\)/);
  assert.match(
    team,
    /if \(!eventResult\) \{[\s\S]*const historySupport = mapHistorySupportRows[\s\S]*hasTeamData: hasHistory[\s\S]*emptyState: hasHistory \? "" : "event"/
  );
  assert.match(team, /function mapHistorySupportRows[\s\S]*seasonHistoryRows: \[\.\.\.history\.history\]/);
  assert.match(team, /catch \(error\) \{[\s\S]*restartForPrincipalChange\(entryId\)/);
});

test("unchanged live probes refresh the displayed check time", () => {
  for (const path of [
    "miniprogram/pages/live/entry/entry.ts",
    "miniprogram/pages/live/match/match.ts",
    "miniprogram/pages/live/tournament/tournament.ts"
  ]) {
    const page = source(path);
    assert.match(
      page,
      /acceptSnapshot:[\s\S]*snapshot\?\.checkedAt[\s\S]*lastUpdated: formatTime\(new Date\(snapshot\.checkedAt\)\)/,
      path
    );
  }
});

test("fixture windows force-refresh event context on open and resume", () => {
  const app = source("miniprogram/app.ts");
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(app, /getCurrentEventAndDeadline\(forceRefresh\)/);
  assert.match(app, /await this\._pendingInit;[\s\S]*return this\.initAppData\(true\)/);
  assert.match(fixtures, /await this\.syncEventContext\(true\)/);
  assert.match(fixtures, /async onShow\(\)[\s\S]*await this\.syncEventContext\(true\)/);
  assert.match(fixtures, /app\.initAppData\(forceRefresh\)/);
  assert.match(fixtures, /const startEvent = this\.selectedWindowByUser[\s\S]*this\.setData\(\{ startEvent \}\);[\s\S]*this\.rebuild\(\)/);
});

test("My FPL partial brief reads retain only fields from the failed source", () => {
  const cached = {
    entryName: "Cached team",
    playerName: "Cached player",
    eventPoints: 44,
    overallPoints: 900,
    overallRank: 1000
  };
  assert.deepEqual(
    mergeTeamBriefWithCache({
      brief: { eventPoints: 51, overallPoints: 951, overallRank: 800 },
      entryAvailable: false,
      eventResultAvailable: true
    }, cached),
    {
      entryName: "Cached team",
      playerName: "Cached player",
      eventPoints: 51,
      overallPoints: 951,
      overallRank: 800
    }
  );
  assert.deepEqual(
    mergeTeamBriefWithCache({
      brief: { entryName: "Fresh team", playerName: "Fresh player", overallPoints: 960, overallRank: 750 },
      entryAvailable: true,
      eventResultAvailable: false
    }, cached),
    {
      entryName: "Fresh team",
      playerName: "Fresh player",
      eventPoints: 44,
      overallPoints: 960,
      overallRank: 750
    }
  );
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  assert.match(overview, /storedAt: \(briefPartial \|\| retainedBrief \|\| retainedLeagues\).*cached\.storedAt/);
});

test("website returns bypass competition cache and accepted handoffs await clipboard success", () => {
  const competitions = source("miniprogram/pages/competitions/index/index.ts");
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const action = source("miniprogram/utils/canonical-action.ts");
  assert.match(competitions, /if \(resumed\)[\s\S]*this\.loadList\(true\)/);
  assert.match(competitions, /cached\.season === season/);
  assert.match(
    competitions,
    /if \(currentFollowEntryId\(\) !== entryId\) \{[\s\S]*this\.loadList\(true\)/,
    "an authoritative principal change restarts rather than applying the old response"
  );
  assert.match(competitions, /if \(await openWebsiteAction\(action\)\)/);
  assert.match(leagues, /if \(await openWebsiteAction\(action\)\)/);
  assert.match(action, /success:[\s\S]*resolve\(true\)/);
  assert.match(action, /fail[\s\S]*resolve\(false\)/);
});

test("league handoff returns bypass the cached official league list", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  assert.match(leagues, /if \(resumed\)[\s\S]*initAppData\(true\)[\s\S]*this\.loadLeagues\(true\)/);
  assert.match(leagues, /cached\.season === season/);
});

test("fixture resume reloads instead of relabeling payload across seasons", () => {
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  const service = source("miniprogram/services/fixture.service.ts");
  assert.match(fixtures, /const seasonChanged = await this\.syncEventContext\(true\)/);
  assert.match(fixtures, /async onLoad\(\)[\s\S]*await this\.load\(true\)/);
  assert.match(fixtures, /await this\.load\(seasonChanged\)/);
  assert.match(fixtures, /getFixtureWindow\(startEvent, horizon, season, forceRefresh\)/);
  assert.match(fixtures, /getTeamList\(season, forceRefresh\)/);
  assert.doesNotMatch(service, /fixtures\(limit:\s*500\)/);
  assert.match(service, /eventFixtures\(eventId:/);
  assert.match(service, /fragment FixtureWindowFields on Fixture/);
  assert.match(service, /cacheVariant: season \? `season:\$\{season\}` : "season:unknown"/);
  assert.match(fixtures, /error: hadLastGood\s*\?/);
  assert.match(fixtures, /this\.loadedSeason !== season/);
  assert.match(fixtures, /this\.fixtures = \[\];\s*this\.teams = \[\]/);
  assert.match(fixtures, /this\.loadedSeason = season/);
});

test("initial league and competition payloads bypass seasonless service caches", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const competitions = source("miniprogram/pages/competitions/index/index.ts");
  const common = source("miniprogram/services/common.service.ts");
  assert.match(leagues, /async onLoad\(\)[\s\S]*this\.loadLeagues\(true\)/);
  assert.match(competitions, /async onLoad\(\)[\s\S]*this\.loadList\(true\)/);
  assert.match(common, /getTeamList[\s\S]*cacheVariant: _season \? `season:\$\{_season\}` : "season:unknown"/);
});

test("resident league and competition rows never cross a season", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const competitions = source("miniprogram/pages/competitions/index/index.ts");
  assert.match(leagues, /loadedSeason: undefined[\s\S]*seasonChanged[\s\S]*leagues: \[\], displayLeagues: \[\]/);
  assert.match(competitions, /loadedSeason: undefined[\s\S]*seasonChanged[\s\S]*items: \[\], displayItems: \[\]/);
});

test("cold offline lists retain only their own persisted season cache", () => {
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const competitions = source("miniprogram/pages/competitions/index/index.ts");
  for (const page of [leagues, competitions]) {
    assert.match(page, /readStored\w+Cache\(\)/);
    assert.match(page, /const offlineCached = season \? null : readStored\w+Cache\(\)/);
    assert.match(page, /offlineCached\?\.entryId === entryId/);
  }
});

test("player route keywords survive a failed first load for Retry", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(players, /if \(this\.searchRevision === searchRevision\) \{[\s\S]*this\.pendingKeyword = pendingKeyword/);
});

test("tournament row requests are principal- and season-generation guarded", () => {
  const tournament = source("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(tournament, /seasonChanged \|\| wasCurrentEvent[\s\S]*this\.rowsRequestId \+= 1/);
  assert.match(tournament, /const entryId = this\.data\.entryId[\s\S]*const requestKey = `\$\{entryId\}:/);
  assert.match(tournament, /await getLivePointsByTournamentSnapshot[\s\S]*restartForPrincipalChange\(entryId\)/);
  assert.match(tournament, /catch \(error\)[\s\S]*restartForPrincipalChange\(entryId\)/);
});

test("no-follow actions survive context failure and profile checks compare the retained follow", () => {
  const template = source("miniprogram/pages/my-fpl/index/index.wxml");
  const app = source("miniprogram/app.ts");
  assert.match(template, /eventContextAvailable \|\| principalState === 'NO_FOLLOW'/);
  assert.match(app, /const nextEntry = this\.globalData\.entryId/);
  assert.doesNotMatch(app, /const nextEntry = session\.profile\.fplEntryId/);
});

test("forced My FPL refresh reaches the cached team identity read", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  const service = source("miniprogram/services/my-fpl.service.ts");
  assert.match(overview, /getMyFplTeamBrief\(context\.entryId, event, forceRefresh\)/);
  assert.match(service, /getMyFplTeamBrief\([\s\S]*forceRefresh = false[\s\S]*getEntryInfo\(entryId, forceRefresh\)/);
});

test("historical Live selections reset when the season changes", () => {
  for (const path of [
    "miniprogram/pages/live/entry/entry.ts",
    "miniprogram/pages/live/tournament/tournament.ts"
  ]) {
    const page = source(path);
    assert.match(page, /loadedSeason: undefined/, path);
    assert.match(page, /seasonChanged \|\| wasCurrentEvent/, path);
    assert.match(page, /event: nextEventId,[\s\S]*maxGw: nextEventId/, path);
  }
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(entry, /if \(seasonChanged\) \{[\s\S]*this\.liveRequestId \+= 1[\s\S]*this\.liveRequest = null/);
  assert.match(entry, /const eventContextChanged = seasonChanged \|\| \(nextEventId > 0/);
  assert.match(entry, /eventContextChanged && \(seasonChanged \|\| wasCurrentEvent\)/);
  assert.match(entry, /error: nextEventId > 0 \? "" : "当前赛季暂无实时比赛周"/);
  assert.match(entry, /const currentGw = Math\.max\(0, Number\(app\.globalData\.gw\)/);
  assert.match(entry, /if \(!this\.data\.entryId \|\| currentGw > 0\) \{[\s\S]*this\.loadData[\s\S]*当前赛季暂无实时比赛周/);
  const tournament = source("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(tournament, /const eventContextChanged = seasonChanged \|\| \(nextEventId > 0/);
  assert.match(tournament, /this\.tournamentListRequestId \+= 1[\s\S]*nextEventId === 0/);
  assert.match(tournament, /if \(!this\.data\.entryId \|\| currentGw > 0\) \{[\s\S]*this\.loadTournaments/);
});

test("first personal paints bypass previous-season event and summary caches", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  const team = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(overview, /async onLoad\(\)[\s\S]*this\.loadOverview\(true\)/);
  assert.match(overview, /if \(resumed\)[\s\S]*this\.loadOverview\(true\)/);
  assert.match(team, /async onLoad\(\)[\s\S]*this\.loadData\(true\)/);
  assert.match(overview, /event === undefined/);
});

test("Match and Team retries bypass repeating-season caches", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  const team = source("miniprogram/pages/my-fpl/team/team.ts");
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(match, /loadedSeason: undefined[\s\S]*seasonChanged[\s\S]*liveRequestId \+= 1/);
  assert.match(team, /onRetry\(\)[\s\S]*this\.loadData\(true\)/);
  assert.match(team, /onEmptyAction\(\)[\s\S]*this\.loadData\(true\)/);
  assert.match(team, /const contextChanged = seasonChanged \|\| \(eventChanged && wasCurrentEvent\)/);
  assert.match(team, /if \(!eventResult\) \{[\s\S]*transferError,[\s\S]*hasTeamData: hasHistory/);
  assert.match(fixtures, /selectedWindowByUser[\s\S]*const startEvent = this\.selectedWindowByUser/);
});

test("season rollover clears row filters derived from player ids", () => {
  const tournament = source("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(
    tournament,
    /seasonChanged \? \{[\s\S]*selectedOwnershipPlayers: \[\][\s\S]*ownershipAvailablePlayers: \[\][\s\S]*selectedTeamExposure: null/
  );
});

test("live competition Website handoff uses the guarded canonical action", () => {
  const tournament = source("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(
    tournament,
    /async onCopyCompetitionLink\(\)[\s\S]*openWebsiteAction\(canonicalAction\("MANAGE_COMPETITION"\)\)/
  );
});

test("player route keywords are consumed before the first directory request settles", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(
    players,
    /const pendingKeyword = this\.pendingKeyword;\s*this\.pendingKeyword = "";[\s\S]*await getPlayersByElementType/
  );
});

test("personal responses never cross an authoritative follow change", () => {
  const competitions = source("miniprogram/pages/competitions/index/index.ts");
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  const liveEntry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(competitions, /principalChanged[\s\S]*items: \[\], displayItems: \[\]/);
  assert.match(leagues, /currentFollowEntryId\(\) !== entryId[\s\S]*this\.loadLeagues\(true\)/);
  assert.match(overview, /currentFollowEntryId\(\) !== context\.entryId[\s\S]*this\.loadOverview\(true\)/);
  assert.match(liveEntry, /restartForPrincipalChange\(entryId[\s\S]*currentFollowEntryId\(\)/);
  assert.match(
    liveEntry,
    /await getLivePointsByEntrySnapshot[\s\S]*restartForPrincipalChange\(entryId\)/
  );
  assert.match(
    liveEntry,
    /await getEntryEventTransfers[\s\S]*restartForPrincipalChange\(entryId\)/
  );
  assert.match(liveEntry, /if \(this\.data\.viewOnly\) return false/);
});

test("all Live surfaces refresh event context before resume polling", () => {
  for (const path of [
    "miniprogram/pages/live/entry/entry.ts",
    "miniprogram/pages/live/match/match.ts",
    "miniprogram/pages/live/tournament/tournament.ts"
  ]) {
    const page = source(path);
    assert.match(page, /async onShow\(\)/, path);
    assert.match(page, /if \(resumed\)[\s\S]*await app\.initAppData\(true\)/, path);
    assert.match(page, /nextEventId[\s\S]*forceRefresh: true/, path);
  }
});

test("unknown fixture difficulty uses a neutral style", () => {
  const template = source("miniprogram/pages/explore/fixtures/fixtures.wxml");
  const component = source("miniprogram/components/fixture-chip/fixture-chip.ts");
  const utility = source("miniprogram/utils/fpl.ts");
  assert.doesNotMatch(template, /difficulty="\{\{chip\.difficulty \|\| 0\}\}"/);
  assert.match(template, /difficultyKnown="\{\{chip\.difficulty != null\}\}"/);
  assert.match(component, /difficultyClass: "difficulty-unknown"/);
  assert.match(utility, /return "difficulty-unknown"/);
});
