import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

let capturedPage;
globalThis.Page = (definition) => {
  capturedPage = definition;
};

await import("../miniprogram/pages/live/entry/entry.ts");
const entryPage = capturedPage;

capturedPage = undefined;
const tournamentModule = await import("../miniprogram/pages/live/tournament/tournament.ts");
const tournamentPage = capturedPage;

capturedPage = undefined;
await import("../miniprogram/pages/live/match/match.ts");
const matchPage = capturedPage;

capturedPage = undefined;
const teamModule = await import("../miniprogram/pages/my-fpl/team/team.ts");
const teamPage = capturedPage;

test("live tournament defaults to GW sort", () => {
  assert.equal(tournamentPage.data.sortKey, "livePoints");
  assert.equal(tournamentPage.data.sortDesc, true);
  assert.equal(tournamentPage.data.sortOptions[0].key, "livePoints");
});

test("tournament preseason is a stable business empty state", () => {
  assert.deepEqual(tournamentModule.noLiveEventState(), {
    loading: false,
    refreshing: false,
    hasData: false,
    error: "",
    errorSuffix: "",
    tournamentListError: "",
    tournamentListErrorSuffix: "",
    emptyState: "preseason",
    emptyEyebrow: "赛季准备中",
    emptyTitle: "当前赛季暂无实时比赛周",
    emptyDescription: "比赛周开始后，这里会显示赛事实时得分和排名",
    emptyActionText: "",
    rowCount: 0,
    displayedRows: [],
    filteredCount: 0,
    lastUpdated: ""
  });
});

test("tournament cold start commits preseason instead of an error", async () => {
  globalThis.wx = { getStorageSync: () => "" };
  globalThis.getApp = () => ({
    globalData: { entryId: 123 },
    authReady: Promise.resolve()
  });
  const calls = [];
  const context = {
    ...tournamentPage,
    data: { ...tournamentPage.data, error: "old error" },
    rows: [{ entry: 1 }],
    pageVisible: true,
    startupGeneration: 0,
    ensureContext: async () => ({ season: "2026/27", currentEvent: 0 }),
    setData(update) { Object.assign(this.data, update); },
    initLiveRefresh() { calls.push("init"); },
    liveRefresh: { stop() { calls.push("stop"); } },
    syncDisplayState() { calls.push("display"); },
    loadTournaments() { calls.push("load"); }
  };

  await tournamentPage.initializeFromContext.call(context, "page-load");

  assert.equal(context.data.event, 0);
  assert.equal(context.data.emptyState, "preseason");
  assert.equal(context.data.error, "");
  assert.deepEqual(context.rows, []);
  assert.deepEqual(calls, ["init", "stop", "display"]);
});

test("re-arms current-gameweek polling before loading the switched context", () => {
  const calls = [];
  const context = {
    ...entryPage,
    data: { ...entryPage.data, entryId: 123, event: 32 },
    liveRefresh: null,
    setData(update) {
      Object.assign(this.data, update);
      if (update.event !== undefined) {
        calls.push(`set:${this.data.event}`);
      }
    },
    loadData(options) {
      calls.push(`load:${this.data.event}:${options.includeTransfers === true}`);
      return Promise.resolve();
    }
  };
  context.liveRefresh = {
    stop() {
      calls.push("stop");
    },
    sync() {
      calls.push(`sync:${context.data.event}`);
    }
  };

  entryPage.onGwChange.call(context, { detail: { value: 33 } });

  assert.deepEqual(calls, ["stop", "set:33", "sync:33", "load:33:true"]);
});

test("an overlapping manual refresh queues one forced CalcLive and forced transfer refresh", async () => {
  let resolveScore;
  const scoreRequest = new Promise((resolve) => {
    resolveScore = resolve;
  });
  const transferCalls = [];
  const scoreCalls = [];
  const context = {
    data: { entryId: 123, event: 33 },
    liveRequest: scoreRequest,
    liveRequestKey: "123:33",
    liveRequestForced: false,
    liveRequestId: 1,
    liveForcedFollowup: null,
    pageVisible: true,
    loadTransfersAfterLive: false,
    restartForPrincipalChange() {
      return false;
    },
    loadTransfers(entryId, eventId, forceRefresh) {
      transferCalls.push([entryId, eventId, forceRefresh]);
      return Promise.resolve();
    },
    loadData(options) {
      scoreCalls.push(options);
      return this.loadTransfers(this.data.entryId, this.data.event, options.forceRefresh === true);
    }
  };

  let settled = false;
  const result = entryPage.loadData.call(context, {
    includeTransfers: true,
    forceRefresh: true
  });
  void result.then(() => {
    settled = true;
  });

  assert.deepEqual(transferCalls, []);
  assert.equal(context.loadTransfersAfterLive, false);
  resolveScore();
  await result;
  assert.equal(settled, true);
  assert.equal(scoreCalls.length, 1);
  assert.equal(scoreCalls[0].forceRefresh, true);
  assert.equal(scoreCalls[0].includeTransfers, true);
  assert.deepEqual(transferCalls, [[123, 33, true]]);
});

