import { getMiniProgramApiBase, REQUEST_TIMEOUT_MS } from "../config/env";
import { storageKeys, storagePrefixes } from "../config/storage-keys";
import { clearEntryScopedStorage } from "../utils/storage";
import { recordApi } from "../utils/perf";
import {
  authApiErrorMessage,
  networkErrorMessage,
} from "../utils/request-error";
import { commitEntryBindingState as commitEntryBinding } from "./app-context-state";
import { isStoredSessionUsable } from "./auth-session";
import { clearGraphQLMemoryCache } from "./graphql-session-hooks";

export type MiniProgramEntrySource = "MINI" | "WEB";

export interface MiniProgramProfile {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  accountMode: "MINI_ONLY" | "WEB_LINKED";
  webAccountLinked: boolean;
  followEntryId: number | null;
  webVerifiedEntryId: number | null;
  effectiveEntryId: number | null;
  effectiveEntrySource: MiniProgramEntrySource | null;
  entryConflict: boolean;
  fplEntryId: number | null;
  fplEntryBoundAt: string | null;
  fplEntryVerifiedAt: string | null;
  wechatLinked: boolean;
}

type RawMiniProgramProfile = Partial<MiniProgramProfile> &
  Pick<MiniProgramProfile, "id">;

interface ApiSession {
  token: string;
  expiresAt: string;
  profile: MiniProgramProfile;
}

interface ApiResponse {
  success: boolean;
  error?: string;
  contractVersion?: number;
  authenticated?: boolean;
  webAccountLinked?: boolean;
  linked?: boolean;
  token?: string;
  expiresAt?: string;
  profile?: RawMiniProgramProfile;
}

type MiniProgramApiMethod = "GET" | "POST" | "PUT" | "DELETE";

export class WechatSessionTransportError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "WechatSessionTransportError";
    this.statusCode = statusCode;
  }
}

class MiniProgramApiResponseError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "MiniProgramApiResponseError";
    this.statusCode = statusCode;
  }
}

function isTransientAuthStatus(statusCode: number): boolean {
  return (
    statusCode === 429 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504
  );
}

function loginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) => {
        if (code) resolve(code);
        else reject(new WechatSessionTransportError("微信登录失败，请重试"));
      },
      fail: () =>
        reject(new WechatSessionTransportError("微信登录失败，请重试")),
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
  const memoryFallback =
    deviceIdMemory && SAFE_MINI_PROGRAM_DEVICE_ID.test(deviceIdMemory)
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

function requestMiniProgramApi(
  path: string,
  method: MiniProgramApiMethod,
  data?: Record<string, unknown>,
  token?: string,
): Promise<ApiResponse> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    wx.request<ApiResponse>({
      url: `${getMiniProgramApiBase()}${path}`,
      method,
      data,
      header: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        if (
          response.statusCode < 200 ||
          response.statusCode >= 300 ||
          !response.data?.success
        ) {
          recordApi(`auth:${path}`, Date.now() - t0, false);
          const message = authApiErrorMessage(
            response.statusCode,
            response.data?.error,
          );
          reject(
            isTransientAuthStatus(response.statusCode)
              ? new WechatSessionTransportError(message, response.statusCode)
              : new MiniProgramApiResponseError(message, response.statusCode),
          );
          return;
        }
        recordApi(`auth:${path}`, Date.now() - t0, true);
        resolve(response.data);
      },
      fail(error) {
        recordApi(`auth:${path}`, Date.now() - t0, false);
        reject(new WechatSessionTransportError(networkErrorMessage(error)));
      },
    });
  });
}

function requestWebAuth(
  path: string,
  data: Record<string, unknown>,
): Promise<ApiResponse> {
  return requestMiniProgramApi(path, "POST", data);
}

function positiveEntryId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readLocalEntryId(): number | null {
  try {
    return positiveEntryId(wx.getStorageSync(storageKeys.entryId));
  } catch {
    return null;
  }
}

