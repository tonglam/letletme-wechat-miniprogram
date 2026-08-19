import assert from "node:assert/strict";
import test from "node:test";

let networkRequests = 0;
let networkTypeCalls = 0;
let networkStatusListener;
let requestHandler = () => undefined;
let staleToastCalls = 0;
globalThis.getApp = () => ({ globalData: { season: "2025-26", contextRevision: 1 } });
globalThis.wx = {
  getStorageSync: () => undefined,
  setStorageSync: () => undefined,
  removeStorageSync: () => undefined,
  getStorageInfoSync: () => ({ keys: [] }),
  setStorage: ({ success }) => success?.({}),
  onNetworkStatusChange: (listener) => {
    networkStatusListener = listener;
  },
  getNetworkType: ({ success, complete }) => {
    networkTypeCalls += 1;
    setTimeout(() => {
      success?.({ networkType: "none" });
      complete?.({ networkType: "none" });
    }, 20);
  },
  showToast: () => {
    staleToastCalls += 1;
  },
  request: (options) => {
    networkRequests += 1;
    requestHandler(options);
  }
};

const { graphqlRead } = await import("../miniprogram/services/graphql.service.ts");
const {
  initializeNetworkStatus,
  setKnownNetworkStatusForTest
} = await import("../miniprogram/utils/network-status.ts");

test("cold offline GraphQL read awaits one initial probe and never starts transport", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    graphqlRead("query ColdOfflineProbe { value }", {}, {
      authMode: "public",
      cachePolicy: "reporting"
    }),
    /离线/
  );
  assert.equal(networkTypeCalls, 1);
  assert.equal(networkRequests, 0);
  assert.ok(Date.now() - startedAt < 300, "offline fast-fail exceeded 300ms");
});

test("offline stale fast path returns cached data without a global toast", async () => {
  assert.equal(typeof networkStatusListener, "function");
  networkStatusListener({ isConnected: true, networkType: "wifi" });
  requestHandler = (options) => options.success({
    statusCode: 200,
    data: { data: { value: 1 } },
    header: {}
  });

  const realDateNow = Date.now;
  let now = realDateNow();
  Date.now = () => now;
  try {
    const query = "query OfflineStaleCandidate { value }";
    const seeded = await graphqlRead(query, {}, {
      authMode: "public",
      cachePolicy: "reporting"
    });
    assert.equal(seeded.meta.source, "network");
    const requestsAfterSeed = networkRequests;

    now += 5 * 60 * 1000 + 1;
    networkStatusListener({ isConnected: false, networkType: "none" });
    const stale = await graphqlRead(query, {}, {
      authMode: "public",
      cachePolicy: "reporting"
    });

    assert.equal(stale.meta.source, "stale");
    assert.equal(stale.meta.stale, true);
    assert.equal(networkRequests, requestsAfterSeed);
    assert.equal(staleToastCalls, 0);
  } finally {
    Date.now = realDateNow;
  }
});

test("listenerless clients periodically re-probe after an offline launch", async () => {
  const callsBefore = networkTypeCalls;
  setKnownNetworkStatusForTest(false, {
    listenerInstalled: false,
    lastProbeAt: 0
  });
  await initializeNetworkStatus();
  assert.equal(networkTypeCalls, callsBefore + 1);
});
