import assert from "node:assert/strict";
import test from "node:test";

import {
  GraphQLApplicationError,
  GraphQLTransportError,
  graphqlRead,
  isViewerEntryAuthorizationError,
} from "../miniprogram/services/graphql.service.ts";
import {
  getGraphQLCooldownState,
  isGraphQLCooldownMessage,
  parseRetryAfterSeconds,
  persistGraphQLCooldown,
  subscribeGraphQLCooldown,
} from "../miniprogram/services/graphql-cooldown.ts";
import { getMiniProgramDeviceId } from "../miniprogram/services/auth.service.ts";
import { setKnownNetworkStatusForTest } from "../miniprogram/utils/network-status.ts";
import {
  clearPerf,
  getPerf,
  recordPagePerformance,
} from "../miniprogram/utils/perf.ts";
import { readBugReportDiagnostics } from "../miniprogram/utils/bug-report-diagnostics.ts";

function installRuntime(handler) {
  const storage = new Map();
  const requests = [];
  const toasts = [];
  let requestHandler = handler;
  globalThis.getApp = () => ({ globalData: { season: "2025-26" } });
  globalThis.wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    getStorageInfoSync: () => ({ keys: Array.from(storage.keys()) }),
    setStorage: ({ key, data, success }) => {
      storage.set(key, data);
      success?.({});
    },
    removeStorage: ({ key, success }) => {
      storage.delete(key);
      success?.({});
    },
    showToast: (options) => toasts.push(options),
    request: (options) => {
      requests.push(options);
      requestHandler(options);
    },
  };
  return {
    requests,
    storage,
    toasts,
    setHandler(next) {
      requestHandler = next;
    },
  };
}

const policy = {
  authMode: "public",
  cachePolicy: "reporting",
};

test("Retry-After accepts seconds and HTTP-date and clamps invalid values", () => {
  const now = Date.parse("2026-08-20T00:00:00.000Z");
  assert.equal(parseRetryAfterSeconds("2", now), 2);
  assert.equal(parseRetryAfterSeconds("0", now), 1);
  assert.equal(parseRetryAfterSeconds("999", now), 120);
  assert.equal(
    parseRetryAfterSeconds("Thu, 20 Aug 2026 00:01:30 GMT", now),
    90,
  );
  assert.equal(parseRetryAfterSeconds("Wed, 19 Aug 2026 23:59:59 GMT", now), 1);
  assert.equal(parseRetryAfterSeconds("not-a-date", now), 15);
  assert.equal(parseRetryAfterSeconds("2099-01-01", now), 15);
  assert.equal(parseRetryAfterSeconds("1.5", now), 15);
  assert.equal(isGraphQLCooldownMessage("请求较多，请在 20 秒后刷新"), true);
  assert.equal(
    isGraphQLCooldownMessage("请求较多，当前显示上次成功数据；20 秒后可刷新"),
    true,
  );
  assert.equal(isGraphQLCooldownMessage("网络超时，请稍后重试"), false);
});

test("the existing persistent device ID is reused only when the Web ingress will accept it", () => {
  const runtime = installRuntime(() => undefined);
  runtime.storage.set("mini-program-device-id", "existing-device_123");
  assert.equal(getMiniProgramDeviceId(), "existing-device_123");

  runtime.storage.set("mini-program-device-id", "unsafe/device");
  const regenerated = getMiniProgramDeviceId();
  assert.match(regenerated, /^[A-Za-z0-9._:-]{8,128}$/);
  assert.notEqual(regenerated, "unsafe/device");
  assert.equal(runtime.storage.get("mini-program-device-id"), regenerated);
});

test("device ID remains stable in memory when synchronous storage is unavailable", () => {
  installRuntime(() => undefined);
  globalThis.wx.getStorageSync = () => {
    throw new Error("storage unavailable");
  };
  globalThis.wx.setStorageSync = () => {
    throw new Error("storage full");
  };

  const first = getMiniProgramDeviceId();
  const second = getMiniProgramDeviceId();
  assert.match(first, /^[A-Za-z0-9._:-]{8,128}$/);
  assert.equal(second, first);
});