function normalizeProfile(
  profile: RawMiniProgramProfile,
  webAccountLinkedFallback = false,
): MiniProgramProfile {
  const verifiedEntryId = profile.fplEntryVerifiedAt
    ? positiveEntryId(profile.webVerifiedEntryId ?? profile.fplEntryId)
    : positiveEntryId(profile.webVerifiedEntryId);
  const followEntryId = positiveEntryId(profile.followEntryId);
  const explicitEffectiveEntryId = positiveEntryId(profile.effectiveEntryId);
  const effectiveEntryId =
    explicitEffectiveEntryId ?? followEntryId ?? verifiedEntryId;
  const effectiveEntrySource =
    profile.effectiveEntrySource === "MINI" ||
    profile.effectiveEntrySource === "WEB"
      ? profile.effectiveEntrySource
      : effectiveEntryId === followEntryId
        ? "MINI"
        : effectiveEntryId === verifiedEntryId
          ? "WEB"
          : null;
  const webAccountLinked =
    typeof profile.webAccountLinked === "boolean"
      ? profile.webAccountLinked
      : webAccountLinkedFallback;
  return {
    id: profile.id,
    name: profile.name ?? null,
    email: profile.email ?? null,
    emailVerified: profile.emailVerified === true,
    image: profile.image ?? null,
    createdAt: profile.createdAt ?? "",
    accountMode: webAccountLinked ? "WEB_LINKED" : "MINI_ONLY",
    webAccountLinked,
    followEntryId,
    webVerifiedEntryId: verifiedEntryId,
    effectiveEntryId,
    effectiveEntrySource,
    entryConflict: profile.entryConflict === true,
    fplEntryId: verifiedEntryId,
    fplEntryBoundAt: profile.fplEntryBoundAt ?? null,
    fplEntryVerifiedAt: profile.fplEntryVerifiedAt ?? null,
    wechatLinked: true,
  };
}

function asSession(response: ApiResponse): ApiSession {
  if (!response.token || !response.expiresAt || !response.profile) {
    throw new Error("登录响应不完整，请重新进入小程序");
  }
  return {
    token: response.token,
    expiresAt: response.expiresAt,
    profile: normalizeProfile(
      response.profile,
      response.webAccountLinked ?? response.linked === true,
    ),
  };
}

function clearStoredGraphQLSessionCache(): void {
  try {
    const { keys } = wx.getStorageInfoSync();
    keys
      .filter(
        (key) =>
          key.startsWith(storagePrefixes.graphqlCache) &&
          !key.startsWith(storagePrefixes.graphqlPublicCache),
      )
      .forEach((key) => wx.removeStorageSync(key));
  } catch {}
  clearGraphQLMemoryCache();
}

// In-memory mirror of the platform-encrypted session so hot paths (every
// GraphQL request) never touch storage. `undefined` = encrypted storage has
// not been restored yet; `null` = restoration found no usable session.
let sessionMemory: { token: string; expiresAt: string } | null | undefined;
let accountMutationRevision = 0;
let accountMutationInFlight = 0;

// Bumped on every session clear so a login round trip that was in flight
// before a logout (or an expiry purge) can never re-store a credential
// afterwards.
let sessionEpoch = 0;

interface SessionSnapshot {
  epoch: number;
  token: string;
}

function isCurrentSession(snapshot: SessionSnapshot): boolean {
  return (
    sessionEpoch === snapshot.epoch &&
    getApiSessionToken() === snapshot.token
  );
}

function supportsEncryptedSessionStorage(): boolean {
  try {
    const api = wx as unknown as { canIUse?: (schema: string) => boolean };
    return Boolean(
      api.canIUse?.("setStorage.object.encrypt") &&
      api.canIUse?.("getStorage.object.encrypt"),
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
      },
    } as WechatMiniprogram.GetStorageOption);
  });
}

async function persistEncryptedSessionToken(token: string): Promise<boolean> {
  // Remove a legacy synchronous value before writing the encrypted row. If
  // encryption is unavailable or fails, the session remains memory-only.
  try {
    wx.removeStorageSync(storageKeys.apiSessionToken);
  } catch {}
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
        try {
          wx.removeStorageSync(storageKeys.apiSessionToken);
        } catch {}
        resolve(false);
      },
    } as WechatMiniprogram.SetStorageOption);
  });
}

