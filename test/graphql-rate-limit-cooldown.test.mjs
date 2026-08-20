import assert from "node:assert/strict";
import test from "node:test";

import {
  GraphQLTransportError,
  graphqlRead,
} from "../miniprogram/services/graphql.service.ts";
import {
  getGraphQLCooldownState,
  parseRetryAfterSeconds,
} from "../miniprogram/services/graphql-cooldown.ts";
import { getMiniProgramDeviceId } from "../miniprogram/services/auth.service.ts";

function installRuntime(handler) {
  const storage = new Map();
  const requests = [];
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
    showToast: () => undefined,
    request: (options) => {
      requests.push(options);
      requestHandler(options);
    },
  };
  return {
    requests,
    storage,
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