test("match cold start waits for the current event before arming recovery", async () => {
  const calls = [];
  let resolveContext;
  const app = {
    globalData: { gw: 0, currentGw: 0 }
  };
  globalThis.getApp = () => app;
  globalThis.wx = {
    getStorageSync() {
      return "";
    }
  };
  const context = {
    data: { ...matchPage.data },
    currentEventId: 0,
    liveRefresh: null,
    ensureContext(reason) {
      calls.push(`context:${reason}`);
      return new Promise((resolve) => {
        resolveContext = resolve;
      });
    },
    setData(update) {
      Object.assign(this.data, update);
      if (update.loading) calls.push("loading");
    },
    initLiveRefresh() {
      this.liveRefresh = {
        sync() {
          calls.push(`sync:${context.currentEventId}`);
        }
      };
    },
    armContextDeadline() {},
    syncDisplayState() {},
    loadData() {
      calls.push(`load:${this.currentEventId}`);
      return Promise.resolve();
    }
  };

  const loading = matchPage.onLoad.call(context);
  assert.deepEqual(calls, ["loading", "context:page-load"]);
  app.globalData.gw = 33;
  app.globalData.currentGw = 33;
  resolveContext({ currentEvent: 33, displayEvent: 33, season: "2025-26" });
  await loading;

  assert.equal(context.currentEventId, 33);
  assert.equal(context.targetEventId, 33);
  assert.deepEqual(calls, ["loading", "context:page-load", "load:33"]);
});

test("match cold start selects the schema-backed not-started bucket during preseason", async () => {
  const app = {
    globalData: { gw: 1, currentGw: 0 },
    initAppData: async () => {}
  };
  globalThis.getApp = () => app;
  globalThis.wx = { getStorageSync: () => "" };
  const context = {
    ...matchPage,
    data: { ...matchPage.data },
    currentEventId: 0,
    ensureContext: async () => ({ currentEvent: null, displayEvent: 1, season: "2025-26" }),
    liveRefresh: null,
    setData(update) {
      Object.assign(this.data, update);
    },
    initLiveRefresh() {
      this.liveRefresh = { sync() {} };
    },
    loadData: async () => {},
    syncDisplayState() {}
  };

  await matchPage.onLoad.call(context);

  assert.equal(context.currentEventId, 0);
  assert.equal(context.targetEventId, 1);
  assert.equal(context.data.status, "not_start");
  assert.equal(context.data.activeStatusLabel, "未开始");
});

test("match status changes filter the Core schedule without network work", () => {
  const calls = [];
  globalThis.wx = {
    setStorageSync(_key, value) {
      calls.push(`store:${value}`);
    }
  };
  const context = {
    data: { ...matchPage.data, status: "finished" },
    coreMatches: [{ matchId: 1, status: "playing", eventSummary: [] }],
    liveSnapshot: { state: "SETTLED" },
    cachedLiveStoredAt: 1,
    liveRefresh: null,
    setData(update) {
      Object.assign(this.data, update);
      if (update.status !== undefined) {
        calls.push(`set:${this.data.status}`);
      }
    },
    loadData() { calls.push("unexpected-load"); }
  };
  context.liveRefresh = {
    stop() {
      calls.push("stop");
    },
    sync() {
      calls.push(`sync:${context.data.status}`);
    }
  };
  context.syncDisplayState = () => {};

  matchPage.onStatusTap.call(context, {
    currentTarget: { dataset: { status: "playing" } }
  });

  assert.deepEqual(context.data.matches.map((match) => match.matchId), [1]);
  assert.deepEqual(calls, [
    "store:playing",
    "set:playing"
  ]);
});

