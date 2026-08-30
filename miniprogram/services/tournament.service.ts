import { graphqlRead, graphqlRequest } from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";
import type {
  KnockoutOption,
  TournamentOption,
  TournamentSelectionStats,
} from "../models/tournament";
import type { EntryTournamentRow } from "../models/competition";
import type { DomainRead, ServiceReadOptions } from "./service-read";
import { ensureAppContext, getAppContextSnapshot } from "./app-context.service";
import { isOfficialH2HTournamentRow } from "../utils/official-h2h";

export const GET_ENTRY_TOURNAMENTS = `
  query EntryTournaments($entryId: Int!) {
    entryParticipatingTournaments(entryId: $entryId) {
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
      leagueType
      rosterMode
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

/**
 * My FPL competitions now has a server-owned desk contract. The web surface
 * uses this projection so setup state, finalized-event gating, aggregate
 * statistics, and the viewer binding are decided in one place. Keep this
 * Mini query on the published core fields; snapshot metadata is deliberately
 * omitted until the Mini's local GraphQL baseline has caught up.
 */
export const GET_MY_FPL_COMPETITIONS_DESK = `
  query MyFplCompetitionsDesk($tournamentId: Int, $eventId: Int) {
    myFplCompetitionsDesk(tournamentId: $tournamentId, eventId: $eventId) {
      state
      context {
        season
        coreRevision
        currentEventId
        nextEventId
        latestFinalizedEventId
      }
      tournaments {
        id
        name
        groupMode
        totalTeamNum
        groupStartedEventId
        groupEndedEventId
        knockoutMode
        knockoutStartedEventId
        knockoutEndedEventId
        state
      }
      selectedTournamentId
      selectedTournament {
        id
        name
        groupMode
        totalTeamNum
        groupStartedEventId
        groupEndedEventId
        knockoutMode
        knockoutStartedEventId
        knockoutEndedEventId
        state
      }
      eventId
      aggregate {
        eventId
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
        viewer {
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
    }
  }
`;

export const GET_MY_FPL_COMPETITION_BOARD = `
  query MyFplCompetitionBoard(
    $tournamentId: Int!
    $eventId: Int!
    $page: Int
    $pageSize: Int
    $search: String
  ) {
    myFplCompetitionBoard(
      tournamentId: $tournamentId
      eventId: $eventId
      page: $page
      pageSize: $pageSize
      search: $search
    ) {
      state
      eventId
      page
      pageSize
      totalRows
      totalPages
      fieldSize
      rows {
        eventId
        groupId
        entryId
        entryName
        playerName
        rank
        previousRank
        fieldRank
        eventPoints
        eventCost
        eventNetPoints
        eventRank
        overallPoints
        overallRank
        eventChip
        captainId
        captainWebName
        captainTeamShortName
        captainPoints
        teamValue
        bank
      }
      viewerRow {
        eventId
        groupId
        entryId
        entryName
        playerName
        rank
        previousRank
        fieldRank
        eventPoints
        eventCost
        eventNetPoints
        eventRank
        overallPoints
        overallRank
        eventChip
        captainId
        captainWebName
        captainTeamShortName
        captainPoints
        teamValue
        bank
      }
    }
  }
`;

export const GET_MY_FPL_COMPETITION_SEASON_PATH = `
  query MyFplCompetitionSeasonPath($tournamentId: Int!, $throughEventId: Int!) {
    myFplCompetitionSeasonPath(
      tournamentId: $tournamentId
      throughEventId: $throughEventId
    ) {
      state
      tournamentId
      throughEventId
      points {
        gameweek
        tournamentRank
        gapToLeader
        pointsVsAverage
        fieldSize
        overallPoints
        leaderOverallPoints
        averageOverallPoints
      }
    }
  }
`;

/** V2 finalized-snapshot contract. Live and legacy reporting roots are not
 * used by the My FPL tournament review page. */
export type MyTournamentReviewScope = "ACCESSIBLE" | "MANAGED" | "ALL";
export type MyTournamentReviewFormat = "POINTS" | "H2H" | "KNOCKOUT";
export type MyTournamentReviewState =
  "PENDING" | "WAITING_SOURCE" | "READY" | "DEGRADED" | "UNAVAILABLE";

export interface MyTournamentReviewCatalogItem {
  tournamentId: number;
  name: string;
  creator: string;
  leagueId: number;
  leagueType: string;
  totalTeamNum: number;
  latestFinalizedEventId: number | null;
  latestAvailableEventId: number | null;
  latestRevision: string | null;
  latestFormat: MyTournamentReviewFormat | null;
  state: MyTournamentReviewState;
  publishedAt: string | null;
}

export interface MyTournamentReviewCatalog {
  state: MyTournamentReviewState;
  asOf: string;
  viewerEntryId: number | null;
  adminReadAll: boolean;
  tournaments: MyTournamentReviewCatalogItem[];
}

export interface MyTournamentReviewScopeMeta {
  tournamentId: number;
  eventId: number;
  revision: string;
  format: MyTournamentReviewFormat;
  state: MyTournamentReviewState;
  freshness: {
    eventDataCheckedAt: string;
    sourceMinCheckedAt: string;
    sourceMaxCheckedAt: string;
    publishedAt: string;
    ageSeconds: number;
  } | null;
  rowCount: number;
  expectedSubjectCount: number;
  readySubjectCount: number;
  notApplicableSubjectCount: number;
  contentSha256: string | null;
}

export interface MyTournamentReviewPointsRow {
  entryId: number;
  entryName: string;
  playerName: string;
  applicable: boolean;
  rank: number | null;
  grossPoints: number | null;
  transferCost: number | null;
  netPoints: number | null;
  tournamentScore: number | null;
  seasonGrossPoints: number | null;
  seasonNetPoints: number | null;
}

export interface MyTournamentReviewPoints {
  headlineMetric: string;
  grossPointsTotal: number;
  grossPointsAverage: number;
  netPointsTotal: number;
  seasonGrossPointsTotal: number;
  seasonGrossPointsAverage: number;
  seasonNetPointsTotal: number;
  rows: MyTournamentReviewPointsRow[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface MyTournamentReviewH2H {
  matches: Array<{
    matchId: string;
    groupId: number;
    isBye: boolean;
    home: MyTournamentReviewH2HSide | null;
    away: MyTournamentReviewH2HSide | null;
	}>;
  standings: Array<{
    groupId: number;
    entryId: number;
    entryName: string;
    rank: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    matchPoints: number;
    pointsFor: number;
    pointsAgainst: number;
  }>;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface MyTournamentReviewH2HSide {
  entryId: number | null;
  entryName: string;
  isAverage: boolean;
  grossPoints: number | null;
  transferCost: number | null;
  netPoints: number | null;
  matchPoints: number | null;
}

export interface MyTournamentReviewKnockout {
  matches: Array<{
    round: number | null;
    name: string | null;
    matchId: number;
    playAgainstId: number;
    winnerEntryId: number | null;
    home: MyTournamentReviewKnockoutSide | null;
    away: MyTournamentReviewKnockoutSide | null;
  }>;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface MyTournamentReviewKnockoutSide {
  entryId: number;
  entryName: string;
  grossPoints: number | null;
  transferCost: number | null;
  netPoints: number | null;
  goalsScored: number | null;
  goalsConceded: number | null;
}

export interface MyTournamentGameweekReview {
  state: MyTournamentReviewState;
  scope: MyTournamentReviewScopeMeta | null;
  points: MyTournamentReviewPoints | null;
  h2h: MyTournamentReviewH2H | null;
  knockout: MyTournamentReviewKnockout | null;
}

export interface MyTournamentSeasonReview {
  state: MyTournamentReviewState;
  tournamentId: number;
  throughEventId: number;
  latestEventId: number | null;
  latestRevision: string | null;
  format: MyTournamentReviewFormat | null;
  freshness: {
    eventDataCheckedAt: string;
    sourceMinCheckedAt: string;
    sourceMaxCheckedAt: string;
    publishedAt: string;
    ageSeconds: number;
  } | null;
  finalizedEventIds: number[];
  points: MyTournamentReviewPoints | null;
  h2h: MyTournamentReviewH2H | null;
  knockout: MyTournamentReviewKnockout | null;
}

const MY_TOURNAMENT_REVIEW_CONTRACT = "my-tournament-review-v2" as const;
const MY_TOURNAMENT_REVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const MY_TOURNAMENT_REVIEW_STALE_TTL_MS = 15 * 60 * 1000;

const REVIEW_SCOPE_META_FIELDS = `
  tournamentId eventId revision format state
  freshness { eventDataCheckedAt sourceMinCheckedAt sourceMaxCheckedAt publishedAt ageSeconds }
  rowCount expectedSubjectCount readySubjectCount notApplicableSubjectCount contentSha256
`;
const REVIEW_POINTS_FIELDS = `
  headlineMetric grossPointsTotal grossPointsAverage netPointsTotal
  seasonGrossPointsTotal seasonGrossPointsAverage seasonNetPointsTotal nextCursor hasNextPage
  rows { entryId entryName playerName applicable rank grossPoints transferCost netPoints tournamentScore seasonGrossPoints seasonNetPoints }
`;
const REVIEW_H2H_FIELDS = `
  nextCursor hasNextPage
  matches {
    matchId groupId isBye
    home { entryId entryName isAverage grossPoints transferCost netPoints matchPoints }
    away { entryId entryName isAverage grossPoints transferCost netPoints matchPoints }
  }
  standings { groupId entryId entryName rank played won drawn lost matchPoints pointsFor pointsAgainst }
`;
const REVIEW_KNOCKOUT_FIELDS = `
  nextCursor hasNextPage
  matches {
    round name matchId playAgainstId winnerEntryId
    home { entryId entryName grossPoints transferCost netPoints goalsScored goalsConceded }
    away { entryId entryName grossPoints transferCost netPoints goalsScored goalsConceded }
  }
`;

export const GET_MY_TOURNAMENT_REVIEW_CATALOG = `
  query MyTournamentReviewCatalog($scope: MyTournamentReviewScope = ACCESSIBLE) {
    myTournamentReviewCatalog(scope: $scope) {
      state asOf viewerEntryId adminReadAll
      tournaments {
        tournamentId name creator leagueId leagueType totalTeamNum
        latestFinalizedEventId latestAvailableEventId latestRevision latestFormat state publishedAt
      }
    }
  }
`;

export const GET_MY_TOURNAMENT_GAMEWEEK_REVIEW = `
  query MyTournamentGameweekReview($tournamentId: Int!, $eventId: Int!, $first: Int = 100, $after: String, $revision: String) {
    myTournamentGameweekReview(tournamentId: $tournamentId, eventId: $eventId, first: $first, after: $after, revision: $revision) {
      state
      scope {${REVIEW_SCOPE_META_FIELDS}}
      points {${REVIEW_POINTS_FIELDS}}
      h2h {${REVIEW_H2H_FIELDS}}
      knockout {${REVIEW_KNOCKOUT_FIELDS}}
    }
  }
`;

export const GET_MY_TOURNAMENT_SEASON_REVIEW = `
  query MyTournamentSeasonReview($tournamentId: Int!, $throughEventId: Int!, $first: Int = 100, $after: String) {
    myTournamentSeasonReview(tournamentId: $tournamentId, throughEventId: $throughEventId, first: $first, after: $after) {
      state tournamentId throughEventId latestEventId latestRevision format
      freshness { eventDataCheckedAt sourceMinCheckedAt sourceMaxCheckedAt publishedAt ageSeconds }
      finalizedEventIds
      points {${REVIEW_POINTS_FIELDS}}
      h2h {${REVIEW_H2H_FIELDS}}
      knockout {${REVIEW_KNOCKOUT_FIELDS}}
    }
  }
`;

const myTournamentReviewOptions = (
  forceRefresh: boolean,
  trace?: PageRequestTrace,
) => ({
  cachePolicy: "reporting" as const,
  cacheTtl: MY_TOURNAMENT_REVIEW_CACHE_TTL_MS,
  staleTtl: MY_TOURNAMENT_REVIEW_STALE_TTL_MS,
  forceRefresh,
  trace,
  contract: MY_TOURNAMENT_REVIEW_CONTRACT,
});

export async function getMyTournamentReviewCatalog(
  scope: MyTournamentReviewScope = "ACCESSIBLE",
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<MyTournamentReviewCatalog> {
  const data = await graphqlRequest<{
    myTournamentReviewCatalog: MyTournamentReviewCatalog;
  }>(
    GET_MY_TOURNAMENT_REVIEW_CATALOG,
    { scope },
    myTournamentReviewOptions(forceRefresh, trace),
  );
  return data.myTournamentReviewCatalog;
}

export async function getMyTournamentGameweekReview(
  tournamentId: number,
  eventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
  after: string | null = null,
  revision: string | null = null,
): Promise<MyTournamentGameweekReview> {
  const data = await graphqlRequest<{
    myTournamentGameweekReview: MyTournamentGameweekReview;
  }>(
    GET_MY_TOURNAMENT_GAMEWEEK_REVIEW,
    { tournamentId, eventId, first: 100, after, revision },
    myTournamentReviewOptions(forceRefresh, trace),
  );
  return data.myTournamentGameweekReview;
}

export async function getMyTournamentSeasonReview(
  tournamentId: number,
  throughEventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
  after: string | null = null,
): Promise<MyTournamentSeasonReview> {
  const data = await graphqlRequest<{
    myTournamentSeasonReview: MyTournamentSeasonReview;
  }>(
    GET_MY_TOURNAMENT_SEASON_REVIEW,
    { tournamentId, throughEventId, first: 100, after },
    myTournamentReviewOptions(forceRefresh, trace),
  );
  return data.myTournamentSeasonReview;
}

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
  entryParticipatingTournaments: {
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
    leagueType?: string | null;
    rosterMode?: string | null;
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
  options: ServiceReadOptions = {},
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
      trace: options.trace,
    },
  );
  if (result.errors.length > 0) {
    throw new Error(
      result.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join("; ") || "赛事目录暂时不可用，请稍后重试",
    );
  }
  return {
    data: result.data.entryParticipatingTournaments || [],
    meta: result.meta,
  };
}

function currentSeason(): string {
  return (
    getAppContextSnapshot()?.season ||
    String(getApp<IAppOption>().globalData.season || "")
  );
}

async function readDirectory(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
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
      trace,
    });
    season = context.season;
  }
  return (
    await readEntryTournamentDirectory(entry, season, { forceRefresh, trace })
  ).data;
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

export type MyFplReviewState =
  "PRESEASON" | "PENDING" | "READY" | "EMPTY" | "UNAVAILABLE";

export interface MyFplReviewContext {
  season: string;
  coreRevision: string;
  currentEventId?: number | null;
  nextEventId?: number | null;
  latestFinalizedEventId?: number | null;
  latestPublishedEventId?: number | null;
}

export interface MyFplCompetitionViewer {
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

export interface MyFplCompetitionAggregate {
  eventId: number;
  entryCount: number;
  leaderOverallPoints?: number | null;
  secondOverallPoints?: number | null;
  gapFirstSecond?: number | null;
  averageOverallPoints?: number | null;
  metrics: TournamentSeasonMetric[];
  viewer?: MyFplCompetitionViewer | null;
}

export interface MyFplCompetitionsDesk {
  state: MyFplReviewState;
  context: MyFplReviewContext;
  tournaments: EntryTournamentRow[];
  selectedTournamentId?: number | null;
  selectedTournament?: EntryTournamentRow | null;
  eventId?: number | null;
  aggregate?: MyFplCompetitionAggregate | null;
}

export interface MyFplCompetitionBoardRow {
  eventId: number;
  groupId?: number | null;
  entryId: number;
  entryName?: string | null;
  playerName?: string | null;
  rank?: number | null;
  previousRank?: number | null;
  fieldRank?: number | null;
  eventPoints?: number | null;
  eventCost?: number | null;
  eventNetPoints?: number | null;
  eventRank?: number | null;
  overallPoints?: number | null;
  overallRank?: number | null;
  eventChip?: string | null;
  captainId?: number | null;
  captainWebName?: string | null;
  captainTeamShortName?: string | null;
  captainPoints?: number | null;
  teamValue?: number | null;
  bank?: number | null;
}

export interface MyFplCompetitionBoard {
  state: MyFplReviewState;
  eventId: number;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  fieldSize: number;
  rows: MyFplCompetitionBoardRow[];
  viewerRow?: MyFplCompetitionBoardRow | null;
}

export interface MyFplCompetitionSeasonPathPoint {
  gameweek: number;
  tournamentRank?: number | null;
  gapToLeader?: number | null;
  pointsVsAverage?: number | null;
  fieldSize: number;
  overallPoints?: number | null;
  leaderOverallPoints?: number | null;
  averageOverallPoints?: number | null;
}

export interface MyFplCompetitionSeasonPath {
  state: MyFplReviewState;
  tournamentId: number;
  throughEventId: number;
  points: MyFplCompetitionSeasonPathPoint[];
}

export async function getMyFplCompetitionsDesk(
  tournamentId: number | null = null,
  eventId: number | null = null,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<MyFplCompetitionsDesk> {
  return graphqlRequest<{ myFplCompetitionsDesk: MyFplCompetitionsDesk }>(
    GET_MY_FPL_COMPETITIONS_DESK,
    { tournamentId, eventId },
    { cachePolicy: "reporting", forceRefresh, trace },
  ).then((data) => data.myFplCompetitionsDesk);
}

export async function getMyFplCompetitionBoard(
  tournamentId: number,
  eventId: number,
  page = 1,
  pageSize = 100,
  search = "",
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<MyFplCompetitionBoard> {
  return graphqlRequest<{ myFplCompetitionBoard: MyFplCompetitionBoard }>(
    GET_MY_FPL_COMPETITION_BOARD,
    { tournamentId, eventId, page, pageSize, search: search || null },
    { cachePolicy: "reporting", forceRefresh, trace },
  ).then((data) => data.myFplCompetitionBoard);
}

const MY_FPL_BOARD_PAGE_SIZE = 100;
const MY_FPL_BOARD_PAGE_CONCURRENCY = 4;

export function mergeMyFplCompetitionBoardPages(
  pages: readonly MyFplCompetitionBoard[],
): MyFplCompetitionBoard {
  const first = pages[0];
  if (!first) throw new Error("赛事榜单没有返回分页数据");
  const rows: MyFplCompetitionBoardRow[] = [];
  const seen = new Set<number>();
  for (const page of [...pages].sort((left, right) => left.page - right.page)) {
    for (const row of page.rows || []) {
      if (seen.has(row.entryId)) continue;
      seen.add(row.entryId);
      rows.push(row);
    }
  }
  if (rows.length < first.totalRows) {
    throw new Error(`赛事榜单加载不完整（${rows.length}/${first.totalRows}）`);
  }
  return { ...first, page: 1, rows };
}

/** Load every server page so local search and sort operate on the full field. */
export async function getCompleteMyFplCompetitionBoard(
  tournamentId: number,
  eventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<MyFplCompetitionBoard> {
  const first = await getMyFplCompetitionBoard(
    tournamentId,
    eventId,
    1,
    MY_FPL_BOARD_PAGE_SIZE,
    "",
    forceRefresh,
    trace,
  );
  const totalPages = Math.max(1, Number(first.totalPages) || 1);
  if (totalPages === 1) return mergeMyFplCompetitionBoardPages([first]);

  const pages: MyFplCompetitionBoard[] = [first];
  for (
    let start = 2;
    start <= totalPages;
    start += MY_FPL_BOARD_PAGE_CONCURRENCY
  ) {
    const pageNumbers = Array.from(
      {
        length: Math.min(MY_FPL_BOARD_PAGE_CONCURRENCY, totalPages - start + 1),
      },
      (_, index) => start + index,
    );
    const batch = await Promise.all(
      pageNumbers.map((page) =>
        getMyFplCompetitionBoard(
          tournamentId,
          eventId,
          page,
          MY_FPL_BOARD_PAGE_SIZE,
          "",
          forceRefresh,
          trace,
        ),
      ),
    );
    for (let index = 0; index < batch.length; index += 1) {
      const page = batch[index];
      const expectedPage = pageNumbers[index];
      if (
        page.page !== expectedPage ||
        page.eventId !== first.eventId ||
        page.totalPages !== first.totalPages ||
        page.totalRows !== first.totalRows ||
        page.fieldSize !== first.fieldSize
      ) {
        throw new Error("赛事榜单在分页加载期间已更新，请重试");
      }
    }
    pages.push(...batch);
  }
  return mergeMyFplCompetitionBoardPages(pages);
}

export async function getMyFplCompetitionSeasonPath(
  tournamentId: number,
  throughEventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<MyFplCompetitionSeasonPath> {
  return graphqlRequest<{
    myFplCompetitionSeasonPath: MyFplCompetitionSeasonPath;
  }>(
    GET_MY_FPL_COMPETITION_SEASON_PATH,
    { tournamentId, throughEventId },
    { cachePolicy: "reporting", forceRefresh, trace },
  ).then((data) => data.myFplCompetitionSeasonPath);
}

export async function getEntryPointsRaceTournament(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<TournamentOption[]> {
  const rows = await readDirectory(entry, forceRefresh, trace);
  // Points races plus official H2H leagues (web liveTournament.ts
  // isOfficialH2HTournament) — the live page renders each kind differently.
  return rows
    .filter(
      (t) =>
        !t.groupMode ||
        t.groupMode === "POINTS_RACES" ||
        isOfficialH2HTournamentRow(t),
    )
    .map((t) => ({
      id: Number(t.id),
      name: t.name,
      participantCount: t.totalTeamNum ?? undefined,
      groupMode: t.groupMode,
      leagueType: t.leagueType,
      rosterMode: t.rosterMode,
    }));
}

/** Read the complete participating-tournament directory for the entry. */
export async function getEntryAllTournaments(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<EntryTournamentRow[]> {
  return readDirectory(entry, forceRefresh, trace ?? undefined);
}

export async function getEntrySummaryTournaments(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
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
      participantCount: t.totalTeamNum ?? undefined,
    }));
}

export async function getEntryKnockoutTournament(
  entry: number,
): Promise<KnockoutOption[]> {
  const rows = await readDirectory(entry);
  return rows
    .filter((t) => t.knockoutMode && t.knockoutMode !== "NO_KNOCKOUT")
    .map((t) => ({
      id: t.id,
      name: t.name,
      startGw: t.knockoutStartedEventId ?? undefined,
      endGw: t.knockoutEndedEventId ?? undefined,
    }));
}

export async function loadTournamentSeasonPath(
  tournamentId: number,
  entryId: number,
  fromGw: number,
  toGw: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
  onBatch?: (
    pages: Array<{ gameweek: number; rows: TournamentEventResult[] }>,
  ) => boolean | void,
): Promise<
  Array<{
    gameweek: number;
    rows: TournamentEventResult[];
  }>
> {
  const start = Math.max(1, Math.min(fromGw, toGw));
  const end = Math.max(start, toGw);
  const events: number[] = [];
  for (let event = start; event <= end; event += 1) events.push(event);
  const out: Array<{ gameweek: number; rows: TournamentEventResult[] }> = [];
  const concurrency = 4;
  for (let offset = 0; offset < events.length; offset += concurrency) {
    const batch = events.slice(offset, offset + concurrency);
    const pages = await Promise.all(
      batch.map(async (eventId) => {
        const payload = await getTournamentSummary(
          tournamentId,
          eventId,
          entryId,
          forceRefresh,
          trace,
        );
        return {
          gameweek: eventId,
          rows: payload.tournamentEventResults || [],
        };
      }),
    );
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
  trace?: PageRequestTrace,
): Promise<TournamentSummaryPayload> {
  return graphqlRequest<TournamentSummaryResponse>(
    GET_TOURNAMENT_SUMMARY,
    { tournamentId, eventId, entryId },
    {
      cachePolicy: "reporting",
      forceRefresh,
      trace,
    },
  );
}

export async function getTournamentSeasonSnapshot(
  tournamentId: number,
  eventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<TournamentSeasonSnapshot | null> {
  const data = await graphqlRequest<{
    tournamentSeasonSnapshot: TournamentSeasonSnapshot | null;
  }>(
    GET_TOURNAMENT_SEASON_SNAPSHOT,
    { tournamentId, eventId },
    { cachePolicy: "reporting", forceRefresh, trace },
  );
  return data.tournamentSeasonSnapshot;
}

export async function getTournamentSelectionStats(
  tournamentId: number,
  eventId: number,
  limit = 10,
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<TournamentSelectionStats | null> {
  const data = await graphqlRequest<TournamentSelectionStatsResponse>(
    GET_TOURNAMENT_SELECTION_STATS,
    {
      tournamentId,
      eventId,
      limit,
    },
    { cachePolicy: "reporting", forceRefresh, trace },
  );
  return data.tournamentSelectionStats;
}
