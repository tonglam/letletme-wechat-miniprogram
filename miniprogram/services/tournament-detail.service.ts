import { graphqlRequest } from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";
import type {
  OfficialH2HBoard,
  TournamentDetailKind,
  TournamentParticipantRow,
  TournamentSetupProgress,
} from "../utils/official-h2h";

/**
 * Tournament detail desk — the web /live/competitions/[id] contract
 * (GET_TOURNAMENT_DETAIL_DESK, lib/graphql/operations/tournaments.ts). The
 * Mini selects the same fields except the `live` block: the live-board
 * pipeline (live-board.service) owns points rows, and H2H pages never render
 * them. `kind` is the authoritative surface switch — SETUP shows progress,
 * OFFICIAL_H2H the standings/fixtures projection, LIVE_POINTS the board.
 * Selection stays slim on purpose: scripts/validate-live-queries-vs-schema
 * enforces the 200-AST-node production limit.
 */
export const GET_TOURNAMENT_DETAIL_DESK = `
  query TournamentDetailDesk($tournamentId: Int!, $entryId: Int!, $eventId: Int) {
    tournamentDetailDesk(tournamentId: $tournamentId, entryId: $entryId, eventId: $eventId) {
      revision
      kind
      context { season coreRevision activeEventId requestedEventId }
      viewerEntryId
      unavailableSections
      tournament {
        id
        name
        creator
        leagueType
        totalTeamNum
        groupMode
        groupTeamNum
        groupNum
        groupStartedEventId
        groupEndedEventId
        knockoutMode
        knockoutTeamNum
        knockoutRounds
        knockoutStartedEventId
        knockoutEndedEventId
      }
      participants { entryId entryName playerName }
      setup { status phase completedUnits totalUnits progressMode }
      officialH2H {
        eventId
        awaitingSchedule
        scoreSource
        scoreRevision
        scoreCheckedAt
        standings { entryId entryName playerName rank matchPoints played won drawn lost pointsFor }
        matches {
          officialMatchId
          eventId
          sourceOrder
          phase
          knockoutName
          isBye
          winnerEntryId
          tiebreak
          sourceCheckedAt
          home { entryId entryName playerName isAverage points matchPoints }
          away { entryId entryName playerName isAverage points matchPoints }
        }
      }
    }
  }
`;

/** GW navigation on an H2H page skips the desk and refetches the board only. */
export const GET_TOURNAMENT_OFFICIAL_H2H = `
  query TournamentOfficialH2H($tournamentId: Int!, $eventId: Int!) {
    tournamentOfficialH2H(tournamentId: $tournamentId, eventId: $eventId) {
      eventId
      awaitingSchedule
      scoreSource
      scoreRevision
      scoreCheckedAt
      standings { entryId entryName playerName rank matchPoints played won drawn lost pointsFor }
      matches {
        officialMatchId
        eventId
        sourceOrder
        phase
        knockoutName
        isBye
        winnerEntryId
        tiebreak
        sourceCheckedAt
        home { entryId entryName playerName isAverage points matchPoints }
        away { entryId entryName playerName isAverage points matchPoints }
      }
    }
  }
`;

export interface TournamentDetailInfo {
  id: number;
  name: string;
  creator?: string | null;
  leagueType?: string | null;
  totalTeamNum?: number | null;
  groupMode?: string | null;
  groupTeamNum?: number | null;
  groupNum?: number | null;
  groupStartedEventId?: number | null;
  groupEndedEventId?: number | null;
  knockoutMode?: string | null;
  knockoutTeamNum?: number | null;
  knockoutRounds?: number | null;
  knockoutStartedEventId?: number | null;
  knockoutEndedEventId?: number | null;
}

export type TournamentDetailSetup = TournamentSetupProgress;

export interface TournamentDetailDesk {
  revision: string;
  kind: TournamentDetailKind;
  context: {
    season: string;
    coreRevision: string;
    activeEventId?: number | null;
    requestedEventId: number;
  };
  viewerEntryId: number;
  unavailableSections?: string[] | null;
  tournament: TournamentDetailInfo;
  participants?: TournamentParticipantRow[] | null;
  setup?: TournamentDetailSetup | null;
  officialH2H?: OfficialH2HBoard | null;
}

export async function getTournamentDetailDesk(
  tournamentId: number,
  entryId: number,
  eventId: number | null = null,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<TournamentDetailDesk | null> {
  const data = await graphqlRequest<{
    tournamentDetailDesk: TournamentDetailDesk | null;
  }>(
    GET_TOURNAMENT_DETAIL_DESK,
    { tournamentId, entryId, eventId },
    { cachePolicy: "reporting", forceRefresh, trace },
  );
  return data.tournamentDetailDesk;
}

export async function getTournamentOfficialH2H(
  tournamentId: number,
  eventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<OfficialH2HBoard> {
  const data = await graphqlRequest<{
    tournamentOfficialH2H: OfficialH2HBoard;
  }>(
    GET_TOURNAMENT_OFFICIAL_H2H,
    { tournamentId, eventId },
    { cachePolicy: "reporting", forceRefresh, trace },
  );
  return data.tournamentOfficialH2H;
}