test("match rollover invalidates an in-flight same-status request", async () => {
  globalThis.getApp = () => ({
    globalData: { gw: 34 },
    initAppData: async () => {}
  });
  const calls = [];
  const context = {
    ...matchPage,
    data: { ...matchPage.data, status: "playing", hasData: true },
    pageVisible: false,
    hasShown: true,
    ensureContext(reason) {
      calls.push(`context:${reason}`);
      return Promise.resolve({
        season: "2026",
        currentEvent: 34,
        displayEvent: 34
      });
    },
    currentEventId: 33,
    targetEventId: 33,
    liveRequestId: 7,
    liveRequest: Promise.resolve(),
    liveRequestKey: "playing",
    liveRefresh: {
      stop() { calls.push("stop"); },
      sync() { calls.push("sync"); }
    },
    setData(update) { Object.assign(this.data, update); },
    loadData() {
      calls.push(`load:${this.currentEventId}:${this.liveRequestId}:${this.liveRequestKey}`);
      return Promise.resolve();
    },
    syncDisplayState() {}
  };

  await matchPage.onShow.call(context);

  assert.equal(context.currentEventId, 34);
  assert.equal(context.targetEventId, 34);
  assert.equal(context.liveRequestId, 8);
  assert.equal(context.liveRequest, null);
  assert.deepEqual(calls, ["context:page-show", "stop", "sync", "load:34:8:"]);
});

test("entry resume revalidates current-gameweek transfers independently", async () => {
  const calls = [];
  globalThis.getApp = () => ({
    globalData: { gw: 33 },
    initAppData(forceRefresh) {
      calls.push(`init:${forceRefresh}`);
      return Promise.resolve();
    }
  });
  const context = {
    ...entryPage,
    data: { ...entryPage.data, entryId: 123, event: 33, maxGw: 33 },
    pageVisible: false,
    hasShown: true,
    ensureContext(reason) {
      calls.push(`context:${reason}`);
      return Promise.resolve({});
    },
    liveRefresh: {
      sync() {
        calls.push("sync");
      }
    },
    revalidateCachedSnapshot() {
      return false;
    },
    shouldAutoRefresh() {
      return false;
    },
    restartForPrincipalChange() {
      return false;
    },
    loadTransfers(entryId, eventId, forceRefresh) {
      calls.push(`transfers:${entryId}:${eventId}:${forceRefresh}`);
      return Promise.resolve();
    }
  };

  await entryPage.onShow.call(context);

  assert.deepEqual(calls, ["context:page-show", "sync", "transfers:123:33:false"]);
});

test("entry resume drops a historical selection after a season rollover", async () => {
  const calls = [];
  globalThis.getApp = () => ({
    globalData: { season: "2026/27", gw: 1 },
    initAppData: async (forceRefresh) => { calls.push(`init:${forceRefresh}`); }
  });
  const context = {
    data: { ...entryPage.data, entryId: 123, event: 30, maxGw: 38, hasData: true, shareSheetOpen: true, shareText: "old" },
    pageVisible: false,
    hasShown: true,
    loadedSeason: "2025/26",
    ensureContext(reason) {
      calls.push(`context:${reason}`);
      return Promise.resolve({ season: "2026/27", currentEvent: 1 });
    },
    liveSnapshot: { state: "SETTLED" },
    cachedLiveStoredAt: 1,
    liveRequestId: 7,
    transfersRequestId: 4,
    liveRequest: Promise.resolve(),
    liveRequestKey: "123:1",
    liveRefresh: {
      stop() { calls.push("stop"); },
      sync() { calls.push(`sync:${context.data.event}`); }
    },
    restartForPrincipalChange() {
      return false;
    },
    setData(update) { Object.assign(this.data, update); },
    loadData(options) {
      calls.push(`load:${this.data.event}:${options.forceRefresh}:${options.includeTransfers}`);
      return Promise.resolve();
    },
    syncDisplayState() { calls.push("display"); }
  };

  await entryPage.onShow.call(context);

  assert.equal(context.data.event, 1);
  assert.equal(context.data.maxGw, 1);
  assert.equal(context.data.hasData, false);
  assert.equal(context.data.shareSheetOpen, false);
  assert.equal(context.liveRequestId, 8);
  assert.equal(context.transfersRequestId, 5);
  assert.equal(context.liveRequest, null);
  assert.equal(context.liveRequestKey, "");
  assert.deepEqual(calls, ["context:page-show", "stop", "sync:1", "load:1:true:true", "display"]);
});

