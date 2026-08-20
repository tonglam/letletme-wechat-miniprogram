import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const auth = require("../miniprogram/services/auth.service.ts");

function installWechatStorage(initialQueue, requestImpl) {
  const previousWx = globalThis.wx;
  const previousGetApp = globalThis.getApp;
  const storage = new Map();
  if (initialQueue !== undefined) {
    storage.set("api-session-revocations", initialQueue);
  }
  const encryptedReads = [];
  const encryptedWrites = [];
  const removed = [];
  const requests = [];

  globalThis.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    getStorageSync: () => undefined,
    setStorageSync: () => undefined,
    removeStorageSync: (key) => {
      removed.push(key);
      storage.delete(key);
    },
    canIUse: () => true,
    getStorage: (options) => {
      encryptedReads.push(options);
      if (storage.has(options.key)) {
        options.success?.({ data: storage.get(options.key), errMsg: "getStorage:ok" });
      } else {
        options.fail?.({ errMsg: "getStorage:fail data not found" });
      }
    },
    setStorage: (options) => {
      encryptedWrites.push(options);
      storage.set(options.key, options.data);
      options.success?.({});
    },
    removeStorage: (options) => {
      removed.push(options.key);
      storage.delete(options.key);
      options.success?.({});
    },
    request: (options) => {
      requests.push(options);
      requestImpl(options, requests.length);
    }
  };
  globalThis.getApp = () => ({ globalData: {} });

  return {
    storage,
    encryptedReads,
    encryptedWrites,
    removed,
    requests,
    restore() {
      globalThis.wx = previousWx;
      globalThis.getApp = previousGetApp;
    }
  };
}

test("restores failed revocations across restart and preserves original expiry", async () => {
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const harness = installWechatStorage(
    {
      version: 1,
      entries: [
        { token: "retry-token", expiresAt },
        { token: "expired-token", expiresAt: Date.now() - 1 },
        { token: "", expiresAt: expiresAt }
      ]
    },
    (options, count) => {
      if (count < 3) {
        options.fail?.({ errMsg: "offline" });
      } else {
        options.success?.({ statusCode: 204, data: { success: true } });
      }
    }
  );

  try {
    assert.deepEqual(await auth.logoutMiniProgramSession(), {
      localCleared: true,
      remoteRevoked: false
    });
    assert.deepEqual(await auth.logoutMiniProgramSession(), {
      localCleared: true,
      remoteRevoked: false
    });
    await new Promise((resolve) => setImmediate(resolve));

    const persisted = harness.storage.get("api-session-revocations");
    assert.equal(persisted.version, 1);
    assert.deepEqual(persisted.entries, [{ token: "retry-token", expiresAt }]);
    assert.ok(harness.encryptedReads.some((options) => options.key === "api-session-revocations" && options.encrypt === true));
    assert.ok(harness.encryptedWrites.some((options) => options.key === "api-session-revocations" && options.encrypt === true));

    assert.deepEqual(await auth.logoutMiniProgramSession(), {
      localCleared: true,
      remoteRevoked: true
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.storage.has("api-session-revocations"), false);
    assert.equal(harness.requests.length, 3);
  } finally {
    harness.restore();
  }
});
