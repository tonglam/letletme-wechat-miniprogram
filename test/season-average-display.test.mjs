import assert from "node:assert/strict";
import test from "node:test";

globalThis.Page = () => {};

const teamModule = await import(
  "../miniprogram/pages/my-fpl/team/team.controller.ts"
);
const summaryFormat = await import(
  "../miniprogram/utils/summary-format.ts"
);
const seasonChart = await import(
  "../miniprogram/utils/season-chart.ts"
);
const liveTournament = await import(
  "../miniprogram/pages/live/tournament/tournament.controller.ts"
);

test("past-season rows use the authoritative season instead of row order", () => {
  const historyRow = {
    season: "2025/26",
    totalPoints: 2100,
    overallRank: 2_400_000
  };

  assert.equal(teamModule.mapSeasonHistoryRow(historyRow, "2627").current, false);
  assert.equal(teamModule.mapSeasonHistoryRow(historyRow, "2025/26").current, true);
  assert.equal(teamModule.mapSeasonHistoryRow(historyRow, undefined).current, false);
});

test("summary averages always keep two decimal places", () => {
  assert.equal(summaryFormat.formatAverageNumber(32.01020408163265), "32.01");
  assert.equal(summaryFormat.formatAverageNumber(0), "0.00");
  assert.equal(summaryFormat.formatAverageMoney(1000), "£100.00m");
});

test("league path summaries keep averages and differences at two decimals", () => {
  const summary = seasonChart.tournamentPathSummary({
    gameweek: 1,
    tournamentRank: 10,
    overallPoints: 25,
    leaderOverallPoints: 59,
    averageOverallPoints: 32.01020408163265
  }, "pointsVsAverage");

  assert.match(summary, /平均 32\.01/);
  assert.match(summary, /低 7\.01/);
});

test("live tournament header keeps the field average at two decimals", () => {
  const stats = liveTournament.buildTournamentStats([
    { eventPointsKnown: true, livePoints: 59 },
    { eventPointsKnown: true, livePoints: 39 },
    { eventPointsKnown: true, livePoints: 0 }
  ]);

  assert.equal(stats.highestText, "59");
  assert.equal(stats.averageText, "32.67");
  assert.equal(stats.entriesText, "3");
  assert.equal(liveTournament.formatBoardAveragePoints(32.01020408163265), "32.01");
  assert.equal(liveTournament.formatBoardAveragePoints(0), "0.00");
  assert.equal(liveTournament.formatBoardAveragePoints(null), "—");
});
