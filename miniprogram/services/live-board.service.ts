import type {
  LiveDataAvailability,
  LiveManagerScore,
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

export const LIVE_BOARD_CONTRACT_VERSION = "entry-live-board-v2";
export const LIVE_BOARD_PAGE_SIZE = 20;
export const LIVE_BOARD_LAST_GOOD_PREFIX =
  `${storagePrefixes.liveBoardLastGood}${LIVE_BOARD_CONTRACT_VERSION}`;

export type LiveBoardSort =
  | "EVENT_POINTS"
  | "NET_EVENT_POINTS"
  | "TRANSFER_COST"
  | "PLAYED"
  | "TOTAL_POINTS"
  | "OVERALL_RANK"
  | "TEAM_VALUE"
  | "RANK"
  | "ENTRY_NAME";
export type LiveBoardDirection = "ASC" | "DESC";
export type LiveBoardPickScope = "ANY" | "STARTER" | "BENCH";
export type LiveBoardCaptainMode = "ANY" | "CAPTAIN" | "VICE";
export type ManagerLiveServedFrom = "REDIS" | "POSTGRES" | "MIXED" | "NONE";

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

export interface LiveBoardVariables {
  entryId: number;
  tournamentId: number;
  eventId: number;
  ref?: { season: string; eventId: number; revision: string } | null;
  page?: number;
  pageSize?: number;
  sort?: LiveBoardSort;
  direction?: LiveBoardDirection;
  search?: string | null;
  chips?: string[];
  captainPlayerIds?: number[];
  ownership?: LiveBoardOwnershipFilter | null;
  teamCountRules?: LiveBoardTeamCountRule[];
  expectedBoardRevision?: string | null;
}

export interface LiveBoardRow extends TournamentLiveGraphQLRow {
  rank: number;
  overallRank: number;
  teamValue: number;
  captainId: number;
  captainPoints: number;
  score: LiveManagerScore;
}

export interface LiveBoardPage {
  season: string;
  eventId: number;
  tournamentId: number;
  boardRevision: string;
  playerRevision: string;
  managerRevision: string | null;
  dataAvailability: LiveDataAvailability;
  managerDataAvailability: LiveDataAvailability;
  managerServedFrom: ManagerLiveServedFrom;
  managerRefreshQueued: boolean;
  managerCheckedAt: string | null;
  managerNextRefreshAt: string | null;
  officialCoverage: number;
  unavailableEntryIds: number[];
  failedEntryIds: number[];
  partial: boolean;
  totalEntries: number;
  filteredEntries: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  highestEventPoints: number | null;
  averageEventPoints: number | null;
  rows: LiveBoardRow[];
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
  revision: string;
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
    $ref: LiveRevisionRefInput
    $page: Int
    $pageSize: Int
    $sort: EntryLiveCompetitionBoardSort
    $direction: EntryLiveCompetitionBoardSortDirection
    $search: String
    $chips: [String!]
    $captainPlayerIds: [Int!]
    $ownership: EntryLiveCompetitionOwnershipFilterInput
    $teamCountRules: [EntryLiveCompetitionTeamCountRuleInput!]
    $expectedBoardRevision: String
  ) {
    entryLiveCompetitionBoard(
      entryId: $entryId
      tournamentId: $tournamentId
      eventId: $eventId
      ref: $ref
      page: $page
      pageSize: $pageSize
      sort: $sort
      direction: $direction
      search: $search
      chips: $chips
      captainPlayerIds: $captainPlayerIds
      ownership: $ownership
      teamCountRules: $teamCountRules
      expectedBoardRevision: $expectedBoardRevision
    ) {
      season eventId tournamentId boardRevision playerRevision managerRevision
      dataAvailability managerDataAvailability managerServedFrom managerRefreshQueued
      managerCheckedAt managerNextRefreshAt officialCoverage unavailableEntryIds
      failedEntryIds partial totalEntries filteredEntries page pageSize hasMore
      highestEventPoints averageEventPoints
      rows {
        entry entryName playerName rank overallRank teamValue chip livePoints
        transferCost liveNetPoints liveTotalPoints played toPlay captainId
        captainName captainPoints
        score {
          eventPoints netEventPoints totalPoints totalScope eventRank overallRank leagueRank
          transferCost source state eventPointSemantics revision checkedAt upstreamUpdatedAt
          staleAt nextRefreshAt reconciliation reasonCodes
        }
      }
    }
  }
`;

export const TOURNAMENT_SELECTION_INDEX_QUERY = `
  query GetTournamentSelectionIndex(
    $entryId: Int!
    $tournamentId: Int!
    $ref: LiveRevisionRefInput!
  ) {
    tournamentSelectionIndex(
      entryId: $entryId
      tournamentId: $tournamentId
      ref: $ref
    ) {
      tournamentId eventId revision
      rows { playerId playerName teamId teamName teamShortName position count percentage }
    }
  }
`;

export const TOURNAMENT_ENTRY_SQUADS_QUERY = `
  query GetTournamentEntrySquads(
    $entryId: Int!
    $tournamentId: Int!
    $comparedEntryIds: [Int!]!
    $ref: LiveRevisionRefInput!
  ) {
    tournamentEntrySquads(
      entryId: $entryId
      tournamentId: $tournamentId
      comparedEntryIds: $comparedEntryIds
      ref: $ref
    ) {
      tournamentId eventId revision
      entries {
        entry entryName playerName livePoints liveNetPoints liveTotalPoints transferCost
        played toPlay captainName chip rank overallRank
        score {
          eventPoints netEventPoints totalPoints totalScope eventRank overallRank leagueRank
          transferCost source state eventPointSemantics revision checkedAt upstreamUpdatedAt
          staleAt nextRefreshAt reconciliation reasonCodes
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
  "SCHEDULED",
  "FRESH",
  "LAST_GOOD",
  "FINAL",
  "PARTIAL",
  "UNAVAILABLE",
]);
const SERVED_FROM = new Set(["REDIS", "POSTGRES", "MIXED", "NONE"]);
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
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableDate(value: unknown): value is string | null {
  return value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function validateManagerScore(
  value: unknown,
  path: string,
  missing: string[],
): void {
  if (!isRecord(value)) {
    missing.push(path);
    return;
  }
  for (const field of [
    "eventPoints",
    "netEventPoints",
    "totalPoints",
    "eventRank",
    "overallRank",
    "leagueRank",
  ]) {
    if (!isNullableNumber(value[field])) missing.push(`${path}.${field}`);
  }
  if (!isInteger(value.transferCost)) missing.push(`${path}.transferCost`);
  for (const field of ["source", "state", "eventPointSemantics"]) {
    if (typeof value[field] !== "string") missing.push(`${path}.${field}`);
  }
  for (const field of ["totalScope", "reconciliation"]) {
    if (typeof value[field] !== "string") missing.push(`${path}.${field}`);
  }
  if (!isNullableString(value.revision)) missing.push(`${path}.revision`);
  for (const field of ["checkedAt", "upstreamUpdatedAt", "staleAt", "nextRefreshAt"]) {
    if (!isNullableDate(value[field])) missing.push(`${path}.${field}`);
  }
  if (
    !Array.isArray(value.reasonCodes) ||
    !value.reasonCodes.every((item) => typeof item === "string")
  ) {
    missing.push(`${path}.reasonCodes`);
  }
}

function validateBoardRow(
  value: unknown,
  index: number,
  missing: string[],
): void {
  const path = `rows[${index}]`;
  if (!isRecord(value)) {
    missing.push(path);
    return;
  }
  for (const field of [
    "entry",
    "rank",
    "overallRank",
    "livePoints",
    "transferCost",
    "liveNetPoints",
    "liveTotalPoints",
    "played",
    "toPlay",
    "captainId",
    "captainPoints",
  ]) {
    if (!isInteger(value[field])) missing.push(`${path}.${field}`);
  }
  if (typeof value.teamValue !== "number" || !Number.isFinite(value.teamValue)) {
    missing.push(`${path}.teamValue`);
  }
  for (const field of ["entryName", "playerName", "chip", "captainName"]) {
    if (typeof value[field] !== "string") missing.push(`${path}.${field}`);
  }
  validateManagerScore(value.score, `${path}.score`, missing);
}

export function parseLiveBoardPage(
  value: unknown,
  options: { requestId?: string; durationMs?: number } = {},
): LiveBoardPage {
  const root = isRecord(value) && "entryLiveCompetitionBoard" in value
    ? value.entryLiveCompetitionBoard
    : value;
  if (!isRecord(root)) {
    throw new LiveBoardInvalidResponseError(["entryLiveCompetitionBoard"], options);
  }
  const missing: string[] = [];
  for (const field of ["eventId", "tournamentId", "page", "pageSize"]) {
    if (!isPositiveInteger(root[field])) missing.push(field);
  }
  if (isPositiveInteger(root.pageSize) && root.pageSize > 50) {
    missing.push("pageSize:max");
  }
  for (const field of ["totalEntries", "filteredEntries"]) {
    if (!isNonNegativeInteger(root[field])) missing.push(field);
  }
  if (
    isNonNegativeInteger(root.totalEntries) &&
    isNonNegativeInteger(root.filteredEntries) &&
    root.filteredEntries > root.totalEntries
  ) {
    missing.push("filteredEntries:range");
  }
  for (const field of ["season", "boardRevision", "playerRevision"]) {
    if (typeof root[field] !== "string" || root[field].length === 0) {
      missing.push(field);
    }
  }
  if (!isNullableString(root.managerRevision)) missing.push("managerRevision");
  if (!AVAILABILITY.has(String(root.dataAvailability))) {
    missing.push("dataAvailability");
  }
  if (!AVAILABILITY.has(String(root.managerDataAvailability))) {
    missing.push("managerDataAvailability");
  }
  if (!SERVED_FROM.has(String(root.managerServedFrom))) {
    missing.push("managerServedFrom");
  }
  for (const field of ["managerRefreshQueued", "partial", "hasMore"]) {
    if (typeof root[field] !== "boolean") missing.push(field);
  }
  if (!isNullableDate(root.managerCheckedAt)) missing.push("managerCheckedAt");
  if (!isNullableDate(root.managerNextRefreshAt)) {
    missing.push("managerNextRefreshAt");
  }
  if (typeof root.officialCoverage !== "number" ||
      !Number.isFinite(root.officialCoverage) ||
      root.officialCoverage < 0 ||
      root.officialCoverage > 1) {
    missing.push("officialCoverage");
  }
  if (!isNullableNumber(root.highestEventPoints)) {
    missing.push("highestEventPoints");
  }
  if (!isNullableNumber(root.averageEventPoints)) {
    missing.push("averageEventPoints");
  }
  for (const field of ["unavailableEntryIds", "failedEntryIds"]) {
    if (!Array.isArray(root[field]) || !root[field].every(isPositiveInteger)) {
      missing.push(field);
    }
  }
  if (!Array.isArray(root.rows)) {
    missing.push("rows");
  } else {
    root.rows.forEach((row, index) => validateBoardRow(row, index, missing));
    if (isPositiveInteger(root.pageSize) && root.rows.length > root.pageSize) {
      missing.push("rows.length");
    }
    if (
      isNonNegativeInteger(root.filteredEntries) &&
      root.rows.length > root.filteredEntries
    ) {
      missing.push("rows.filteredEntries");
    }
    const entryIds = root.rows
      .filter(isRecord)
      .map((row) => row.entry)
      .filter(isPositiveInteger);
    if (new Set(entryIds).size !== entryIds.length) {
      missing.push("rows.entry:duplicate");
    }
    if (root.hasMore === true && root.rows.length === 0) {
      missing.push("hasMore:empty-page");
    }
  }
  if (missing.length > 0) {
    throw new LiveBoardInvalidResponseError(missing, options);
  }
  return root as unknown as LiveBoardPage;
}

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof GraphQLTransportError) || !error.transient) return false;
  if (error.statusCode === 429 || error.statusCode === 401 || error.statusCode === 403) {
    return false;
  }
  return error.statusCode === undefined || TRANSIENT_STATUSES.has(error.statusCode);
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
      });
      if (result.errors.length > 0) {
        throw new GraphQLApplicationError(result.errors);
      }
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
  const message = `duration=${error.durationMs}ms missing=${error.missingFields.join(",")}`;
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
    if (page.eventId !== variables.eventId) mismatches.push("eventId:mismatch");
    if (page.tournamentId !== variables.tournamentId) {
      mismatches.push("tournamentId:mismatch");
    }
    if (options.expectedSeason && page.season !== options.expectedSeason) {
      mismatches.push("season:mismatch");
    }
    if (
      variables.expectedBoardRevision &&
      page.boardRevision !== variables.expectedBoardRevision
    ) {
      mismatches.push("boardRevision:mismatch");
    }
    if (page.page !== (variables.page || 1)) mismatches.push("page:mismatch");
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