test("device ID remains stable when an invalid legacy value is readable but replacement writes fail", () => {
  const runtime = installRuntime(() => undefined);
  runtime.storage.set("mini-program-device-id", "unsafe/device");
  globalThis.wx.setStorageSync = () => {
    throw new Error("storage full");
  };

  const first = getMiniProgramDeviceId();
  const second = getMiniProgramDeviceId();
  assert.match(first, /^[A-Za-z0-9._:-]{8,128}$/);
  assert.equal(second, first);
  assert.equal(runtime.storage.get("mini-program-device-id"), "unsafe/device");
});

test("cooldown remains active and notifies subscribers when storage fails", async () => {
  const runtime = installRuntime(() => {
    throw new Error("cooldown must prevent the network request");
  });
  globalThis.wx.getStorageSync = () => {
    throw new Error("storage unavailable");
  };
  globalThis.wx.setStorageSync = () => {
    throw new Error("storage full");
  };
  const notifications = [];
  const unsubscribe = subscribeGraphQLCooldown((state) => {
    notifications.push(state);
  });

  const persisted = persistGraphQLCooldown(20);
  assert.equal(persisted.active, true);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].active, true);
  assert.equal(getGraphQLCooldownState().active, true);
  await assert.rejects(
    graphqlRead("query StorageFailureCooldown { value }", {}, policy),
    (error) =>
      error instanceof GraphQLTransportError && error.statusCode === 429,
  );
  assert.equal(runtime.requests.length, 0);
  unsubscribe();
});

test("a corrupted future cooldown stays anchored when storage writes fail", () => {
  const runtime = installRuntime(() => undefined);
  const now = Date.parse("2026-08-20T00:00:00.000Z");
  runtime.storage.set("graphql-cooldown-until", now + 5 * 60 * 1000);
  globalThis.wx.setStorageSync = () => {
    throw new Error("storage full");
  };
  globalThis.wx.removeStorageSync = () => {
    throw new Error("storage locked");
  };

  const first = getGraphQLCooldownState(now);
  const second = getGraphQLCooldownState(now + 1_000);
  assert.equal(first.cooldownUntil, now + 120_000);
  assert.equal(second.cooldownUntil, first.cooldownUntil);
  assert.equal(second.remainingSeconds, 119);
  assert.equal(getGraphQLCooldownState(now + 120_001).active, false);
  assert.equal(getGraphQLCooldownState(now + 130_000).active, false);
  assert.equal(
    getGraphQLCooldownState(now + 181_000).active,
    false,
    "the quarantined raw value must not become valid again as the clock approaches it",
  );

  const freshEvidenceAt = now + 181_000;
  const fresh = persistGraphQLCooldown(1, freshEvidenceAt);
  assert.equal(fresh.cooldownUntil, freshEvidenceAt + 1_000);
  assert.equal(fresh.remainingSeconds, 1);
});

test("a cooldown storage read failure does not release corrupt-value quarantine", () => {
  const runtime = installRuntime(() => undefined);
  const now = Date.parse("2026-08-20T00:00:00.000Z");
  runtime.storage.set("graphql-cooldown-until", now + 5 * 60 * 1000);
  const readStoredValue = globalThis.wx.getStorageSync;
  globalThis.wx.setStorageSync = () => {
    throw new Error("storage full");
  };
  globalThis.wx.removeStorageSync = () => {
    throw new Error("storage locked");
  };

  const first = getGraphQLCooldownState(now);
  globalThis.wx.getStorageSync = () => {
    throw new Error("storage temporarily unavailable");
  };
  const duringReadFailure = getGraphQLCooldownState(now + 1_000);
  globalThis.wx.getStorageSync = readStoredValue;
  const afterReadRecovery = getGraphQLCooldownState(now + 2_000);

  assert.equal(first.cooldownUntil, now + 120_000);
  assert.equal(duringReadFailure.cooldownUntil, first.cooldownUntil);
  assert.equal(afterReadRecovery.cooldownUntil, first.cooldownUntil);
  assert.equal(afterReadRecovery.remainingSeconds, 118);
});

