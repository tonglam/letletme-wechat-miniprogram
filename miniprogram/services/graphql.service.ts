import { getGraphQLEndpoint, REQUEST_TIMEOUT_MS } from "../config/env";
import {
  clearSessionCredentialsForAuthRetry,
  getApiSessionToken,
  getMiniProgramDeviceId,
  getPendingSessionRefresh,
  isLogoutInFlight,
  refreshWechatApiSession,
  WechatSessionTransportError,
} from "./auth.service";
import { recordApi, recordPageOperation } from "../utils/perf";
import { recordClientAuthResult } from "./client-telemetry.service";
import type { ApiRecordSource } from "../utils/perf";
import {
  graphQLErrorMessage,
  httpErrorMessage,
  networkErrorMessage,
} from "../utils/request-error";
import {
  initializeNetworkStatus,
  isKnownOffline,
} from "../utils/network-status";
import { getActivePagePerformanceTrace } from "../utils/page-performance";
import {
  getGraphQLCachePolicy,
  getGraphQLWorkload,
  getGraphQLOperationPolicy,
} from "./graphql-cache-policy";
import type {
  GraphQLAuthMode,
  GraphQLCachePolicyName,
  GraphQLWorkload,
} from "./graphql-cache-policy";
import {
  CACHE_VERSION,
  buildGraphQLRequestCacheKey,
  forgetServedFromCache,
  getServedStoredAt,
  getStorageCacheKey,
  hashKey,
  readCacheEntry,
  recordServedFromCache,
  removeCacheEntry,
  writeCacheEntry,
  type CacheEntry,
} from "./graphql-cache";
import { registerGraphQLInFlightClear } from "./graphql-session-hooks";
import { recordBugReportDiagnostic } from "../utils/bug-report-diagnostics";
import {
  GRAPHQL_WORKLOADS,
  getGraphQLCooldownState,
  graphQLCooldownMessage,
  parseRetryAfterSeconds,
  persistGraphQLCooldown,
  showGraphQLCooldownNotice,
} from "./graphql-cooldown";

export {
  buildGraphQLRequestCacheKey,
  purgeGraphQLStorageCache,
} from "./graphql-cache";

export { clearGraphQLMemoryCache } from "./graphql-session-hooks";

export interface GraphQLErrorInfo {
  message?: string;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
  };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorInfo[];
}

export interface GraphQLOptions {
  authMode?: GraphQLAuthMode;
  cachePolicy?: GraphQLCachePolicyName;
  /** Explicit server-side workload when a cache policy is overridden. */
  workload?: GraphQLWorkload;
  cacheTtl?: number;
  staleTtl?: number;
  getCacheExpiry?: (data: unknown) => number;
  forceRefresh?: boolean;
  season?: string;
  cacheVariant?: string;
  trace?: PageRequestTrace | null;
  /** Explicitly map cached data when a stale result is served. */
  mapStaleData?: (data: unknown) => unknown;
  /** Reject a successful response before it is admitted to the cache. */
  validateCacheData?: (data: unknown) => boolean;
  /** Keep the prior authoritative value when a network response fails validation. */
  preserveCacheOnValidationFailure?: boolean;
  /** Explicit consumer contract required by version-gated GraphQL roots. */
  contract?: "my-tournament-review-v2.1";
}

export interface PageRequestTrace {
  navigationId: string;
  callerSurface: string;
  trigger: "load" | "show" | "refresh" | "tab" | "search" | "pagination";
  forceReason?: "user-refresh" | "deadline-crossed" | "context-missing";
  contextRevision: number;
  cacheVariantHash?: string;
}

export interface GraphQLReadMeta {
  operationName: string;
  authMode: GraphQLAuthMode;
  source: ApiRecordSource;
  stale: boolean;
  storedAt?: number;
  cacheAgeMs?: number;
  requestId?: string;
  statusCode?: number;
  rateLimited?: boolean;
  cooldownUntil?: number;
  retryAfterSeconds?: number;
  rateLimitPolicy?: string;
  rateLimitScope?: string;
  rateLimitWorkload?: string;
  durationMs: number;
}

export interface GraphQLReadResult<T> {
  data: T;
  errors: GraphQLErrorInfo[];
  meta: GraphQLReadMeta;
}

class GraphQLInFlightJoin extends Error {
  constructor(readonly request: Promise<GraphQLReadResult<unknown>>) {
    super("joined existing GraphQL request");
    this.name = "GraphQLInFlightJoin";
  }
}

function resolvePageRequestTrace(
  explicitTrace?: PageRequestTrace | null,
): PageRequestTrace | undefined {
  if (explicitTrace === null) return undefined;
  if (explicitTrace) return explicitTrace;
  const activeTrace = getActivePagePerformanceTrace();
  if (!activeTrace) return undefined;

  let contextRevision = 0;
  try {
    const app = getApp() as { globalData?: { contextRevision?: number } };
    contextRevision = Number(app.globalData?.contextRevision) || 0;
  } catch {}

  return {
    navigationId: activeTrace.navigationId,
    callerSurface: activeTrace.route,
    trigger:
      activeTrace.trigger === "refresh"
        ? "refresh"
        : activeTrace.trigger === "warm-enter"
          ? "show"
          : "load",
    contextRevision,
  };
}

