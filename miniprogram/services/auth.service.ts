import { getMiniProgramApiBase, REQUEST_TIMEOUT_MS } from "../config/env";
import { storageKeys, storagePrefixes } from "../config/storage-keys";
import { clearEntryScopedStorage } from "../utils/storage";
import { recordApi } from "../utils/perf";
import {
  authApiErrorMessage,
  networkErrorMessage
} from "../utils/request-error";
import { isStoredSessionUsable, MiniProgramLinkRequiredError } from "./auth-session";

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

function loginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) => {
        if (code) resolve(code);
        else reject(new Error("微信登录失败，请重试"));
      },
      fail: () => reject(new Error("微信登录失败，请重试"))
    });
  });
}

function getDeviceId(): string {
  const existing = wx.getStorageSync(storageKeys.deviceId) as string | undefined;
  if (existing && existing.length >= 8) return existing;
  const generated = `wx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  wx.setStorageSync(storageKeys.deviceId, generated);
  return generated;
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
          reject(new Error(authApiErrorMessage(response.statusCode, response.data?.error)));
          return;
        }
        recordApi(`auth:${path}`, Date.now() - t0, true);
        resolve(response.data);
      },
      fail(error) {
        recordApi(`auth:${path}`, Date.now() - t0, false);
        reject(new Error(networkErrorMessage(error)));
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
}

// In-memory mirror of the persisted session so hot paths (every GraphQL
// request) never hit synchronous storage. `undefined` = unknown, re-read
// storage on next access; `null` = storage was checked and has no session.
// clearApiSession resets to `undefined` (not `null`) so the next read
// reconciles with storage — one extra sync read per sign-out, and resilient
// to any out-of-band storage write.
let sessionMemory: { token: string; expiresAt: string } | null | undefined;

function storeApiSession(session: ApiSession): ApiSession {
  const previousToken = wx.getStorageSync(storageKeys.apiSessionToken) as string | undefined;
  const previousEntryId = Number(wx.getStorageSync(storageKeys.entryId));
  const nextEntryId = session.profile.fplEntryId && session.profile.fplEntryVerifiedAt
    ? session.profile.fplEntryId
    : undefined;

  if (previousToken !== session.token) {
    clearStoredGraphQLSessionCache();
  }
  if (previousEntryId !== nextEntryId) {
    clearEntryScopedStorage();
  }

  sessionMemory = { token: session.token, expiresAt: session.expiresAt };
  wx.setStorageSync(storageKeys.apiSessionToken, session.token);
  wx.setStorageSync(storageKeys.apiSessionExpiresAt, session.expiresAt);
  if (nextEntryId) {
    wx.setStorageSync(storageKeys.entryId, nextEntryId);
    try {
      getApp<IAppOption>().globalData.entryId = nextEntryId;
    } catch {}
  } else {
    // Never let a previous account's local selection masquerade as the
    // newly authenticated account's verified entry.
    wx.removeStorageSync(storageKeys.entryId);
    try {
      getApp<IAppOption>().globalData.entryId = undefined;
    } catch {}
  }
  return session;
}

export function clearApiSession(): void {
  sessionMemory = undefined;
  clearStoredGraphQLSessionCache();
  clearEntryScopedStorage();
  [storageKeys.apiSessionToken, storageKeys.apiSessionExpiresAt, storageKeys.entryId]
    .forEach((key) => {
      try {
        wx.removeStorageSync(key);
      } catch {}
    });
  try {
    getApp<IAppOption>().globalData.entryId = undefined;
  } catch {}
}

export function getApiSessionToken(): string | null {
  if (sessionMemory === undefined) {
    const token = wx.getStorageSync(storageKeys.apiSessionToken) as string | undefined;
    const expiresAt = wx.getStorageSync(storageKeys.apiSessionExpiresAt) as string | undefined;
    sessionMemory = token || expiresAt ? { token: token || "", expiresAt: expiresAt || "" } : null;
  }
  if (!sessionMemory) return null;
  if (!isStoredSessionUsable(sessionMemory.token, sessionMemory.expiresAt)) {
    clearExpiredSession();
    return null;
  }
  return sessionMemory.token || null;
}

/**
 * Session-expiry cleanup. Unlike clearApiSession, the entry binding is
 * kept: the account is the same person and the imminent single-flight
 * refresh re-asserts the binding authoritatively — wiping it here would
 * flash the account-link empty state on pages that open before the
 * refresh lands.
 */
function clearExpiredSession(): void {
  sessionMemory = undefined;
  clearStoredGraphQLSessionCache();
  [storageKeys.apiSessionToken, storageKeys.apiSessionExpiresAt].forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch {}
  });
}

export async function logoutMiniProgramSession(): Promise<void> {
  const token = getApiSessionToken();
  if (!token) {
    clearApiSession();
    return;
  }

  const t0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    wx.request<ApiResponse>({
      url: `${getMiniProgramApiBase()}/session`,
      method: "DELETE",
      header: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        recordApi("auth:/session", Date.now() - t0, response.statusCode >= 200 && response.statusCode < 300);
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(authApiErrorMessage(response.statusCode, response.data?.error)));
      },
      fail(error) {
        recordApi("auth:/session", Date.now() - t0, false);
        reject(new Error(networkErrorMessage(error)));
      }
    });
  });
  clearApiSession();
}

/** Uses only web-owned identity. FPL entry IDs are inherited from the verified account. */
async function performWechatSessionRefresh(): Promise<ApiSession> {
  const code = await loginCode();
  const response = await requestWebAuth("/wechat/login", {
    code,
    deviceId: getDeviceId()
  });
  if (!response.linked) {
    // The WeChat identity was understood and is not linked, so retaining a
    // previous account would be unsafe. Network/login failures above retain a
    // still-valid session for offline resilience.
    clearApiSession();
    throw new MiniProgramLinkRequiredError();
  }
  return storeApiSession(asSession(response));
}

let pendingRefresh: Promise<ApiSession> | null = null;

/**
 * Single-flight session refresh: concurrent callers (e.g. several requests
 * failing with 401 at once) share one wx.login + /wechat/login round trip.
 */
export function refreshWechatApiSession(): Promise<ApiSession> {
  if (pendingRefresh) {
    return pendingRefresh;
  }
  const refresh = performWechatSessionRefresh();
  pendingRefresh = refresh;
  const release = () => {
    if (pendingRefresh === refresh) {
      pendingRefresh = null;
    }
  };
  refresh.then(release, release);
  return refresh;
}

/**
 * The in-flight cold-start login, if any. Lets the GraphQL layer wait for a
 * token instead of firing a request that is guaranteed to come back 401.
 */
export function getPendingSessionRefresh(): Promise<unknown> | null {
  return pendingRefresh;
}

export async function startMiniProgramEmailLink(email: string): Promise<void> {
  await requestWebAuth("/email/start", { email, deviceId: getDeviceId() });
}

export async function confirmMiniProgramEmailLink(
  email: string,
  emailCode: string
): Promise<ApiSession> {
  const wechatCode = await loginCode();
  const response = await requestWebAuth("/email/confirm", {
    email,
    code: emailCode,
    wechatCode,
    deviceId: getDeviceId()
  });
  return storeApiSession(asSession(response));
}
