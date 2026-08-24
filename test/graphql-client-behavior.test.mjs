import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGraphQLRequestHeaders,
  GraphQLApplicationError,
  graphqlRead,
  graphqlRequest,
  purgeGraphQLStorageCache
} from "../miniprogram/services/graphql.service.ts";
import {
  clearSessionCredentials,
  restoreApiSessionCredentials
} from "../miniprogram/services/auth.service.ts";

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
    }
  };
  return {
    requests,
    storage,
    setHandler(next) {
      requestHandler = next;
    }
  };
}

function success(data, errors) {
  return (options) => options.success({
    statusCode: 200,
    data: { data, ...(errors ? { errors } : {}) }
  });
}

const publicReporting = {
  authMode: "public",
  cachePolicy: "reporting"
};

test("public headers omit Bearer while session headers include it", () => {
  assert.deepEqual(buildGraphQLRequestHeaders("public", "secret-token", "wx-device-123"), {
    "content-type": "application/json",
    "X-Letletme-Client": "wechat-miniprogram",
    "X-Letletme-Device-Id": "wx-device-123"
  });
  assert.deepEqual(buildGraphQLRequestHeaders("session", "secret-token", "wx-device-123"), {
    "content-type": "application/json",
    "X-Letletme-Client": "wechat-miniprogram",
    "X-Letletme-Device-Id": "wx-device-123",
    Authorization: "Bearer secret-token"
  });
});

test("fresh cache, force refresh, L1 limit, and L2 storage use one policy", async () => {
  const runtime = installRuntime(success({ value: 1 }));
  const query = "query BehaviorCache { value }";

  const first = await graphqlRead(query, {}, publicReporting);
  const second = await graphqlRead(query, {}, publicReporting);
  assert.equal(first.meta.source, "network");
  assert.equal(second.meta.source, "memory");
  assert.equal(runtime.requests.length, 1);

  const forced = await graphqlRead(query, {}, {
    ...publicReporting,
    forceRefresh: true
  });
  assert.equal(forced.meta.source, "network");
  assert.equal(runtime.requests.length, 2);

  for (let index = 0; index < 125; index += 1) {
    await graphqlRead(`query BehaviorL1_${index} { value }`, {}, publicReporting);
  }
  const beforeStorageRead = runtime.requests.length;
  const fromStorage = await graphqlRead(query, {}, publicReporting);
  assert.equal(fromStorage.meta.source, "storage");
  assert.equal(runtime.requests.length, beforeStorageRead);
  assert.ok(Array.from(runtime.storage.keys()).some((key) => key.startsWith("gql:v2:public:")));
});

test("startup cleanup removes legacy, invalid, expired, and oldest excess rows", () => {
  const runtime = installRuntime(success({ value: 1 }));
  const now = 1_000_000;
  runtime.storage.set("gql:legacy", { version: 1, staleUntil: now + 1 });
  runtime.storage.set("gql:v2:other:invalid", { version: 2, staleUntil: now + 1 });
  runtime.storage.set("gql:v2:public:wrong-version", { version: 1, staleUntil: now + 1 });
  runtime.storage.set("gql:v2:session:expired", { version: 2, staleUntil: now });
  for (let index = 0; index < 152; index += 1) {
    runtime.storage.set(`gql:v2:public:valid-${index}`, {
      version: 2,
      staleUntil: now + 60_000,
      storedAt: index
    });
  }

  purgeGraphQLStorageCache(now);

  assert.equal(runtime.storage.has("gql:legacy"), false);
  assert.equal(runtime.storage.has("gql:v2:other:invalid"), false);
  assert.equal(runtime.storage.has("gql:v2:public:wrong-version"), false);
  assert.equal(runtime.storage.has("gql:v2:session:expired"), false);
  assert.equal(runtime.storage.has("gql:v2:public:valid-0"), false);
  assert.equal(runtime.storage.has("gql:v2:public:valid-1"), false);
  assert.equal(runtime.storage.has("gql:v2:public:valid-151"), true);
  assert.equal(runtime.storage.size, 150);
});