test("entry resume clears live data when a new season has no event yet", async () => {
  const calls = [];
  globalThis.getApp = () => ({
    globalData: { season: "2026/27", gw: 0 },
    initAppData: async (forceRefresh) => { calls.push(`init:${forceRefresh}`); }
  });
  const context = {
    data: { ...entryPage.data, entryId: 123, event: 1, maxGw: 1, hasData: true, total: 77 },
    pageVisible: false,
    hasShown: true,
    loadedSeason: "2025/26",
    ensureContext(reason) {
      calls.push(`context:${reason}`);
      return Promise.resolve({});
    },
    liveSnapshot: { state: "SETTLED" },
    cachedLiveStoredAt: 1,
    liveRequestId: 7,
    transfersRequestId: 4,
    liveRequest: Promise.resolve(),
    liveRequestKey: "123:1",
    liveRefresh: {
      stop() { calls.push("stop"); },
      sync() { calls.push(`sync:${context.data.event}`); }
    },
    restartForPrincipalChange() { return false; },
    setData(update) { Object.assign(this.data, update); },
    syncDisplayState() { calls.push("display"); }
  };

  await entryPage.onShow.call(context);

  assert.equal(context.data.event, 0);
  assert.equal(context.data.maxGw, 0);
  assert.equal(context.data.hasData, false);
  assert.equal(context.data.total, 0);
  assert.equal(context.data.error, "当前赛季暂无实时比赛周");
  assert.equal(context.liveRequestId, 8);
  assert.equal(context.transfersRequestId, 5);
  assert.equal(context.liveRequest, null);
  assert.equal(context.liveRequestKey, "");
  assert.deepEqual(calls, ["context:page-show", "stop", "sync:0", "display"]);
});

test("entry principal changes clear old live data and restart the followed team", () => {
  globalThis.getApp = () => ({ globalData: { entryId: 456, gw: 33 } });
  globalThis.wx = { getStorageSync: () => undefined };
  const calls = [];
  const context = {
    ...entryPage,
    data: {
      ...entryPage.data,
      entryId: 123,
      event: 33,
      viewOnly: false,
      hasData: true,
      total: 77,
      starters: [{ element: 1 }],
      transfers: [{ inText: "old" }],
      playerDetailOpen: true,
      playerDetail: { element: 1 },
      shareSheetOpen: true,
      shareText: "old share"
    },
    liveRequestId: 7,
    transfersRequestId: 4,
    liveRequest: Promise.resolve(),
    liveRequestKey: "123:33",
    liveSnapshot: { state: "SETTLED" },
    cachedLiveStoredAt: 1,
    liveRefresh: {
      stop() { calls.push("stop"); },
      sync() { calls.push("sync"); }
    },
    setData(update) { Object.assign(this.data, update); },
    syncDisplayState() { calls.push("display"); },
    loadData(options) {
      calls.push(`load:${this.data.entryId}:${options.includeTransfers}:${options.forceRefresh}`);
      return Promise.resolve();
    }
  };

  assert.equal(entryPage.restartForPrincipalChange.call(context, 123), true);
  assert.equal(context.data.entryId, 456);
  assert.equal(context.data.hasData, false);
  assert.equal(context.data.total, 0);
  assert.deepEqual(context.data.starters, []);
  assert.deepEqual(context.data.transfers, []);
  assert.equal(context.data.playerDetailOpen, false);
  assert.equal(context.data.playerDetail, null);
  assert.equal(context.data.shareSheetOpen, false);
  assert.equal(context.liveRequestId, 8);
  assert.equal(context.transfersRequestId, 5);
  assert.equal(context.liveRequest, null);
  assert.equal(context.liveRequestKey, "");
  assert.deepEqual(calls, ["stop", "sync", "load:456:true:true", "display"]);

  context.data.viewOnly = true;
  context.data.entryId = 999;
  assert.equal(entryPage.restartForPrincipalChange.call(context, 999), false);
  assert.equal(context.data.entryId, 999);
});