/** Restores an encrypted credential and upgrades legacy plaintext in place. */
export async function restoreApiSessionCredentials(): Promise<void> {
  await ensureRevocationQueueRestored();
  if (sessionMemory !== undefined) return;
  const expiresAt = wx.getStorageSync(storageKeys.apiSessionExpiresAt) as
    string | undefined;
  const legacyToken = wx.getStorageSync(storageKeys.apiSessionToken) as
    string | undefined;
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
      try {
        wx.removeStorageSync(storageKeys.apiSessionExpiresAt);
      } catch {}
    }
  }
}

async function storeApiSession(session: ApiSession): Promise<ApiSession> {
  const previousToken = sessionMemory?.token;
  const previousProfile = getStoredMiniProgramProfile();
  const bindingReason =
    previousToken === undefined
      ? "login"
      : previousToken !== session.token
        ? "token-rotation"
        : previousProfile?.effectiveEntryId !== session.profile.effectiveEntryId
          ? "rebind"
          : "restore";

  if (previousToken !== session.token) {
    clearStoredGraphQLSessionCache();
  }

  sessionMemory = { token: session.token, expiresAt: session.expiresAt };
  wx.setStorageSync(storageKeys.apiSessionExpiresAt, session.expiresAt);
  storeReceivedProfile(session.profile, bindingReason);
  const persisted = await persistEncryptedSessionToken(session.token);
  if (!persisted) {
    try {
      wx.removeStorageSync(storageKeys.apiSessionExpiresAt);
    } catch {}
  }
  return session;
}

export function clearApiSession(): void {
  sessionEpoch += 1;
  sessionMemory = undefined;
  clearStoredGraphQLSessionCache();
  const retainedEntryId = readLocalEntryId();
  [
    storageKeys.apiSessionToken,
    storageKeys.apiSessionExpiresAt,
    storageKeys.apiProfileFplEntryId,
    storageKeys.apiProfileEmail,
    storageKeys.apiProfileCheckedAt,
    storageKeys.apiProfileV2,
  ].forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch {}
  });
  // Device logout only revokes credentials. The selected Mini Program team
  // remains a local viewer preference and is restored by the next wx.login.
  commitEntryBinding(retainedEntryId, "logout");
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
    storageKeys.apiProfileEmail,
    storageKeys.apiProfileCheckedAt,
    storageKeys.apiProfileV2,
  ].forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch {}
  });
}

interface StoredPendingFollowEntry {
  version: 1;
  entryId: number | null;
}

interface StoredPendingEntryChoice {
  version: 1;
  choice: MiniProgramEntrySource;
  miniEntryId: number;
  webEntryId: number;
}

function readPendingFollowEntry(): number | null | undefined {
  try {
    const stored = wx.getStorageSync(storageKeys.pendingFollowEntry) as
      Partial<StoredPendingFollowEntry> | undefined;
    if (!stored || stored.version !== 1) return undefined;
    if (stored.entryId === null) return null;
    return positiveEntryId(stored.entryId) ?? undefined;
  } catch {
    return undefined;
  }
}

function writePendingFollowEntry(entryId: number | null): void {
  wx.setStorageSync(storageKeys.pendingFollowEntry, {
    version: 1,
    entryId,
  } satisfies StoredPendingFollowEntry);
}

function clearPendingFollowEntry(expected: number | null): void {
  if (readPendingFollowEntry() !== expected) return;
  try {
    wx.removeStorageSync(storageKeys.pendingFollowEntry);
  } catch {}
}

function readPendingEntryChoice(): StoredPendingEntryChoice | null {
  try {
    const value = wx.getStorageSync(storageKeys.pendingEntryChoice) as
      Partial<StoredPendingEntryChoice> | undefined;
    const miniEntryId = positiveEntryId(value?.miniEntryId);
    const webEntryId = positiveEntryId(value?.webEntryId);
    if (
      value?.version !== 1 ||
      (value.choice !== "MINI" && value.choice !== "WEB") ||
      !miniEntryId ||
      !webEntryId ||
      miniEntryId === webEntryId
    ) {
      return null;
    }
    return { version: 1, choice: value.choice, miniEntryId, webEntryId };
  } catch {
    return null;
  }
}

