import { getMiniProgramApiBase, REQUEST_TIMEOUT_MS } from "../config/env";
import { getApiSessionToken, getMiniProgramDeviceId } from "./auth.service";

type EntrySyncResponse = {
  success?: boolean;
  queued?: boolean;
  entryId?: number;
  error?: string;
};

/**
 * Ask the website to enqueue letletme_data entry-info persist. Lookup/bind
 * must not fail if this misses — GraphQL preview already succeeded.
 */
export function enqueueMiniProgramEntrySync(entryId: number): void {
  if (!Number.isSafeInteger(entryId) || entryId <= 0) {
    return;
  }

  const token = getApiSessionToken();
  const header: Record<string, string> = { "content-type": "application/json" };
  if (token) header.Authorization = `Bearer ${token}`;

  wx.request<EntrySyncResponse>({
    url: `${getMiniProgramApiBase()}/entry-sync`,
    method: "POST",
    header,
    data: {
      entryId,
      deviceId: getMiniProgramDeviceId()
    },
    timeout: REQUEST_TIMEOUT_MS
  });
}
