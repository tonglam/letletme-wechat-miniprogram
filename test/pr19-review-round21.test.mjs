import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8").replace(/\s+/g, " ");
}

test("Entry queued forced follow-ups are lifecycle owned and cleared on hide", () => {
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(entry, /const followupOwnerId = this\.liveRequestId[\s\S]*!this\.pageVisible[\s\S]*followupOwnerId !== this\.liveRequestId/);
  assert.match(entry, /onHide\(\)[\s\S]*liveForcedFollowup = null[\s\S]*liveForcedFollowupIncludeTransfers = false[\s\S]*liveForcedFollowupTrackNavigation = false/);
});

for (const [label, path, surface] of [
  ["Selections", "miniprogram/pages/data/selections/selections.ts", "data-selections"],
  ["Tournament Summary", "miniprogram/pages/summary/tournament/tournament.ts", "summary-tournament"]
]) {
  test(`${label} captures startup trace and resumes only lifecycle-owned work`, () => {
    const page = source(path);
    assert.match(page, new RegExp(`onLoad\\(\\)[\\s\\S]*capturePageRequestTrace\\([\\s\\S]*callerSurface: "${surface}"[\\s\\S]*initializePage\\(trace\\)`));
    assert.match(page, /await this\.ensureAppDataReady\(\)[\s\S]*if \(!this\.pageVisible \|\| lifecycleRevision !== this\.lifecycleRevision\) return/);
    assert.match(page, /await app\.authReady[\s\S]*if \(!this\.pageVisible \|\| lifecycleRevision !== this\.lifecycleRevision\) return/);
    assert.match(page, /onHide\(\)[\s\S]*resumeOnShow[\s\S]*lifecycleRevision \+= 1/);
    assert.match(page, /const isActiveLifecycle = \(\) => this\.pageVisible[\s\S]*lifecycleRevision === this\.lifecycleRevision/);
  });
}

test("Players clears an interrupted pagination latch on resume", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(players, /onShow\(\)[\s\S]*if \(this\.data\.loadingMore\)[\s\S]*setData\(\{ loadingMore: false \}\)/);
});

test("Match and Tournament resume interrupted primary loads", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  const tournament = source("miniprogram/pages/live/tournament/tournament.controller.ts");
  assert.match(match, /onHide\(\)[\s\S]*resumeForcedRefreshAfterShow = this\.forcedRefreshPending[\s\S]*resumeLoadAfterShow = this\.resumeLoadAfterShow[\s\S]*\|\| \(!this\.resumeForcedRefreshAfterShow[\s\S]*Boolean\(this\.liveRequest\)[\s\S]*liveRequestId \+= 1/);
  assert.match(match, /if \(resumeInterruptedLoad\)[\s\S]*loadData\(\{ background: this\.data\.hasData, forceRefresh: true,? \}\)/);
  assert.match(tournament, /onHide\(\)[\s\S]*if \(this\.directoryRequestPending\)[\s\S]*resumeDirectoryAfterShow = true[\s\S]*tournamentListRequestId \+= 1/);
  assert.match(tournament, /resumed && this\.resumeDirectoryAfterShow[\s\S]*loadTournaments\(forceRefresh\)/);
});

test("My FPL primary errors and Teams retries use primary recovery", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const teams = source("miniprogram/pages/data/teams/teams.ts");
  assert.match(team, /onRetry\(\)[\s\S]*if \(this\.data\.error\)[\s\S]*runForcedRefresh\([\s\S]*activeTab === "squad"/);
  assert.match(teams, /loadData\(forceRefresh = false, originatingTrace\?: PageRequestTrace\)[\s\S]*ensureAppContext\(\{[\s\S]*forceRefresh[\s\S]*getTeamList\(context\.season, forceRefresh, trace\)/);
  assert.match(teams, /onRetry\(\)[\s\S]*loadData\(true\)/);
});
