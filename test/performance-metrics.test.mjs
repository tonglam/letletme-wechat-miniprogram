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
  markAppBackgrounded,
  consumeAppBackgroundResume,
  getActivePagePerformanceTrace,
  getCurrentPagePerformanceTrace,
  getCurrentPagePerformanceTracker,
  instrumentPageInteractions,
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

test("stage markers keep default and optional content separate", () => {
  clearPerf();
  let callback;
  const observer = {
    relativeToViewport() { return this; },
    observe(_selector, next) { callback = next; },
    disconnect() {}
  };
  const page = {
    __performanceVisible: true,
    __performanceTracker: null,
    createIntersectionObserver() { return observer; }
  };
  globalThis.getCurrentPages = () => [page];
  const tracker = new PagePerformanceTracker(page, "pages/test/stages", "warm-enter");
  page.__performanceTracker = tracker;
  tracker.expectSecondaryCompletion();
  tracker.mark("defaultContentAt");
  tracker.observePrimary();
  callback({ intersectionRatio: 1 });
  assert.equal(getCurrentPagePerformanceTracker(), tracker);
  assert.deepEqual(getCurrentPagePerformanceTrace(), {
    navigationId: tracker.navigationId,
    route: tracker.route,
    trigger: tracker.trigger,
  });
  tracker.mark("secondaryCompleteAt");
  const record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.ok(record.defaultContentAt);
  assert.ok(record.primaryViewportVisibleAt);
  assert.ok(record.secondaryCompleteAt);
  assert.equal(record.completeAt, record.secondaryCompleteAt);
  delete globalThis.getCurrentPages;
});

test("an error surface records error visibility without successful completion", () => {
  clearPerf();
  let callback;
  const observer = {
    relativeToViewport() { return this; },
    observe(_selector, next) { callback = next; },
    disconnect() {}
  };
  const page = {
    data: { error: "网络连接失败，请检查网络后重试" },
    __performanceVisible: true,
    createIntersectionObserver() { return observer; }
  };
  const tracker = new PagePerformanceTracker(page, "pages/test/error", "warm-enter");
  tracker.observePrimary("#perf-primary-content", { errorVisible: true });
  callback({ intersectionRatio: 1 });
  const record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.ok(record.errorVisibleAt);
  assert.ok(record.primaryViewportVisibleAt);
  assert.equal(record.completeAt, undefined);
  tracker.disconnect();
  delete globalThis.getCurrentPages;
});

test("primary visibility uses the rendered surface state, not hidden secondary errors", () => {
  clearPerf();
  let callback;
  const observer = {
    relativeToViewport() { return this; },
    observe(_selector, next) { callback = next; },
    disconnect() {}
  };
  const page = {
    data: { error: "", transfersError: "转会暂不可用" },
    __performanceVisible: true,
    createIntersectionObserver() { return observer; }
  };
  const tracker = new PagePerformanceTracker(page, "pages/test/secondary-error", "warm-enter");
  tracker.observePrimary("#perf-primary-content");
  callback({ intersectionRatio: 1 });
  const record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.equal(record.errorVisibleAt, undefined);
  assert.ok(record.completeAt);
  tracker.disconnect();
  delete globalThis.getCurrentPages;
});

test("soft timeout stays separate from a later successful primary viewport", () => {
  clearPerf();
  let callback;
  const observer = {
    relativeToViewport() { return this; },
    observe(_selector, next) { callback = next; },
    disconnect() {}
  };
  const page = {
    data: { error: "" },
    __performanceVisible: true,
    createIntersectionObserver() { return observer; }
  };
  const tracker = new PagePerformanceTracker(page, "pages/test/late-success", "warm-enter");
  tracker.mark("softFailureAt");
  tracker.observePrimary("#perf-primary-content");
  callback({ intersectionRatio: 1 });
  const record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.ok(record.softFailureAt);
  assert.equal(record.errorVisibleAt, undefined);
  assert.equal(record.completeAt, record.primaryViewportVisibleAt);
  tracker.disconnect();
  delete globalThis.getCurrentPages;
});

