import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8").replace(/\s+/g, " ");
}

test("Home never re-arms its countdown after becoming hidden", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(home, /startCountdown\(\)[\s\S]*this\.stopCountdown\(\)[\s\S]*if \(!this\._pageVisible\) return/);
  assert.match(home, /onHide\(\)[\s\S]*_pageVisible = false[\s\S]*stopCountdown\(\)/);
});

test("explicit null trace suppresses active-page attribution fallback", () => {
  const graphql = source("miniprogram/services/graphql.service.ts");
  assert.match(graphql, /trace\?: PageRequestTrace \| null/);
  assert.match(graphql, /resolvePageRequestTrace\([\s\S]*explicitTrace\?: PageRequestTrace \| null[\s\S]*explicitTrace === null\) return undefined/);
});

test("Live Entry automatic polls are untracked while pull refresh remains tracked", () => {
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(entry, /trackNavigation\?: boolean/);
  assert.match(entry, /navigationTracker = options\.background === true && options\.trackNavigation !== true[\s\S]*undefined[\s\S]*this\.perfTracker/);
  assert.match(entry, /requestTrace = options\.background === true && options\.trackNavigation !== true[\s\S]*null/);
  assert.match(entry, /onPullDownRefresh\(\)[\s\S]*trackNavigation: true/);
});

test("Match reuses one captured trace for schedule and overlay", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(match, /const requestTrace =[\s\S]*readCoreEventFixtureSchedule[\s\S]*trace: requestTrace/);
  assert.match(match, /getLiveMatchByStatusSnapshot\([\s\S]*requestTrace[\s\S]*\)/);
});

test("Match deadline rollover is explicit untracked background work", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    match,
    /refreshContextAtDeadline\(\)[\s\S]*loadData\(\{ background: true, forceRefresh: true \}\)/
  );
});
