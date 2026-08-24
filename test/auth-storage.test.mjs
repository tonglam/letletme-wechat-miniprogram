import assert from "node:assert/strict";
import test from "node:test";

import {
  clearApiSession,
  clearSessionCredentials,
  confirmMiniProgramEmailLink,
  ensureMiniProgramAccountFresh,
  getApiSessionToken,
  getLinkedAccountSnapshot,
  getStoredMiniProgramProfile,
  isMiniProgramProfileFresh,
  logoutMiniProgramSession,
  refreshWechatApiSession,
  restoreApiSessionCredentials,
  saveMiniProgramFollowEntry,
  synchronizeMiniProgramAccount,
  unlinkMiniProgramWebAccount,
} from "../miniprogram/services/auth.service.ts";
import {
  currentMyFplEntryId,
  waitForAuthoritativeFollow,
} from "../miniprogram/utils/follow.ts";

test("standalone viewer entry stays separate from optional Web ownership", async () => {
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
      },
    };
    globalThis.getApp = () => ({ globalData });
    clearSessionCredentials();

    const refresh = refreshWechatApiSession();
    loginSuccess({ code: "verified-entry-code" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(loginRequest.data.contractVersion, 2);
    loginRequest.success({
      statusCode: 200,
      data: {
        success: true,
        contractVersion: 2,
        authenticated: true,
        webAccountLinked: true,
        token: "verified-entry-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          id: "profile",
          name: null,
          email: null,
          webAccountLinked: true,
          followEntryId: 8743559,
          webVerifiedEntryId: 6953,
          effectiveEntryId: 8743559,
          effectiveEntrySource: "MINI",
          entryConflict: true,
          fplEntryId: 6953,
          fplEntryVerifiedAt: "2026-08-23T00:00:00.000Z",
          wechatLinked: true,
        },
      },
    });
    await refresh;

    assert.equal(getStoredMiniProgramProfile()?.webVerifiedEntryId, 6953);
    assert.equal(currentMyFplEntryId(), 8743559);

    storage.set("gql:v2:session:private", { entryId: 6953 });
    storage.set("gql:v2:public:shared", { public: true });
    const rebind = refreshWechatApiSession();
    loginSuccess({ code: "same-token-rebind-code" });
    await new Promise((resolve) => setImmediate(resolve));
    loginRequest.success({
      statusCode: 200,
      data: {
        success: true,
        contractVersion: 2,
        authenticated: true,
        webAccountLinked: true,
        token: "verified-entry-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          id: "profile",
          name: null,
          email: null,
          webAccountLinked: true,
          followEntryId: 8743559,
          webVerifiedEntryId: 7001,
          effectiveEntryId: 8743559,
          effectiveEntrySource: "MINI",
          entryConflict: true,
          fplEntryId: 7001,
          fplEntryVerifiedAt: "2026-08-23T01:00:00.000Z",
          wechatLinked: true,
        },
      },
    });
    await rebind;
    assert.equal(getStoredMiniProgramProfile()?.webVerifiedEntryId, 7001);
    assert.equal(currentMyFplEntryId(), 8743559);
    assert.equal(storage.has("gql:v2:session:private"), false);
    assert.equal(storage.has("gql:v2:public:shared"), true);

    storage.set("api-profile-fpl-entry-id", 0);
    assert.equal(
      currentMyFplEntryId(),
      8743559,
      "viewer reads do not depend on the optional Web ownership binding",
    );
  } finally {
    clearSessionCredentials();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("standalone account migrates, replays, and preserves its team across Web unlink", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map([["entry", 8743559]]);
  const globalData = { entryId: 8743559 };
  let loginSuccess;
  let loginRequest;
  let serverFollowEntryId = null;
  let webAccountLinked = false;
  let failNextFollowWrite = false;
  let deferProfile = false;
  let deferredProfileRequest;

  const profile = () => ({
    id: "mini-account",
    name: webAccountLinked ? "Web user" : null,
    email: webAccountLinked ? "web@example.com" : null,
    webAccountLinked,
    followEntryId: serverFollowEntryId,
    webVerifiedEntryId: webAccountLinked ? serverFollowEntryId : null,
    effectiveEntryId: serverFollowEntryId,
    effectiveEntrySource: serverFollowEntryId ? "MINI" : null,
    entryConflict: false,
    fplEntryId: webAccountLinked ? serverFollowEntryId : null,
    fplEntryVerifiedAt: webAccountLinked ? "2026-08-24T00:00:00.000Z" : null,
    wechatLinked: true,
  });

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
        if (options.url.endsWith("/wechat/login")) {
          loginRequest = options;
          return;
        }
        assert.equal(options.header.Authorization, "Bearer standalone-token");
        if (options.url.endsWith("/profile")) {
          if (deferProfile) {
            deferredProfileRequest = options;
            return;
          }
          options.success({
            statusCode: 200,
            data: { success: true, profile: profile() },
          });
          return;
        }
        if (options.url.endsWith("/follow-entry") && options.method === "PUT") {
          if (failNextFollowWrite) {
            failNextFollowWrite = false;
            options.fail({ errMsg: "offline" });
            return;
          }
          serverFollowEntryId = options.data.entryId;
          options.success({
            statusCode: 200,
            data: { success: true, profile: profile() },
          });
          return;
        }
        if (
          options.url.endsWith("/account-link") &&
          options.method === "DELETE"
        ) {
          webAccountLinked = false;
          options.success({
            statusCode: 200,
            data: { success: true, profile: profile() },
          });
          return;
        }
        throw new Error(`unexpected request ${options.method} ${options.url}`);
      },
    };
    globalThis.getApp = () => ({ authReady: Promise.resolve(), globalData });
    clearSessionCredentials();

    const refresh = refreshWechatApiSession();
    loginSuccess({ code: "standalone-code" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(loginRequest.data.contractVersion, 2);
    loginRequest.success({
      statusCode: 200,
      data: {
        success: true,
        contractVersion: 2,
        authenticated: true,
        webAccountLinked: false,
        token: "standalone-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: profile(),
      },
    });
    await refresh;

    await synchronizeMiniProgramAccount();
    assert.equal(
      serverFollowEntryId,
      8743559,
      "legacy local selection is uploaded once",
    );
    assert.equal(currentMyFplEntryId(), 8743559);
    assert.equal(storage.has("pending-follow-entry-v1"), false);
    assert.deepEqual(getLinkedAccountSnapshot(), { linked: false, email: "" });

    storage.set("gql:v2:session:old-follow", { entryId: 8743559 });
    deferProfile = true;
    const staleProfile = profile();
    const staleSync = synchronizeMiniProgramAccount();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(deferredProfileRequest);
    assert.equal(await saveMiniProgramFollowEntry(7001), true);
    assert.equal(storage.has("gql:v2:session:old-follow"), false);
    deferredProfileRequest.success({
      statusCode: 200,
      data: { success: true, profile: staleProfile },
    });
    await staleSync;
    deferProfile = false;
    assert.equal(getStoredMiniProgramProfile()?.followEntryId, 7001);
    assert.equal(currentMyFplEntryId(), 7001);

    failNextFollowWrite = true;
    assert.equal(await saveMiniProgramFollowEntry(7002), false);
    assert.equal(
      currentMyFplEntryId(),
      7002,
      "offline selection applies locally",
    );
    assert.equal(storage.has("pending-follow-entry-v1"), true);
    await ensureMiniProgramAccountFresh();
    assert.equal(
      serverFollowEntryId,
      7002,
      "pending selection replays even while the cached profile is fresh",
    );
    assert.equal(storage.has("pending-follow-entry-v1"), false);

    webAccountLinked = true;
    await synchronizeMiniProgramAccount();
    assert.deepEqual(getLinkedAccountSnapshot(), {
      linked: true,
      email: "web@example.com",
    });
    const tokenBeforeUnlink = getApiSessionToken();
    await unlinkMiniProgramWebAccount();
    assert.equal(
      getApiSessionToken(),
      tokenBeforeUnlink,
      "unlink keeps the Mini session",
    );
    assert.equal(
      currentMyFplEntryId(),
      7002,
      "unlink keeps the Mini viewer team",
    );
    assert.deepEqual(getLinkedAccountSnapshot(), { linked: false, email: "" });
  } finally {
    clearSessionCredentials();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("an exact Mini/Web team conflict prompts once and closes to Mini by default", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map([["entry", 101]]);
  const globalData = { entryId: 101 };
  const choices = [];
  let loginSuccess;
  let loginRequest;
  let serverChoice = null;
  let modalCount = 0;

  const profile = () => ({
    id: "conflict-account",
    email: "web@example.com",
    webAccountLinked: true,
    followEntryId: 101,
    webVerifiedEntryId: 202,
    effectiveEntryId: serverChoice === "WEB" ? 202 : 101,
    effectiveEntrySource: serverChoice === "WEB" ? "WEB" : "MINI",
    entryConflict: serverChoice === null,
    fplEntryId: 202,
    fplEntryVerifiedAt: "2026-08-24T00:00:00.000Z",
    wechatLinked: true,
  });

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
      showModal: ({ success }) => {
        modalCount += 1;
        success({ confirm: false, cancel: true });
      },
      showToast: () => undefined,
      request: (options) => {
        if (options.url.endsWith("/wechat/login")) {
          loginRequest = options;
          return;
        }
        if (options.url.endsWith("/profile")) {
          options.success({
            statusCode: 200,
            data: { success: true, profile: profile() },
          });
          return;
        }
        if (options.url.endsWith("/entry-choice")) {
          choices.push(options.data.choice);
          serverChoice = options.data.choice;
          options.success({
            statusCode: 200,
            data: { success: true, profile: profile() },
          });
          return;
        }
        throw new Error(`unexpected request ${options.method} ${options.url}`);
      },
    };
    globalThis.getApp = () => ({ authReady: Promise.resolve(), globalData });
    clearSessionCredentials();

    const refresh = refreshWechatApiSession();
    loginSuccess({ code: "conflict-code" });
    await new Promise((resolve) => setImmediate(resolve));
    loginRequest.success({
      statusCode: 200,
      data: {
        success: true,
        contractVersion: 2,
        authenticated: true,
        webAccountLinked: true,
        token: "conflict-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: profile(),
      },
    });
    await refresh;
    await synchronizeMiniProgramAccount();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.deepEqual(choices, ["MINI"]);
    assert.equal(modalCount, 1);
    assert.equal(currentMyFplEntryId(), 101);

    await synchronizeMiniProgramAccount();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(
      choices,
      ["MINI"],
      "the resolved pair is not prompted again",
    );
    assert.equal(modalCount, 1);
  } finally {
    clearSessionCredentials();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("an already-resolved app auth gate keeps the standalone viewer entry", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map();
  const globalData = { entryId: 8743559 };

  try {
    globalThis.wx = {
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      canIUse: () => false,
    };
    globalThis.getApp = () => ({
      authReady: Promise.resolve(),
      globalData,
    });
    clearSessionCredentials();
    storage.set("api-session-token", "restored-account-token");
    storage.set("api-session-expires-at", "2099-01-01T00:00:00.000Z");
    storage.set("api-profile-fpl-entry-id", 6953);
    storage.set("entry", 8743559);

    await waitForAuthoritativeFollow();

    assert.equal(getApiSessionToken(), "restored-account-token");
    assert.equal(currentMyFplEntryId(), 8743559);
    assert.equal(
      globalData.entryId,
      8743559,
      "the standalone viewer is unchanged",
    );
  } finally {
    clearSessionCredentials();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("profile freshness gates warm reads and merges concurrent profile sync", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const now = Date.now();
  const storage = new Map([
    ["api-session-token", "freshness-token"],
    ["api-session-expires-at", "2099-01-01T00:00:00.000Z"],
    ["api-profile-v2-initialized", true],
    ["api-profile-checked-at", now - 30_000],
    ["entry", 101],
    [
      "api-profile-v2",
      {
        id: "freshness-profile",
        followEntryId: 101,
        effectiveEntryId: 101,
        effectiveEntrySource: "MINI",
        webVerifiedEntryId: null,
        webAccountLinked: false,
        emailVerified: false,
        entryConflict: false,
        wechatLinked: true,
      },
    ],
  ]);
  const globalData = { entryId: 101 };
  let profileRequests = 0;

  try {
    globalThis.wx = {
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      canIUse: () => false,
      request: (options) => {
        assert.match(options.url, /\/profile$/);
        assert.equal(options.header.Authorization, "Bearer freshness-token");
        profileRequests += 1;
        options.success({
          statusCode: 200,
          data: {
            success: true,
            profile: {
              id: "freshness-profile",
              followEntryId: 202,
              effectiveEntryId: 202,
              effectiveEntrySource: "MINI",
              webVerifiedEntryId: null,
              webAccountLinked: false,
              emailVerified: false,
              entryConflict: false,
              wechatLinked: true,
            },
          },
        });
      },
    };
    globalThis.getApp = () => ({ authReady: Promise.resolve(), globalData });
    clearSessionCredentials();
    storage.set("api-session-token", "freshness-token");
    storage.set("api-session-expires-at", "2099-01-01T00:00:00.000Z");
    storage.set("api-profile-v2-initialized", true);
    storage.set("api-profile-checked-at", now - 30_000);
    storage.set("entry", 101);
    storage.set("api-profile-v2", {
      id: "freshness-profile",
      followEntryId: 101,
      effectiveEntryId: 101,
      effectiveEntrySource: "MINI",
      webVerifiedEntryId: null,
      webAccountLinked: false,
      emailVerified: false,
      entryConflict: false,
      wechatLinked: true,
    });

    await restoreApiSessionCredentials();
    await ensureMiniProgramAccountFresh();
    assert.equal(
      profileRequests,
      0,
      "a checked profile younger than 60 seconds is reused",
    );
    assert.equal(currentMyFplEntryId(), 101);

    storage.set("api-profile-checked-at", now + 30_000);
    assert.equal(
      isMiniProgramProfileFresh(60_000, now),
      false,
      "a profile checked in the future is treated as stale rather than fresh",
    );

    storage.set("api-profile-checked-at", now - 61_000);
    const [first, second] = await Promise.all([
      ensureMiniProgramAccountFresh(),
      ensureMiniProgramAccountFresh(),
    ]);
    assert.equal(
      profileRequests,
      1,
      "concurrent stale reads share one /profile request",
    );
    assert.equal(first?.effectiveEntryId, 202);
    assert.equal(second?.effectiveEntryId, 202);
    assert.equal(currentMyFplEntryId(), 202);
  } finally {
    clearSessionCredentials();
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});

test("profile sync discards a response from a superseded session", async () => {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map([["entry", 101]]);
  const globalData = { entryId: 101 };
  let loginSuccess;
  let loginRequest;
  let emailConfirmRequest;
  let deferredProfileRequest;
  let profileRequestCount = 0;

  const profile = (id, entryId, webAccountLinked = false) => ({
    id,
    email: webAccountLinked ? "b@example.com" : null,
    webAccountLinked,
    followEntryId: entryId,
    webVerifiedEntryId: null,
    effectiveEntryId: entryId,
    effectiveEntrySource: "MINI",
    entryConflict: false,
    fplEntryId: null,
    fplEntryVerifiedAt: null,
    wechatLinked: true,
  });

  try {
    globalThis.wx = {
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      canIUse: () => false,
      login: ({ success }) => {
        loginSuccess = success;
      },
      request: (options) => {
        if (options.url.endsWith("/wechat/login")) {
          loginRequest = options;
          return;
        }
        if (options.url.endsWith("/email/confirm")) {
          emailConfirmRequest = options;
          return;
        }
        if (options.url.endsWith("/profile")) {
          profileRequestCount += 1;
          if (profileRequestCount === 1) {
            deferredProfileRequest = options;
            return;
          }
          options.success({
            statusCode: 200,
            data: {
              success: true,
              profile: profile("account-b", 202, true),
            },
          });
          return;
        }
        throw new Error(`unexpected request ${options.method} ${options.url}`);
      },
    };
    globalThis.getApp = () => ({ authReady: Promise.resolve(), globalData });
    clearSessionCredentials();

    const initialRefresh = refreshWechatApiSession();
    loginSuccess({ code: "session-a-code" });
    await new Promise((resolve) => setImmediate(resolve));
    loginRequest.success({
      statusCode: 200,
      data: {
        success: true,
        contractVersion: 2,
        authenticated: true,
        webAccountLinked: false,
        token: "session-a",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: profile("account-a", 101),
      },
    });
    await initialRefresh;

    const staleSync = synchronizeMiniProgramAccount();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(deferredProfileRequest, "the session-A profile request is pending");

    const confirmation = confirmMiniProgramEmailLink(
      "b@example.com",
      "654321",
    );
    loginSuccess({ code: "session-b-code" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(emailConfirmRequest, "the session-B confirmation request started");
    emailConfirmRequest.success({
      statusCode: 200,
      data: {
        success: true,
        contractVersion: 2,
        authenticated: true,
        webAccountLinked: true,
        token: "session-b",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: profile("account-b", 202, true),
      },
    });
    await confirmation;

    deferredProfileRequest.success({
      statusCode: 200,
      data: { success: true, profile: profile("account-a", 101) },
    });
    await staleSync;

    assert.equal(profileRequestCount, 2, "sync restarts once under session B");
    assert.equal(getApiSessionToken(), "session-b");
    assert.equal(getStoredMiniProgramProfile()?.id, "account-b");
    assert.equal(currentMyFplEntryId(), 202);
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
        keys: ["gql:v2:public:shared", "gql:v2:session:private", "gql:legacy"],
      }),
      getStorageSync: (key) => (key === "entry" ? 123 : undefined),
      removeStorageSync: (key) => removed.push(key),
    };
    globalThis.getApp = () => ({ globalData });

    clearApiSession();

    assert.equal(removed.includes("gql:v2:public:shared"), false);
    assert.equal(removed.includes("gql:v2:session:private"), true);
    assert.equal(removed.includes("gql:legacy"), true);
    assert.equal(removed.includes("api-session-token"), true);
    assert.equal(removed.includes("api-session-expires-at"), true);
    assert.equal(removed.includes("entry"), false);
    assert.equal(removed.includes("data-selections-tournamentId"), false);
    assert.equal(globalData.entryId, 123);
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
      getStorage: ({ success }) =>
        success({ data: "token", errMsg: "getStorage:ok" }),
      removeStorageSync: (key) => removed.push(key),
      request: ({ fail, success }) => {
        requestCount += 1;
        if (requestCount === 1) {
          fail({ errMsg: "offline" });
          return;
        }
        success({ statusCode: 204, data: { success: true } });
      },
    };
    globalThis.getApp = () => ({ globalData: { entryId: 123 } });

    await restoreApiSessionCredentials();
    const result = await logoutMiniProgramSession();
    assert.deepEqual(result, { localCleared: true, remoteRevoked: false });
    assert.equal(getApiSessionToken(), null);
    assert.ok(removed.includes("api-session-token"));
    assert.deepEqual(await logoutMiniProgramSession(), {
      localCleared: true,
      remoteRevoked: true,
    });
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
      },
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
        contractVersion: 2,
        authenticated: true,
        webAccountLinked: false,
        token: "issued-during-logout",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          id: "profile",
          name: null,
          email: null,
          fplEntryId: null,
          fplEntryVerifiedAt: null,
          wechatLinked: true,
        },
      },
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
      },
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
        contractVersion: 2,
        authenticated: true,
        webAccountLinked: false,
        token: "rotated-before-confirm-failure",
        expiresAt: "2099-01-01T00:00:00.000Z",
        profile: {
          id: "profile",
          name: null,
          email: null,
          fplEntryId: null,
          fplEntryVerifiedAt: null,
          wechatLinked: true,
        },
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(loginCallbacks.length, 1);

    loginCallbacks.shift()({ code: "confirm-code" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(emailRequest);
    emailRequest.success({
      statusCode: 500,
      data: { success: false, error: "confirmation failed" },
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
      },
    };
    globalThis.getApp = () => ({ globalData: {} });
    clearSessionCredentials();

    const first = confirmMiniProgramEmailLink("fpl@example.com", "123456");
    const duplicate = confirmMiniProgramEmailLink(
      "other@example.com",
      "654321",
    );
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
          wechatLinked: true,
        },
      },
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
      getStorageSync: (key) =>
        key === "api-session-token"
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
      },
    };
    globalThis.getApp = () => ({ globalData: {} });
    clearSessionCredentials();
    await restoreApiSessionCredentials();

    const logout = logoutMiniProgramSession();
    await assert.rejects(
      confirmMiniProgramEmailLink("fpl@example.com", "123456"),
      /正在退出登录/,
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
      getStorage: ({ fail }) =>
        fail({ errMsg: "getStorage:fail data is not encrypted" }),
      setStorage: (options) => {
        encryptedWrite = options;
        options.success();
      },
      removeStorageSync: (key) => removed.push(key),
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
        if (key === "api-profile-v2")
          return {
            id: "mini-profile",
            email: "fpl@example.com",
            webAccountLinked: true,
            followEntryId: 6953,
            effectiveEntryId: 6953,
            effectiveEntrySource: "MINI",
          };
        return undefined;
      },
      canIUse: () => true,
      getStorage: ({ success }) =>
        success({ data: "token", errMsg: "getStorage:ok" }),
      removeStorageSync: (key) => removed.push(key),
    };
    globalThis.getApp = () => ({ globalData: {} });

    await restoreApiSessionCredentials();
    assert.deepEqual(getLinkedAccountSnapshot(), {
      linked: true,
      email: "fpl@example.com",
    });
    clearSessionCredentials();
    assert.deepEqual(getLinkedAccountSnapshot(), { linked: false, email: "" });
    assert.equal(removed.includes("api-profile-email"), true);
  } finally {
    globalThis.wx = previousWx;
    globalThis.getApp = previousGetApp;
  }
});
