import type { EntryHistoryItem } from "../services/summary.service";
import {
  MINI_CHART_DANGER,
  MINI_CHART_INK,
  MINI_CHART_MUTED,
  MINI_CHART_PLUM,
  type MiniChartPoint,
  type MiniChartType
} from "./mini-chart";

export type SeasonChartMode = "rank" | "totalPoints" | "netPoints" | "captain" | "transfers" | "bench";

export interface SeasonChartPoint {
  gameweek: number;
  overallRank: number | null;
  overallPoints: number;
  netPoints: number;
  eventPoints: number;
  transfers: number;
  transferCost: number;
  captainName: string;
  captainPoints: number;
  benchPoints: number;
  chip: string;
  isChip: boolean;
}

export const SEASON_CHART_MODES: Array<{ id: SeasonChartMode; label: string }> = [
  { id: "rank", label: "总排名" },
  { id: "totalPoints", label: "总分" },
  { id: "netPoints", label: "净分" },
  { id: "captain", label: "队长" },
  { id: "transfers", label: "转会" },
  { id: "bench", label: "板凳" }
];

export const BENCH_HIGH_THRESHOLD = 10;
export const TRANSFER_VISUAL_CAP = 10;

export function normalizeChip(raw?: string | null): string {
  return String(raw || "NONE").toUpperCase().replace(/[\s-]+/g, "_");
}

export function isHighlightChip(chip: string): boolean {
  return [
    "WILDCARD", "WC",
    "FREE_HIT", "FREEHIT", "FH",
    "BENCH_BOOST", "BB", "BBOOST",
    "TRIPLE_CAPTAIN", "TC", "3XC"
  ].indexOf(normalizeChip(chip)) >= 0;
}

export function chipShortLabel(chip: string): string {
  const normalized = normalizeChip(chip);
  if (normalized === "WILDCARD" || normalized === "WC") return "WC";
  if (normalized === "FREE_HIT" || normalized === "FREEHIT" || normalized === "FH") return "FH";
  if (normalized === "BENCH_BOOST" || normalized === "BB" || normalized === "BBOOST") return "BB";
  if (normalized === "TRIPLE_CAPTAIN" || normalized === "TC" || normalized === "3XC") return "3C";
  return "";
}

export function historyToSeasonChartPoints(items: EntryHistoryItem[]): SeasonChartPoint[] {
  return [...items]
    .filter((item) => Number(item.eventId) > 0)
    .sort((left, right) => left.eventId - right.eventId)
    .map((item) => {
      const chip = item.eventChip || "";
      return {
        gameweek: item.eventId,
        overallRank: item.overallRank > 0 ? item.overallRank : null,
        overallPoints: item.overallPoints || 0,
        netPoints: item.eventNetPoints || 0,
        eventPoints: item.eventPoints || 0,
        transfers: item.eventTransfers || 0,
        transferCost: item.eventTransfersCost || 0,
        captainName: item.eventPlayedCaptain?.webName?.trim() || "",
        captainPoints: item.eventCaptainPoints || 0,
        benchPoints: item.eventBenchPoints || 0,
        chip,
        isChip: isHighlightChip(chip)
      };
    });
}

function modeValue(point: SeasonChartPoint, mode: SeasonChartMode): number | null {
  if (mode === "rank") return point.overallRank;
  if (mode === "totalPoints") return point.overallPoints;
  if (mode === "netPoints") return point.netPoints;
  if (mode === "captain") return point.captainPoints;
  if (mode === "bench") return point.benchPoints;
  return Math.sign(point.transfers) * Math.min(Math.abs(point.transfers), TRANSFER_VISUAL_CAP);
}

