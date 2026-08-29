import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\s+/g, " ");

test("tournament board shows overall rank, team value, captain points, podium ranks", () => {
  const controller = source("miniprogram/pages/live/tournament/tournament.controller.ts");
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");

  // Sort keys reach the server-backed board sort enum.
  assert.match(controller, /\{ key: "overallRank", label: "总排" \}/);
  assert.match(controller, /\{ key: "teamValue", label: "队值" \}/);
  assert.match(controller, /case "teamValue": return "TEAM_VALUE";/);

  // The 净分 sort chip is dropped (the web has no net-points sort); the board
  // 净 column and the compare-sheet 净分 row stay.
  assert.doesNotMatch(controller, /\{ key: "liveNetPoints", label: "净分" \}/);
  assert.match(template, /class="col-num">净</);
  assert.match(template, /class="cmp-label">净分</);

  // Row display: manager name is dropped; captain points ride the (C) label
  // with a 分 suffix; OR/TV have a sub-meta line.
  assert.match(template, /wx:if="\{\{item\.displayCaptain \|\| item\.chipCode\}\}" class="team-meta"/);
  assert.match(controller, /captainPointsKnown \? ` \$\{row\.captainPoints\}分`/);
  assert.match(controller, /overallRankText: overallRankKnown \? formatRank/);
  assert.match(controller, /teamValueText: teamValueKnown/);
  // teamValue arrives in £m already (web formatTeamMoney) — no /10 rescale.
  assert.doesNotMatch(controller, /teamValue\) \/ 10/);
  assert.match(template, /总排 \{\{item\.overallRankText\}\}/);
  assert.match(template, /队值 \{\{item\.teamValueText\}\}/);

  // Podium ranks highlight like the web table.
  assert.match(controller, /topRank: row\.eventPointsKnown && visibleRank >= 1 && visibleRank <= 3/);
  assert.match(template, /col-rank \{\{item\.topRank \? 'top3' : ''\}\}/);
});

test("tournament board offers an image share of the visible rows", () => {
  const controller = source("miniprogram/pages/live/tournament/tournament.controller.ts");
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");
  const renderer = source("miniprogram/utils/tournament-board-share-image.ts");

  assert.match(template, /bindtap="onShareBoardImage"/);
  assert.match(controller, /async onShareBoardImage\(\)[\s\S]*exportTournamentBoardShareImage\(\{[\s\S]*presentTournamentBoardShareImage\(path\)/);
  assert.match(renderer, /drawShareBranding\(/);
  assert.match(renderer, /createOffscreenCanvas/);
  // Branding stays last, like every other share surface.
  assert.ok(
    renderer.lastIndexOf("drawShareBranding(") > renderer.indexOf("plan.rows"),
    "branding paints after the rows",
  );
});

test("the board pipeline keeps score-level overall rank ahead of the row value", () => {
  const service = source("miniprogram/services/live-board.service.ts");
  assert.match(service, /overallRank: row\.overallRank \?\? page\.rows\[index\]\?\.overallRank/);
});

test("tournament detail sheet drops stale responses from a previous selection", () => {
  const controller = source("miniprogram/pages/live/tournament/tournament.controller.ts");

  // A pending request only dedupes a reopen of the same tournament; a
  // different selection starts its own load and supersedes the old one.
  assert.match(controller, /detailLoading && this\.detailRequestKey === key\) return;/);
  assert.match(controller, /const requestId = \+\+this\.detailRequestId;/);
  assert.match(controller, /this\.detailRequestKey = key;/);
  // Late responses from a superseded request never commit, and never clear
  // the newer request's loading flag.
  assert.match(controller, /if \(requestId !== this\.detailRequestId\) return;/);
  assert.match(controller, /this\.pageVisible && requestId === this\.detailRequestId/);
  // Switching modes/tournaments invalidates a pending detail request.
  assert.match(controller, /this\.detailRequestId \+= 1;/);
});

test("clearH2HState resets detailLoading when invalidating a pending detail request", () => {
  const controller = source("miniprogram/pages/live/tournament/tournament.controller.ts");

  // When clearH2HState invalidates an in-flight detail request, it must
  // also clear detailLoading — otherwise the next cached-path open returns
  // with the flag stuck at true ("正在加载赛事信息…").
  assert.match(
    controller,
    /clearH2HState\(\)[\s\S]*?this\.detailRequestId \+= 1;[\s\S]*?this\.setData\(\{ detailLoading: false \}\)/,
  );
});

test("LIVE_POINTS fallback preserves the detail desk for an open sheet", () => {
  const controller = source("miniprogram/pages/live/tournament/tournament.controller.ts");

  // When loadH2HDesk receives a LIVE_POINTS desk, clearH2HState wipes
  // detailDesk. The desk must be preserved so the detail sheet (open or
  // opened later) can show tournament info instead of staying empty.
  assert.match(
    controller,
    /desk\.kind === "LIVE_POINTS"[\s\S]*?this\.clearH2HState\(\);[\s\S]*?this\.detailDesk = desk;[\s\S]*?this\.detailDeskKey = String\(tournamentId\);/,
  );
  assert.match(
    controller,
    /LIVE_POINTS[\s\S]*?this\.data\.detailOpen[\s\S]*?this\.applyDetailDesk\(desk\)/,
  );
});
