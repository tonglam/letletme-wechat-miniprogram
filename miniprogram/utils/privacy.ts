/**
 * WeChat privacy-authorization helper.
 *
 * setClipboardData / getClipboardData map to「读取你的剪切板」in
 * 小程序管理后台 → 设置 → 服务内容声明 → 用户隐私保护指引.
 * errno 112 means that type is not declared (code cannot grant the scope).
 *
 * DevTools: 详情 → 本地设置 → 使用本地用户隐私保护指引, then include 剪切板.
 */

export const PRIVACY_AGREE_BUTTON_ID = "privacy-agree-btn";
export const DEFAULT_PRIVACY_CONTRACT_NAME = "《小程序用户隐私保护指引》";

export type PrivacyAuthorizeEvent = "agree" | "disagree";

export interface PrivacyAuthorizeResult {
  event: PrivacyAuthorizeEvent;
  buttonId?: string;
}

export type PrivacyResolve = (result: PrivacyAuthorizeResult) => void;

export interface PrivacyPromptInfo {
  referrer: string;
  privacyContractName: string;
}

export type PrivacyPromptListener = (info: PrivacyPromptInfo) => void;

export interface PrivacyApiError {
  errno?: number;
  errMsg?: string;
}

let installed = false;
let clipboardApiBlocked = false;
let privacyContractName = DEFAULT_PRIVACY_CONTRACT_NAME;
let lastReferrer = "";
const pendingResolves: PrivacyResolve[] = [];
const listeners = new Set<PrivacyPromptListener>();

function asErrorMessage(err?: PrivacyApiError | string | null): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  return String(err.errMsg || "");
}

export function isPrivacyScopeUndeclared(err?: PrivacyApiError | string | null): boolean {
  if (err && typeof err === "object" && err.errno === 112) return true;
  return asErrorMessage(err).includes("api scope is not declared in the privacy agreement");
}

export function isPrivacyAuthorizationDenied(err?: PrivacyApiError | string | null): boolean {
  if (err && typeof err === "object" && (err.errno === 103 || err.errno === 104)) return true;
  const message = asErrorMessage(err);
  return message.includes("privacy permission") || message.includes("privacy agree");
}

export function isClipboardApiBlocked(): boolean {
  return clipboardApiBlocked;
}

export function markClipboardApiBlocked(): void {
  clipboardApiBlocked = true;
}

export function currentPrivacyContractName(): string {
  return privacyContractName;
}

function emitPrompt(): void {
  if (!listeners.size) return;
  const info: PrivacyPromptInfo = {
    referrer: lastReferrer,
    privacyContractName
  };
  listeners.forEach((listener) => listener(info));
}

function refreshPrivacyContractName(): void {
  if (typeof wx === "undefined" || typeof wx.getPrivacySetting !== "function") return;
  wx.getPrivacySetting({
    success: (res) => {
      const name = String(res?.privacyContractName || "").trim();
      if (!name) return;
      privacyContractName = name;
      if (pendingResolves.length) emitPrompt();
    }
  });
}

export function installPrivacyAuthorizationHandler(): void {
  if (installed) return;
  if (typeof wx === "undefined" || typeof wx.onNeedPrivacyAuthorization !== "function") {
    return;
  }
  installed = true;
  wx.onNeedPrivacyAuthorization((resolve: PrivacyResolve, eventInfo?: { referrer?: string }) => {
    pendingResolves.push(resolve);
    lastReferrer = eventInfo?.referrer || "";
    refreshPrivacyContractName();
    emitPrompt();
  });
}

export function subscribePrivacyPrompt(listener: PrivacyPromptListener): () => void {
  listeners.add(listener);
  if (pendingResolves.length) {
    listener({
      referrer: lastReferrer,
      privacyContractName
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function resolvePrivacyAuthorization(result: PrivacyAuthorizeResult): void {
  const batch = pendingResolves.splice(0, pendingResolves.length);
  batch.forEach((resolve) => resolve(result));
}

export function hasPendingPrivacyAuthorization(): boolean {
  return pendingResolves.length > 0;
}

/** Test-only: reset module state between cases. */
export function resetPrivacyAuthorizationForTests(): void {
  installed = false;
  clipboardApiBlocked = false;
  privacyContractName = DEFAULT_PRIVACY_CONTRACT_NAME;
  lastReferrer = "";
  pendingResolves.splice(0, pendingResolves.length);
  listeners.clear();
}
