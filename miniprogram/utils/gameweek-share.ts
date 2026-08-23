import type { DisplayMetric, DisplayRow } from "./summary-format";
import type { SquadPitchPlayer } from "./squad-pitch";

export type GameweekShareKind =
  | "headline"
  | "most"
  | "chips"
  | "dreamTeam"
  | "elite"
  | "transfersIn"
  | "transfersOut";

export interface GameweekShareInput {
  event: number;
  headlineStats: readonly DisplayMetric[];
  mostRows: readonly DisplayMetric[];
  chipRows: readonly DisplayRow[];
  dreamPlayers: readonly SquadPitchPlayer[];
  dreamBench?: readonly SquadPitchPlayer[];
  dreamPoints?: number;
  eliteRows: readonly DisplayRow[];
  transfersInRows: readonly DisplayRow[];
  transfersOutRows: readonly DisplayRow[];
}

const POSITION_LABELS: Record<string, string> = {
  GKP: "门将",
  DEF: "后卫",
  MID: "中场",
  FWD: "前锋"
};

function text(value: unknown): string {
  return value === undefined || value === null || value === "" ? "" : String(value);
}

function rowLine(row: DisplayRow): string {
  return `- ${[row.title, row.description, row.meta, row.value].filter(Boolean).join(" · ")}`;
}

function metricLine(row: DisplayMetric): string {
  const detail = [row.value, row.meta].filter(Boolean).join(" · ");
  return `- ${row.label}${detail ? `：${detail}` : ""}`;
}

function playerLine(player: SquadPitchPlayer): string {
  const role = player.isCaptain ? " (C)" : player.isViceCaptain ? " (V)" : "";
  const position = POSITION_LABELS[player.position] || text(player.position);
  const identity = `${text(player.webName) || "-"}${role}`;
  const teamPosition = [text(player.teamCode), position].filter(Boolean).join(" ");
  return `- ${[identity, teamPosition, `${player.score}分`].filter(Boolean).join(" · ")}`;
}

function pushMetricRows(lines: string[], rows: readonly DisplayMetric[]): void {
  if (rows.length === 0) {
    lines.push("无");
    return;
  }
  rows.forEach((row) => lines.push(metricLine(row)));
}

function pushDisplayRows(lines: string[], rows: readonly DisplayRow[]): void {
  if (rows.length === 0) {
    lines.push("无");
    return;
  }
  rows.forEach((row) => lines.push(rowLine(row)));
}

function pushDreamRows(lines: string[], input: GameweekShareInput): void {
  const starters = input.dreamPlayers || [];
  const bench = input.dreamBench || [];
  if (starters.length === 0 && bench.length === 0) {
    lines.push("无");
    return;
  }
  starters.forEach((player) => lines.push(playerLine(player)));
  if (bench.length > 0) {
    lines.push("— 替补 —");
    bench.forEach((player) => lines.push(playerLine(player)));
  }
}

export function formatGameweekShareText(
  input: GameweekShareInput,
  kind: GameweekShareKind
): string {
  const titles: Record<GameweekShareKind, string> = {
    headline: "本轮概览",
    most: "本轮之最",
    chips: "开卡情况",
    dreamTeam: "梦之队",
    elite: "高分榜",
    transfersIn: "转入最多",
    transfersOut: "转出最多"
  };
  const lines = [`GW${input.event} ${titles[kind]}`, ""];

  switch (kind) {
    case "headline":
      pushMetricRows(lines, input.headlineStats);
      break;
    case "most":
      pushMetricRows(lines, input.mostRows);
      break;
    case "chips":
      pushDisplayRows(lines, input.chipRows);
      break;
    case "dreamTeam": {
      const points = Number(input.dreamPoints);
      if (Number.isFinite(points)) lines[0] += ` · ${points}分`;
      pushDreamRows(lines, input);
      break;
    }
    case "elite":
      pushDisplayRows(lines, input.eliteRows);
      break;
    case "transfersIn":
      pushDisplayRows(lines, input.transfersInRows);
      break;
    case "transfersOut":
      pushDisplayRows(lines, input.transfersOutRows);
      break;
  }

  return lines.join("\n");
}
