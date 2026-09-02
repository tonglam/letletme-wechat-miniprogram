import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGraphQLRequestHeaders,
  GraphQLApplicationError,
  graphqlRead,
  graphqlRequest,
  isLivePointsV2Query,
  LIVE_POINTS_CONTRACT_VERSION,
  LIVE_POINTS_V2_ROOT_FIELDS,
  liveContractVersionForQuery,
  purgeGraphQLStorageCache,
  shouldCacheGraphQLData,
} from "../miniprogram/services/graphql.service.ts";
import { MINI_HOME_DREAM_TEAM_QUERY } from "../miniprogram/services/home.service.ts";
import { GET_TOURNAMENT_DETAIL_DESK } from "../miniprogram/services/tournament-detail.service.ts";
import {
  clearSessionCredentials,
  restoreApiSessionCredentials
} from "../miniprogram/services/auth.service.ts";
import { acknowledgeDiagnosticDisclosure } from "../miniprogram/utils/privacy.ts";

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
    canIUse: (schema) =>
      schema === "setStorage.object.encrypt" ||
      schema === "getStorage.object.encrypt",
    getStorage: ({ key, success, fail }) => {
      if (storage.has(key)) {
        success?.({ data: storage.get(key), errMsg: "getStorage:ok" });
      } else {
        fail?.({ errMsg: "getStorage:fail data not found" });
      }
    },
    showToast: () => undefined,
    request: (options) => {
      if (options.url.endsWith("/api/miniprogram/telemetry")) {
        options.success?.({ statusCode: 202, data: { accepted: true } });
        return;
      }
      requests.push(options);
      requestHandler(options);
    }
  };
  acknowledgeDiagnosticDisclosure();
  storage.delete("auth-diagnostic-disclosure-v1");
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

test("Live Points and Live Matches use distinct hard-cut contracts", () => {
  assert.equal(
    liveContractVersionForQuery("query Match { liveMatchday { availability } }"),
    "live-matches-v3",
  );
  assert.equal(
    liveContractVersionForQuery(
      "query Points { calcLivePointsByEntry(eventId: 1, entryId: 1) { availability } }",
    ),
    "live-points-v2",
  );
  assert.equal(liveContractVersionForQuery("query Teams { teams { id } }"), null);
  assert.throws(
    () =>
      liveContractVersionForQuery(
        "query Mixed { liveMatchday { availability } calcLivePointsByEntry(eventId: 1, entryId: 1) { availability } }",
      ),
    /LIVE_CONTRACT_MIXED_OPERATION/,
  );
});

test("Live Points covers every gated root and both previously omitted Mini desks", () => {
  assert.deepEqual(new Set(LIVE_POINTS_V2_ROOT_FIELDS), new Set([
    "calcLivePointsByEntry",
    "calcLivePointsForEntries",
    "liveScores",
    "playerLive",
    "eventLive",
    "eventLiveExplain",
    "eventLiveExplains",
    "liveSnapshot",
    "liveContext",
    "entryLiveCompetitionBoard",
    "leagueLiveHead",
    "tournamentOfficialH2H",
    "tournamentOfficialH2HHistory",
    "tournamentSelectionIndex",
    "tournamentEntrySquads",
    "tournamentDetailDesk",
    "gameweekDesk",
    "homeGameweek",
  ]));
  for (const document of [
    MINI_HOME_DREAM_TEAM_QUERY,
    GET_TOURNAMENT_DETAIL_DESK,
  ]) {
    assert.equal(isLivePointsV2Query(document), true);
    assert.equal(
      liveContractVersionForQuery(document),
      LIVE_POINTS_CONTRACT_VERSION,
    );
  }
});