test("interaction markers keep handler completion separate from visible content", () => {
  clearPerf();
  let now = 100;
  globalThis.wx.getPerformance = () => ({ now: () => (now += 10) });
  const page = { __performanceVisible: true, createIntersectionObserver() {} };
  globalThis.getCurrentPages = () => [page];
  const tracker = new PagePerformanceTracker(page, "pages/test/interactions", "warm-enter");
  const token = tracker.beginInteraction("onTab", "tab:overview");
  tracker.markInteractionHandlerCompleted(token.interactionId);
  let record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.equal(record.interactions[0].status, "completed");
  assert.ok(record.interactions[0].handlerCompletedAt >= record.interactions[0].startedAt);
  tracker.mark("onDemandVisibleAt");
  record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.equal(record.interactions[0].status, "completed");
  assert.equal(record.interactions[0].resultVisibleAt, undefined);
  tracker.disconnect();
  delete globalThis.getCurrentPages;
});

test("default commits do not close an interaction before its viewport marker", () => {
  clearPerf();
  let callback;
  const observer = {
    relativeToViewport() { return this; },
    observe(_selector, next) { callback = next; },
    disconnect() {}
  };
  const page = { data: {}, __performanceVisible: true, createIntersectionObserver() { return observer; } };
  globalThis.getCurrentPages = () => [page];
  const tracker = new PagePerformanceTracker(page, "pages/test/interaction-viewport", "warm-enter");
  const token = tracker.beginInteraction("onTab", "tab:season");
  tracker.markInteractionHandlerCompleted(token.interactionId);
  tracker.mark("defaultContentAt");
  let record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.equal(record.interactions[0].resultVisibleAt, undefined);
  tracker.observeInteractionVisible("#target");
  callback({ intersectionRatio: 1 });
  record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.ok(record.interactions[0].resultVisibleAt);
  tracker.disconnect();
  delete globalThis.getCurrentPages;
});

test("page interaction instrumentation records the actual handler and preserves return values", () => {
  clearPerf();
  const page = { __performanceVisible: true };
  globalThis.getCurrentPages = () => [page];
  const tracker = new PagePerformanceTracker(page, "pages/test/instrumented", "warm-enter");
  const calls = [];
  const definition = instrumentPageInteractions({
    onLoad() { calls.push("lifecycle"); },
    onTap(value) { calls.push(value); return "handled"; },
    helper() { calls.push("helper"); },
  });
  assert.equal(definition.onTap.call(page, "tap"), "handled");
  definition.helper.call(page);
  assert.deepEqual(calls, ["tap", "helper"]);
  const record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.equal(record.interactions.length, 1);
  assert.equal(record.interactions[0].handler, "onTap");
  assert.ok(record.interactions[0].handlerCompletedAt >= record.interactions[0].startedAt);
  tracker.disconnect();
  delete globalThis.getCurrentPages;
});

test("automatic interaction instrumentation observes the primary result viewport", () => {
  clearPerf();
  let callback;
  const observer = {
    relativeToViewport() { return this; },
    observe(_selector, next) { callback = next; },
    disconnect() {}
  };
  const previousNextTick = globalThis.wx.nextTick;
  globalThis.wx.nextTick = (fn) => fn();
  const page = {
    data: { error: "" },
    __performanceVisible: true,
    createIntersectionObserver() { return observer; }
  };
  globalThis.getCurrentPages = () => [page];
  const tracker = new PagePerformanceTracker(page, "pages/test/auto-interaction", "warm-enter");
  const definition = instrumentPageInteractions({ onSortChange() { return undefined; } });
  definition.onSortChange.call(page);
  callback({ intersectionRatio: 1 });
  const record = getPerf().pagePerformance.find((item) => item.navigationId === tracker.navigationId);
  assert.ok(record.interactions[0].resultVisibleAt);
  tracker.disconnect();
  globalThis.wx.nextTick = previousNextTick;
  delete globalThis.getCurrentPages;
});

