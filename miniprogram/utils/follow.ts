import { storageKeys } from "../config/storage-keys";
import {
  getApiSessionToken,
  getVerifiedSessionEntryId,
  hasStoredSessionProfileBinding,
  refreshWechatApiSession,
  restoreApiSessionCredentials
} from "../services/auth.service";

/**
 * Cold-start entry authority gate. Without a usable API session the app first
 * restores the local follow, then lets the login/profile refresh re-assert a
 * web-verified entry. Personal pages must wait for that first attempt before
 * snapshotting the follow or they can fetch and cache the previous team.
 */
export async function waitForAuthoritativeFollow(): Promise<void> {
  // A DevTools hot reload can recreate this module's in-memory credential
  // mirror while leaving App.authReady already resolved. Restore encrypted
  // storage here as well so an account-owned page cannot snapshot the local
  // display follow during that gap. The restore is idempotent on normal cold
  // starts, where App.doLogin has already populated the mirror.
  if (!getApiSessionToken()) {
    try {
      await restoreApiSessionCredentials();
    } catch {
      // The normal login attempt below remains the fallback.
    }
  }
  if (!getApiSessionToken()) {
    try {
      const app = getApp<IAppOption>();
      await app.authReady;
    } catch {
      // Failed/blocked auth intentionally keeps the local display-only follow.
    }
  }
  // Existing installs may restore a still-valid encrypted token that predates
  // the separate verified-entry key. Refresh once so personal surfaces never
  // infer account identity from a manually followed team.
  if (getApiSessionToken() && !hasStoredSessionProfileBinding()) {
    try {
      await refreshWechatApiSession();
    } catch {
      // The local follow remains usable by public, non-personal surfaces.
    }
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

/** My FPL is account-owned: a verified session binding wins over the follow. */
export function currentMyFplEntryId(): number | undefined {
  // A verified zero binding means the signed-in account has no linked FPL
  // team; do not silently substitute a display-only followed team.
  return getApiSessionToken()
    ? getVerifiedSessionEntryId()
    : currentFollowEntryId();
}
