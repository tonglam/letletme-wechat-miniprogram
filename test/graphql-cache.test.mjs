import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGraphQLRequestCacheKey,
  buildGraphQLRequestPayload,
  isTransientGraphQLStatus,
  shouldCacheGraphQLData,
} from "../miniprogram/services/graphql.service.ts";
import { getGraphQLOperationPolicy } from "../miniprogram/services/graphql-cache-policy.ts";
import { storagePrefixes } from "../miniprogram/config/storage-keys.ts";
import { PLAYERS_FOR_PICKER_QUERY } from "../miniprogram/services/player.service.ts";
import {
  EVENT_DREAM_TEAM_QUERY,
  EVENT_ELITE_ELEMENTS_QUERY,
  EVENT_OVERALL_TRANSFERS_QUERY,
} from "../miniprogram/services/summary.service.ts";
import {
  buildFixtureWindowRequest,
  CORE_EVENT_FIXTURE_SCHEDULE_QUERY,
} from "../miniprogram/services/fixture.service.ts";
import {
  LIVE_MATCHES_QUERY,
  LIVE_SNAPSHOT_QUERY,
} from "../miniprogram/services/live.service.ts";
import {
  authApiErrorMessage,
  graphQLErrorMessage,
  httpErrorMessage,
} from "../miniprogram/utils/request-error.ts";

const query = "query OwnEntry($entryId: Int!) { entry(id: $entryId) { id } }";
const variables = { entryId: 123 };

test("separates public and authenticated GraphQL caches", () => {
  const publicKey = buildGraphQLRequestCacheKey(query, variables, null);
  const accountA = buildGraphQLRequestCacheKey(query, variables, "token-a");
  const accountB = buildGraphQLRequestCacheKey(query, variables, "token-b");

  assert.notEqual(publicKey, accountA);
  assert.notEqual(accountA, accountB);
  assert.equal(
    accountA,
    buildGraphQLRequestCacheKey(query, variables, "token-a"),
  );
  assert.equal(accountA.includes("token-a"), false);
});

