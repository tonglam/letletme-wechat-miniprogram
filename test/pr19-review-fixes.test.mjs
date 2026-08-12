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
});

test("price context is optional while season-scoped deep links await it", () => {
  const price = source("miniprogram/pages/data/price/price.ts");
  const teams = source("miniprogram/pages/data/teams/teams.ts");
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(price, /try \{[\s\S]*await ensureAppContext\(\{ reason: "page-load" \}\);[\s\S]*\} catch \{\}[\s\S]*loadDailyChanges/);
  assert.match(teams, /const context = await ensureAppContext[\s\S]*getTeamList\(context\.season\)/);
  assert.match(players, /await ensureAppContext\(\{ reason: "page-load" \}\)[\s\S]*await this\.fetchPage/);
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
    liveForcedFollowup: null,
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
  assert.match(template, /showSquad && hasTeamData/);
  assert.match(template, /data-tab="history"/);
});