test("a corrupted workload cooldown stays anchored when storage writes fail", () => {
  const runtime = installRuntime(() => undefined);
  const now = Date.parse("2026-08-20T00:00:00.000Z");
  runtime.storage.set(
    "graphql-cooldown-workloads-v1:player-stats",
    now + 5 * 60 * 1000,
  );
  globalThis.wx.setStorageSync = () => {
    throw new Error("storage full");
  };
  globalThis.wx.removeStorageSync = () => {
    throw new Error("storage locked");
  };

  const first = getGraphQLCooldownState(now, "player-stats");
  const second = getGraphQLCooldownState(now + 1_000, "player-stats");
  assert.equal(first.cooldownUntil, now + 120_000);
  assert.equal(second.cooldownUntil, first.cooldownUntil);
  assert.equal(second.remainingSeconds, 119);
  assert.equal(
    getGraphQLCooldownState(now + 120_001, "player-stats").active,
    false,
  );
  assert.equal(
    getGraphQLCooldownState(now + 181_000, "player-stats").active,
    false,
    "the quarantined workload value must not become valid again",
  );

  const freshEvidenceAt = now + 181_000;
  const fresh = persistGraphQLCooldown(1, freshEvidenceAt, "player-stats");
  assert.equal(fresh.cooldownUntil, freshEvidenceAt + 1_000);
  assert.equal(fresh.remainingSeconds, 1);
});

test("legacy FORBIDDEN application errors are limited to the viewer-entry recovery predicate", () => {
  assert.equal(
    isViewerEntryAuthorizationError(
      new GraphQLApplicationError([{ extensions: { code: "FORBIDDEN" } }]),
    ),
    true,
  );
  assert.equal(
    isViewerEntryAuthorizationError(
      new GraphQLApplicationError([{ extensions: { code: "UNAUTHENTICATED" } }]),
    ),
    false,
  );
});

test("429 persists one global cooldown, exposes request metadata, and never auto-retries", async () => {
  const runtime = installRuntime((request) =>
    request.success({
      statusCode: 429,
      header: {
        "Retry-After": "20",
        "X-Request-Id": "req-rate-limited",
      },
      data: { errors: [{ message: "rate limited" }] },
    }),
  );
  const query = "query RateLimitColdNoCache { value }";

  await assert.rejects(graphqlRead(query, {}, policy), (error) => {
    assert.ok(error instanceof GraphQLTransportError);
    assert.equal(error.statusCode, 429);
    assert.equal(error.transient, true);
    assert.equal(error.retryAfterSeconds, 20);
    assert.equal(error.requestId, "req-rate-limited");
    assert.ok(error.retryAt > Date.now());
    return true;
  });
  assert.equal(
    runtime.requests.length,
    1,
    "429 must not be retried automatically",
  );
  assert.equal(
    runtime.requests[0].header["X-Letletme-Client"],
    "wechat-miniprogram",
  );
  assert.match(runtime.requests[0].header["X-Letletme-Device-Id"], /^wx-/);
  assert.equal("Authorization" in runtime.requests[0].header, false);

  const state = getGraphQLCooldownState();
  assert.equal(state.active, true);
  assert.ok(state.remainingSeconds >= 19);

  await assert.rejects(
    graphqlRead(
      "query RateLimitSecondSurface { value }",
      {},
      {
        ...policy,
        forceRefresh: true,
      },
    ),
    (error) =>
      error instanceof GraphQLTransportError && error.statusCode === 429,
  );
  assert.equal(
    runtime.requests.length,
    1,
    "onShow/retry/pull-refresh equivalents cannot bypass the cooldown",
  );
});

test("workload-scoped 429 cools only the affected Mini workload", async () => {
  const runtime = installRuntime((request) =>
    request.success({
      statusCode: 429,
      header: {
        "Retry-After": "20",
        "X-Request-Id": "req-player-stats-rate-limited",
        "X-RateLimit-Policy": "graphql-v4",
        "X-RateLimit-Scope": "workload",
        "X-RateLimit-Workload": "player-stats",
      },
      data: { errors: [{ message: "rate limited" }] },
    }),
  );

  await assert.rejects(
    graphqlRead(
      "query PlayersForPicker { playersForPicker { items { id } } }",
      {},
      { forceRefresh: true },
    ),
    (error) => {
      assert.ok(error instanceof GraphQLTransportError);
      assert.equal(error.statusCode, 429);
      assert.equal(error.rateLimitPolicy, "graphql-v4");
      assert.equal(error.rateLimitScope, "workload");
      assert.equal(error.rateLimitWorkload, "player-stats");
      return true;
    },
  );

  assert.equal(
    getGraphQLCooldownState(Date.now(), "player-stats").active,
    true,
  );
  assert.equal(getGraphQLCooldownState(Date.now(), "fixtures").active, false);
  assert.equal(getGraphQLCooldownState(Date.now()).active, false);
  await assert.rejects(
    graphqlRead(
      "query PlayersForPicker { playersForPicker { items { id } } }",
      {},
      { forceRefresh: true },
    ),
    (error) =>
      error instanceof GraphQLTransportError && error.statusCode === 429,
  );
  assert.equal(runtime.requests.length, 1);
});

