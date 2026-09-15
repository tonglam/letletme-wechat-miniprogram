import assert from "node:assert/strict";
import test from "node:test";

import {
  enqueueClientTelemetry,
  flushClientTelemetry,
  recordClientRuntimeError,
} from "../miniprogram/services/client-telemetry.service.ts";
import { miniClientRelease } from "../miniprogram/config/build-provenance.ts";
import { storageKeys } from "../miniprogram/config/storage-keys.ts";

function installWx(
  storage,
  requests,
  onRequest = () => {},
  { envVersion = "release", platform = "ios" } = {},
) {
  globalThis.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getDeviceInfo: () => ({ platform }),
    getSystemInfoSync: () => {
      throw new Error(
        "modern runtimes must not use deprecated getSystemInfoSync",
      );
    },
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
    installWx(storage, [], () => {}, {
      envVersion: "develop",
      platform: "ios",
    });
    enqueueClientTelemetry(errorSample());
    assert.equal(
      storage.get(storageKeys.clientTelemetryQueue).samples[0].deviceGroup,
      "wechat_phone",
    );
    assert.equal(
      storage.get(storageKeys.clientTelemetryQueue).samples[0].sampleSource,
      "synthetic",
    );

    const devToolsStorage = new Map();
    installWx(devToolsStorage, [], () => {}, {
      envVersion: "release",
      platform: "devtools",
    });
    enqueueClientTelemetry(errorSample());
    assert.equal(
      devToolsStorage.get(storageKeys.clientTelemetryQueue).samples[0]
        .deviceGroup,
      "wechat_devtools",
    );
    assert.equal(
      devToolsStorage.get(storageKeys.clientTelemetryQueue).samples[0]
        .sampleSource,
      "real",
    );
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
    assert.equal(first.data.schemaVersion, 2);
    assert.equal(first.data.client, "wechat_miniprogram");
    assert.equal(first.data.clientRelease, miniClientRelease());
    assert.equal(
      Object.prototype.hasOwnProperty.call(first.data, "ingestRelease"),
      false,
    );
    assert.equal(first.data.samples.length, 1);
    assert.deepEqual(Object.keys(first.data.samples[0]).sort(), [
      "deviceGroup",
      "measurementKind",
      "metric",
      "observedAt",
      "reasonCode",
      "result",
      "sampleSource",
      "samplingProbability",
      "surface",
    ]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(first.data.samples[0], "message"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(first.data.samples[0], "requestId"),
      false,
    );

    const batchId = first.data.batchId;
    first.fail({ errMsg: "request:fail offline" });
    await firstFlush;
    const secondFlush = flushClientTelemetry();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].data.batchId, batchId);

    requests[1].success({ statusCode: 202, data: { accepted: true } });
    await secondFlush;
    assert.equal(
      storage.get(storageKeys.clientTelemetryQueue).samples.length,
      0,
    );
  } finally {
    globalThis.wx = previousWx;
  }
});

test("client telemetry keeps at most 100 pending samples and batches at most 50", async () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  const requests = [];
  try {
    installWx(storage, requests, (options) =>
      options.fail({ errMsg: "offline" }),
    );
    for (let index = 0; index < 101; index += 1) {
      enqueueClientTelemetry(errorSample());
    }
    await flushClientTelemetry();

    const pending = storage.get(storageKeys.clientTelemetryQueue);
    assert.equal(pending.samples.length, 100);
    assert.equal(requests[0].data.samples.length, 20);
    await flushClientTelemetry();
    assert.equal(
      storage.get(storageKeys.clientTelemetryQueue).samples.length,
      100,
    );
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
    samples: [
      {
        observedAt: old,
        surface: "live_matches",
        metric: "runtime_error",
        deviceGroup: "wechat_phone",
        sampleSource: "real",
        result: "error",
        reasonCode: "unknown",
        measurementKind: "request",
        samplingProbability: 1,
      },
    ],
  });
  try {
    installWx(storage, requests);
    await flushClientTelemetry();
    assert.equal(requests.length, 0);
    assert.equal(
      storage.get(storageKeys.clientTelemetryQueue).samples.length,
      0,
    );
  } finally {
    globalThis.wx = previousWx;
  }
});

test("client telemetry rebinds an empty persisted queue to the current build", () => {
  const previousWx = globalThis.wx;
  const storage = new Map([
    [
      storageKeys.clientTelemetryQueue,
      {
        batchId: "11111111-1111-4111-8111-111111111111",
        clientRelease: "miniprogram-old-release-oldsha",
        samples: [],
      },
    ],
  ]);
  try {
    installWx(storage, []);
    enqueueClientTelemetry(errorSample());
    assert.equal(
      storage.get(storageKeys.clientTelemetryQueue).clientRelease,
      miniClientRelease(),
    );
  } finally {
    globalThis.wx = previousWx;
  }
});

test("client runtime errors are deduplicated and retain only controlled dimensions", () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  try {
    installWx(storage, []);
    const error = Object.assign(new Error("secret stack"), {
      name: "TypeError",
    });
    recordClientRuntimeError(error);
    recordClientRuntimeError(error);
    recordClientRuntimeError(
      Object.assign(new Error("another secret"), { name: "TypeError" }),
    );

    const samples = storage.get(storageKeys.clientTelemetryQueue).samples;
    assert.equal(samples.length, 1);
    assert.equal(samples[0].metric, "runtime_error");
    assert.equal(samples[0].errorClass, "TypeError");
    assert.equal(samples[0].fingerprint, "runtime.TypeError.unknown");
    assert.equal(samples[0].occurrenceCount, 2);
    assert.equal(
      Object.prototype.hasOwnProperty.call(samples[0], "message"),
      false,
    );
  } finally {
    globalThis.wx = previousWx;
  }
});

test("client runtime errors remain countable after an aggregate is acknowledged", async () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  const requests = [];
  try {
    installWx(storage, requests);
    recordClientRuntimeError(
      Object.assign(new Error("first"), { name: "RangeError" }),
    );
    const firstFlush = flushClientTelemetry();
    assert.equal(requests.length, 1);
    requests[0].success({ statusCode: 202, data: { accepted: true } });
    await firstFlush;

    recordClientRuntimeError(
      Object.assign(new Error("second"), { name: "RangeError" }),
    );
    const pending = storage.get(storageKeys.clientTelemetryQueue);
    assert.equal(pending.samples.length, 1);
    assert.equal(pending.samples[0].fingerprint, "runtime.RangeError.unknown");
    assert.equal(pending.samples[0].occurrenceCount, 1);
  } finally {
    globalThis.wx = previousWx;
  }
});

test("client runtime errors cap distinct fingerprints and preserve overflow as other", () => {
  const previousWx = globalThis.wx;
  const storage = new Map();
  try {
    installWx(storage, []);
    for (let index = 0; index < 40; index += 1) {
      recordClientRuntimeError(
        Object.assign(new Error(`secret-${index}`), {
          name: `Type${index}`,
        }),
      );
    }
    const samples = storage.get(storageKeys.clientTelemetryQueue).samples;
    const fingerprints = new Set(
      samples
        .filter((sample) => sample.metric === "runtime_error")
        .map((sample) => sample.fingerprint),
    );
    assert.ok(fingerprints.size <= 32);
    assert.ok(fingerprints.has("runtime.other"));
    assert.ok(
      samples.every(
        (sample) =>
          sample.metric !== "runtime_error" ||
          !Object.prototype.hasOwnProperty.call(sample, "message"),
      ),
    );
  } finally {
    globalThis.wx = previousWx;
  }
});