test("affected Mini desks send the Live Points V2 header through wx.request", async () => {
  const runtime = installRuntime(success({ homeGameweek: { gameweekDesk: {} } }));

  await graphqlRequest(
    MINI_HOME_DREAM_TEAM_QUERY,
    { eventId: 1 },
    { ...publicReporting, forceRefresh: true },
  );
  await graphqlRequest(
    GET_TOURNAMENT_DETAIL_DESK,
    { tournamentId: 1, entryId: 1, eventId: 1 },
    {
      ...publicReporting,
      cacheVariant: "tournament:1:entry:1:event:1",
      forceRefresh: true,
    },
  );

  assert.equal(runtime.requests.length, 2);
  for (const request of runtime.requests) {
    assert.equal(
      request.header["X-LetLetMe-Contract"],
      LIVE_POINTS_CONTRACT_VERSION,
    );
  }
});

test("V2 review requests carry an explicit contract header", () => {
  assert.equal(
    buildGraphQLRequestHeaders(
      "session",
      "secret-token",
      "wx-device-123",
      "my-tournament-review-v2.1",
    )["X-LetLetMe-Contract"],
    "my-tournament-review-v2.1",
  );
});

test("V2 review cache accepts only fully READY snapshots", () => {
  const transientStates = [
    "PENDING",
    "WAITING_SOURCE",
    "DEGRADED",
    "UNAVAILABLE",
  ];
  for (const state of transientStates) {
    assert.equal(
      shouldCacheGraphQLData("MyTournamentGameweekReview", {
        myTournamentGameweekReview: { state },
      }),
      false,
    );
    assert.equal(
      shouldCacheGraphQLData("MyTournamentSeasonReview", {
        myTournamentSeasonReview: { state },
      }),
      false,
    );
    assert.equal(
      shouldCacheGraphQLData("MyTournamentReviewCatalog", {
        myTournamentReviewCatalog: {
          state: "READY",
          edges: [{ node: { state: "READY" } }, { node: { state } }],
        },
      }),
      false,
    );
  }

  assert.equal(
    shouldCacheGraphQLData("MyTournamentGameweekReview", {
      myTournamentGameweekReview: { state: "READY" },
    }),
    true,
  );
  assert.equal(
    shouldCacheGraphQLData("MyTournamentSeasonReview", {
      myTournamentSeasonReview: {
        state: "READY",
        phases: [{ state: "READY", revision: "1", semanticSha256: "sha-1" }],
      },
    }),
    true,
  );
  assert.equal(
    shouldCacheGraphQLData("MyTournamentSeasonReview", {
      myTournamentSeasonReview: {
        state: "READY",
        phases: [
          { state: "READY", revision: "1", semanticSha256: "sha-1" },
          { state: "PENDING", revision: null, semanticSha256: null },
        ],
      },
    }),
    false,
  );
  assert.equal(
    shouldCacheGraphQLData("MyTournamentReviewCatalog", {
      myTournamentReviewCatalog: {
        state: "READY",
        edges: [{ node: { state: "READY" } }],
      },
    }),
    true,
  );
});

test("cache identity validation evicts a mismatched V2 catalog", async () => {
  let responseViewerEntryId = 222;
  const runtime = installRuntime((options) =>
    options.success({
      statusCode: 200,
      data: {
        data: {
          myTournamentReviewCatalog: {
            state: "READY",
            viewerEntryId: responseViewerEntryId,
            adminReadAll: false,
            edges: [{ node: { state: "READY", tournamentId: 6953 } }],
          },
        },
      },
    }),
  );
  const query =
    "query MyTournamentReviewCatalog { myTournamentReviewCatalog { state viewerEntryId } }";
  const options = {
    ...publicReporting,
    cacheVariant: "viewer-entry:111",
    validateCacheData: (data) =>
      data?.myTournamentReviewCatalog?.viewerEntryId === 111,
  };

  const mismatched = await graphqlRead(query, {}, options);
  assert.equal(mismatched.meta.source, "network");
  assert.equal(runtime.requests.length, 1);

  responseViewerEntryId = 111;
  const matching = await graphqlRead(query, {}, options);
  assert.equal(matching.meta.source, "network");
  assert.equal(runtime.requests.length, 2);

  const cached = await graphqlRead(query, {}, options);
  assert.equal(cached.meta.source, "memory");
  assert.equal(runtime.requests.length, 2);
});

