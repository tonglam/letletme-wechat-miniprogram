/**
 * Squad-pitch adapter and layout helpers.
 *
 * Converts real FPL event-pick / team-result payloads into the reusable
 * squad-pitch component contract. No player, score, or club data is invented
 * here — missing names/positions drop the pick, missing kits use a placeholder.
 */

export type SquadPosition = "GKP" | "DEF" | "MID" | "FWD";

export type SquadTeamCode =
  | "ARS"
  | "AVL"
  | "BOU"
  | "BRE"
  | "BHA"
  | "CHE"
  | "COV"
  | "CRY"
  | "EVE"
  | "FUL"
  | "HUL"
  | "IPS"
  | "LEE"
  | "LIV"
  | "MCI"
  | "MUN"
  | "NEW"
  | "NFO"
  | "SUN"
  | "TOT";

export type SquadPitchLocale = "zh-CN" | "en";

export interface SquadPitchPlayer {
  id: string;
  webName: string;
  score: number;
  teamCode: SquadTeamCode | "";
  position: SquadPosition;
  fixture?: string;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

export interface SquadPitchHeader {
  eventId: number;
  teamName: string;
  managerName: string;
  totalPoints: number;
  overallRank: number;
  gameweekPoints: number;
  chip: string;
}

export interface SquadPitchProps {
  players: SquadPitchPlayer[];
  benchPlayers: SquadPitchPlayer[];
  header: SquadPitchHeader;
  benchBoost?: boolean;
}

export interface SquadPitchPickInput {
  webName?: string | null;
  teamShortName?: string | null;
  teamName?: string | null;
  elementTypeName?: string | null;
  position?: number | string | null;
  multiplier?: number | null;
  totalPoints?: number | null;
  isCaptain?: boolean | null;
  isViceCaptain?: boolean | null;
  againstShortName?: string | null;
  wasHome?: boolean | string | number | null;
}

export interface SquadPitchTeamInput {
  eventId?: number | null;
  eventPoints?: number | null;
  overallPoints?: number | null;
  overallRank?: number | null;
  eventChip?: string | null;
  entry?: {
    entryName?: string | null;
    playerName?: string | null;
  } | null;
}

export interface SquadPitchHeaderView {
  eyebrow: string;
  teamName: string;
  managerName: string;
  gwLabel: string;
  gwPoints: string;
  chipLabel: string;
  chip: string;
}

export interface SquadPitchRowView {
  position: SquadPosition;
  top: string;
  cardWidth: string;
  players: SquadPitchPlayerView[];
}

export interface SquadPitchPlayerView extends SquadPitchPlayer {
  kitSrc: string;
  marker: "" | "C" | "V";
}

export interface SquadPitchBenchView extends SquadPitchPlayerView {
  label: string;
  fixtureText: string;
  scoreText: string;
}

export const SQUAD_TEAM_CODES: readonly SquadTeamCode[] = [
  "ARS",
  "AVL",
  "BOU",
  "BRE",
  "BHA",
  "CHE",
  "COV",
  "CRY",
  "EVE",
  "FUL",
  "HUL",
  "IPS",
  "LEE",
  "LIV",
  "MCI",
  "MUN",
  "NEW",
  "NFO",
  "SUN",
  "TOT"
];

export const SQUAD_POSITION_ORDER: readonly SquadPosition[] = ["GKP", "DEF", "MID", "FWD"];

export const SQUAD_PITCH_BG = "/assets/squad-pitch/pitch-background.jpg";
export const SQUAD_PITCH_DEFAULT_KIT = "/assets/squad-pitch/kits/DEFAULT.png";

const TEAM_CODE_SET = new Set<string>(SQUAD_TEAM_CODES);

/** Field-only rows. Bench sits below the grass on phone, not inside a tall 4:5 box. */
const STARTER_TOPS: Record<SquadPosition, string> = {
  GKP: "14%",
  DEF: "34%",
  MID: "54%",
  FWD: "74%"
};

export function isSquadTeamCode(value: string): value is SquadTeamCode {
  return TEAM_CODE_SET.has(value);
}

export function resolveSquadTeamCode(value: unknown): SquadTeamCode | "" {
  const normalized = String(value || "").trim().toUpperCase();
  return isSquadTeamCode(normalized) ? normalized : "";
}

export function resolveSquadPosition(value: unknown): SquadPosition | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "1" || normalized === "GKP" || normalized === "GK" || normalized === "GOALKEEPER") return "GKP";
  if (normalized === "2" || normalized === "DEF" || normalized === "DEFENDER") return "DEF";
  if (normalized === "3" || normalized === "MID" || normalized === "MIDFIELDER") return "MID";
  if (normalized === "4" || normalized === "FWD" || normalized === "FORWARD" || normalized === "FOR") return "FWD";
  return null;
}

