import type {
  LiveDelivery,
  LiveScore,
  LiveTimes,
  LiveTournamentRow,
} from "../models/live";
import { storagePrefixes } from "../config/storage-keys";
import { recordBugReportDiagnostic } from "../utils/bug-report-diagnostics";
import { miniLogger } from "../utils/logger";
import { hashKey } from "./graphql-cache";
import {
  GraphQLApplicationError,
  GraphQLTransportError,
  graphqlRead,
  type GraphQLErrorInfo,
  type GraphQLReadMeta,
  type PageRequestTrace,
} from "./graphql.service";
import {
  mapTournamentLiveRows,
  type TournamentLiveGraphQLRow,
} from "./live-tournament";

export const LIVE_BOARD_CONTRACT_VERSION = "entry-live-board-v3";
export const LIVE_BOARD_PAGE_SIZE = 20;
export const LIVE_BOARD_LAST_GOOD_PREFIX =
  storagePrefixes.liveBoardLastGood + LIVE_BOARD_CONTRACT_VERSION;

export type LiveBoardSort =
  | "EVENT_POINTS"
  | "NET_EVENT_POINTS"
  | "TRANSFER_COST"
  | "PLAYED"
  | "TOTAL_POINTS"
  | "TEAM_VALUE"
  | "OVERALL_RANK"
  | "ENTRY_NAME";
export type LiveBoardDirection = "ASC" | "DESC";
export type LiveBoardPickScope = "ANY" | "STARTER" | "BENCH";
export type LiveBoardCaptainMode = "ANY" | "CAPTAIN" | "VICE";

export interface LiveBoardOwnershipFilter {
  playerIds: number[];
  scope: LiveBoardPickScope;
  captainMode: LiveBoardCaptainMode;
}

export interface LiveBoardTeamCountRule {
  teamId: number;
  exactCount: number;
  scope: LiveBoardPickScope;
}

export interface LeagueLiveHead {
  season: string;
  eventId: number;
  tournamentId: number;
  mode: "CLASSIC" | "H2H";
  availability: "READY" | "PENDING" | "MISSING" | "ERROR";
  contentRevision: string | null;
  publication: {
    revisions: {
      publicationId: string;
      generation: number;
      roster: string;
      scoreCore: string;
      fixtureIdentity: string;
      entryInputSet: string;
      identity: string;
      officialRank: string | null;
      rules: string;
      algorithm: string;
      content: string;
    };
    times: LiveTimes;
  } | null;
  delivery: LiveDelivery;
  nextRefreshAt: string | null;
}

export interface LiveBoardVariables {
  entryId: number;
  tournamentId: number;
  eventId: number;
  input?: {
    first?: number;
    after?: string | null;
    sort?: LiveBoardSort;
    direction?: LiveBoardDirection;
    search?: string | null;
    chips?: string[];
    captainPlayerIds?: number[];
    ownership?: LiveBoardOwnershipFilter | null;
    teamCountRules?: LiveBoardTeamCountRule[];
  };
}

export interface LiveBoardRow {
  availability: "READY" | "PENDING" | "MISSING" | "ERROR";
  entry: number;
  entryName: string;
  playerName: string;
  liveRank: number | null;
  overallRank: number | null;
  teamValue: number | null;
  chip: string | null;
  transferCost: number | null;
  played: number | null;
  toPlay: number | null;
  captainId: number | null;
  captainName: string | null;
  captainPoints: number | null;
  score: LiveScore | null;
}

export interface LiveBoardPage {
  head: LeagueLiveHead;
  totalEntries: number;
  filteredEntries: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  highestEventPoints: number | null;
  averageEventPoints: number | null;
  rows: LiveBoardRow[];
  viewerRow: LiveBoardRow | null;
}

/** A page is safe to replace an existing screen only when its publication is complete. */
export function isCompleteLiveBoardPage(
  page: LiveBoardPage | null,
  options: { firstPage?: boolean } = {},
): boolean {
  if (
    !page ||
    page.head.availability !== "READY" ||
    page.head.publication === null ||
    page.head.delivery.state === "UNAVAILABLE" ||
    typeof page.head.contentRevision !== "string" ||
    page.head.contentRevision.trim().length === 0
  ) {
    return false;
  }
  // The viewer row is an explicitly requested overlay and may also be part
  // of the visible page. Only duplicate rows within the page are corrupt.
  if (new Set(page.rows.map((row) => row.entry)).size !== page.rows.length) {
    return false;
  }
  if (page.rows.length > page.filteredEntries) return false;
  if (page.filteredEntries > 0 && page.rows.length === 0) return false;
  if (page.pageInfo.hasNextPage) {
    if (!page.pageInfo.endCursor || page.rows.length >= page.filteredEntries) {
      return false;
    }
  } else if (page.rows.length === 0 && page.pageInfo.endCursor !== null) {
    return false;
  } else if (options.firstPage && page.rows.length !== page.filteredEntries) {
    return false;
  }
  const rows = page.viewerRow ? [...page.rows, page.viewerRow] : page.rows;
  return rows.every(
    (row) =>
      (row.availability === "READY" && row.score !== null) ||
      (row.availability === "MISSING" && row.score === null),
  );
}

