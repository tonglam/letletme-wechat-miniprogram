import { getMiniProgramEnv } from "../config/env";

export type BugReportDiagnostic = {
  at?: string;
  requestId?: string;
  message?: string;
  code?: string;
  operation?: string;
};

const MAX_DIAGNOSTICS = 3;
const diagnostics: BugReportDiagnostic[] = [];

export function recordBugReportDiagnostic(entry: BugReportDiagnostic): void {
  diagnostics.push({
    at: entry.at,
    requestId: entry.requestId?.slice(0, 80),
    message: entry.message?.slice(0, 180),
    code: entry.code?.slice(0, 80),
    operation: entry.operation?.slice(0, 80)
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
    const viewportBucket = Number.isFinite(width) && Number.isFinite(height)
      ? `${Math.round(width / 40) * 40}x${Math.round(height / 100) * 100}`
      : "unknown";
    return {
      platform: device.platform || "unknown",
      osMajor,
      sdkVersion: appBase.SDKVersion || "unknown",
      language: appBase.language || "unknown",
      viewportBucket
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
      requestId: item.requestId,
      code: item.code,
      message: item.message,
      operation: item.operation
    }))
  };
}