function writePendingEntryChoice(value: StoredPendingEntryChoice): void {
  wx.setStorageSync(storageKeys.pendingEntryChoice, value);
}

function clearPendingEntryChoice(expected?: StoredPendingEntryChoice): void {
  const current = readPendingEntryChoice();
  if (
    expected &&
    (current?.choice !== expected.choice ||
      current.miniEntryId !== expected.miniEntryId ||
      current.webEntryId !== expected.webEntryId)
  ) {
    return;
  }
  try {
    wx.removeStorageSync(storageKeys.pendingEntryChoice);
  } catch {}
}

function hasInitializedMiniProgramProfile(): boolean {
  try {
    return wx.getStorageSync(storageKeys.apiProfileV2Initialized) === true;
  } catch {
    return false;
  }
}

export function getStoredMiniProgramProfile(): MiniProgramProfile | null {
  if (!getApiSessionToken()) return null;
  try {
    const value = wx.getStorageSync(storageKeys.apiProfileV2) as unknown;
    if (!value || typeof value !== "object" || !("id" in value)) return null;
    const id = (value as { id?: unknown }).id;
    if (typeof id !== "string" || !id) return null;
    return normalizeProfile(value as RawMiniProgramProfile);
  } catch {
    return null;
  }
}

function persistMiniProgramProfile(profile: MiniProgramProfile): void {
  wx.setStorageSync(storageKeys.apiProfileV2, profile);
  wx.setStorageSync(storageKeys.apiProfileV2Initialized, true);
  wx.setStorageSync(storageKeys.apiProfileCheckedAt, Date.now());
  wx.setStorageSync(
    storageKeys.apiProfileFplEntryId,
    profile.webVerifiedEntryId || 0,
  );
  persistProfileEmail(profile.webAccountLinked ? profile.email : null);
}

function applyEffectiveEntry(
  entryId: number | null,
  reason: "restore" | "login" | "logout" | "rebind" | "token-rotation",
): void {
  const previousEntryId = readLocalEntryId();
  if (previousEntryId !== entryId) {
    clearEntryScopedStorage();
    clearStoredGraphQLSessionCache();
  }
  if (entryId) {
    wx.setStorageSync(storageKeys.entryId, entryId);
  } else {
    try {
      wx.removeStorageSync(storageKeys.entryId);
    } catch {}
  }
  commitEntryBinding(entryId, reason);
}

function storeReceivedProfile(
  profile: MiniProgramProfile,
  reason: "restore" | "login" | "logout" | "rebind" | "token-rotation",
): MiniProgramProfile {
  const previousProfile = getStoredMiniProgramProfile();
  const previousEntryId = readLocalEntryId();
  if (
    !hasInitializedMiniProgramProfile() &&
    readPendingFollowEntry() === undefined &&
    previousEntryId &&
    profile.followEntryId === null
  ) {
    // One-time upgrade for existing installs: their local follow predates the
    // standalone account table, so queue it before the first v2 profile can
    // replace the local pointer with a Web-linked entry.
    writePendingFollowEntry(previousEntryId);
  }
  const pendingFollow = readPendingFollowEntry();
  const storedProfile =
    pendingFollow === undefined
      ? profile
      : {
          ...profile,
          followEntryId: pendingFollow,
          effectiveEntryId: pendingFollow,
          effectiveEntrySource:
            pendingFollow === null ? null : ("MINI" as const),
        };
  if (
    previousProfile?.id !== storedProfile.id ||
    previousProfile?.webAccountLinked !== storedProfile.webAccountLinked ||
    previousProfile?.webVerifiedEntryId !== storedProfile.webVerifiedEntryId ||
    previousProfile?.effectiveEntryId !== storedProfile.effectiveEntryId
  ) {
    clearStoredGraphQLSessionCache();
  }
  persistMiniProgramProfile(storedProfile);
  applyEffectiveEntry(
    pendingFollow === undefined
      ? storedProfile.effectiveEntryId
      : pendingFollow,
    reason,
  );
  return storedProfile;
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

/** Display-only Web relation; the Mini Program session is independent. */
export function getLinkedAccountSnapshot(): LinkedAccountSnapshot {
  const profile = getStoredMiniProgramProfile();
  const linked = profile?.webAccountLinked === true;
  if (!linked) return { linked: false, email: "" };
  return { linked: true, email: profile.email?.trim() || "" };
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
    }),
  };
}

