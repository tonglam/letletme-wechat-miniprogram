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

test("an overlapping manual refresh awaits its independent transfer refresh", async () => {
  let resolveScore;
  let resolveTransfers;
  const scoreRequest = new Promise((resolve) => {
    resolveScore = resolve;
  });
  const transfersRequest = new Promise((resolve) => {
    resolveTransfers = resolve;
  });
  const transferCalls = [];
  const context = {
    data: { entryId: 123, event: 33 },
    liveRequest: scoreRequest,
    liveRequestKey: "123:33",
    loadTransfers(entryId, eventId, forceRefresh) {
      transferCalls.push([entryId, eventId, forceRefresh]);
      return transfersRequest;
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

  assert.deepEqual(transferCalls, [[123, 33, true]]);
  resolveScore();
  await Promise.resolve();
  assert.equal(settled, false, "the pull refresh must remain active for transfers");
  resolveTransfers();
  await result;
  assert.equal(settled, true);
});

test("match cold start waits for the current event before arming recovery", async () => {
  const calls = [];
  let resolveAppData;
  const app = {
    globalData: { gw: 0 },
    initAppData() {
      calls.push("init");
      return new Promise((resolve) => {
        resolveAppData = resolve;
      });
    }
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
    syncDisplayState() {},
    loadData() {
      calls.push(`load:${this.currentEventId}`);
      return Promise.resolve();
    }
  };

  const loading = matchPage.onLoad.call(context);
  assert.deepEqual(calls, ["loading", "init"]);
  app.globalData.gw = 33;
  resolveAppData();
  await loading;

  assert.equal(context.currentEventId, 33);
  assert.deepEqual(calls, ["loading", "init", "sync:33", "load:33"]);
});

test("match status changes re-arm polling before the first request", () => {
  const calls = [];
  globalThis.wx = {
    setStorageSync(_key, value) {
      calls.push(`store:${value}`);
    }
  };
  const context = {
    data: { ...matchPage.data, status: "finished" },
    liveSnapshot: { state: "SETTLED" },
    cachedLiveStoredAt: 1,
    liveRefresh: null,
    setData(update) {
      Object.assign(this.data, update);
      if (update.status !== undefined) {
        calls.push(`set:${this.data.status}`);
      }
    },
    loadData() {
      calls.push(`load:${this.data.status}`);
      return Promise.resolve();
    }
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

  assert.equal(context.liveSnapshot, null);
  assert.deepEqual(calls, [
    "store:playing",
    "stop",
    "set:playing",
    "sync:playing",
    "load:playing"
  ]);
});

test("entry resume revalidates current-gameweek transfers independently", () => {
  const calls = [];
  globalThis.getApp = () => ({ globalData: { gw: 33 } });
  const context = {
    data: { ...entryPage.data, entryId: 123, event: 33 },
    pageVisible: false,
    hasShown: true,
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
    loadTransfers(entryId, eventId, forceRefresh) {
      calls.push(`transfers:${entryId}:${eventId}:${forceRefresh}`);
      return Promise.resolve();
    }
  };

  entryPage.onShow.call(context);

  assert.deepEqual(calls, ["sync", "transfers:123:33:false"]);
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
