import { storageKeys } from "../config/storage-keys";

export const DEFAULT_GRAPHQL_RETRY_AFTER_SECONDS = 15;
export const MIN_GRAPHQL_RETRY_AFTER_SECONDS = 1;
export const MAX_GRAPHQL_RETRY_AFTER_SECONDS = 120;

export interface GraphQLCooldownState {
  active: boolean;
  cooldownUntil?: number;
  remainingSeconds: number;
}

type GraphQLCooldownListener = (state: GraphQLCooldownState) => void;

let cooldownNoticeActiveUntil = 0;
let cooldownRuntime: unknown;
let cooldownUntilMemory = 0;
let corruptedStoredCooldownValue: number | null = null;
let corruptedStoredCooldownUntil = 0;
let cooldownListeners = new Set<GraphQLCooldownListener>();

function ensureCooldownRuntime(): void {
  if (cooldownRuntime === wx) return;
  cooldownRuntime = wx;
  cooldownUntilMemory = 0;
  corruptedStoredCooldownValue = null;
  corruptedStoredCooldownUntil = 0;
  cooldownNoticeActiveUntil = 0;
  cooldownListeners = new Set<GraphQLCooldownListener>();
}

function notifyGraphQLCooldown(state: GraphQLCooldownState): void {
  for (const listener of [...cooldownListeners]) {
    try { listener(state); } catch {}
  }
}

function clampRetryAfterSeconds(value: number): number {
  return Math.min(
    MAX_GRAPHQL_RETRY_AFTER_SECONDS,
    Math.max(MIN_GRAPHQL_RETRY_AFTER_SECONDS, Math.ceil(value)),
  );
}

/** Supports both RFC numeric seconds and HTTP-date Retry-After values. */
export function parseRetryAfterSeconds(
  value: unknown,
  now = Date.now(),
): number {
  const normalized = String(value ?? "").trim();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const seconds = Number(normalized);
    if (Number.isFinite(seconds)) return clampRetryAfterSeconds(seconds);
  }

  if (normalized) {
    const retryAt = Date.parse(normalized);
    if (Number.isFinite(retryAt)) {
      return clampRetryAfterSeconds((retryAt - now) / 1000);
    }
  }

  return DEFAULT_GRAPHQL_RETRY_AFTER_SECONDS;
}

export function persistGraphQLCooldown(
  retryAfterSeconds: number,
  now = Date.now(),
): GraphQLCooldownState {
  ensureCooldownRuntime();
  const seconds = clampRetryAfterSeconds(retryAfterSeconds);
  const requestedUntil = now + seconds * 1000;
  let stored = 0;
  try {
    stored = Number(wx.getStorageSync(storageKeys.graphqlCooldownUntil)) || 0;
  } catch {}
  const boundedStored = Number.isFinite(stored)
    ? Math.min(stored, now + MAX_GRAPHQL_RETRY_AFTER_SECONDS * 1000)
    : 0;
  cooldownUntilMemory = Math.max(
    cooldownUntilMemory,
    boundedStored,
    requestedUntil,
  );
  try {
    wx.setStorageSync(storageKeys.graphqlCooldownUntil, cooldownUntilMemory);
  } catch {}
  const state = getGraphQLCooldownState(now);
  notifyGraphQLCooldown(state);
  return state;
}

export function getGraphQLCooldownState(now = Date.now()): GraphQLCooldownState {
  ensureCooldownRuntime();
  let stored = 0;
  try {
    stored = Number(wx.getStorageSync(storageKeys.graphqlCooldownUntil)) || 0;
  } catch {}

  const safeStored = Number.isFinite(stored) ? stored : 0;
  const maximumUntil = now + MAX_GRAPHQL_RETRY_AFTER_SECONDS * 1000;
  let normalizedStored = safeStored;
  if (safeStored > maximumUntil) {
    if (corruptedStoredCooldownValue !== safeStored) {
      corruptedStoredCooldownValue = safeStored;
      corruptedStoredCooldownUntil = maximumUntil;
    }
    normalizedStored = corruptedStoredCooldownUntil;
    try {
      wx.setStorageSync(storageKeys.graphqlCooldownUntil, normalizedStored);
    } catch {}
  } else {
    corruptedStoredCooldownValue = null;
    corruptedStoredCooldownUntil = 0;
  }
  const effectiveUntil = Math.max(cooldownUntilMemory, normalizedStored);

  if (!Number.isFinite(effectiveUntil) || effectiveUntil <= now) {
    cooldownUntilMemory = 0;
    if (stored) {
      try { wx.removeStorageSync(storageKeys.graphqlCooldownUntil); } catch {}
    }
    return { active: false, remainingSeconds: 0 };
  }

  // A corrupted or manually edited value must never lock the client for more
  // than the protocol's documented 120-second ceiling.
  const cooldownUntil = Math.min(
    effectiveUntil,
    maximumUntil,
  );
  cooldownUntilMemory = cooldownUntil;
  if (cooldownUntil !== safeStored) {
    try { wx.setStorageSync(storageKeys.graphqlCooldownUntil, cooldownUntil); } catch {}
  }
  return {
    active: true,
    cooldownUntil,
    remainingSeconds: clampRetryAfterSeconds((cooldownUntil - now) / 1000),
  };
}

export function subscribeGraphQLCooldown(
  listener: GraphQLCooldownListener,
): () => void {
  ensureCooldownRuntime();
  const listeners = cooldownListeners;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function graphQLCooldownMessage(
  state: GraphQLCooldownState,
  stale: boolean,
): string {
  const seconds = Math.max(1, state.remainingSeconds);
  return stale
    ? `请求较多，当前显示上次成功数据；${seconds} 秒后可刷新`
    : `请求较多，请在 ${seconds} 秒后刷新`;
}

/** Surface the first 429 even on pages whose domain mapper hides cache meta. */
export function showGraphQLCooldownNotice(
  state: GraphQLCooldownState,
  stale: boolean,
): void {
  const now = Date.now();
  if (!state.active || cooldownNoticeActiveUntil > now) return;
  cooldownNoticeActiveUntil = state.cooldownUntil ?? now + 15 * 1000;
  try {
    wx.showToast({
      title: graphQLCooldownMessage(state, stale),
      icon: "none",
      duration: 4000,
    });
  } catch {}
}
