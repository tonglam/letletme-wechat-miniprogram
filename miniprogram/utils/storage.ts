import { storageKeys } from "../config/storage-keys";

export function getEntryId(): number | undefined {
  const value = wx.getStorageSync(storageKeys.entryId);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function setEntryId(entryId: number): void {
  wx.setStorageSync(storageKeys.entryId, entryId);
}

export function clearEntryScopedStorage(): void {
  [
    storageKeys.selectedLiveTournamentId,
    storageKeys.selectedLiveTournamentName,
    storageKeys.selectedKnockoutId,
    storageKeys.selectedKnockoutName,
    storageKeys.selectedStatLeagueId,
    storageKeys.selectedStatLeagueName,
    storageKeys.selectedDataSelectionsTournamentId,
    storageKeys.selectedDataSelectionsTournamentName,
    storageKeys.selectedSummaryTournamentId,
    storageKeys.selectedSummaryTournamentName
  ].forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch {}
  });
}

export function clearEntryId(): void {
  wx.removeStorageSync(storageKeys.entryId);
}
