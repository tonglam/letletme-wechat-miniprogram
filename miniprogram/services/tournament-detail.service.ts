import { graphqlRequest } from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";
import type {
  H2HBoard,
  TournamentDetailKind,
  TournamentParticipantRow,
  TournamentSetupProgress,
} from "../utils/official-h2h";

/**
 * Metadata-only tournament detail. Live scores are deliberately absent: the
 * league publication reader owns the live board and official H2H publication.
 */
export const GET_TOURNAMENT_DETAIL_DESK = `
  query TournamentDetailDesk($tournamentId: Int!, $entryId: Int!, $eventId: Int) {
    tournamentDetailDesk(tournamentId: $tournamentId, entryId: $entryId, eventId: $eventId) {
      revision
      kind
      context { season coreRevision activeEventId requestedEventId }
      viewerEntryId
      canManage
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
      setup {
        status phase completedUnits totalUnits hasWarnings progressMode
        attempt maxAttempts nextRetryAt
        warningSummaries { category affectedCount repairExhausted }
      }
    }
  }
`;

export const GET_TOURNAMENT_OFFICIAL_H2H = `
  query TournamentOfficialH2H($tournamentId: Int!, $eventId: Int!) {
    tournamentOfficialH2H(tournamentId: $tournamentId, eventId: $eventId) {
      eventId
      availability
      delivery { state servedFrom reasonCodes }
      revisions {
        publicationId generation roster scoreCore fixtureIdentity entryInputSet
        identity officialRank rules algorithm content
      }
      times {
        sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt
        servedAt staleAt nextRefreshAt
      }
      standings {
        throughEventId
        state
        sourceCheckedAt
        rows { entryId entryName playerName rank matchPoints played won drawn lost pointsFor }
      }
      matches {
        officialMatchId eventId groupId sourceOrder phase knockoutName tiebreak isBye
        availability
        delivery { state servedFrom reasonCodes }
        revisions {
          publicationId generation roster scoreCore fixtureIdentity entryInputSet
          identity officialRank rules algorithm content
        }
        times {
          sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt
          servedAt staleAt nextRefreshAt
        }
        home {
          availability entryId entryName playerName isAverage points netPoints
        }
        away {
          availability entryId entryName playerName isAverage points netPoints
        }
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

export type TournamentDetailSetup = TournamentSetupProgress & {
  hasWarnings?: boolean;
  attempt?: number | null;
  maxAttempts?: number | null;
  nextRetryAt?: string | null;
  warningSummaries?: Array<{
    category?: string | null;
    affectedCount?: number | null;
    repairExhausted?: boolean | null;
  }>;
};

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
  canManage: boolean;
  unavailableSections?: string[] | null;
  tournament: TournamentDetailInfo;
  participants?: TournamentParticipantRow[] | null;
  setup?: TournamentDetailSetup | null;
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
): Promise<H2HBoard> {
  const data = await graphqlRequest<{
    tournamentOfficialH2H: H2HBoard;
  }>(
    GET_TOURNAMENT_OFFICIAL_H2H,
    { tournamentId, eventId },
    { cachePolicy: "reporting", forceRefresh, trace },
  );
  return data.tournamentOfficialH2H;
}
