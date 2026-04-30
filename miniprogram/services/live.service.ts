import { graphqlRequest } from "./graphql.service";
import type { LiveEntryResult, LiveMatch, LivePlayerRow, LiveTournamentRow } from "../models/live";
import { filterTournamentLiveRows, mapTournamentLiveRows, type TournamentLiveGraphQLRow } from "./live-tournament";

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

export async function getLivePointsByEntry(entry: number, event: number): Promise<LiveEntryResult> {
  const data = await graphqlRequest<CalcLivePointsByEntryResponse>(CALC_LIVE_POINTS_BY_ENTRY, { eventId: event, entryId: entry });
  const result = data.calcLivePointsByEntry;
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

const LIVE_MATCHES = `
  query LiveMatches {
    liveMatches {
      nextEvent {
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
        homeTeamDataList {
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
        awayTeamDataList {
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
      }
      notStarted {
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
        homeTeamDataList {
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
        awayTeamDataList {
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
      }
      playing {
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
        homeTeamDataList {
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
        awayTeamDataList {
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
      }
      finished {
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
        homeTeamDataList {
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
        awayTeamDataList {
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
      }
    }
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
    homeTeamDataList: match.homeTeamDataList,
    awayTeamDataList: match.awayTeamDataList
  };
}

export async function getLiveMatchByStatus(status: string): Promise<LiveMatch[]> {
  const data = await graphqlRequest<LiveMatchesResponse>(LIVE_MATCHES);
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

function numericId(value: number | string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

export async function getLivePointsByTournament(tournamentId: number | string, event: number): Promise<LiveTournamentRow[]> {
  const data = await graphqlRequest<TournamentLivePointsResponse>(TOURNAMENT_LIVE_POINTS, {
    tournamentId: numericId(tournamentId, "tournamentId"),
    eventId: numericId(event, "eventId")
  });
  return mapTournamentLiveRows(data.calcLivePointsForTournament.results);
}

export async function searchLivePointsByTournament(
  tournamentId: number | string,
  event: number,
  keyword: string
): Promise<LiveTournamentRow[]> {
  const rows = await getLivePointsByTournament(tournamentId, event);
  return filterTournamentLiveRows(rows, keyword);
}
