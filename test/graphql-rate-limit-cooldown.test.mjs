import assert from "node:assert/strict";
import test from "node:test";

import {
  GraphQLTransportError,
  graphqlRead,
} from "../miniprogram/services/graphql.service.ts";
import {
  getGraphQLCooldownState,
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
  assert.equal(
    parseRetryAfterSeconds("Wed, 19 Aug 2026 23:59:59 GMT", now),
    1,
  );
  assert.equal(parseRetryAfterSeconds("not-a-date", now), 15);
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
    (error) => error instanceof GraphQLTransportError && error.statusCode === 429,
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

test("429 persists one global cooldown, exposes request metadata, and never auto-retries", async () => {
  const runtime = installRuntime((request) => request.success({
    statusCode: 429,
    header: {
      "Retry-After": "20",
      "X-Request-Id": "req-rate-limited",
    },
    data: { errors: [{ message: "rate limited" }] },
  }));
  const query = "query RateLimitColdNoCache { value }";

  await assert.rejects(
    graphqlRead(query, {}, policy),
    (error) => {
      assert.ok(error instanceof GraphQLTransportError);
      assert.equal(error.statusCode, 429);
      assert.equal(error.transient, true);
      assert.equal(error.retryAfterSeconds, 20);
      assert.equal(error.requestId, "req-rate-limited");
      assert.ok(error.retryAt > Date.now());
      return true;
    },
  );
  assert.equal(runtime.requests.length, 1, "429 must not be retried automatically");
  assert.equal(runtime.requests[0].header["X-Letletme-Client"], "wechat-miniprogram");
  assert.match(runtime.requests[0].header["X-Letletme-Device-Id"], /^wx-/);
  assert.equal("Authorization" in runtime.requests[0].header, false);

  const state = getGraphQLCooldownState();
  assert.equal(state.active, true);
  assert.ok(state.remainingSeconds >= 19);

  await assert.rejects(
    graphqlRead("query RateLimitSecondSurface { value }", {}, {
      ...policy,
      forceRefresh: true,
    }),
    (error) => error instanceof GraphQLTransportError && error.statusCode === 429,
  );
  assert.equal(
    runtime.requests.length,
    1,
    "onShow/retry/pull-refresh equivalents cannot bypass the cooldown",
  );
});

test("429 serves stale data and every cooldown read performs zero network requests", async () => {
  const runtime = installRuntime((request) => request.success({
    statusCode: 200,
    data: { data: { value: "last-good" } },
  }));
  const query = "query RateLimitStaleFallback { value }";
  const options = {
    ...policy,
    cacheTtl: 1,
    staleTtl: 60_000,
  };

  await graphqlRead(query, {}, options);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.setHandler((request) => request.success({
    statusCode: 429,
    header: { "retry-after": "30", "x-request-id": "req-stale-429" },
    data: { errors: [{ message: "rate limited" }] },
  }));

  const firstStale = await graphqlRead(query, {}, {
    ...options,
    forceRefresh: true,
  });
  assert.equal(firstStale.data.value, "last-good");
  assert.equal(firstStale.meta.source, "stale");
  assert.equal(firstStale.meta.rateLimited, true);
  assert.equal(firstStale.meta.requestId, "req-stale-429");
  assert.equal(runtime.requests.length, 2);

  const secondStale = await graphqlRead(query, {}, {
    ...options,
    forceRefresh: true,
  });
  assert.equal(secondStale.data.value, "last-good");
  assert.equal(secondStale.meta.rateLimited, true);
  assert.equal(runtime.requests.length, 2);
});

test("persisted cooldown surfaces a stale-data notice before returning cached data", async () => {
  const runtime = installRuntime((request) => request.success({
    statusCode: 200,
    data: { data: { value: "last-good" } },
  }));
  const query = "query PersistedCooldownStaleNotice { value }";
  const options = {
    ...policy,
    cacheTtl: 1,
    staleTtl: 60_000,
  };

  await graphqlRead(query, {}, options);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.storage.set("graphql-cooldown-until", Date.now() + 30_000);

  const stale = await graphqlRead(query, {}, { ...options, forceRefresh: true });
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

  const read = graphqlRead("query CooldownProbeRace { value }", {}, {
    ...policy,
    trace: {
      navigationId,
      callerSurface: "cooldown-race",
      trigger: "refresh",
      contextRevision: 1,
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof finishProbe, "function");
  persistGraphQLCooldown(20);
  finishProbe();

  await assert.rejects(
    read,
    (error) => error instanceof GraphQLTransportError && error.statusCode === 429,
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
    setTimeout(() => request.success({
      statusCode: 200,
      data: { data: { value: "fresh" } },
    }), 10);
  });
  runtime.storage.set("graphql-cooldown-until", Date.now() - 1);
  const query = "query RateLimitRecoverySingleFlight { value }";

  const reads = await Promise.all(
    Array.from({ length: 20 }, () => graphqlRead(query, {}, {
      ...policy,
      forceRefresh: true,
    })),
  );
  assert.equal(runtime.requests.length, 1);
  assert.equal(reads.every((read) => read.data.value === "fresh"), true);
});

test("an identical in-flight read is joined after another operation starts cooldown", async () => {
  let requestCount = 0;
  let completeFirst;
  const runtime = installRuntime((request) => {
    requestCount += 1;
    if (requestCount === 1) {
      completeFirst = () => request.success({
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

  const first = graphqlRead(pendingQuery, {}, { ...policy, forceRefresh: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof completeFirst, "function");
  await assert.rejects(
    graphqlRead("query StartsOtherCooldown { value }", {}, {
      ...policy,
      forceRefresh: true,
    }),
    (error) => error instanceof GraphQLTransportError && error.statusCode === 429,
  );

  const joined = graphqlRead(pendingQuery, {}, { ...policy, forceRefresh: true });
  completeFirst();
  const [firstResult, joinedResult] = await Promise.all([first, joined]);
  assert.equal(firstResult.meta.source, "network");
  assert.equal(joinedResult.meta.source, "in-flight");
  assert.equal(joinedResult.data.value, "completed");
  assert.equal(runtime.requests.length, 2);
});
