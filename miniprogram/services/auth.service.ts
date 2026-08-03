import { getMiniProgramApiBase, REQUEST_TIMEOUT_MS } from "../config/env";
import { storageKeys, storagePrefixes } from "../config/storage-keys";
import { clearEntryScopedStorage } from "../utils/storage";
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
        else reject(new Error("wx.login did not return a code"));
      },
      fail: (error) => reject(new Error(error.errMsg || "wx.login failed"))
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
  return new Promise((resolve, reject) => {
    wx.request<ApiResponse>({
      url: `${getMiniProgramApiBase()}${path}`,
      method: "POST",
      data,
      header: { "content-type": "application/json" },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300 || !response.data?.success) {
          reject(new Error(response.data?.error || `Account request failed: ${response.statusCode}`));
          return;
        }
        resolve(response.data);
      },
      fail(error) {
        reject(new Error(error.errMsg || "Account network request failed"));
      }
    });
  });
}

function asSession(response: ApiResponse): ApiSession {
  if (!response.token || !response.expiresAt || !response.profile) {
    throw new Error("Account session response is incomplete");
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
  const token = wx.getStorageSync(storageKeys.apiSessionToken) as string | undefined;
  const expiresAt = wx.getStorageSync(storageKeys.apiSessionExpiresAt) as string | undefined;
  if (!token && !expiresAt) return null;
  if (!isStoredSessionUsable(token, expiresAt)) {
    clearApiSession();
    return null;
  }
  return token ?? null;
}

export async function logoutMiniProgramSession(): Promise<void> {
  const token = getApiSessionToken();
  if (!token) {
    clearApiSession();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    wx.request<ApiResponse>({
      url: `${getMiniProgramApiBase()}/session`,
      method: "DELETE",
      header: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(response.data?.error || "Sign out failed"));
      },
      fail(error) {
        reject(new Error(error.errMsg || "Sign out network request failed"));
      }
    });
  });
  clearApiSession();
}

/** Uses only web-owned identity. FPL entry IDs are inherited from the verified account. */
export async function refreshWechatApiSession(): Promise<ApiSession> {
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
