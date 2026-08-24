import assert from "node:assert/strict";
import test from "node:test";

import {
  clearSessionCredentials,
  refreshWechatApiSession,
} from "../miniprogram/services/auth.service.ts";
import {
  collectMiniProgramLoginContext,
  normalizeMiniProgramRequestId,
} from "../miniprogram/utils/auth-observability.ts";

test("mini login context keeps only coarse, bounded runtime fields", () => {
  const previousWx = globalThis.wx;
  const previousPages = globalThis.getCurrentPages;
  try {
    globalThis.wx = {
      getDeviceInfo: () => ({
        platform: "ios",
        system: "iOS 17.5.1",
        deviceModel: "iPad Pro 12.9",
        brand: "private-brand-must-not-upload",
      }),
      getAppBaseInfo: () => ({ SDKVersion: "3.17.1", version: "8.0.50" }),
      getAccountInfoSync: () => ({
        miniProgram: { envVersion: "trial", version: "2026.08.25" },
      }),
      canIUse: (schema) =>
        schema === "setStorage.object.encrypt" ||
        schema === "getStorage.object.encrypt",
    };
    globalThis.getCurrentPages = () => [{ route: "pages/account/index" }];

    const context = collectMiniProgramLoginContext("profile_401", "encrypted");
    assert.deepEqual(context, {
      schemaVersion: 1,
      trigger: "profile_401",
      platform: "ios",
      deviceClass: "tablet",
      osFamily: "ios",
      osMajor: "17",
      wechatMajor: "8",
      sdkVersion: "3.17.1",
      miniProgramVersion: "2026.08.25",
      envVersion: "trial",
      pageRoute: "pages/account/index",
      encryptedStorageSupported: true,
      credentialState: "encrypted",
    });
    assert.equal(JSON.stringify(context).includes("private-brand"), false);
    assert.equal(normalizeMiniProgramRequestId("bad id"), undefined);
    assert.equal(normalizeMiniProgramRequestId("wx-valid-request"), "wx-valid-request");
  } finally {
    globalThis.wx = previousWx;
    globalThis.getCurrentPages = previousPages;
  }
});

test("wx login sends a request id and persistence outcome without changing response shape", async () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  let loginSuccess;
  const requests = [];
  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial", version: "1.0.0" } }),
      getDeviceInfo: () => ({ platform: "android", system: "Android 14", deviceModel: "phone" }),
      getAppBaseInfo: () => ({ SDKVersion: "3.17.1", version: "8.0.50" }),
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      canIUse: () => true,
      setStorage: (options) => options.success(),
      getRealtimeLogManager: () => ({ info: () => {} }),
      login: (options) => {
        loginSuccess = options.success;
      },
      request: (options) => {
        requests.push(options);
        if (options.url.endsWith("/wechat/login")) {
          options.success({
            statusCode: 200,
            header: { "x-request-id": options.header["X-Request-Id"] },
            data: {
              success: true,
              contractVersion: 2,
              authenticated: true,
              webAccountLinked: false,
              token: "memory-token",
              expiresAt: "2099-01-01T00:00:00.000Z",
              profile: { id: "mini-account", webAccountLinked: false },
            },
          });
          return;
        }
        if (options.url.endsWith("/session/persistence")) {
          options.success({
            statusCode: 200,
            header: { "x-request-id": options.header["X-Request-Id"] },
            data: { success: true },
          });
          return;
        }
        throw new Error(`unexpected request ${options.url}`);
      },
    };
    clearSessionCredentials();
    const refresh = refreshWechatApiSession("cold_start_missing");
    loginSuccess({ code: "wechat-login-code" });
    const session = await refresh;
    await new Promise((resolve) => setImmediate(resolve));

    const loginRequest = requests.find((request) => request.url.endsWith("/wechat/login"));
    const persistenceRequest = requests.find((request) => request.url.endsWith("/session/persistence"));
    assert.ok(loginRequest);
    assert.match(loginRequest.header["X-Request-Id"], /^[A-Za-z0-9_-]{8,128}$/);
    assert.equal(loginRequest.data.loginContext.trigger, "cold_start_missing");
    assert.equal(loginRequest.data.loginContext.sdkVersion, "3.17.1");
    assert.equal(session.token, "memory-token");
    assert.ok(persistenceRequest);
    assert.deepEqual(persistenceRequest.data, {
      requestId: loginRequest.header["X-Request-Id"],
      outcome: "encrypted",
    });
    assert.equal(persistenceRequest.header.Authorization, "Bearer memory-token");
  } finally {
    clearSessionCredentials();
    globalThis.wx = previousWx;
  }
});

test("reports write_failed when encrypted session persistence is unavailable", async () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  let loginSuccess;
  const requests = [];
  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "release", version: "1.0.0" } }),
      getDeviceInfo: () => ({ platform: "ios", system: "iOS 17.5", deviceModel: "phone" }),
      getAppBaseInfo: () => ({ SDKVersion: "3.17.1", version: "8.0.50" }),
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      canIUse: () => true,
      setStorage: (options) => options.fail(),
      getRealtimeLogManager: () => ({ info: () => {} }),
      login: (options) => {
        loginSuccess = options.success;
      },
      request: (options) => {
        requests.push(options);
        if (options.url.endsWith("/wechat/login")) {
          options.success({
            statusCode: 200,
            header: { "x-request-id": options.header["X-Request-Id"] },
            data: {
              success: true,
              contractVersion: 2,
              authenticated: true,
              webAccountLinked: false,
              token: "memory-only-token",
              expiresAt: "2099-01-01T00:00:00.000Z",
              profile: { id: "mini-account", webAccountLinked: false },
            },
          });
          return;
        }
        if (options.url.endsWith("/session/persistence")) {
          options.success({
            statusCode: 200,
            header: { "x-request-id": options.header["X-Request-Id"] },
            data: { success: true },
          });
          return;
        }
        throw new Error(`unexpected request ${options.url}`);
      },
    };
    clearSessionCredentials();
    const refresh = refreshWechatApiSession("cold_start_missing");
    loginSuccess({ code: "wechat-login-code" });
    await refresh;
    await new Promise((resolve) => setImmediate(resolve));

    const loginRequest = requests.find((request) => request.url.endsWith("/wechat/login"));
    const persistenceRequest = requests.find((request) => request.url.endsWith("/session/persistence"));
    assert.ok(loginRequest);
    assert.ok(persistenceRequest);
    assert.deepEqual(persistenceRequest.data, {
      requestId: loginRequest.header["X-Request-Id"],
      outcome: "memory_only",
      reason: "write_failed",
    });
    assert.equal(storage.has("api-session-token"), false);
  } finally {
    clearSessionCredentials();
    globalThis.wx = previousWx;
  }
});
