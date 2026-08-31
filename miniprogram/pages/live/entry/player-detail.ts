import type { LivePlayerRow } from "../../../models/live";

export interface PlayerLiveStatRow {
  label: string;
  value: string;
  muted: boolean;
}

export type PlayerLiveBreakdownKind =
  | "minutes"
  | "goals"
  | "assists"
  | "cleansheet"
  | "defensive"
  | "saves"
  | "pensaved"
  | "penmissed"
  | "owngoal"
  | "yellow"
  | "red"
  | "bonus";

export interface PlayerLiveBreakdownRow {
  kind: PlayerLiveBreakdownKind;
  label: string;
  countText: string;
  pointsText: string;
  negative: boolean;
}

/** Live "points still available" row — DC progress / CS minute threshold. */
export interface PlayerLiveOpportunityRow {
  kind: "defensive" | "cleansheet";
  label: string;
  text: string;
  progressPct: number;
}

export interface PlayerLiveDetailView {
  name: string;
  team: string;
  position: string;
  statusText: string;
  pointsText: string;
  roleBadge: string;
  bonusText: string;
  bpsText: string;
  bpsTone: "high" | "mid" | "ok" | "low" | "";
  multiplierNote: string;
  opportunityRows: PlayerLiveOpportunityRow[];
  statRows: PlayerLiveStatRow[];
  breakdownRows: PlayerLiveBreakdownRow[];
  breakdownSumText: string;
  breakdownHint: string;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = ""): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

export function normalizeLivePosition(player: LivePlayerRow): string {
  const raw = textValue(
    player.position || player.elementTypeName,
  ).toUpperCase();
  if (raw.startsWith("GK")) return "GKP";
  if (raw.startsWith("DEF")) return "DEF";
  if (raw.startsWith("MID")) return "MID";
  if (raw.startsWith("FWD") || raw.startsWith("FOR")) return "FWD";
  return raw;
}

function statusOf(player: LivePlayerRow): string {
  if (player.statusText) return String(player.statusText);
  switch (numberValue(player.playStatus, -1)) {
    case 0:
      return "无比赛";
    case 1:
      return "未开始";
    case 2:
      return "比赛中";
    case 3:
      return "部分完赛";
    case 4:
      return "已完赛";
    default:
      return "";
  }
}

function statRow(label: string, value: number): PlayerLiveStatRow {
  return { label, value: String(value), muted: value === 0 };
}

/** Expected-goals family — fractional, shown with two decimals like the web. */
function expectedStatRow(
  label: string,
  value: unknown,
): PlayerLiveStatRow | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return { label, value: parsed.toFixed(2), muted: parsed === 0 };
}

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}

function pushBreakdown(
  rows: PlayerLiveBreakdownRow[],
  kind: PlayerLiveBreakdownKind,
  label: string,
  points: number,
  value?: number,
  countText = "",
): void {
  if (points === 0) return;
  rows.push({
    kind,
    label,
    countText,
    pointsText: formatPoints(points),
    negative: points < 0,
  });
  if (!countText && value !== undefined && value !== 0) {
    rows[rows.length - 1].countText = `${value}次`;
  }
}

/** FPL defensive-contribution thresholds: DEF ≥10, MID/FWD ≥12 earn +2. */
function defensiveContributionThreshold(position: string): number {
  if (position === "DEF") return 10;
  if (position === "MID" || position === "FWD") return 12;
  return 0;
}

function authoritativePoints(
  player: LivePlayerRow,
  identifiers: readonly string[],
): number | undefined {
  for (const identifier of identifiers) {
    const stat = player.statPoints?.[identifier.toLowerCase()];
    if (!stat) continue;
    return numberValue(stat.points) + numberValue(stat.pointsModification);
  }
  return undefined;
}

