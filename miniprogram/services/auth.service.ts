import { getMiniProgramApiBase, REQUEST_TIMEOUT_MS } from "../config/env";
import { storageKeys, storagePrefixes } from "../config/storage-keys";
import { clearEntryScopedStorage } from "../utils/storage";
import { recordApi } from "../utils/perf";
import {
  authApiErrorMessage,
  networkErrorMessage
} from "../utils/request-error";
import { commitEntryBindingState as commitEntryBinding } from "./app-context-state";
import { isStoredSessionUsable, MiniProgramLinkRequiredError } from "./auth-session";
import { clearGraphQLMemoryCache } from "./graphql-session-hooks";

export interface MiniProgramProfile {
  id: string;
  name: string | null;
  email: string | null;
  fplEntryId: number | null;
  fplEntryVerifiedAt: string | null;
  wechatLinked: boolean;
}

interface ApiSession {
  token: string;
  expiresAt: string;
  profile: MiniProgramProfile;
}

interface ApiResponse {
  success: boolean;
  error?: string;
  linked?: boolean;
  token?: string;
  expiresAt?: string;
  profile?: MiniProgramProfile;
}

export class WechatSessionTransportError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "WechatSessionTransportError";
    this.statusCode = statusCode;
  }
}

function isTransientAuthStatus(statusCode: number): boolean {
  return statusCode === 429
    || statusCode === 502
    || statusCode === 503
    || statusCode === 504;
}

function loginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) => {
        if (code) resolve(code);
        else reject(new WechatSessionTransportError("微信登录失败，请重试"));
      },
      fail: () => reject(new WechatSessionTransportError("微信登录失败，请重试"))
    });
  });
}

const SAFE_MINI_PROGRAM_DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

let deviceIdRuntime: unknown;
let deviceIdMemory: string | undefined;