export function capturePageRequestTrace(
  overrides: Partial<
    Pick<PageRequestTrace, "callerSurface" | "trigger" | "forceReason">
  > = {},
): PageRequestTrace | undefined {
  const trace = resolvePageRequestTrace();
  return trace ? { ...trace, ...overrides } : undefined;
}

interface ResolvedRequestPolicy {
  operationName: string;
  authMode: GraphQLAuthMode;
  cachePolicy: GraphQLCachePolicyName;
  freshTtl: number;
  emptyFreshTtl?: number;
  staleTtl: number;
  persist: boolean;
  cacheVariant: string;
  cacheable: boolean;
  workload: GraphQLWorkload;
  contract?: "my-tournament-review-v2.1";
}

export class GraphQLTransportError extends Error {
  statusCode?: number;
  code?: string;
  transient: boolean;
  retryAfterSeconds?: number;
  retryAt?: number;
  requestId?: string;
  rateLimitPolicy?: string;
  rateLimitScope?: string;
  rateLimitWorkload?: string;

  constructor(
    message: string,
    transient: boolean,
    statusCode?: number,
    options: {
      code?: string;
      retryAfterSeconds?: number;
      retryAt?: number;
      requestId?: string;
      rateLimitPolicy?: string;
      rateLimitScope?: string;
      rateLimitWorkload?: string;
    } = {},
  ) {
    super(message);
    this.name = "GraphQLTransportError";
    this.transient = transient;
    this.statusCode = statusCode;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.retryAt = options.retryAt;
    this.requestId = options.requestId;
    this.rateLimitPolicy = options.rateLimitPolicy;
    this.rateLimitScope = options.rateLimitScope;
    this.rateLimitWorkload = options.rateLimitWorkload;
  }
}

export class GraphQLApplicationError extends Error {
  readonly errors: GraphQLErrorInfo[];

  constructor(errors: GraphQLErrorInfo[]) {
    super(graphQLErrorMessage(errors));
    this.name = "GraphQLApplicationError";
    this.errors = errors;
  }
}

export function hasGraphQLErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof GraphQLApplicationError &&
    error.errors.some((item) => item.extensions?.code === code)
  );
}

export function hasGraphQLCode(error: unknown, code: string): boolean {
  return (
    hasGraphQLErrorCode(error, code) ||
    (error instanceof GraphQLTransportError && error.code === code)
  );
}

/** Identifies the canonical missing-viewer-entry response on My FPL surfaces. */
export function isViewerEntryAuthorizationError(error: unknown): boolean {
  return hasGraphQLCode(error, "VIEWER_ENTRY_REQUIRED");
}

/** Version-gated review clients must show an upgrade state after hard cutover. */
export function isClientUpgradeRequired(error: unknown): boolean {
  return hasGraphQLCode(error, "CLIENT_UPGRADE_REQUIRED");
}

const SEASON_SCOPED_POLICIES = new Set<GraphQLCachePolicyName>([
  "fixtures",
  "player-picker",
  "team-directory",
  "reporting",
  "historical",
]);

const inFlightRequests = new Map<string, Promise<GraphQLReadResult<unknown>>>();
registerGraphQLInFlightClear(() => {
  inFlightRequests.clear();
});

