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