function graphQLErrorCode(error: GraphQLErrorInfo): string {
  return String(error.extensions?.code || "");
}

export function hasLiveBoardErrorCode(error: unknown, code: string): boolean {
  return error instanceof GraphQLApplicationError &&
    error.errors.some((item) => graphQLErrorCode(item) === code);
}

function validateSelectionIndex(
  value: unknown,
  options: { requestId?: string; durationMs?: number } = {},
): LiveBoardSelectionIndex {
  const root = isRecord(value) && "tournamentSelectionIndex" in value
    ? value.tournamentSelectionIndex
    : value;
  const missing: string[] = [];
  if (!isRecord(root)) {
    throw new LiveBoardInvalidResponseError(["tournamentSelectionIndex"], options);
  }
  if (!isPositiveInteger(root.tournamentId)) missing.push("tournamentId");
  if (!isPositiveInteger(root.eventId)) missing.push("eventId");
  if (typeof root.revision !== "string" || !root.revision) missing.push("revision");
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
      if (typeof value.percentage !== "number" ||
          !Number.isFinite(value.percentage)) {
        missing.push(`${path}.percentage`);
      }
    });
  }
  if (missing.length > 0) throw new LiveBoardInvalidResponseError(missing, options);
  return root as unknown as LiveBoardSelectionIndex;
}

