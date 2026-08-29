/**
 * Squad-pitch adapter and layout helpers.
 *
 * Converts real FPL event-pick / team-result payloads into the reusable
 * squad-pitch component contract. No player, score, or club data is invented
 * here — missing names/positions drop the pick, missing kits use a placeholder.
 */

import { devicePlatform } from "./system-info";

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
  /** Official FPL pick slot: 1–11 starters, 12–15 bench. */
  squadPosition?: number;
  fixture?: string;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  /** Auto-sub badge role (OFFICIAL_IN/OUT, PREDICTED_IN/OUT) for live pages. */
  autoSubRole?: string;
  autoSubPartnerName?: string;
}

export interface SquadPitchHeader {
  eventId: number;
  teamName: string;
  managerName: string;
  totalPoints: number;
  overallRank: number;
  gameweekPoints: number;
  chip: string;
  /** Present for official live scores so unknown values are not rendered as zero. */
  totalPointsKnown?: boolean;
  gameweekPointsKnown?: boolean;
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
  autoSubRole?: string | null;
  autoSubPartnerName?: string | null;
  againstShortName?: string | null;
  wasHome?: boolean | string | number | null;
}

export interface SquadPitchTeamInput {
  eventId?: number | null;
  eventPoints?: number | null;
  overallPoints?: number | null;
  overallRank?: number | null;
  overallPointsKnown?: boolean;
  eventPointsKnown?: boolean;
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
  /** Auto-sub badge display parts (derived here; WXML has no string methods). */
  autoSubArrow: "" | "↑" | "↓";
  autoSubIncoming: boolean;
  autoSubPredicted: boolean;
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

/** Apex static files already sit behind Cloudflare / EdgeOne. */
export const SQUAD_PITCH_CDN_BASE = "https://letletme.top/images/squad-pitch";

function squadPitchAssetBase(): string {
  try {
    if (devicePlatform() === "devtools") return "/assets/squad-pitch";
  } catch {
    // Node tests and missing wx resolve to the published CDN path.
  }
  return SQUAD_PITCH_CDN_BASE;
}

export function squadPitchBackgroundSrc(): string {
  return `${squadPitchAssetBase()}/pitch-background.jpg`;
}

export function defaultKitAsset(): string {
  return `${squadPitchAssetBase()}/kits/DEFAULT.png`;
}

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

function resolveSquadSlot(value: unknown): number | undefined {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 1 && slot <= 15 ? slot : undefined;
}

export function kitAsset(teamCode: string): string {
  return isSquadTeamCode(teamCode)
    ? `${squadPitchAssetBase()}/kits/${teamCode}.png`
    : defaultKitAsset();
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
  const multiplier = Number(pick.multiplier);
  return Number.isFinite(multiplier) && multiplier !== 0;
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
  const player: SquadPitchPlayer = {
    id: pickId(apiPick, id),
    webName,
    score: finiteNumber(apiPick.totalPoints, 0),
    teamCode,
    position,
    fixture: formatSquadFixture(apiPick) || undefined,
    isCaptain: Boolean(apiPick.isCaptain),
    isViceCaptain: Boolean(apiPick.isViceCaptain)
  };
  if (apiPick.autoSubRole) player.autoSubRole = String(apiPick.autoSubRole);
  if (apiPick.autoSubPartnerName) {
    player.autoSubPartnerName = String(apiPick.autoSubPartnerName);
  }
  const squadPosition = resolveSquadSlot(apiPick.position);
  if (squadPosition !== undefined) player.squadPosition = squadPosition;
  return player;
}

export function toSquadPitchHeader(apiTeam: SquadPitchTeamInput): SquadPitchHeader {
  const header: SquadPitchHeader = {
    eventId: finiteNumber(apiTeam.eventId, 0),
    teamName: String(apiTeam.entry?.entryName || "").trim(),
    managerName: String(apiTeam.entry?.playerName || "").trim(),
    totalPoints: finiteNumber(apiTeam.overallPoints, 0),
    overallRank: finiteNumber(apiTeam.overallRank, 0),
    gameweekPoints: finiteNumber(apiTeam.eventPoints, 0),
    chip: normalizeSquadChip(apiTeam.eventChip)
  };
  if (apiTeam.overallPointsKnown !== undefined) {
    header.totalPointsKnown = apiTeam.overallPointsKnown;
  }
  if (apiTeam.eventPointsKnown !== undefined) {
    header.gameweekPointsKnown = apiTeam.eventPointsKnown;
  }
  return header;
}

export function sortSquadPitchPlayers(players: readonly SquadPitchPlayer[]): SquadPitchPlayer[] {
  return [...players].sort((left, right) => {
    return SQUAD_POSITION_ORDER.indexOf(left.position) - SQUAD_POSITION_ORDER.indexOf(right.position);
  });
}

export function sortSquadPitchBench(players: readonly SquadPitchPlayer[]): SquadPitchPlayer[] {
  return players
    .map((player, index) => ({ player, index }))
    .sort((left, right) => {
      const leftSlot = Number(left.player.squadPosition);
      const rightSlot = Number(right.player.squadPosition);
      const leftHasSlot = Number.isSafeInteger(leftSlot) && leftSlot > 11;
      const rightHasSlot = Number.isSafeInteger(rightSlot) && rightSlot > 11;
      if (leftHasSlot && rightHasSlot) return leftSlot - rightSlot;
      if (leftHasSlot) return -1;
      if (rightHasSlot) return 1;
      return left.index - right.index;
    })
    .map(({ player }) => player);
}

export interface SquadPitchRowInput {
  id?: string;
  element?: number | string;
  name?: string;
  webName?: string;
  team?: string;
  teamShortName?: string;
  position?: string;
  squadPosition?: number | string;
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
  autoSubRole?: string;
  autoSubPartnerName?: string;
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
  totalPointsKnown?: boolean;
  gameweekPointsKnown?: boolean;
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
  const starterPlayers = (input.starters || []).flatMap((row) => {
    const player = toSquadPitchPlayerFromRow({ ...row, bench: false });
    return player ? [player] : [];
  });
  const benchPlayers = (input.bench || []).flatMap((row) => {
    const player = toSquadPitchPlayerFromRow({ ...row, bench: true });
    return player ? [player] : [];
  });
  const lists = normalizeSquadPitchLists(starterPlayers, benchPlayers);
  const header = toSquadPitchHeader({
    eventId: input.eventId,
    eventPoints: input.gameweekPoints,
    overallPoints: input.totalPoints,
    overallPointsKnown: input.totalPointsKnown,
    eventPointsKnown: input.gameweekPointsKnown,
    overallRank: input.overallRank,
    eventChip: input.chip,
    entry: {
      entryName: input.teamName,
      playerName: input.managerName
    }
  });
  return {
    pitchPlayers: lists.players,
    pitchBench: lists.benchPlayers,
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
    position: row.squadPosition,
    multiplier: row.bench ? 0 : row.multiplier ?? 1,
    totalPoints: typeof score === "number" ? score : Number(score),
    isCaptain: row.isCaptain ?? row.captain,
    isViceCaptain: row.isViceCaptain ?? row.viceCaptain,
    autoSubRole: row.autoSubRole,
    autoSubPartnerName: row.autoSubPartnerName,
    ...fixtureFromStatusText(row.statusText)
  }, id);
}