test("tournament resume drops a historical selection after a season rollover", async () => {
  const calls = [];
  globalThis.getApp = () => ({
    globalData: { season: "2026/27", gw: 1 },
    initAppData: async (forceRefresh) => { calls.push(`init:${forceRefresh}`); }
  });
  const context = {
    data: {
      ...tournamentPage.data,
      event: 30,
      maxGw: 38,
      hasData: true,
      displayedRows: [{ entry: 1 }],
      selectedOwnershipPlayers: [{ element: 999, name: "Old player" }],
      ownershipPlayerNames: ["Old player"],
      ownershipSummary: "Old player",
      selectedOwnershipTeam: { id: 1, name: "Old team" },
      ownershipAvailablePlayers: [{ element: 999, name: "Old player" }],
      teamExposureRules: [{ teamShortName: "ARS", name: "Old team", count: 2 }],
      pendingExposureTeam: { shortName: "CHE", name: "Old pending" },
      shareSheetOpen: true,
      shareText: "old share"
    },
    rows: [{ entry: 1 }],
    pageVisible: false,
    hasShown: true,
    loadedSeason: "2025/26",
    liveSnapshot: { state: "SETTLED" },
    cachedLiveStoredAt: 1,
    failedEntryCount: 2,
    retainedRowCount: 1,
    ensureContext(reason) {
      calls.push(`context:${reason}`);
      return Promise.resolve({ season: "2026/27", currentEvent: 1 });
    },
    liveRefresh: {
      stop() { calls.push("stop"); },
      sync() { calls.push(`sync:${context.data.event}`); }
    },
    setData(update) { Object.assign(this.data, update); },
    loadTournaments(forceRefresh) {
      calls.push(`tournaments:${this.data.event}:${forceRefresh}`);
      return Promise.resolve();
    },
    syncDisplayState() { calls.push("display"); }
  };

  await tournamentPage.onShow.call(context);

  assert.equal(context.data.event, 1);
  assert.equal(context.data.maxGw, 1);
  assert.deepEqual(context.rows, []);
  assert.equal(context.data.selectedTournament, null);
  assert.deepEqual(context.data.selectedOwnershipPlayers, []);
  assert.deepEqual(context.data.ownershipAvailablePlayers, []);
  assert.equal(context.data.ownershipSummary, "未筛选");
  assert.equal(context.data.selectedOwnershipTeam, null);
  assert.deepEqual(context.data.teamExposureRules, []);
  assert.equal(context.data.pendingExposureTeam, null);
  assert.equal(context.data.shareSheetOpen, false);
  assert.equal(context.failedEntryCount, 0);
  assert.deepEqual(calls, ["context:page-show", "stop", "sync:1", "tournaments:1:true", "display"]);
});

test("tournament rollover to a season without a live event commits preseason", async () => {
  globalThis.getApp = () => ({ globalData: { season: "2026/27", gw: 0 } });
  const calls = [];
  const context = {
    ...tournamentPage,
    data: {
      ...tournamentPage.data,
      event: 30,
      maxGw: 38,
      hasData: true,
      error: "old error",
      displayedRows: [{ entry: 1 }]
    },
    rows: [{ entry: 1 }],
    pageVisible: false,
    hasShown: true,
    loadedSeason: "2025/26",
    rowsRequestId: 2,
    tournamentListRequestId: 3,
    liveRefresh: {
      stop() { calls.push("stop"); },
      sync() { calls.push(`sync:${context.data.event}`); }
    },
    ensureContext: async () => ({ season: "2026/27", currentEvent: 0 }),
    setData(update) { Object.assign(this.data, update); },
    syncDisplayState() { calls.push("display"); }
  };

  await tournamentPage.onShow.call(context);

  assert.equal(context.data.event, 0);
  assert.equal(context.data.maxGw, 0);
  assert.equal(context.data.emptyState, "preseason");
  assert.equal(context.data.error, "");
  assert.deepEqual(context.rows, []);
  assert.equal(context.rowsRequestId, 3);
  assert.equal(context.tournamentListRequestId, 4);
  assert.deepEqual(calls, ["stop", "sync:0", "display"]);
});

