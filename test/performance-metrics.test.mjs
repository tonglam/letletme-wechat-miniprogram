import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storage = new Map();
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorage: ({ key, data }) => storage.set(key, data),
  removeStorage: ({ key }) => storage.delete(key),
  removeStorageSync: (key) => storage.delete(key),
  getPerformance: () => ({ now: () => Date.now() })
};

const { clearPerf, flushPerfNow, getPerf, recordApi } = await import("../miniprogram/utils/perf.ts");
const {
  PagePerformanceTracker,
  getActivePagePerformanceTrace
} = await import("../miniprogram/utils/page-performance.ts");
const { observeSoftTimeout } = await import("../miniprogram/utils/page-request.ts");
const {
  finiteDuration,
  firstContentVisibleDuration,
  formatDuration,
  nearestRankDuration
} = await import("../miniprogram/utils/performance-summary.ts");

test("a clear supersedes an in-flight native performance write", async () => {
  const previousSetStorage = globalThis.wx.setStorage;
  let completeWrite;
  globalThis.wx.setStorage = ({ key, data, success }) => {
    completeWrite = () => {
      storage.set(key, data);
      success?.({});
    };
  };

  try {
    clearPerf();
    recordApi("in-flight", 1, true);
    const flush = flushPerfNow();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof completeWrite, "function");

    clearPerf();
    completeWrite();
    await flush;

    assert.equal(storage.has("perf:v1"), false);
  } finally {
    globalThis.wx.setStorage = previousSetStorage;
    clearPerf();
  }
});

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
  let observerOptions;
  const tracker = new PagePerformanceTracker(
    {
      createIntersectionObserver: (options) => {
        observerOptions = options;
        return observer;
      }
    },
    "pages/test/index",
    "warm-enter"
  );
  tracker.countOperation(false);
  tracker.countOperation(true);
  tracker.observePrimary();
  assert.equal(observerOptions.nativeMode, true);
  assert.equal(getActivePagePerformanceTrace().navigationId, tracker.navigationId);
  callback({ intersectionRatio: 1 });
  callback({ intersectionRatio: 1 });
  const page = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.equal(page.operationCount, 2);
  assert.equal(page.networkOperationCount, 1);
  assert.ok(page.primaryViewportVisibleAt);
  assert.ok(disconnectCount >= 1);
  assert.equal(getActivePagePerformanceTrace(), null);

  const terminalTracker = new PagePerformanceTracker({}, "pages/test/secondary", "warm-enter");
  terminalTracker.mark("secondaryCompleteAt");
  assert.equal(getActivePagePerformanceTrace(), null);
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

test("page session classifies only the first load as cold and completion cannot precede primary visible", () => {
  clearPerf();
  let now = 100;
  globalThis.wx.getPerformance = () => ({ now: () => {
    now += 10;
    return now;
  } });

  let callback;
  const observer = {
    relativeToViewport() { return this; },
    observe(_selector, next) { callback = next; },
    disconnect() {}
  };
  const first = new PagePerformanceTracker(
    { createIntersectionObserver: () => observer },
    "pages/test/cold",
    "cold-launch"
  );
  first.mark("secondaryCompleteAt");
  let record = getPerf().pagePerformance.find((item) => item.navigationId === first.navigationId);
  assert.equal(record.trigger, "cold-launch");
  assert.equal(record.completeAt, undefined);

  first.observePrimary();
  callback({ intersectionRatio: 1 });
  record = getPerf().pagePerformance.find((item) => item.navigationId === first.navigationId);
  assert.ok(record.primaryViewportVisibleAt >= record.secondaryCompleteAt);
  assert.equal(record.completeAt, record.primaryViewportVisibleAt);

  first.mark("secondaryCompleteAt");
  record = getPerf().pagePerformance.find((item) => item.navigationId === first.navigationId);
  assert.equal(record.completeAt, record.secondaryCompleteAt);
  assert.ok(record.completeAt >= record.primaryViewportVisibleAt);

  const second = new PagePerformanceTracker({}, "pages/test/relaunch", "cold-launch");
  const secondRecord = getPerf().pagePerformance.find(
    (item) => item.navigationId === second.navigationId
  );
  assert.equal(second.trigger, "warm-enter");
  assert.equal(secondRecord.trigger, "warm-enter");
  second.disconnect();
  clearPerf();
});

test("summary rejects invalid durations and resolves the first cold primary boundary", () => {
  assert.equal(finiteDuration(Number.NaN), null);
  assert.equal(finiteDuration(Number.POSITIVE_INFINITY), null);
  assert.equal(finiteDuration(-1), null);
  assert.equal(finiteDuration(12.4), 12);
  assert.equal(formatDuration(Number.NaN), "--");
  assert.equal(nearestRankDuration([100, Number.NaN, 300, 200], 0.95, 3), 300);
  assert.equal(nearestRankDuration([100, Number.NaN], 0.95, 2), null);
  assert.equal(firstContentVisibleDuration([
    {
      navigationId: "warm",
      route: "pages/test/warm",
      trigger: "warm-enter",
      routeStartedAt: 1,
      primaryViewportVisibleAt: 10,
      operationCount: 0,
      networkOperationCount: 0,
      ts: 10
    },
    {
      navigationId: "cold",
      route: "pages/test/cold",
      trigger: "cold-launch",
      routeStartedAt: 20,
      primaryViewportVisibleAt: 145,
      operationCount: 0,
      networkOperationCount: 0,
      ts: 145
    }
  ]), 125);
});

test("performance page uses nearest-rank p95 only at ten samples and renders missing values as dashes", () => {
  const page = readFileSync(
    new URL("../miniprogram/pages/performance/index/index.ts", import.meta.url),
    "utf8"
  );
  const summary = readFileSync(
    new URL("../miniprogram/utils/performance-summary.ts", import.meta.url),
    "utf8"
  );
  assert.match(page, /networkP95: formatDuration\(nearestRankDuration\(/);
  assert.match(summary, /ordered\.length < minimumSamples/);
  assert.match(summary, /duration === null \? "--"/);
  assert.match(page, /metric\.rating !== "none"/);
  assert.doesNotMatch(page, /Infinity/);
});