test("cache-policy overrides derive the matching workload cooldown key", async () => {
  const runtime = installRuntime((request) =>
    request.success({
      statusCode: 429,
      header: {
        "Retry-After": "20",
        "X-RateLimit-Scope": "workload",
        "X-RateLimit-Workload": "market",
      },
      data: { errors: [{ message: "rate limited" }] },
    }),
  );
  const options = {
    ...policy,
    cachePolicy: "market",
    forceRefresh: true,
  };

  await assert.rejects(
    graphqlRead(
      "query MiniMarketOwnershipDay { value }",
      {},
      options,
    ),
    (error) => error instanceof GraphQLTransportError && error.statusCode === 429,
  );
  await assert.rejects(
    graphqlRead(
      "query MiniMarketOwnershipDay { value }",
      {},
      options,
    ),
    (error) => error instanceof GraphQLTransportError && error.statusCode === 429,
  );
  assert.equal(runtime.requests.length, 1);
  assert.equal(getGraphQLCooldownState(Date.now(), "market").active, true);
  assert.equal(getGraphQLCooldownState(Date.now(), "public-other").active, false);
});

test("429 serves stale data and every cooldown read performs zero network requests", async () => {
  const runtime = installRuntime((request) =>
    request.success({
      statusCode: 200,
      data: { data: { value: "last-good" } },
    }),
  );
  const query = "query RateLimitStaleFallback { value }";
  const options = {
    ...policy,
    cacheTtl: 1,
    staleTtl: 60_000,
  };

  await graphqlRead(query, {}, options);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.setHandler((request) =>
    request.success({
      statusCode: 429,
      header: {
        "retry-after": "30",
        "x-request-id": "req-stale-429",
        "x-ratelimit-policy": "graphql-v4",
        "x-ratelimit-scope": "workload",
        "x-ratelimit-workload": "interactive",
      },
      data: { errors: [{ message: "rate limited" }] },
    }),
  );

  const firstStale = await graphqlRead(
    query,
    {},
    {
      ...options,
      forceRefresh: true,
    },
  );
  assert.equal(firstStale.data.value, "last-good");
  assert.equal(firstStale.meta.source, "stale");
  assert.equal(firstStale.meta.rateLimited, true);
  assert.equal(firstStale.meta.requestId, "req-stale-429");
  assert.equal(firstStale.meta.statusCode, 429);
  assert.equal(firstStale.meta.retryAfterSeconds, 30);
  assert.equal(firstStale.meta.rateLimitPolicy, "graphql-v4");
  assert.equal(firstStale.meta.rateLimitScope, "workload");
  assert.equal(firstStale.meta.rateLimitWorkload, "interactive");
  assert.deepEqual(
    readBugReportDiagnostics().at(-1),
    {
      at: readBugReportDiagnostics().at(-1).at,
      requestId: "req-stale-429",
      operation: "RateLimitStaleFallback",
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 30,
      rateLimitPolicy: "graphql-v4",
      rateLimitScope: "workload",
      workload: "interactive",
      message: "stale",
    },
  );
  assert.equal(runtime.requests.length, 2);

  const secondStale = await graphqlRead(
    query,
    {},
    {
      ...options,
      forceRefresh: true,
    },
  );
  assert.equal(secondStale.data.value, "last-good");
  assert.equal(secondStale.meta.rateLimited, true);
  assert.equal(runtime.requests.length, 2);
});

