import assert from "node:assert/strict";
import test from "node:test";

import {
  clearSessionCredentials,
  restoreApiSessionCredentials,
} from "../miniprogram/services/auth.service.ts";
import {
  clearGraphQLMemoryCache,
  graphqlRead,
} from "../miniprogram/services/graphql.service.ts";
import {
  getPriceChangeBoard,
  getPriceChangePersonalContext,
  PRICE_CHANGE_PERSONAL_QUERY,
} from "../miniprogram/services/price-change.service.ts";
import { storageKeys } from "../miniprogram/config/storage-keys.ts";
import { setKnownNetworkStatusForTest } from "../miniprogram/utils/network-status.ts";

function installWx(storage, handleRequest) {
  globalThis.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    canIUse: () => false,
    getNetworkType: ({ success, complete }) => {
      success?.({ networkType: "wifi" });
      complete?.();
    },
    onNetworkStatusChange: () => undefined,
    request: (options) => handleRequest(options),
    showToast: () => undefined,
  };
  globalThis.getApp = () => ({ globalData: {} });
}

test("price board falls back to its 24-hour last-good snapshot when GraphQL throws", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const now = Date.now();
  const board = {
    status: "READY",
    source: "FPL_BOOTSTRAP",
    deadline: null,
    nextDeadlines: [],
    fetchedAt: new Date(now - 60_000).toISOString(),
    staleAt: null,
    revision: "last-good-test",
    expectedPlayerCount: 1,
    observedPlayerCount: 1,
    players: [{ playerId: 1 }],
  };
  const storage = new Map([
    [storageKeys.lastPriceChangeBoard, { savedAt: now - 60_000, board }],
  ]);

  try {
    installWx(storage, ({ fail }) => fail({ errMsg: "request:fail offline" }));
    setKnownNetworkStatusForTest(true);
    clearGraphQLMemoryCache();

    const result = await getPriceChangeBoard(true);

    assert.equal(result.usedLastGood, true);
    assert.equal(result.cacheStale, true);
    assert.equal(result.board.status, "STALE");
    assert.equal(result.board.revision, "last-good-test");
  } finally {
    clearGraphQLMemoryCache();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("partial price boards remain partial and never replace the complete last-good snapshot", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const now = Date.now();
  const completeBoard = {
    status: "READY",
    source: "FPL_BOOTSTRAP",
    deadline: null,
    nextDeadlines: [],
    fetchedAt: new Date(now - 60_000).toISOString(),
    staleAt: null,
    revision: "complete-last-good",
    expectedPlayerCount: 2,
    observedPlayerCount: 2,
    players: [{ playerId: 1 }, { playerId: 2 }],
  };
  const partialBoard = {
    ...completeBoard,
    status: "PARTIAL",
    fetchedAt: new Date(now).toISOString(),
    revision: "partial-current",
    observedPlayerCount: 1,
    players: [{ playerId: 1 }],
  };
  const storage = new Map([
    [storageKeys.lastPriceChangeBoard, { savedAt: now - 60_000, board: completeBoard }],
  ]);
  let shouldFail = false;

  try {
    installWx(storage, (options) => {
      if (shouldFail) {
        options.fail({ errMsg: "request:fail offline" });
        return;
      }
      options.success({
        statusCode: 200,
        data: { data: { priceChangeBoard: partialBoard } },
        header: {},
      });
    });
    setKnownNetworkStatusForTest(true);
    clearGraphQLMemoryCache();

    const result = await getPriceChangeBoard(true);

    assert.equal(result.usedLastGood, false);
    assert.equal(result.board.status, "PARTIAL");
    assert.equal(result.board.revision, "partial-current");
    assert.equal(storage.get(storageKeys.lastPriceChangeBoard).board.revision, "complete-last-good");

    shouldFail = true;
    const staleResult = await getPriceChangeBoard(true);

    assert.equal(staleResult.cacheStale, true);
    assert.equal(staleResult.board.status, "PARTIAL");
    assert.equal(staleResult.board.revision, "partial-current");
  } finally {
    clearGraphQLMemoryCache();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("personal prices reject a stale verified-account reporting snapshot", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map();
  let shouldFail = false;
  let requests = 0;

  try {
    installWx(storage, (options) => {
      requests += 1;
      if (shouldFail) {
        options.fail({ errMsg: "request:fail offline" });
        return;
      }
      options.success({
        statusCode: 200,
        data: {
          data: {
            myFplTeamGameweek: {
              state: "READY",
              result: { picks: [{ element: 1, webName: "Old pick" }] },
            },
            myFplTeamDesk: { state: "READY", history: [] },
            myFplTeamTransfers: { state: "READY", gameweeks: [] },
          },
        },
        header: {},
      });
    });
    clearSessionCredentials();
    storage.set(storageKeys.apiSessionToken, "price-session-token");
    storage.set(storageKeys.apiSessionExpiresAt, "2099-01-01T00:00:00.000Z");
    storage.set(storageKeys.apiProfileFplEntryId, 6953);
    await restoreApiSessionCredentials();
    setKnownNetworkStatusForTest(true);
    clearGraphQLMemoryCache();

    await graphqlRead(
      PRICE_CHANGE_PERSONAL_QUERY,
      { eventId: 1 },
      {
        authMode: "session",
        cachePolicy: "reporting",
        season: "2627",
        cacheVariant: "price-change-personal:entry:6953:event:1",
        forceRefresh: true,
      },
    );
    shouldFail = true;

    const result = await getPriceChangePersonalContext({
      eventId: 1,
      season: "2627",
      entryId: 6953,
      players: [],
      forceRefresh: true,
    });

    assert.equal(requests, 2);
    assert.deepEqual(result, {
      squadState: "unavailable",
      squadElementIds: [],
      purchasePrices: {},
      personalPriceState: "UNAVAILABLE",
    });
  } finally {
    clearSessionCredentials();
    clearGraphQLMemoryCache();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("current Free Hit picks never trigger or receive permanent start prices", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map();
  let requests = 0;

  try {
    installWx(storage, (options) => {
      requests += 1;
      options.success({
        statusCode: 200,
        data: {
          data: {
            myFplTeamGameweek: {
              state: "READY",
              result: { picks: [{ element: 1, webName: "Temporary pick" }] },
            },
            myFplTeamDesk: {
              state: "READY",
              history: [{ eventId: 1, eventChip: "FH" }],
            },
            myFplTeamTransfers: { state: "READY", gameweeks: [] },
          },
        },
        header: {},
      });
    });
    clearSessionCredentials();
    storage.set(storageKeys.apiSessionToken, "free-hit-session-token");
    storage.set(storageKeys.apiSessionExpiresAt, "2099-01-01T00:00:00.000Z");
    storage.set(storageKeys.apiProfileFplEntryId, 6953);
    await restoreApiSessionCredentials();
    setKnownNetworkStatusForTest(true);
    clearGraphQLMemoryCache();

    const result = await getPriceChangePersonalContext({
      eventId: 1,
      season: "2627",
      entryId: 6953,
      players: [],
      forceRefresh: true,
    });

    assert.equal(requests, 1, "Free Hit detection must skip start-price requests");
    assert.deepEqual(result, {
      squadState: "ready",
      squadElementIds: [1],
      purchasePrices: {},
      personalPriceState: "UNAVAILABLE",
    });
  } finally {
    clearSessionCredentials();
    clearGraphQLMemoryCache();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("personal prices stay unavailable when chip history is not authoritative", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map();
  let requests = 0;

  try {
    installWx(storage, (options) => {
      requests += 1;
      options.success({
        statusCode: 200,
        data: {
          data: {
            myFplTeamGameweek: {
              state: "READY",
              result: { picks: [{ element: 1, webName: "Unknown chip pick" }] },
            },
            myFplTeamDesk: { state: "PENDING", history: [] },
            myFplTeamTransfers: { state: "READY", gameweeks: [] },
          },
        },
        header: {},
      });
    });
    clearSessionCredentials();
    storage.set(storageKeys.apiSessionToken, "missing-history-session-token");
    storage.set(storageKeys.apiSessionExpiresAt, "2099-01-01T00:00:00.000Z");
    storage.set(storageKeys.apiProfileFplEntryId, 6953);
    await restoreApiSessionCredentials();
    setKnownNetworkStatusForTest(true);
    clearGraphQLMemoryCache();

    const result = await getPriceChangePersonalContext({
      eventId: 1,
      season: "2627",
      entryId: 6953,
      players: [],
      forceRefresh: true,
    });

    assert.equal(requests, 1, "missing chip history must skip start-price requests");
    assert.deepEqual(result, {
      squadState: "ready",
      squadElementIds: [1],
      purchasePrices: {},
      personalPriceState: "UNAVAILABLE",
    });
  } finally {
    clearSessionCredentials();
    clearGraphQLMemoryCache();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});
