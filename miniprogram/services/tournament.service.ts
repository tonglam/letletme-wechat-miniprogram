import { graphqlRead, graphqlRequest } from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";
import type { KnockoutOption, TournamentOption, TournamentSelectionStats } from "../models/tournament";
import type { EntryTournamentRow } from "../models/competition";
import type { DomainRead, ServiceReadOptions } from "./service-read";
import { ensureAppContext, getAppContextSnapshot } from "./app-context.service";

const GET_ENTRY_TOURNAMENTS = `
  query EntryTournaments($entryId: Int!) {
    entryTournaments(entryId: $entryId) {
      id
      name
      groupMode
      totalTeamNum
      groupStartedEventId
      groupEndedEventId
      state
      knockoutMode
      knockoutStartedEventId
      knockoutEndedEventId
    }
  }
`;

const GET_TOURNAMENT_SUMMARY = `
  query TournamentSummary($tournamentId: Int!, $eventId: Int!, $entryId: Int!) {
    tournamentEventResults(tournamentId: $tournamentId, eventId: $eventId) {
      entryId
      entryName
      playerName
      groupId
      eventGroupRank
      eventPoints
      eventCost
      eventNetPoints
      eventRank
      overallPoints
      overallRank
      eventChip
      captainPoints
      teamValue
      bank
    }
    tournamentEntryRankingSummary(tournamentId: $tournamentId, eventId: $eventId, entryId: $entryId) {
      entryId
      overallRank
      tournamentOverallRank
      teamValue
      tournamentTeamValueRank
      transfersNum
      tournamentTransfersRank
      totalCosts
      tournamentCostsRank
      totalBenchPoints
      tournamentBenchPointsRank
      autoSubPoints
      tournamentAutoSubRank
      overallPoints
      leaderOverallPoints
      gapToLeader
      pointsBehindNext
      pointsAheadOfPrev
    }
  }
`;

const GET_TOURNAMENT_SEASON_SNAPSHOT = `
  query TournamentSeasonSnapshot($tournamentId: Int!, $eventId: Int!) {
    tournamentSeasonSnapshot(tournamentId: $tournamentId, eventId: $eventId) {
      asOfEventId
      entryCount
      leaderOverallPoints
      secondOverallPoints
      gapFirstSecond
      averageOverallPoints
      metrics {
        key
        leaderValue
        leaderEntryId
        leaderEntryName
        leaderPlayerName
        averageValue
        higherIsBetter
      }
      standings {
        entryId
        rank
        entryName
        playerName
        overallPoints
        overallRank
        teamValue
      }
    }
  }
`;

const GET_TOURNAMENT_SELECTION_STATS = `
  query TournamentSelectionStats($tournamentId: Int!, $eventId: Int!, $limit: Int) {
    tournamentSelectionStats(tournamentId: $tournamentId, eventId: $eventId, limit: $limit) {
      totalEntries
      mostSelectedPlayers {
        id
        webName
        teamShortName
        position
        selectedByPercent
        eoByPercent
      }
      captainSelect {
        id
        webName
        teamShortName
        position
        selectedByPercent
        eoByPercent
      }
      mostTransferIn {
        id
        webName
        teamShortName
        position
        selectedByPercent
        transfersEvent
      }
      mostTransferOut {
        id
        webName
        teamShortName
        position
        selectedByPercent
        transfersEvent
      }
    }
  }
`;

interface EntryTournamentsResponse {
  entryTournaments: {
    id: number;
    name: string;
    groupMode?: string | null;
    totalTeamNum?: number | null;
    groupStartedEventId?: number | null;
    groupEndedEventId?: number | null;
    state?: string | null;
    knockoutMode?: string | null;
    knockoutStartedEventId?: number | null;
    knockoutEndedEventId?: number | null;
  }[];
}

export interface EntryTournament extends Omit<TournamentOption, "id"> {
  id: number;
  groupMode?: string | null;
  totalTeamNum?: number | null;
  groupStartedEventId?: number | null;
  groupEndedEventId?: number | null;
  state?: string | null;
}

