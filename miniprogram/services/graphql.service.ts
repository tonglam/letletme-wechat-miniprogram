import { getGraphQLEndpoint, REQUEST_TIMEOUT_MS } from "../config/env";
import {
  clearApiSession,
  getApiSessionToken,
  getPendingSessionRefresh,
  refreshWechatApiSession
} from "./auth.service";
import { recordApi } from "../utils/perf";
import { storagePrefixes } from "../config/storage-keys";
import {
  graphQLErrorMessage,
  httpErrorMessage,
  networkErrorMessage
} from "../utils/request-error";

interface GraphQLError {
  message?: string;
  extensions?: {
    code?: string;
  };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface CacheEntry {
  requestKey: string;
  data: unknown;
  expiresAt: number;
  /** Fetch time of the cached payload; absent in entries persisted by older builds. */
  storedAt?: number;
}

export interface GraphQLOptions {
  cacheTtl?: number;
  getCacheExpiry?: (data: unknown) => number;
  /** Skip the cache read (fresh result still re-populates the cache). */
  forceRefresh?: boolean;
  /**
   * Suffix separating cache entries that share a query and variables but
   * follow different freshness policies (e.g. live vs historical views of
   * one payload). Without it, a long-TTL entry can satisfy a short-TTL read.
   */
  cacheVariant?: string;
}

const inFlightRequests = new Map<string, Promise<unknown>>();

// L1 in-process cache in front of the persisted storage cache. Entries are
// keyed by the same storage key, so a token change naturally orphans old
// session entries (they expire by TTL and vanish on restart).
const memoryCache = new Map<string, CacheEntry>();
const MEMORY_CACHE_LIMIT = 120;

/** requestKey -> fetch time of the payload most recently served from cache. */
const servedFromCache = new Map<string, number>();

function recordServedFromCache(requestKey: string, storedAt: number): void {
  if (servedFromCache.size >= MEMORY_CACHE_LIMIT) {
    // Same bounding policy as the L1 cache it mirrors: request keys embed the
    // full query text and variables, so the map must not grow for the whole
    // process lifetime as distinct cached entries are revisited.
    servedFromCache.clear();
  }
  servedFromCache.set(requestKey, storedAt);
}

function readMemoryCache(cacheKey: string, requestKey: string): unknown | undefined {
  const entry = memoryCache.get(cacheKey);
  if (!entry || entry.requestKey !== requestKey) return undefined;
  if (Date.now() >= entry.expiresAt) {
    memoryCache.delete(cacheKey);
    return undefined;
  }
  recordServedFromCache(requestKey, entry.storedAt ?? Date.now());
  return entry.data;
}

function writeMemoryCache(cacheKey: string, entry: CacheEntry): void {
  if (memoryCache.size >= MEMORY_CACHE_LIMIT) {
    memoryCache.clear();
  }
  memoryCache.set(cacheKey, entry);
}

function readCacheEntry(cacheKey: string, requestKey: string): unknown | undefined {
  const fromMemory = readMemoryCache(cacheKey, requestKey);
  if (fromMemory !== undefined) {
    return fromMemory;
  }
  try {
    const cached = wx.getStorageSync(cacheKey) as CacheEntry | undefined;
    if (cached && cached.requestKey === requestKey && Date.now() < cached.expiresAt) {
      writeMemoryCache(cacheKey, cached);
      recordServedFromCache(requestKey, cached.storedAt ?? Date.now());
      return cached.data;
    }
    try { wx.removeStorageSync(cacheKey); } catch {}
  } catch {}
  return undefined;
}

function toHttpError(statusCode: number): Error {
  return new Error(httpErrorMessage(statusCode));
}

function extractOpName(query: string): string {
  const match = /(?:query|mutation)\s+(\w+)/i.exec(query);
  return match ? match[1] : "GraphQL";
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

export function buildGraphQLRequestCacheKey(
  query: string,
  variables: Record<string, unknown>,
  token: string | null,
  cacheVariant = ""
): string {
  const audience = token ? `session:${hashKey(token)}` : "public";
  return `${audience}::${query}::${JSON.stringify(variables)}${cacheVariant ? `#${cacheVariant}` : ""}`;
}

/**
 * Fetch time of the payload if the last serve for this request came from
 * cache, else undefined. Lets callers age-label cached data honestly
 * instead of stamping it as just-fetched.
 */
export function getServedCacheStoredAt(query: string, variables: Record<string, unknown>): number | undefined {
  const key = buildGraphQLRequestCacheKey(query, variables, getApiSessionToken());
  // Concurrent callers share a single cache serve, so reads must NOT consume
  // the entry: every consumer of the same payload sees the same timestamp.
  // The map stays bounded by recordServedFromCache's cap, and a fresh network
  // write for the key deletes it.
  return servedFromCache.get(key);
}

function getStorageCacheKey(requestKey: string, token: string | null): string {
  const prefix = token
    ? storagePrefixes.graphqlSessionCache
    : storagePrefixes.graphqlPublicCache;
  return `${prefix}${hashKey(requestKey)}`;
}

function isUnauthenticated(body: GraphQLResponse<unknown> | undefined): boolean {
  return Boolean(body?.errors?.some((error) => error.extensions?.code === "UNAUTHENTICATED"));
}

function makeRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  retryOnUnauthorized = true,
  token = getApiSessionToken()
): Promise<{ data: T; token: string | null }> {
  return new Promise((resolve, reject) => {
    const endpoint = getGraphQLEndpoint();
    const header: Record<string, string> = {
      "content-type": "application/json"
    };
    if (token) {
      header.Authorization = `Bearer ${token}`;
    }

    wx.request<GraphQLResponse<T>>({
      url: endpoint,
      method: "POST",
      data: {
        query,
        variables
      },
      header,
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        const body = response.data;
        if ((response.statusCode === 401 || isUnauthenticated(body)) && retryOnUnauthorized) {
          clearApiSession();
          refreshWechatApiSession()
            .then(() => makeRequest<T>(query, variables, false, getApiSessionToken()))
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(toHttpError(response.statusCode));
          return;
        }

        if (body?.errors?.length) {
          reject(new Error(graphQLErrorMessage(body.errors)));
          return;
        }

        if (!body || body.data === undefined || body.data === null) {
          reject(new Error("数据加载失败，请稍后重试"));
          return;
        }

        // Propagate the credential that produced this response: callers must
        // never infer it from mutable session state (logout or relogin to
        // another account mid-flight would leak this payload into the wrong
        // cache namespace).
        resolve({ data: body.data, token });
      },
      fail(error) {
        reject(new Error(networkErrorMessage(error)));
      }
    });
  });
}

