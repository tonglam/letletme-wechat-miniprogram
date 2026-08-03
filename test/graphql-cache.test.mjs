import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGraphQLRequestCacheKey
} from "../miniprogram/services/graphql.service.ts";
import { LIVE_MATCHES_QUERY } from "../miniprogram/services/live.service.ts";
import {
  authApiErrorMessage,
  graphQLErrorMessage,
  httpErrorMessage
} from "../miniprogram/utils/request-error.ts";

const query = "query OwnEntry($entryId: Int!) { entry(id: $entryId) { id } }";
const variables = { entryId: 123 };

test("separates public and authenticated GraphQL caches", () => {
  const publicKey = buildGraphQLRequestCacheKey(query, variables, null);
  const accountA = buildGraphQLRequestCacheKey(query, variables, "token-a");
  const accountB = buildGraphQLRequestCacheKey(query, variables, "token-b");

  assert.notEqual(publicKey, accountA);
  assert.notEqual(accountA, accountB);
  assert.equal(accountA, buildGraphQLRequestCacheKey(query, variables, "token-a"));
  assert.equal(accountA.includes("token-a"), false);
});

test("does not expose raw HTTP status codes to users", () => {
  assert.equal(httpErrorMessage(400), "数据请求暂时无法处理，请稍后重试");
  assert.equal(httpErrorMessage(429), "请求过于频繁，请稍后再试");
  assert.equal(httpErrorMessage(503), "服务器繁忙，请稍后重试");
  assert.equal(httpErrorMessage(418).includes("418"), false);
  assert.equal(graphQLErrorMessage([{ message: "GraphQL document exceeds 200 AST nodes", extensions: { code: "QUERY_TOO_COMPLEX" } }]), "数据暂时无法加载，请稍后重试");
  assert.equal(authApiErrorMessage(400, "Verification code expired"), "验证码无效或已过期，请重新获取");
});

test("keeps the live matches query compact with shared fragments", () => {
  assert.match(LIVE_MATCHES_QUERY, /fragment LiveMatchFields on LiveMatchData/);
  assert.match(LIVE_MATCHES_QUERY, /fragment LiveMatchPlayerFields on ElementEventResultData/);
  assert.equal((LIVE_MATCHES_QUERY.match(/\bmatchId\b/g) || []).length, 1);
  assert.ok(LIVE_MATCHES_QUERY.length < 2_000);
});
