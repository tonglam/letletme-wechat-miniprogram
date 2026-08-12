import { getServedCacheStoredAt, graphqlRequest } from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";
import type {
  LiveEntryResult,
  LiveMatch,
  LivePlayerRow,
  LiveSnapshotResult,
  LiveSnapshotStatus,
  LiveTournamentRow,
  LiveTournamentRowsResult
} from "../models/live";
import { filterTournamentLiveRows, mapTournamentLiveRows, type TournamentLiveGraphQLRow } from "./live-tournament";

// Live payloads are expensive enough to deduplicate rapid page revisits, but
// short-lived enough to stay process-local (graphql.service does not persist
// sub-minute entries). Snapshot polling bypasses this cache when a new backend
// revision is observed.

export const LIVE_SNAPSHOT_QUERY = `
  query GetLiveSnapshot($eventId: Int!) {
    liveSnapshot(eventId: $eventId) {
      eventId
      revision
      state
      publishedAt
      checkedAt
    }
  }
`;

interface LiveSnapshotResponse {
  liveSnapshot: LiveSnapshotStatus | null;
}

export async function getLiveSnapshot(eventId: number): Promise<LiveSnapshotStatus | null> {
  const data = await graphqlRequest<LiveSnapshotResponse>(LIVE_SNAPSHOT_QUERY, { eventId });
  return data.liveSnapshot;
}

const CALC_LIVE_POINTS_BY_ENTRY = `
  query CalcLivePointsByEntry($eventId: Int!, $entryId: Int!) {
    calcLivePointsByEntry(eventId: $eventId, entryId: $entryId) {
      availability
      snapshot {
        eventId
        revision
        state
        publishedAt
        checkedAt
      }
      entry
      event
      livePoints
      liveNetPoints
      liveTotalPoints
      transferCost
      captainName
      chip
      played
      toPlay
      pickList {
        element
        webName
        teamShortName
        elementType
        elementTypeName
        totalPoints
        minutes
        goalsScored
        assists
        bonus
        bps
        playStatus
        pickActive
        isCaptain
        isViceCaptain
        multiplier
        cleanSheets
        saves
        yellowCards
        redCards
        ownGoals
        penaltiesSaved
        penaltiesMissed
      }
    }
  }
`;

interface GraphQLPickListItem {
  element: number;
  webName: string;
  teamShortName: string;
  elementType: number;
  elementTypeName: string;
  totalPoints: number;
  minutes: number;
  goalsScored: number;
  assists: number;
  bonus: number;
  bps: number;
  playStatus: number;
  pickActive: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  cleanSheets: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
}

interface CalcLivePointsByEntryResponse {
  calcLivePointsByEntry: {
    availability: "READY" | "NO_PICKS";
    snapshot: LiveSnapshotStatus | null;
    entry: number;
    event: number;
    livePoints: number;
    liveNetPoints: number;
    liveTotalPoints: number;
    transferCost: number;
    captainName: string;
    chip: string;
    played: number;
    toPlay: number;
    pickList: GraphQLPickListItem[];
  };
}

function mapGraphQLPickList(pickList: GraphQLPickListItem[]): LivePlayerRow[] {
  return pickList.map((item) => ({
    element: item.element,
    webName: item.webName,
    teamShortName: item.teamShortName,
    elementType: item.elementType,
    elementTypeName: item.elementTypeName,
    points: item.totalPoints,
    totalPoints: item.totalPoints,
    minutes: item.minutes,
    goalsScored: item.goalsScored,
    assists: item.assists,
    bonus: item.bonus,
    bps: item.bps,
    playStatus: item.playStatus,
    pickActive: item.pickActive,
    captain: item.isCaptain,
    viceCaptain: item.isViceCaptain,
    multiplier: item.multiplier,
    cleanSheets: item.cleanSheets,
    saves: item.saves,
    yellowCards: item.yellowCards,
    redCards: item.redCards,
    ownGoals: item.ownGoals,
    penaltiesSaved: item.penaltiesSaved,
    penaltiesMissed: item.penaltiesMissed
  }));
}

