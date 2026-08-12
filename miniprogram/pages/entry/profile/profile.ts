import { PerformancePage } from "../../../utils/performance-page";
import { getEntryInfo } from "../../../services/entry.service";
import { getApiSessionToken } from "../../../services/auth.service";
import type { EntryInfo } from "../../../models/entry";
import { goToEntrySearch } from "../../../utils/navigation";

interface EntryProfileData {
  loading: boolean;
  error: string;
  emptyState: boolean;
  entryId?: number;
  entry: EntryInfo;
}

PerformancePage({
  data: {
    loading: false,
    error: "",
    emptyState: false,
    entryId: undefined,
    entry: {}
  } as EntryProfileData,

  async onLoad(options: Record<string, string | undefined>) {
    const app = getApp<IAppOption>();
    if (!options.entry && !getApiSessionToken()) {
      // With no valid session the stored binding is only offline/display
      // fallback: the account may have been relinked, so wait for the
      // refreshed profile before snapshotting the entry. Enter the loading
      // state first so the wait never renders the empty entry card.
      this.setData({ loading: true });
      try { await app.authReady; } catch {}
    }
    const entryId = Number(options.entry || app.globalData.entryId);
    this.setData({ entryId });
    this.loadEntry(entryId);
  },

  onPullDownRefresh() {
    this.loadEntry(Number(this.data.entryId), true).finally(() => wx.stopPullDownRefresh());
  },

  async loadEntry(entryId: number, forceRefresh = false) {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      this.setData({ loading: false, error: "", emptyState: true, entry: {} });
      return;
    }

    this.setData({ loading: true, error: "", emptyState: false, entryId });
    try {
      const entry = await getEntryInfo(entryId, forceRefresh);
      this.setData({ entry });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "球队资料加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetry() {
    this.loadEntry(Number(this.data.entryId));
  },

  onLinkAccount() {
    goToEntrySearch();
  },

  onChangeEntry() {
    goToEntrySearch();
  }
});
