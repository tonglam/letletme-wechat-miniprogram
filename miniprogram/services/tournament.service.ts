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
import { currentMyFplEntryId } from "../utils/follow";

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

/** V2.1 finalized-snapshot contract. Live and retired reporting roots are not
 * used by the My FPL tournament review page. */
export type MyTournamentReviewScope = "ACCESSIBLE" | "MANAGED" | "ALL";
export type MyTournamentReviewFormat = "POINTS" | "H2H" | "KNOCKOUT";
export type MyTournamentReviewState =
  | "NOT_STARTED"
  | "PENDING"
  | "WAITING_SOURCE"
  | "READY"
  | "DEGRADED"
  | "UNAVAILABLE";

export interface MyTournamentReviewCatalogItem {
  tournamentId: number;
  name: string;
  creator: string;
  leagueId: number;
  leagueType: string;
  totalTeamNum: number;
  latestFinalizedEventId: number | null;
  previousReadyEventId: number | null;
  setupStatus: string;
  latestFinalizedScope: MyTournamentReviewEventStatus | null;
  phaseSummaries: MyTournamentReviewPhaseSummary[];
  state: MyTournamentReviewState;
}

export interface MyTournamentReviewPhaseSummary {
  phaseId: string;
  format: MyTournamentReviewFormat;
  startEventId: number;
  endEventId: number | null;
  state: MyTournamentReviewState;
}

export interface MyTournamentReviewEventStatus {
  eventId: number;
  format: MyTournamentReviewFormat;
  state: MyTournamentReviewState;
  nextAttemptAt: string | null;
  executionAttempts: number;
  sourceRechecks: number;
  degradedAt: string | null;
  revision: string | null;
  publishedAt: string | null;
}

export interface MyTournamentReviewPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface MyTournamentReviewCatalog {
  state: MyTournamentReviewState;
  asOf: string;
  viewerEntryId: number | null;
  adminReadAll: boolean;
  edges: Array<{ cursor: string; node: MyTournamentReviewCatalogItem }>;
  pageInfo: MyTournamentReviewPageInfo;
}

export interface MyTournamentReviewScopeMeta {
  tournamentId: number;
  eventId: number;
  revision: string;
  format: MyTournamentReviewFormat;
  state: MyTournamentReviewState;
  settledAt: string;
  publishedAt: string;
  correctedAt: string | null;
  semanticSha256: string;
  rowCount: number;
  expectedSubjectCount: number;
  readySubjectCount: number;
  notApplicableSubjectCount: number;
}

export interface MyTournamentReviewPointsRow {
  entryId: number;
  entryName: string;
  playerName: string;
  applicable: boolean;
  groupId: number | null;
  rank: number | null;
  previousRank: number | null;
  grossPoints: number | null;
  transferCost: number | null;
  netPoints: number | null;
  tournamentScore: number | null;
  seasonGrossPoints: number | null;
  seasonNetPoints: number | null;
  eventRank: number | null;
  overallPoints: number | null;
  overallRank: number | null;
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
  rank: number | null;
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
  payload: MyTournamentReviewPayload | null;
}

export type MyTournamentReviewPayload =
  | { format: "POINTS"; points: MyTournamentReviewPoints }
  | { format: "H2H"; h2h: MyTournamentReviewH2H }
  | { format: "KNOCKOUT"; knockout: MyTournamentReviewKnockout };

export interface MyTournamentReviewPhase {
  phaseId: string;
  format: MyTournamentReviewFormat;
  startEventId: number;
  endEventId: number;
  state: MyTournamentReviewState;
  settledAt: string | null;
  publishedAt: string | null;
  correctedAt: string | null;
  revision: string | null;
  semanticSha256: string | null;
}

export interface MyTournamentSeasonReview {
  state: MyTournamentReviewState;
  tournamentId: number;
  throughEventId: number;
  latestFinalizedEventId: number | null;
  phases: MyTournamentReviewPhase[];
}

export type MyTournamentReviewSeasonSection =
  | "POINTS_STANDINGS"
  | "POINTS_TRAJECTORIES"
  | "H2H_STANDINGS"
  | "H2H_FIXTURES"
  | "KNOCKOUT_BRACKET";

export interface MyTournamentSeasonSection {
  state: MyTournamentReviewState;
  tournamentId: number;
  throughEventId: number;
  phaseId: string;
  section: MyTournamentReviewSeasonSection;
  revision: string;
  semanticSha256: string;
  points: MyTournamentReviewPoints | null;
  h2h: MyTournamentReviewH2H | null;
  knockout: MyTournamentReviewKnockout | null;
  pageInfo: MyTournamentReviewPageInfo;
}

const MY_TOURNAMENT_REVIEW_CONTRACT = "my-tournament-review-v2.1" as const;
const MY_TOURNAMENT_REVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

