export type MiniProgramEnv = "develop" | "trial" | "release";

export const REQUEST_TIMEOUT_MS = 15000;

const GRAPHQL_ENDPOINT_OVERRIDE_KEY = "letletme_graphql_endpoint_override";
const MINIPROGRAM_API_BASE_OVERRIDE_KEY = "letletme_web_miniprogram_api_override";

const GRAPHQL_ENDPOINTS: Record<MiniProgramEnv, string> = {
  develop: "http://localhost:3000/api/graphql",
  trial: "https://www.letletme.top/api/graphql",
  release: "https://www.letletme.top/api/graphql"
};

const MINIPROGRAM_API_BASES: Record<MiniProgramEnv, string> = {
  develop: "http://localhost:3000/api/miniprogram",
  trial: "https://www.letletme.top/api/miniprogram",
  release: "https://www.letletme.top/api/miniprogram"
};

export function getMiniProgramEnv(): MiniProgramEnv {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion;
  } catch {
    return "trial";
  }
}

export function getGraphQLEndpoint(): string {
  const env = getMiniProgramEnv();
  if (env === "develop") {
    const override = wx.getStorageSync(GRAPHQL_ENDPOINT_OVERRIDE_KEY);
    if (typeof override === "string" && override.trim()) {
      return override.trim();
    }
  }

  return GRAPHQL_ENDPOINTS[env];
}

export function getMiniProgramApiBase(): string {
  const env = getMiniProgramEnv();
  if (env === "develop") {
    const override = wx.getStorageSync(MINIPROGRAM_API_BASE_OVERRIDE_KEY);
    if (typeof override === "string" && override.trim()) {
      return override.trim().replace(/\/+$/, "");
    }
  }
  return MINIPROGRAM_API_BASES[env];
}

export function setGraphQLEndpointOverride(endpoint: string): void {
  if (getMiniProgramEnv() === "develop") {
    wx.setStorageSync(GRAPHQL_ENDPOINT_OVERRIDE_KEY, endpoint);
  }
}

export function clearGraphQLEndpointOverride(): void {
  wx.removeStorageSync(GRAPHQL_ENDPOINT_OVERRIDE_KEY);
}