export interface LiveBoardReadResult {
  page: LiveBoardPage;
  meta: GraphQLReadMeta;
}

export interface LiveBoardSelectionIndexRow {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  teamShortName: string;
  position: string;
  count: number;
  percentage: number;
}

export interface LiveBoardSelectionIndex {
  tournamentId: number;
  eventId: number;
  scoreCoreRevision: string;
  rows: LiveBoardSelectionIndexRow[];
}

export interface LiveBoardLastGoodScope {
  sessionKey: string;
  season: string;
  eventId: number;
  entryId: number;
  tournamentId: number;
}

export interface StoredLiveBoardLastGood {
  contractVersion: typeof LIVE_BOARD_CONTRACT_VERSION;
  savedAt: number;
  scope: LiveBoardLastGoodScope;
  page: LiveBoardPage;
}

export class LiveBoardInvalidResponseError extends Error {
  readonly code = "LIVE_BOARD_INVALID_RESPONSE";
  readonly missingFields: string[];
  readonly requestId?: string;
  readonly durationMs: number;

  constructor(
    missingFields: string[],
    options: { requestId?: string; durationMs?: number } = {},
  ) {
    super("实时赛事响应不完整，请稍后重试");
    this.name = "LiveBoardInvalidResponseError";
    this.missingFields = [...new Set(missingFields)].slice(0, 30);
    this.requestId = options.requestId;
    this.durationMs = Math.max(0, Math.round(options.durationMs || 0));
  }
}

export const ENTRY_LIVE_COMPETITION_BOARD_QUERY = `
  query GetEntryLiveCompetitionBoard(
    $entryId: Int!
    $tournamentId: Int!
    $eventId: Int!
    $input: EntryLiveCompetitionBoardInput
  ) {
    entryLiveCompetitionBoard(
      entryId: $entryId
      tournamentId: $tournamentId
      eventId: $eventId
      input: $input
    ) {
      head {
        season eventId tournamentId mode availability contentRevision nextRefreshAt
        publication {
          revisions {
            publicationId generation roster scoreCore fixtureIdentity
            entryInputSet identity officialRank rules algorithm content
          }
          times {
            sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt
            servedAt staleAt nextRefreshAt
          }
        }
        delivery { state servedFrom reasonCodes }
      }
      totalEntries
      filteredEntries
      pageInfo { hasNextPage endCursor }
      highestEventPoints
      averageEventPoints
      rows {
        availability entry entryName playerName liveRank overallRank teamValue
        chip transferCost played toPlay captainId captainName captainPoints
        score {
          eventPoints netEventPoints totalPoints totalScope transferCost
          source calculationMode
          revisions {
            publicationId generation lifecycle fixtureIdentity scoreCore
            displayStats explain picksBase officialAdjustment previousTotals
            finalResult rules algorithm input
          }
          times {
            sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt
            servedAt staleAt nextRefreshAt
          }
          delivery { state servedFrom reasonCodes }
        }
      }
      viewerRow {
        availability entry entryName playerName liveRank overallRank teamValue
        chip transferCost played toPlay captainId captainName captainPoints
        score {
          eventPoints netEventPoints totalPoints totalScope transferCost
          source calculationMode
          revisions {
            publicationId generation lifecycle fixtureIdentity scoreCore
            displayStats explain picksBase officialAdjustment previousTotals
            finalResult rules algorithm input
          }
          times {
            sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt
            servedAt staleAt nextRefreshAt
          }
          delivery { state servedFrom reasonCodes }
        }
      }
    }
  }
`;

/** Metadata-only probe used to decide whether a full board read is needed. */
export const LEAGUE_LIVE_HEAD_QUERY = `
  query GetLeagueLiveHead(
    $entryId: Int!
    $tournamentId: Int!
    $eventId: Int!
    $mode: LeagueLiveMode!
  ) {
    leagueLiveHead(
      entryId: $entryId
      tournamentId: $tournamentId
      eventId: $eventId
      mode: $mode
    ) {
      season eventId tournamentId mode availability contentRevision nextRefreshAt
      publication {
        revisions {
          publicationId generation roster scoreCore fixtureIdentity entryInputSet
          identity officialRank rules algorithm content
        }
        times {
          sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt
          servedAt staleAt nextRefreshAt
        }
      }
      delivery { state servedFrom reasonCodes }
    }
  }
`;

export const TOURNAMENT_SELECTION_INDEX_QUERY = `
  query GetTournamentSelectionIndex(
    $entryId: Int!
    $tournamentId: Int!
    $ref: LivePublicationRefInput!
  ) {
    tournamentSelectionIndex(entryId: $entryId, tournamentId: $tournamentId, ref: $ref) {
      tournamentId eventId scoreCoreRevision
      rows { playerId playerName teamId teamName teamShortName position count percentage }
    }
  }
`;

