export type MiniProgramLoginTrigger =
  | "cold_start_missing"
  | "cold_start_expired"
  | "cold_start_restore_failed"
  | "profile_401"
  | "graphql_401"
  | "account_link"
  | "session_missing";

export type MiniProgramAuthEventTrigger =
  | MiniProgramLoginTrigger
  | "logout_revoke";

export type MiniProgramLoginContext = {
  schemaVersion: 1;
  trigger: MiniProgramLoginTrigger;
  platform?: "ios" | "android" | "windows" | "macos" | "linux" | "unknown";
  deviceClass?: "phone" | "tablet" | "desktop" | "unknown";
  osFamily?: "ios" | "android" | "windows" | "macos" | "linux" | "unknown";
  osMajor?: string;
  wechatMajor?: string;
  sdkVersion?: string;
  miniProgramVersion?: string;
  envVersion?: "develop" | "trial" | "release" | "unknown";
  pageRoute?: string;
  encryptedStorageSupported?: boolean;
  credentialState?:
    | "missing"
    | "expired"
    | "restore_failed"
    | "encrypted"
    | "memory_only"
    | "unknown";
};

export type MiniProgramPersistenceResult =
  | { outcome: "encrypted" }
  | { outcome: "memory_only"; reason: "unsupported" | "write_failed" };

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const ROUTE_PATTERN = /^[A-Za-z0-9_./-]{1,160}$/;
const EVENT_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;

function boundedString(value: unknown, pattern: RegExp, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().slice(0, max);
  return candidate && pattern.test(candidate) ? candidate : undefined;
}

function majorVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const major = value.trim().match(/\d{1,4}/)?.[0];
  return major || undefined;
}

function safeVersion(value: unknown): string | undefined {
  return boundedString(value, VERSION_PATTERN, 64);
}

function readPlatform(value: unknown): MiniProgramLoginContext["platform"] {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (
    normalized === "ios" ||
    normalized === "android" ||
    normalized === "windows" ||
    normalized === "macos" ||
    normalized === "linux"
  ) {
    return normalized;
  }
  if (normalized === "mac") return "macos";
  return "unknown";
}

function readDeviceClass(
  model: unknown,
  platform: MiniProgramLoginContext["platform"],
): MiniProgramLoginContext["deviceClass"] {
  const value = typeof model === "string" ? model : "";
  if (/ipad|tablet/i.test(value)) return "tablet";
  if (platform === "windows" || platform === "macos" || platform === "linux") {
    return "desktop";
  }
  if (value) return "phone";
  if (platform === "ios" || platform === "android") return "phone";
  return "unknown";
}

function currentPageRoute(): string | undefined {
  try {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    const route = pages.length ? (pages[pages.length - 1] as { route?: unknown }).route : undefined;
    const current = boundedString(route, ROUTE_PATTERN, 160);
    if (current) return current;
    const launchPath = runtimeApi().getLaunchOptionsSync?.()?.path;
    return boundedString(launchPath, ROUTE_PATTERN, 160);
  } catch {
    return undefined;
  }
}

function runtimeApi(): {
  getDeviceInfo?: () => {
    platform?: unknown;
    system?: unknown;
    model?: unknown;
    deviceModel?: unknown;
  };
  getSystemInfoSync?: () => { platform?: unknown; system?: unknown };
  getLaunchOptionsSync?: () => { path?: unknown };
  getAppBaseInfo?: () => { SDKVersion?: unknown; version?: unknown };
  getAccountInfoSync?: () => { miniProgram?: { envVersion?: unknown; version?: unknown } };
  canIUse?: (schema: string) => boolean;
  getRealtimeLogManager?: () => { info?: (...values: unknown[]) => void };
} {
  return wx as unknown as ReturnType<typeof runtimeApi>;
}

export function createMiniProgramRequestId(): string {
  const random = Math.random().toString(36).slice(2, 14);
  return `wx-${Date.now().toString(36)}-${random}`.slice(0, 128);
}

export function normalizeMiniProgramRequestId(value: unknown): string | undefined {
  return boundedString(value, REQUEST_ID_PATTERN, 128);
}

export function collectMiniProgramLoginContext(
  trigger: MiniProgramLoginTrigger,
  credentialState: MiniProgramLoginContext["credentialState"] = "unknown",
): MiniProgramLoginContext {
  const api = runtimeApi();
  let device: ReturnType<NonNullable<typeof api.getDeviceInfo>> = {};
  let systemInfo: ReturnType<NonNullable<typeof api.getSystemInfoSync>> = {};
  let appBase: ReturnType<NonNullable<typeof api.getAppBaseInfo>> = {};
  let account: ReturnType<NonNullable<typeof api.getAccountInfoSync>> = {};
  try {
    device = api.getDeviceInfo?.() ?? {};
  } catch {}
  try {
    systemInfo = api.getSystemInfoSync?.() ?? {};
  } catch {}
  try {
    appBase = api.getAppBaseInfo?.() ?? {};
  } catch {}
  try {
    account = api.getAccountInfoSync?.() ?? {};
  } catch {}

  const platform = readPlatform(device.platform ?? systemInfo.platform);
  const system =
    typeof systemInfo.system === "string"
      ? systemInfo.system
      : typeof device.system === "string"
        ? device.system
        : "";
  const osFamily =
    platform !== "unknown"
      ? platform
      : /android/i.test(system)
        ? "android"
        : /iphone|ipad|ios/i.test(system)
          ? "ios"
          : "unknown";
  const env = account.miniProgram?.envVersion;
  const envVersion =
    env === "develop" || env === "trial" || env === "release" ? env : "unknown";
  let encryptedStorageSupported = false;
  try {
    encryptedStorageSupported = Boolean(
      api.canIUse?.("setStorage.object.encrypt") &&
        api.canIUse?.("getStorage.object.encrypt"),
    );
  } catch {}

  return {
    schemaVersion: 1,
    trigger,
    platform,
    deviceClass: readDeviceClass(device.model ?? device.deviceModel, platform),
    osFamily,
    ...(majorVersion(system) ? { osMajor: majorVersion(system) } : {}),
    ...(majorVersion(appBase.version) ? { wechatMajor: majorVersion(appBase.version) } : {}),
    ...(safeVersion(appBase.SDKVersion) ? { sdkVersion: safeVersion(appBase.SDKVersion) } : {}),
    ...(safeVersion(account.miniProgram?.version)
      ? { miniProgramVersion: safeVersion(account.miniProgram?.version) }
      : {}),
    envVersion,
    ...(currentPageRoute() ? { pageRoute: currentPageRoute() } : {}),
    encryptedStorageSupported,
    credentialState,
  };
}

export function recordMiniProgramRealtimeAuthEvent(input: {
  eventCode: string;
  requestId: string;
  trigger: MiniProgramAuthEventTrigger;
  statusCode?: number;
  durationMs: number;
}): void {
  const eventCode = boundedString(input.eventCode, EVENT_CODE_PATTERN, 64);
  const requestId = normalizeMiniProgramRequestId(input.requestId);
  const durationMs = Number.isFinite(input.durationMs)
    ? Math.max(0, Math.min(10 * 60 * 1000, Math.round(input.durationMs)))
    : 0;
  if (!eventCode || !requestId) return;
  const payload = {
    eventCode,
    requestId,
    trigger: input.trigger,
    ...(typeof input.statusCode === "number" && Number.isSafeInteger(input.statusCode)
      ? { statusCode: input.statusCode }
      : {}),
    durationMs,
  };
  try {
    runtimeApi().getRealtimeLogManager?.()?.info?.(payload);
  } catch {}
}
