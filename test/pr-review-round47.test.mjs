import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("Fixture Explorer retains forced refresh ownership until replacement load settles", () => {
  const page = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(page, /if \(this\.resumeForceRefresh\) \{[\s\S]*await this\.runForcedRefresh\(\);[\s\S]*if \(this\.pageVisible && !this\.refreshPending\)[\s\S]*this\.resumeForceRefresh = false/);
});

test("Gameweek Summary retains resumed force ownership through replacement load", () => {
  const page = source("miniprogram/pages/summary/gameweek/gameweek.ts");
  assert.match(page, /const task = this\.loadData\(resumeForceRefresh, trace, this\.lifecycleRevision\);[\s\S]*task\.finally\([\s\S]*this\.activeLoadForceRefresh/);
});
