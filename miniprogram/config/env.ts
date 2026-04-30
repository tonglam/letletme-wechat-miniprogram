export type MiniProgramEnv = "develop" | "trial" | "release";

export const REQUEST_TIMEOUT_MS = 15000;
export const DEFAULT_SEASON = "2526";

const GRAPHQL_ENDPOINT_OVERRIDE_KEY = "letletme_graphql_endpoint_override";

const GRAPHQL_ENDPOINTS: Record<MiniProgramEnv, string> = {
  develop: "http://127.0.0.1:4000/graphql",
  trial: "https://www.letletme.top/api/graphql",
  release: "https://www.letletme.top/api/graphql"
};

export function getMiniProgramEnv(): MiniProgramEnv {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion;
  } catch {
    return "trial";
  }
}

export function getGraphQLEndpoint(): string {
  const override = wx.getStorageSync(GRAPHQL_ENDPOINT_OVERRIDE_KEY);
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }

  return GRAPHQL_ENDPOINTS[getMiniProgramEnv()];
}

export function setGraphQLEndpointOverride(endpoint: string): void {
  wx.setStorageSync(GRAPHQL_ENDPOINT_OVERRIDE_KEY, endpoint);
}

export function clearGraphQLEndpointOverride(): void {
  wx.removeStorageSync(GRAPHQL_ENDPOINT_OVERRIDE_KEY);
}