export const TOURNAMENT_ENTRY_SQUADS_QUERY = `
  query GetTournamentEntrySquads(
    $entryId: Int!
    $tournamentId: Int!
    $comparedEntryIds: [Int!]!
    $ref: LivePublicationRefInput!
  ) {
    tournamentEntrySquads(
      entryId: $entryId
      tournamentId: $tournamentId
      comparedEntryIds: $comparedEntryIds
      ref: $ref
    ) {
      tournamentId eventId scoreCoreRevision
      entries {
        entry entryName playerName played toPlay captainName chip
        rank { eventRank overallRank leagueRank revision contentUpdatedAt state }
        score {
          eventPoints netEventPoints totalPoints totalScope transferCost source calculationMode
          revisions {
            publicationId generation lifecycle fixtureIdentity scoreCore displayStats
            explain picksBase officialAdjustment previousTotals finalResult rules algorithm input
          }
          times {
            sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt
            servedAt staleAt nextRefreshAt
          }
          delivery { state servedFrom reasonCodes }
        }
        pickList {
          element webName elementTypeName position multiplier pickActive autoSub
          isCaptain isViceCaptain teamShortName teamName totalPoints minutes starts
          isGwFinished isGwStarted isPlayed
        }
      }
    }
  }
`;

const AVAILABILITY = new Set([
  "FRESH",
  "STALE",
  "DEGRADED",
  "FINAL",
  "UNAVAILABLE",
]);
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isNullableNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableDate(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)))
  );
}

function validateRevisionVector(
  value: unknown,
  path: string,
  missing: string[],
): void {
  if (!isRecord(value)) {
    missing.push(path);
    return;
  }
  for (const field of [
    "publicationId",
    "lifecycle",
    "fixtureIdentity",
    "scoreCore",
    "displayStats",
    "explain",
    "rules",
    "algorithm",
    "input",
  ]) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      missing.push(path + "." + field);
    }
  }
  if (!isInteger(value.generation) || value.generation < 1) {
    missing.push(path + ".generation");
  }
  for (const field of [
    "picksBase",
    "officialAdjustment",
    "previousTotals",
    "finalResult",
  ]) {
    if (!isNullableString(value[field])) missing.push(path + "." + field);
  }
}

function validateLeagueHeadRevisionVector(
  value: unknown,
  path: string,
  missing: string[],
): void {
  if (!isRecord(value)) {
    missing.push(path);
    return;
  }
  for (const field of [
    "publicationId",
    "roster",
    "scoreCore",
    "fixtureIdentity",
    "entryInputSet",
    "identity",
    "rules",
    "algorithm",
    "content",
  ]) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      missing.push(path + "." + field);
    }
  }
  if (!isInteger(value.generation) || value.generation < 1) {
    missing.push(path + ".generation");
  }
  if (!isNullableString(value.officialRank)) {
    missing.push(path + ".officialRank");
  }
}

function validateLiveTimes(
  value: unknown,
  path: string,
  missing: string[],
): void {
  if (!isRecord(value)) {
    missing.push(path);
    return;
  }
  for (const field of [
    "sourceCheckedAt",
    "contentUpdatedAt",
    "publishedAt",
    "servedAt",
    "staleAt",
  ]) {
    if (!isNullableDate(value[field]) || value[field] === null) {
      missing.push(path + "." + field);
    }
  }
  for (const field of ["checkpointedAt", "nextRefreshAt"]) {
    if (!isNullableDate(value[field])) missing.push(path + "." + field);
  }
}

function validateLiveDelivery(
  value: unknown,
  path: string,
  missing: string[],
): void {
  if (!isRecord(value)) {
    missing.push(path);
    return;
  }
  if (!AVAILABILITY.has(String(value.state))) missing.push(path + ".state");
  if (
    ![
      "REDIS_CURRENT",
      "REDIS_PREVIOUS",
      "PROCESS_LKG",
      "POSTGRES_CHECKPOINT",
      "FINAL_RESULT",
      "UNAVAILABLE",
    ].includes(String(value.servedFrom))
  ) {
    missing.push(path + ".servedFrom");
  }
  if (
    !Array.isArray(value.reasonCodes) ||
    !value.reasonCodes.every((item) => typeof item === "string")
  ) {
    missing.push(path + ".reasonCodes");
  }
}

function validateLeagueHead(
  value: unknown,
  path: string,
  missing: string[],
): value is LeagueLiveHead {
  if (!isRecord(value)) {
    missing.push(path);
    return false;
  }
  for (const field of ["season", "mode", "availability"]) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      missing.push(path + "." + field);
    }
  }
  for (const field of ["eventId", "tournamentId"]) {
    if (!isInteger(value[field]) || (value[field] as number) < 1) {
      missing.push(path + "." + field);
    }
  }
  if (value.mode !== "CLASSIC" && value.mode !== "H2H")
    missing.push(path + ".mode");
  if (
    !["READY", "PENDING", "MISSING", "ERROR"].includes(
      String(value.availability),
    )
  ) {
    missing.push(path + ".availability");
  }
  if (!isNullableString(value.contentRevision))
    missing.push(path + ".contentRevision");
  if (
    value.availability === "READY" &&
    (typeof value.contentRevision !== "string" ||
      value.contentRevision.trim().length === 0)
  ) {
    missing.push(path + ".contentRevision");
  }
  if (!isNullableDate(value.nextRefreshAt))
    missing.push(path + ".nextRefreshAt");
  validateLiveDelivery(value.delivery, path + ".delivery", missing);
  if (value.availability === "READY" && value.publication === null) {
    missing.push(path + ".publication");
  } else if (value.publication === undefined) {
    missing.push(path + ".publication");
  } else if (value.publication !== null) {
    if (!isRecord(value.publication)) missing.push(path + ".publication");
    else {
      validateLeagueHeadRevisionVector(
        value.publication.revisions,
        path + ".publication.revisions",
        missing,
      );
      validateLiveTimes(
        value.publication.times,
        path + ".publication.times",
        missing,
      );
    }
  }
  return true;
}