export function kitAsset(teamCode: string): string {
  return isSquadTeamCode(teamCode)
    ? `/assets/squad-pitch/kits/${teamCode}.png`
    : SQUAD_PITCH_DEFAULT_KIT;
}

export function normalizeSquadChip(chip?: string | null): string {
  const code = String(chip || "").toUpperCase().replace(/[\s-]+/g, "_");
  if (!code || code === "NONE") return "";
  if (code === "WILDCARD" || code === "WC") return "WC";
  if (code === "FREE_HIT" || code === "FREEHIT" || code === "FH") return "FH";
  if (code === "BENCH_BOOST" || code === "BBOOST" || code === "BENCHBOOST" || code === "BB") return "BB";
  if (code === "TRIPLE_CAPTAIN" || code === "TRIPLECAPTAIN" || code === "3XC" || code === "TC") return "TC";
  return code;
}

export function isBenchBoostChip(chip?: string | null): boolean {
  return normalizeSquadChip(chip) === "BB";
}

/**
 * Official FPL lineup slots: 1–11 start, 12–15 sit. Multiplier is only a
 * fallback when the slot number is missing (BB gives bench multiplier 1).
 */
export function isSquadPitchStarter(pick: Pick<SquadPitchPickInput, "position" | "multiplier">): boolean {
  const slot = Number(pick.position);
  if (Number.isFinite(slot) && slot >= 1 && slot <= 15) {
    return slot <= 11;
  }
  return Number(pick.multiplier) !== 0;
}

