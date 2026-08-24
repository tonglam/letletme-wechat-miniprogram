import type { LiveManagerScore, LivePlayerRow, LiveTournamentRow } from "../models/live";
import {
  officialManagerEventPoints,
  officialManagerNetPoints,
  officialManagerTotalPoints,
  traceableOfficialManagerScore,
} from "./live-manager-score";

export type TournamentOwnershipScope = "any" | "starter" | "bench";
export type TournamentCaptainMode = "any" | "captain" | "vice";

export interface TournamentLiveGraphQLRow {
  entry: number;
  entryName: string;
  playerName: string;
  rank?: number;
  overallRank?: number;
  chip?: string | null;
  livePoints: number;
  transferCost: number;
  liveNetPoints: number;
  liveTotalPoints: number;
  played: number;
  toPlay: number;
  captainName: string;
  score?: LiveManagerScore;
  pickList?: Array<{
    element: number;
    webName: string;
    teamShortName?: string;
    teamName?: string;
    elementTypeName?: string;
    position?: number;
    isCaptain?: boolean;
    isViceCaptain?: boolean;
    multiplier?: number;
    pickActive?: boolean;
    autoSub?: boolean;
    totalPoints?: number;
  }>;
}

export interface TournamentOwnershipFilter {
  playerIds: number[];
  scope: TournamentOwnershipScope;
  captainMode: TournamentCaptainMode;
}

export interface TournamentTeamExposureRule {
  teamShortName: string;
  exactCount: number;
}

export interface TournamentTeamExposureFilter {
  /** Multiple club rules, all must hold — same as the web TeamExposureFilter. */
  rules?: TournamentTeamExposureRule[];
  scope: TournamentOwnershipScope;
}

export interface TournamentTeamOption {
  shortName: string;
  name: string;
}

export interface TournamentManagerCoverage {
  officialCoverage?: number;
  unavailableEntryIds?: readonly number[];
  totalEntries?: number;
}

export function mergeUnavailableTournamentEntryIds(
  failedEntryIds: readonly number[] = [],
  unavailableEntryIds: readonly number[] = [],
): number[] {
  return [...new Set([...failedEntryIds, ...unavailableEntryIds])];
}

export function officialTournamentTotalPoints(
  score?: LiveManagerScore,
): number | undefined {
  return officialManagerTotalPoints(score);
}

export function tournamentManagerScoreStatus(
  rows: readonly LiveTournamentRow[],
  coverage: TournamentManagerCoverage = {},
): string {
  const traceableScores = rows
    .map((row) => traceableOfficialManagerScore(row.score))
    .filter((score): score is LiveManagerScore => score !== undefined);
  const states = traceableScores.map((score) => score.state).filter(Boolean);
  const observedAvailable = rows.filter(
    (row) => officialManagerEventPoints(row.score) !== undefined,
  ).length;
  const total =
    typeof coverage.totalEntries === "number" &&
    Number.isFinite(coverage.totalEntries) &&
    coverage.totalEntries > 0
      ? Math.floor(coverage.totalEntries)
      : rows.length;
  const unavailableCount = new Set(coverage.unavailableEntryIds || []).size;
  const reportedAvailable =
    typeof coverage.officialCoverage === "number" &&
    Number.isFinite(coverage.officialCoverage)
      ? Math.min(
          total,
          Math.max(0, Math.round(coverage.officialCoverage * total)),
        )
      : 0;
  if (observedAvailable === 0) return "官方分数不可用";
  const metadataAvailable = unavailableCount > 0
    ? Math.max(0, total - unavailableCount)
    : Math.max(observedAvailable, reportedAvailable);
  const available = Math.min(observedAvailable, metadataAvailable);
  if (states.includes("SETTLING")) return "结算中";
  if (states.includes("STALE")) return "官方数据延迟";
  if (states.length === 0 || available === 0) return "官方分数不可用";
  if (available < total) {
    return `官方实时：${available}/${total} 支球队已有分数`;
  }
  return "官方实时";
}

function mapTournamentPick(item: NonNullable<TournamentLiveGraphQLRow["pickList"]>[number]): LivePlayerRow {
  return {
    element: item.element,
    webName: item.webName,
    team: item.teamName,
    teamShortName: item.teamShortName,
    elementTypeName: item.elementTypeName,
    position: item.elementTypeName,
    squadPosition: item.position,
    points: item.totalPoints,
    livePoints: item.totalPoints,
    totalPoints: item.totalPoints,
    captain: Boolean(item.isCaptain || (item.multiplier || 0) >= 2),
    viceCaptain: Boolean(item.isViceCaptain),
    pickActive: item.pickActive ?? (item.position === undefined ? undefined : item.position <= 11),
    autoSub: item.autoSub,
    multiplier: item.multiplier ?? (item.isCaptain ? 2 : undefined)
  };
}

