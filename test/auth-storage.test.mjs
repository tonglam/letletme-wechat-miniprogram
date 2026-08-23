import assert from "node:assert/strict";
import test from "node:test";

import {
  clearApiSession,
  clearSessionCredentials,
  confirmMiniProgramEmailLink,
  getApiSessionToken,
  getVerifiedSessionEntryId,
  hasStoredSessionProfileBinding,
  getLinkedAccountSnapshot,
  logoutMiniProgramSession,
  refreshWechatApiSession,
  restoreApiSessionCredentials
} from "../miniprogram/services/auth.service.ts";
import { currentMyFplEntryId } from "../miniprogram/utils/follow.ts";

test("verified session identity stays separate from a later local follow", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map([["entry", 8743559]]);
  const globalData = { entryId: 8743559 };
  let loginSuccess;
  let loginRequest;

  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }),
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      canIUse: () => false,
      login: ({ success }) => {
        loginSuccess = success;
      },
      request: (options) => {
        loginRequest = options;
      }
    };
    globalThis.getApp = () => ({ globalData });
    clearSessionCredentials();

    const refresh = refreshWechatApiSession();
    loginSuccess({ code: "verified-entry-code" });
    await new Promise((resolve) => setImmediate(resolve));
    loginRequest.success({
      statusCode: 200,
      data: {
        success: true,
        linked: true,
        token: "verified-entry-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          id: "profile",
          name: null,
          email: null,
          fplEntryId: 6953,
          fplEntryVerifiedAt: "2026-08-23T00:00:00.000Z",
          wechatLinked: true
        }
      }
    });
    await refresh;

    storage.set("entry", 8743559);
    globalData.entryId = 8743559;
    assert.equal(hasStoredSessionProfileBinding(), true);
    assert.equal(getVerifiedSessionEntryId(), 6953);
    assert.equal(currentMyFplEntryId(), 6953);

    storage.set("api-profile-fpl-entry-id", 0);
    assert.equal(
      currentMyFplEntryId(),
      undefined,
      "an account with no verified FPL entry must not inherit the local follow",
    );
  } finally {
    clearSessionCredentials();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

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
  let requestCount = 0;

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
      request: ({ fail, success }) => {
        requestCount += 1;
        if (requestCount === 1) {
          fail({ errMsg: "offline" });
          return;
        }
        success({ statusCode: 204, data: { success: true } });
      }
    };
    globalThis.getApp = () => ({ globalData: { entryId: 123 } });

    await restoreApiSessionCredentials();
    const result = await logoutMiniProgramSession();
    assert.deepEqual(result, { localCleared: true, remoteRevoked: false });
    assert.equal(getApiSessionToken(), null);
    assert.ok(removed.includes("api-session-token"));
    assert.deepEqual(await logoutMiniProgramSession(), { localCleared: true, remoteRevoked: true });
    assert.equal(requestCount, 2);
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("logout revokes a credential issued by an in-flight refresh", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const revoked = [];
  let loginSuccess;
  let loginRequest;

  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }),
      getStorageInfoSync: () => ({ keys: [] }),
      getStorageSync: () => undefined,
      setStorageSync: () => undefined,
      removeStorageSync: () => undefined,
      canIUse: () => false,
      login: (options) => {
        loginSuccess = options.success;
      },
      request: (options) => {
        if (options.method === "POST") {
          loginRequest = options;
          return;
        }
        revoked.push(options.header.Authorization);
        options.success({ statusCode: 204, data: { success: true } });
      }
    };
    globalThis.getApp = () => ({ globalData: {} });

    const refresh = refreshWechatApiSession();
    loginSuccess({ code: "wechat-code" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(loginRequest);

    const logout = logoutMiniProgramSession();
    loginRequest.success({
      statusCode: 200,
      data: {
        success: true,
        linked: true,
        token: "issued-during-logout",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          id: "profile",
          name: null,
          email: null,
          fplEntryId: null,
          fplEntryVerifiedAt: null,
          wechatLinked: true
        }
      }
    });

    assert.deepEqual(await logout, { localCleared: true, remoteRevoked: true });
    assert.deepEqual(revoked, ["Bearer issued-during-logout"]);
    await assert.rejects(refresh, /登录状态已变更/);
    assert.equal(getApiSessionToken(), null);
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("logout revokes a displaced refresh credential when email confirmation fails", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const revoked = [];
  const loginCallbacks = [];
  let loginRequest;
  let emailRequest;

  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }),
      getStorageInfoSync: () => ({ keys: [] }),
      getStorageSync: () => undefined,
      setStorageSync: () => undefined,
      removeStorageSync: () => undefined,
      canIUse: () => false,
      login: (options) => loginCallbacks.push(options.success),
      request: (options) => {
        if (options.method === "POST") {
          if (options.url.endsWith("/wechat/login")) loginRequest = options;
          else emailRequest = options;
          return;
        }
        revoked.push(options.header.Authorization);
        options.success({ statusCode: 204, data: { success: true } });
      }
    };
    globalThis.getApp = () => ({ globalData: {} });
    clearSessionCredentials();

    const refresh = refreshWechatApiSession();
    loginCallbacks.shift()({ code: "old-code" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(loginRequest);

    const confirm = confirmMiniProgramEmailLink("fpl@example.com", "123456");
    const logout = logoutMiniProgramSession();

    loginRequest.success({
      statusCode: 200,
      data: {
        success: true,
        linked: true,
        token: "rotated-before-confirm-failure",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          id: "profile",
          name: null,
          email: null,
          fplEntryId: null,
          fplEntryVerifiedAt: null,
          wechatLinked: true
        }
      }
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(loginCallbacks.length, 1);

    loginCallbacks.shift()({ code: "confirm-code" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(emailRequest);
    emailRequest.success({
      statusCode: 500,
      data: { success: false, error: "confirmation failed" }
    });

    await assert.rejects(confirm);
    assert.deepEqual(await logout, { localCleared: true, remoteRevoked: true });
    assert.deepEqual(revoked, ["Bearer rotated-before-confirm-failure"]);
    await assert.rejects(refresh, /登录状态已变更/);
    assert.equal(getApiSessionToken(), null);
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("duplicate email confirmations share the first in-flight request", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const loginCallbacks = [];
  let emailRequest;

  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }),
      getStorageInfoSync: () => ({ keys: [] }),
      getStorageSync: () => undefined,
      setStorageSync: () => undefined,
      removeStorageSync: () => undefined,
      canIUse: () => false,
      login: (options) => loginCallbacks.push(options.success),
      request: (options) => {
        emailRequest = options;
      }
    };
    globalThis.getApp = () => ({ globalData: {} });
    clearSessionCredentials();

    const first = confirmMiniProgramEmailLink("fpl@example.com", "123456");
    const duplicate = confirmMiniProgramEmailLink("other@example.com", "654321");
    assert.strictEqual(duplicate, first);
    assert.equal(loginCallbacks.length, 1);

    loginCallbacks.shift()({ code: "confirm-code" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(emailRequest);
    emailRequest.success({
      statusCode: 200,
      data: {
        success: true,
        token: "confirmed-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          id: "profile",
          name: null,
          email: "fpl@example.com",
          fplEntryId: null,
          fplEntryVerifiedAt: null,
          wechatLinked: true
        }
      }
    });

    await first;
    await duplicate;
    assert.equal(getApiSessionToken(), "confirmed-token");
    clearSessionCredentials();
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("email confirmation is rejected while logout is in flight", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const loginCallbacks = [];
  let deleteRequest;

  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }),
      getStorageInfoSync: () => ({ keys: [] }),
      getStorageSync: (key) => key === "api-session-token"
        ? "token-before-confirm"
        : key === "api-session-expires-at"
          ? "2099-01-01T00:00:00.000Z"
          : undefined,
      setStorageSync: () => undefined,
      removeStorageSync: () => undefined,
      canIUse: () => false,
      login: (options) => loginCallbacks.push(options.success),
      request: (options) => {
        if (options.method === "DELETE") deleteRequest = options;
      }
    };
    globalThis.getApp = () => ({ globalData: {} });
    clearSessionCredentials();
    await restoreApiSessionCredentials();

    const logout = logoutMiniProgramSession();
    await assert.rejects(
      confirmMiniProgramEmailLink("fpl@example.com", "123456"),
      /正在退出登录/
    );
    assert.equal(loginCallbacks.length, 0);
    assert.ok(deleteRequest);

    deleteRequest.success({ statusCode: 204, data: { success: true } });
    assert.deepEqual(await logout, { localCleared: true, remoteRevoked: true });
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