export function formatSquadFixture(pick: Pick<SquadPitchPickInput, "againstShortName" | "wasHome">): string {
  const opponent = String(pick.againstShortName || "").trim().toUpperCase();
  if (!opponent) return "";
  const home = String(pick.wasHome).toUpperCase();
  if (home === "TRUE" || home === "1" || home === "H" || home === "HOME") {
    return `${opponent} (H)`;
  }
  if (home === "FALSE" || home === "0" || home === "A" || home === "AWAY") {
    return `${opponent} (A)`;
  }
  return opponent;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pickId(pick: SquadPitchPickInput, explicitId?: string): string {
  if (explicitId) return explicitId;
  const slot = Number(pick.position);
  if (Number.isFinite(slot) && slot > 0) return `slot-${slot}`;
  return String(pick.webName || "").trim();
}

export function toSquadPitchPlayer(
  apiPick: SquadPitchPickInput,
  id?: string
): SquadPitchPlayer | null {
  const webName = String(apiPick.webName || "").trim();
  const position = resolveSquadPosition(apiPick.elementTypeName);
  if (!webName || !position) return null;

  const teamCode = resolveSquadTeamCode(apiPick.teamShortName || apiPick.teamName);
  return {
    id: pickId(apiPick, id),
    webName,
    score: finiteNumber(apiPick.totalPoints, 0),
    teamCode,
    position,
    fixture: formatSquadFixture(apiPick) || undefined,
    isCaptain: Boolean(apiPick.isCaptain),
    isViceCaptain: Boolean(apiPick.isViceCaptain)
  };
}

export function toSquadPitchHeader(apiTeam: SquadPitchTeamInput): SquadPitchHeader {
  return {
    eventId: finiteNumber(apiTeam.eventId, 0),
    teamName: String(apiTeam.entry?.entryName || "").trim(),
    managerName: String(apiTeam.entry?.playerName || "").trim(),
    totalPoints: finiteNumber(apiTeam.overallPoints, 0),
    overallRank: finiteNumber(apiTeam.overallRank, 0),
    gameweekPoints: finiteNumber(apiTeam.eventPoints, 0),
    chip: normalizeSquadChip(apiTeam.eventChip)
  };
}

export function sortSquadPitchPlayers(players: readonly SquadPitchPlayer[]): SquadPitchPlayer[] {
  return [...players].sort((left, right) => {
    return SQUAD_POSITION_ORDER.indexOf(left.position) - SQUAD_POSITION_ORDER.indexOf(right.position);
  });
}

export interface SquadPitchRowInput {
  id?: string;
  element?: number | string;
  name?: string;
  webName?: string;
  team?: string;
  teamShortName?: string;
  position?: string;
  elementTypeName?: string;
  points?: string | number;
  livePoints?: number;
  totalPoints?: number;
  bench?: boolean;
  multiplier?: number;
  captain?: boolean;
  isCaptain?: boolean;
  viceCaptain?: boolean;
  isViceCaptain?: boolean;
  statusText?: string;
}

function fixtureFromStatusText(statusText?: string): { againstShortName?: string; wasHome?: boolean } {
  const text = String(statusText || "");
  const match = text.match(/([A-Z]{2,4})/);
  if (!match) return {};
  return {
    againstShortName: match[1],
    wasHome: /主|H\b|HOME/i.test(text)
  };
}

export interface LiveSquadPitchInput {
  eventId?: number;
  teamName?: string;
  managerName?: string;
  totalPoints?: number;
  overallRank?: number;
  gameweekPoints?: number;
  chip?: string;
  starters?: readonly SquadPitchRowInput[];
  bench?: readonly SquadPitchRowInput[];
}

export function buildLiveSquadPitchState(input: LiveSquadPitchInput): {
  pitchPlayers: SquadPitchPlayer[];
  pitchBench: SquadPitchPlayer[];
  pitchHeader: SquadPitchHeader;
  pitchBenchBoost: boolean;
} {
  const starters = (input.starters || []).flatMap((row) => {
    const player = toSquadPitchPlayerFromRow({ ...row, bench: false });
    return player ? [player] : [];
  });
  const bench = (input.bench || []).flatMap((row) => {
    const player = toSquadPitchPlayerFromRow({ ...row, bench: true });
    return player ? [player] : [];
  });
  const header = toSquadPitchHeader({
    eventId: input.eventId,
    eventPoints: input.gameweekPoints,
    overallPoints: input.totalPoints,
    overallRank: input.overallRank,
    eventChip: input.chip,
    entry: {
      entryName: input.teamName,
      playerName: input.managerName
    }
  });
  return {
    pitchPlayers: sortSquadPitchPlayers(starters),
    pitchBench: sortSquadPitchPlayers(bench).slice(0, 4),
    pitchHeader: header,
    pitchBenchBoost: isBenchBoostChip(input.chip)
  };
}

function textField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Official event dream-team XI — no captain/vice and no bench. */
export function buildDreamTeamPitchState(
  players: readonly unknown[],
  eventId?: number
): {
  pitchPlayers: SquadPitchPlayer[];
  pitchBench: SquadPitchPlayer[];
  pitchHeader: SquadPitchHeader;
  pitchBenchBoost: boolean;
} {
  const starters = players.flatMap((raw, index) => {
    const record = nestedRecord(raw);
    const nested = nestedRecord(record.player);
    const team = nestedRecord(nested.team || record.team);
    const mapped = toSquadPitchPlayerFromRow({
      id: textField(record, ["element", "id"]) || textField(nested, ["id"]) || `dream-${index}`,
      webName: textField(record, ["webName", "name", "playerName"]) || textField(nested, ["webName", "name"]),
      teamShortName: textField(record, ["teamShortName", "team"]) || textField(team, ["shortName", "name"]),
      position: textField(record, ["position", "elementType", "elementTypeName"])
        || textField(nested, ["position"]),
      points: (record.points ?? record.totalPoints ?? nested.totalPoints) as string | number | undefined
    });
    return mapped ? [mapped] : [];
  });
  const score = starters.reduce((total, player) => total + player.score, 0);
  return {
    pitchPlayers: sortSquadPitchPlayers(starters),
    pitchBench: [],
    pitchHeader: toSquadPitchHeader({
      eventId,
      eventPoints: score,
      overallPoints: score,
      entry: {
        entryName: "梦之队",
        playerName: eventId ? `GW${eventId}` : ""
      }
    }),
    pitchBenchBoost: false
  };
}

/** Map an already-normalized squad row (list UI) onto the pitch player contract. */
export function toSquadPitchPlayerFromRow(row: SquadPitchRowInput): SquadPitchPlayer | null {
  const score = row.points ?? row.livePoints ?? row.totalPoints;
  const id = row.id || (row.element != null && String(row.element)) || undefined;
  return toSquadPitchPlayer({
    webName: row.webName || row.name,
    teamShortName: row.teamShortName || row.team,
    elementTypeName: row.position || row.elementTypeName,
    multiplier: row.bench ? 0 : row.multiplier ?? 1,
    totalPoints: typeof score === "number" ? score : Number(score),
    isCaptain: row.isCaptain ?? row.captain,
    isViceCaptain: row.isViceCaptain ?? row.viceCaptain,
    ...fixtureFromStatusText(row.statusText)
  }, id);
}

export function toSquadPitchLists(picks: readonly SquadPitchPickInput[]): {
  players: SquadPitchPlayer[];
  benchPlayers: SquadPitchPlayer[];
} {
  const players: SquadPitchPlayer[] = [];
  const benchPlayers: SquadPitchPlayer[] = [];
  picks.forEach((pick, index) => {
    const mapped = toSquadPitchPlayer(pick, pickId(pick, undefined) || `pick-${index}`);
    if (!mapped) return;
    if (isSquadPitchStarter(pick)) players.push(mapped);
    else benchPlayers.push(mapped);
  });
  return {
    players: sortSquadPitchPlayers(players),
    benchPlayers: sortSquadPitchPlayers(benchPlayers).slice(0, 4)
  };
}

export function formatCompactRank(value: number, locale: SquadPitchLocale): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (locale === "zh-CN") {
    if (value >= 10000) {
      const wan = value / 10000;
      return `${trimDecimal(wan)}万`;
    }
    return formatGroupedNumber(value);
  }
  if (value >= 1000000) return `${trimDecimal(value / 1000000)}M`;
  if (value >= 1000) return `${trimDecimal(value / 1000)}K`;
  return formatGroupedNumber(value);
}