test("fixture windows use one production-compatible aliased request", () => {
  const request = buildFixtureWindowRequest([12, 13, 14, 15, 16]);
  assert.deepEqual(request.variables, {
    event0: 12,
    event1: 13,
    event2: 14,
    event3: 15,
    event4: 16,
  });
  assert.equal(
    (request.query.match(/eventFixtures\(eventId:/g) || []).length,
    5,
  );
  assert.match(request.query, /fragment FixtureWindowFields on Fixture/);
  assert.doesNotMatch(request.query, /fixtures\(limit:/);
});

test("core event fixture schedule is a named public fixture operation", () => {
  assert.match(
    CORE_EVENT_FIXTURE_SCHEDULE_QUERY,
    /query CoreEventFixtureSchedule/,
  );
  assert.match(
    CORE_EVENT_FIXTURE_SCHEDULE_QUERY,
    /eventFixtures\(eventId: \$eventId\)/,
  );
  assert.doesNotMatch(
    CORE_EVENT_FIXTURE_SCHEDULE_QUERY,
    /liveSnapshot|liveMatches/,
  );
  assert.deepEqual(getGraphQLOperationPolicy("CoreEventFixtureSchedule"), {
    authMode: "public",
    cachePolicy: "fixtures",
    workload: "fixtures",
  });
});

test("does not expose raw HTTP status codes to users", () => {
  assert.equal(httpErrorMessage(400), "数据请求暂时无法处理，请稍后重试");
  assert.equal(httpErrorMessage(429), "请求过于频繁，请稍后再试");
  assert.equal(httpErrorMessage(503), "服务器繁忙，请稍后重试");
  assert.equal(httpErrorMessage(418).includes("418"), false);
  assert.equal(
    graphQLErrorMessage([
      {
        message: "GraphQL document exceeds 200 AST nodes",
        extensions: { code: "QUERY_TOO_COMPLEX" },
      },
    ]),
    "数据暂时无法加载，请稍后重试",
  );
  assert.equal(
    authApiErrorMessage(400, "Verification code expired"),
    "验证码无效或已过期，请重新获取",
  );
});

test("keeps the live matchday desk query compact", () => {
  assert.match(LIVE_MATCHES_QUERY, /liveMatchdayDesk/);
  assert.equal((LIVE_MATCHES_QUERY.match(/\bfixtureId\b/g) || []).length, 2);
  assert.ok(LIVE_MATCHES_QUERY.length < 1_000);
  assert.doesNotMatch(LIVE_MATCHES_QUERY, /upcoming\s*:/);
  assert.doesNotMatch(LIVE_MATCHES_QUERY, /\bnextEvent\b/);
});

test("uses a metadata-only query for automatic live freshness checks", () => {
  assert.match(LIVE_SNAPSHOT_QUERY, /liveContext/);
  assert.doesNotMatch(
    LIVE_SNAPSHOT_QUERY,
    /liveSnapshot|liveMatches|calcLivePoints/,
  );
  assert.ok(LIVE_SNAPSHOT_QUERY.length < 300);
});

test("sends operationName and classifies public/session operations explicitly", () => {
  assert.deepEqual(
    buildGraphQLRequestPayload("query Teams { teams { id } }", {}),
    {
      query: "query Teams { teams { id } }",
      variables: {},
      operationName: "Teams",
    },
  );
  assert.equal(getGraphQLOperationPolicy("Teams").authMode, "public");
  assert.equal(
    getGraphQLOperationPolicy("MiniPlayerStatsDesk").authMode,
    "public",
  );
  assert.deepEqual(getGraphQLOperationPolicy("MiniHomePersonalLeagues"), {
    authMode: "session",
    cachePolicy: "reporting",
    workload: "interactive",
  });
  assert.equal(
    getGraphQLOperationPolicy("TournamentSeasonSnapshot").authMode,
    "session",
  );
  assert.equal(getGraphQLOperationPolicy("EntryHistory").authMode, "session");
  assert.equal(
    getGraphQLOperationPolicy("UnknownPrivateQuery").cachePolicy,
    "network-only",
  );
});

test("uses v2 public/session storage namespaces", () => {
  assert.equal(storagePrefixes.graphqlPublicCache, "gql:v2:public:");
  assert.equal(storagePrefixes.graphqlSessionCache, "gql:v2:session:");
});

test("limits player picker pages and removes the unsupported full directory query", () => {
  assert.match(PLAYERS_FOR_PICKER_QUERY, /playersForPicker/);
  assert.match(PLAYERS_FOR_PICKER_QUERY, /limit:\s*\$limit/);
  assert.match(PLAYERS_FOR_PICKER_QUERY, /cursor:\s*\$cursor/);
  assert.doesNotMatch(PLAYERS_FOR_PICKER_QUERY, /players\s*\(\s*limit:\s*600/);
});

test("gameweek summary uses compact production-budgeted operations", () => {
  const queries = [
    EVENT_DREAM_TEAM_QUERY,
    EVENT_ELITE_ELEMENTS_QUERY,
    EVENT_OVERALL_TRANSFERS_QUERY,
  ];
  assert.match(EVENT_DREAM_TEAM_QUERY, /query EventDreamTeam/);
  assert.match(
    EVENT_DREAM_TEAM_QUERY,
    /dreamTeam \{[\s\S]*minutes[\s\S]*goalsScored[\s\S]*bps/,
  );
  assert.match(EVENT_ELITE_ELEMENTS_QUERY, /query EventEliteElements/);
  assert.match(
    EVENT_ELITE_ELEMENTS_QUERY,
    /topPerformers\(limit: \$limit\) \{[\s\S]*minutes[\s\S]*goalsScored[\s\S]*bps/,
  );
  assert.match(EVENT_OVERALL_TRANSFERS_QUERY, /query EventOverallTransfers/);
  assert.match(
    EVENT_OVERALL_TRANSFERS_QUERY,
    /topTransfersIn[\s\S]*topTransfersOut/,
  );
  for (const queryText of queries) {
    assert.ok(
      (queryText.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || []).length <= 200,
    );
  }
});

test("only gateway failures are transient HTTP failures", () => {
  assert.equal(isTransientGraphQLStatus(502), true);
  assert.equal(isTransientGraphQLStatus(503), true);
  assert.equal(isTransientGraphQLStatus(504), true);
  assert.equal(isTransientGraphQLStatus(400), false);
  assert.equal(isTransientGraphQLStatus(401), false);
});

test("GetEntry misses are not cached", () => {
  assert.equal(shouldCacheGraphQLData("GetEntry", { entry: null }), false);
  assert.equal(shouldCacheGraphQLData("GetEntry", { entry: { id: 1 } }), true);
  assert.equal(
    shouldCacheGraphQLData("EntryLeagues", { entryLeagues: [] }),
    true,
  );
});