export async function readEntryTournamentDirectory(
  entryId: number,
  season: string,
  options: ServiceReadOptions = {}
): Promise<DomainRead<EntryTournamentRow[]>> {
  if (!Number.isSafeInteger(entryId) || entryId <= 0) {
    throw new Error("Entry ID 无效");
  }
  if (!season) {
    throw new Error("赛季信息暂时不可用，请稍后重试");
  }
  const result = await graphqlRead<EntryTournamentsResponse>(
    GET_ENTRY_TOURNAMENTS,
    { entryId },
    {
      cachePolicy: "reporting",
      cacheVariant: `season:${season}`,
      forceRefresh: options.forceRefresh,
      trace: options.trace
    }
  );
  if (result.errors.length > 0) {
    throw new Error(
      result.errors.map((error) => error.message).filter(Boolean).join("; ")
      || "赛事目录暂时不可用，请稍后重试"
    );
  }
  return { data: result.data.entryTournaments || [], meta: result.meta };
}

function currentSeason(): string {
  return getAppContextSnapshot()?.season
    || String(getApp<IAppOption>().globalData.season || "");
}

async function readDirectory(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<EntryTournamentRow[]> {
  const snapshot = getAppContextSnapshot();
  let season = currentSeason();
  const unresolvedEvent = !snapshot?.displayEvent;
  if (forceRefresh || !season || unresolvedEvent) {
    const context = await ensureAppContext({
      reason: forceRefresh ? "pull-refresh" : "page-load",
      // Explicit directory refreshes must also refresh event context. A
      // season-only unresolved snapshot otherwise keeps fallback GW1 reads
      // behind AppContext's retry backoff after the backend has recovered.
      forceRefresh: forceRefresh || !season,
      trace
    });
    season = context.season;
  }
  return (await readEntryTournamentDirectory(entry, season, { forceRefresh, trace })).data;
}

export interface TournamentEventResult {
  entryId: number;
  entryName?: string | null;
  playerName?: string | null;
  groupId: number;
  eventGroupRank?: number | null;
  eventPoints?: number | null;
  eventCost?: number | null;
  eventNetPoints?: number | null;
  eventRank?: number | null;
  overallPoints?: number | null;
  overallRank?: number | null;
  eventChip?: string | null;
  captainPoints?: number | null;
  teamValue?: number | null;
  bank?: number | null;
}

export interface TournamentEntryRankingSummary {
  entryId: number;
  overallRank?: number | null;
  tournamentOverallRank?: number | null;
  teamValue?: number | null;
  tournamentTeamValueRank?: number | null;
  transfersNum?: number | null;
  tournamentTransfersRank?: number | null;
  totalCosts?: number | null;
  tournamentCostsRank?: number | null;
  totalBenchPoints?: number | null;
  tournamentBenchPointsRank?: number | null;
  autoSubPoints?: number | null;
  tournamentAutoSubRank?: number | null;
  overallPoints?: number | null;
  leaderOverallPoints?: number | null;
  gapToLeader?: number | null;
  pointsBehindNext?: number | null;
  pointsAheadOfPrev?: number | null;
}

export type TournamentSeasonMetricKey =
  | "OVERALL_POINTS"
  | "TEAM_VALUE"
  | "TRANSFERS"
  | "TOTAL_COSTS"
  | "BENCH_POINTS"
  | "AUTO_SUB_POINTS";

export interface TournamentSeasonMetric {
  key: TournamentSeasonMetricKey;
  leaderValue?: number | null;
  leaderEntryId?: number | null;
  leaderEntryName?: string | null;
  leaderPlayerName?: string | null;
  averageValue?: number | null;
  higherIsBetter: boolean;
}

export interface TournamentSeasonStanding {
  entryId: number;
  rank?: number | null;
  entryName?: string | null;
  playerName?: string | null;
  overallPoints?: number | null;
  overallRank?: number | null;
  teamValue?: number | null;
}

export interface TournamentSeasonSnapshot {
  asOfEventId: number;
  entryCount: number;
  leaderOverallPoints?: number | null;
  secondOverallPoints?: number | null;
  gapFirstSecond?: number | null;
  averageOverallPoints?: number | null;
  metrics: TournamentSeasonMetric[];
  standings: TournamentSeasonStanding[];
}

export interface TournamentSummaryPayload {
  tournamentEventResults: TournamentEventResult[];
  tournamentEntryRankingSummary: TournamentEntryRankingSummary;
}

type TournamentSummaryResponse = TournamentSummaryPayload;

interface TournamentSelectionStatsResponse {
  tournamentSelectionStats: TournamentSelectionStats | null;
}

export async function getEntryPointsRaceTournament(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<TournamentOption[]> {
  const rows = await readDirectory(entry, forceRefresh, trace);
  return rows
    .filter((t) => !t.groupMode || t.groupMode === "POINTS_RACES")
    .map((t) => ({
      id: Number(t.id),
      name: t.name,
      participantCount: t.totalTeamNum ?? undefined
    }));
}

/**
 * Unfiltered compatibility read for the Competitions section (plan §5.1):
 * every object the entry participates in, legacy fields intact for the
 * adapter. Filtering for a specific surface stays with that surface.
 */
export async function getEntryAllTournaments(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<EntryTournamentRow[]> {
  return readDirectory(entry, forceRefresh, trace ?? undefined);
}

export async function getEntrySummaryTournaments(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<EntryTournament[]> {
  const rows = await readDirectory(entry, forceRefresh, trace);
  return rows
    .filter((t) => !t.groupMode || t.groupMode === "POINTS_RACES")
    .map((t) => ({
      id: Number(t.id),
      name: t.name,
      groupMode: t.groupMode,
      totalTeamNum: t.totalTeamNum,
      groupStartedEventId: t.groupStartedEventId,
      groupEndedEventId: t.groupEndedEventId,
      state: t.state,
      participantCount: t.totalTeamNum ?? undefined
    }));
}

export async function getEntryKnockoutTournament(entry: number): Promise<KnockoutOption[]> {
  const rows = await readDirectory(entry);
  return rows
    .filter((t) => t.knockoutMode && t.knockoutMode !== "NO_KNOCKOUT")
    .map((t) => ({
      id: t.id,
      name: t.name,
      startGw: t.knockoutStartedEventId ?? undefined,
      endGw: t.knockoutEndedEventId ?? undefined
    }));
}

export async function loadTournamentSeasonPath(
  tournamentId: number,
  entryId: number,
  fromGw: number,
  toGw: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
  onBatch?: (pages: Array<{ gameweek: number; rows: TournamentEventResult[] }>) => boolean | void
): Promise<Array<{
  gameweek: number;
  rows: TournamentEventResult[];
}>> {
  const start = Math.max(1, Math.min(fromGw, toGw));
  const end = Math.max(start, toGw);
  const events: number[] = [];
  for (let event = start; event <= end; event += 1) events.push(event);
  const out: Array<{ gameweek: number; rows: TournamentEventResult[] }> = [];
  const concurrency = 4;
  for (let offset = 0; offset < events.length; offset += concurrency) {
    const batch = events.slice(offset, offset + concurrency);
    const pages = await Promise.all(batch.map(async (eventId) => {
      const payload = await getTournamentSummary(tournamentId, eventId, entryId, forceRefresh, trace);
      return { gameweek: eventId, rows: payload.tournamentEventResults || [] };
    }));
    out.push(...pages);
    if (onBatch && onBatch(out) === false) return out;
  }
  return out;
}

export async function getTournamentSummary(
  tournamentId: number,
  eventId: number,
  entryId: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<TournamentSummaryPayload> {
  return graphqlRequest<TournamentSummaryResponse>(GET_TOURNAMENT_SUMMARY, { tournamentId, eventId, entryId }, {
    cachePolicy: "reporting",
    forceRefresh,
    trace
  });
}

export async function getTournamentSeasonSnapshot(
  tournamentId: number,
  eventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<TournamentSeasonSnapshot | null> {
  const data = await graphqlRequest<{ tournamentSeasonSnapshot: TournamentSeasonSnapshot | null }>(
    GET_TOURNAMENT_SEASON_SNAPSHOT,
    { tournamentId, eventId },
    { cachePolicy: "reporting", forceRefresh, trace }
  );
  return data.tournamentSeasonSnapshot;
}

export async function getTournamentSelectionStats(
  tournamentId: number,
  eventId: number,
  limit = 10,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<TournamentSelectionStats | null> {
  const data = await graphqlRequest<TournamentSelectionStatsResponse>(GET_TOURNAMENT_SELECTION_STATS, {
    tournamentId,
    eventId,
    limit
  }, { cachePolicy: "reporting", forceRefresh, trace });
  return data.tournamentSelectionStats;
}
