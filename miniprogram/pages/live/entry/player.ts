import type { LivePlayerRow } from "../../../models/live";

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statusText(player: LivePlayerRow): string {
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
      return "未知";
  }
}

function statusClass(player: LivePlayerRow): string {
  if (player.pickActive === false) {
    return "live-bench";
  }

  switch (numberValue(player.playStatus, -1)) {
    case 0:
      return "live-blank";
    case 1:
      return "";
    case 2:
      return "live-playing";
    case 3:
      return "live-partial";
    case 4:
      return "live-finished";
    default:
      return "live-unknown";
  }
}

function roleText(player: LivePlayerRow): string {
  if (player.captain) {
    return "C";
  }
  if (player.viceCaptain) {
    return "VC";
  }
  return "";
}

function addPositive(parts: string[], value: number, label: string): void {
  if (value > 0) {
    parts.push(`${value}${label}`);
  }
}

export function normalizePlayer(player: LivePlayerRow): LivePlayerRow {
  const points = numberValue(player.points ?? player.livePoints ?? player.totalPoints);
  const minutes = numberValue(player.minutes);
  const goals = numberValue(player.goalsScored);
  const assists = numberValue(player.assists);
  const bonus = numberValue(player.bonus);
  const cleanSheets = numberValue(player.cleanSheets);
  const saves = numberValue(player.saves);
  const yellowCards = numberValue(player.yellowCards);
  const redCards = numberValue(player.redCards);
  const ownGoals = numberValue(player.ownGoals);
  const penaltiesSaved = numberValue(player.penaltiesSaved);
  const penaltiesMissed = numberValue(player.penaltiesMissed);
  const multiplier = numberValue(player.multiplier, player.captain ? 2 : 1);
  const metaParts = [`${minutes}分钟`];

  addPositive(metaParts, goals, "球");
  addPositive(metaParts, assists, "助");
  if (cleanSheets > 0) {
    metaParts.push("零封");
  }
  addPositive(metaParts, saves, "扑救");
  addPositive(metaParts, yellowCards, "黄");
  addPositive(metaParts, redCards, "红");
  addPositive(metaParts, ownGoals, "乌龙");
  addPositive(metaParts, penaltiesSaved, "扑点");
  addPositive(metaParts, penaltiesMissed, "失点");
  addPositive(metaParts, bonus, "Bonus");

  return {
    ...player,
    name: player.name || player.webName,
    position: player.position || player.elementTypeName,
    points,
    multiplier,
    roleText: roleText(player),
    pointsText: `${points}`,
    metaText: metaParts.join(" · "),
    statusText: statusText(player),
    statusClass: statusClass(player)
  };
}
