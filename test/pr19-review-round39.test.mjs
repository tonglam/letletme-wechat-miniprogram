import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Match and Live Tournament retain queued resume work across repeated hides", () => {
  const match = read("miniprogram/pages/live/match/match.ts");
  const tournament = read("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(match, /resumeLoadAfterShow = this\.resumeLoadAfterShow[\s\S]*\|\| \(!this\.resumeForcedRefreshAfterShow/);
  assert.match(tournament, /if \(this\.directoryRequestPending\)[\s\S]*resumeDirectoryAfterShow = true/);
  assert.match(tournament, /resumeRowsAfterShow = this\.resumeRowsAfterShow[\s\S]*\|\| \(!this\.resumeDirectoryAfterShow/);
});

test("Competitions preserves a forced list refresh independently of placeholder loading", () => {
  const page = read("miniprogram/pages/competitions/index/index.ts");
  assert.match(page, /loadPending = true[\s\S]*loadForceRefresh = forceRefresh/);
  assert.match(page, /onHide\(\)[\s\S]*resumeOnShow = this\.resumeOnShow[\s\S]*this\.loadPending[\s\S]*resumeForceRefresh = this\.resumeForceRefresh \|\| this\.loadForceRefresh/);
  assert.match(page, /onShow\(\)[\s\S]*const forceRefresh = this\.resumeForceRefresh[\s\S]*loadList\(forceRefresh, trace, lifecycleRevision\)/);
});

test("My FPL overview waits for forced secondary reads and resumes the force bit", () => {
  const page = read("miniprogram/pages/my-fpl/index/index.ts");
  assert.match(page, /loadOverview\([\s\S]*overviewRequestPending = true[\s\S]*performLoadOverview/);
  assert.match(page, /if \(forceRefresh\) await secondaryTask/);
  assert.match(page, /onHide\(\)[\s\S]*overviewRequestPending && this\.overviewRequestForceRefresh[\s\S]*resumeForceRefresh = true/);
  assert.match(page, /resumeOverview\([\s\S]*loadOverview\(forceRefresh, lifecycleRevision\)/);
});

test("Fixture Explorer resumes forced context and data reads", () => {
  const page = read("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(page, /runForcedRefresh\([\s\S]*refreshPending = true[\s\S]*syncEventContext\(true[\s\S]*load\(true/);
  assert.match(page, /onHide\(\)[\s\S]*resumeForceRefresh = this\.resumeForceRefresh \|\| this\.refreshPending/);
  assert.match(page, /onShow\(\)[\s\S]*resumeForceRefresh[\s\S]*runForcedRefresh\(\)/);
});

test("Entry Profile carries the force bit through authority resolution", () => {
  const page = read("miniprogram/pages/entry/profile/profile.ts");
  assert.match(page, /loadAuthoritativeEntry\([\s\S]*authorityPending = true[\s\S]*authorityForceRefresh = forceRefresh[\s\S]*loadEntry\(entryId, forceRefresh/);
  assert.match(page, /onHide\(\)[\s\S]*authorityPending[\s\S]*resumeForceRefresh = this\.resumeForceRefresh \|\| this\.authorityForceRefresh/);
  assert.match(page, /onShow\(\)[\s\S]*loadAuthoritativeEntry\("show", this\.lifecycleRevision, forceRefresh\)/);
});
