import assert from "node:assert/strict";
import test from "node:test";

import { buildGraphQLRequestCacheKey } from "../miniprogram/services/graphql.service.ts";

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
