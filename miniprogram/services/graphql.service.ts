import { getGraphQLEndpoint, REQUEST_TIMEOUT_MS } from "../config/env";
import {
  clearSessionCredentials,
  getApiSessionToken,
  getPendingSessionRefresh,
  isLogoutInFlight,
  refreshWechatApiSession
} from "./auth.service";
import { recordApi, recordPageOperation } from "../utils/perf";
import type { ApiRecordSource } from "../utils/perf";
import {
  graphQLErrorMessage,
  httpErrorMessage,
  networkErrorMessage
} from "../utils/request-error";
import { initializeNetworkStatus, isKnownOffline } from "../utils/network-status";
import { getActivePagePerformanceTrace } from "../utils/page-performance";
import {
  getGraphQLCachePolicy,
  getGraphQLOperationPolicy
} from "./graphql-cache-policy";
import type {
  GraphQLAuthMode,
  GraphQLCachePolicyName
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
  writeCacheEntry,
  type CacheEntry
} from "./graphql-cache";
import { registerGraphQLInFlightClear } from "./graphql-session-hooks";
import { recordBugReportDiagnostic } from "../utils/bug-report-diagnostics";

export {
  buildGraphQLRequestCacheKey,
  purgeGraphQLStorageCache
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
  cacheTtl?: number;
  staleTtl?: number;
  getCacheExpiry?: (data: unknown) => number;
  forceRefresh?: boolean;
  season?: string;
  cacheVariant?: string;
  trace?: PageRequestTrace | null;
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
  durationMs: number;
}

export interface GraphQLReadResult<T> {
  data: T;
  errors: GraphQLErrorInfo[];
  meta: GraphQLReadMeta;
}

function resolvePageRequestTrace(
  explicitTrace?: PageRequestTrace | null
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
    trigger: activeTrace.trigger === "refresh"
      ? "refresh"
      : activeTrace.trigger === "warm-enter"
        ? "show"
        : "load",
    contextRevision
  };
}

export function capturePageRequestTrace(
  overrides: Partial<Pick<PageRequestTrace, "callerSurface" | "trigger" | "forceReason">> = {}
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
}

class GraphQLTransportError extends Error {
  statusCode?: number;
  transient: boolean;

  constructor(message: string, transient: boolean, statusCode?: number) {
    super(message);
    this.name = "GraphQLTransportError";
    this.transient = transient;
    this.statusCode = statusCode;
  }
}

class GraphQLApplicationError extends Error {
  constructor(errors: GraphQLErrorInfo[]) {
    super(graphQLErrorMessage(errors));
    this.name = "GraphQLApplicationError";
  }
}

const SEASON_SCOPED_POLICIES = new Set<GraphQLCachePolicyName>([
  "fixtures",
  "player-picker",
  "team-directory",
  "reporting",
  "historical"
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
  variables: Record<string, unknown>
): { query: string; variables: Record<string, unknown>; operationName: string } {
  return {
    query,
    variables,
    operationName: extractOpName(query)
  };
}

function currentSeason(): string {
  try {
    return String(getApp<IAppOption>().globalData.season || "");
  } catch {
    return "";
  }
}

function resolveSeason(cachePolicy: GraphQLCachePolicyName, options?: GraphQLOptions): string {
  if (!SEASON_SCOPED_POLICIES.has(cachePolicy)) return "";
  const explicit = String(options?.season || "").trim();
  if (explicit) return explicit;
  const fromVariant = /(?:^|\|)season:([^|]+)/.exec(String(options?.cacheVariant || ""));
  if (fromVariant?.[1]) return fromVariant[1].trim();
  return currentSeason().trim();
}

function resolvePolicy(query: string, options?: GraphQLOptions): ResolvedRequestPolicy {
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
  const cacheVariant = [cachePolicy, seasonVariant, options?.cacheVariant || ""]
    .filter(Boolean)
    .join("|");
  const freshTtl = mutation ? 0 : Math.max(0, options?.cacheTtl ?? policy.freshTtl);
  const staleTtl = mutation ? 0 : Math.max(0, options?.staleTtl ?? policy.staleTtl);

  return {
    operationName,
    authMode: options?.authMode ?? configured.authMode,
    cachePolicy,
    freshTtl,
    emptyFreshTtl: mutation ? undefined : policy.emptyFreshTtl,
    staleTtl,
    persist: !mutation && policy.persist,
    cacheVariant,
    cacheable: !mutation && (freshTtl > 0 || Boolean(options?.getCacheExpiry))
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
  requestId?: string
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
    requestId
  });
  if (requestId || !ok) {
    recordBugReportDiagnostic({
      at: new Date().toISOString(),
      requestId,
      operation: operationName,
      message: ok ? undefined : source
    });
  }
}