function validateLiveScore(
  value: unknown,
  path: string,
  missing: string[],
): void {
  if (!isRecord(value)) {
    missing.push(path);
    return;
  }
  for (const field of ["eventPoints", "netEventPoints"]) {
    if (!isInteger(value[field])) missing.push(path + "." + field);
  }
  if (!isNullableNumber(value.totalPoints)) missing.push(path + ".totalPoints");
  if (value.totalScope !== "OVERALL" && value.totalScope !== "UNKNOWN") {
    missing.push(path + ".totalScope");
  }
  if (!isNonNegativeInteger(value.transferCost))
    missing.push(path + ".transferCost");
  if (
    value.source !== "FPL_EVENT_LIVE" &&
    value.source !== "FPL_FINAL_RESULT" &&
    value.source !== "UNAVAILABLE"
  ) {
    missing.push(path + ".source");
  }
  if (
    value.calculationMode !== "PROJECTED_AUTOSUBS" &&
    value.calculationMode !== "FINAL_RESULT"
  ) {
    missing.push(path + ".calculationMode");
  }
  validateRevisionVector(value.revisions, path + ".revisions", missing);
  validateLiveTimes(value.times, path + ".times", missing);
  validateLiveDelivery(value.delivery, path + ".delivery", missing);
}

function validateBoardRow(
  value: unknown,
  path: string,
  missing: string[],
): void {
  if (!isRecord(value)) {
    missing.push(path);
    return;
  }
  if (
    !["READY", "PENDING", "MISSING", "ERROR"].includes(
      String(value.availability),
    )
  ) {
    missing.push(path + ".availability");
  }
  if (!isInteger(value.entry) || (value.entry as number) < 1)
    missing.push(path + ".entry");
  for (const field of ["entryName", "playerName"]) {
    if (typeof value[field] !== "string") missing.push(path + "." + field);
  }
  for (const field of [
    "liveRank",
    "overallRank",
    "teamValue",
    "transferCost",
    "played",
    "toPlay",
    "captainId",
    "captainPoints",
  ]) {
    if (!isNullableNumber(value[field])) missing.push(path + "." + field);
  }
  if (!isNullableString(value.chip)) missing.push(path + ".chip");
  if (!isNullableString(value.captainName)) missing.push(path + ".captainName");
  if (value.score === null) {
    if (value.availability === "READY") missing.push(path + ".score");
  } else {
    validateLiveScore(value.score, path + ".score", missing);
  }
}

export function parseLiveBoardPage(
  value: unknown,
  options: { requestId?: string; durationMs?: number } = {},
): LiveBoardPage {
  const root =
    isRecord(value) && "entryLiveCompetitionBoard" in value
      ? value.entryLiveCompetitionBoard
      : value;
  if (!isRecord(root)) {
    throw new LiveBoardInvalidResponseError(
      ["entryLiveCompetitionBoard"],
      options,
    );
  }
  const missing: string[] = [];
  validateLeagueHead(root.head, "head", missing);
  for (const field of ["totalEntries", "filteredEntries"]) {
    if (!isNonNegativeInteger(root[field])) missing.push(field);
  }
  if (
    isNonNegativeInteger(root.totalEntries) &&
    isNonNegativeInteger(root.filteredEntries) &&
    (root.filteredEntries as number) > (root.totalEntries as number)
  ) {
    missing.push("filteredEntries:range");
  }
  if (!isRecord(root.pageInfo)) {
    missing.push("pageInfo");
  } else {
    if (typeof root.pageInfo.hasNextPage !== "boolean")
      missing.push("pageInfo.hasNextPage");
    if (!isNullableString(root.pageInfo.endCursor))
      missing.push("pageInfo.endCursor");
  }
  if (!isNullableNumber(root.highestEventPoints))
    missing.push("highestEventPoints");
  if (!isNullableNumber(root.averageEventPoints))
    missing.push("averageEventPoints");
  if (!Array.isArray(root.rows)) {
    missing.push("rows");
  } else {
    if (root.rows.length > 50) missing.push("rows:max");
    if (
      isNonNegativeInteger(root.filteredEntries) &&
      root.rows.length > (root.filteredEntries as number)
    ) {
      missing.push("rows.filteredEntries");
    }
    const entryIds = new Set<number>();
    root.rows.forEach((row, index) =>
      validateBoardRow(row, "rows[" + index + "]", missing),
    );
    root.rows.forEach((row) => {
      if (isRecord(row) && isInteger(row.entry)) {
        if (entryIds.has(row.entry)) missing.push("rows.entry:duplicate");
        entryIds.add(row.entry);
      }
    });
    if (
      isRecord(root.pageInfo) &&
      typeof root.pageInfo.hasNextPage === "boolean" &&
      isNullableString(root.pageInfo.endCursor)
    ) {
      if (
        root.pageInfo.hasNextPage &&
        (typeof root.pageInfo.endCursor !== "string" ||
          root.pageInfo.endCursor.length === 0 ||
          root.rows.length === 0)
      ) {
        missing.push("pageInfo.nextPage:cursor");
      }
    }
  }
  if (root.viewerRow !== null)
    validateBoardRow(root.viewerRow, "viewerRow", missing);
  if (missing.length > 0)
    throw new LiveBoardInvalidResponseError(missing, options);
  return root as unknown as LiveBoardPage;
}

