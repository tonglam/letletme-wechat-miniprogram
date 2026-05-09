import { getGraphQLEndpoint, REQUEST_TIMEOUT_MS } from "../config/env";
import {
  clearApiSession,
  getApiSessionToken,
  refreshWechatApiSession
} from "./auth.service";
import { recordApi } from "../utils/perf";

interface GraphQLError {
  message?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

export interface GraphQLOptions {
  cacheTtl?: number;
  getCacheExpiry?: (data: unknown) => number;
}

const inFlightRequests = new Map<string, Promise<unknown>>();
const CACHE_PREFIX = "gql:";

function extractOpName(query: string): string {
  const match = /(?:query|mutation)\s+(\w+)/i.exec(query);
  return match ? match[1] : "GraphQL";
}

function hashKey(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function makeRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  retryOnUnauthorized = true
): Promise<T> {
  return new Promise((resolve, reject) => {
    const endpoint = getGraphQLEndpoint();
    const token = getApiSessionToken();
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
        if (response.statusCode === 401 && retryOnUnauthorized) {
          clearApiSession();
          refreshWechatApiSession()
            .then(() => makeRequest<T>(query, variables, false))
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GraphQL request failed: ${response.statusCode}`));
          return;
        }

        const body = response.data;
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
  const key = `${query}::${JSON.stringify(variables)}`;

  const inFlight = inFlightRequests.get(key) as Promise<T> | undefined;
  if (inFlight) {
    return inFlight;
  }

  if (options?.cacheTtl != null || options?.getCacheExpiry) {
    try {
      const cacheKey = CACHE_PREFIX + hashKey(key);
      const cached = wx.getStorageSync(cacheKey) as CacheEntry | undefined;
      if (cached && Date.now() < cached.expiresAt) {
        return Promise.resolve(cached.data as T);
      }
      try { wx.removeStorageSync(cacheKey); } catch {}
    } catch {}
  }

  const t0 = Date.now();
  const opName = extractOpName(query);

  const request = makeRequest<T>(query, variables).then((data) => {
    recordApi(opName, Date.now() - t0, true);
    if (options?.cacheTtl != null || options?.getCacheExpiry) {
      try {
        const cacheKey = CACHE_PREFIX + hashKey(key);
        const expiresAt = options?.getCacheExpiry
          ? options.getCacheExpiry(data)
          : Date.now() + (options?.cacheTtl ?? 0);
        wx.setStorageSync(cacheKey, { data, expiresAt });
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