test("identical concurrent reads are single-flight", async () => {
  const runtime = installRuntime((options) => {
    setTimeout(() => success({ value: 2 })(options), 10);
  });
  const query = "query BehaviorSingleFlight { value }";
  const [first, second] = await Promise.all([
    graphqlRead(query, {}, publicReporting),
    graphqlRead(query, {}, publicReporting)
  ]);

  assert.equal(runtime.requests.length, 1);
  assert.deepEqual(new Set([first.meta.source, second.meta.source]), new Set(["network", "in-flight"]));
});

test("partial GraphQL data is readable but never cached", async () => {
  const errors = [{ message: "section unavailable", path: ["section"] }];
  const runtime = installRuntime(success({ section: null, retained: true }, errors));
  const query = "query BehaviorPartial { section retained }";

  const first = await graphqlRead(query, {}, publicReporting);
  const second = await graphqlRead(query, {}, publicReporting);
  assert.equal(first.data.retained, true);
  assert.equal(first.errors.length, 1);
  assert.equal(second.meta.source, "network");
  assert.equal(runtime.requests.length, 2);
  await assert.rejects(graphqlRequest(query, {}, publicReporting));
  assert.equal(runtime.requests.length, 3);
});

test("stale fallback is limited to transient transport failures", async () => {
  const runtime = installRuntime(success({ value: "last-good" }));
  const query = "query BehaviorStale { value }";
  const options = {
    ...publicReporting,
    cacheTtl: 1,
    staleTtl: 60_000
  };

  await graphqlRead(query, {}, options);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.setHandler((request) => request.fail({ errMsg: "request:fail timeout" }));
  const stale = await graphqlRead(query, {}, { ...options, forceRefresh: true });
  assert.equal(stale.meta.source, "stale");
  assert.equal(stale.meta.stale, true);
  assert.equal(stale.data.value, "last-good");

  runtime.setHandler((request) => request.success({
    statusCode: 401,
    data: { errors: [{ message: "unauthorized" }] }
  }));
  await assert.rejects(graphqlRead(query, {}, { ...options, forceRefresh: true }));

  runtime.setHandler((request) => request.success({
    statusCode: 200,
    data: {
      errors: [{
        message: "Unknown field",
        extensions: { code: "GRAPHQL_VALIDATION_FAILED" }
      }]
    }
  }));
  await assert.rejects(graphqlRead(query, {}, { ...options, forceRefresh: true }));
});

test("session refresh network failure serves stale data without a second refresh", async () => {
  const runtime = installRuntime(success({ value: "last-good" }));
  const query = "query BehaviorSessionRefreshStale { value }";
  const options = {
    authMode: "session",
    cachePolicy: "reporting",
    cacheTtl: 1,
    staleTtl: 60_000
  };

  clearSessionCredentials();
  runtime.storage.set("api-session-token", "expired-upstream-token");
  runtime.storage.set("api-session-expires-at", "2099-01-01T00:00:00.000Z");
  globalThis.wx.canIUse = () => false;
  await restoreApiSessionCredentials();

  try {
    await graphqlRead(query, {}, options);
    await new Promise((resolve) => setTimeout(resolve, 5));
    globalThis.wx.login = ({ success: loginSuccess }) => {
      loginSuccess({ code: "refresh-code" });
    };
    runtime.setHandler((request) => {
      if (request.url.endsWith("/wechat/login")) {
        request.fail({ errMsg: "request:fail timeout" });
        return;
      }
      request.success({
        statusCode: 401,
        data: { errors: [{ message: "unauthorized" }] }
      });
    });

    const stale = await graphqlRead(query, {}, {
      ...options,
      forceRefresh: true
    });
    assert.equal(stale.meta.source, "stale");
    assert.equal(stale.meta.stale, true);
    assert.equal(stale.data.value, "last-good");
    assert.equal(runtime.requests.length, 3);
  } finally {
    clearSessionCredentials();
  }
});

