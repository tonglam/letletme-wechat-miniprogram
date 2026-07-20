import { getGraphQLEndpoint, REQUEST_TIMEOUT_MS } from "../config/env";
import {
  clearApiSession,
  getApiSessionToken,
  refreshWechatApiSession
} from "./auth.service";
import { recordApi } from "../utils/perf";
import { storagePrefixes } from "../config/storage-keys";

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
}

const inFlightRequests = new Map<string, Promise<unknown>>();

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
          clearApiSession();
          refreshWechatApiSession()
            .then(() => makeRequest<T>(query, variables, false, getApiSessionToken()))
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GraphQL request failed: ${response.statusCode}`));
          return;
        }

        const errorMessage = body?.errors?.map((error) => error.message).filter(Boolean).join("; ");
        if (errorMessage) {
          reject(new Error(errorMessage));
          return;
        }

        if (!body || body.data === undefined || body.data === null) {
          reject(new Error("GraphQL response missing data"));
          return;
        }

        resolve(body.data);
      },
      fail(error) {
        reject(new Error(error.errMsg || "GraphQL network request failed"));
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

  if (options?.cacheTtl != null || options?.getCacheExpiry) {
    try {
      const cacheKey = getStorageCacheKey(key, token);
      const cached = wx.getStorageSync(cacheKey) as CacheEntry | undefined;
      if (cached && cached.requestKey === key && Date.now() < cached.expiresAt) {
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
        wx.setStorageSync(cacheKey, { requestKey: key, data, expiresAt });
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