export async function getTournamentSelectionIndex(options: {
  entryId: number;
  tournamentId: number;
  ref: { season: string; eventId: number; revision: string };
  trace?: PageRequestTrace;
}): Promise<LiveBoardSelectionIndex> {
  const startedAt = Date.now();
  const result = await readWithOneTransientRetry<{
    tournamentSelectionIndex: unknown;
  }>(TOURNAMENT_SELECTION_INDEX_QUERY, {
    entryId: options.entryId,
    tournamentId: options.tournamentId,
    ref: options.ref,
  }, { trace: options.trace });
  try {
    const errorOptions = {
      requestId: result.meta.requestId,
      durationMs: Date.now() - startedAt,
    };
    const parsed = validateSelectionIndex(result.data, errorOptions);
    if (parsed.eventId !== options.ref.eventId ||
        parsed.tournamentId !== options.tournamentId ||
        parsed.revision !== options.ref.revision) {
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
  revision: string;
  entries: TournamentLiveGraphQLRow[];
} {
  const root = isRecord(value) && "tournamentEntrySquads" in value
    ? value.tournamentEntrySquads
    : value;
  const missing: string[] = [];
  if (!isRecord(root)) {
    throw new LiveBoardInvalidResponseError(["tournamentEntrySquads"], options);
  }
  if (!isPositiveInteger(root.tournamentId)) missing.push("tournamentId");
  if (!isPositiveInteger(root.eventId)) missing.push("eventId");
  if (typeof root.revision !== "string" || !root.revision) missing.push("revision");
  if (!Array.isArray(root.entries) || root.entries.length < 1 || root.entries.length > 2) {
    missing.push("entries");
  } else {
    root.entries.forEach((entry, index) => {
      const path = `entries[${index}]`;
      if (!isRecord(entry)) {
        missing.push(path);
        return;
      }
      for (const field of [
        "entry",
        "rank",
        "overallRank",
        "livePoints",
        "liveNetPoints",
        "liveTotalPoints",
        "transferCost",
        "played",
        "toPlay",
      ]) {
        if (!isInteger(entry[field])) missing.push(`${path}.${field}`);
      }
      for (const field of ["entryName", "playerName", "captainName", "chip"]) {
        if (typeof entry[field] !== "string") missing.push(`${path}.${field}`);
      }
      validateManagerScore(entry.score, `${path}.score`, missing);
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
        if (!isPositiveInteger(pick.element)) missing.push(`${pickPath}.element`);
        if (typeof pick.webName !== "string") missing.push(`${pickPath}.webName`);
      });
    });
  }
  if (missing.length > 0) throw new LiveBoardInvalidResponseError(missing, options);
  return root as unknown as {
    tournamentId: number;
    eventId: number;
    revision: string;
    entries: TournamentLiveGraphQLRow[];
  };
}

