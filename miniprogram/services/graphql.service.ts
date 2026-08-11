import { getGraphQLEndpoint, REQUEST_TIMEOUT_MS } from "../config/env";
import {
  clearSessionCredentials,
  getApiSessionToken,
  getPendingSessionRefresh,
  isLogoutInFlight,
  refreshWechatApiSession
} from "./auth.service";
import { recordApi } from "../utils/perf";
import type { ApiRecordSource } from "../utils/perf";
import { storagePrefixes } from "../config/storage-keys";
import {
  graphQLErrorMessage,
  httpErrorMessage,
  networkErrorMessage
} from "../utils/request-error";
import {
  getGraphQLCachePolicy,
  getGraphQLOperationPolicy
} from "./graphql-cache-policy";
import type {
  GraphQLAuthMode,
  GraphQLCachePolicyName
} from "./graphql-cache-policy";

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

interface CacheEntry {
  version: 2;
  requestKey: string;
  data: unknown;
  freshUntil: number;
  staleUntil: number;
  storedAt: number;
}

export interface GraphQLOptions {
  authMode?: GraphQLAuthMode;
  cachePolicy?: GraphQLCachePolicyName;
  cacheTtl?: number;
  staleTtl?: number;
  getCacheExpiry?: (data: unknown) => number;
  forceRefresh?: boolean;
  cacheVariant?: string;
}

export interface GraphQLReadMeta {
  operationName: string;
  authMode: GraphQLAuthMode;
  source: ApiRecordSource;
  stale: boolean;
  storedAt?: number;
}

