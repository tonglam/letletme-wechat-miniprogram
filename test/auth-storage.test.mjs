import assert from "node:assert/strict";
import test from "node:test";

import {
  clearApiSession,
  logoutMiniProgramSession
} from "../miniprogram/services/auth.service.ts";

test("sign-out clears account caches without deleting public GraphQL data", () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const removed = [];
  const globalData = { entryId: 123 };

  try {
    globalThis.wx = {
      getStorageInfoSync: () => ({
        keys: ["gql:public:shared", "gql:session:private", "gql:legacy"]
      }),
      removeStorageSync: (key) => removed.push(key)
    };
    globalThis.getApp = () => ({ globalData });

    clearApiSession();

    assert.equal(removed.includes("gql:public:shared"), false);
    assert.equal(removed.includes("gql:session:private"), true);
    assert.equal(removed.includes("gql:legacy"), true);
    assert.equal(removed.includes("api-session-token"), true);
    assert.equal(removed.includes("api-session-expires-at"), true);
    assert.equal(removed.includes("entry"), true);
    assert.equal(removed.includes("data-selections-tournamentId"), true);
    assert.equal(globalData.entryId, undefined);
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("remote sign-out failure retains the credential so revocation can be retried", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const removed = [];

  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
      getStorageSync: (key) => {
        if (key === "api-session-token") return "token";
        if (key === "api-session-expires-at") return "2099-01-01T00:00:00.000Z";
        return undefined;
      },
      removeStorageSync: (key) => removed.push(key),
      request: ({ fail }) => fail({ errMsg: "offline" })
    };
    globalThis.getApp = () => ({ globalData: { entryId: 123 } });

    await assert.rejects(logoutMiniProgramSession(), /网络连接失败/);
    assert.deepEqual(removed, []);
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});
