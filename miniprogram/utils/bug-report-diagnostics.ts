import { getMiniProgramEnv } from "../config/env";

export type BugReportDiagnostic = {
  at: string;
  requestId?: string;
  message?: string;
  operation?: string;
};

const MAX_DIAGNOSTICS = 3;
const diagnostics: BugReportDiagnostic[] = [];

export function recordBugReportDiagnostic(entry: BugReportDiagnostic): void {
  diagnostics.push({
    at: entry.at,
    requestId: entry.requestId?.slice(0, 80),
    message: entry.message?.slice(0, 180),
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
      brand?: string;
      model?: string;
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
    return {
      platform: device.platform,
      system: device.system,
      brand: device.brand,
      model: device.model,
      SDKVersion: appBase.SDKVersion,
      language: appBase.language,
      windowWidth: windowInfo.windowWidth,
      windowHeight: windowInfo.windowHeight
    };
  } catch {
    return {};
  }
}

export function collectMiniProgramBugReportMeta(): Record<string, unknown> {
  const app = typeof getApp === "function" ? getApp<IAppOption>() : undefined;
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  const page = pages.length ? pages[pages.length - 1] : undefined;
  return {
    route: page?.route ?? null,
    entryId: app?.globalData.entryId ?? null,
    gw: app?.globalData.gw ?? null,
    envVersion: getMiniProgramEnv(),
    clientTime: new Date().toISOString(),
    device: readDeviceMeta(),
    recentRequests: readBugReportDiagnostics()
  };
}