const REVIEW_SCOPE_META_FIELDS = `
  tournamentId eventId revision format state
  settledAt publishedAt correctedAt semanticSha256
  rowCount expectedSubjectCount readySubjectCount notApplicableSubjectCount
`;
const REVIEW_POINTS_FIELDS = `
  headlineMetric grossPointsTotal grossPointsAverage netPointsTotal
  seasonGrossPointsTotal seasonGrossPointsAverage seasonNetPointsTotal nextCursor hasNextPage
  rows { entryId entryName playerName applicable groupId rank previousRank grossPoints transferCost netPoints tournamentScore seasonGrossPoints seasonNetPoints eventRank overallPoints overallRank }
`;
const REVIEW_H2H_FIELDS = `
  nextCursor hasNextPage
  matches {
    matchId groupId isBye
    home { entryId entryName isAverage grossPoints transferCost netPoints matchPoints rank }
    away { entryId entryName isAverage grossPoints transferCost netPoints matchPoints rank }
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
  query MyTournamentReviewCatalog($scope: MyTournamentReviewScope = ACCESSIBLE, $first: Int = 50, $after: String, $search: String) {
    myTournamentReviewCatalog(scope: $scope, first: $first, after: $after, search: $search) {
      state asOf viewerEntryId adminReadAll
      edges {
        cursor
        node {
        tournamentId name creator leagueId leagueType totalTeamNum
        latestFinalizedEventId previousReadyEventId setupStatus state
        latestFinalizedScope { eventId format state nextAttemptAt executionAttempts sourceRechecks degradedAt revision publishedAt }
        phaseSummaries { phaseId format startEventId endEventId state }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const GET_MY_TOURNAMENT_GAMEWEEK_REVIEW = `
  query MyTournamentGameweekReview($tournamentId: Int!, $eventId: Int!, $first: Int = 100, $after: String, $revision: String) {
    myTournamentGameweekReview(tournamentId: $tournamentId, eventId: $eventId, first: $first, after: $after, revision: $revision) {
      state
      scope {${REVIEW_SCOPE_META_FIELDS}}
      payload {
        format
        ... on MyTournamentReviewPointsPayload { points {${REVIEW_POINTS_FIELDS}} }
        ... on MyTournamentReviewH2HPayload { h2h {${REVIEW_H2H_FIELDS}} }
        ... on MyTournamentReviewKnockoutPayload { knockout {${REVIEW_KNOCKOUT_FIELDS}} }
      }
    }
  }
`;

export const GET_MY_TOURNAMENT_SEASON_REVIEW = `
  query MyTournamentSeasonReview($tournamentId: Int!, $throughEventId: Int!) {
    myTournamentSeasonReview(tournamentId: $tournamentId, throughEventId: $throughEventId) {
      state tournamentId throughEventId latestFinalizedEventId
      phases { phaseId format startEventId endEventId state settledAt publishedAt correctedAt revision semanticSha256 }
    }
  }
`;

export const GET_MY_TOURNAMENT_SEASON_REVIEW_SECTION = `
  query MyTournamentSeasonReviewSection($tournamentId: Int!, $throughEventId: Int!, $phaseId: String!, $section: MyTournamentReviewSeasonSection!, $first: Int = 50, $after: String, $revision: String!, $semanticSha256: String!) {
    myTournamentSeasonReviewSection(tournamentId: $tournamentId, throughEventId: $throughEventId, phaseId: $phaseId, section: $section, first: $first, after: $after, revision: $revision, semanticSha256: $semanticSha256) {
      state tournamentId throughEventId phaseId section revision semanticSha256
      pageInfo { hasNextPage endCursor }
      points {${REVIEW_POINTS_FIELDS}}
      h2h {${REVIEW_H2H_FIELDS}}
      knockout {${REVIEW_KNOCKOUT_FIELDS}}
    }
  }
`;

const GET_TOURNAMENT_SEASON_SNAPSHOT = `
  query TournamentSeasonSnapshot($tournamentId: Int!, $eventId: Int!) {
    tournamentSeasonSnapshot(tournamentId: $tournamentId, eventId: $eventId) {
      asOfEventId entryCount leaderOverallPoints secondOverallPoints
      gapFirstSecond averageOverallPoints
      metrics { key leaderValue leaderEntryId leaderEntryName leaderPlayerName averageValue higherIsBetter }
      standings { entryId rank entryName playerName overallPoints overallRank teamValue }
    }
  }
