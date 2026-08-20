import { storageKeys } from "../config/storage-keys";

export const DEFAULT_GRAPHQL_RETRY_AFTER_SECONDS = 15;
export const MIN_GRAPHQL_RETRY_AFTER_SECONDS = 1;
export const MAX_GRAPHQL_RETRY_AFTER_SECONDS = 120;

export interface GraphQLCooldownState {
  active: boolean;
  cooldownUntil?: number;
  remainingSeconds: number;
}

let cooldownNoticeActiveUntil = 0;

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
    if (Number.isFinite(retryAt) && retryAt > now) {
      return clampRetryAfterSeconds((retryAt - now) / 1000);
    }
  }

  return DEFAULT_GRAPHQL_RETRY_AFTER_SECONDS;
}

export function persistGraphQLCooldown(
  retryAfterSeconds: number,
  now = Date.now(),
): GraphQLCooldownState {
  const seconds = clampRetryAfterSeconds(retryAfterSeconds);
  const cooldownUntil = now + seconds * 1000;
  try {
    const existing = Number(wx.getStorageSync(storageKeys.graphqlCooldownUntil)) || 0;
    wx.setStorageSync(
      storageKeys.graphqlCooldownUntil,
      Math.max(existing, cooldownUntil),
    );
  } catch {}
  return getGraphQLCooldownState(now);
}

export function getGraphQLCooldownState(now = Date.now()): GraphQLCooldownState {
  let stored = 0;
  try {
    stored = Number(wx.getStorageSync(storageKeys.graphqlCooldownUntil)) || 0;
  } catch {}

  if (!Number.isFinite(stored) || stored <= now) {
    if (stored) {
      try { wx.removeStorageSync(storageKeys.graphqlCooldownUntil); } catch {}
    }
    return { active: false, remainingSeconds: 0 };
  }

  // A corrupted or manually edited value must never lock the client for more
  // than the protocol's documented 120-second ceiling.
  const cooldownUntil = Math.min(
    stored,
    now + MAX_GRAPHQL_RETRY_AFTER_SECONDS * 1000,
  );
  if (cooldownUntil !== stored) {
    try { wx.setStorageSync(storageKeys.graphqlCooldownUntil, cooldownUntil); } catch {}
  }
  return {
    active: true,
    cooldownUntil,
    remainingSeconds: clampRetryAfterSeconds((cooldownUntil - now) / 1000),
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
