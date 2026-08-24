import { storageKeys } from "../config/storage-keys";

export const DEFAULT_GRAPHQL_RETRY_AFTER_SECONDS = 15;
export const MIN_GRAPHQL_RETRY_AFTER_SECONDS = 1;
export const MAX_GRAPHQL_RETRY_AFTER_SECONDS = 120;
export const GRAPHQL_COOLDOWN_READY_MESSAGE = "请求冷却已结束，可以重试";

export const GRAPHQL_WORKLOADS = [
  "interactive",
  "home",
  "fixtures",
  "market",
  "player-stats",
  "gameweek",
  "public-other",
] as const;
export type GraphQLWorkload = (typeof GRAPHQL_WORKLOADS)[number];

export function isGraphQLWorkload(value: unknown): value is GraphQLWorkload {
  return (
    typeof value === "string" &&
    GRAPHQL_WORKLOADS.includes(value as GraphQLWorkload)
  );
}

const IMF_FIXDATE_PATTERN =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const OBSOLETE_RFC850_PATTERN =
  /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2} \d{2}:\d{2}:\d{2} GMT$/;
const OBSOLETE_ASCTIME_PATTERN =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?: {2}\d| \d{2}) \d{2}:\d{2}:\d{2} \d{4}$/;

function isHttpDate(value: string): boolean {
  return (
    IMF_FIXDATE_PATTERN.test(value) ||
    OBSOLETE_RFC850_PATTERN.test(value) ||
    OBSOLETE_ASCTIME_PATTERN.test(value)
  );
}

export interface GraphQLCooldownState {
  active: boolean;
  cooldownUntil?: number;
  remainingSeconds: number;
  workload?: GraphQLWorkload;
}

type GraphQLCooldownListener = (state: GraphQLCooldownState) => void;

let cooldownNoticeActiveUntil = 0;
let cooldownRuntime: unknown;
let cooldownUntilMemory = 0;
let workloadCooldownMemory = new Map<GraphQLWorkload, number>();
let corruptedWorkloadCooldowns = new Map<
  GraphQLWorkload,
  { value: number; until: number }
>();
let corruptedStoredCooldownValue: number | null = null;
let corruptedStoredCooldownUntil = 0;
let cooldownListeners = new Set<GraphQLCooldownListener>();

function ensureCooldownRuntime(): void {
  if (cooldownRuntime === wx) return;
  cooldownRuntime = wx;
  cooldownUntilMemory = 0;
  workloadCooldownMemory = new Map<GraphQLWorkload, number>();
  corruptedWorkloadCooldowns = new Map();
  corruptedStoredCooldownValue = null;
  corruptedStoredCooldownUntil = 0;
  cooldownNoticeActiveUntil = 0;
  cooldownListeners = new Set<GraphQLCooldownListener>();
}

function notifyGraphQLCooldown(state: GraphQLCooldownState): void {
  for (const listener of [...cooldownListeners]) {
    try {
      listener(state);
    } catch {}
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
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    if (Number.isFinite(seconds)) return clampRetryAfterSeconds(seconds);
  }

  if (isHttpDate(normalized)) {
    const retryAt = Date.parse(normalized);
    if (Number.isFinite(retryAt)) {
      return clampRetryAfterSeconds((retryAt - now) / 1000);
    }
  }

  return DEFAULT_GRAPHQL_RETRY_AFTER_SECONDS;
}

export function isGraphQLCooldownMessage(value: unknown): boolean {
  const message = String(value ?? "").trim();
  return /^请求较多，(?:当前显示上次成功数据；\d+ 秒后可刷新|请在 \d+ 秒后刷新)$/.test(
    message,
  );
}