test("cache identity validation rejects fresh and stale viewer candidates", async () => {
  let expectedViewer = 111;
  let responseViewer = 111;
  let failRequests = false;
  const runtime = installRuntime((request) => {
    if (failRequests) {
      request.fail({ errMsg: "request:fail timeout" });
      return;
    }
    request.success({
      statusCode: 200,
      data: { data: { value: { viewer: responseViewer } } },
    });
  });
  const validateViewer = (data) => data?.value?.viewer === expectedViewer;
  const query = "query ViewerCacheFreshValidation { value { viewer } }";
  const options = {
    ...publicReporting,
    cacheTtl: 60_000,
    staleTtl: 60_000,
    cacheVariant: "viewer-entry:111",
    validateCacheData: validateViewer,
  };

  await graphqlRead(query, {}, options);
  expectedViewer = 222;
  responseViewer = 222;
  const refreshed = await graphqlRead(query, {}, options);
  assert.equal(refreshed.meta.source, "network");
  assert.equal(runtime.requests.length, 2);

  const staleQuery = "query ViewerCacheStaleValidation { value { viewer } }";
  expectedViewer = 111;
  responseViewer = 111;
  const staleOptions = {
    ...options,
    cacheTtl: 1,
    cacheVariant: "viewer-entry:111-stale",
  };
  await graphqlRead(staleQuery, {}, staleOptions);
  await new Promise((resolve) => setTimeout(resolve, 5));
  expectedViewer = 222;
  failRequests = true;
  // The invalid validator evicts the expired entry before stale fallback is
  // selected, so a transient failure cannot return the wrong viewer payload.
  await assert.rejects(
    graphqlRead(staleQuery, {}, { ...staleOptions, forceRefresh: true }),
  );
  assert.equal(runtime.requests.length, 4);
});

