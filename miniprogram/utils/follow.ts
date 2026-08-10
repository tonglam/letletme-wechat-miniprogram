import { storageKeys } from "../config/storage-keys";

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