function getDeviceId(): string {
  if (deviceIdRuntime !== wx) {
    deviceIdRuntime = wx;
    deviceIdMemory = undefined;
  }

  let storedValue: unknown;
  let storageReadable = false;
  try {
    storedValue = wx.getStorageSync(storageKeys.deviceId);
    storageReadable = true;
  } catch {}
  const existing = typeof storedValue === "string" ? storedValue : undefined;
  if (existing && SAFE_MINI_PROGRAM_DEVICE_ID.test(existing)) {
    deviceIdMemory = existing;
    return existing;
  }
  const memoryFallback = deviceIdMemory
    && SAFE_MINI_PROGRAM_DEVICE_ID.test(deviceIdMemory)
    ? deviceIdMemory
    : undefined;
  if ((!storageReadable || !storedValue) && memoryFallback) {
    return memoryFallback;
  }

  const generated = `wx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    wx.setStorageSync(storageKeys.deviceId, generated);
    deviceIdMemory = generated;
    return generated;
  } catch {}
  if (memoryFallback) return memoryFallback;
  deviceIdMemory = generated;
  return generated;
}

export function getMiniProgramDeviceId(): string {
  return getDeviceId();
}

function requestWebAuth(path: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    wx.request<ApiResponse>({
      url: `${getMiniProgramApiBase()}${path}`,
      method: "POST",
      data,
      header: { "content-type": "application/json" },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300 || !response.data?.success) {
          recordApi(`auth:${path}`, Date.now() - t0, false);
          const message = authApiErrorMessage(response.statusCode, response.data?.error);
          reject(
            isTransientAuthStatus(response.statusCode)
              ? new WechatSessionTransportError(message, response.statusCode)
              : new Error(message)
          );
          return;
        }
        recordApi(`auth:${path}`, Date.now() - t0, true);
        resolve(response.data);
      },
      fail(error) {
        recordApi(`auth:${path}`, Date.now() - t0, false);
        reject(new WechatSessionTransportError(networkErrorMessage(error)));
      }
    });
  });
}

function asSession(response: ApiResponse): ApiSession {
  if (!response.token || !response.expiresAt || !response.profile) {
    throw new Error("登录响应不完整，请重新进入小程序");
  }
  return {
    token: response.token,
    expiresAt: response.expiresAt,
    profile: response.profile
  };
}

function clearStoredGraphQLSessionCache(): void {
  try {
    const { keys } = wx.getStorageInfoSync();
    keys
      .filter((key) =>
        key.startsWith(storagePrefixes.graphqlCache)
        && !key.startsWith(storagePrefixes.graphqlPublicCache)
      )
      .forEach((key) => wx.removeStorageSync(key));
  } catch {}
  clearGraphQLMemoryCache();
}

// In-memory mirror of the platform-encrypted session so hot paths (every
// GraphQL request) never touch storage. `undefined` = encrypted storage has
// not been restored yet; `null` = restoration found no usable session.
let sessionMemory: { token: string; expiresAt: string } | null | undefined;

// Bumped on every session clear so a login round trip that was in flight
// before a logout (or an expiry purge) can never re-store a credential
// afterwards.
let sessionEpoch = 0;

function supportsEncryptedSessionStorage(): boolean {
  try {
    const api = wx as unknown as { canIUse?: (schema: string) => boolean };
    return Boolean(
      api.canIUse?.("setStorage.object.encrypt")
      && api.canIUse?.("getStorage.object.encrypt")
    );
  } catch {
    return false;
  }
}

function readEncryptedSessionToken(): Promise<string | null> {
  if (!supportsEncryptedSessionStorage()) return Promise.resolve(null);
  return new Promise((resolve) => {
    wx.getStorage({
      key: storageKeys.apiSessionToken,
      encrypt: true,
      success(result: WechatMiniprogram.GetStorageSuccessCallbackResult) {
        resolve(typeof result.data === "string" ? result.data : null);
      },
      fail() {
        resolve(null);
      }
    } as WechatMiniprogram.GetStorageOption);
  });
}

async function persistEncryptedSessionToken(token: string): Promise<boolean> {
  // Remove a legacy synchronous value before writing the encrypted row. If
  // encryption is unavailable or fails, the session remains memory-only.
  try { wx.removeStorageSync(storageKeys.apiSessionToken); } catch {}
  if (!supportsEncryptedSessionStorage()) return false;
  return new Promise((resolve) => {
    wx.setStorage({
      key: storageKeys.apiSessionToken,
      data: token,
      encrypt: true,
      success() {
        resolve(true);
      },
      fail() {
        try { wx.removeStorageSync(storageKeys.apiSessionToken); } catch {}
        resolve(false);
      }
    } as WechatMiniprogram.SetStorageOption);
  });
}

/** Restores an encrypted credential and upgrades legacy plaintext in place. */
export async function restoreApiSessionCredentials(): Promise<void> {
  await ensureRevocationQueueRestored();
  if (sessionMemory !== undefined) return;
  const expiresAt = wx.getStorageSync(storageKeys.apiSessionExpiresAt) as string | undefined;
  const legacyToken = wx.getStorageSync(storageKeys.apiSessionToken) as string | undefined;
  const encryptedToken = await readEncryptedSessionToken();
  const token = encryptedToken || legacyToken || "";

  if (!isStoredSessionUsable(token, expiresAt || "")) {
    clearSessionCredentials();
    sessionMemory = null;
    return;
  }

  sessionMemory = { token, expiresAt: expiresAt || "" };
  if (legacyToken) {
    const persisted = await persistEncryptedSessionToken(token);
    if (!persisted) {
      try { wx.removeStorageSync(storageKeys.apiSessionExpiresAt); } catch {}
    }
  }
}

async function storeApiSession(session: ApiSession): Promise<ApiSession> {
  const previousToken = sessionMemory?.token;
  const previousVerifiedEntryId = getVerifiedSessionEntryId();
  const previousEntryId = Number(wx.getStorageSync(storageKeys.entryId));
  const nextEntryId = session.profile.fplEntryId && session.profile.fplEntryVerifiedAt
    ? session.profile.fplEntryId
    : undefined;
  const bindingReason = previousToken === undefined
    ? "login"
    : previousToken !== session.token
      ? "token-rotation"
      : previousVerifiedEntryId !== nextEntryId
        ? "rebind"
        : "restore";

  if (
    previousToken !== session.token
    || previousVerifiedEntryId !== nextEntryId
  ) {
    clearStoredGraphQLSessionCache();
  }

  sessionMemory = { token: session.token, expiresAt: session.expiresAt };
  wx.setStorageSync(storageKeys.apiSessionExpiresAt, session.expiresAt);
  persistProfileEmail(session.profile.email);
  // Every persisted session carries a freshly fetched authoritative profile,
  // so the 24h revalidation throttle keys off this write.
  wx.setStorageSync(storageKeys.apiProfileCheckedAt, Date.now());
  // Keep the verified profile binding separate from the display-only follow.
  // A zero sentinel means the profile was checked and has no verified entry;
  // a missing key means an older build has not persisted this fact yet.
  wx.setStorageSync(storageKeys.apiProfileFplEntryId, nextEntryId || 0);
  if (nextEntryId) {
    // The web-verified entry wins over any local selection: adopt it and drop
    // the previous team's entry-scoped caches.
    if (previousEntryId !== nextEntryId) {
      clearEntryScopedStorage();
    }
    wx.setStorageSync(storageKeys.entryId, nextEntryId);
    try {
      getApp<IAppOption>().globalData.entryId = nextEntryId;
    } catch {}
  }
  commitEntryBinding(nextEntryId || previousEntryId || null, bindingReason);
  // A profile without a verified entry clears nothing: the locally followed
  // team is a display-only preference (public FPL data), and the sync is
  // best-effort — gaps between web and local are allowed.
  const persisted = await persistEncryptedSessionToken(session.token);
  if (!persisted) {
    try { wx.removeStorageSync(storageKeys.apiSessionExpiresAt); } catch {}
  }
  return session;
}

export function clearApiSession(): void {
  sessionEpoch += 1;
  sessionMemory = undefined;
  clearStoredGraphQLSessionCache();
  clearEntryScopedStorage();
  [
    storageKeys.apiSessionToken,
    storageKeys.apiSessionExpiresAt,
    storageKeys.apiProfileFplEntryId,
    storageKeys.apiProfileEmail,
    storageKeys.entryId
  ].forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch {}
  });
  try {
    getApp<IAppOption>().globalData.entryId = undefined;
  } catch {}
  commitEntryBinding(null, "logout");
}

export function getApiSessionToken(): string | null {
  // Cold starts restore the encrypted value asynchronously before callers
  // may read it. Never fall back to a synchronous plaintext token read.
  if (sessionMemory === undefined) return null;
  if (!sessionMemory) return null;
  if (!isStoredSessionUsable(sessionMemory.token, sessionMemory.expiresAt)) {
    clearSessionCredentials();
    return null;
  }
  return sessionMemory.token || null;
}

export function hasStoredSessionProfileBinding(): boolean {
  if (!getApiSessionToken()) return false;
  try {
    const value = wx.getStorageSync(storageKeys.apiProfileFplEntryId) as unknown;
    if (value === "" || value === undefined || value === null) return false;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0;
  } catch {
    return false;
  }
}

export function getVerifiedSessionEntryId(): number | undefined {
  if (!getApiSessionToken()) return undefined;
  try {
    const parsed = Number(wx.getStorageSync(storageKeys.apiProfileFplEntryId));
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Credentials-only cleanup. Unlike clearApiSession, the followed entry is
 * kept: it is a display-only preference (public FPL data) with no account
 * permissions attached, so neither an expiring session nor a lost account
 * link should wipe it. For expiry specifically, the imminent single-flight
 * refresh re-asserts the session — wiping anything here would flash empty
 * states on pages that open before the refresh lands.
 */
export function clearSessionCredentials(): void {
  sessionMemory = undefined;
  clearStoredGraphQLSessionCache();
  [
    storageKeys.apiSessionToken,
    storageKeys.apiSessionExpiresAt,
    storageKeys.apiProfileFplEntryId,
    storageKeys.apiProfileEmail
  ].forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch {}
  });
}

function persistProfileEmail(email: string | null | undefined): void {
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (trimmed) {
    wx.setStorageSync(storageKeys.apiProfileEmail, trimmed);
    return;
  }
  try {
    wx.removeStorageSync(storageKeys.apiProfileEmail);
  } catch {}
}

export interface LinkedAccountSnapshot {
  linked: boolean;
  email: string;
}

/** Display-only: token presence plus the last profile email written at login. */
export function getLinkedAccountSnapshot(): LinkedAccountSnapshot {
  const linked = Boolean(getApiSessionToken());
  if (!linked) return { linked: false, email: "" };
  let email = "";
  try {
    const stored = wx.getStorageSync(storageKeys.apiProfileEmail);
    if (typeof stored === "string") email = stored.trim();
  } catch {}
  return { linked: true, email };
}

export async function awaitLinkedAccountSnapshot(): Promise<LinkedAccountSnapshot> {
  if (!getApiSessionToken()) {
    try {
      await getApp<IAppOption>().authReady;
    } catch {}
  }
  return getLinkedAccountSnapshot();
}

export type LogoutResult = { localCleared: true; remoteRevoked: boolean };

interface PendingSessionRefresh {
  promise: Promise<ApiSession>;
  issuedToken: string | null;
  issuedExpiresAt: string | null;
  displaced?: boolean;
}

// Confirmation can temporarily replace a normal refresh in the single-flight
// slot. Keep every displaced state until it has yielded its issued token so a
// logout can revoke a rotated credential even when the replacement fails.
const pendingRefreshStates = new Set<PendingSessionRefresh>();
const retainedRefreshTokens = new Set<string>();
const retainedRefreshTokenExpiry = new Map<string, number>();
const REVOCATION_RETRY_TTL_MS = 24 * 60 * 60 * 1000;
const REVOCATION_PERSIST_MAX_ATTEMPTS = 3;
const REVOCATION_PERSIST_RETRY_DELAY_MS = 100;
let pendingEmailConfirmation: Promise<ApiSession> | null = null;
let revocationQueueReady: Promise<void> | null = null;
let revocationPersistChain = Promise.resolve();
let revocationQueueRestored = false;
let revocationQueueWriteDirty = false;

interface StoredRevocationQueue {
  version: 1;
  entries: Array<{ token: string; expiresAt: number }>;
}

function revocationQueueSnapshot(): StoredRevocationQueue {
  return {
    version: 1,
    entries: [...retainedRefreshTokens].flatMap((token) => {
      const expiresAt = retainedRefreshTokenExpiry.get(token);
      return expiresAt && expiresAt > Date.now() ? [{ token, expiresAt }] : [];
    })
  };
}

function writeRevocationQueueSnapshot(
  snapshot: StoredRevocationQueue,
  attempt = 1
): Promise<boolean> {
  return new Promise((resolve) => {
    const retry = () => {
      if (attempt >= REVOCATION_PERSIST_MAX_ATTEMPTS) {
        resolve(false);
        return;
      }
      setTimeout(() => {
        writeRevocationQueueSnapshot(snapshot, attempt + 1).then(resolve);
      }, REVOCATION_PERSIST_RETRY_DELAY_MS * attempt);
    };
    try {
      if (snapshot.entries.length === 0) {
        wx.removeStorage({
          key: storageKeys.pendingSessionRevocations,
          success: () => resolve(true),
          fail: retry
        });
        return;
      }
      wx.setStorage({
        key: storageKeys.pendingSessionRevocations,
        data: snapshot,
        encrypt: true,
        success: () => resolve(true),
        fail: retry
      } as WechatMiniprogram.SetStorageOption);
    } catch {
      retry();
    }
  });
}

function persistRetainedRefreshTokens(): Promise<void> {
  if (!supportsEncryptedSessionStorage() || !revocationQueueRestored) {
    return Promise.resolve();
  }
  const snapshot = revocationQueueSnapshot();
  revocationPersistChain = revocationPersistChain.then(async () => {
    const persisted = await writeRevocationQueueSnapshot(snapshot);
    if (!persisted) {
      // Keep the dirty marker so a later logout/launch retries the same
      // snapshot instead of treating a failed write as durable.
      revocationQueueWriteDirty = true;
    }
  });
  return revocationPersistChain;
}

function isMissingRevocationQueue(error: unknown): boolean {
  const message = typeof error === "object" && error !== null && "errMsg" in error
    ? String((error as { errMsg?: unknown }).errMsg)
    : String(error ?? "");
  return /(?:data|key).*(?:not found|not exist)|not found|no data/i.test(message);
}

function ensureRevocationQueueRestored(): Promise<void> {
  if (revocationQueueReady) return revocationQueueReady;
  let retryAfterResolve = false;
  const ready = new Promise<void>((resolve) => {
    if (!supportsEncryptedSessionStorage()) {
      revocationQueueRestored = true;
      resolve();
      return;
    }
    try {
      wx.getStorage({
        key: storageKeys.pendingSessionRevocations,
        encrypt: true,
        success(result) {
          revocationQueueRestored = true;
          const data = result.data as Partial<StoredRevocationQueue> | undefined;
          const entries = data?.version === 1 && Array.isArray(data.entries)
            ? data.entries
            : null;
          let dirty = entries === null;
          if (entries) {
            const now = Date.now();
            entries.forEach((entry) => {
              if (
                typeof entry?.token === "string"
                && entry.token.length > 0
                && Number.isFinite(entry.expiresAt)
                && entry.expiresAt > now
              ) {
                retainedRefreshTokens.add(entry.token);
                retainedRefreshTokenExpiry.set(entry.token, entry.expiresAt);
              } else {
                // Do not leave malformed or expired credentials in protected
                // storage: a cold start must restore only retryable entries.
                dirty = true;
              }
            });
          }
          const shouldPersist = dirty || revocationQueueWriteDirty;
          revocationQueueWriteDirty = false;
          const persisted = shouldPersist
            ? persistRetainedRefreshTokens()
            : Promise.resolve();
          persisted.then(resolve, resolve);
        },
        fail: (error) => {
          if (isMissingRevocationQueue(error)) {
            revocationQueueRestored = true;
            const shouldPersist = revocationQueueWriteDirty;
            revocationQueueWriteDirty = false;
            const persisted = shouldPersist
              ? persistRetainedRefreshTokens()
              : Promise.resolve();
            persisted.then(resolve, resolve);
            return;
          }
          // Keep the previous protected queue untouched and retry on the next
          // launch/logout rather than treating a transient read as an empty
          // queue that can be overwritten.
          retryAfterResolve = true;
          resolve();
        }
      } as WechatMiniprogram.GetStorageOption);
    } catch {
      retryAfterResolve = true;
      resolve();
    }
  });
  revocationQueueReady = ready;
  ready.then(() => {
    if (retryAfterResolve && revocationQueueReady === ready) {
      revocationQueueReady = null;
    }
  });
  return ready;
}

function retainRefreshToken(token: string, expiresAt?: string | null): void {
  const parsedExpiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const expiry = Number.isFinite(parsedExpiry)
    ? parsedExpiry
    : Date.now() + REVOCATION_RETRY_TTL_MS;
  if (expiry <= Date.now()) return;
  retainedRefreshTokens.add(token);
  retainedRefreshTokenExpiry.set(
    token,
    Math.max(retainedRefreshTokenExpiry.get(token) ?? 0, expiry)
  );
  if (!revocationQueueRestored) {
    revocationQueueWriteDirty = true;
    return;
  }
  void persistRetainedRefreshTokens();
}

function forgetRetainedRefreshToken(token: string): void {
  retainedRefreshTokens.delete(token);
  retainedRefreshTokenExpiry.delete(token);
  if (!revocationQueueRestored) {
    revocationQueueWriteDirty = true;
    return;
  }
  void persistRetainedRefreshTokens();
}

function discardExpiredRetainedRefreshTokens(): void {
  const now = Date.now();
  for (const token of retainedRefreshTokens) {
    if ((retainedRefreshTokenExpiry.get(token) ?? 0) <= now) {
      forgetRetainedRefreshToken(token);
    }
  }
}

function registerPendingRefreshState(
  state: PendingSessionRefresh,
  promise: Promise<ApiSession>
): void {
  if (pendingRefresh && pendingRefresh !== state) {
    pendingRefresh.displaced = true;
  }
  state.promise = promise;
  pendingRefreshStates.add(state);
  pendingRefresh = state;
}

function releasePendingRefreshState(
  state: PendingSessionRefresh,
  promise: Promise<ApiSession>
): void {
  pendingRefreshStates.delete(state);
  if (pendingRefresh?.promise === promise) {
    pendingRefresh = null;
  }
  if (state.displaced && state.issuedToken) {
    retainRefreshToken(state.issuedToken, state.issuedExpiresAt);
  }
}

async function revokeSessionToken(token: string): Promise<boolean> {
  const t0 = Date.now();
  return new Promise<boolean>((resolve) => {
    wx.request<ApiResponse>({
      url: `${getMiniProgramApiBase()}/session`,
      method: "DELETE",
      header: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        recordApi("auth:/session", Date.now() - t0, response.statusCode >= 200 && response.statusCode < 300);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(true);
          return;
        }
        if (response.statusCode === 401) {
          // A 401 means the captured credential is already unusable.
          resolve(true);
          return;
        }
        resolve(false);
      },
      fail(_error) {
        recordApi("auth:/session", Date.now() - t0, false);
        resolve(false);
      }
    });
  });
}

async function performLogout(): Promise<LogoutResult> {
  // Capture both the current credential and any refresh that can still create
  // a server session. Invalidate every local session-dependent cache and
  // advance the epoch before touching the network: local logout is immediate,
  // while the pending refresh is awaited only so its issued credential can be
  // revoked as well.
  const token = getApiSessionToken();
  const tokenExpiresAt = sessionMemory?.expiresAt;
  const pendingStates = [...pendingRefreshStates];
  clearApiSession();
  await ensureRevocationQueueRestored();
  const queueRestoredForLogout = revocationQueueRestored;
  await Promise.all(pendingStates.map((state) => state.promise.catch(() => undefined)));
  if (queueRestoredForLogout && revocationQueueWriteDirty) {
    revocationQueueWriteDirty = false;
    await persistRetainedRefreshTokens();
  }

  discardExpiredRetainedRefreshTokens();
  const tokenExpiries = new Map<string, string | null>();
  if (token) tokenExpiries.set(token, tokenExpiresAt ?? null);
  pendingStates.forEach((state) => {
    if (state.issuedToken) tokenExpiries.set(state.issuedToken, state.issuedExpiresAt);
  });
  retainedRefreshTokens.forEach((retainedToken) => {
    const expiry = retainedRefreshTokenExpiry.get(retainedToken);
    if (expiry) tokenExpiries.set(retainedToken, new Date(expiry).toISOString());
  });
  const tokens = [...new Set([
    token,
    ...pendingStates.map((state) => state.issuedToken),
    ...retainedRefreshTokens
  ].filter((value): value is string => Boolean(value)))];
  if (tokens.length === 0) {
    await revocationPersistChain;
    return { localCleared: true, remoteRevoked: queueRestoredForLogout };
  }

  const revocations = await Promise.all(tokens.map(async (currentToken) => {
    const revoked = await revokeSessionToken(currentToken);
    if (revoked) {
      forgetRetainedRefreshToken(currentToken);
    } else {
      retainRefreshToken(currentToken, tokenExpiries.get(currentToken));
    }
    return revoked;
  }));
  await revocationPersistChain;
  const remoteRevoked = queueRestoredForLogout && revocations.every(Boolean);
  return { localCleared: true, remoteRevoked };
}

let pendingLogout: Promise<LogoutResult> | null = null;

/**
 * Single-flight sign-out: duplicate taps share one DELETE, and the
 * refresh-creation gate stays set until that one logout has fully settled.
 */
export function logoutMiniProgramSession(): Promise<LogoutResult> {
  if (pendingLogout) {
    return pendingLogout;
  }
  // Block refresh creation until the DELETE and local cleanup complete:
  // an in-flight GraphQL request could otherwise 401 mid-DELETE and start a
  // /wechat/login whose rotated server-side session would outlive the logout.
  logoutInFlight = true;
  const run = performLogout();
  pendingLogout = run;
  const release = () => {
    if (pendingLogout === run) {
      pendingLogout = null;
      logoutInFlight = false;
    }
  };
  run.then(release, release);
  return run;
}

/** Uses only web-owned identity. FPL entry IDs are inherited from the verified account. */
async function performWechatSessionRefresh(
  onSessionIssued?: (token: string, expiresAt: string) => void
): Promise<ApiSession> {
  const epoch = sessionEpoch;
  const code = await loginCode();
  const response = await requestWebAuth("/wechat/login", {
    code,
    deviceId: getDeviceId()
  });
  if (response.linked !== true) {
    if (epoch !== sessionEpoch) {
      throw new Error("登录状态已变更，请重试");
    }
    // The WeChat identity was understood and is not linked, so retaining a
    // previous account's credential would be unsafe. The locally followed
    // entry stays: it is display-only and carries no account data.
    clearSessionCredentials();
    throw new MiniProgramLinkRequiredError();
  }
  const session = asSession(response);
  // The server credential exists even when the local epoch has changed. Keep
  // it attached to the in-flight refresh so logout can revoke that credential
  // after local state has already been cleared.
  onSessionIssued?.(session.token, session.expiresAt);
  if (epoch !== sessionEpoch) {
    // A logout, session clear, or explicit email-link confirm landed while
    // the login round trip was in flight — this stale response must not
    // touch session state in either direction (neither store a credential
    // nor clear the session that superseded it).
    throw new Error("登录状态已变更，请重试");
  }
  const stored = storeApiSession(session);
  return stored;
}

let pendingRefresh: PendingSessionRefresh | null = null;

// True for the entire sign-out round trip: a 401 landing mid-DELETE must not
// start /wechat/login and rotate a fresh server-side session that outlives
// the logout.
let logoutInFlight = false;

/** Lets session-adjacent flows yield to an in-progress sign-out. */
export function isLogoutInFlight(): boolean {
  return logoutInFlight;
}

/**
 * Single-flight session refresh: concurrent callers (e.g. several requests
 * failing with 401 at once) share one wx.login + /wechat/login round trip.
 */
export function refreshWechatApiSession(): Promise<ApiSession> {
  if (pendingRefresh) {
    return pendingRefresh.promise;
  }
  if (logoutInFlight) {
    return Promise.reject(new Error("正在退出登录，请稍后重试"));
  }
  const state: PendingSessionRefresh = {
    promise: Promise.resolve(undefined as never),
    issuedToken: null,
    issuedExpiresAt: null
  };
  const refresh = performWechatSessionRefresh((issuedToken, expiresAt) => {
    state.issuedToken = issuedToken;
    state.issuedExpiresAt = expiresAt;
  });
  registerPendingRefreshState(state, refresh);
  const release = () => {
    releasePendingRefreshState(state, refresh);
  };
  refresh.then(release, release);
  return refresh;
}

/**
 * Exposes the in-flight refresh (if any) so a 401 handler can await it
 * instead of clearing the session out from under an active login round trip.
 */
export function getPendingSessionRefresh(): Promise<ApiSession> | null {
  return pendingRefresh?.promise ?? null;
}

export async function startMiniProgramEmailLink(email: string): Promise<void> {
  await requestWebAuth("/email/start", { email, deviceId: getDeviceId() });
}

export function confirmMiniProgramEmailLink(
  email: string,
  emailCode: string
): Promise<ApiSession> {
  if (logoutInFlight) {
    return Promise.reject(new Error("正在退出登录，请稍后重试"));
  }
  if (pendingEmailConfirmation) {
    return pendingEmailConfirmation;
  }
  const startEpoch = sessionEpoch;
  const state: PendingSessionRefresh = {
    promise: Promise.resolve(undefined as never),
    issuedToken: null,
    issuedExpiresAt: null
  };
  const run = (async () => {
    // Settle any in-flight /wechat/login first, same as logout: if the server
    // processes the older login after our /email/confirm, its token rotation
    // would invalidate the confirmation token we are about to store.
    const pending = getPendingSessionRefresh();
    if (pending) {
      await pending.catch(() => undefined);
    }
    const wechatCode = await loginCode();
    const response = await requestWebAuth("/email/confirm", {
      email,
      code: emailCode,
      wechatCode,
      deviceId: getDeviceId()
    });
    // An explicit link confirmation supersedes any background /wechat/login
    // that started before it — bump the epoch so the older response can never
    // overwrite this freshly confirmed session.
    const session = asSession(response);
    state.issuedToken = session.token;
    state.issuedExpiresAt = session.expiresAt;
    if (logoutInFlight || startEpoch !== sessionEpoch) {
      throw new Error("登录状态已变更，请重试");
    }
    sessionEpoch += 1;
    const stored = storeApiSession(session);
    return stored;
  })();
  // Occupy the single-flight slot for the whole confirmation: a 401 landing
  // while loginCode()//email/confirm is pending must await this run instead
  // of starting a /wechat/login that would rotate the confirmation token
  // server-side before we ever store it.
  registerPendingRefreshState(state, run);
  pendingEmailConfirmation = run;
  const release = () => {
    releasePendingRefreshState(state, run);
    if (pendingEmailConfirmation === run) {
      pendingEmailConfirmation = null;
    }
  };
  run.then(release, release);
  return run;
}
