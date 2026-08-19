import { getMiniProgramApiBase, REQUEST_TIMEOUT_MS } from "../config/env";
import { storageKeys } from "../config/storage-keys";
import { collectMiniProgramBugReportMeta } from "../utils/bug-report-diagnostics";
import {
  networkErrorMessage,
  userFacingErrorMessage
} from "../utils/request-error";
import { getApiSessionToken, getMiniProgramDeviceId } from "./auth.service";

export const BUG_REPORT_BODY_MIN = 8;
export const BUG_REPORT_BODY_MAX = 500;
const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;

type BugReportApiResponse = {
  success?: boolean;
  publicId?: string;
  error?: string;
};

export type BugReportDraft = {
  body: string;
  source?: "error-state";
  /** Technical detail for clientMeta only — never shown as the form body. */
  diagnostic?: string;
};

export function normalizeBugReportBody(body: string): string {
  return body.trim();
}

export function screenshotWithinLimit(byteLength: number): boolean {
  return byteLength > 0 && byteLength <= SCREENSHOT_MAX_BYTES;
}

/** Prefill text for the report form — never auto-submits; never embeds raw JS. */
export function buildBugReportDraftFromError(input: {
  message?: string;
  route?: string;
}): string {
  const message = userFacingErrorMessage(input.message, "").trim().slice(0, 180);
  const route = String(input.route || "").trim().slice(0, 120);
  const lines = [
    "页面加载失败，想请你们看一看。",
    route ? `页面：${route}` : "",
    message ? `情况：${message}` : ""
  ].filter(Boolean);
  return lines.join("\n").slice(0, BUG_REPORT_BODY_MAX);
}

export function writePendingBugReportDraft(draft: BugReportDraft): void {
  const body = normalizeBugReportBody(draft.body).slice(0, BUG_REPORT_BODY_MAX);
  if (!body) return;
  try {
    wx.setStorageSync(storageKeys.pendingBugReportDraft, {
      body,
      source: draft.source || "error-state",
      diagnostic: String(draft.diagnostic || "").trim().slice(0, 400)
    } satisfies BugReportDraft);
  } catch {
    // Draft is best-effort; navigation to the report page still works.
  }
}

export function consumePendingBugReportDraft(): BugReportDraft | null {
  try {
    const raw = wx.getStorageSync(storageKeys.pendingBugReportDraft) as
      | BugReportDraft
      | string
      | undefined;
    wx.removeStorageSync(storageKeys.pendingBugReportDraft);
    if (!raw) return null;
    if (typeof raw === "string") {
      const body = normalizeBugReportBody(raw).slice(0, BUG_REPORT_BODY_MAX);
      return body ? { body, source: "error-state" } : null;
    }
    const body = normalizeBugReportBody(String(raw.body || "")).slice(0, BUG_REPORT_BODY_MAX);
    if (!body) return null;
    return {
      body,
      source: raw.source || "error-state",
      diagnostic: String(raw.diagnostic || "").trim().slice(0, 400)
    };
  } catch {
    return null;
  }
}

export async function submitMiniProgramBugReport(input: {
  body: string;
  screenshotBase64?: string | null;
  screenshotMime?: string | null;
  diagnostic?: string | null;
}): Promise<string> {
  const body = normalizeBugReportBody(input.body);
  if (body.length < BUG_REPORT_BODY_MIN) {
    throw new Error("再写几个字就行");
  }
  if (body.length > BUG_REPORT_BODY_MAX) {
    throw new Error("请控制在 500 字以内");
  }

  const token = getApiSessionToken();
  const header: Record<string, string> = { "content-type": "application/json" };
  if (token) header.Authorization = `Bearer ${token}`;

  const clientMeta = {
    ...collectMiniProgramBugReportMeta(),
    ...(input.diagnostic
      ? { errorDiagnostic: String(input.diagnostic).slice(0, 400) }
      : {})
  };

  return new Promise((resolve, reject) => {
    wx.request<BugReportApiResponse>({
      url: `${getMiniProgramApiBase()}/bug-reports`,
      method: "POST",
      header,
      data: {
        body,
        deviceId: getMiniProgramDeviceId(),
        clientMeta,
        screenshotBase64: input.screenshotBase64 ?? null,
        screenshotMime: input.screenshotMime ?? null
      },
      timeout: REQUEST_TIMEOUT_MS,
      success(response) {
        const publicId = response.data?.publicId;
        if (
          response.statusCode >= 200 &&
          response.statusCode < 300 &&
          response.data?.success &&
          typeof publicId === "string"
        ) {
          resolve(publicId);
          return;
        }
        if (response.statusCode === 401) {
          reject(new Error(response.data?.error || "登录过期了，请先打开「我」再发"));
          return;
        }
        reject(new Error(response.data?.error || "这次没发出去，请稍后再试"));
      },
      fail(error) {
        reject(new Error(networkErrorMessage(error)));
      }
    });
  });
}
