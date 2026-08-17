import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

for (const [name, path, loadMethod, surface] of [
  ["My FPL Leagues", "miniprogram/pages/my-fpl/leagues/leagues.ts", "loadLeagues", "my-fpl-leagues"]
]) {
  test(`${name} captures traces before authoritative context waits`, () => {
    const page = source(path);
    assert.match(
      page,
      new RegExp(`async onLoad\\(\\)[\\s\\S]*?const trace = capturePageRequestTrace\\(\\{ callerSurface: "${surface}", trigger: "load" \\}\\);[\\s\\S]*?await waitForAuthoritativeFollow\\(\\);[\\s\\S]*?${loadMethod}\\(false, trace, lifecycleRevision\\)`)
    );
    assert.match(
      page,
      new RegExp(`async onPullDownRefresh\\(\\)[\\s\\S]*?const trace = capturePageRequestTrace[\\s\\S]*?initAppData\\(true\\)[\\s\\S]*?${loadMethod}\\(true, trace\\)`)
    );
  });
}

test("League service wrappers pass explicit traces to GraphQL", () => {
  const tournament = source("miniprogram/services/tournament.service.ts");
  const myFpl = source("miniprogram/services/my-fpl.service.ts");
  const entry = source("miniprogram/services/entry.service.ts");
  assert.match(tournament, /getEntryAllTournaments[\s\S]*?trace\?: PageRequestTrace \| null[\s\S]*?readDirectory\(entry, forceRefresh, trace \?\? undefined\)/);
  assert.match(myFpl, /getEntryLeagueInfo\(entryId, forceRefresh, trace \?\? undefined\)/);
  assert.match(entry, /getEntryLeagueInfo[\s\S]*?trace\?: PageRequestTrace[\s\S]*?forceRefresh,\s+trace/);
});

test("Match clears a soft-timeout error when current data succeeds", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  const core = match.indexOf("const matches = filterMatches(core, activeStatus)");
  const overlay = match.indexOf("const overlaid = filterMatches(this.coreMatches, overlayStatus)");
  assert.match(match.slice(core, overlay), /hasData: true,\s+error: ""/);
  assert.match(match.slice(overlay), /groups: groupMatches\(overlaid, overlayStatus\),\s+error: ""/);
  assert.match(match, /observeSoftTimeout[\s\S]*?navigationTracker\?\.mark\("softFailureAt"\)/);
});
