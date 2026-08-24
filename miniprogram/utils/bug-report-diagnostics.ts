import { getMiniProgramEnv } from "../config/env";
import { GRAPHQL_WORKLOADS } from "../services/graphql-cooldown";

const GRAPHQL_RATE_LIMIT_POLICIES = new Set([
  "graphql-v2",
  "graphql-v3",
  "graphql-v4",
]);
const GRAPHQL_RATE_LIMIT_SCOPES = new Set(["global", "client", "workload"]);
const SAFE_DIAGNOSTIC_CODE = /^[A-Z][A-Z0-9_]{0,79}$/;

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, maxLength)
    : undefined;
}

function allowedEnum(
  value: unknown,
  allowed: ReadonlySet<string>,
  maxLength = 80,
): string | undefined {
  const candidate = boundedString(value, maxLength);
  return candidate && allowed.has(candidate) ? candidate : undefined;
}

export type BugReportDiagnostic = {
  at?: string;
  requestId?: string;
  message?: string;
  code?: string;
  status?: number;
  retryAfterSeconds?: number;
  rateLimitPolicy?: string;
  rateLimitScope?: string;
  workload?: string;
  operation?: string;
};

const MAX_DIAGNOSTICS = 3;
const diagnostics: BugReportDiagnostic[] = [];

export function recordBugReportDiagnostic(entry: BugReportDiagnostic): void {
  const status = entry.status;
  const retryAfterSeconds = entry.retryAfterSeconds;
  const code = boundedString(entry.code, 80);
  diagnostics.push({
    at: boundedString(entry.at, 40),
    requestId: boundedString(entry.requestId, 80),
    message: boundedString(entry.message, 180),
    code: code && SAFE_DIAGNOSTIC_CODE.test(code) ? code : undefined,
    status:
      typeof status === "number" &&
      Number.isSafeInteger(status) &&
      status >= 0 &&
      status <= 599
        ? status
        : undefined,
    retryAfterSeconds:
      typeof retryAfterSeconds === "number" &&
      Number.isSafeInteger(retryAfterSeconds) &&
      retryAfterSeconds >= 0 &&
      retryAfterSeconds <= 120
        ? retryAfterSeconds
        : undefined,
    rateLimitPolicy: allowedEnum(
      entry.rateLimitPolicy,
      GRAPHQL_RATE_LIMIT_POLICIES,
      32,
    ),
    rateLimitScope: allowedEnum(
      entry.rateLimitScope,
      GRAPHQL_RATE_LIMIT_SCOPES,
      16,
    ),
    workload: allowedEnum(
      entry.workload,
      new Set<string>(GRAPHQL_WORKLOADS),
      32,
    ),
    operation: boundedString(entry.operation, 80),
  });
  if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift();
}

export function readBugReportDiagnostics(): BugReportDiagnostic[] {
  return diagnostics.map((item) => ({ ...item }));
}

export function resetBugReportDiagnosticsForTests(): void {
  diagnostics.splice(0, diagnostics.length);
}

function readDeviceMeta(): Record<string, unknown> {
  const api = wx as unknown as {
    getDeviceInfo?: () => {
      platform?: string;
      system?: string;
    };
    getWindowInfo?: () => {
      windowWidth?: number;
      windowHeight?: number;
    };
    getAppBaseInfo?: () => {
      SDKVersion?: string;
      language?: string;
    };
  };
  try {
    const device = api.getDeviceInfo?.() ?? {};
    const windowInfo = api.getWindowInfo?.() ?? {};
    const appBase = api.getAppBaseInfo?.() ?? {};
    const system = String(device.system || "");
    const osMajor = system.match(/\d+/)?.[0] || "unknown";
    const width = Number(windowInfo.windowWidth);
    const height = Number(windowInfo.windowHeight);
    const viewportBucket =
      Number.isFinite(width) && Number.isFinite(height)
        ? `${Math.round(width / 40) * 40}x${Math.round(height / 100) * 100}`
        : "unknown";
    return {
      platform: device.platform || "unknown",
      osMajor,
      sdkVersion: appBase.SDKVersion || "unknown",
      language: appBase.language || "unknown",
      viewportBucket,
    };
  } catch {
    return {};
  }
}

export function collectMiniProgramBugReportMeta(): Record<string, unknown> {
  const app = typeof getApp === "function" ? getApp<IAppOption>() : undefined;
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  const page = pages.length ? pages[pages.length - 1] : undefined;
  const device = readDeviceMeta();
  return {
    route: page?.route ?? null,
    currentGw: app?.globalData.currentGw ?? app?.globalData.gw ?? null,
    envVersion: getMiniProgramEnv(),
    clientTime: new Date().toISOString(),
    ...device,
    operations: readBugReportDiagnostics().map((item) => ({
      at: item.at,
      requestId: item.requestId,
      code: item.code,
      status: item.status,
      retryAfterSeconds: item.retryAfterSeconds,
      rateLimitPolicy: item.rateLimitPolicy,
      rateLimitScope: item.rateLimitScope,
      workload: item.workload,
      message: item.message,
      operation: item.operation,
    })),
  };
}