test("tournament leaves preseason and reloads its directory when GW1 appears", async () => {
  globalThis.getApp = () => ({ globalData: { season: "2026/27", gw: 1 } });
  const calls = [];
  const context = {
    ...tournamentPage,
    data: {
      ...tournamentPage.data,
      event: 0,
      maxGw: 0,
      emptyState: "preseason",
      emptyTitle: "当前赛季暂无实时比赛周"
    },
    pageVisible: false,
    hasShown: true,
    loadedSeason: "2026/27",
    liveRefresh: {
      stop() { calls.push("stop"); },
      sync() { calls.push(`sync:${context.data.event}`); }
    },
    ensureContext: async () => ({ season: "2026/27", currentEvent: 1 }),
    setData(update) { Object.assign(this.data, update); },
    loadTournaments(forceRefresh) {
      calls.push(`tournaments:${this.data.event}:${forceRefresh}`);
      return Promise.resolve();
    },
    loadRows() { calls.push("rows"); },
    syncDisplayState() { calls.push("display"); }
  };

  await tournamentPage.onShow.call(context);

  assert.equal(context.data.event, 1);
  assert.equal(context.data.emptyState, "");
  assert.equal(context.data.emptyTitle, "");
  assert.deepEqual(calls, ["stop", "sync:1", "tournaments:1:true", "display"]);
});

test("tournament recovery keeps preseason distinct from a context failure", async () => {
  globalThis.getApp = () => ({ globalData: { season: "2026/27", gw: 0 } });
  const calls = [];
  const preseason = {
    ...tournamentPage,
    data: { ...tournamentPage.data, event: 0, error: "old error" },
    pageVisible: true,
    startupGeneration: 0,
    liveRefresh: { stop() { calls.push("stop"); } },
    ensureContext: async () => ({ season: "2026/27", currentEvent: 0 }),
    setData(update) { Object.assign(this.data, update); }
  };

  await tournamentPage.retryWithContext.call(preseason);
  assert.equal(preseason.data.emptyState, "preseason");
  assert.equal(preseason.data.error, "");
  assert.deepEqual(calls, ["stop"]);

  const failed = {
    ...tournamentPage,
    data: {
      ...tournamentPage.data,
      event: 0,
      emptyState: "preseason",
      emptyTitle: "当前赛季暂无实时比赛周"
    },
    pageVisible: true,
    startupGeneration: 0,
    ensureContext: async () => { throw new Error("赛季上下文刷新失败"); },
    setData(update) { Object.assign(this.data, update); },
    syncDisplayState() {}
  };

  await tournamentPage.retryWithContext.call(failed);
  assert.equal(failed.data.emptyState, "");
  assert.equal(failed.data.emptyTitle, "");
  assert.equal(failed.data.error, "赛季上下文刷新失败");
});

test("tournament Website handoff reports clipboard failures", async () => {
  const toasts = [];
  globalThis.wx = {
    setClipboardData: ({ fail }) => fail?.({ errMsg: "denied" }),
    showToast: ({ title }) => toasts.push(title)
  };

  await tournamentPage.onCopyCompetitionLink.call({
    ...tournamentPage,
    data: { ...tournamentPage.data }
  });

  assert.deepEqual(toasts, ["复制失败，请重试"]);
});

test("tournament list errors are retried by their owning request", () => {
  const calls = [];
  const context = {
    data: {
      ...tournamentPage.data,
      tournamentListError: "联赛列表刷新失败",
      tournaments: [{ id: "league-1", name: "League" }]
    },
    loadTournaments(forceRefresh) {
      calls.push(`list:${forceRefresh}`);
    },
    loadRows() {
      calls.push("rows");
    }
  };

  tournamentPage.onRetry.call(context);

  assert.deepEqual(calls, ["list:true"]);
  assert.doesNotMatch(
    String(tournamentPage.refreshIfChanged),
    /tournamentListError/,
    "snapshot probes must not clear an independent tournament-list error"
  );
  assert.equal(tournamentModule.shouldClearTournamentRowsError(1), false);
  assert.equal(tournamentModule.shouldClearTournamentRowsError(0), true);
});

test("tournament principal changes clear old lists before restarting", () => {
  const calls = [];
  globalThis.getApp = () => ({ globalData: { entryId: 456 } });
  const context = {
    data: {
      ...tournamentPage.data,
      entryId: 123,
      hasData: true,
      tournaments: [{ id: "old", name: "Old" }],
      selectedTournament: { id: "old", name: "Old" },
      displayedRows: [{ entry: 123 }],
      compareOpen: true,
      filterSheetOpen: true,
      shareSheetOpen: true,
      shareText: "old share"
    },
    rows: [{ entry: 123 }],
    liveSnapshot: { state: "SETTLED" },
    cachedLiveStoredAt: 1,
    failedEntryCount: 1,
    retainedRowCount: 1,
    rowsRequestId: 4,
    rowsRequest: Promise.resolve(),
    rowsRequestKey: "old:33:",
    liveRefresh: { stop() { calls.push("stop"); } },
    setData(update) { Object.assign(this.data, update); },
    loadTournaments(forceRefresh) { calls.push(`load:${forceRefresh}`); }
  };

  const restarted = tournamentPage.restartForPrincipalChange.call(context, 123);

  assert.equal(restarted, true);
  assert.equal(context.data.entryId, 456);
  assert.deepEqual(context.data.tournaments, []);
  assert.deepEqual(context.rows, []);
  assert.equal(context.data.compareOpen, false);
  assert.equal(context.data.filterSheetOpen, false);
  assert.equal(context.data.shareSheetOpen, false);
  assert.equal(context.rowsRequestId, 5);
  assert.deepEqual(calls, ["stop", "load:true"]);
});

