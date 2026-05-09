import { getGraphQLEndpoint, REQUEST_TIMEOUT_MS } from "../config/env";
import { storageKeys } from "../config/storage-keys";

const CREATE_WECHAT_API_SESSION = `
  mutation CreateWechatApiSession($code: String!, $fplEntryId: Int) {
    createWechatApiSession(code: $code, fplEntryId: $fplEntryId) {
      token
      expiresAt
      user {
        id
        fplEntryId
      }
    }
  }
`;

interface ApiSession {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    fplEntryId?: number | null;
  };
}

interface CreateWechatApiSessionResponse {
  createWechatApiSession: ApiSession;
}

interface GraphQLError {
  message?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

function getStoredEntryId(): number | undefined {
  const value = wx.getStorageSync(storageKeys.entryId) as number | string | undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function loginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) => {
        if (code) {
          resolve(code);
        } else {
          reject(new Error("wx.login did not return a code"));
        }
      },
      fail: (error) => {
        reject(new Error(error.errMsg || "wx.login failed"));
      }
    });
  });
}

function requestApiSession(code: string, fplEntryId?: number): Promise<ApiSession> {
  return new Promise((resolve, reject) => {
    wx.request<GraphQLResponse<CreateWechatApiSessionResponse>>({
      url: getGraphQLEndpoint(),
      method: "POST",
      data: {
        query: CREATE_WECHAT_API_SESSION,
        variables: {
          code,
          fplEntryId: fplEntryId ?? null
        }
      },
      header: {
        "content-type": "application/json"
      },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`API session request failed: ${response.statusCode}`));
          return;
        }

        const errorMessage = response.data?.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join("; ");
        if (errorMessage) {
          reject(new Error(errorMessage));
          return;
        }

        const session = response.data?.data?.createWechatApiSession;
        if (!session?.token) {
          reject(new Error("API session response missing token"));
          return;
        }
        resolve(session);
      },
      fail(error) {
        reject(new Error(error.errMsg || "API session network request failed"));
      }
    });
  });
}

function storeApiSession(session: ApiSession): ApiSession {
  wx.setStorageSync(storageKeys.apiSessionToken, session.token);
  wx.setStorageSync(storageKeys.apiSessionExpiresAt, session.expiresAt);
  return session;
}

export function clearApiSession(): void {
  try {
    wx.removeStorageSync(storageKeys.apiSessionToken);
    wx.removeStorageSync(storageKeys.apiSessionExpiresAt);
  } catch {}
}

export function getApiSessionToken(): string | null {
  const token = wx.getStorageSync(storageKeys.apiSessionToken) as string | undefined;
  const expiresAt = wx.getStorageSync(storageKeys.apiSessionExpiresAt) as string | undefined;
  if (!token || !expiresAt) return null;

  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now() + 60_000) {
    clearApiSession();
    return null;
  }

  return token;
}

export async function refreshWechatApiSession(entryId?: number): Promise<ApiSession> {
  const code = await loginCode();
  const session = await requestApiSession(code, entryId ?? getStoredEntryId());
  return storeApiSession(session);
}
