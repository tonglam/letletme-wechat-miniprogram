import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("Explore Fixtures owns context and data reads for its visible lifecycle", () => {
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(fixtures, /onLoad\(\)[\s\S]*const lifecycleRevision = this\.lifecycleRevision[\s\S]*syncEventContext\(false, lifecycleRevision\)[\s\S]*seasonChanged === null[\s\S]*load\(false, trace, lifecycleRevision\)/);
  assert.match(fixtures, /ownerRevision = lifecycleRevision \?\? this\.lifecycleRevision[\s\S]*app\.initAppData\(forceRefresh\)[\s\S]*if \(!this\.pageVisible \|\| ownerRevision !== this\.lifecycleRevision\) return null/);
  assert.match(fixtures, /const isActiveRequest = \(\) => \([\s\S]*this\.pageVisible[\s\S]*ownerRevision === this\.lifecycleRevision[\s\S]*requestId === this\.requestId/);
  assert.match(fixtures, /await Promise\.all\([\s\S]*getFixtureWindow[\s\S]*getTeamList[\s\S]*if \(!isActiveRequest\(\)\) return/);
  assert.match(fixtures, /onHide\(\)[\s\S]*pageVisible = false[\s\S]*lifecycleRevision \+= 1[\s\S]*requestId \+= 1/);
});