function extractOpName(query: string): string {
  const match = /(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(query);
  return match ? match[1] : "GraphQL";
}

export function extractGraphQLOperationName(query: string): string {
  return extractOpName(query);
}

export function buildGraphQLRequestPayload(
  query: string,
  variables: Record<string, unknown>,
): {
  query: string;
  variables: Record<string, unknown>;
  operationName: string;
} {
  return {
    query,
    variables,
    operationName: extractOpName(query),
  };
}

function currentSeason(): string {
  try {
    return String(getApp<IAppOption>().globalData.season || "");
  } catch {
    return "";
  }
}

function resolveSeason(
  cachePolicy: GraphQLCachePolicyName,
  options?: GraphQLOptions,
): string {
  if (!SEASON_SCOPED_POLICIES.has(cachePolicy)) return "";
  const explicit = String(options?.season || "").trim();
  if (explicit) return explicit;
  const fromVariant = /(?:^|\|)season:([^|]+)/.exec(
    String(options?.cacheVariant || ""),
  );
  if (fromVariant?.[1]) return fromVariant[1].trim();
  return currentSeason().trim();
}

function resolvePolicy(
  query: string,
  options?: GraphQLOptions,
): ResolvedRequestPolicy {
  const operationName = extractOpName(query);
  const configured = getGraphQLOperationPolicy(operationName);
  const cachePolicy = options?.cachePolicy ?? configured.cachePolicy;
  const policy = getGraphQLCachePolicy(cachePolicy);
  const mutation = /^\s*mutation\b/i.test(query);
  const season = resolveSeason(cachePolicy, options);
  if (SEASON_SCOPED_POLICIES.has(cachePolicy) && !season) {
    throw new Error("赛季信息暂时不可用，请稍后重试");
  }
  const seasonVariant = season ? `season:${season}` : "";
  const contractVariant = options?.contract
    ? `contract:${options.contract}`
    : "";
  const cacheVariant = [
    cachePolicy,
    seasonVariant,
    contractVariant,
    options?.cacheVariant || "",
  ]
    .filter(Boolean)
    .join("|");
  const freshTtl = mutation
    ? 0
    : Math.max(0, options?.cacheTtl ?? policy.freshTtl);
  const staleTtl = mutation
    ? 0
    : Math.max(0, options?.staleTtl ?? policy.staleTtl);

  return {
    operationName,
    authMode: options?.authMode ?? configured.authMode,
    cachePolicy,
    freshTtl,
    emptyFreshTtl: mutation ? undefined : policy.emptyFreshTtl,
    staleTtl,
    persist: !mutation && policy.persist,
    cacheVariant,
    cacheable: !mutation && (freshTtl > 0 || Boolean(options?.getCacheExpiry)),
    workload:
      options?.workload ?? getGraphQLWorkload(operationName, cachePolicy),
    contract: options?.contract,
  };
}

function cacheAgeBucket(storedAt: number | undefined): string | undefined {
  if (!storedAt) return undefined;
  const age = Math.max(0, Date.now() - storedAt);
  if (age < 10 * 1000) return "<10s";
  if (age < 60 * 1000) return "10s-1m";
  if (age < 5 * 60 * 1000) return "1-5m";
  if (age < 30 * 60 * 1000) return "5-30m";
  if (age < 6 * 60 * 60 * 1000) return "30m-6h";
  return ">6h";
}

function recordRequest(
  operationName: string,
  startedAt: number,
  ok: boolean,
  source: ApiRecordSource,
  networkAttempted: boolean,
  storedAt?: number,
  trace?: PageRequestTrace,
  cacheVariantHash?: string,
  requestId?: string,
  details?: {
    code?: string;
    status?: number;
    retryAfterSeconds?: number;
    rateLimitPolicy?: string;
    rateLimitScope?: string;
    workload?: string;
  },
): void {
  recordApi(operationName, Date.now() - startedAt, ok, {
    operationName,
    source,
    networkAttempted,
    cacheAgeBucket: cacheAgeBucket(storedAt),
    callerSurface: trace?.callerSurface,
    trigger: trace?.trigger,
    forceReason: trace?.forceReason,
    contextRevision: trace?.contextRevision,
    cacheVariantHash: trace?.cacheVariantHash || cacheVariantHash,
    requestId,
    statusCode: details?.status,
    code: details?.code,
  });
  if (requestId || !ok) {
    recordBugReportDiagnostic({
      at: new Date().toISOString(),
      requestId,
      operation: operationName,
      message: ok ? undefined : source,
      code: details?.code,
      status: details?.status,
      retryAfterSeconds: details?.retryAfterSeconds,
      rateLimitPolicy: details?.rateLimitPolicy,
      rateLimitScope: details?.rateLimitScope,
      workload: details?.workload,
    });
  }
}

export function isTransientGraphQLStatus(statusCode: number): boolean {
  return (
    statusCode === 429 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504
  );
}

function isTransientFailure(error: unknown): boolean {
  return error instanceof GraphQLTransportError && error.transient;
}

function rethrowSessionRefreshFailure(error: unknown): never {
  if (error instanceof WechatSessionTransportError) {
    // Auth-refresh throttling is not a GraphQL ingress 429 and must not start
    // the global GraphQL cooldown. It remains a transient transport failure so
    // an already captured stale GraphQL result can be served safely.
    throw new GraphQLTransportError(error.message, true);
  }
  throw error;
}

function responseHeader(
  headers: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const key = Object.keys(headers || {}).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  if (!key) return undefined;
  const value = headers?.[key];
  return value === undefined || value === null ? undefined : String(value);
}

function responseErrorCode(
  body: GraphQLResponse<unknown> | undefined,
): string | undefined {
  return body?.errors?.find(
    (error) => typeof error.extensions?.code === "string",
  )?.extensions?.code;
}

function toHttpError(
  statusCode: number,
  headers: Record<string, unknown> | undefined,
  body?: GraphQLResponse<unknown>,
  now = Date.now(),
): GraphQLTransportError {
  const requestId = responseHeader(headers, "x-request-id");
  const code =
    responseErrorCode(body) ||
    (statusCode === 429 ? "RATE_LIMITED" : undefined);
  const rateLimitPolicy = responseHeader(headers, "x-ratelimit-policy");
  const rateLimitScope = responseHeader(headers, "x-ratelimit-scope");
  const rawRateLimitWorkload = responseHeader(headers, "x-ratelimit-workload");
  const rateLimitWorkload =
    rawRateLimitWorkload &&
    GRAPHQL_WORKLOADS.includes(
      rawRateLimitWorkload as (typeof GRAPHQL_WORKLOADS)[number],
    )
      ? rawRateLimitWorkload
      : undefined;
  if (statusCode === 429) {
    const retryAfterSeconds = parseRetryAfterSeconds(
      responseHeader(headers, "retry-after"),
      now,
    );
    const state = persistGraphQLCooldown(
      retryAfterSeconds,
      now,
      rateLimitScope === "workload"
        ? (rateLimitWorkload as GraphQLWorkload | undefined)
        : undefined,
    );
    const retryAt = state.cooldownUntil ?? now + retryAfterSeconds * 1000;
    return new GraphQLTransportError(
      graphQLCooldownMessage(state, false),
      true,
      statusCode,
      {
        code,
        retryAfterSeconds,
        retryAt,
        requestId,
        rateLimitPolicy,
        rateLimitScope,
        rateLimitWorkload,
      },
    );
  }
  return new GraphQLTransportError(
    code === "VIEWER_ENTRY_REQUIRED"
      ? "请先选择我的球队"
      : code === "CLIENT_UPGRADE_REQUIRED"
        ? "当前版本不支持赛事复盘，请升级小程序后继续"
        : httpErrorMessage(statusCode),
    isTransientGraphQLStatus(statusCode),
    statusCode,
    { code, requestId, rateLimitPolicy, rateLimitScope, rateLimitWorkload },
  );
}

function isUnauthenticated(
  body: GraphQLResponse<unknown> | undefined,
): boolean {
  return Boolean(
    body?.errors?.some((error) => error.extensions?.code === "UNAUTHENTICATED"),
  );
}

export function buildGraphQLRequestHeaders(
  authMode: GraphQLAuthMode,
  token: string | null,
  deviceId: string,
  contract?: "my-tournament-review-v2.1",
): Record<string, string> {
  const header: Record<string, string> = {
    "content-type": "application/json",
    "X-Letletme-Client": "wechat-miniprogram",
    "X-Letletme-Device-Id": deviceId,
  };
  if (authMode === "session" && token) {
    header.Authorization = `Bearer ${token}`;
  }
  if (contract) header["X-LetLetMe-Contract"] = contract;
  return header;
}

export const LIVE_MATCHES_CONTRACT_VERSION = "live-matches-v3";
export const LIVE_POINTS_CONTRACT_VERSION = "live-points-v2";

export const LIVE_POINTS_V2_ROOT_FIELDS = [
  "calcLivePointsByEntry",
  "calcLivePointsForEntries",
  "liveScores",
  "playerLive",
  "eventLive",
  "eventLiveExplain",
  "eventLiveExplains",
  "liveSnapshot",
  "liveContext",
  "entryLiveCompetitionBoard",
  "leagueLiveHead",
  "tournamentOfficialH2H",
  "tournamentOfficialH2HHistory",
  "tournamentSelectionIndex",
  "tournamentEntrySquads",
  "tournamentDetailDesk",
  "gameweekDesk",
  "homeGameweek",
] as const;

const LIVE_POINTS_V2_ROOT_FIELD_PATTERN = new RegExp(
  `\\b(?:${LIVE_POINTS_V2_ROOT_FIELDS.join("|")})\\s*(?:\\(|\\{)`,
);

/** Every Live Points operation is hard-gated to the V2 contract. */
export function isLivePointsV2Query(query: string): boolean {
  return LIVE_POINTS_V2_ROOT_FIELD_PATTERN.test(query);
}

export function isLiveMatchesV3Query(query: string): boolean {
  return /\bliveMatchday\s*(?:\(|\{)/.test(query);
}

export function liveContractVersionForQuery(query: string): string | null {
  const matches = isLiveMatchesV3Query(query);
  const points = isLivePointsV2Query(query);
  if (matches && points) {
    throw new Error("LIVE_CONTRACT_MIXED_OPERATION");
  }
  if (matches) return LIVE_MATCHES_CONTRACT_VERSION;
  if (points) return LIVE_POINTS_CONTRACT_VERSION;
  return null;
}

function makeRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  operationName: string,
  authMode: GraphQLAuthMode,
  workload: GraphQLWorkload,
  contract: "my-tournament-review-v2.1" | undefined,
  retryOnUnauthorized = true,
  token = authMode === "session" ? getApiSessionToken() : null,
  onNetworkAttempt?: () => void,
  onSessionRetry?: (
    token: string,
  ) => Promise<GraphQLReadResult<unknown>> | undefined,
): Promise<{
  body: GraphQLResponse<T>;
  token: string | null;
  requestId?: string;
  statusCode: number;
}> {
  const cooldown = getGraphQLCooldownState(Date.now(), workload);
  if (cooldown.active) {
    return Promise.reject(
      new GraphQLTransportError(
        graphQLCooldownMessage(cooldown, false),
        true,
        429,
        {
          retryAfterSeconds: cooldown.remainingSeconds,
          retryAt: cooldown.cooldownUntil,
          rateLimitScope: cooldown.workload ? "workload" : undefined,
          rateLimitWorkload: cooldown.workload,
        },
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const header = buildGraphQLRequestHeaders(
      authMode,
      token,
      getMiniProgramDeviceId(),
      contract,
    );
    const liveContractVersion = liveContractVersionForQuery(query);
    if (liveContractVersion) {
      header["X-LetLetMe-Contract"] = liveContractVersion;
    }

    onNetworkAttempt?.();
    wx.request<GraphQLResponse<T>>({
      url: getGraphQLEndpoint(),
      method: "POST",
      data: buildGraphQLRequestPayload(query, variables),
      header,
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        const body = response.data;
        const unauthorized =
          response.statusCode === 401 || isUnauthenticated(body);
        if (unauthorized) recordClientAuthResult("auth_error");

        if (authMode === "session" && unauthorized && retryOnUnauthorized) {
          if (isLogoutInFlight()) {
            reject(new Error("正在退出登录，请稍后重试"));
            return;
          }

          const currentToken = getApiSessionToken();
          if (currentToken && currentToken !== token) {
            const existingRequest = onSessionRetry?.(currentToken);
            if (existingRequest) {
              reject(new GraphQLInFlightJoin(existingRequest));
              return;
            }
            makeRequest<T>(
              query,
              variables,
              operationName,
              authMode,
              workload,
              contract,
              false,
              currentToken,
              onNetworkAttempt,
              onSessionRetry,
            )
              .then(resolve)
              .catch(reject);
            return;
          }

          const retryWithRefreshedSession = () => {
            const freshToken = getApiSessionToken();
            if (!freshToken) {
              throw new Error("登录状态刷新失败，请重新登录");
            }
            const existingRequest = onSessionRetry?.(freshToken);
            if (existingRequest) {
              throw new GraphQLInFlightJoin(existingRequest);
            }
            return makeRequest<T>(
              query,
              variables,
              operationName,
              authMode,
              workload,
              contract,
              false,
              freshToken,
              onNetworkAttempt,
              onSessionRetry,
            );
          };

          const pending = getPendingSessionRefresh();
          if (pending) {
            pending
              .catch(rethrowSessionRefreshFailure)
              .then(retryWithRefreshedSession)
              .then(resolve)
              .catch(reject);
            return;
          }

          clearSessionCredentialsForAuthRetry();
          refreshWechatApiSession("graphql_401")
            .catch(rethrowSessionRefreshFailure)
            .then(retryWithRefreshedSession)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(
            toHttpError(
              response.statusCode,
              response.header as Record<string, unknown> | undefined,
              body,
            ),
          );
          return;
        }

        if (!body || (body.data === undefined && !body.errors?.length)) {
          reject(new GraphQLTransportError("数据加载失败，请稍后重试", false));
          return;
        }

        const requestId = responseHeader(
          response.header as Record<string, unknown> | undefined,
          "x-request-id",
        );
        resolve({ body, token, requestId, statusCode: response.statusCode });
      },
      fail(error) {
        reject(new GraphQLTransportError(networkErrorMessage(error), true));
      },
    });
  });
}

function requestIdentity(
  query: string,
  variables: Record<string, unknown>,
  policy: ResolvedRequestPolicy,
  token: string | null,
): { requestKey: string; cacheKey: string } {
  const cacheToken = policy.authMode === "session" ? token : null;
  const requestKey = buildGraphQLRequestCacheKey(
    query,
    variables,
    cacheToken,
    policy.cacheVariant,
  );
  return {
    requestKey,
    cacheKey: getStorageCacheKey(requestKey, policy.authMode),
  };
}

export function getServedCacheStoredAt(
  query: string,
  variables: Record<string, unknown>,
  options?: GraphQLOptions,
): number | undefined {
  const policy = resolvePolicy(query, options);
  const token = policy.authMode === "session" ? getApiSessionToken() : null;
  const { requestKey } = requestIdentity(query, variables, policy, token);
  return getServedStoredAt(requestKey);
}

function resolveFreshUntil(
  data: unknown,
  policy: ResolvedRequestPolicy,
  options?: GraphQLOptions,
): number {
  if (options?.getCacheExpiry) {
    try {
      const dynamicExpiry = Number(options.getCacheExpiry(data));
      if (Number.isFinite(dynamicExpiry)) return dynamicExpiry;
    } catch {}
  }
  if (policy.emptyFreshTtl !== undefined && hasEmptyItemsPayload(data)) {
    return Date.now() + policy.emptyFreshTtl;
  }
  return Date.now() + policy.freshTtl;
}

function hasEmptyItemsPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return Object.keys(record).some((key) => {
    const payload = record[key];
    if (!payload || typeof payload !== "object") return false;
    const items = (payload as { items?: unknown }).items;
    return Array.isArray(items) && items.length === 0;
  });
}

/** Cache only authoritative contract results; transient/degraded states must be retried. */
export function shouldCacheGraphQLData(
  operationName: string,
  data: unknown,
): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }
  if (operationName === "EntryLookup") {
    const lookup = (data as { entryLookup?: Record<string, unknown> })
      .entryLookup;
    return Boolean(
      lookup &&
      lookup.status === "FOUND" &&
      lookup.entry != null &&
      lookup.source === "DATABASE" &&
      lookup.persistenceState === "NOT_REQUIRED",
    );
  }
  if (operationName === "PlayerDetail") {
    const detail = (
      data as {
        playerDetail?: {
          dataAvailability?: { isFullyAuthoritative?: unknown };
        } | null;
      }
    ).playerDetail;
    return (
      detail == null || detail.dataAvailability?.isFullyAuthoritative === true
    );
  }
  if (operationName === "MyTournamentReviewCatalog") {
    const catalog = (
      data as {
        myTournamentReviewCatalog?: {
          state?: unknown;
          edges?: Array<{ node?: { state?: unknown } }>;
        } | null;
      }
    ).myTournamentReviewCatalog;
    return Boolean(
      catalog?.state === "READY" &&
      Array.isArray(catalog.edges) &&
      catalog.edges.every((edge) => edge.node?.state === "READY"),
    );
  }
  if (operationName === "MyTournamentGameweekReview") {
    return (
      (
        data as {
          myTournamentGameweekReview?: { state?: unknown } | null;
        }
      ).myTournamentGameweekReview?.state === "READY"
    );
  }
  if (operationName === "MyTournamentSeasonReview") {
    const review = (
      data as {
        myTournamentSeasonReview?: {
          state?: unknown;
          phases?: Array<{
            state?: unknown;
            revision?: unknown;
            semanticSha256?: unknown;
          }>;
        } | null;
      }
    ).myTournamentSeasonReview;
    return (
      review?.state === "READY" &&
      Array.isArray(review.phases) &&
      review.phases.every(
        (phase) =>
          phase.state === "READY" &&
          typeof phase.revision === "string" &&
          phase.revision.length > 0 &&
          typeof phase.semanticSha256 === "string" &&
          phase.semanticSha256.length > 0,
      )
    );
  }
  if (operationName === "MyTournamentSeasonReviewSection") {
    return (
      (
        data as {
          myTournamentSeasonReviewSection?: { state?: unknown } | null;
        }
      ).myTournamentSeasonReviewSection?.state === "READY"
    );
  }
  return true;
}