export function buildProvisionalBreakdown(
  player: LivePlayerRow,
): PlayerLiveBreakdownRow[] {
  const position = normalizeLivePosition(player);
  const minutes = numberValue(player.minutes);
  const goals = numberValue(player.goalsScored);
  const assists = numberValue(player.assists);
  const cleanSheets = numberValue(player.cleanSheets);
  const defensiveContribution = numberValue(player.defensiveContribution);
  const saves = numberValue(player.saves);
  const penaltiesSaved = numberValue(player.penaltiesSaved);
  const penaltiesMissed = numberValue(player.penaltiesMissed);
  const ownGoals = numberValue(player.ownGoals);
  const yellowCards = numberValue(player.yellowCards);
  const redCards = numberValue(player.redCards);
  const bonus = numberValue(player.bonus);
  const rows: PlayerLiveBreakdownRow[] = [];

  const minutesPoints = authoritativePoints(player, ["minutes", "mins"]);
  if (minutesPoints !== undefined || minutes > 0) {
    pushBreakdown(
      rows,
      "minutes",
      "出场",
      minutesPoints ?? (minutes >= 60 ? 2 : 1),
      minutes,
      `${minutes}分钟`,
    );
  }
  const goalsPer =
    position === "GKP" || position === "DEF" ? 6 : position === "MID" ? 5 : 4;
  const goalsPoints = authoritativePoints(player, [
    "goals",
    "goals_scored",
    "goalsScored",
  ]);
  if (goalsPoints !== undefined || goals > 0) {
    pushBreakdown(
      rows,
      "goals",
      "进球",
      goalsPoints ?? goals * goalsPer,
      goals,
    );
  }
  const assistsPoints = authoritativePoints(player, ["assists"]);
  if (assistsPoints !== undefined || assists > 0) {
    pushBreakdown(
      rows,
      "assists",
      "助攻",
      assistsPoints ?? assists * 3,
      assists,
    );
  }
  const cleanSheetPer =
    position === "GKP" || position === "DEF" ? 4 : position === "MID" ? 1 : 0;
  const cleanSheetsPoints = authoritativePoints(player, [
    "clean_sheets",
    "cleanSheets",
  ]);
  if (cleanSheetsPoints !== undefined || cleanSheets > 0) {
    if (cleanSheetPer > 0 || cleanSheetsPoints !== undefined) {
      pushBreakdown(
        rows,
        "cleansheet",
        "零封",
        cleanSheetsPoints ?? cleanSheets * cleanSheetPer,
        cleanSheets,
      );
    }
  }
  const dcThreshold = defensiveContributionThreshold(position);
  const defensivePoints = authoritativePoints(player, [
    "defensive_contribution",
    "defensiveContribution",
  ]);
  if (
    defensivePoints !== undefined ||
    (dcThreshold > 0 && defensiveContribution >= dcThreshold)
  ) {
    pushBreakdown(rows, "defensive", "防守贡献", defensivePoints ?? 2);
  }
  const savesPoints = authoritativePoints(player, ["saves"]);
  if (savesPoints !== undefined || (position === "GKP" && saves > 0)) {
    const pts = Math.floor(saves / 3);
    if (savesPoints !== undefined || pts !== 0) {
      pushBreakdown(
        rows,
        "saves",
        "扑救",
        savesPoints ?? pts,
        saves,
        `${saves}次`,
      );
    }
  }
  const penaltiesSavedPoints = authoritativePoints(player, [
    "penalties_saved",
    "penaltiesSaved",
  ]);
  if (penaltiesSavedPoints !== undefined || penaltiesSaved > 0) {
    pushBreakdown(
      rows,
      "pensaved",
      "扑点",
      penaltiesSavedPoints ?? penaltiesSaved * 5,
      penaltiesSaved,
    );
  }
  const penaltiesMissedPoints = authoritativePoints(player, [
    "penalties_missed",
    "penaltiesMissed",
  ]);
  if (penaltiesMissedPoints !== undefined || penaltiesMissed > 0) {
    pushBreakdown(
      rows,
      "penmissed",
      "失点",
      penaltiesMissedPoints ?? penaltiesMissed * -2,
      penaltiesMissed,
    );
  }
  const ownGoalsPoints = authoritativePoints(player, ["own_goals", "ownGoals"]);
  if (ownGoalsPoints !== undefined || ownGoals > 0) {
    pushBreakdown(
      rows,
      "owngoal",
      "乌龙",
      ownGoalsPoints ?? ownGoals * -2,
      ownGoals,
    );
  }
  const yellowCardPoints = authoritativePoints(player, [
    "yellow_cards",
    "yellowCards",
  ]);
  if (yellowCardPoints !== undefined || yellowCards > 0) {
    pushBreakdown(
      rows,
      "yellow",
      "黄牌",
      yellowCardPoints ?? yellowCards * -1,
      yellowCards,
    );
  }
  const redCardPoints = authoritativePoints(player, ["red_cards", "redCards"]);
  if (redCardPoints !== undefined || redCards > 0) {
    pushBreakdown(
      rows,
      "red",
      "红牌",
      redCardPoints ?? redCards * -3,
      redCards,
    );
  }
  const bonusPoints = authoritativePoints(player, ["bonus"]);
  if (bonusPoints !== undefined || bonus > 0) {
    pushBreakdown(rows, "bonus", "奖励分", bonusPoints ?? bonus);
  }
  return rows;
}

