import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("My FPL context recovery consumes the stale refresh owner", () => {
  const page = read("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(page, /if \(this\.resumeContextRecovery\)[\s\S]*this\.resumeRefreshAfterShow = false;[\s\S]*this\.refreshPending = false[\s\S]*recoverContext\("page-show"\)/);
});

test("Data Selections carries force through selection stats", () => {
  const page = read("miniprogram/pages/data/selections/selections.ts");
  const service = read("miniprogram/services/tournament.service.ts");
  assert.match(page, /await this\.loadStats\(forceRefresh, trace\)/);
  assert.match(page, /async loadStats\(forceRefresh = false, originatingTrace\?: PageRequestTrace\)/);
  assert.match(page, /getTournamentSelectionStats\(tournamentId, requestedEvent, STATS_LIMIT, forceRefresh, trace\)/);
  assert.match(service, /cachePolicy: "reporting", forceRefresh, trace/);
});
