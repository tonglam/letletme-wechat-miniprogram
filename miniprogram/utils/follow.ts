import { storageKeys } from "../config/storage-keys";
import {
  ensureMiniProgramAccountFresh,
  getApiSessionToken,
  MINI_PROGRAM_PROFILE_MAX_AGE_MS,
  restoreApiSessionCredentials,
  synchronizeMiniProgramAccount,
} from "../services/auth.service";

/**
 * Cold-start viewer gate. Personal pages wait until the standalone account has
 * replayed any offline team selection before snapshotting the local pointer.
 */
export async function waitForAuthoritativeFollow(
  options: {
    maxAgeMs?: number;
    forceRefresh?: boolean;
  } = {},
): Promise<void> {
  // A DevTools hot reload can recreate this module's in-memory credential
  // mirror while leaving App.authReady already resolved. Restore encrypted
  // storage here as well so a personal page cannot snapshot a stale local
  // viewer during that gap. The restore is idempotent on normal cold
  // starts, where App.doLogin has already populated the mirror.
  if (!getApiSessionToken()) {
    try {
      await restoreApiSessionCredentials();
    } catch {
      // The normal login attempt below remains the fallback.
    }
  }
  try {
    const app = getApp<IAppOption>();
    await app.authReady;
  } catch {
    // Failed/offline auth intentionally keeps the local viewer team.
  }
  // DevTools hot reload can preserve an already-resolved App.authReady while
  // recreating this module. More importantly, a resident Mini page can retain
  // a profile whose follow pointer changed elsewhere. Refresh stale profiles
  // before any personal page snapshots the local pointer.
  if (getApiSessionToken()) {
    try {
      await ensureMiniProgramAccountFresh({
        maxAgeMs: options.maxAgeMs ?? MINI_PROGRAM_PROFILE_MAX_AGE_MS,
        forceRefresh: options.forceRefresh,
      });
    } catch {
      // Offline mode keeps the local viewer team and retries next launch.
    }
  }
}

/** Force one authoritative profile read for a bounded viewer-entry recovery. */
export async function refreshAuthoritativeFollow(): Promise<number | null> {
  const profile = await synchronizeMiniProgramAccount();
  return profile.effectiveEntryId;
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
  } catch {
    /* app not ready */
  }
  try {
    const stored = Number(wx.getStorageSync(storageKeys.entryId));
    return Number.isInteger(stored) && stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** My FPL reads use the same explicitly selected viewer team as other pages. */
export function currentMyFplEntryId(): number | undefined {
  return currentFollowEntryId();
}
