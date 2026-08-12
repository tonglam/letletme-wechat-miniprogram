import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storage = new Map();
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorage: ({ key, data }) => storage.set(key, data),
  removeStorage: ({ key }) => storage.delete(key),
  getPerformance: () => ({ now: () => Date.now() })
};

const { clearPerf, getPerf, recordApi } = await import("../miniprogram/utils/perf.ts");
const { PagePerformanceTracker } = await import("../miniprogram/utils/page-performance.ts");
const { observeSoftTimeout } = await import("../miniprogram/utils/page-request.ts");

test("performance buffers remain bounded and page operation counts are separate", () => {
  clearPerf();
  for (let index = 0; index < 305; index += 1) {
    recordApi(`Operation${index}`, index, true, { source: "network", networkAttempted: true });
  }
  assert.equal(getPerf().apiRecords.length, 300);

  let callback;
  let disconnectCount = 0;
  const observer = {
    relativeToViewport() { return this; },
    observe(_selector, next) { callback = next; },
    disconnect() { disconnectCount += 1; }
  };
  const tracker = new PagePerformanceTracker(
    { createIntersectionObserver: () => observer },
    "pages/test/index",
    "warm-enter"
  );
  tracker.countOperation(false);
  tracker.countOperation(true);
  tracker.observePrimary();
  callback({ intersectionRatio: 1 });
  callback({ intersectionRatio: 1 });
  const page = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.equal(page.operationCount, 2);
  assert.equal(page.networkOperationCount, 1);
  assert.ok(page.primaryViewportVisibleAt);
  assert.ok(disconnectCount >= 1);
});

test("soft timeout is UI-only and late completion remains possible", async () => {
  let resolveTask;
  let softFailures = 0;
  const task = new Promise((resolve) => { resolveTask = resolve; });
  observeSoftTimeout(task, 5, () => { softFailures += 1; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(softFailures, 1);
  resolveTask();
  await task;
});

test("performance page uses nearest-rank p95 only at ten samples and renders missing values as dashes", () => {
  const page = readFileSync(
    new URL("../miniprogram/pages/performance/index/index.ts", import.meta.url),
    "utf8"
  );
  assert.match(page, /networkP95: formatDuration\(percentile\(networkRecords\.map\(\(record\) => record\.duration\), 0\.95, 10\)\)/);
  assert.match(page, /values\.length < minimumSamples/);
  assert.match(page, /value === null \? "--"/);
  assert.doesNotMatch(page, /Infinity/);
});