export function parseLeagueLiveHead(
  value: unknown,
  options: { requestId?: string; durationMs?: number } = {},
): LeagueLiveHead {
  const root =
    isRecord(value) && "leagueLiveHead" in value ? value.leagueLiveHead : value;
  const missing: string[] = [];
  validateLeagueHead(root, "head", missing);
  if (missing.length > 0)
    throw new LiveBoardInvalidResponseError(missing, options);
  return root as LeagueLiveHead;
}

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof GraphQLTransportError) || !error.transient)
    return false;
  if (
    error.statusCode === 429 ||
    error.statusCode === 401 ||
    error.statusCode === 403
  )
    return false;
  return (
    error.statusCode === undefined || TRANSIENT_STATUSES.has(error.statusCode)
  );
}

function retryDelayMs(random: () => number): number {
  return Math.min(800, Math.max(400, 400 + Math.floor(random() * 401)));
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readWithOneTransientRetry<T>(
  query: string,
  variables: Record<string, unknown>,
  options: {
    trace?: PageRequestTrace;
    random?: () => number;
    sleepImpl?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<{ data: T; meta: GraphQLReadMeta }> {
  const random = options.random || Math.random;
  const sleepImpl = options.sleepImpl || sleep;
  let attempt = 0;
  for (;;) {
    try {
      const result = await graphqlRead<T>(query, variables, {
        cachePolicy: "network-only",
        forceRefresh: true,
        trace: options.trace,
        contract: "live-points-v2",
      });
      if (result.errors.length > 0)
        throw new GraphQLApplicationError(result.errors);
      return { data: result.data, meta: result.meta };
    } catch (error) {
      if (attempt >= 1 || !shouldRetry(error)) throw error;
      attempt += 1;
      await sleepImpl(retryDelayMs(random));
    }
  }
}

function recordInvalidLiveResponse(
  operation: string,
  error: LiveBoardInvalidResponseError,
): void {
  const message =
    "duration=" +
    error.durationMs +
    "ms missing=" +
    error.missingFields.join(",");
  miniLogger.error("live-board.invalid-response", message);
  recordBugReportDiagnostic({
    at: new Date().toISOString(),
    operation,
    requestId: error.requestId,
    code: error.code,
    message,
  });
}

export async function getEntryLiveCompetitionBoardPage(
  variables: LiveBoardVariables,
  options: {
    expectedSeason?: string;
    trace?: PageRequestTrace;
    random?: () => number;
    sleepImpl?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<LiveBoardReadResult> {
  const startedAt = Date.now();
  const result = await readWithOneTransientRetry<{
    entryLiveCompetitionBoard: unknown;
  }>(
    ENTRY_LIVE_COMPETITION_BOARD_QUERY,
    variables as unknown as Record<string, unknown>,
    options,
  );
  try {
    const page = parseLiveBoardPage(result.data, {
      requestId: result.meta.requestId,
      durationMs: Date.now() - startedAt,
    });
    const mismatches: string[] = [];
    if (page.head.eventId !== variables.eventId)
      mismatches.push("head.eventId:mismatch");
    if (page.head.tournamentId !== variables.tournamentId) {
      mismatches.push("head.tournamentId:mismatch");
    }
    if (page.head.mode !== "CLASSIC") mismatches.push("head.mode:mismatch");
    if (options.expectedSeason && page.head.season !== options.expectedSeason) {
      mismatches.push("head.season:mismatch");
    }
    if (mismatches.length > 0) {
      throw new LiveBoardInvalidResponseError(mismatches, {
        requestId: result.meta.requestId,
        durationMs: Date.now() - startedAt,
      });
    }
    return { page, meta: result.meta };
  } catch (error) {
    if (error instanceof LiveBoardInvalidResponseError) {
      recordInvalidLiveResponse("GetEntryLiveCompetitionBoard", error);
    }
    throw error;
  }
}

export async function getLeagueLiveHead(
  variables: {
    entryId: number;
    tournamentId: number;
    eventId: number;
    mode: "CLASSIC" | "H2H";
  },
  options: {
    expectedSeason?: string;
    trace?: PageRequestTrace;
    random?: () => number;
    sleepImpl?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<LeagueLiveHead> {
  const startedAt = Date.now();
  const result = await readWithOneTransientRetry<{
    leagueLiveHead: unknown;
  }>(LEAGUE_LIVE_HEAD_QUERY, variables, options);
  try {
    const errorOptions = {
      requestId: result.meta.requestId,
      durationMs: Date.now() - startedAt,
    };
    const head = parseLeagueLiveHead(result.data, errorOptions);
    const mismatches: string[] = [];
    if (head.eventId !== variables.eventId)
      mismatches.push("head.eventId:mismatch");
    if (head.tournamentId !== variables.tournamentId)
      mismatches.push("head.tournamentId:mismatch");
    if (head.mode !== variables.mode) mismatches.push("head.mode:mismatch");
    if (options.expectedSeason && head.season !== options.expectedSeason) {
      mismatches.push("head.season:mismatch");
    }
    if (mismatches.length > 0) {
      throw new LiveBoardInvalidResponseError(mismatches, errorOptions);
    }
    return head;
  } catch (error) {
    if (error instanceof LiveBoardInvalidResponseError) {
      recordInvalidLiveResponse("GetLeagueLiveHead", error);
    }
    throw error;
  }
}
function graphQLErrorCode(error: GraphQLErrorInfo): string {
  return String(error.extensions?.code || "");
}

export function hasLiveBoardErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof GraphQLApplicationError &&
    error.errors.some((item) => graphQLErrorCode(item) === code)
  );
}

function validateSelectionIndex(
  value: unknown,
  options: { requestId?: string; durationMs?: number } = {},
): LiveBoardSelectionIndex {
  const root =
    isRecord(value) && "tournamentSelectionIndex" in value
      ? value.tournamentSelectionIndex
      : value;
  const missing: string[] = [];
  if (!isRecord(root)) {
    throw new LiveBoardInvalidResponseError(
      ["tournamentSelectionIndex"],
      options,
    );
  }
  if (!isPositiveInteger(root.tournamentId)) missing.push("tournamentId");
  if (!isPositiveInteger(root.eventId)) missing.push("eventId");
  if (typeof root.scoreCoreRevision !== "string" || !root.scoreCoreRevision)
    missing.push("scoreCoreRevision");
  if (!Array.isArray(root.rows)) {
    missing.push("rows");
  } else {
    root.rows.forEach((value, index) => {
      const path = `rows[${index}]`;
      if (!isRecord(value)) {
        missing.push(path);
        return;
      }
      for (const field of ["playerId", "teamId", "count"]) {
        if (!isPositiveInteger(value[field])) missing.push(`${path}.${field}`);
      }
      for (const field of [
        "playerName",
        "teamName",
        "teamShortName",
        "position",
      ]) {
        if (typeof value[field] !== "string" || !value[field]) {
          missing.push(`${path}.${field}`);
        }
      }
      if (
        typeof value.percentage !== "number" ||
        !Number.isFinite(value.percentage)
      ) {
        missing.push(`${path}.percentage`);
      }
    });
  }
  if (missing.length > 0)
    throw new LiveBoardInvalidResponseError(missing, options);
  return root as unknown as LiveBoardSelectionIndex;
}

export async function getTournamentSelectionIndex(options: {
  entryId: number;
  tournamentId: number;
  ref: { season: string; eventId: number; scoreCoreRevision: string };
  trace?: PageRequestTrace;
}): Promise<LiveBoardSelectionIndex> {
  const startedAt = Date.now();
  const result = await readWithOneTransientRetry<{
    tournamentSelectionIndex: unknown;
  }>(
    TOURNAMENT_SELECTION_INDEX_QUERY,
    {
      entryId: options.entryId,
      tournamentId: options.tournamentId,
      ref: options.ref,
    },
    { trace: options.trace },
  );
  try {
    const errorOptions = {
      requestId: result.meta.requestId,
      durationMs: Date.now() - startedAt,
    };
    const parsed = validateSelectionIndex(result.data, errorOptions);
    if (
      parsed.eventId !== options.ref.eventId ||
      parsed.tournamentId !== options.tournamentId ||
      parsed.scoreCoreRevision !== options.ref.scoreCoreRevision
    ) {
      throw new LiveBoardInvalidResponseError(
        ["selectionIndex:scope-mismatch"],
        errorOptions,
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof LiveBoardInvalidResponseError) {
      recordInvalidLiveResponse("GetTournamentSelectionIndex", error);
    }
    throw error;
  }
}

function validateSquads(
  value: unknown,
  options: { requestId?: string; durationMs?: number } = {},
): {
  tournamentId: number;
  eventId: number;
  scoreCoreRevision: string;
  entries: TournamentLiveGraphQLRow[];
} {
  const root =
    isRecord(value) && "tournamentEntrySquads" in value
      ? value.tournamentEntrySquads
      : value;
  const missing: string[] = [];
  if (!isRecord(root)) {
    throw new LiveBoardInvalidResponseError(["tournamentEntrySquads"], options);
  }
  if (!isPositiveInteger(root.tournamentId)) missing.push("tournamentId");
  if (!isPositiveInteger(root.eventId)) missing.push("eventId");
  if (typeof root.scoreCoreRevision !== "string" || !root.scoreCoreRevision)
    missing.push("scoreCoreRevision");
  if (
    !Array.isArray(root.entries) ||
    root.entries.length < 1 ||
    root.entries.length > 2
  ) {
    missing.push("entries");
  } else {
    root.entries.forEach((entry, index) => {
      const path = `entries[${index}]`;
      if (!isRecord(entry)) {
        missing.push(path);
        return;
      }
      for (const field of ["entry", "played", "toPlay"]) {
        if (!isInteger(entry[field])) missing.push(`${path}.${field}`);
      }
      for (const field of ["entryName", "playerName", "captainName", "chip"]) {
        if (typeof entry[field] !== "string") missing.push(`${path}.${field}`);
      }
      validateLiveScore(entry.score, `${path}.score`, missing);
      if (
        !isRecord(entry.rank) ||
        !isNullableNumber(entry.rank.overallRank) ||
        !isNullableNumber(entry.rank.eventRank)
      )
        missing.push(`${path}.rank`);
      const picks = entry.pickList;
      if (!Array.isArray(picks) || picks.length > 15) {
        missing.push(`${path}.pickList`);
        return;
      }
      picks.forEach((pick, pickIndex) => {
        const pickPath = `${path}.pickList[${pickIndex}]`;
        if (!isRecord(pick)) {
          missing.push(pickPath);
          return;
        }
        if (!isPositiveInteger(pick.element))
          missing.push(`${pickPath}.element`);
        if (typeof pick.webName !== "string")
          missing.push(`${pickPath}.webName`);
      });
    });
  }
  if (missing.length > 0)
    throw new LiveBoardInvalidResponseError(missing, options);
  return root as unknown as {
    tournamentId: number;
    eventId: number;
    scoreCoreRevision: string;
    entries: TournamentLiveGraphQLRow[];
  };
}

export async function getTournamentEntrySquads(options: {
  entryId: number;
  tournamentId: number;
  comparedEntryIds: number[];
  ref: { season: string; eventId: number; scoreCoreRevision: string };
  trace?: PageRequestTrace;
}): Promise<LiveTournamentRow[]> {
  const comparedEntryIds = [...new Set(options.comparedEntryIds)].filter(
    (value) => Number.isSafeInteger(value) && value > 0,
  );
  if (comparedEntryIds.length !== 2) {
    throw new Error("请选择两支球队后再对比");
  }
  const startedAt = Date.now();
  const result = await readWithOneTransientRetry<{
    tournamentEntrySquads: unknown;
  }>(
    TOURNAMENT_ENTRY_SQUADS_QUERY,
    {
      entryId: options.entryId,
      tournamentId: options.tournamentId,
      comparedEntryIds,
      ref: options.ref,
    },
    { trace: options.trace },
  );
  try {
    const errorOptions = {
      requestId: result.meta.requestId,
      durationMs: Date.now() - startedAt,
    };
    const parsed = validateSquads(result.data, errorOptions);
    const responseIds = new Set(parsed.entries.map((entry) => entry.entry));
    if (
      parsed.tournamentId !== options.tournamentId ||
      parsed.eventId !== options.ref.eventId ||
      parsed.scoreCoreRevision !== options.ref.scoreCoreRevision ||
      comparedEntryIds.some((entryId) => !responseIds.has(entryId))
    ) {
      throw new LiveBoardInvalidResponseError(
        ["tournamentEntrySquads:scope-mismatch"],
        errorOptions,
      );
    }
    return mapTournamentLiveRows(parsed.entries);
  } catch (error) {
    if (error instanceof LiveBoardInvalidResponseError) {
      recordInvalidLiveResponse("GetTournamentEntrySquads", error);
    }
    throw error;
  }
}

function scopePart(value: string | number): string {
  return encodeURIComponent(String(value).trim());
}

export function liveBoardSessionKey(token: string | null): string {
  return token ? hashKey(token) : "";
}

export function liveBoardLastGoodKey(scope: LiveBoardLastGoodScope): string {
  return [
    LIVE_BOARD_LAST_GOOD_PREFIX,
    scopePart(scope.sessionKey),
    scopePart(scope.season),
    scope.eventId,
    scope.entryId,
    scope.tournamentId,
  ].join(":");
}

function sameScope(
  left: LiveBoardLastGoodScope,
  right: LiveBoardLastGoodScope,
): boolean {
  return (
    left.sessionKey === right.sessionKey &&
    left.season === right.season &&
    left.eventId === right.eventId &&
    left.entryId === right.entryId &&
    left.tournamentId === right.tournamentId
  );
}

export function readLiveBoardLastGood(
  scope: LiveBoardLastGoodScope,
): StoredLiveBoardLastGood | null {
  if (!scope.sessionKey || !scope.season) return null;
  try {
    const raw = wx.getStorageSync(liveBoardLastGoodKey(scope)) as unknown;
    if (
      !isRecord(raw) ||
      raw.contractVersion !== LIVE_BOARD_CONTRACT_VERSION ||
      !isRecord(raw.scope) ||
      !sameScope(raw.scope as unknown as LiveBoardLastGoodScope, scope)
    ) {
      return null;
    }
    const page = parseLiveBoardPage(raw.page);
    if (
      page.head.eventId !== scope.eventId ||
      page.head.tournamentId !== scope.tournamentId ||
      page.head.season !== scope.season ||
      page.head.mode !== "CLASSIC"
    ) {
      return null;
    }
    if (!isCompleteLiveBoardPage(page, { firstPage: true })) return null;
    return {
      contractVersion: LIVE_BOARD_CONTRACT_VERSION,
      savedAt: Number(raw.savedAt) || 0,
      scope,
      page,
    };
  } catch {
    return null;
  }
}

export function writeLiveBoardLastGood(
  scope: LiveBoardLastGoodScope,
  page: LiveBoardPage,
): boolean {
  if (
    !scope.sessionKey ||
    !scope.season ||
    page.head.season !== scope.season ||
    page.head.eventId !== scope.eventId ||
    page.head.tournamentId !== scope.tournamentId ||
    page.head.mode !== "CLASSIC"
  ) {
    return false;
  }
  if (!isCompleteLiveBoardPage(page, { firstPage: true })) return false;
  const envelope: StoredLiveBoardLastGood = {
    contractVersion: LIVE_BOARD_CONTRACT_VERSION,
    savedAt: Date.now(),
    scope,
    page,
  };
  try {
    const key = liveBoardLastGoodKey(scope);
    wx.setStorageSync(key, envelope);
    trimLiveBoardLastGoodStorage();
    return true;
  } catch {
    return false;
  }
}

const MAX_LIVE_BOARD_LAST_GOOD_ENTRIES = 8;

function trimLiveBoardLastGoodStorage(): void {
  try {
    const { keys } = wx.getStorageInfoSync();
    const entries = keys
      .filter((key) => key.startsWith(`${LIVE_BOARD_LAST_GOOD_PREFIX}:`))
      .map((key) => {
        const stored = wx.getStorageSync(key) as unknown;
        const savedAt =
          isRecord(stored) && typeof stored.savedAt === "number"
            ? stored.savedAt
            : 0;
        return { key, savedAt };
      })
      .sort((left, right) => right.savedAt - left.savedAt);
    entries.slice(MAX_LIVE_BOARD_LAST_GOOD_ENTRIES).forEach(({ key }) => {
      wx.removeStorageSync(key);
    });
  } catch {}
}

export function clearAllLiveBoardLastGood(): void {
  try {
    const { keys } = wx.getStorageInfoSync();
    keys
      .filter((key) => key.startsWith(`${LIVE_BOARD_LAST_GOOD_PREFIX}:`))
      .forEach((key) => wx.removeStorageSync(key));
  } catch {}
}

export function boardRowsWithViewer(page: LiveBoardPage): LiveBoardRow[] {
  return page.viewerRow &&
    !page.rows.some((row) => row.entry === page.viewerRow?.entry)
    ? [...page.rows, page.viewerRow]
    : page.rows;
}

export function boardRowsToLiveRows(
  page: LiveBoardPage,
  options: { includeViewer?: boolean } = {},
): LiveTournamentRow[] {
  const sourceRows =
    options.includeViewer === false ? page.rows : boardRowsWithViewer(page);
  const readyRows: TournamentLiveGraphQLRow[] = sourceRows
    .filter(
      (row): row is LiveBoardRow & { score: LiveScore } =>
        row.availability === "READY" && row.score !== null,
    )
    .map((row) => ({
      entry: row.entry,
      entryName: row.entryName,
      playerName: row.playerName,
      rank: row.liveRank,
      overallRank: row.overallRank,
      chip: row.chip,
      played: row.played ?? 0,
      toPlay: row.toPlay ?? 0,
      captainName: row.captainName ?? "",
      teamValue: row.teamValue,
      captainPoints: row.captainPoints,
      score: row.score,
    }));
  const mappedReadyRows = mapTournamentLiveRows(readyRows).map((row, index) => ({
    ...row,
    availability: "READY" as const,
    rank: row.rank,
    // The mapped row already prefers score.overallRank (fresher); the raw
    // board value is only the fallback (web liveEntries parity).
    overallRank: row.overallRank ?? readyRows[index]?.overallRank ?? undefined,
  }));
  const missingRows = sourceRows
    .filter((row) => row.availability === "MISSING" && row.score === null)
    .map(
      (row) =>
        ({
          availability: "MISSING" as const,
          entry: row.entry,
          entryName: row.entryName,
          playerName: row.playerName,
          rank: row.liveRank ?? undefined,
          overallRank: row.overallRank ?? undefined,
          teamValue: row.teamValue ?? undefined,
          chip: undefined,
          captainName: undefined,
          captainPoints: undefined,
          played: undefined,
          toPlay: undefined,
          livePoints: undefined,
          liveNetPoints: undefined,
          liveTotalPoints: undefined,
          totalPoints: undefined,
          transferCost: undefined,
          picks: [],
          score: undefined,
        }) satisfies LiveTournamentRow,
    );
  return [...mappedReadyRows, ...missingRows];
}
