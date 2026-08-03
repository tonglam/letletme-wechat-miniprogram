import { graphqlRequest } from "./graphql.service";
import type { LiveEntryResult, LiveMatch, LivePlayerRow, LiveTournamentRow } from "../models/live";
import { filterTournamentLiveRows, mapTournamentLiveRows, type TournamentLiveGraphQLRow } from "./live-tournament";

// Live data moves during matches but the upstream only updates periodically;
// 30s keeps rapid tab/page revisits instant without masking real changes.
const LIVE_CACHE_TTL_MS = 30 * 1000;

const CALC_LIVE_POINTS_BY_ENTRY = `
  query CalcLivePointsByEntry($eventId: Int!, $entryId: Int!) {
    calcLivePointsByEntry(eventId: $eventId, entryId: $entryId) {
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

export async function getLivePointsByEntry(entry: number, event: number, forceRefresh = false): Promise<LiveEntryResult> {
  const data = await graphqlRequest<CalcLivePointsByEntryResponse>(CALC_LIVE_POINTS_BY_ENTRY, { eventId: event, entryId: entry }, {
    cacheTtl: LIVE_CACHE_TTL_MS,
    forceRefresh
  });
  const result = data.calcLivePointsByEntry;
  if (!result) {
    throw new Error("实时分数暂时不可用，请稍后重试");
  }
  return {
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
    pickList: mapGraphQLPickList(result.pickList)
  };
}

export const LIVE_MATCHES_QUERY = `
  query LiveMatches {
    liveMatches {
      nextEvent {
        ...LiveMatchFields
      }
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
  liveMatches: {
    nextEvent: GraphQLMatchData[];
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

export async function getLiveMatchByStatus(status: string, forceRefresh = false): Promise<LiveMatch[]> {
  const data = await graphqlRequest<LiveMatchesResponse>(LIVE_MATCHES_QUERY, {}, {
    cacheTtl: LIVE_CACHE_TTL_MS,
    forceRefresh
  });
  const result = data.liveMatches;
  switch (status) {
    case "playing":
      return result.playing.map(mapGraphQLMatch);
    case "finished":
      return result.finished.map(mapGraphQLMatch);
    case "not_start":
      return result.notStarted.map(mapGraphQLMatch);
    case "next_event":
      return result.nextEvent.map(mapGraphQLMatch);
    case "all":
    default:
      return [
        ...result.nextEvent.map(mapGraphQLMatch),
        ...result.notStarted.map(mapGraphQLMatch),
        ...result.playing.map(mapGraphQLMatch),
        ...result.finished.map(mapGraphQLMatch)
      ];
  }
}

const TOURNAMENT_LIVE_POINTS = `
  query GetTournamentLivePoints($eventId: Int!, $tournamentId: Int!) {
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
    }
  }
`;

interface TournamentLivePointsResponse {
  calcLivePointsForTournament: {
    results: TournamentLiveGraphQLRow[];
  };
}

function numericId(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("页面参数无效，请返回后重试");
  }
  return parsed;
}

export async function getLivePointsByTournament(tournamentId: number | string, event: number, forceRefresh = false): Promise<LiveTournamentRow[]> {
  const data = await graphqlRequest<TournamentLivePointsResponse>(TOURNAMENT_LIVE_POINTS, {
    tournamentId: numericId(tournamentId),
    eventId: numericId(event)
  }, {
    cacheTtl: LIVE_CACHE_TTL_MS,
    forceRefresh
  });
  return mapTournamentLiveRows(data.calcLivePointsForTournament.results);
}

export async function searchLivePointsByTournament(
  tournamentId: number | string,
  event: number,
  keyword: string,
  forceRefresh = false
): Promise<LiveTournamentRow[]> {
  const rows = await getLivePointsByTournament(tournamentId, event, forceRefresh);
  return filterTournamentLiveRows(rows, keyword);
}
