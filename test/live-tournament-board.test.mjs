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

  // Row display: captain points ride the (C) label; OR/TV have a sub-meta line.
  assert.match(controller, /captainPointsKnown \? ` \$\{row\.captainPoints\}`/);
  assert.match(controller, /overallRankText: overallRankKnown \? formatRank/);
  assert.match(controller, /teamValueText: teamValueKnown/);
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