test("API records retain redacted HTTP diagnostics for network failures", () => {
  clearPerf();
  recordApi("GetEntryTransferHistory", 42, false, {
    source: "network",
    networkAttempted: true,
    requestId: "req-redacted",
    statusCode: 403,
    code: "FORBIDDEN",
  });
  const record = getPerf().apiRecords.at(-1);
  assert.equal(record.statusCode, 403);
  assert.equal(record.code, "FORBIDDEN");
  assert.equal(record.requestId, "req-redacted");
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
  assert.equal(second.trigger, "in-page-navigation");
  assert.equal(secondRecord.trigger, "in-page-navigation");
  second.disconnect();
  clearPerf();
});

test("page lifecycle consumes a background resume once", () => {
  assert.equal(consumeAppBackgroundResume(), false);
  markAppBackgrounded();
  assert.equal(consumeAppBackgroundResume(), true);
  assert.equal(consumeAppBackgroundResume(), false);

  markAppBackgrounded();
  const resumed = new PagePerformanceTracker({}, "pages/test/resumed", "warm-enter");
  assert.equal(resumed.trigger, "warm-enter");
  resumed.disconnect();

  const returned = new PagePerformanceTracker({}, "pages/test/returned", "warm-enter");
  assert.equal(returned.trigger, "in-page-navigation");
  returned.disconnect();

  markAppBackgrounded();
  const refreshed = new PagePerformanceTracker({}, "pages/test/refreshed", "refresh");
  assert.equal(refreshed.trigger, "refresh");
  assert.equal(consumeAppBackgroundResume(), false);
  refreshed.disconnect();
});

test("page lifecycle preserves an already-resolved resume trigger", () => {
  markAppBackgrounded();
  assert.equal(consumeAppBackgroundResume(), true);

  const tracker = new PagePerformanceTracker(
    {},
    "pages/test/resolved-resume",
    "warm-enter",
    { triggerResolved: true },
  );
  assert.equal(tracker.trigger, "warm-enter");
  tracker.disconnect();
});

test("in-page navigation route-ready telemetry has its own measurement kind", () => {
  const previousRandom = Math.random;
  const previousWx = globalThis.wx;
  const telemetryKey = "client-telemetry:queue:v2";
  storage.delete(telemetryKey);
  globalThis.wx = {
    ...previousWx,
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
  };
  Math.random = () => 0;
  try {
    clearPerf();
    const tracker = new PagePerformanceTracker(
      {},
      "pages/test/in-page",
      "in-page-navigation"
    );
    tracker.mark("softFailureAt");
    const telemetry = storage.get(telemetryKey);
    assert.equal(telemetry.samples[0].measurementKind, "in_page_navigation");
  } finally {
    Math.random = previousRandom;
    globalThis.wx = previousWx;
    clearPerf();
  }
});

test("route-ready telemetry waits for an explicitly expected secondary completion", () => {
  const previousRandom = Math.random;
  const previousWx = globalThis.wx;
  const telemetryKey = "client-telemetry:queue:v2";
  storage.delete(telemetryKey);
  globalThis.wx = {
    ...previousWx,
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
  };
  Math.random = () => 0;
  try {
    clearPerf();
    let callback;
    const observer = {
      relativeToViewport() { return this; },
      observe(_selector, next) { callback = next; },
      disconnect() {}
    };
    markAppBackgrounded();
    const tracker = new PagePerformanceTracker(
      { createIntersectionObserver: () => observer },
      "pages/test/secondary-boundary",
      "warm-enter"
    );
    tracker.expectSecondaryCompletion();
    tracker.observePrimary();
    callback({ intersectionRatio: 1 });
    assert.equal(storage.get(telemetryKey), undefined);

    tracker.mark("secondaryCompleteAt");
    const telemetry = storage.get(telemetryKey);
    assert.equal(telemetry.samples.length, 1);
    assert.equal(telemetry.samples[0].metric, "route_ready_ms");
    assert.equal(telemetry.samples[0].result, "ok");
    assert.equal(telemetry.samples[0].measurementKind, "background_resume");
    assert.equal(telemetry.samples[0].samplingProbability, 0.25);
  } finally {
    Math.random = previousRandom;
    globalThis.wx = previousWx;
    clearPerf();
  }
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