export interface GraphQLReadResult<T> {
  data: T;
  errors: GraphQLErrorInfo[];
  meta: GraphQLReadMeta;
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

interface CachedRead {
  entry: CacheEntry;
  source: "memory" | "storage";
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

const CACHE_VERSION = 2;
const MEMORY_CACHE_LIMIT = 120;
const STORAGE_CACHE_LIMIT = 150;
const MIN_PERSIST_TTL_MS = 60 * 1000;
const SEASON_SCOPED_POLICIES = new Set<GraphQLCachePolicyName>([
  "fixtures",
  "player-picker",
  "team-directory"
]);

const inFlightRequests = new Map<string, Promise<GraphQLReadResult<unknown>>>();
const memoryCache = new Map<string, CacheEntry>();
const servedFromCache = new Map<string, number>();

export function purgeGraphQLStorageCache(now = Date.now()): void {
  try {
    const { keys } = wx.getStorageInfoSync();
    const valid: Array<{ key: string; storedAt: number }> = [];
    keys
      .filter((key) => key.startsWith(storagePrefixes.graphqlCache))
      .forEach((key) => {
        try {
          const entry = wx.getStorageSync(key) as Partial<CacheEntry> | undefined;
          const currentVersion =
            key.startsWith(storagePrefixes.graphqlPublicCache)
            || key.startsWith(storagePrefixes.graphqlSessionCache);
          if (
            !currentVersion
            || entry?.version !== CACHE_VERSION
            || typeof entry.staleUntil !== "number"
            || now >= entry.staleUntil
          ) {
            wx.removeStorageSync(key);
            return;
          }
          valid.push({ key, storedAt: Number(entry.storedAt) || 0 });
        } catch {
          try { wx.removeStorageSync(key); } catch {}
        }
      });
    valid
      .sort((left, right) => left.storedAt - right.storedAt)
      .slice(0, Math.max(0, valid.length - STORAGE_CACHE_LIMIT))
      .forEach(({ key }) => {
        try { wx.removeStorageSync(key); } catch {}
      });
  } catch {}
}
let lastStaleNoticeAt = 0;

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

function hashKey(str: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = stableValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

export function buildGraphQLRequestCacheKey(
  query: string,
  variables: Record<string, unknown>,
  token: string | null,
  cacheVariant = ""
): string {
  const audience = token ? `session:${hashKey(token)}` : "public";
  const variablesKey = JSON.stringify(stableValue(variables)) || "{}";
  const variant = cacheVariant ? `:${hashKey(cacheVariant)}` : "";
  return `${audience}:${hashKey(query)}:${hashKey(variablesKey)}${variant}`;
}

function currentSeason(): string {
  try {
    return String(getApp<IAppOption>().globalData.season || "unknown");
  } catch {
    return "unknown";
  }
}

function resolvePolicy(query: string, options?: GraphQLOptions): ResolvedRequestPolicy {
  const operationName = extractOpName(query);
  const configured = getGraphQLOperationPolicy(operationName);
  const cachePolicy = options?.cachePolicy ?? configured.cachePolicy;
  const policy = getGraphQLCachePolicy(cachePolicy);
  const mutation = /^\s*mutation\b/i.test(query);
  const seasonVariant = SEASON_SCOPED_POLICIES.has(cachePolicy)
    ? `season:${currentSeason()}`
    : "";
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

function getStorageCacheKey(requestKey: string, authMode: GraphQLAuthMode): string {
  const prefix = authMode === "session"
    ? storagePrefixes.graphqlSessionCache
    : storagePrefixes.graphqlPublicCache;
  return `${prefix}${hashKey(requestKey)}`;
}

function evictOldestMemoryEntry(): void {
  const oldest = memoryCache.keys().next().value as string | undefined;
  if (oldest) memoryCache.delete(oldest);
}

function writeMemoryCache(cacheKey: string, entry: CacheEntry): void {
  if (!memoryCache.has(cacheKey) && memoryCache.size >= MEMORY_CACHE_LIMIT) {
    evictOldestMemoryEntry();
  }
  memoryCache.delete(cacheKey);
  memoryCache.set(cacheKey, entry);
}

function recordServedFromCache(requestKey: string, storedAt: number): void {
  if (!servedFromCache.has(requestKey) && servedFromCache.size >= MEMORY_CACHE_LIMIT) {
    const oldest = servedFromCache.keys().next().value as string | undefined;
    if (oldest) servedFromCache.delete(oldest);
  }
  servedFromCache.set(requestKey, storedAt);
}

function isV2Entry(value: unknown, requestKey: string): value is CacheEntry {
  const entry = value as Partial<CacheEntry> | undefined;
  return Boolean(
    entry
    && entry.version === CACHE_VERSION
    && entry.requestKey === requestKey
    && typeof entry.freshUntil === "number"
    && typeof entry.staleUntil === "number"
    && typeof entry.storedAt === "number"
  );
}

function readCacheEntry(cacheKey: string, requestKey: string): CachedRead | undefined {
  const now = Date.now();
  const fromMemory = memoryCache.get(cacheKey);
  if (fromMemory) {
    if (fromMemory.requestKey === requestKey && now < fromMemory.staleUntil) {
      memoryCache.delete(cacheKey);
      memoryCache.set(cacheKey, fromMemory);
      return { entry: fromMemory, source: "memory" };
    }
    memoryCache.delete(cacheKey);
  }

  try {
    const fromStorage = wx.getStorageSync(cacheKey);
    if (isV2Entry(fromStorage, requestKey) && now < fromStorage.staleUntil) {
      writeMemoryCache(cacheKey, fromStorage);
      return { entry: fromStorage, source: "storage" };
    }
    if (fromStorage !== undefined && fromStorage !== null && fromStorage !== "") {
      try { wx.removeStorageSync(cacheKey); } catch {}
    }
  } catch {}
  return undefined;
}

function enforceStorageLimit(): void {
  try {
    const { keys } = wx.getStorageInfoSync();
    const cacheKeys = keys.filter((key) =>
      key.startsWith(storagePrefixes.graphqlPublicCache)
      || key.startsWith(storagePrefixes.graphqlSessionCache)
    );
    if (cacheKeys.length <= STORAGE_CACHE_LIMIT) return;

    const ordered = cacheKeys
      .map((key) => {
        try {
          const entry = wx.getStorageSync(key) as Partial<CacheEntry> | undefined;
          return { key, storedAt: Number(entry?.storedAt) || 0 };
        } catch {
          return { key, storedAt: 0 };
        }
      })
      .sort((left, right) => left.storedAt - right.storedAt);

    ordered
      .slice(0, Math.max(0, ordered.length - STORAGE_CACHE_LIMIT))
      .forEach(({ key }) => {
        try { wx.removeStorageSync(key); } catch {}
      });
  } catch {}
}

function writeCacheEntry(cacheKey: string, entry: CacheEntry, persist: boolean): void {
  writeMemoryCache(cacheKey, entry);
  if (!persist || entry.freshUntil - Date.now() < MIN_PERSIST_TTL_MS) return;
  try {
    wx.setStorageSync(cacheKey, entry);
    enforceStorageLimit();
  } catch {}
}

function cacheAgeBucket(storedAt: number | undefined): string | undefined {
  if (!storedAt) return undefined;
  const age = Math.max(0, Date.now() - storedAt);
  if (age < 60 * 1000) return "<1m";
  if (age < 5 * 60 * 1000) return "1-5m";
  if (age < 30 * 60 * 1000) return "5-30m";
  if (age < 6 * 60 * 60 * 1000) return "30m-6h";
  if (age < 24 * 60 * 60 * 1000) return "6-24h";
  return ">24h";
}

function recordRequest(
  operationName: string,
  startedAt: number,
  ok: boolean,
  source: ApiRecordSource,
  networkAttempted: boolean,
  storedAt?: number
): void {
  recordApi(operationName, Date.now() - startedAt, ok, {
    operationName,
    source,
    networkAttempted,
    cacheAgeBucket: cacheAgeBucket(storedAt)
  });
}

function notifyStaleFallback(): void {
  const now = Date.now();
  if (now - lastStaleNoticeAt < 30 * 1000) return;
  lastStaleNoticeAt = now;
  try {
    const api = wx as unknown as {
      showToast?: (options: { title: string; icon: "none"; duration: number }) => void;
    };
    api.showToast?.({
      title: "当前为上次成功数据",
      icon: "none",
      duration: 2500
    });
  } catch {}
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
): Promise<{ body: GraphQLResponse<T>; token: string | null }> {
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

        resolve({ body, token });
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
  return servedFromCache.get(requestKey);
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
      cached.entry.storedAt
    );
    return {
      data: cached.entry.data as T,
      errors: [],
      meta: {
        operationName: policy.operationName,
        authMode: policy.authMode,
        source: cached.source,
        stale: false,
        storedAt: cached.entry.storedAt
      }
    };
  }

  const staleCandidate = cached && now < cached.entry.staleUntil
    ? cached.entry
    : undefined;
  const inFlight = inFlightRequests.get(identity.requestKey) as
    | Promise<GraphQLReadResult<T>>
    | undefined;

  if (inFlight) {
    try {
      const result = await inFlight;
      recordRequest(
        policy.operationName,
        startedAt,
        result.errors.length === 0,
        "in-flight",
        false,
        result.meta.storedAt
      );
      return {
        ...result,
        meta: {
          ...result.meta,
          source: "in-flight"
        }
      };
    } catch (error) {
      recordRequest(policy.operationName, startedAt, false, "in-flight", false);
      throw error;
    }
  }

  const networkRequest = (async (): Promise<GraphQLReadResult<T>> => {
    try {
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
          servedFromCache.delete(responseIdentity.requestKey);
        }
      }

      recordRequest(
        policy.operationName,
        startedAt,
        errors.length === 0,
        "network",
        true
      );
      return {
        data: response.body.data as T,
        errors,
        meta: {
          operationName: policy.operationName,
          authMode: policy.authMode,
          source: "network",
          stale: false,
          storedAt
        }
      };
    } catch (error) {
      if (staleCandidate && isTransientFailure(error)) {
        recordServedFromCache(identity.requestKey, staleCandidate.storedAt);
        notifyStaleFallback();
        recordRequest(
          policy.operationName,
          startedAt,
          false,
          "stale",
          true,
          staleCandidate.storedAt
        );
        return {
          data: staleCandidate.data as T,
          errors: [],
          meta: {
            operationName: policy.operationName,
            authMode: policy.authMode,
            source: "stale",
            stale: true,
            storedAt: staleCandidate.storedAt
          }
        };
      }

      recordRequest(policy.operationName, startedAt, false, "network", true);
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