export function persistGraphQLCooldown(
  retryAfterSeconds: number,
  now = Date.now(),
  workload?: GraphQLWorkload,
): GraphQLCooldownState {
  ensureCooldownRuntime();
  const seconds = clampRetryAfterSeconds(retryAfterSeconds);
  const requestedUntil = now + seconds * 1000;
  if (workload) {
    const current = readWorkloadCooldown(workload, now);
    const cooldownUntil = Math.max(current, requestedUntil);
    workloadCooldownMemory.set(workload, cooldownUntil);
    try {
      wx.setStorageSync(workloadCooldownStorageKey(workload), cooldownUntil);
    } catch {}
    const state = getGraphQLCooldownState(now, workload);
    notifyGraphQLCooldown(state);
    return state;
  }
  let stored = 0;
  try {
    stored = Number(wx.getStorageSync(storageKeys.graphqlCooldownUntil)) || 0;
  } catch {}
  // A raw value that could not be rewritten or removed remains untrusted even
  // after its anchored quarantine expires; fresh 429 evidence must not extend it.
  const storedIsQuarantined = corruptedStoredCooldownValue === stored;
  const boundedStored =
    Number.isFinite(stored) && !storedIsQuarantined
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

function workloadCooldownStorageKey(workload: GraphQLWorkload): string {
  return `${storageKeys.graphqlCooldownWorkloads}:${workload}`;
}

function readWorkloadCooldown(
  workload: GraphQLWorkload,
  now = Date.now(),
): number {
  let stored = 0;
  let storageReadSucceeded = false;
  try {
    const numeric = Number(
      wx.getStorageSync(workloadCooldownStorageKey(workload)),
    );
    stored = Number.isNaN(numeric) ? 0 : numeric;
    storageReadSucceeded = true;
  } catch {}
  const maximumUntil = now + MAX_GRAPHQL_RETRY_AFTER_SECONDS * 1000;
  const corrupted = corruptedWorkloadCooldowns.get(workload);
  let storedUntil = 0;
  if (!storageReadSucceeded) {
    // A failed read does not prove that a quarantined raw value was removed.
    // Keep using the original fixed anchor instead of recalculating now+120s.
    storedUntil = corrupted?.until ?? 0;
  } else if (corrupted && stored === corrupted.value) {
    storedUntil = corrupted.until;
  } else if (!Number.isFinite(stored) || stored > maximumUntil) {
    const until = corrupted?.until ?? maximumUntil;
    corruptedWorkloadCooldowns.set(workload, { value: stored, until });
    storedUntil = until;
    try {
      wx.setStorageSync(workloadCooldownStorageKey(workload), until);
    } catch {}
  } else {
    corruptedWorkloadCooldowns.delete(workload);
    storedUntil = stored;
  }
  const memoryUntil = workloadCooldownMemory.get(workload) || 0;
  const effectiveUntil = Math.min(
    Math.max(memoryUntil, storedUntil),
    maximumUntil,
  );
  workloadCooldownMemory.set(workload, effectiveUntil);
  if (effectiveUntil <= now) {
    workloadCooldownMemory.delete(workload);
    if (storageReadSucceeded && stored) {
      try {
        wx.removeStorageSync(workloadCooldownStorageKey(workload));
      } catch {}
    }
    return 0;
  }
  if (storageReadSucceeded && stored !== effectiveUntil) {
    try {
      wx.setStorageSync(workloadCooldownStorageKey(workload), effectiveUntil);
    } catch {}
  }
  return effectiveUntil;
}

export function getGraphQLCooldownState(
  now = Date.now(),
  workload?: GraphQLWorkload,
): GraphQLCooldownState {
  ensureCooldownRuntime();
  const workloadUntil = workload ? readWorkloadCooldown(workload, now) : 0;
  let stored = 0;
  let storageReadSucceeded = false;
  try {
    stored = Number(wx.getStorageSync(storageKeys.graphqlCooldownUntil)) || 0;
    storageReadSucceeded = true;
  } catch {}

  const safeStored = Number.isFinite(stored) ? stored : 0;
  const maximumUntil = now + MAX_GRAPHQL_RETRY_AFTER_SECONDS * 1000;
  let normalizedStored = safeStored;
  const isQuarantinedValue =
    storageReadSucceeded && corruptedStoredCooldownValue === safeStored;
  if (!storageReadSucceeded && corruptedStoredCooldownValue !== null) {
    // A read error is not proof that the corrupt raw value was replaced.
    // Retain its original quarantine anchor until a later successful read
    // observes either the normalized value or a genuine empty key.
    normalizedStored = corruptedStoredCooldownUntil;
  } else if (isQuarantinedValue || safeStored > maximumUntil) {
    if (!isQuarantinedValue) {
      corruptedStoredCooldownValue = safeStored;
      corruptedStoredCooldownUntil = maximumUntil;
    }
    normalizedStored = corruptedStoredCooldownUntil;
    try {
      wx.setStorageSync(storageKeys.graphqlCooldownUntil, normalizedStored);
    } catch {}
  } else if (storageReadSucceeded) {
    corruptedStoredCooldownValue = null;
    corruptedStoredCooldownUntil = 0;
  }
  const globalEffectiveUntil = Math.max(cooldownUntilMemory, normalizedStored);

  let globalUntil = 0;
  if (!Number.isFinite(globalEffectiveUntil) || globalEffectiveUntil <= now) {
    cooldownUntilMemory = 0;
    if (stored) {
      try {
        wx.removeStorageSync(storageKeys.graphqlCooldownUntil);
      } catch {}
    }
  } else {
    // A corrupted or manually edited value must never lock the client for more
    // than the protocol's documented 120-second ceiling.
    globalUntil = Math.min(globalEffectiveUntil, maximumUntil);
    cooldownUntilMemory = globalUntil;
    if (globalUntil !== safeStored) {
      try {
        wx.setStorageSync(storageKeys.graphqlCooldownUntil, globalUntil);
      } catch {}
    }
  }

  const cooldownUntil = Math.max(workloadUntil, globalUntil);
  if (cooldownUntil <= now) return { active: false, remainingSeconds: 0 };

  const activeWorkload =
    workload && workloadUntil >= globalUntil ? workload : undefined;
  return {
    active: true,
    cooldownUntil,
    remainingSeconds: clampRetryAfterSeconds((cooldownUntil - now) / 1000),
    ...(activeWorkload ? { workload: activeWorkload } : {}),
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