test("persisted cooldown surfaces a stale-data notice before returning cached data", async () => {
  const runtime = installRuntime((request) =>
    request.success({
      statusCode: 200,
      data: { data: { value: "last-good" } },
    }),
  );
  const query = "query PersistedCooldownStaleNotice { value }";
  const options = {
    ...policy,
    cacheTtl: 1,
    staleTtl: 60_000,
  };

  await graphqlRead(query, {}, options);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.storage.set("graphql-cooldown-until", Date.now() + 30_000);

  const stale = await graphqlRead(
    query,
    {},
    { ...options, forceRefresh: true },
  );
  assert.equal(stale.meta.rateLimited, true);
  assert.equal(stale.meta.source, "stale");
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.toasts.length, 1);
  assert.match(runtime.toasts[0].title, /当前显示上次成功数据/);
});

test("a cooldown established during the network probe is not counted as network traffic", async () => {
  const runtime = installRuntime(() => {
    throw new Error("cooldown must suppress wx.request");
  });
  let finishProbe;
  globalThis.wx.getNetworkType = ({ success, complete }) => {
    finishProbe = () => {
      success?.({ networkType: "wifi" });
      complete?.({ networkType: "wifi" });
    };
  };
  setKnownNetworkStatusForTest(null, {
    listenerInstalled: false,
    lastProbeAt: 0,
  });
  clearPerf();
  const navigationId = "cooldown-probe-race";
  recordPagePerformance({
    navigationId,
    route: "pages/test/cooldown",
    trigger: "refresh",
    routeStartedAt: Date.now(),
    operationCount: 0,
    networkOperationCount: 0,
  });

  const read = graphqlRead(
    "query CooldownProbeRace { value }",
    {},
    {
      ...policy,
      trace: {
        navigationId,
        callerSurface: "cooldown-race",
        trigger: "refresh",
        contextRevision: 1,
      },
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof finishProbe, "function");
  persistGraphQLCooldown(20);
  finishProbe();

  await assert.rejects(
    read,
    (error) =>
      error instanceof GraphQLTransportError && error.statusCode === 429,
  );
  const perf = getPerf();
  const page = perf.pagePerformance.find(
    (item) => item.navigationId === navigationId,
  );
  assert.equal(runtime.requests.length, 0);
  assert.equal(page.networkOperationCount, 0);
  assert.equal(perf.apiRecords.at(-1).networkAttempted, false);
});

test("after cooldown expiry, concurrent refreshes share one in-flight request", async () => {
  const runtime = installRuntime((request) => {
    setTimeout(
      () =>
        request.success({
          statusCode: 200,
          data: { data: { value: "fresh" } },
        }),
      10,
    );
  });
  runtime.storage.set("graphql-cooldown-until", Date.now() - 1);
  const query = "query RateLimitRecoverySingleFlight { value }";

  const reads = await Promise.all(
    Array.from({ length: 20 }, () =>
      graphqlRead(
        query,
        {},
        {
          ...policy,
          forceRefresh: true,
        },
      ),
    ),
  );
  assert.equal(runtime.requests.length, 1);
  assert.equal(
    reads.every((read) => read.data.value === "fresh"),
    true,
  );
});

test("an identical in-flight read is joined after another operation starts cooldown", async () => {
  let requestCount = 0;
  let completeFirst;
  const runtime = installRuntime((request) => {
    requestCount += 1;
    if (requestCount === 1) {
      completeFirst = () =>
        request.success({
          statusCode: 200,
          data: { data: { value: "completed" } },
        });
      return;
    }
    request.success({
      statusCode: 429,
      header: { "Retry-After": "30" },
      data: { errors: [{ message: "rate limited" }] },
    });
  });
  const pendingQuery = "query InFlightBeforeCooldown { value }";

  const first = graphqlRead(
    pendingQuery,
    {},
    { ...policy, forceRefresh: true },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof completeFirst, "function");
  await assert.rejects(
    graphqlRead(
      "query StartsOtherCooldown { value }",
      {},
      {
        ...policy,
        forceRefresh: true,
      },
    ),
    (error) =>
      error instanceof GraphQLTransportError && error.statusCode === 429,
  );

  const joined = graphqlRead(
    pendingQuery,
    {},
    { ...policy, forceRefresh: true },
  );
  completeFirst();
  const [firstResult, joinedResult] = await Promise.all([first, joined]);
  assert.equal(firstResult.meta.source, "network");
  assert.equal(joinedResult.meta.source, "in-flight");
  assert.equal(joinedResult.data.value, "completed");
  assert.equal(runtime.requests.length, 2);
});