function pickInScope(pick: LivePlayerRow, scope: TournamentOwnershipScope): boolean {
  if (scope === "any") {
    return true;
  }
  const isStarter = pick.pickActive === undefined ? false : pick.pickActive;
  return scope === "starter" ? isStarter : !isStarter;
}

function pickMatchesCaptainMode(pick: LivePlayerRow, captainMode: TournamentCaptainMode): boolean {
  if (captainMode === "captain") {
    return Boolean(pick.captain);
  }
  if (captainMode === "vice") {
    return Boolean(pick.viceCaptain);
  }
  return true;
}

function searchText(row: LiveTournamentRow): string {
  return [
    row.entry,
    row.entryName,
    row.playerName,
    ...(row.picks || []).map((pick) => `${pick.element || ""} ${pick.webName || ""} ${pick.teamShortName || ""} ${pick.team || ""}`)
  ].filter((value) => value !== undefined && value !== null && value !== "").join(" ").toLowerCase();
}

export function mapTournamentLiveRows(rows: TournamentLiveGraphQLRow[]): LiveTournamentRow[] {
  return rows.map((row) => {
    const officialScore = traceableOfficialManagerScore(row.score);
    const officialEventPoints = officialManagerEventPoints(officialScore);
    const officialNetPoints = officialManagerNetPoints(officialScore);
    const officialTotal = officialManagerTotalPoints(officialScore);
    const mapped: LiveTournamentRow = {
      entry: row.entry,
      entryName: row.entryName,
      playerName: row.playerName,
      rank: officialScore ? row.rank ?? row.overallRank : undefined,
      livePoints: officialEventPoints,
      transferCost: officialScore?.transferCost,
      liveNetPoints: officialNetPoints,
      liveTotalPoints: officialTotal,
      totalPoints: officialTotal,
      played: row.played,
      toPlay: row.toPlay,
      captainName: row.captainName,
      chip: row.chip || undefined,
      overallRank: officialScore?.overallRank ?? row.overallRank,
      score: officialScore,
      picks: (row.pickList || []).map(mapTournamentPick)
    };
    return {
      ...mapped,
      searchText: searchText(mapped)
    };
  });
}

/** Keep unavailable score values after every known score in either direction. */
export function compareKnownTournamentValues(
  left: number | undefined,
  right: number | undefined,
  desc: boolean,
): number {
  const leftKnown = typeof left === "number" && Number.isFinite(left);
  const rightKnown = typeof right === "number" && Number.isFinite(right);
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  if (!leftKnown || !rightKnown || left === right) return 0;
  return (left - right) * (desc ? -1 : 1);
}

export function filterTournamentLiveRows(rows: LiveTournamentRow[], keyword: string): LiveTournamentRow[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return rows;
  }
  return rows.filter((row) => (row.searchText || searchText(row)).includes(normalizedKeyword));
}

export function filterTournamentRowsByOwnership(
  rows: LiveTournamentRow[],
  filter: TournamentOwnershipFilter
): LiveTournamentRow[] {
  const playerIds = filter.playerIds.filter((id) => Number.isInteger(id) && id > 0);
  if (playerIds.length === 0) {
    return rows;
  }
  return rows.filter((row) => {
    const picks = row.picks || [];
    return playerIds.every((playerId) => picks.some((pick) => (
      pick.element === playerId
      && pickInScope(pick, filter.scope)
      && pickMatchesCaptainMode(pick, filter.captainMode)
    )));
  });
}

export function filterTournamentRowsByTeamExposure(
  rows: LiveTournamentRow[],
  filter: TournamentTeamExposureFilter
): LiveTournamentRow[] {
  const rules = (filter.rules || []).filter((rule) => (
    rule.teamShortName && Number.isInteger(rule.exactCount) && rule.exactCount > 0
  ));
  if (rules.length === 0) {
    return rows;
  }
  return rows.filter((row) => rules.every((rule) => {
    const teamShortName = rule.teamShortName.toLowerCase();
    const count = (row.picks || []).filter((pick) => (
      (pick.teamShortName || "").toLowerCase() === teamShortName
      && pickInScope(pick, filter.scope)
    )).length;
    return count === rule.exactCount;
  }));
}

export function getTournamentTeamOptions(rows: LiveTournamentRow[]): TournamentTeamOption[] {
  const teams = new Map<string, string>();
  rows.forEach((row) => {
    (row.picks || []).forEach((pick) => {
      const shortName = pick.teamShortName;
      if (!shortName) {
        return;
      }
      teams.set(shortName, pick.team || shortName);
    });
  });
  return [...teams.entries()]
    .map(([shortName, name]) => ({ shortName, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
