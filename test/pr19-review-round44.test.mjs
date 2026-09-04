import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("My FPL event-empty action recovers unresolved context", () => {
  const page = read("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(page, /onEmptyAction\(\)[\s\S]*contextUnavailable \|\| this\.data\.maxGw <= 0[\s\S]*recoverContext\("pull-refresh"\)/);
});

test("team detail Retry forces the cached team read", () => {
  const page = read("miniprogram/pages/data/team-detail/team-detail.ts");
  const service = read("miniprogram/services/team.service.ts");
  assert.match(page, /getTeamSummary\(this\.data\.teamId, season, forceRefresh, trace\)/);
  assert.match(service, /cachePolicy: "team-directory"[\s\S]*forceRefresh/);
});

test("team detail renders current contract fields and explains pending records", () => {
  const page = read("miniprogram/pages/data/team-detail/team-detail.ts");
  const template = read("miniprogram/pages/data/team-detail/team-detail.wxml");
  const directory = read("miniprogram/pages/data/teams/teams.wxml");
  const service = read("miniprogram/services/team.service.ts");

  assert.match(service, /export const TEAM[\s\S]*played[\s\S]*strengthOverallHome[\s\S]*strengthOverallAway/);
  assert.match(page, /buildTeamSummaryPresentation/);
  assert.match(template, /赛季战绩尚未同步/);
  assert.match(template, /主客场强度/);
  assert.match(directory, /基础资料、赛季战绩和强度/);
  assert.doesNotMatch(directory, /阵容、赛程和定位球/);
});

test("Live Tournament preserves forced startup across hide and show", () => {
  const page = read("miniprogram/pages/live/tournament/tournament.controller.ts");
  assert.match(page, /resumeStartupForceRefresh/);
  assert.match(page, /startupForceRefresh = forceRefresh/);
  assert.match(page, /resumeStartupForceRefresh = this\.startupForceRefresh/);
  assert.match(page, /initializeFromContext\("page-show", trace, forceRefresh\)/);
  assert.match(page, /startupForceRefresh = true/);
});

test("Home user refresh forces context only when missing or expired", () => {
  const page = read("miniprogram/pages/home/index/index.ts");
  assert.match(page, /const contextMissing = !app\.globalData\.season[\s\S]*const refreshContext = contextMissing \|\| deadlineExpired/);
  assert.match(page, /if \(refreshContext\)[\s\S]*forceRefresh: true/);
  assert.doesNotMatch(page, /const forceContextForUserRefresh = !deadlineTriggered/);
});
