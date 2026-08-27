import assert from "node:assert/strict";
import test from "node:test";

import {
  enqueueClientTelemetry,
  flushClientTelemetry,
} from "../miniprogram/services/client-telemetry.service.ts";
import { storageKeys } from "../miniprogram/config/storage-keys.ts";

function installWx(storage, requests, onRequest = () => {}, { envVersion = "release", platform = "ios" } = {}) {
  globalThis.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getSystemInfoSync: () => ({ platform }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    request: (options) => {
      requests.push(options);
      onRequest(options, requests.length);
    },
  };
}

test("client telemetry derives the device bucket from the runtime platform", () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  try {
    installWx(storage, [], () => {}, { envVersion: "develop", platform: "ios" });
    enqueueClientTelemetry(errorSample());
    assert.equal(storage.get(storageKeys.clientTelemetryQueue).samples[0].deviceGroup, "wechat_phone");
    assert.equal(storage.get(storageKeys.clientTelemetryQueue).samples[0].sampleSource, "synthetic");

    const devToolsStorage = new Map();
    installWx(devToolsStorage, [], () => {}, { envVersion: "release", platform: "devtools" });
    enqueueClientTelemetry(errorSample());
    assert.equal(devToolsStorage.get(storageKeys.clientTelemetryQueue).samples[0].deviceGroup, "wechat_devtools");
    assert.equal(devToolsStorage.get(storageKeys.clientTelemetryQueue).samples[0].sampleSource, "real");
  } finally {
    globalThis.wx = previousWx;
  }
});

function errorSample() {
  return {
    surface: "live_matches",
    metric: "runtime_error",
    result: "error",
  };
}

test("client telemetry forwards only fixed fields and preserves the batch id on retry", async () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  const requests = [];
  try {
    installWx(storage, requests);
    enqueueClientTelemetry(errorSample());
    const firstFlush = flushClientTelemetry();

    assert.equal(requests.length, 1);
    const first = requests[0];
    assert.equal(first.url, "https://letletme.top/api/miniprogram/telemetry");
    assert.equal(first.data.client, "wechat_miniprogram");
    assert.equal(first.data.release, "miniprogram-release");
    assert.equal(first.data.samples.length, 1);
    assert.deepEqual(Object.keys(first.data.samples[0]).sort(), [
      "deviceGroup",
      "metric",
      "observedAt",
      "result",
      "sampleSource",
      "surface",
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(first.data.samples[0], "message"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(first.data.samples[0], "requestId"), false);

    const batchId = first.data.batchId;
    first.fail({ errMsg: "request:fail offline" });
    await firstFlush;
    const secondFlush = flushClientTelemetry();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].data.batchId, batchId);

    requests[1].success({ statusCode: 202, data: { accepted: true } });
    await secondFlush;
    assert.equal(storage.get(storageKeys.clientTelemetryQueue).samples.length, 0);
  } finally {
    globalThis.wx = previousWx;
  }
});

test("client telemetry keeps at most 100 pending samples and batches at most 50", async () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  const requests = [];
  try {
    installWx(storage, requests, (options) => options.fail({ errMsg: "offline" }));
    for (let index = 0; index < 101; index += 1) {
      enqueueClientTelemetry(errorSample());
    }
    await flushClientTelemetry();

    const pending = storage.get(storageKeys.clientTelemetryQueue);
    assert.equal(pending.samples.length, 100);
    assert.equal(requests[0].data.samples.length, 20);
    await flushClientTelemetry();
    assert.equal(storage.get(storageKeys.clientTelemetryQueue).samples.length, 100);
  } finally {
    globalThis.wx = previousWx;
  }
});

test("client telemetry drops samples that can no longer satisfy Data's time window", async () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  const requests = [];
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  storage.set(storageKeys.clientTelemetryQueue, {
    batchId: "11111111-1111-4111-8111-111111111111",
    samples: [{
      observedAt: old,
      surface: "live_matches",
      metric: "runtime_error",
      deviceGroup: "wechat_phone",
      sampleSource: "real",
      result: "error",
    }],
  });
  try {
    installWx(storage, requests);
    await flushClientTelemetry();
    assert.equal(requests.length, 0);
    assert.equal(storage.get(storageKeys.clientTelemetryQueue).samples.length, 0);
  } finally {
    globalThis.wx = previousWx;
  }
});