export function isTransientGraphQLStatus(statusCode: number): boolean {
  return statusCode === 502 || statusCode === 503 || statusCode === 504;
}

function isTransientFailure(error: unknown): boolean {
  if (error instanceof GraphQLTransportError) return error.transient;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return /network|timeout|timed out|网络|超时|502|503|504/.test(message);
}

function toHttpError(statusCode: number): GraphQLTransportError {
  return new GraphQLTransportError(
    httpErrorMessage(statusCode),
    isTransientGraphQLStatus(statusCode),
    statusCode
  );
}

function isUnauthenticated(body: GraphQLResponse<unknown> | undefined): boolean {
  return Boolean(body?.errors?.some((error) => error.extensions?.code === "UNAUTHENTICATED"));
}

export function buildGraphQLRequestHeaders(
  authMode: GraphQLAuthMode,
  token: string | null
): Record<string, string> {
  const header: Record<string, string> = {
    "content-type": "application/json"
  };
  if (authMode === "session" && token) {
    header.Authorization = `Bearer ${token}`;
  }
  return header;
}

function makeRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  operationName: string,
  authMode: GraphQLAuthMode,
  retryOnUnauthorized = true,
  token = authMode === "session" ? getApiSessionToken() : null
): Promise<{ body: GraphQLResponse<T>; token: string | null; requestId?: string }> {
  return new Promise((resolve, reject) => {
    const header = buildGraphQLRequestHeaders(authMode, token);

    wx.request<GraphQLResponse<T>>({
      url: getGraphQLEndpoint(),
      method: "POST",
      data: buildGraphQLRequestPayload(query, variables),
      header,
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        const body = response.data;
        const unauthorized = response.statusCode === 401 || isUnauthenticated(body);

        if (authMode === "session" && unauthorized && retryOnUnauthorized) {
          if (isLogoutInFlight()) {
            reject(new Error("正在退出登录，请稍后重试"));
            return;
          }

          const currentToken = getApiSessionToken();
          if (currentToken && currentToken !== token) {
            makeRequest<T>(query, variables, operationName, authMode, false, currentToken)
              .then(resolve)
              .catch(reject);
            return;
          }

          const pending = getPendingSessionRefresh();
          if (pending) {
            pending
              .catch(() => undefined)
              .then(() => {
                const freshToken = getApiSessionToken();
                if (freshToken && freshToken !== token) {
                  return makeRequest<T>(
                    query,
                    variables,
                    operationName,
                    authMode,
                    false,
                    freshToken
                  );
                }
                clearSessionCredentials();
                return refreshWechatApiSession()
                  .then(() => makeRequest<T>(
                    query,
                    variables,
                    operationName,
                    authMode,
                    false,
                    getApiSessionToken()
                  ));
              })
              .then(resolve)
              .catch(reject);
            return;
          }

          clearSessionCredentials();
          refreshWechatApiSession()
            .then(() => makeRequest<T>(
              query,
              variables,
              operationName,
              authMode,
              false,
              getApiSessionToken()
            ))
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(toHttpError(response.statusCode));
          return;
        }

        if (!body || (body.data === undefined && !body.errors?.length)) {
          reject(new GraphQLTransportError("数据加载失败，请稍后重试", false));
          return;
        }

        const requestIdKey = Object.keys(response.header || {}).find(
          (key) => key.toLowerCase() === "x-request-id"
        );
        const requestId = requestIdKey ? String(response.header[requestIdKey]) : undefined;
        resolve({ body, token, requestId });
      },
      fail(error) {
        reject(new GraphQLTransportError(networkErrorMessage(error), true));
      }
    });
  });
}

function requestIdentity(
  query: string,
  variables: Record<string, unknown>,
  policy: ResolvedRequestPolicy,
  token: string | null
): { requestKey: string; cacheKey: string } {
  const cacheToken = policy.authMode === "session" ? token : null;
  const requestKey = buildGraphQLRequestCacheKey(
    query,
    variables,
    cacheToken,
    policy.cacheVariant
  );
  return {
    requestKey,
    cacheKey: getStorageCacheKey(requestKey, policy.authMode)
  };
}

