import { storageKeys } from "../config/storage-keys";
import { getApiSessionToken } from "../services/auth.service";

/**
 * Cold-start entry authority gate. Without a usable API session the app first
 * restores the local follow, then lets the login/profile refresh re-assert a
 * web-verified entry. Personal pages must wait for that first attempt before
 * snapshotting the follow or they can fetch and cache the previous team.
 */
export async function waitForAuthoritativeFollow(): Promise<void> {
  if (getApiSessionToken()) {
    return;
  }
  try {
    const app = getApp<IAppOption>();
    await app.authReady;
  } catch {
    // Failed/blocked auth intentionally keeps the local display-only follow.
  }
}

/**
 * Current local follow pointer (display-only, see models/principal). Falls
 * back to storage when the app globalData is not ready yet.
 */
export function currentFollowEntryId(): number | undefined {
  try {
    const appEntryId = Number(getApp<IAppOption>().globalData.entryId);
    if (Number.isInteger(appEntryId) && appEntryId > 0) {
      return appEntryId;
    }
  } catch { /* app not ready */ }
  try {
    const stored = Number(wx.getStorageSync(storageKeys.entryId));
    return Number.isInteger(stored) && stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
}