function writeRevocationQueueSnapshot(
  snapshot: StoredRevocationQueue,
  attempt = 1,
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
          fail: retry,
        });
        return;
      }
      wx.setStorage({
        key: storageKeys.pendingSessionRevocations,
        data: snapshot,
        encrypt: true,
        success: () => resolve(true),
        fail: retry,
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
  const message =
    typeof error === "object" && error !== null && "errMsg" in error
      ? String((error as { errMsg?: unknown }).errMsg)
      : String(error ?? "");
  return /(?:data|key).*(?:not found|not exist)|not found|no data/i.test(
    message,
  );
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
          const data = result.data as
            Partial<StoredRevocationQueue> | undefined;
          const entries =
            data?.version === 1 && Array.isArray(data.entries)
              ? data.entries
              : null;
          let dirty = entries === null;
          if (entries) {
            const now = Date.now();
            entries.forEach((entry) => {
              if (
                typeof entry?.token === "string" &&
                entry.token.length > 0 &&
                Number.isFinite(entry.expiresAt) &&
                entry.expiresAt > now
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
        },
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
    Math.max(retainedRefreshTokenExpiry.get(token) ?? 0, expiry),
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
  promise: Promise<ApiSession>,
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
  promise: Promise<ApiSession>,
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
        recordApi(
          "auth:/session",
          Date.now() - t0,
          response.statusCode >= 200 && response.statusCode < 300,
        );
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
      },
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
  await Promise.all(
    pendingStates.map((state) => state.promise.catch(() => undefined)),
  );
  if (queueRestoredForLogout && revocationQueueWriteDirty) {
    revocationQueueWriteDirty = false;
    await persistRetainedRefreshTokens();
  }

  discardExpiredRetainedRefreshTokens();
  const tokenExpiries = new Map<string, string | null>();
  if (token) tokenExpiries.set(token, tokenExpiresAt ?? null);
  pendingStates.forEach((state) => {
    if (state.issuedToken)
      tokenExpiries.set(state.issuedToken, state.issuedExpiresAt);
  });
  retainedRefreshTokens.forEach((retainedToken) => {
    const expiry = retainedRefreshTokenExpiry.get(retainedToken);
    if (expiry)
      tokenExpiries.set(retainedToken, new Date(expiry).toISOString());
  });
  const tokens = [
    ...new Set(
      [
        token,
        ...pendingStates.map((state) => state.issuedToken),
        ...retainedRefreshTokens,
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  if (tokens.length === 0) {
    await revocationPersistChain;
    return { localCleared: true, remoteRevoked: queueRestoredForLogout };
  }

  const revocations = await Promise.all(
    tokens.map(async (currentToken) => {
      const revoked = await revokeSessionToken(currentToken);
      if (revoked) {
        forgetRetainedRefreshToken(currentToken);
      } else {
        retainRefreshToken(currentToken, tokenExpiries.get(currentToken));
      }
      return revoked;
    }),
  );
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

/** Creates or restores the independent Mini Program account for this WeChat identity. */
async function performWechatSessionRefresh(
  onSessionIssued?: (token: string, expiresAt: string) => void,
): Promise<ApiSession> {
  const epoch = sessionEpoch;
  const code = await loginCode();
  const response = await requestWebAuth("/wechat/login", {
    code,
    deviceId: getDeviceId(),
    contractVersion: 2,
  });
  if (response.contractVersion !== 2 || response.authenticated !== true) {
    if (epoch !== sessionEpoch) {
      throw new Error("登录状态已变更，请重试");
    }
    clearSessionCredentials();
    throw new Error("小程序账户登录响应不完整，请稍后重试");
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
    issuedExpiresAt: null,
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

function profileFromResponse(response: ApiResponse): MiniProgramProfile {
  if (!response.profile) {
    throw new Error("账户响应不完整，请稍后重试");
  }
  return normalizeProfile(
    response.profile,
    response.webAccountLinked ?? response.profile.webAccountLinked === true,
  );
}

async function requestAuthenticatedProfile(
  path: string,
  method: MiniProgramApiMethod,
  data?: Record<string, unknown>,
  tokenInput?: string,
): Promise<MiniProgramProfile> {
  const token = tokenInput || getApiSessionToken();
  if (!token) throw new MiniProgramApiResponseError("请重新进入小程序", 401);
  return profileFromResponse(
    await requestMiniProgramApi(path, method, data, token),
  );
}

async function ensureMiniProgramSessionToken(): Promise<string> {
  const existing = getApiSessionToken();
  if (existing) return existing;
  return (await refreshWechatApiSession()).token;
}

async function requestProfileWithSessionRetry(
  path: string,
  method: MiniProgramApiMethod,
  data?: Record<string, unknown>,
): Promise<MiniProgramProfile> {
  let token = await ensureMiniProgramSessionToken();
  const requestEpoch = sessionEpoch;
  try {
    return await requestAuthenticatedProfile(path, method, data, token);
  } catch (error) {
    if (
      !(error instanceof MiniProgramApiResponseError) ||
      error.statusCode !== 401
    ) {
      throw error;
    }
    // Do not clear a newer session because a request issued with an older
    // token finally received 401. The caller will use the current credential.
    if (sessionEpoch !== requestEpoch || getApiSessionToken() !== token) {
      token = await ensureMiniProgramSessionToken();
      return requestAuthenticatedProfile(path, method, data, token);
    }
    clearSessionCredentials();
    token = (await refreshWechatApiSession()).token;
    return requestAuthenticatedProfile(path, method, data, token);
  }
}

function scheduleEntryConflictPrompt(profile: MiniProgramProfile): void {
  if (
    !profile.entryConflict ||
    !profile.followEntryId ||
    !profile.webVerifiedEntryId ||
    typeof wx.showModal !== "function"
  ) {
    return;
  }
  queuedEntryConflictProfile = profile;
  if (pendingEntryConflictResolution || entryConflictPromptScheduled) return;
  entryConflictPromptScheduled = true;
  setTimeout(() => {
    entryConflictPromptScheduled = false;
    const queued = queuedEntryConflictProfile;
    queuedEntryConflictProfile = null;
    if (queued) void resolveEntryConflict(queued);
  }, 0);
}

let pendingEntryConflictResolution: Promise<void> | null = null;
let queuedEntryConflictProfile: MiniProgramProfile | null = null;
let entryConflictPromptScheduled = false;

function showEntryConflictModal(profile: MiniProgramProfile): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: "选择要查看的球队",
      content: `小程序球队 #${profile.followEntryId} 与网页球队 #${profile.webVerifiedEntryId} 不同。默认保留小程序球队，也可以改用网页球队。`,
      confirmText: "使用网页",
      cancelText: "保留小程序",
      success: ({ confirm }) => resolve(confirm),
      fail: () => resolve(false),
    });
  });
}

async function chooseEntrySource(
  profile: MiniProgramProfile,
  choice: MiniProgramEntrySource,
): Promise<MiniProgramProfile> {
  if (!profile.followEntryId || !profile.webVerifiedEntryId) return profile;
  const next = await requestProfileWithSessionRetry("/entry-choice", "PUT", {
    choice,
    miniEntryId: profile.followEntryId,
    webEntryId: profile.webVerifiedEntryId,
  });
  return storeReceivedProfile(next, "rebind");
}

async function resolveEntryConflict(
  profile: MiniProgramProfile,
): Promise<void> {
  if (pendingEntryConflictResolution) {
    queuedEntryConflictProfile = profile;
    return pendingEntryConflictResolution;
  }
  const run = (async () => {
    const current = getStoredMiniProgramProfile();
    if (
      !current?.entryConflict ||
      current.followEntryId !== profile.followEntryId ||
      current.webVerifiedEntryId !== profile.webVerifiedEntryId
    ) {
      return;
    }
    // Persist MINI before opening the dialog. Closing or interrupting the
    // modal therefore has a deterministic default and the exact pair is not
    // prompted again on another launch.
    try {
      await chooseEntrySource(profile, "MINI");
    } catch {
      return;
    }
    if (!(await showEntryConflictModal(profile))) return;
    const pendingChoice: StoredPendingEntryChoice = {
      version: 1,
      choice: "WEB",
      miniEntryId: profile.followEntryId as number,
      webEntryId: profile.webVerifiedEntryId as number,
    };
    writePendingEntryChoice(pendingChoice);
    try {
      await replayPendingEntryChoice();
    } catch {
      try {
        wx.showToast({ title: "网页球队选择未保存，请稍后重试", icon: "none" });
      } catch {}
    }
  })();
  pendingEntryConflictResolution = run;
  try {
    await run;
  } finally {
    if (pendingEntryConflictResolution === run) {
      pendingEntryConflictResolution = null;
    }
    const queued = queuedEntryConflictProfile;
    queuedEntryConflictProfile = null;
    if (queued) scheduleEntryConflictPrompt(queued);
  }
}

async function replayPendingEntryChoice(
  sessionSnapshot?: SessionSnapshot,
): Promise<MiniProgramProfile | null> {
  const pending = readPendingEntryChoice();
  if (!pending) return null;
  try {
    const profile = await requestProfileWithSessionRetry(
      "/entry-choice",
      "PUT",
      {
        choice: pending.choice,
        miniEntryId: pending.miniEntryId,
        webEntryId: pending.webEntryId,
      },
    );
    if (sessionSnapshot && !isCurrentSession(sessionSnapshot)) return null;
    clearPendingEntryChoice(pending);
    return storeReceivedProfile(profile, "rebind");
  } catch (error) {
    if (sessionSnapshot && !isCurrentSession(sessionSnapshot)) return null;
    if (
      error instanceof MiniProgramApiResponseError &&
      error.statusCode === 409
    ) {
      clearPendingEntryChoice(pending);
      return null;
    }
    throw error;
  }
}

async function replayPendingFollowEntry(
  expectedMutationRevision = accountMutationRevision,
  sessionSnapshot?: SessionSnapshot,
): Promise<MiniProgramProfile | null> {
  const pending = readPendingFollowEntry();
  if (pending === undefined) return null;
  const profile =
    pending === null
      ? await requestProfileWithSessionRetry("/follow-entry", "DELETE")
      : await requestProfileWithSessionRetry("/follow-entry", "PUT", {
          entryId: pending,
        });
  if (
    expectedMutationRevision !== accountMutationRevision ||
    (sessionSnapshot && !isCurrentSession(sessionSnapshot))
  ) {
    return null;
  }
  clearPendingFollowEntry(pending);
  return storeReceivedProfile(profile, "rebind");
}

let pendingAccountSynchronization: Promise<MiniProgramProfile> | null = null;

/**
 * Personal pages need a fresh standalone-account profile before they snapshot
 * the local viewer entry. Keep this short enough to notice a selection made in
 * another client without adding a profile request on every warm page render.
 */
export const MINI_PROGRAM_PROFILE_MAX_AGE_MS = 60 * 1000;

export function getMiniProgramProfileCheckedAt(): number | null {
  try {
    const checkedAt = Number(
      wx.getStorageSync(storageKeys.apiProfileCheckedAt),
    );
    return Number.isFinite(checkedAt) && checkedAt > 0 ? checkedAt : null;
  } catch {
    return null;
  }
}

export function isMiniProgramProfileFresh(
  maxAgeMs = MINI_PROGRAM_PROFILE_MAX_AGE_MS,
  now = Date.now(),
): boolean {
  const profile = getStoredMiniProgramProfile();
  const checkedAt = getMiniProgramProfileCheckedAt();
  const age =
    checkedAt === null || checkedAt > now ? Infinity : now - checkedAt;
  return Boolean(profile) && age < Math.max(0, maxAgeMs);
}

function hasPendingAccountMutation(): boolean {
  return (
    readPendingFollowEntry() !== undefined ||
    readPendingEntryChoice() !== null
  );
}

/**
 * Refresh the standalone profile only when the cached profile is stale. The
 * synchronization function itself remains single-flight and still replays
 * pending offline follow changes.
 */
export async function ensureMiniProgramAccountFresh(
  options: {
    maxAgeMs?: number;
    forceRefresh?: boolean;
  } = {},
): Promise<MiniProgramProfile | null> {
  if (!getApiSessionToken()) return null;
  if (
    !options.forceRefresh &&
    !hasPendingAccountMutation() &&
    isMiniProgramProfileFresh(options.maxAgeMs)
  ) {
    return getStoredMiniProgramProfile();
  }
  return synchronizeMiniProgramAccount();
}

/** Restores the server profile and replays any offline/local team change. */
export function synchronizeMiniProgramAccount(): Promise<MiniProgramProfile> {
  if (pendingAccountSynchronization) return pendingAccountSynchronization;
  const run = (async () => {
    for (;;) {
      const token = await ensureMiniProgramSessionToken();
      const sessionSnapshot: SessionSnapshot = {
        epoch: sessionEpoch,
        token,
      };
      const synchronizationRevision = accountMutationRevision;
      const mutationInFlight = accountMutationInFlight > 0;
      const pendingFollowAtStart = readPendingFollowEntry() !== undefined;
      const serverProfile = await requestProfileWithSessionRetry(
        "/profile",
        "GET",
      );
      // A profile response may have been issued before logout, token rotation,
      // or an email confirmation installed a newer session. Never let that
      // response overwrite the newer viewer; restart the sync under the
      // current credential instead.
      if (!isCurrentSession(sessionSnapshot)) continue;
      let profile =
        synchronizationRevision === accountMutationRevision &&
        !mutationInFlight &&
        !pendingFollowAtStart
          ? storeReceivedProfile(serverProfile, "restore")
          : (getStoredMiniProgramProfile() ?? serverProfile);
      profile =
        (await replayPendingFollowEntry(
          synchronizationRevision,
          sessionSnapshot,
        )) ?? profile;
      if (!isCurrentSession(sessionSnapshot)) continue;
      profile =
        (await replayPendingEntryChoice(sessionSnapshot).catch(() => null)) ??
        profile;
      if (!isCurrentSession(sessionSnapshot)) continue;
      scheduleEntryConflictPrompt(profile);
      return profile;
    }
  })();
  pendingAccountSynchronization = run;
  const release = () => {
    if (pendingAccountSynchronization === run) {
      pendingAccountSynchronization = null;
    }
  };
  run.then(release, release);
  return run;
}

/**
 * Changes the Mini Program viewer team locally first, then syncs it to the
 * standalone account. A failed network write remains queued for next launch.
 */
export async function saveMiniProgramFollowEntry(
  entryId: number | null,
): Promise<boolean> {
  const normalized = entryId === null ? null : positiveEntryId(entryId);
  if (entryId !== null && !normalized) {
    throw new Error("请输入有效的参赛 ID");
  }
  const mutationRevision = ++accountMutationRevision;
  accountMutationInFlight += 1;
  writePendingFollowEntry(normalized);
  applyEffectiveEntry(normalized, "rebind");
  try {
    const profile = await replayPendingFollowEntry(mutationRevision);
    if (profile) scheduleEntryConflictPrompt(profile);
    return true;
  } catch {
    return false;
  } finally {
    accountMutationInFlight -= 1;
  }
}

/** Removes only the optional Web relation; Mini identity/session/follow survive. */
export async function unlinkMiniProgramWebAccount(): Promise<MiniProgramProfile> {
  const profile = await requestProfileWithSessionRetry(
    "/account-link",
    "DELETE",
  );
  clearPendingEntryChoice();
  return storeReceivedProfile(profile, "rebind");
}

export async function startMiniProgramEmailLink(email: string): Promise<void> {
  await requestWebAuth("/email/start", { email, deviceId: getDeviceId() });
}

export function confirmMiniProgramEmailLink(
  email: string,
  emailCode: string,
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
    issuedExpiresAt: null,
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
      deviceId: getDeviceId(),
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
    const stored = await storeApiSession(session);
    const syncedProfile = await replayPendingFollowEntry().catch(() => null);
    if (syncedProfile) stored.profile = syncedProfile;
    scheduleEntryConflictPrompt(stored.profile);
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