export async function graphqlRead<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options?: GraphQLOptions,
): Promise<GraphQLReadResult<T>> {
  const startedAt = Date.now();
  const policy = resolvePolicy(query, options);
  const cacheVariantHash = hashKey(policy.cacheVariant);
  const trace = resolvePageRequestTrace(options?.trace);
  if (trace) recordPageOperation(trace.navigationId, "logical");
  let token = policy.authMode === "session" ? getApiSessionToken() : null;

  if (policy.authMode === "session" && !token) {
    const pending = getPendingSessionRefresh();
    if (pending) {
      await pending.catch(() => undefined);
      token = getApiSessionToken();
    }
  }

  const identity = requestIdentity(query, variables, policy, token);
  let cached = policy.cacheable
    ? readCacheEntry(identity.cacheKey, identity.requestKey)
    : undefined;
  const now = Date.now();

  // Cache identity/integrity validators apply to reads as well as network
  // responses.  A viewer-scoped response can outlive the local follow
  // binding, so never return a fresh or stale candidate until the caller has
  // confirmed that it still belongs to the current authority.  Evict the
  // complete entry before continuing so a rate-limit/offline fallback cannot
  // re-use the rejected payload.
  if (cached && options?.validateCacheData) {
    let cacheValid = false;
    try {
      cacheValid = options.validateCacheData(cached.entry.data);
    } catch {
      cacheValid = false;
    }
    if (!cacheValid) {
      removeCacheEntry(identity.cacheKey, identity.requestKey);
      cached = undefined;
    }
  }

  if (cached && !options?.forceRefresh && now < cached.entry.freshUntil) {
    recordServedFromCache(identity.requestKey, cached.entry.storedAt);
    recordRequest(
      policy.operationName,
      startedAt,
      true,
      cached.source,
      false,
      cached.entry.storedAt,
      trace,
      cacheVariantHash,
    );
    return {
      data: cached.entry.data as T,
      errors: [],
      meta: {
        operationName: policy.operationName,
        authMode: policy.authMode,
        source: cached.source,
        stale: false,
        storedAt: cached.entry.storedAt,
        cacheAgeMs: Math.max(0, Date.now() - cached.entry.storedAt),
        durationMs: Date.now() - startedAt,
      },
    };
  }

  const staleCandidate =
    cached && now < cached.entry.staleUntil ? cached.entry : undefined;

  const joinInFlight = async (
    inFlight: Promise<GraphQLReadResult<T>>,
  ): Promise<GraphQLReadResult<T>> => {
    try {
      const result = await inFlight;
      recordRequest(
        policy.operationName,
        startedAt,
        result.errors.length === 0,
        "in-flight",
        false,
        result.meta.storedAt,
        trace,
        cacheVariantHash,
        result.meta.requestId,
        {
          status: result.meta.statusCode,
          retryAfterSeconds: result.meta.retryAfterSeconds,
          rateLimitPolicy: result.meta.rateLimitPolicy,
          rateLimitScope: result.meta.rateLimitScope,
          workload: result.meta.rateLimitWorkload,
        },
      );
      return {
        ...result,
        meta: {
          ...result.meta,
          source: "in-flight",
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      recordRequest(
        policy.operationName,
        startedAt,
        false,
        "in-flight",
        false,
        undefined,
        trace,
        cacheVariantHash,
        error instanceof GraphQLTransportError ? error.requestId : undefined,
        error instanceof GraphQLTransportError
          ? {
              code: error.code,
              status: error.statusCode,
              retryAfterSeconds: error.retryAfterSeconds,
              rateLimitPolicy: error.rateLimitPolicy,
              rateLimitScope: error.rateLimitScope,
              workload: error.rateLimitWorkload,
            }
          : undefined,
      );
      throw error;
    }
  };

  const existingInFlight = inFlightRequests.get(identity.requestKey) as
    Promise<GraphQLReadResult<T>> | undefined;

  if (existingInFlight) {
    // Joining an identical request starts no new network traffic, so it remains
    // safe even if another operation established the global cooldown.
    return joinInFlight(existingInFlight);
  }

  const cooldown = getGraphQLCooldownState(now, policy.workload);
  if (cooldown.active) {
    if (staleCandidate) {
      showGraphQLCooldownNotice(cooldown, true);
      recordServedFromCache(identity.requestKey, staleCandidate.storedAt);
      recordRequest(
        policy.operationName,
        startedAt,
        false,
        "stale",
        false,
        staleCandidate.storedAt,
        trace,
        cacheVariantHash,
        undefined,
        {
          code: "RATE_LIMITED",
          status: 429,
          retryAfterSeconds: cooldown.remainingSeconds,
          rateLimitScope: cooldown.workload ? "workload" : "global",
          workload: cooldown.workload,
        },
      );
      return {
        data: staleCandidate.data as T,
        errors: [],
        meta: {
          operationName: policy.operationName,
          authMode: policy.authMode,
          source: "stale",
          stale: true,
          storedAt: staleCandidate.storedAt,
          cacheAgeMs: Math.max(0, now - staleCandidate.storedAt),
          rateLimited: true,
          cooldownUntil: cooldown.cooldownUntil,
          retryAfterSeconds: cooldown.remainingSeconds,
          statusCode: 429,
          rateLimitScope: cooldown.workload ? "workload" : "global",
          rateLimitWorkload: cooldown.workload,
          durationMs: Date.now() - startedAt,
        },
      };
    }

    recordRequest(
      policy.operationName,
      startedAt,
      false,
      "network",
      false,
      undefined,
      trace,
      cacheVariantHash,
      undefined,
      {
        code: "RATE_LIMITED",
        status: 429,
        retryAfterSeconds: cooldown.remainingSeconds,
        rateLimitScope: cooldown.workload ? "workload" : "global",
        workload: cooldown.workload,
      },
    );
    throw new GraphQLTransportError(
      graphQLCooldownMessage(cooldown, false),
      true,
      429,
      {
        retryAfterSeconds: cooldown.remainingSeconds,
        retryAt: cooldown.cooldownUntil,
        rateLimitScope: cooldown.workload ? "workload" : undefined,
        rateLimitWorkload: cooldown.workload,
      },
    );
  }

  await initializeNetworkStatus();
  if (isKnownOffline()) {
    if (staleCandidate) {
      recordServedFromCache(identity.requestKey, staleCandidate.storedAt);
      recordRequest(
        policy.operationName,
        startedAt,
        false,
        "stale",
        false,
        staleCandidate.storedAt,
        trace,
        cacheVariantHash,
      );
      return {
        data: staleCandidate.data as T,
        errors: [],
        meta: {
          operationName: policy.operationName,
          authMode: policy.authMode,
          source: "stale",
          stale: true,
          storedAt: staleCandidate.storedAt,
          cacheAgeMs: Math.max(0, Date.now() - staleCandidate.storedAt),
          durationMs: Date.now() - startedAt,
        },
      };
    }
    recordRequest(
      policy.operationName,
      startedAt,
      false,
      "network",
      false,
      undefined,
      trace,
      cacheVariantHash,
    );
    throw new GraphQLTransportError("当前处于离线状态，请检查网络后重试", true);
  }

  // initializeNetworkStatus can yield. Re-check so callers that crossed that
  // probe still join the request that won the race instead of issuing a second
  // POST after the cooldown/in-flight gate.
  const racedInFlight = inFlightRequests.get(identity.requestKey) as
    Promise<GraphQLReadResult<T>> | undefined;
  if (racedInFlight) return joinInFlight(racedInFlight);

  let inFlightRequest: Promise<GraphQLReadResult<unknown>> | null = null;
  const inFlightKeys = new Set<string>();
  const pendingRetryKeys = new Set<string>();
  const registerInFlightKey = (
    requestKey: string,
  ): Promise<GraphQLReadResult<unknown>> | undefined => {
    const existing = inFlightRequests.get(requestKey);
    if (existing && existing !== inFlightRequest) return existing;
    if (!inFlightRequest) {
      pendingRetryKeys.add(requestKey);
      return undefined;
    }
    inFlightRequests.set(requestKey, inFlightRequest);
    inFlightKeys.add(requestKey);
    return undefined;
  };
  const registerSessionRetry = (retryToken: string) => {
    return registerInFlightKey(
      requestIdentity(query, variables, policy, retryToken).requestKey,
    );
  };

  const networkRequest = (async (): Promise<GraphQLReadResult<T>> => {
    let networkAttempted = false;
    try {
      const response = await makeRequest<T>(
        query,
        variables,
        policy.operationName,
        policy.authMode,
        policy.workload,
        policy.contract,
        true,
        token,
        () => {
          networkAttempted = true;
          if (trace) recordPageOperation(trace.navigationId, "network");
        },
        registerSessionRetry,
      );
      const errors = response.body.errors || [];
      const hasData =
        response.body.data !== undefined && response.body.data !== null;

      if (!hasData) {
        throw new GraphQLApplicationError(errors);
      }

      const storedAt = Date.now();
      const responseIdentity = requestIdentity(
        query,
        variables,
        policy,
        response.token,
      );

      if (errors.length === 0 && policy.cacheable) {
        const producingSessionStillActive =
          policy.authMode === "public" ||
          response.token === getApiSessionToken();
        let cacheableData = shouldCacheGraphQLData(
          policy.operationName,
          response.body.data,
        );
        let cacheValidationFailed = false;
        if (cacheableData && options?.validateCacheData) {
          try {
            cacheableData = options.validateCacheData(response.body.data);
            cacheValidationFailed = !cacheableData;
          } catch {
            // A failed identity/integrity check must never admit the response.
            cacheableData = false;
            cacheValidationFailed = true;
          }
        }

        if (producingSessionStillActive && cacheableData) {
          const freshUntil = resolveFreshUntil(
            response.body.data,
            policy,
            options,
          );
          const entry: CacheEntry = {
            version: CACHE_VERSION,
            requestKey: responseIdentity.requestKey,
            data: response.body.data,
            freshUntil,
            staleUntil: Math.max(freshUntil, freshUntil + policy.staleTtl),
            storedAt,
          };
          writeCacheEntry(responseIdentity.cacheKey, entry, policy.persist);
          forgetServedFromCache(responseIdentity.requestKey);
        } else if (
          producingSessionStillActive &&
          !cacheableData &&
          !(cacheValidationFailed && options?.preserveCacheOnValidationFailure)
        ) {
          // A successful response that cannot be shared is authoritative about
          // freshness: remove any older good value so the next read cannot
          // present it as current. The non-authoritative response stays
          // request-scoped.
          removeCacheEntry(
            responseIdentity.cacheKey,
            responseIdentity.requestKey,
          );
        }
      }

      recordRequest(
        policy.operationName,
        startedAt,
        errors.length === 0,
        "network",
        networkAttempted,
        undefined,
        trace,
        cacheVariantHash,
        response.requestId,
        { status: response.statusCode },
      );
      return {
        data: response.body.data as T,
        errors,
        meta: {
          operationName: policy.operationName,
          authMode: policy.authMode,
          source: "network",
          stale: false,
          storedAt,
          cacheAgeMs: 0,
          requestId: response.requestId,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      if (error instanceof GraphQLInFlightJoin) {
        return joinInFlight(error.request as Promise<GraphQLReadResult<T>>);
      }
      if (staleCandidate && isTransientFailure(error)) {
        const transportError =
          error instanceof GraphQLTransportError ? error : undefined;
        const rateLimited = transportError?.statusCode === 429;
        if (rateLimited) {
          showGraphQLCooldownNotice(
            getGraphQLCooldownState(Date.now(), policy.workload),
            true,
          );
        }
        recordServedFromCache(identity.requestKey, staleCandidate.storedAt);
        recordRequest(
          policy.operationName,
          startedAt,
          false,
          "stale",
          networkAttempted,
          staleCandidate.storedAt,
          trace,
          cacheVariantHash,
          transportError?.requestId,
          transportError
            ? {
                code: transportError.code,
                status: transportError.statusCode,
                retryAfterSeconds: transportError.retryAfterSeconds,
                rateLimitPolicy: transportError.rateLimitPolicy,
                rateLimitScope: transportError.rateLimitScope,
                workload: transportError.rateLimitWorkload,
              }
            : undefined,
        );
        return {
          data: staleCandidate.data as T,
          errors: [],
          meta: {
            operationName: policy.operationName,
            authMode: policy.authMode,
            source: "stale",
            stale: true,
            storedAt: staleCandidate.storedAt,
            cacheAgeMs: Math.max(0, Date.now() - staleCandidate.storedAt),
            requestId: transportError?.requestId,
            rateLimited,
            cooldownUntil: rateLimited ? transportError?.retryAt : undefined,
            retryAfterSeconds: rateLimited
              ? transportError?.retryAfterSeconds
              : undefined,
            statusCode: transportError?.statusCode,
            rateLimitPolicy: transportError?.rateLimitPolicy,
            rateLimitScope: transportError?.rateLimitScope,
            rateLimitWorkload: transportError?.rateLimitWorkload,
            durationMs: Date.now() - startedAt,
          },
        };
      }

      if (error instanceof GraphQLTransportError && error.statusCode === 429) {
        showGraphQLCooldownNotice(
          getGraphQLCooldownState(Date.now(), policy.workload),
          false,
        );
      }

      recordRequest(
        policy.operationName,
        startedAt,
        false,
        "network",
        networkAttempted,
        undefined,
        trace,
        cacheVariantHash,
        error instanceof GraphQLTransportError ? error.requestId : undefined,
        error instanceof GraphQLTransportError
          ? {
              code: error.code,
              status: error.statusCode,
              retryAfterSeconds: error.retryAfterSeconds,
              rateLimitPolicy: error.rateLimitPolicy,
              rateLimitScope: error.rateLimitScope,
              workload: error.rateLimitWorkload,
            }
          : undefined,
      );
      throw error;
    }
  })();

  inFlightRequest = networkRequest as Promise<GraphQLReadResult<unknown>>;
  inFlightRequests.set(identity.requestKey, inFlightRequest);
  inFlightKeys.add(identity.requestKey);
  for (const requestKey of pendingRetryKeys) {
    registerInFlightKey(requestKey);
  }
  const clearSettledInFlight = () => {
    for (const requestKey of inFlightKeys) {
      if (inFlightRequests.get(requestKey) === inFlightRequest) {
        inFlightRequests.delete(requestKey);
      }
    }
  };
  void networkRequest.then(clearSettledInFlight, clearSettledInFlight);
  return networkRequest;
}

export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options?: GraphQLOptions,
): Promise<T> {
  const result = await graphqlRead<T>(query, variables, options);
  if (result.errors.length > 0) {
    throw new GraphQLApplicationError(result.errors);
  }
  if (result.meta.stale && options?.mapStaleData) {
    return options.mapStaleData(result.data) as T;
  }
  return result.data;
}
