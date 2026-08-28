import assert from "node:assert/strict";
import test from "node:test";

import {
  clearSessionCredentials,
  refreshWechatApiSession,
} from "../miniprogram/services/auth.service.ts";
import {
  acknowledgeDiagnosticDisclosure,
  resetPrivacyAuthorizationForTests,
} from "../miniprogram/utils/privacy.ts";

test("automatic session refresh waits for diagnostic disclosure", async () => {
  const previousWx = globalThis.wx;
  const previousGetCurrentPages = globalThis.getCurrentPages;
  const storage = new Map();
  let loginSuccess;
  let loginStarted = false;
  try {
    globalThis.wx = {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial", version: "1.0.0" } }),
      getDeviceInfo: () => ({ platform: "ios", model: "phone" }),
      getSystemInfoSync: () => ({ platform: "ios", system: "iOS 17.5" }),
      getAppBaseInfo: () => ({ SDKVersion: "3.17.1", version: "8.0.50" }),
      getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      canIUse: () => false,
      getRealtimeLogManager: () => ({ info: () => {} }),
      login: (options) => {
        loginStarted = true;
        loginSuccess = options.success;
      },
      request: (options) => {
        options.success({
          statusCode: 200,
          header: { "x-request-id": options.header["X-Request-Id"] },
          data: options.url.endsWith("/wechat/login")
            ? {
                success: true,
                contractVersion: 2,
                authenticated: true,
                webAccountLinked: false,
                token: "disclosure-gated-token",
                expiresAt: "2099-01-01T00:00:00.000Z",
                profile: {
                  id: "mini-account",
                  name: null,
                  email: null,
                  emailVerified: false,
                  image: null,
                  createdAt: "2026-08-01T00:00:00.000Z",
                  accountMode: "MINI_ONLY",
                  webAccountLinked: false,
                  followEntryId: null,
                  webVerifiedEntryId: null,
                  effectiveEntryId: null,
                  effectiveEntrySource: null,
                  entryConflict: false,
                  fplEntryId: null,
                  fplEntryBoundAt: null,
                  fplEntryVerifiedAt: null,
                  wechatLinked: true,
                },
              }
            : { success: true },
        });
      },
    };
    globalThis.getCurrentPages = () => [];
    resetPrivacyAuthorizationForTests();

    const refresh = refreshWechatApiSession("graphql_401");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(loginStarted, false);

    acknowledgeDiagnosticDisclosure();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(loginStarted, true);
    loginSuccess({ code: "wechat-login-code" });
    await refresh;
  } finally {
    clearSessionCredentials();
    resetPrivacyAuthorizationForTests();
    globalThis.wx = previousWx;
    globalThis.getCurrentPages = previousGetCurrentPages;
  }
});
