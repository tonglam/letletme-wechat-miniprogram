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
}

export interface GraphQLOptions {
  cacheTtl?: number;
  getCacheExpiry?: (data: unknown) => number;
  /** Skip the cache read (fresh result still re-populates the cache). */
  forceRefresh?: boolean;
}

const inFlightRequests = new Map<string, Promise<unknown>>();

// L1 in-process cache in front of the persisted storage cache. Entries are
// keyed by the same storage key, so a token change naturally orphans old
// session entries (they expire by TTL and vanish on restart).
const memoryCache = new Map<string, CacheEntry>();
const MEMORY_CACHE_LIMIT = 120;

function readMemoryCache(cacheKey: string, requestKey: string): unknown | undefined {
  const entry = memoryCache.get(cacheKey);
  if (!entry || entry.requestKey !== requestKey) return undefined;
  if (Date.now() >= entry.expiresAt) {
    memoryCache.delete(cacheKey);
    return undefined;
  }
  return entry.data;
}

function writeMemoryCache(cacheKey: string, entry: CacheEntry): void {
  if (memoryCache.size >= MEMORY_CACHE_LIMIT) {
    memoryCache.clear();
  }
  memoryCache.set(cacheKey, entry);
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
  token: string | null
): string {
  const audience = token ? `session:${hashKey(token)}` : "public";
  return `${audience}::${query}::${JSON.stringify(variables)}`;
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
): Promise<T> {
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
          const currentToken = getApiSessionToken();
          if (currentToken && currentToken !== token) {
            // The session rotated while this request was in flight (e.g. the
            // background profile revalidation stored a fresh token): retry
            // with the current credential instead of clearing it.
            makeRequest<T>(query, variables, false, currentToken).then(resolve).catch(reject);
            return;
          }
          const pending = getPendingSessionRefresh();
          if (pending) {
            // A login round trip is already in flight and may be rotating
            // this very token server-side without the response being stored
            // yet. Await it: clearApiSession here would bump the session
            // epoch and make that login discard its own fresh credential.
            pending
              .catch(() => undefined)
              .then(() => {
                const freshToken = getApiSessionToken();
                if (freshToken && freshToken !== token) {
                  return makeRequest<T>(query, variables, false, freshToken);
                }
                // The in-flight refresh produced no usable new credential —
                // fall back to the classic clear + re-login cycle.
                clearApiSession();
                return refreshWechatApiSession()
                  .then(() => makeRequest<T>(query, variables, false, getApiSessionToken()));
              })
              .then(resolve)
              .catch(reject);
            return;
          }
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

        resolve(body.data);
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
  const key = buildGraphQLRequestCacheKey(query, variables, token);

  const inFlight = inFlightRequests.get(key) as Promise<T> | undefined;
  if (inFlight) {
    return inFlight;
  }

  const skipCacheRead = options?.forceRefresh === true;
  if (!skipCacheRead && (options?.cacheTtl != null || options?.getCacheExpiry)) {
    const cacheKey = getStorageCacheKey(key, token);
    const fromMemory = readMemoryCache(cacheKey, key);
    if (fromMemory !== undefined) {
      return Promise.resolve(fromMemory as T);
    }
    try {
      const cached = wx.getStorageSync(cacheKey) as CacheEntry | undefined;
      if (cached && cached.requestKey === key && Date.now() < cached.expiresAt) {
        writeMemoryCache(cacheKey, cached);
        return Promise.resolve(cached.data as T);
      }
      try { wx.removeStorageSync(cacheKey); } catch {}
    } catch {}
  }

  const t0 = Date.now();
  const opName = extractOpName(query);

  const request = makeRequest<T>(query, variables, true, token).then((data) => {
    recordApi(opName, Date.now() - t0, true);
    if (
      (options?.cacheTtl != null || options?.getCacheExpiry)
      && getApiSessionToken() === token
    ) {
      try {
        const cacheKey = getStorageCacheKey(key, token);
        const expiresAt = options?.getCacheExpiry
          ? options.getCacheExpiry(data)
          : Date.now() + (options?.cacheTtl ?? 0);
        const entry: CacheEntry = { requestKey: key, data, expiresAt };
        writeMemoryCache(cacheKey, entry);
        wx.setStorageSync(cacheKey, entry);
      } catch {}
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
