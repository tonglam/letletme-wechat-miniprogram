import assert from "node:assert/strict";
import test from "node:test";

let networkRequests = 0;
let networkTypeCalls = 0;
globalThis.getApp = () => ({ globalData: { season: "2025-26", contextRevision: 1 } });
globalThis.wx = {
  getStorageSync: () => undefined,
  setStorageSync: () => undefined,
  removeStorageSync: () => undefined,
  getStorageInfoSync: () => ({ keys: [] }),
  setStorage: ({ success }) => success?.({}),
  onNetworkStatusChange: () => undefined,
  getNetworkType: ({ success, complete }) => {
    networkTypeCalls += 1;
    setTimeout(() => {
      success?.({ networkType: "none" });
      complete?.({ networkType: "none" });
    }, 20);
  },
  request: () => {
    networkRequests += 1;
  }
};

const { graphqlRead } = await import("../miniprogram/services/graphql.service.ts");

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