/**
 * Keep the reusable pitch contract safe even when a caller sends a mixed
 * 15-player list. Official slots win; without slots the API order is the
 * only non-invented fallback, so cap the pitch at the first XI and retain the
 * overflow as substitutes.
 */
export function normalizeSquadPitchLists(
  players: readonly SquadPitchPlayer[],
  benchPlayers: readonly SquadPitchPlayer[] = []
): {
  players: SquadPitchPlayer[];
  benchPlayers: SquadPitchPlayer[];
} {
  const slotBench = players.filter((player) => (player.squadPosition ?? 0) > 11);
  let starters = players.filter((player) => (player.squadPosition ?? 0) <= 11);
  let bench = [...benchPlayers, ...slotBench];

  if (starters.length > 11) {
    bench = [...bench, ...starters.slice(11)];
    starters = starters.slice(0, 11);
  }

  return {
    players: sortSquadPitchPlayers(starters),
    benchPlayers: sortSquadPitchBench(bench).slice(0, 4)
  };
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
  return normalizeSquadPitchLists(players, benchPlayers);
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
  const totalPoints = header.totalPointsKnown === false ? "—" : formatGroupedNumber(header.totalPoints);
  const gameweekPoints = header.gameweekPointsKnown === false ? "—" : formatGroupedNumber(header.gameweekPoints);
  if (locale === "en") {
    return {
      eyebrow: `TOTAL PTS ${totalPoints} · OR ${formatCompactRank(header.overallRank, "en")}`,
      teamName: header.teamName,
      managerName: header.managerName,
      gwLabel: "GW PTS",
      gwPoints: gameweekPoints,
      chipLabel: "CHIP",
      chip
    };
  }
  return {
    eyebrow: `总积分 ${totalPoints} · 总排名 ${formatCompactRank(header.overallRank, "zh-CN")}`,
    teamName: header.teamName,
    managerName: header.managerName,
    gwLabel: "周赛得分",
    gwPoints: gameweekPoints,
    chipLabel: "道具卡",
    chip
  };
}

export function toPlayerView(player: SquadPitchPlayer): SquadPitchPlayerView {
  // Kept inline (instead of importing live-auto-subs) to avoid a module cycle:
  // live-auto-subs already imports isBenchBoostChip from this module.
  const role = player.autoSubRole || "";
  const incoming = role.endsWith("_IN");
  return {
    ...player,
    kitSrc: kitAsset(player.teamCode),
    marker: player.isCaptain ? "C" : player.isViceCaptain ? "V" : "",
    autoSubArrow: role ? (incoming ? "↑" : "↓") : "",
    autoSubIncoming: incoming,
    autoSubPredicted: role.startsWith("PREDICTED_")
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