test("session retry re-keys the in-flight request for the refreshed token", async () => {
  let graphQLRequests = 0;
  let retryRequest;
  const runtime = installRuntime((request) => {
    if (request.url.endsWith("/wechat/login")) {
      request.success({
        statusCode: 200,
        data: {
          success: true,
          contractVersion: 2,
          authenticated: true,
          webAccountLinked: false,
          token: "refreshed-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
          profile: {
            id: "refreshed-account",
            followEntryId: 202,
            effectiveEntryId: 202,
            effectiveEntrySource: "MINI",
            webAccountLinked: false,
            entryConflict: false,
            wechatLinked: true,
          },
        },
      });
      return;
    }
    graphQLRequests += 1;
    if (graphQLRequests === 1) {
      request.success({
        statusCode: 401,
        data: { errors: [{ extensions: { code: "UNAUTHENTICATED" } }] },
      });
      return;
    }
    retryRequest = request;
  });
  globalThis.wx.login = ({ success: loginSuccess }) => {
    loginSuccess({ code: "refresh-code" });
  };
  clearSessionCredentials();
  runtime.storage.set("api-session-token", "expired-session-token");
  runtime.storage.set("api-session-expires-at", "2099-01-01T00:00:00.000Z");
  await restoreApiSessionCredentials();

  const query = "query SessionRetryRekey { value }";
  const options = {
    authMode: "session",
    cachePolicy: "reporting",
    forceRefresh: true,
  };
  const first = graphqlRead(query, {}, options);
  for (let attempt = 0; attempt < 10 && !retryRequest; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(retryRequest, "the refreshed-token retry is pending");

  const second = graphqlRead(query, {}, options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    graphQLRequests,
    2,
    "the second caller joins the refreshed-token retry",
  );
  retryRequest.success({
    statusCode: 200,
    data: { data: { value: "refreshed" } },
  });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.data.value, "refreshed");
  assert.equal(secondResult.data.value, "refreshed");
  assert.equal(secondResult.meta.source, "in-flight");
  clearSessionCredentials();
});

test("session retry joins a request already running under the refreshed token", async () => {
  let graphQLRequests = 0;
  let firstRequest;
  let secondRequest;
  const runtime = installRuntime((request) => {
    graphQLRequests += 1;
    if (graphQLRequests === 1) {
      firstRequest = request;
      return;
    }
    if (graphQLRequests === 2) {
      secondRequest = request;
      return;
    }
    request.fail({ errMsg: "unexpected duplicate GraphQL request" });
  });
  clearSessionCredentials();
  runtime.storage.set("api-session-token", "session-a");
  runtime.storage.set("api-session-expires-at", "2099-01-01T00:00:00.000Z");
  await restoreApiSessionCredentials();

  const query = "query SessionRetryCollision { value }";
  const options = {
    authMode: "session",
    cachePolicy: "reporting",
    forceRefresh: true,
  };
  const first = graphqlRead(query, {}, options);
  for (let attempt = 0; attempt < 10 && !firstRequest; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(firstRequest, "the old-token request is pending");

  clearSessionCredentials();
  runtime.storage.set("api-session-token", "session-b");
  runtime.storage.set("api-session-expires-at", "2099-01-01T00:00:00.000Z");
  await restoreApiSessionCredentials();
  const second = graphqlRead(query, {}, options);
  for (let attempt = 0; attempt < 10 && !secondRequest; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(secondRequest, "the refreshed-token request is pending");

  firstRequest.success({
    statusCode: 401,
    data: { errors: [{ extensions: { code: "UNAUTHENTICATED" } }] },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    graphQLRequests,
    2,
    "the old-token retry joins the existing refreshed-token request",
  );

  secondRequest.success({
    statusCode: 200,
    data: { data: { value: "refreshed" } },
  });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.data.value, "refreshed");
  assert.equal(secondResult.data.value, "refreshed");
  assert.equal(firstResult.meta.source, "in-flight");
  clearSessionCredentials();
});

test("application error text containing 429 never serves stale data", async () => {
  const runtime = installRuntime(success({ value: "last-good" }));
  const query = "query BehaviorApplicationText429 { value }";
  const options = {
    ...publicReporting,
    cacheTtl: 1,
    staleTtl: 60_000
  };

  await graphqlRead(query, {}, options);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.setHandler((request) => request.success({
    statusCode: 200,
    data: { errors: [{ message: "Entry 429 was not found" }] }
  }));

  await assert.rejects(
    graphqlRead(query, {}, { ...options, forceRefresh: true }),
    (error) => error instanceof GraphQLApplicationError
      && error.errors.some((item) => item.message === "Entry 429 was not found")
  );
  assert.equal(runtime.requests.length, 2);
});
