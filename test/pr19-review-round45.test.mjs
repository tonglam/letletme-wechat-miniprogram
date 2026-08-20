import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("team detail preserves forced Retry semantics across hide and show", () => {
  const page = read("miniprogram/pages/data/team-detail/team-detail.ts");
  assert.match(page, /forceRefreshPending/);
  assert.match(page, /resumeForceRefresh = this\.resumeForceRefresh \|\| this\.forceRefreshPending/);
  assert.match(page, /loadData\("show", forceRefresh\)/);
  assert.match(page, /getTeamSummary\(this\.data\.teamId, season, forceRefresh, trace\)/);
});

test("My FPL event-empty context recovery is lifecycle-owned", () => {
  const page = read("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(page, /contextRecoveryPending/);
  assert.match(page, /resumeContextRecovery = this\.resumeContextRecovery \|\| this\.contextRecoveryPending/);
  assert.match(page, /if \(this\.resumeContextRecovery\)[\s\S]*recoverContext\("page-show"\)/);
  assert.match(page, /onEmptyAction\(\)[\s\S]*recoverContext\("pull-refresh"\)/);
});