export function getServedCacheStoredAt(
  query: string,
  variables: Record<string, unknown>
): number | undefined {
  const policy = resolvePolicy(query);
  const token = policy.authMode === "session" ? getApiSessionToken() : null;
  const { requestKey } = requestIdentity(query, variables, policy, token);
  return getServedStoredAt(requestKey);
}

function resolveFreshUntil(
  data: unknown,
  policy: ResolvedRequestPolicy,
  options?: GraphQLOptions
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

export async function graphqlRead<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options?: GraphQLOptions
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
  const cached = policy.cacheable
    ? readCacheEntry(identity.cacheKey, identity.requestKey)
    : undefined;
  const now = Date.now();

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
      cacheVariantHash
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
        durationMs: Date.now() - startedAt
      }
    };
  }

  const staleCandidate = cached && now < cached.entry.staleUntil
    ? cached.entry
    : undefined;

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
        cacheVariantHash
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
          durationMs: Date.now() - startedAt
        }
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
      cacheVariantHash
    );
    throw new GraphQLTransportError("当前处于离线状态，请检查网络后重试", true);
  }

  const inFlight = inFlightRequests.get(identity.requestKey) as
    | Promise<GraphQLReadResult<T>>
    | undefined;

  if (inFlight) {
    // forceRefresh joins this in-flight network request (not a cache hit).
    // The coalesced flight is already on the wire; starting a second identical
    // POST would not make the first response any fresher.
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
        result.meta.requestId
      );
      return {
        ...result,
        meta: {
          ...result.meta,
          source: "in-flight",
          durationMs: Date.now() - startedAt
        }
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
        cacheVariantHash
      );
      throw error;
    }
  }

  const networkRequest = (async (): Promise<GraphQLReadResult<T>> => {
    try {
      if (trace) recordPageOperation(trace.navigationId, "network");
      const response = await makeRequest<T>(
        query,
        variables,
        policy.operationName,
        policy.authMode,
        true,
        token
      );
      const errors = response.body.errors || [];
      const hasData = response.body.data !== undefined && response.body.data !== null;

      if (!hasData) {
        throw new GraphQLApplicationError(errors);
      }

      const storedAt = Date.now();
      const responseIdentity = requestIdentity(query, variables, policy, response.token);

      if (errors.length === 0 && policy.cacheable) {
        const producingSessionStillActive =
          policy.authMode === "public"
          || response.token === getApiSessionToken();

        if (producingSessionStillActive) {
          const freshUntil = resolveFreshUntil(response.body.data, policy, options);
          const entry: CacheEntry = {
            version: CACHE_VERSION,
            requestKey: responseIdentity.requestKey,
            data: response.body.data,
            freshUntil,
            staleUntil: Math.max(freshUntil, freshUntil + policy.staleTtl),
            storedAt
          };
          writeCacheEntry(responseIdentity.cacheKey, entry, policy.persist);
          forgetServedFromCache(responseIdentity.requestKey);
        }
      }

      recordRequest(
        policy.operationName,
        startedAt,
        errors.length === 0,
        "network",
        true,
        undefined,
        trace,
        cacheVariantHash,
        response.requestId
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
          durationMs: Date.now() - startedAt
        }
      };
    } catch (error) {
      if (staleCandidate && isTransientFailure(error)) {
        recordServedFromCache(identity.requestKey, staleCandidate.storedAt);
        recordRequest(
          policy.operationName,
          startedAt,
          false,
          "stale",
          true,
          staleCandidate.storedAt,
          trace,
          cacheVariantHash
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
            durationMs: Date.now() - startedAt
          }
        };
      }

      recordRequest(
        policy.operationName,
        startedAt,
        false,
        "network",
        true,
        undefined,
        trace,
        cacheVariantHash
      );
      throw error;
    }
  })();

  inFlightRequests.set(
    identity.requestKey,
    networkRequest as Promise<GraphQLReadResult<unknown>>
  );
  void networkRequest.then(
    () => inFlightRequests.delete(identity.requestKey),
    () => inFlightRequests.delete(identity.requestKey)
  );
  return networkRequest;
}

export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options?: GraphQLOptions
): Promise<T> {
  const result = await graphqlRead<T>(query, variables, options);
  if (result.errors.length > 0) {
    throw new GraphQLApplicationError(result.errors);
  }
  return result.data;
}
