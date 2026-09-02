import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("My FPL Leagues captures V2.1 traces and waits for authoritative context", () => {
  const page = source("miniprogram/pages/my-fpl/leagues/leagues.ts");
  const service = source("miniprogram/services/tournament.service.ts");
  const compact = page.replace(/\s+/g, " ");
  const startup = compact.slice(
    compact.indexOf("async onLoad()"),
    compact.indexOf("async onShow()"),
  );
  assert.match(
    startup,
    /capturePageRequestTrace\(\{ callerSurface: "my-fpl-leagues-v2\.1", trigger: "load"/,
  );
  assert.match(startup, /await waitForAuthoritativeFollow\(\)/);
  assert.match(startup, /loadCatalog\(/);
  const refresh = compact.slice(compact.indexOf("async onPullDownRefresh()"));
  assert.match(refresh, /capturePageRequestTrace/);
  assert.match(refresh, /loadCatalog\(\s*true/);
  assert.match(compact, /getMyTournamentReviewCatalog/);
  assert.match(service, /my-tournament-review-v2\.1/);
});

test("League service wrappers pass explicit traces to GraphQL", () => {
  const tournament = source("miniprogram/services/tournament.service.ts");
  const myFpl = source("miniprogram/services/my-fpl.service.ts");
  const entry = source("miniprogram/services/entry.service.ts");
  assert.match(tournament, /getEntryAllTournaments[\s\S]*?trace\?: PageRequestTrace \| null[\s\S]*?readDirectory\(entry, forceRefresh, trace \?\? undefined\)/);
  assert.match(myFpl, /getEntryLeagueInfo\(entryId, forceRefresh, trace \?\? undefined\)/);
  assert.match(entry, /getEntryLeagueInfo[\s\S]*?trace\?: PageRequestTrace[\s\S]*?forceRefresh,\s+trace/);
});

test("Match V2 publication clears a soft-timeout error when current data succeeds", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  const publication = match.indexOf("if (publishedMatchday?.snapshot)");
  const retainedFallback = match.indexOf("if (preserveData)", publication);
  assert.ok(publication >= 0 && retainedFallback > publication);
  assert.match(
    match.slice(publication, retainedFallback),
    /hasData: true,\s+scheduleEmpty: false,\s+error: ""/,
  );
  assert.match(match, /observeSoftTimeout[\s\S]*?navigationTracker\?\.mark\("softFailureAt"\)/);
});
