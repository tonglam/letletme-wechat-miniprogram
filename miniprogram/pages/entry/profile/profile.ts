import { getEntryInfo } from "../../../services/entry.service";
import type { EntryInfo } from "../../../models/entry";
import { goToEntrySearch } from "../../../utils/navigation";

interface EntryProfileData {
  loading: boolean;
  error: string;
  entry: EntryInfo;
}

Page({
  data: {
    loading: false,
    error: "",
    entry: {}
  } as EntryProfileData,

  onLoad(options: Record<string, string | undefined>) {
    const entryId = Number(options.entry || getApp<IAppOption>().globalData.entryId);
    this.loadEntry(entryId);
  },

  onPullDownRefresh() {
    const entryId = Number(getApp<IAppOption>().globalData.entryId);
    this.loadEntry(entryId).finally(() => wx.stopPullDownRefresh());
  },

  async loadEntry(entryId: number) {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      this.setData({ error: "未选择球队" });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const entry = await getEntryInfo(entryId);
      this.setData({ entry });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "球队资料加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetry() {
    const entryId = Number(getApp<IAppOption>().globalData.entryId);
    this.loadEntry(entryId);
  },

  onChangeEntry() {
    goToEntrySearch();
  }
});
