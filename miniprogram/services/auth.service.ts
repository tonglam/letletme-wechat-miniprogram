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

// Bumped on every session clear so a login round trip that was in flight
// before a logout (or an expiry purge) can never re-store a credential
// afterwards.
let sessionEpoch = 0;

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
  // Every persisted session carries a freshly fetched authoritative profile,
  // so the 24h revalidation throttle keys off this write.
  wx.setStorageSync(storageKeys.apiProfileCheckedAt, Date.now());
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
  sessionEpoch += 1;
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
    clearApiSession();
    return null;
  }
  return sessionMemory.token || null;
}

async function performLogout(): Promise<void> {
  // Settle any in-flight login first: once /wechat/login has reached the
  // server it rotates the device token there regardless of the local epoch,
  // so revoking the pre-rotation token would 401 and strand the session.
  // Awaiting it lets the rotated token be stored, and the DELETE below then
  // revokes the credential the server actually considers current.
  const pending = getPendingSessionRefresh();
  if (pending) {
    await pending.catch(() => undefined);
  }

  const token = getApiSessionToken();
  if (!token) {
    clearApiSession();
    return;
  }

  // From here on, no refresh still in flight may store past the logout.
  sessionEpoch += 1;

  const t0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    wx.request<ApiResponse>({
      url: `${getMiniProgramApiBase()}/session`,
      method: "DELETE",
      header: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        recordApi("auth:/session", Date.now() - t0, response.statusCode >= 200 && response.statusCode < 300);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
          return;
        }
        if (response.statusCode === 401) {
          // The credential is already dead server-side (a rotation raced the
          // settle above): the session is revoked either way, so clean up
          // locally instead of reporting a failed logout.
          resolve();
          return;
        }
        reject(new Error(authApiErrorMessage(response.statusCode, response.data?.error)));
      },
      fail(error) {
        recordApi("auth:/session", Date.now() - t0, false);
        reject(new Error(networkErrorMessage(error)));
      }
    });
  });
  clearApiSession();
}

let pendingLogout: Promise<void> | null = null;

/**
 * Single-flight sign-out: duplicate taps share one DELETE, and the
 * refresh-creation gate stays set until that one logout has fully settled.
 */
export function logoutMiniProgramSession(): Promise<void> {
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
async function performWechatSessionRefresh(): Promise<ApiSession> {
  const epoch = sessionEpoch;
  const code = await loginCode();
  const response = await requestWebAuth("/wechat/login", {
    code,
    deviceId: getDeviceId()
  });
  if (epoch !== sessionEpoch) {
    // A logout, session clear, or explicit email-link confirm landed while
    // the login round trip was in flight — this stale response must not
    // touch session state in either direction (neither store a credential
    // nor clear the session that superseded it).
    throw new Error("登录状态已变更，请重试");
  }
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
    return pendingRefresh;
  }
  if (logoutInFlight) {
    return Promise.reject(new Error("正在退出登录，请稍后重试"));
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
 * Exposes the in-flight refresh (if any) so a 401 handler can await it
 * instead of clearing the session out from under an active login round trip.
 */
export function getPendingSessionRefresh(): Promise<ApiSession> | null {
  return pendingRefresh;
}

export async function startMiniProgramEmailLink(email: string): Promise<void> {
  await requestWebAuth("/email/start", { email, deviceId: getDeviceId() });
}

export function confirmMiniProgramEmailLink(
  email: string,
  emailCode: string
): Promise<ApiSession> {
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
    sessionEpoch += 1;
    return storeApiSession(asSession(response));
  })();
  // Occupy the single-flight slot for the whole confirmation: a 401 landing
  // while loginCode()//email/confirm is pending must await this run instead
  // of starting a /wechat/login that would rotate the confirmation token
  // server-side before we ever store it.
  pendingRefresh = run;
  const release = () => {
    if (pendingRefresh === run) {
      pendingRefresh = null;
    }
  };
  run.then(release, release);
  return run;
}
