import { getMiniProgramApiBase, REQUEST_TIMEOUT_MS } from "../config/env";
import { collectMiniProgramBugReportMeta } from "../utils/bug-report-diagnostics";
import { networkErrorMessage } from "../utils/request-error";
import { getApiSessionToken, getMiniProgramDeviceId } from "./auth.service";

export const BUG_REPORT_BODY_MIN = 8;
export const BUG_REPORT_BODY_MAX = 500;
const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;

type BugReportApiResponse = {
  success?: boolean;
  publicId?: string;
  error?: string;
};

export function normalizeBugReportBody(body: string): string {
  return body.trim();
}

export function screenshotWithinLimit(byteLength: number): boolean {
  return byteLength > 0 && byteLength <= SCREENSHOT_MAX_BYTES;
}

export async function submitMiniProgramBugReport(input: {
  body: string;
  screenshotBase64?: string | null;
  screenshotMime?: string | null;
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

  return new Promise((resolve, reject) => {
    wx.request<BugReportApiResponse>({
      url: `${getMiniProgramApiBase()}/bug-reports`,
      method: "POST",
      header,
      data: {
        body,
        deviceId: getMiniProgramDeviceId(),
        clientMeta: collectMiniProgramBugReportMeta(),
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
