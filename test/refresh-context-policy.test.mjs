import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../miniprogram/services/app-context.service.ts", import.meta.url), "utf8");
const liveEntry = await readFile(new URL("../miniprogram/pages/live/entry/entry.ts", import.meta.url), "utf8");
const liveMatch = await readFile(new URL("../miniprogram/pages/live/match/match.ts", import.meta.url), "utf8");
const myFpl = await readFile(new URL("../miniprogram/pages/my-fpl/team/team.controller.ts", import.meta.url), "utf8");

test("app context refresh policy treats incomplete, stale, and expired snapshots as refreshable", () => {
  assert.match(service, /export function shouldRefreshAppContext\([\s\S]*snapshot\.stale[\s\S]*!snapshot\.season[\s\S]*!snapshot\.displayEvent[\s\S]*snapshot\.freshUntil <= now/);
});

for (const [name, source] of [["Live Entry", liveEntry], ["My FPL Team", myFpl]]) {
  test(`${name} does not force CurrentEventInfo when context is fresh`, () => {
    assert.match(source, /let context = getAppContextSnapshot\(\);[\s\S]*if \(shouldRefreshAppContext\(context\)\)[\s\S]*ensureContext\("pull-refresh", true\)/);
    assert.match(source, /if \(!context\) throw new Error\("赛季和比赛轮信息加载失败"\)/);
  });
}

test("Live Matches does not let CurrentEventInfo gate a forced publication read", () => {
  assert.match(
    liveMatch,
    /let context = getAppContextSnapshot\(\);[\s\S]*if \(shouldRefreshAppContext\(context\)\)[\s\S]*ensureContext\("pull-refresh", true\)[\s\S]*context = null[\s\S]*useActiveEventPointer/,
  );
  assert.match(
    liveMatch,
    /tracker\.mark\("contextReadyAt"\);[\s\S]*await this\.loadData\(\{[\s\S]*forceRefresh: true/,
  );
  assert.doesNotMatch(
    liveMatch,
    /if \(!context\) throw new Error\("赛季和比赛轮信息加载失败"\)/,
  );
});
