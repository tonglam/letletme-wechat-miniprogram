import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("Home cancels hidden deadline recovery and guards the delayed callback", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(home, /onHide\(\)[\s\S]*_pageVisible = false[\s\S]*stopCountdown\(\)/);
  assert.match(home, /onShow\(\)[\s\S]*_pageVisible = true/);
  assert.match(home, /scheduleDeadlineRetry\(\)[\s\S]*if \(!this\._pageVisible\) return[\s\S]*refreshHome\(true\)/);
});

test("Home delayed Entry reads retain their originating navigation trace", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  const entry = source("miniprogram/services/entry.service.ts");
  assert.match(home, /callerSurface: "home-entry"[\s\S]*getEntryInfo\(entryId, forceRefresh, entryTrace\)/);
  assert.match(entry, /getEntryInfo\([\s\S]*trace\?: PageRequestTrace[\s\S]*forceRefresh,[\s\S]*trace/);
});

test("Match automatic background work does not mutate a completed navigation trace", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    match,
    /const tracksNavigation = options\.background !== true \|\| options\.trackNavigation === true[\s\S]*navigationTracker = tracksNavigation \? this\.perfTracker : undefined/
  );
  assert.match(match, /navigationTracker\?\.mark\("primaryRequestStartAt"\)/);
  assert.match(match, /trace: requestTrace/);
  assert.match(match, /getLiveMatchByStatusSnapshot\([\s\S]*requestTrace/);
  assert.match(match, /onPullDownRefresh\(\)[\s\S]*runForcedRefresh\(tracker, true\)/);
  assert.match(match, /runForcedRefresh\([\s\S]*loadData\(\{ background, forceRefresh: true, trackNavigation: true \}\)/);
});

test("My FPL GW switches clear primary identity before the replacement read", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(
    team,
    /onGwChange\([\s\S]*overviewStats: \[\][\s\S]*eventStats: \[\][\s\S]*squadRows: \[\][\s\S]*hasTeamData: false[\s\S]*supportAvailable: false[\s\S]*loadData\(true\)/
  );
});