`;

const myTournamentReviewOptions = (
  forceRefresh: boolean,
  trace?: PageRequestTrace,
  viewerEntryId?: number | null,
  validateCatalogViewer = false,
  cachePolicy: "network-only" | "reporting" = "reporting",
  cacheRevision?: string | null,
) => ({
  cachePolicy,
  // An unverified viewer must not use a persisted personal cache. The page
  // refreshes the authoritative follow before supplying this variant.
  cacheTtl:
    cachePolicy === "reporting" &&
    Number.isSafeInteger(viewerEntryId) &&
    Number(viewerEntryId) > 0
      ? MY_TOURNAMENT_REVIEW_CACHE_TTL_MS
      : 0,
  // A finalized review must never silently fall back to an older persisted
  // snapshot. A cache miss is a normal PostgreSQL-backed read; callers render
  // the returned PENDING/DEGRADED state instead of stale data.
  staleTtl: 0,
  forceRefresh,
  trace,
  cacheVariant: `viewer-entry:${
    Number.isSafeInteger(viewerEntryId) && Number(viewerEntryId) > 0
      ? Number(viewerEntryId)
      : "none"
  }${cacheRevision ? `|catalog-revision:${cacheRevision}` : ""}`,
  contract: MY_TOURNAMENT_REVIEW_CONTRACT,
  ...(Number.isSafeInteger(viewerEntryId) && Number(viewerEntryId) > 0
    ? {
        // Validate every cache read against the current local authority. The
        // page refreshes that authority before a personal review request;
        // this second guard also prevents an old entry variant from being
        // returned after an external rebind while the page remains resident.
        validateCacheData: (data: unknown) => {
          if (currentMyFplEntryId() !== Number(viewerEntryId)) return false;
          if (!validateCatalogViewer) return true;
          const catalog =
            data && typeof data === "object" && !Array.isArray(data)
              ? (data as { myTournamentReviewCatalog?: unknown })
                  .myTournamentReviewCatalog
              : null;
          const responseViewerEntryId =
            catalog && typeof catalog === "object" && !Array.isArray(catalog)
              ? Number((catalog as { viewerEntryId?: unknown }).viewerEntryId)
              : 0;
          return responseViewerEntryId === Number(viewerEntryId);
        },
      }
    : {}),
});

export async function getMyTournamentReviewCatalog(
  scope: MyTournamentReviewScope = "ACCESSIBLE",
  forceRefresh = false,
  trace?: PageRequestTrace,
  viewerEntryId?: number | null,
  after: string | null = null,
  search: string | null = null,
  first = 50,
): Promise<MyTournamentReviewCatalog> {
  const data = await graphqlRequest<{
    myTournamentReviewCatalog: MyTournamentReviewCatalog;
  }>(
    GET_MY_TOURNAMENT_REVIEW_CATALOG,
    { scope, first: Math.min(100, Math.max(1, first)), after, search },
    myTournamentReviewOptions(
      forceRefresh,
      trace,
      viewerEntryId,
      true,
      "network-only",
    ),
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
  viewerEntryId?: number | null,
  catalogRevision?: string | null,
): Promise<MyTournamentGameweekReview> {
  const data = await graphqlRequest<{
    myTournamentGameweekReview: MyTournamentGameweekReview;
  }>(
    GET_MY_TOURNAMENT_GAMEWEEK_REVIEW,
    { tournamentId, eventId, first: 100, after, revision },
    myTournamentReviewOptions(
      forceRefresh,
      trace,
      viewerEntryId,
      false,
      "reporting",
      catalogRevision,
    ),
  );
  return data.myTournamentGameweekReview;
}

export async function getMyTournamentSeasonReview(
  tournamentId: number,
  throughEventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
  viewerEntryId?: number | null,
): Promise<MyTournamentSeasonReview> {
  const data = await graphqlRequest<{
    myTournamentSeasonReview: MyTournamentSeasonReview;
  }>(
    GET_MY_TOURNAMENT_SEASON_REVIEW,
    { tournamentId, throughEventId },
    myTournamentReviewOptions(forceRefresh, trace, viewerEntryId),
  );
  return data.myTournamentSeasonReview;
}

export async function getMyTournamentSeasonReviewSection(
  tournamentId: number,
  throughEventId: number,
  phaseId: string,
  section: MyTournamentReviewSeasonSection,
  revision: string,
  semanticSha256: string,
  forceRefresh = false,
  trace?: PageRequestTrace,
  after: string | null = null,
  viewerEntryId?: number | null,
): Promise<MyTournamentSeasonSection> {
  const data = await graphqlRequest<{
    myTournamentSeasonReviewSection: MyTournamentSeasonSection;
  }>(
    GET_MY_TOURNAMENT_SEASON_REVIEW_SECTION,
    {
      tournamentId,
      throughEventId,
      phaseId,
      section,
      first: 50,
      after,
      revision,
      semanticSha256,
    },
    myTournamentReviewOptions(forceRefresh, trace, viewerEntryId),
  );
  return data.myTournamentSeasonReviewSection;
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