function barFill(point: SeasonChartPoint, mode: SeasonChartMode): string {
  if (mode === "netPoints") {
    if (point.netPoints < 0) return MINI_CHART_DANGER;
    return point.isChip ? MINI_CHART_PLUM : MINI_CHART_INK;
  }
  if (mode === "captain") {
    const chip = normalizeChip(point.chip);
    if (chip === "TRIPLE_CAPTAIN" || chip === "TC" || chip === "3XC") return MINI_CHART_PLUM;
    return point.captainPoints > 0 ? MINI_CHART_INK : MINI_CHART_MUTED;
  }
  if (mode === "bench") {
    if (isHighlightChip(point.chip) && /BENCH_BOOST|BB/.test(normalizeChip(point.chip))) return MINI_CHART_PLUM;
    return point.benchPoints >= BENCH_HIGH_THRESHOLD ? MINI_CHART_INK : MINI_CHART_MUTED;
  }
  if (mode === "transfers") {
    if (point.transferCost > 0) return MINI_CHART_DANGER;
    return point.isChip ? MINI_CHART_PLUM : MINI_CHART_MUTED;
  }
  return MINI_CHART_INK;
}

export function toMiniChartPoints(points: SeasonChartPoint[], mode: SeasonChartMode): MiniChartPoint[] {
  return points.map((point) => ({
    x: point.gameweek,
    value: modeValue(point, mode),
    bar: mode === "rank" || mode === "totalPoints" ? point.netPoints : undefined,
    fill: barFill(point, mode),
    marker: point.isChip
  }));
}

export function seasonChartType(mode: SeasonChartMode): MiniChartType {
  return mode === "rank" || mode === "totalPoints" ? "combo" : "bar";
}

export function seasonChartHint(mode: SeasonChartMode): string {
  if (mode === "rank") return "折线 = 总排名（越好越上）。浅柱 = 当轮净分。虚线 = 开卡周。";
  if (mode === "totalPoints") return "折线 = 累计总分。浅柱 = 当轮净分。虚线 = 开卡周。";
  if (mode === "netPoints") return "柱图：当轮净分。紫色 = 开卡周；红色 = 净分为负。";
  if (mode === "captain") return "柱图：队长贡献分（已含倍数）。紫色 = 三倍队长。";
  if (mode === "bench") return `柱图：板凳分。虚线 = ${BENCH_HIGH_THRESHOLD}+。紫色 = 板凳加成。`;
  return `柱图：转会次数（柱高上限 ${TRANSFER_VISUAL_CAP}）。红色 = 该轮有 hit。`;
}

export function seasonChartSummary(point: SeasonChartPoint | null): string {
  if (!point) return "点某一轮看明细";
  const parts = [
    `GW${point.gameweek}`,
    point.overallRank ? `排名 ${point.overallRank}` : "",
    `总分 ${point.overallPoints}`,
    `净 ${point.netPoints}`,
    point.captainName ? `队长 ${point.captainName} ${point.captainPoints}` : "",
    `转会 ${point.transfers}`,
    point.transferCost > 0 ? `hit −${point.transferCost}` : "",
    chipShortLabel(point.chip)
  ];
  return parts.filter(Boolean).join(" · ");
}

export interface PastSeasonChartPoint {
  season: string;
  totalPoints: number;
  overallRank: number;
  current: boolean;
}

export function toPastSeasonChartPoints(rows: PastSeasonChartPoint[]): MiniChartPoint[] {
  return [...rows]
    .slice()
    .reverse()
    .map((row, index) => ({
      x: index,
      value: row.overallRank,
      label: String(row.season).replace(/^20/, ""),
      marker: row.current
    }));
}

export function pastSeasonSummary(rows: PastSeasonChartPoint[], selectedIndex: number | null): string {
  if (rows.length < 2) return "至少两个赛季才会显示排名走势";
  const chronological = [...rows].reverse();
  const selected = selectedIndex == null ? null : chronological[selectedIndex] || null;
  if (!selected) return "点某一季看排名和积分";
  return [
    selected.season,
    selected.current ? "本赛季" : "",
    `排名 ${selected.overallRank}`,
    `积分 ${selected.totalPoints}`
  ].filter(Boolean).join(" · ");
}

export type TournamentPathMode = "tournamentRank" | "gapToLeader" | "pointsVsAverage";

export interface TournamentPathPoint {
  gameweek: number;
  tournamentRank: number | null;
  overallPoints: number | null;
  leaderOverallPoints: number | null;
  averageOverallPoints: number | null;
}

export const TOURNAMENT_PATH_MODES: Array<{ id: TournamentPathMode; label: string }> = [
  { id: "tournamentRank", label: "排名" },
  { id: "gapToLeader", label: "你 vs 第一" },
  { id: "pointsVsAverage", label: "你 vs 平均" }
];

