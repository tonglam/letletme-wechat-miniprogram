import assert from "node:assert/strict";
import test from "node:test";

const storage = new Map();
globalThis.getApp = () => ({ globalData: { season: "2025-26", contextRevision: 12 } });
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  setStorage: ({ key, data, success }) => {
    storage.set(key, data);
    success?.({});
  },
  removeStorage: ({ key, success }) => {
    storage.delete(key);
    success?.({});
  },
  request: (options) => options.success({
    statusCode: 200,
    header: { "X-Request-Id": "req-page-trace-1" },
    data: { data: { value: 7 } }
  })
};

const { graphqlRead } = await import("../miniprogram/services/graphql.service.ts");
const { clearPerf, getPerf, recordPagePerformance } = await import("../miniprogram/utils/perf.ts");
const { PagePerformanceTracker } = await import("../miniprogram/utils/page-performance.ts");

test("logical and network calls share page attribution without sensitive inputs", async () => {
  clearPerf();
  const navigationId = "telemetry-nav";
  recordPagePerformance({
    navigationId,
    route: "pages/test/index",
    trigger: "warm-enter",
    routeStartedAt: 1,
    operationCount: 0,
    networkOperationCount: 0
  });
  const trace = {
    navigationId,
    callerSurface: "test-surface",
    trigger: "load",
    contextRevision: 9,
    cacheVariantHash: "safe-hash"
  };
  const query = "query TelemetryProbe { value }";
  await graphqlRead(query, {}, { authMode: "public", cachePolicy: "reporting", trace });
  await graphqlRead(query, {}, { authMode: "public", cachePolicy: "reporting", trace });

  const perf = getPerf();
  const page = perf.pagePerformance.find((item) => item.navigationId === navigationId);
  assert.equal(page.operationCount, 2);
  assert.equal(page.networkOperationCount, 1);
  assert.deepEqual(perf.apiRecords.map((item) => item.source), ["network", "memory"]);
  assert.equal(perf.apiRecords[0].requestId, "req-page-trace-1");
  assert.equal(perf.apiRecords[0].callerSurface, "test-surface");
  assert.equal(perf.apiRecords[0].contextRevision, 9);
  const serialized = JSON.stringify(perf.apiRecords);
  assert.doesNotMatch(serialized, /token|entryId|variables|Authorization/);
});

test("active page supplies attribution when a service does not pass an explicit trace", async () => {
  clearPerf();
  const tracker = new PagePerformanceTracker({}, "pages/test/automatic", "refresh");
  const query = "query AutomaticTelemetryProbe { automaticValue }";

  await graphqlRead(query, {}, { authMode: "public", cachePolicy: "reporting" });

  const perf = getPerf();
  const page = perf.pagePerformance.find(
    (item) => item.navigationId === tracker.navigationId
  );
  assert.equal(page.operationCount, 1);
  assert.equal(page.networkOperationCount, 1);
  assert.equal(perf.apiRecords[0].callerSurface, "pages/test/automatic");
  assert.equal(perf.apiRecords[0].trigger, "refresh");
  assert.equal(perf.apiRecords[0].contextRevision, 12);
  tracker.disconnect();
});