export async function getLivePointsByEntrySnapshot(
  entry: number,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<LiveSnapshotResult<LiveEntryResult>> {
  const variables = { eventId: event, entryId: entry };
  const data = await graphqlRequest<CalcLivePointsByEntryResponse>(CALC_LIVE_POINTS_BY_ENTRY, variables, {
    cachePolicy: "live",
    forceRefresh,
    trace
  });
  const result = data.calcLivePointsByEntry;
  if (!result) {
    throw new Error("实时分数暂时不可用，请稍后重试");
  }
  const servedStoredAt = getServedCacheStoredAt(CALC_LIVE_POINTS_BY_ENTRY, variables);
  return {
    data: {
      availability: result.availability,
      entry: result.entry,
      event: result.event,
      livePoints: result.livePoints,
      liveNetPoints: result.liveNetPoints,
      liveTotalPoints: result.liveTotalPoints,
      transferCost: result.transferCost,
      captainName: result.captainName,
      chip: result.chip,
      played: result.played,
      toPlay: result.toPlay,
      pickList: mapGraphQLPickList(result.pickList),
      servedStoredAt
    },
    snapshot: result.snapshot,
    servedStoredAt
  };
}

export async function getLivePointsByEntry(entry: number, event: number, forceRefresh = false): Promise<LiveEntryResult> {
  return (await getLivePointsByEntrySnapshot(entry, event, forceRefresh)).data;
}

export const LIVE_MATCHES_QUERY = `
  query LiveMatches {
    liveSnapshot {
      eventId
      revision
      state
      publishedAt
      checkedAt
    }
    liveMatches {
      notStarted {
        ...LiveMatchFields
      }
      playing {
        ...LiveMatchFields
        homeTeamDataList {
          ...LiveMatchPlayerFields
        }
        awayTeamDataList {
          ...LiveMatchPlayerFields
        }
      }
      finished {
        ...LiveMatchFields
        homeTeamDataList {
          ...LiveMatchPlayerFields
        }
        awayTeamDataList {
          ...LiveMatchPlayerFields
        }
      }
    }
  }

  fragment LiveMatchFields on LiveMatchData {
    matchId
    minutes
    homeTeamName
    homeTeamShortName
    homeScore
    awayTeamName
    awayTeamShortName
    awayScore
    kickoffTime
    playStatus
  }

  fragment LiveMatchPlayerFields on ElementEventResultData {
    webName
    teamShortName
    goalsScored
    assists
    redCards
    yellowCards
    penaltiesSaved
    penaltiesMissed
    saves
    bonus
  }
`;

interface GraphQLMatchPlayer {
  webName: string;
  teamShortName: string;
  goalsScored: number;
  assists: number;
  redCards: number;
  yellowCards: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  saves: number;
  bonus: number;
}

interface GraphQLMatchData {
  matchId: number;
  minutes: number;
  homeTeamName: string;
  homeTeamShortName: string;
  homeScore: number;
  awayTeamName: string;
  awayTeamShortName: string;
  awayScore: number;
  kickoffTime: string;
  playStatus: string;
  homeTeamDataList: GraphQLMatchPlayer[];
  awayTeamDataList: GraphQLMatchPlayer[];
}

interface LiveMatchesResponse {
  liveSnapshot: LiveSnapshotStatus | null;
  liveMatches: {
    notStarted: GraphQLMatchData[];
    playing: GraphQLMatchData[];
    finished: GraphQLMatchData[];
  };
}

function mapGraphQLMatch(match: GraphQLMatchData): LiveMatch {
  return {
    matchId: match.matchId,
    minutes: match.minutes,
    homeTeamName: match.homeTeamName,
    homeTeamShortName: match.homeTeamShortName,
    homeScore: match.homeScore,
    awayTeamName: match.awayTeamName,
    awayTeamShortName: match.awayTeamShortName,
    awayScore: match.awayScore,
    kickoffTime: match.kickoffTime,
    playStatus: match.playStatus.toLowerCase(),
    homeTeamDataList: match.homeTeamDataList || [],
    awayTeamDataList: match.awayTeamDataList || []
  };
}

export async function getLiveMatchByStatusSnapshot(
  status: string,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<LiveSnapshotResult<LiveMatch[]>> {
  const variables = {};
  const data = await graphqlRequest<LiveMatchesResponse>(LIVE_MATCHES_QUERY, variables, {
    cachePolicy: "live",
    forceRefresh,
    trace
  });
  const result = data.liveMatches;
  let matches: LiveMatch[];
  switch (status) {
    case "playing":
      matches = result.playing.map(mapGraphQLMatch);
      break;
    case "finished":
      matches = result.finished.map(mapGraphQLMatch);
      break;
    case "not_start":
      matches = result.notStarted.map(mapGraphQLMatch);
      break;
    case "all":
    default:
      matches = [
        ...result.notStarted.map(mapGraphQLMatch),
        ...result.playing.map(mapGraphQLMatch),
        ...result.finished.map(mapGraphQLMatch)
      ];
      break;
  }
  return {
    data: matches,
    snapshot: data.liveSnapshot,
    servedStoredAt: getServedCacheStoredAt(LIVE_MATCHES_QUERY, variables)
  };
}

export async function getLiveMatchByStatus(status: string, forceRefresh = false): Promise<LiveMatch[]> {
  return (await getLiveMatchByStatusSnapshot(status, forceRefresh)).data;
}

const TOURNAMENT_LIVE_POINTS = `
  query GetTournamentLivePoints($eventId: Int!, $tournamentId: Int!) {
    liveSnapshot(eventId: $eventId) {
      eventId
      revision
      state
      publishedAt
      checkedAt
    }
    calcLivePointsForTournament(eventId: $eventId, tournamentId: $tournamentId) {
      results {
        entry
        entryName
        playerName
        rank
        overallRank
        chip
        livePoints
        transferCost
        liveNetPoints
        liveTotalPoints
        played
        toPlay
        captainName
        pickList {
          element
          webName
          teamShortName
          teamName
          elementTypeName
          position
          isCaptain
          isViceCaptain
        }
      }
      errors {
        entryId
      }
      meta {
        failedCount
        totalEntries
      }
    }
  }
`;

interface TournamentLivePointsResponse {
  liveSnapshot: LiveSnapshotStatus | null;
  calcLivePointsForTournament: {
    results: TournamentLiveGraphQLRow[];
    errors: Array<{ entryId: number }>;
    meta: { failedCount: number; totalEntries: number };
  };
}

function numericId(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("页面参数无效，请返回后重试");
  }
  return parsed;
}

export async function getLivePointsByTournamentSnapshot(
  tournamentId: number | string,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<LiveSnapshotResult<LiveTournamentRow[]>> {
  const variables = {
    tournamentId: numericId(tournamentId),
    eventId: numericId(event)
  };
  const data = await graphqlRequest<TournamentLivePointsResponse>(TOURNAMENT_LIVE_POINTS, variables, {
    cachePolicy: "live",
    forceRefresh,
    trace
  });
  const servedStoredAt = getServedCacheStoredAt(TOURNAMENT_LIVE_POINTS, variables);
  return {
    data: mapTournamentLiveRows(data.calcLivePointsForTournament.results),
    snapshot: data.liveSnapshot,
    servedStoredAt,
    failedEntryIds: data.calcLivePointsForTournament.errors.map((error) => error.entryId),
    partialError: data.calcLivePointsForTournament.meta.failedCount > 0
      ? `部分结果不可用：${data.calcLivePointsForTournament.meta.failedCount}/${data.calcLivePointsForTournament.meta.totalEntries} 支参赛球队计算失败`
      : undefined
  };
}

export async function getLivePointsByTournament(
  tournamentId: number | string,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<LiveTournamentRowsResult> {
  const result = await getLivePointsByTournamentSnapshot(tournamentId, event, forceRefresh, trace);
  return { rows: result.data, servedStoredAt: result.servedStoredAt };
}

export async function searchLivePointsByTournament(
  tournamentId: number | string,
  event: number,
  keyword: string,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<LiveTournamentRowsResult> {
  const { rows, servedStoredAt } = await getLivePointsByTournament(tournamentId, event, forceRefresh, trace);
  return { rows: filterTournamentLiveRows(rows, keyword), servedStoredAt };
}

export async function searchLivePointsByTournamentSnapshot(
  tournamentId: number | string,
  event: number,
  keyword: string,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<LiveSnapshotResult<LiveTournamentRow[]>> {
  const result = await getLivePointsByTournamentSnapshot(tournamentId, event, forceRefresh, trace);
  return {
    data: filterTournamentLiveRows(result.data, keyword),
    snapshot: result.snapshot,
    servedStoredAt: result.servedStoredAt,
    failedEntryIds: result.failedEntryIds,
    partialError: result.partialError
  };
}
