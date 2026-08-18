import {
  buildMiniChartDrawPlan,
  formatAxisNum,
  nearestPointIndex,
  numericExtent,
  projectY
} from "../miniprogram/utils/mini-chart";
import {
  buildTournamentPathPoint,
  chipShortLabel,
  historyToSeasonChartPoints,
  isHighlightChip,
  pastSeasonSummary,
  seasonChartType,
  toMiniChartPoints,
  toPastSeasonChartPoints
} from "../miniprogram/utils/season-chart";
import type { EntryHistoryItem } from "../miniprogram/services/summary.service";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

const extent = numericExtent([10, 20, 30]);
assertEqual(extent.min < 10, true, "extent pads below min");
assertEqual(extent.max > 30, true, "extent pads above max");
assertEqual(formatAxisNum(12600), "12.6k", "compact rank tick");
assertEqual(formatAxisNum(850), "850", "small tick stays raw");

const plot = { x: 0, y: 0, width: 100, height: 100 };
assertEqual(Math.round(projectY(10, 0, 10, plot, false)), 0, "normal max is top");
assertEqual(Math.round(projectY(0, 0, 10, plot, false)), 100, "normal min is bottom");
assertEqual(Math.round(projectY(0, 0, 10, plot, true)), 0, "invertY min is top");
assertEqual(nearestPointIndex(0, 5, plot), 0, "hit left");
assertEqual(nearestPointIndex(100, 5, plot), 4, "hit right");
assertEqual(nearestPointIndex(50, 5, plot), 2, "hit middle");
assertEqual(nearestPointIndex(0, 0, plot), -1, "empty series");

const plan = buildMiniChartDrawPlan({
  width: 300,
  height: 160,
  type: "combo",
  points: [
    { x: 1, value: 15000, bar: 68, marker: false },
    { x: 2, value: 10000, bar: 85, marker: true, fill: "#38003c" },
    { x: 3, value: 12600, bar: 68, marker: false }
  ],
  invertY: true,
  selectedX: 2
});
assertEqual(plan.line.length, 3, "combo has line points");
assertEqual(plan.bars.length, 3, "combo has net bars");
assertEqual(plan.markers.length, 1, "chip week marker");
assertEqual(typeof plan.selectedX, "number", "selected x projected");
assertEqual(
  plan.bars.every((bar) => Math.abs((bar.y + bar.h) - (plan.plot.y + plan.plot.height)) < 1),
  true,
  "combo bars sit on the floor with their own scale"
);

const barPlan = buildMiniChartDrawPlan({
  width: 300,
  height: 160,
  type: "bar",
  points: [
    { x: 1, value: 4 },
    { x: 2, value: -4, fill: "#c9183f" }
  ]
});
assertEqual(barPlan.bars.length, 2, "bar plan draws both signs");
assertEqual(typeof barPlan.baselineY, "number", "bar plan has zero baseline");

assertEqual(isHighlightChip("WC"), true, "wildcard is chip");
assertEqual(chipShortLabel("TRIPLE_CAPTAIN"), "3C", "tc short label");
assertEqual(seasonChartType("rank"), "combo", "rank is combo");
assertEqual(seasonChartType("netPoints"), "bar", "net is bar");

const points = historyToSeasonChartPoints([
  {
    eventId: 2,
    eventPoints: 85,
    eventRank: 10000,
    overallPoints: 153,
    overallRank: 10000,
    eventTransfers: 12,
    eventTransfersCost: 0,
    eventNetPoints: 85,
    eventBenchPoints: 12,
    eventChip: "WC",
    eventCaptainPoints: 16,
    eventPlayedCaptain: { webName: "Salah" },
    teamValue: null,
    bank: null
  },
  {
    eventId: 1,
    eventPoints: 68,
    eventRank: 15000,
    overallPoints: 68,
    overallRank: 15000,
    eventTransfers: 1,
    eventTransfersCost: 0,
    eventNetPoints: 68,
    eventBenchPoints: 4,
    eventChip: "",
    eventCaptainPoints: 14,
    eventPlayedCaptain: { webName: "Haaland" },
    teamValue: null,
    bank: null
  }
] as EntryHistoryItem[]);
assertEqual(points.map((point) => point.gameweek).join(","), "1,2", "history sorted ascending");
assertEqual(points[1].isChip, true, "wc marked");
assertEqual(toMiniChartPoints(points, "transfers")[1].value, 10, "transfer visual cap");

const dual = buildMiniChartDrawPlan({
  width: 300,
  height: 160,
  type: "line",
  points: [
    { x: 1, value: 620, value2: 680 },
    { x: 2, value: 1240, value2: 1290 },
    { x: 3, value: 1856, value2: 1898 }
  ]
});
assertEqual(dual.line.length, 3, "dual line has you series");
assertEqual(dual.line2.length, 3, "dual line has benchmark series");

const radar = buildMiniChartDrawPlan({
  width: 300,
  height: 300,
  type: "radar",
  points: [
    { x: 0, label: "进球", value: 99 },
    { x: 1, label: "助攻", value: 62 },
    { x: 2, label: "xGI", value: 97 },
    { x: 3, label: "Bonus", value: 88 }
  ]
});
assertEqual(radar.radarRings.length, 4, "radar rings");
assertEqual(radar.radarPolygons[0].points.length, 4, "radar polygon");
assertEqual(radar.line.length, 0, "radar has no cartesian line");

const past = toPastSeasonChartPoints([
  { season: "2025/26", totalPoints: 1856, overallRank: 12600, current: true },
  { season: "2024/25", totalPoints: 1980, overallRank: 25000, current: false },
  { season: "2023/24", totalPoints: 2140, overallRank: 8400, current: false }
]);
assertEqual(past[0].label, "23/24", "past seasons draw oldest first");
assertEqual(past[2].marker, true, "current season marked");
assertEqual(pastSeasonSummary([
  { season: "2025/26", totalPoints: 1856, overallRank: 12600, current: true },
  { season: "2024/25", totalPoints: 1980, overallRank: 25000, current: false }
], 0).includes("2024/25"), true, "selected past season summary");

const pathPoint = buildTournamentPathPoint(3, 7, [
  { entryId: 7, eventGroupRank: 3, overallPoints: 1856 },
  { entryId: 1, eventGroupRank: 1, overallPoints: 1898 },
  { entryId: 2, eventGroupRank: 2, overallPoints: 1881 }
]);
assertEqual(pathPoint?.tournamentRank, 3, "path rank");
assertEqual(pathPoint?.leaderOverallPoints, 1898, "path leader");
assertEqual(Math.round(pathPoint?.averageOverallPoints || 0), 1878, "path average");

console.log("mini-chart tests passed");
