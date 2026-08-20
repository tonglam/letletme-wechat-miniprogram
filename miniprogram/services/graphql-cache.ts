import { storagePrefixes } from "../config/storage-keys";
import type { GraphQLAuthMode } from "./graphql-cache-policy";
import { registerGraphQLMemoryClear } from "./graphql-session-hooks";

// Extracted from graphql.service: memory/storage/purge/key only. TTL,
// in-flight coalescing, and 401 handling stay in graphql.service.

export const CACHE_VERSION = 2;
const MEMORY_CACHE_LIMIT = 120;
const STORAGE_CACHE_LIMIT = 150;
const MIN_PERSIST_TTL_MS = 60 * 1000;

export interface CacheEntry {
  version: 2;
  requestKey: string;
  data: unknown;
  freshUntil: number;
  staleUntil: number;
  storedAt: number;
}

export interface CachedRead {
  entry: CacheEntry;
  source: "memory" | "storage";
}

const memoryCache = new Map<string, CacheEntry>();
const servedFromCache = new Map<string, number>();
let storageIndex: Map<string, number> | null = null;

export function hashKey(str: string): string {
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

export function getStorageCacheKey(requestKey: string, authMode: GraphQLAuthMode): string {
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

function ensureStorageIndex(): Map<string, number> {
  if (storageIndex) return storageIndex;
  const index = new Map<string, number>();
  try {
    const { keys } = wx.getStorageInfoSync();
    keys
      .filter((key) =>
        key.startsWith(storagePrefixes.graphqlPublicCache)
        || key.startsWith(storagePrefixes.graphqlSessionCache)
      )
      .map((key) => {
        try {
          const entry = wx.getStorageSync(key) as Partial<CacheEntry> | undefined;
          return { key, storedAt: Number(entry?.storedAt) || 0 };
        } catch {
          return { key, storedAt: 0 };
        }
      })
      .sort((left, right) => left.storedAt - right.storedAt)
      .forEach(({ key, storedAt }) => index.set(key, storedAt));
  } catch {}
  storageIndex = index;
  return index;
}

function touchStorageIndex(cacheKey: string, storedAt: number): void {
  const index = ensureStorageIndex();
  index.delete(cacheKey);
  index.set(cacheKey, storedAt);
}

export function recordServedFromCache(requestKey: string, storedAt: number): void {
  if (!servedFromCache.has(requestKey) && servedFromCache.size >= MEMORY_CACHE_LIMIT) {
    const oldest = servedFromCache.keys().next().value as string | undefined;
    if (oldest) servedFromCache.delete(oldest);
  }
  servedFromCache.set(requestKey, storedAt);
}

export function getServedStoredAt(requestKey: string): number | undefined {
  return servedFromCache.get(requestKey);
}

export function forgetServedFromCache(requestKey: string): void {
  servedFromCache.delete(requestKey);
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

export function readCacheEntry(cacheKey: string, requestKey: string): CachedRead | undefined {
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
      touchStorageIndex(cacheKey, Number(fromStorage.storedAt) || now);
      return { entry: fromStorage, source: "storage" };
    }
    if (fromStorage !== undefined && fromStorage !== null && fromStorage !== "") {
      try { wx.removeStorageSync(cacheKey); } catch {}
      ensureStorageIndex().delete(cacheKey);
    }
  } catch {}
  return undefined;
}

function enforceStorageLimit(): void {
  const index = ensureStorageIndex();
  while (index.size > STORAGE_CACHE_LIMIT) {
    const oldest = index.keys().next().value as string | undefined;
    if (!oldest) break;
    index.delete(oldest);
    try { wx.removeStorageSync(oldest); } catch {}
  }
}

export function writeCacheEntry(cacheKey: string, entry: CacheEntry, persist: boolean): void {
  writeMemoryCache(cacheKey, entry);
  if (!persist || entry.freshUntil - Date.now() < MIN_PERSIST_TTL_MS) return;
  try {
    wx.setStorageSync(cacheKey, entry);
    touchStorageIndex(cacheKey, entry.storedAt);
    enforceStorageLimit();
  } catch {}
}

export function purgeGraphQLStorageCache(now = Date.now()): void {
  storageIndex = null;
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
    storageIndex = new Map(valid
      .filter(({ key }) => {
        try {
          const entry = wx.getStorageSync(key) as Partial<CacheEntry> | undefined;
          return entry?.version === CACHE_VERSION && now < Number(entry.staleUntil);
        } catch {
          return false;
        }
      })
      .sort((left, right) => left.storedAt - right.storedAt)
      .map(({ key, storedAt }) => [key, storedAt]));
  } catch {}
}

function wipeGraphQLMemoryEntries(): void {
  memoryCache.clear();
  servedFromCache.clear();
}

registerGraphQLMemoryClear(wipeGraphQLMemoryEntries);