export function formatGroupedNumber(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function formatSquadPitchHeaderView(
  header: SquadPitchHeader,
  locale: SquadPitchLocale = "zh-CN"
): SquadPitchHeaderView {
  const chip = header.chip || (locale === "zh-CN" ? "无" : "NONE");
  if (locale === "en") {
    return {
      eyebrow: `TOTAL PTS ${formatGroupedNumber(header.totalPoints)} · OR ${formatCompactRank(header.overallRank, "en")}`,
      teamName: header.teamName,
      managerName: header.managerName,
      gwLabel: "GW PTS",
      gwPoints: formatGroupedNumber(header.gameweekPoints),
      chipLabel: "CHIP",
      chip
    };
  }
  return {
    eyebrow: `总积分 ${formatGroupedNumber(header.totalPoints)} · 总排名 ${formatCompactRank(header.overallRank, "zh-CN")}`,
    teamName: header.teamName,
    managerName: header.managerName,
    gwLabel: "周赛得分",
    gwPoints: formatGroupedNumber(header.gameweekPoints),
    chipLabel: "道具卡",
    chip
  };
}

export function toPlayerView(player: SquadPitchPlayer): SquadPitchPlayerView {
  return {
    ...player,
    kitSrc: kitAsset(player.teamCode),
    marker: player.isCaptain ? "C" : player.isViceCaptain ? "V" : ""
  };
}

export function buildPitchRows(
  players: readonly SquadPitchPlayer[],
  _hasBench = false
): SquadPitchRowView[] {
  return SQUAD_POSITION_ORDER
    .map((position) => {
      const rowPlayers = players.filter((player) => player.position === position);
      const count = rowPlayers.length;
      return {
        position,
        top: STARTER_TOPS[position],
        cardWidth: count > 0 ? `${Math.min(20, 84 / count)}%` : "0%",
        players: rowPlayers.map(toPlayerView)
      };
    })
    .filter((row) => row.players.length > 0);
}

export function buildBenchViews(
  benchPlayers: readonly SquadPitchPlayer[],
  locale: SquadPitchLocale = "zh-CN"
): SquadPitchBenchView[] {
  const pts = locale === "zh-CN" ? "分" : "pts";
  let outfieldIndex = 0;
  return sortSquadPitchPlayers(benchPlayers).slice(0, 4).map((player) => {
    const label = player.position === "GKP" ? "GKP" : `${++outfieldIndex}. ${player.position}`;
    return {
      ...toPlayerView(player),
      label,
      fixtureText: player.fixture || player.teamCode || "",
      scoreText: `${player.score} ${pts}`
    };
  });
}

export function buildSquadPitchView(
  apiTeam: SquadPitchTeamInput & { eventPicks?: readonly SquadPitchPickInput[] | null },
  locale: SquadPitchLocale = "zh-CN"
): SquadPitchProps & { locale: SquadPitchLocale } {
  const lists = toSquadPitchLists(apiTeam.eventPicks || []);
  return {
    ...lists,
    header: toSquadPitchHeader(apiTeam),
    benchBoost: isBenchBoostChip(apiTeam.eventChip),
    locale
  };
}
