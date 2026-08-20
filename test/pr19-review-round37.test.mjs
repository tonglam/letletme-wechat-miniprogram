import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Live Tournament resumes an interrupted directory refresh with its force bit", () => {
  const page = read("miniprogram/pages/live/tournament/tournament.controller.ts");
  assert.match(page, /directoryRequestPending = true[\s\S]*directoryRequestForceRefresh = forceRefresh/);
  assert.match(page, /onHide\(\)[\s\S]*if \(this\.directoryRequestPending\)[\s\S]*resumeDirectoryAfterShow = true[\s\S]*resumeDirectoryForceRefresh/);
  assert.match(page, /onShow\(\)[\s\S]*resumeDirectoryAfterShow[\s\S]*loadTournaments\(forceRefresh\)/);
});

test("My FPL Team resumes a forced refresh interrupted during context recovery", () => {
  const page = read("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(page, /runForcedRefresh\(tracker[\s\S]*refreshPending = true[\s\S]*ensureContext\("pull-refresh", true\)/);
  assert.match(page, /onHide\(\)[\s\S]*resumeRefreshAfterShow = this\.refreshPending/);
  assert.match(page, /onShow\(\)[\s\S]*resumeForcedRefresh[\s\S]*runForcedRefresh\(this\.perfTracker, trace\)/);
});

test("Live Entry resumes an interrupted pull refresh with forced data reads", () => {
  const page = read("miniprogram/pages/live/entry/entry.ts");
  assert.match(page, /runForcedRefresh\(tracker[\s\S]*ensureContext\("pull-refresh", true\)[\s\S]*forceRefresh: true/);
  assert.match(page, /onHide\(\)[\s\S]*resumeForcedRefreshAfterShow = this\.forcedRefreshPending/);
  assert.match(page, /onShow\(\)[\s\S]*resumeForcedRefresh[\s\S]*runForcedRefresh\(this\.perfTracker\)/);
});

test("Data Selections preserves the forced directory bit across hide and show", () => {
  const page = read("miniprogram/pages/data/selections/selections.ts");
  assert.match(page, /activeTournamentForceRefresh = forceRefresh/);
  assert.match(page, /onHide\(\)[\s\S]*resumeTournamentForceRefresh = this\.resumeStage === "tournaments"/);
  assert.match(page, /resumeStage === "tournaments"[\s\S]*loadTournaments\(resumeTournamentForceRefresh, trace\)/);
});
