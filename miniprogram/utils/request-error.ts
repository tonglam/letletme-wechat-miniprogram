interface ApiErrorDetail {
  message?: string;
  extensions?: {
    code?: string;
  };
}

export function networkErrorMessage(error?: { errMsg?: string }): string {
  const message = error?.errMsg || "";
  if (message.includes("timeout")) {
    return "网络超时，请稍后重试";
  }
  if (message.includes("abort")) {
    return "请求已取消";
  }
  return "网络连接失败，请检查网络后重试";
}

export function httpErrorMessage(statusCode: number): string {
  if (statusCode === 400) {
    return "数据请求暂时无法处理，请稍后重试";
  }
  if (statusCode === 401) {
    return "登录状态已失效，请重新进入小程序";
  }
  if (statusCode === 403) {
    return "当前账户暂无访问权限";
  }
  if (statusCode === 404) {
    return "请求的内容不存在";
  }
  if (statusCode === 408) {
    return "请求超时，请稍后重试";
  }
  if (statusCode === 429) {
    return "请求过于频繁，请稍后再试";
  }
  if (statusCode >= 500) {
    return "服务器繁忙，请稍后重试";
  }
  return "数据请求失败，请稍后重试";
}

export function graphQLErrorMessage(errors: ApiErrorDetail[] | undefined): string {
  const codes = new Set((errors || []).map((error) => error.extensions?.code).filter(Boolean));
  if (codes.has("UNAUTHENTICATED")) {
    return "登录状态已失效，请重新进入小程序";
  }
  if (codes.has("FORBIDDEN")) {
    return "当前账户暂无访问权限";
  }
  if (codes.has("NOT_FOUND")) {
    return "请求的内容不存在";
  }
  if (codes.has("BAD_USER_INPUT")) {
    return "提交的信息有误，请检查后重试";
  }
  if (codes.has("RATE_LIMITED") || codes.has("TOO_MANY_REQUESTS")) {
    return "请求过于频繁，请稍后再试";
  }
  return "数据暂时无法加载，请稍后重试";
}

export function authApiErrorMessage(statusCode: number, serverMessage?: string): string {
  if (serverMessage && /[\u3400-\u9fff]/.test(serverMessage) && !looksTechnicalErrorMessage(serverMessage)) {
    return serverMessage;
  }
  const normalized = (serverMessage || "").toLowerCase();
  if (normalized.includes("code") && (normalized.includes("invalid") || normalized.includes("expired"))) {
    return "验证码无效或已过期，请重新获取";
  }
  if (normalized.includes("email") && (normalized.includes("invalid") || normalized.includes("required"))) {
    return "请输入有效的邮箱地址";
  }
  if (normalized.includes("too many") || normalized.includes("rate limit")) {
    return "请求过于频繁，请稍后再试";
  }
  return httpErrorMessage(statusCode);
}

/** Raw detail for diagnostics / bug-report meta — not for on-screen copy. */
export function diagnosticErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return String(error.message || error.name || "Error").slice(0, 400);
  }
  if (typeof error === "string") {
    return error.slice(0, 400);
  }
  return "";
}

/**
 * True when a message looks like a runtime/framework leak rather than product copy.
 * Keep this conservative: Chinese product strings stay visible.
 */
export function looksTechnicalErrorMessage(message: string): boolean {
  const text = String(message || "").trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (
    /is not a function|cannot read propert|undefined is not|null is not an object|typeerror|referenceerror|syntaxerror|internal error|stack trace|\.ts:|\.js:|\(0,\s*\w+\./i.test(
      text
    )
  ) {
    return true;
  }
  if (/^\s*at\s+\S+/.test(text) || text.includes("\n    at ")) {
    return true;
  }
  // Internal enum/error tokens must never become user-facing copy.
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(text)) {
    return true;
  }
  // English-only exception-like lines with no CJK product copy.
  if (!/[\u3400-\u9fff]/.test(text) && /error|exception|failed|invalid|undefined|null/i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Page catch sites and error desks should pass thrown values through this helper
 * so users never see raw JS / stack / framework text.
 */
export function userFacingErrorMessage(error: unknown, fallback: string): string {
  const fallbackText = String(fallback || "加载失败，请稍后重试").trim() || "加载失败，请稍后重试";
  const raw = diagnosticErrorDetail(error).trim();
  if (!raw) return fallbackText;
  if (looksTechnicalErrorMessage(raw)) return fallbackText;
  return raw.slice(0, 180);
}