test("renders pending transfers and partial tournament rows honestly", () => {
  const entryTemplate = readFileSync(
    new URL("../miniprogram/pages/live/entry/entry.wxml", import.meta.url),
    "utf8"
  );
  const tournamentTemplate = readFileSync(
    new URL("../miniprogram/pages/live/tournament/tournament.wxml", import.meta.url),
    "utf8"
  );

  assert.match(entryTemplate, /transfersLoading && transfers\.length === 0/);
  assert.match(tournamentTemplate, /errorSuffix/);
  assert.match(tournamentTemplate, /tournamentListError/);
  assert.equal(
    tournamentModule.partialTournamentErrorSuffix(0),
    "未成功加载的球队暂未显示"
  );
  assert.equal(
    tournamentModule.partialTournamentErrorSuffix(1),
    "部分球队显示上次成功结果"
  );
  assert.equal(tournamentPage.data.errorSuffix, "");
  assert.equal(tournamentPage.data.tournamentListError, "");
});

test("tournament applyRows keeps full rows off page data", () => {
  const page = readFileSync(
    new URL("../miniprogram/pages/live/tournament/tournament.ts", import.meta.url),
    "utf8"
  );
  const start = page.indexOf("applyRows(rows: DisplayTournamentRow[]");
  const apply = page.slice(start, page.indexOf("persistSelectedTournament", start));
  assert.match(apply, /this\.rows = rows/);
  assert.match(apply, /this\.ownershipPlayers = ownershipPlayers/);
  assert.match(apply, /rowCount: rows\.length/);
  assert.doesNotMatch(apply, /this\.setData\(\{[\s\S]*\brows:/);
  assert.doesNotMatch(apply, /this\.setData\(\{[\s\S]*ownershipPlayers:/);
});

test("live loaders normalize display state after clearing loading flags", () => {
  for (const loader of [entryPage.loadData, matchPage.loadData, tournamentPage.loadRows]) {
    const body = String(loader).replace(/\s+/g, "");
    const terminalUpdate = body.lastIndexOf("setData({loading:false,refreshing:false})");
    const finalNormalization = body.indexOf("syncDisplayState()", terminalUpdate);
    assert.ok(terminalUpdate >= 0, "the loader clears both loading flags");
    assert.ok(
      finalNormalization > terminalUpdate,
      "each loader must recompute status after its terminal loading update"
    );
  }
});

test("team phase banner never invents settling after a failed snapshot probe", () => {
  assert.equal(teamModule.phaseBannerFromSnapshot(undefined), "");
  assert.equal(teamModule.phaseBannerFromSnapshot("SCHEDULED"), "");
  assert.equal(teamModule.phaseBannerFromSnapshot("LIVE"), "live");
  assert.equal(teamModule.phaseBannerFromSnapshot("SETTLED"), "");
});

test("team phase banner invalidates an in-flight probe when the GW changes", () => {
  const context = {
    ...teamPage,
    data: { ...teamPage.data, event: 10, phaseBanner: "live" },
    phaseBannerRequestId: 4,
    setData(update) {
      Object.assign(this.data, update);
    },
    loadData() {}
  };

  teamPage.onGwChange.call(context, { detail: { value: 9 } });

  assert.equal(context.phaseBannerRequestId, 5);
  assert.equal(context.data.event, 9);
  assert.equal(context.data.phaseBanner, "");
});

test("team resume advances a current selection to the new gameweek", async () => {
  const calls = [];
  globalThis.getApp = () => ({
    globalData: { entryId: 123, gw: 34, season: "2025-26" },
    initAppData: async (forceRefresh) => { calls.push(`init:${forceRefresh}`); }
  });
  const context = {
    ...teamPage,
    data: { ...teamPage.data, entryId: 123, event: 33, maxGw: 33, hasTeamData: true },
    hasShown: true,
    loadedSeason: "2025-26",
    _loadedAt: Date.now(),
    phaseBannerRequestId: 0,
    ensureContext(reason) {
      calls.push(`context:${reason}`);
      return Promise.resolve({});
    },
    setData(update) { Object.assign(this.data, update); },
    loadData(forceRefresh) {
      calls.push(`load:${forceRefresh}`);
      return Promise.resolve();
    }
  };

  await teamPage.onShow.call(context);

  assert.equal(context.data.event, 34);
  assert.equal(context.data.maxGw, 34);
  assert.equal(context.data.hasTeamData, false);
  assert.deepEqual(calls, ["context:page-show", "load:true"]);
});

test("team first load honors deadline-derived event context freshness", async () => {
  const calls = [];
  globalThis.getApp = () => ({
    globalData: { gw: 33 },
    initAppData: async (forceRefresh) => { calls.push(forceRefresh); }
  });

  await teamPage.ensureAppDataReady.call({ ...teamPage });

  assert.deepEqual(calls, [false]);
});

test("team season rollover clears retained transfers before reloading", async () => {
  const calls = [];
  globalThis.getApp = () => ({
    globalData: { entryId: 123, gw: 1, season: "2026-27" },
    initAppData: async (forceRefresh) => { calls.push(`init:${forceRefresh}`); }
  });
  const context = {
    ...teamPage,
    data: {
      ...teamPage.data,
      entryId: 123,
      event: 33,
      maxGw: 38,
      transferRows: [{ id: "old-season" }],
      hasTransfers: true,
      hasTeamData: true
    },
    hasShown: true,
    loadedSeason: "2025-26",
    loadedDataSeason: "2025-26",
    ensureContext(reason) {
      calls.push(`context:${reason}`);
      return Promise.resolve({});
    },
    setData(update) { Object.assign(this.data, update); },
    loadData(forceRefresh) {
      calls.push(`load:${forceRefresh}`);
      return Promise.resolve();
    }
  };

  await teamPage.onShow.call(context);

  assert.equal(context.data.event, 1);
  assert.equal(context.data.maxGw, 1);
  assert.deepEqual(context.data.transferRows, []);
  assert.equal(context.data.hasTransfers, false);
  assert.deepEqual(calls, ["context:page-show", "load:true"]);
});

test("team principal changes clear the old view before restarting", () => {
  const calls = [];
  globalThis.getApp = () => ({ globalData: { entryId: 456 } });
  const context = {
    ...teamPage,
    data: {
      ...teamPage.data,
      entryId: 123,
      headerTitle: "Old team",
      squadRows: [{ id: "old" }],
      hasSquad: true,
      hasTeamData: true,
      playerDetailOpen: true,
      playerDetail: { element: 1 }
    },
    loadRequestId: 2,
    phaseBannerRequestId: 3,
    setData(update) { Object.assign(this.data, update); },
    loadData(forceRefresh) { calls.push(`load:${forceRefresh}`); }
  };

  const restarted = teamPage.restartForPrincipalChange.call(context, 123);

  assert.equal(restarted, true);
  assert.equal(context.data.entryId, 456);
  assert.equal(context.data.hasTeamData, false);
  assert.deepEqual(context.data.squadRows, []);
  assert.equal(context.data.playerDetailOpen, false);
  assert.equal(context.data.playerDetail, null);
  assert.equal(context.loadRequestId, 3);
  assert.deepEqual(calls, ["load:true"]);
});

test("team transfer refresh failures retain last-good detail rows", () => {
  const previous = [{ id: "gw-4", gameweek: "GW4" }];
  const freshFallback = [{ id: "gw-4", gameweek: "GW4", emptyText: "暂无转会详情" }];

  assert.equal(
    teamModule.retainTransferRowsAfterFailure(freshFallback, previous, true, true),
    previous
  );
  assert.equal(
    teamModule.retainTransferRowsAfterFailure(freshFallback, previous, false, true),
    freshFallback
  );
  assert.equal(
    teamModule.retainTransferRowsAfterFailure(freshFallback, previous, true, false),
    freshFallback,
    "last season's transfer rows are never retained"
  );
});