test("validation-rejected live refresh preserves the prior last-good cache", async () => {
  let response = { value: "last-good" };
  const runtime = installRuntime((request) =>
    request.success({ statusCode: 200, data: { data: response } }),
  );
  const query = "query LiveValidationPreservesLkg { value }";
  const options = {
    ...publicReporting,
    cacheTtl: 60_000,
    staleTtl: 60_000,
    preserveCacheOnValidationFailure: true,
    validateCacheData: (data) => data?.value === "last-good",
  };

  const first = await graphqlRead(query, {}, options);
  assert.equal(first.data.value, "last-good");
  response = { value: "malformed" };
  const rejected = await graphqlRead(query, {}, { ...options, forceRefresh: true });
  assert.equal(rejected.data.value, "malformed");

  const retained = await graphqlRead(query, {}, options);
  assert.equal(retained.meta.source, "memory");
  assert.equal(retained.data.value, "last-good");
  assert.equal(runtime.requests.length, 2);
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

test("uncacheable EntryLookup refresh evicts the previous authoritative result", async () => {
  let callCount = 0;
  const runtime = installRuntime((options) => {
    callCount += 1;
    options.success({
      statusCode: 200,
      data: {
        data: {
          entryLookup: callCount === 1
            ? {
                status: "FOUND",
                retryable: false,
                source: "DATABASE",
                persistenceState: "NOT_REQUIRED",
                entry: { id: 123 },
              }
            : {
                status: "UNAVAILABLE",
                retryable: true,
                source: null,
                persistenceState: null,
                entry: null,
              },
        },
      },
    });
  });
  const query = "query EntryLookup($id: Int!) { entryLookup(id: $id) { status entry { id } } }";
  const options = { ...publicReporting, cacheVariant: "entry:123" };

  const first = await graphqlRead(query, { id: 123 }, options);
  assert.equal(first.meta.source, "network");
  const degraded = await graphqlRead(query, { id: 123 }, {
    ...options,
    forceRefresh: true,
  });
  assert.equal(degraded.meta.source, "network");
  assert.equal(degraded.data.entryLookup.status, "UNAVAILABLE");

  const next = await graphqlRead(query, { id: 123 }, options);
  assert.equal(next.meta.source, "network");
  assert.equal(next.data.entryLookup.status, "UNAVAILABLE");
  assert.equal(runtime.requests.length, 3);
});

test("degraded PlayerDetail refresh evicts the previous authoritative cache", async () => {
  let callCount = 0;
  const runtime = installRuntime((options) => {
    callCount += 1;
    options.success({
      statusCode: 200,
      data: {
        data: {
          playerDetail: {
            dataAvailability: {
              isFullyAuthoritative: callCount === 1,
            },
          },
        },
      },
    });
  });
  const query = `query PlayerDetail($playerId: Int!) {
    playerDetail(playerId: $playerId) {
      dataAvailability { isFullyAuthoritative }
    }
  }`;

  const first = await graphqlRead(query, { playerId: 1 }, publicReporting);
  assert.equal(first.meta.source, "network");

  const degraded = await graphqlRead(query, { playerId: 1 }, {
    ...publicReporting,
    forceRefresh: true,
  });
  assert.equal(degraded.meta.source, "network");
  assert.equal(degraded.data.playerDetail.dataAvailability.isFullyAuthoritative, false);

  const next = await graphqlRead(query, { playerId: 1 }, publicReporting);
  assert.equal(next.meta.source, "network");
  assert.equal(next.data.playerDetail.dataAvailability.isFullyAuthoritative, false);
  assert.equal(runtime.requests.length, 3);
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

test("graphqlRequest explicitly maps stale fallback data before discarding metadata", async () => {
  const runtime = installRuntime(success({ value: { authoritative: true } }));
  const query = "query BehaviorMappedStale { value { authoritative } }";
  const options = {
    ...publicReporting,
    cacheTtl: 1,
    staleTtl: 60_000,
  };

  await graphqlRequest(query, {}, options);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.setHandler((request) =>
    request.fail({ errMsg: "request:fail timeout" }),
  );
  const stale = await graphqlRequest(query, {}, {
    ...options,
    forceRefresh: true,
    mapStaleData(data) {
      return {
        ...data,
        value: { ...data.value, authoritative: false, stale: true },
      };
    },
  });

  assert.deepEqual(stale, {
    value: { authoritative: false, stale: true },
  });
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
    if (request.url.endsWith("/session/persistence")) {
      request.success({
        statusCode: 200,
        data: { success: true },
      });
      return;
    }
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
            name: null,
            email: null,
            emailVerified: false,
            image: null,
            createdAt: "2026-08-01T00:00:00.000Z",
            accountMode: "MINI_ONLY",
            followEntryId: 202,
            effectiveEntryId: 202,
            effectiveEntrySource: "MINI",
            webAccountLinked: false,
            entryConflict: false,
            webVerifiedEntryId: null,
            wechatLinked: true,
            fplEntryId: null,
            fplEntryBoundAt: null,
            fplEntryVerifiedAt: null,
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
    if (request.url.endsWith("/wechat/login")) {
      request.success({
        statusCode: 200,
        data: {
          success: true,
          contractVersion: 2,
          authenticated: true,
          webAccountLinked: false,
          token: "session-b",
          expiresAt: "2099-01-01T00:00:00.000Z",
          profile: {
            id: "refreshed-account",
            name: null,
            email: null,
            emailVerified: false,
            image: null,
            createdAt: "2026-08-01T00:00:00.000Z",
            accountMode: "MINI_ONLY",
            webAccountLinked: false,
            followEntryId: null,
            webVerifiedEntryId: null,
            effectiveEntryId: null,
            effectiveEntrySource: null,
            entryConflict: false,
            fplEntryId: null,
            fplEntryBoundAt: null,
            fplEntryVerifiedAt: null,
            wechatLinked: true,
          },
        },
      });
      return;
    }
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
  globalThis.wx.login = ({ success }) => success({ code: "refresh-code" });
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
