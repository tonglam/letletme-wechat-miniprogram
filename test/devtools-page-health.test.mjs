import assert from "node:assert/strict";
import test from "node:test";

globalThis.Page = () => {};

const { buildTeamSummaryPresentation } = await import(
  "../miniprogram/pages/data/team-detail/team-detail.ts"
);
const { mapOverallStats } = await import(
  "../miniprogram/pages/summary/gameweek/gameweek.ts"
);

test("team detail separates pending records from published venue strength", () => {
  assert.deepEqual(
    buildTeamSummaryPresentation({
      name: "Man City",
      strength: null,
      position: 1,
      points: 0,
      played: 0,
      win: 0,
      draw: 0,
      loss: 0,
      strengthOverallHome: 4,
      strengthOverallAway: 5,
    }),
    {
      strengthDots: [false, false, false, false, false],
      hasStrength: false,
      hasSeasonRecord: false,
      seasonMetrics: [],
      venueStrengths: [
        { label: "主场整体", value: "4 / 5" },
        { label: "客场整体", value: "5 / 5" },
      ],
    },
  );
});

test("gameweek summary omits live zero placeholders without hiding published rows", () => {
  const liveRows = mapOverallStats(
    {
      highestScore: 0,
      averageScore: 0,
      mostSelectedPlayer: { webName: "Haaland" },
    },
    [],
    [],
  );
  assert.equal(liveRows.some((row) => row.label === "最高分"), false);
  assert.equal(liveRows.some((row) => row.label === "平均分"), false);
  assert.equal(liveRows.find((row) => row.label === "最多选择球员")?.value, "Haaland");

  const settledRows = mapOverallStats(
    { highestScore: 98, averageScore: 61 },
    [],
    [],
  );
  assert.deepEqual(
    settledRows.filter((row) => row.label === "最高分" || row.label === "平均分"),
    [
      { label: "最高分", value: "98", meta: "" },
      { label: "平均分", value: "61" },
    ],
  );
});