export async function getTournamentEntrySquads(options: {
  entryId: number;
  tournamentId: number;
  comparedEntryIds: number[];
  ref: { season: string; eventId: number; revision: string };
  trace?: PageRequestTrace;
}): Promise<LiveTournamentRow[]> {
  const comparedEntryIds = [...new Set(options.comparedEntryIds)]
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  if (comparedEntryIds.length !== 2) {
    throw new Error("请选择两支球队后再对比");
  }
  const startedAt = Date.now();
  const result = await readWithOneTransientRetry<{
    tournamentEntrySquads: unknown;
  }>(TOURNAMENT_ENTRY_SQUADS_QUERY, {
    entryId: options.entryId,
    tournamentId: options.tournamentId,
    comparedEntryIds,
    ref: options.ref,
  }, { trace: options.trace });
  try {
    const errorOptions = {
      requestId: result.meta.requestId,
      durationMs: Date.now() - startedAt,
    };
    const parsed = validateSquads(result.data, errorOptions);
    const responseIds = new Set(parsed.entries.map((entry) => entry.entry));
    if (parsed.tournamentId !== options.tournamentId ||
        parsed.eventId !== options.ref.eventId ||
        parsed.revision !== options.ref.revision ||
        comparedEntryIds.some((entryId) => !responseIds.has(entryId))) {
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
  return left.sessionKey === right.sessionKey &&
    left.season === right.season &&
    left.eventId === right.eventId &&
    left.entryId === right.entryId &&
    left.tournamentId === right.tournamentId;
}

export function readLiveBoardLastGood(
  scope: LiveBoardLastGoodScope,
): StoredLiveBoardLastGood | null {
  if (!scope.sessionKey || !scope.season) return null;
  try {
    const raw = wx.getStorageSync(liveBoardLastGoodKey(scope)) as unknown;
    if (!isRecord(raw) ||
        raw.contractVersion !== LIVE_BOARD_CONTRACT_VERSION ||
        !isRecord(raw.scope) ||
        !sameScope(raw.scope as unknown as LiveBoardLastGoodScope, scope)) {
      return null;
    }
    const page = parseLiveBoardPage(raw.page);
    if (page.page !== 1 || page.season !== scope.season ||
        page.eventId !== scope.eventId ||
        page.tournamentId !== scope.tournamentId) {
      return null;
    }
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
  if (!scope.sessionKey || !scope.season || page.page !== 1 ||
      page.season !== scope.season || page.eventId !== scope.eventId ||
      page.tournamentId !== scope.tournamentId) {
    return false;
  }
  const envelope: StoredLiveBoardLastGood = {
    contractVersion: LIVE_BOARD_CONTRACT_VERSION,
    savedAt: Date.now(),
    scope,
    page,
  };
  try {
    wx.setStorageSync(liveBoardLastGoodKey(scope), envelope);
    return true;
  } catch {
    return false;
  }
}

export function clearOtherLiveBoardLastGood(keepKey: string): void {
  try {
    const { keys } = wx.getStorageInfoSync();
    keys
      .filter(
        (key) =>
          key.startsWith(`${LIVE_BOARD_LAST_GOOD_PREFIX}:`) && key !== keepKey,
      )
      .forEach((key) => wx.removeStorageSync(key));
  } catch {}
}

export function clearAllLiveBoardLastGood(): void {
  clearOtherLiveBoardLastGood("");
}

export function boardRowsToLiveRows(page: LiveBoardPage): LiveTournamentRow[] {
  return mapTournamentLiveRows(page.rows).map((row, index) => ({
    ...row,
    rank: page.rows[index]?.rank ?? row.rank,
    // The mapped row already prefers score.overallRank (fresher); the raw
    // board value is only the fallback (web liveEntries parity).
    overallRank: row.overallRank ?? page.rows[index]?.overallRank,
  }));
}
