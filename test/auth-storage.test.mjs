import assert from "node:assert/strict";
import test from "node:test";

import {
  clearApiSession,
  clearSessionCredentials,
  getApiSessionToken,
  getLinkedAccountSnapshot,
  logoutMiniProgramSession,
  restoreApiSessionCredentials
} from "../miniprogram/services/auth.service.ts";

test("sign-out clears account caches without deleting public GraphQL data", () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const removed = [];
  const globalData = { entryId: 123 };

  try {
    globalThis.wx = {
      getStorageInfoSync: () => ({
        keys: ["gql:v2:public:shared", "gql:v2:session:private", "gql:legacy"]
      }),
      removeStorageSync: (key) => removed.push(key)
    };
    globalThis.getApp = () => ({ globalData });

    clearApiSession();

    assert.equal(removed.includes("gql:v2:public:shared"), false);
    assert.equal(removed.includes("gql:v2:session:private"), true);
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

test("remote sign-out failure still clears local credentials", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const removed = [];

  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
      getStorageSync: (key) => {
        if (key === "api-session-expires-at") return "2099-01-01T00:00:00.000Z";
        return undefined;
      },
      canIUse: () => true,
      getStorage: ({ success }) => success({ data: "token", errMsg: "getStorage:ok" }),
      removeStorageSync: (key) => removed.push(key),
      request: ({ fail }) => fail({ errMsg: "offline" })
    };
    globalThis.getApp = () => ({ globalData: { entryId: 123 } });

    await restoreApiSessionCredentials();
    const result = await logoutMiniProgramSession();
    assert.deepEqual(result, { localCleared: true, remoteRevoked: false });
    assert.equal(getApiSessionToken(), null);
    assert.ok(removed.includes("api-session-token"));
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("legacy plaintext session tokens migrate to encrypted storage", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const removed = [];
  let encryptedWrite;

  try {
    globalThis.wx = {
      getStorageInfoSync: () => ({ keys: [] }),
      getStorageSync: (key) => {
        if (key === "api-session-token") return "legacy-token";
        if (key === "api-session-expires-at") return "2099-01-01T00:00:00.000Z";
        return undefined;
      },
      canIUse: () => true,
      getStorage: ({ fail }) => fail({ errMsg: "getStorage:fail data is not encrypted" }),
      setStorage: (options) => {
        encryptedWrite = options;
        options.success();
      },
      removeStorageSync: (key) => removed.push(key)
    };
    globalThis.getApp = () => ({ globalData: {} });

    await restoreApiSessionCredentials();

    assert.equal(getApiSessionToken(), "legacy-token");
    assert.equal(encryptedWrite.key, "api-session-token");
    assert.equal(encryptedWrite.encrypt, true);
    assert.equal(encryptedWrite.data, "legacy-token");
    assert.equal(removed.includes("api-session-token"), true);
    clearSessionCredentials();
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("linked snapshot surfaces stored display email until credentials clear", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const removed = [];

  try {
    globalThis.wx = {
      getStorageInfoSync: () => ({ keys: [] }),
      getStorageSync: (key) => {
        if (key === "api-session-expires-at") return "2099-01-01T00:00:00.000Z";
        if (key === "api-profile-email") return "fpl@example.com";
        return undefined;
      },
      canIUse: () => true,
      getStorage: ({ success }) => success({ data: "token", errMsg: "getStorage:ok" }),
      removeStorageSync: (key) => removed.push(key)
    };
    globalThis.getApp = () => ({ globalData: {} });

    await restoreApiSessionCredentials();
    assert.deepEqual(getLinkedAccountSnapshot(), {
      linked: true,
      email: "fpl@example.com"
    });
    clearSessionCredentials();
    assert.deepEqual(getLinkedAccountSnapshot(), { linked: false, email: "" });
    assert.equal(removed.includes("api-profile-email"), true);
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});