function matchStatRows(
  player: LivePlayerRow,
  position: string,
): PlayerLiveStatRow[] {
  const minutes = numberValue(player.minutes);
  const goals = numberValue(player.goalsScored);
  const assists = numberValue(player.assists);
  const cleanSheets = numberValue(player.cleanSheets);
  const defensiveContribution = numberValue(player.defensiveContribution);
  const saves = numberValue(player.saves);
  const penaltiesSaved = numberValue(player.penaltiesSaved);
  const yellowCards = numberValue(player.yellowCards);
  const redCards = numberValue(player.redCards);
  const bonus = numberValue(player.bonus);
  const ownGoals = numberValue(player.ownGoals);
  const penaltiesMissed = numberValue(player.penaltiesMissed);

  const rows: PlayerLiveStatRow[] = [statRow("分钟", minutes)];
  if (position === "GKP") {
    rows.push(
      statRow("扑救", saves),
      statRow("零封", cleanSheets),
      statRow("扑点", penaltiesSaved),
    );
  } else if (position === "DEF" || position === "MID") {
    rows.push(
      statRow("进球", goals),
      statRow("助攻", assists),
      statRow("零封", cleanSheets),
      statRow("防守贡献", defensiveContribution),
    );
  } else {
    rows.push(
      statRow("进球", goals),
      statRow("助攻", assists),
      statRow("防守贡献", defensiveContribution),
    );
  }
  // Expected-goals family (web parity): xG/xA for everyone, xGC where tracked.
  for (const expected of [
    expectedStatRow("xG", player.expectedGoals),
    expectedStatRow("xA", player.expectedAssists),
    position === "GKP" || position === "DEF"
      ? expectedStatRow("xGC", player.expectedGoalsConceded)
      : null,
  ]) {
    if (expected) rows.push(expected);
  }
  rows.push(
    statRow("黄牌", yellowCards),
    statRow("红牌", redCards),
    statRow("奖励分", bonus),
  );
  if (ownGoals > 0) rows.push(statRow("乌龙", ownGoals));
  if (penaltiesMissed > 0) rows.push(statRow("失点", penaltiesMissed));
  return rows;
}

/** Live-only "points still available" signals (比赛中 / 部分完赛). */
function buildOpportunities(
  player: LivePlayerRow,
  position: string,
): PlayerLiveOpportunityRow[] {
  const status = numberValue(player.playStatus, -1);
  if (status !== 2 && status !== 3) return [];
  const rows: PlayerLiveOpportunityRow[] = [];
  const minutes = numberValue(player.minutes);

  const dc = numberValue(player.defensiveContribution);
  const dcThreshold = defensiveContributionThreshold(position);
  if (dcThreshold > 0 && dc > 0 && dc < dcThreshold) {
    rows.push({
      kind: "defensive",
      label: "防守贡献",
      text: `${dc}/${dcThreshold} · 达标 +2`,
      progressPct: Math.round((dc / dcThreshold) * 100),
    });
  }

  // Clean sheet only counts once the player reaches 60 minutes.
  const cleanSheets = numberValue(player.cleanSheets);
  if (
    cleanSheets > 0 &&
    minutes > 0 &&
    minutes < 60 &&
    (position === "GKP" || position === "DEF" || position === "MID")
  ) {
    const per = position === "MID" ? 1 : 4;
    rows.push({
      kind: "cleansheet",
      label: "零封",
      text: `${minutes}/60 分钟 · 满 60 分钟 +${per}`,
      progressPct: Math.round((minutes / 60) * 100),
    });
  }
  return rows;
}

function bpsToneOf(bps: number | null): PlayerLiveDetailView["bpsTone"] {
  if (bps === null) return "";
  if (bps >= 50) return "high";
  if (bps >= 25) return "mid";
  if (bps >= 0) return "ok";
  return "low";
}

export function buildPlayerLiveDetail(
  player: LivePlayerRow,
): PlayerLiveDetailView {
  const position = normalizeLivePosition(player);
  const points = numberValue(
    player.points ?? player.livePoints ?? player.totalPoints,
  );
  const bonus = numberValue(player.bonus);
  const hasBps = player.bps !== undefined && player.bps !== null;
  const bps = hasBps ? numberValue(player.bps) : null;
  const multiplier = numberValue(player.multiplier, 1);
  const rawRows = buildProvisionalBreakdown(player);
  const rawSum = rawRows.reduce((sum, row) => sum + Number(row.pointsText), 0);
  const scale =
    rawSum > 0 && points === rawSum * 3
      ? 3
      : rawSum > 0 && points === rawSum * 2
        ? 2
        : 1;
  const breakdownRows =
    scale > 1
      ? rawRows.map((row) => ({
          ...row,
          pointsText: formatPoints(Number(row.pointsText) * scale),
        }))
      : rawRows;
  const shownSum = breakdownRows.reduce(
    (sum, row) => sum + Number(row.pointsText),
    0,
  );
  const reconciles = shownSum === points;

  return {
    name: textValue(player.name || player.webName, "-"),
    team: textValue(player.team || player.teamShortName),
    position,
    statusText: statusOf(player),
    pointsText: String(points),
    roleBadge: player.captain
      ? multiplier >= 3
        ? "TC ×3"
        : "C ×2"
      : player.viceCaptain
        ? "V"
        : "",
    bonusText: bonus > 0 ? `+${bonus}` : "",
    bpsText: bps === null ? "" : String(bps),
    bpsTone: bpsToneOf(bps),
    multiplierNote:
      multiplier > 1 && breakdownRows.length > 0
        ? `明细已含队长 ×${multiplier}`
        : "",
    opportunityRows: buildOpportunities(player, position),
    statRows: matchStatRows(player, position),
    breakdownRows,
    breakdownSumText: breakdownRows.length > 0 ? formatPoints(shownSum) : "",
    breakdownHint:
      breakdownRows.length === 0
        ? "官方明细同步后会显示在这里"
        : reconciles
          ? ""
          : "暂估明细，可能尚未计入防守贡献等官方项",
  };
}