export function buildTournamentPathPoint(
  gameweek: number,
  entryId: number,
  rows: Array<{
    entryId: number;
    eventGroupRank?: number | null;
    overallPoints?: number | null;
  }>
): TournamentPathPoint | null {
  if (!rows.length) return null;
  const mine = rows.find((row) => row.entryId === entryId);
  if (!mine) return null;
  const scored = rows
    .map((row) => Number(row.overallPoints))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left);
  const leader = scored[0] ?? null;
  const average = scored.length
    ? scored.reduce((sum, value) => sum + value, 0) / scored.length
    : null;
  return {
    gameweek,
    tournamentRank: mine.eventGroupRank ?? null,
    overallPoints: mine.overallPoints ?? null,
    leaderOverallPoints: leader,
    averageOverallPoints: average
  };
}

export function toTournamentChartPoints(
  points: TournamentPathPoint[],
  mode: TournamentPathMode
): MiniChartPoint[] {
  return points.map((point) => ({
    x: point.gameweek,
    value: mode === "tournamentRank" ? point.tournamentRank : point.overallPoints,
    value2: mode === "gapToLeader"
      ? point.leaderOverallPoints
      : mode === "pointsVsAverage"
        ? point.averageOverallPoints
        : null,
    label: String(point.gameweek)
  }));
}

export function tournamentPathHint(mode: TournamentPathMode): string {
  if (mode === "tournamentRank") return "折线 = 各轮赛事内排名（越好越上）。";
  if (mode === "gapToLeader") return "实线 = 你的累计总分。虚线 = 榜首总分。";
  return "实线 = 你的累计总分。虚线 = 赛事平均分。";
}

export function tournamentPathSummary(point: TournamentPathPoint | null, mode: TournamentPathMode): string {
  if (!point) return "点某一轮看明细";
  if (mode === "tournamentRank") {
    return [`GW${point.gameweek}`, point.tournamentRank != null ? `赛事排名 ${point.tournamentRank}` : ""]
      .filter(Boolean).join(" · ");
  }
  if (mode === "gapToLeader") {
    const gap = point.overallPoints != null && point.leaderOverallPoints != null
      ? Math.max(0, point.leaderOverallPoints - point.overallPoints)
      : null;
    return [
      `GW${point.gameweek}`,
      point.overallPoints != null ? `你 ${Math.round(point.overallPoints)}` : "",
      point.leaderOverallPoints != null ? `第一 ${Math.round(point.leaderOverallPoints)}` : "",
      gap != null ? `落后 ${Math.round(gap)}` : ""
    ].filter(Boolean).join(" · ");
  }
  const delta = point.overallPoints != null && point.averageOverallPoints != null
    ? point.overallPoints - point.averageOverallPoints
    : null;
  return [
    `GW${point.gameweek}`,
    point.overallPoints != null ? `你 ${Math.round(point.overallPoints)}` : "",
    point.averageOverallPoints != null ? `平均 ${Math.round(point.averageOverallPoints)}` : "",
    delta != null ? `${delta >= 0 ? "高" : "低"} ${Math.abs(Math.round(delta))}` : ""
  ].filter(Boolean).join(" · ");
}

export function buildSeasonChartView(
  points: SeasonChartPoint[],
  mode: SeasonChartMode,
  selectedGw: number | null
) {
  const selected = selectedGw == null ? null : points.find((point) => point.gameweek === selectedGw) || null;
  return {
    seasonChartVisible: points.length >= 2,
    seasonChartType: seasonChartType(mode),
    seasonChartInvertY: mode === "rank",
    seasonChartReferenceY: mode === "bench" ? BENCH_HIGH_THRESHOLD : null,
    seasonChartHasReference: mode === "bench",
    seasonChartSeries: toMiniChartPoints(points, mode),
    seasonChartHint: seasonChartHint(mode),
    seasonChartSummary: seasonChartSummary(selected),
    seasonChartSelectedGw: selected ? selected.gameweek : null,
    seasonChartHasSelected: Boolean(selected)
  };
}
