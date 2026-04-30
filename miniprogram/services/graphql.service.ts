import { getGraphQLEndpoint, REQUEST_TIMEOUT_MS } from "../config/env";

interface GraphQLError {
  message?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export function graphqlRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const endpoint = getGraphQLEndpoint();
    wx.request<GraphQLResponse<T>>({
      url: endpoint,
      method: "POST",
      data: {
        query,
        variables
      },
      header: {
        "content-type": "application/json"
      },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GraphQL request failed: ${response.statusCode}`));
          return;
        }

        const body = response.data;
        const errorMessage = body?.errors?.map((error) => error.message).filter(Boolean).join("; ");
        if (errorMessage) {
          reject(new Error(errorMessage));
          return;
        }

        if (!body || body.data === undefined || body.data === null) {
          reject(new Error("GraphQL response missing data"));
          return;
        }

        resolve(body.data);
      },
      fail(error) {
        reject(new Error(error.errMsg || "GraphQL network request failed"));
      }
    });
  });
}
