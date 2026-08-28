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

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "active"].includes(normalized)) return true;
    if (["false", "0", "no", "inactive"].includes(normalized)) return false;
  }
  return undefined;
}

function squadSlot(player: LivePlayerRow): number | undefined {
  const parsed = Number(player.squadPosition);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 15) return parsed;
  return undefined;
}

/** Keep the live pitch to an XI; scoring activity is only a fallback for a missing slot. */
export function isLiveSquadPitchStarter(player: LivePlayerRow): boolean {
  const slot = squadSlot(player);
  if (slot !== undefined) return slot <= 11;

  const active = booleanValue((player as unknown as { pickActive?: unknown }).pickActive);
  if (active !== undefined) return active;

  const multiplier = Number(player.multiplier);
  return Number.isFinite(multiplier) && multiplier !== 0;
}

/**
 * Split a live pick list before it reaches either the list UI or the pitch.
 *
 * The normal source is the official pick slot. Older live payloads can omit
 * that field and have also exposed every pick as pickActive=true; in that
 * case an uncapped filter would put all 15 players on the pitch. The API
 * returns picks in slot order, so cap that degraded fallback at the XI and
 * keep the overflow in the bench list until the next authoritative refresh.
 */
export function splitLiveSquadPlayers(players: readonly LivePlayerRow[]): {
  starters: LivePlayerRow[];
  bench: LivePlayerRow[];
} {
  const indexed = players.map((player, index) => ({
    player,
    index,
    slot: squadSlot(player)
  }));
  const ordered = [...indexed].sort((left, right) => {
    if (left.slot !== undefined && right.slot !== undefined) {
      return left.slot - right.slot || left.index - right.index;
    }
    if (left.slot !== undefined) return left.slot <= 11 ? -1 : 1;
    if (right.slot !== undefined) return right.slot <= 11 ? 1 : -1;
    return left.index - right.index;
  });

  const starters = ordered
    .filter(({ player }) => isLiveSquadPitchStarter(player))
    .map(({ player }) => player);
  const bench = ordered
    .filter(({ player }) => !isLiveSquadPitchStarter(player))
    .map(({ player }) => player);

  if (starters.length <= 11) {
    return { starters, bench };
  }

  return {
    starters: starters.slice(0, 11),
    bench: [...bench, ...starters.slice(11)]
  };
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

  const normalizedPickActive = booleanValue(
    (player as unknown as { pickActive?: unknown }).pickActive,
  );
  const normalizedPlayer =
    normalizedPickActive === undefined
      ? player
      : { ...player, pickActive: normalizedPickActive };

  return {
    ...normalizedPlayer,
    name: normalizedPlayer.name || normalizedPlayer.webName,
    position: normalizedPlayer.position || normalizedPlayer.elementTypeName,
    points,
    multiplier,
    roleText: roleText(normalizedPlayer),
    pointsText: `${points}`,
    metaText: metaParts.join(" · "),
    statusText: statusText(normalizedPlayer),
    statusClass: statusClass(normalizedPlayer)
  };
}