export function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options?: GraphQLOptions
): Promise<T> {
  const token = getApiSessionToken();
  if (!token) {
    const pending = getPendingSessionRefresh();
    if (pending) {
      // A usable public-cache hit must not wait on the login round trip
      // (e.g. CurrentEventInfo during app init on a slow cold start).
      if (options?.forceRefresh !== true && (options?.cacheTtl != null || options?.getCacheExpiry)) {
        const publicKey = buildGraphQLRequestCacheKey(query, variables, null, options?.cacheVariant ?? "");
        const cached = readCacheEntry(getStorageCacheKey(publicKey, null), publicKey);
        if (cached !== undefined) {
          return Promise.resolve(cached as T);
        }
      }
      // Otherwise wait for the in-flight login rather than firing a
      // tokenless request that 401s and retries — and that would key any
      // cached session data under the public namespace. A failed refresh
      // falls through to the normal unauthenticated path on re-entry.
      return pending.catch(() => undefined).then(() => graphqlRequest<T>(query, variables, options));
    }
  }
  const key = buildGraphQLRequestCacheKey(query, variables, token, options?.cacheVariant ?? "");

  const inFlight = inFlightRequests.get(key) as Promise<T> | undefined;
  if (inFlight) {
    return inFlight;
  }

  const skipCacheRead = options?.forceRefresh === true;
  if (!skipCacheRead && (options?.cacheTtl != null || options?.getCacheExpiry)) {
    const cached = readCacheEntry(getStorageCacheKey(key, token), key);
    if (cached !== undefined) {
      return Promise.resolve(cached as T);
    }
  }

  const t0 = Date.now();
  const opName = extractOpName(query);

  const request = makeRequest<T>(query, variables, true, token).then(({ data, token: responseToken }) => {
    recordApi(opName, Date.now() - t0, true);
    if (options?.cacheTtl != null || options?.getCacheExpiry) {
      // An authenticated payload is cached only while its producing
      // credential is still the live session: a logout or account switch
      // mid-flight already wiped that account's cache namespace, and an
      // unconditional write here would repopulate it after removal.
      const producingTokenStillActive = !responseToken || responseToken === getApiSessionToken();
      if (producingTokenStillActive) {
        try {
          // Cache under the credential that actually produced the response,
          // propagated from the successful attempt — never inferred from
          // mutable session state (logout or relogin mid-flight must not leak
          // this payload into the public or another account's namespace).
          const effectiveKey = responseToken !== token
            ? buildGraphQLRequestCacheKey(query, variables, responseToken, options?.cacheVariant ?? "")
            : key;
          const cacheKey = getStorageCacheKey(effectiveKey, responseToken);
          const expiresAt = options?.getCacheExpiry
            ? options.getCacheExpiry(data)
            : Date.now() + (options?.cacheTtl ?? 0);
          const entry: CacheEntry = { requestKey: effectiveKey, data, expiresAt, storedAt: Date.now() };
          writeMemoryCache(cacheKey, entry);
          servedFromCache.delete(effectiveKey);
          // Sub-minute caches stay process-local: they would be expired by the
          // next launch anyway, and keeping large live payloads (full
          // tournament pick lists) out of storage avoids accumulating one
          // persisted key per tournament/gameweek combination.
          if (expiresAt - Date.now() > 60 * 1000) {
            wx.setStorageSync(cacheKey, entry);
          }
        } catch {}
      }
    }
    return data;
  }).catch((err: unknown) => {
    recordApi(opName, Date.now() - t0, false);
    throw err;
  }).finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, request);
  return request;
}
