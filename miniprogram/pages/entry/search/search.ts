import { getEntryInfo } from "../../../services/entry.service";
import type { EntryInfo } from "../../../models/entry";
import { routes } from "../../../config/routes";
import { navigateTo } from "../../../utils/navigation";
import { clearEntryScopedStorage, setEntryId } from "../../../utils/storage";

interface EntrySearchData {
  manualEntryId: string;
  loading: boolean;
  error: string;
  buttonText: string;
  hasPreview: boolean;
  previewEntryId: number;
  previewTitle: string;
  previewSubtitle: string;
  previewTotalPoints: string;
  previewOverallRank: string;
  isCurrentEntry: boolean;
}

Page({
  data: {
    manualEntryId: "",
    loading: false,
    error: "",
    buttonText: "查找球队",
    hasPreview: false,
    previewEntryId: 0,
    previewTitle: "",
    previewSubtitle: "",
    previewTotalPoints: "-",
    previewOverallRank: "-",
    isCurrentEntry: false
  } as EntrySearchData,

  onManualEntryInput(event: WechatMiniprogram.Input) {
    this.setData({
      manualEntryId: event.detail.value,
      error: "",
      hasPreview: false,
      previewEntryId: 0,
      previewTitle: "",
      previewSubtitle: "",
      previewTotalPoints: "-",
      previewOverallRank: "-",
      isCurrentEntry: false
    });
  },

  onEntryConfirm() {
    this.onLookupEntry();
  },

  async onLookupEntry() {
    const entryId = Number(this.data.manualEntryId);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      this.setData({ error: "请输入有效的 Entry ID" });
      return;
    }

    this.setData({
      loading: true,
      buttonText: "查找中...",
      error: "",
      hasPreview: false,
      previewEntryId: 0,
      previewTitle: "",
      previewSubtitle: "",
      previewTotalPoints: "-",
      previewOverallRank: "-",
      isCurrentEntry: false
    });
    try {
      const entry = await getEntryInfo(entryId);
      this.setData(mapPreviewData(entry, entryId));
      wx.showToast({ title: "已找到球队", icon: "success" });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "无法找到该 Entry ID 对应的球队"
      });
    } finally {
      this.setData({ loading: false, buttonText: "查找球队" });
    }
  },

  onSetMyEntry() {
    const entryId = this.data.previewEntryId;
    if (!entryId) {
      return;
    }

    const app = getApp<IAppOption>();
    if (app.globalData.entryId !== entryId) {
      // Switching teams drops the previous team's entry-scoped caches; the
      // follow itself is only a stored display preference.
      clearEntryScopedStorage();
    }
    setEntryId(entryId);
    app.globalData.entryId = entryId;
    wx.showToast({ title: "已设为我的球队", icon: "success", duration: 800 });
    // A fresh Home load renders the newly followed team right away — a plain
    // navigateBack could land on a page still inside its refresh throttle.
    setTimeout(() => wx.reLaunch({ url: routes.home }), 800);
  },

  onGoAccountLink() {
    navigateTo(routes.accountLink);
  }
});

function mapPreviewData(entry: EntryInfo, fallbackEntryId: number): Partial<EntrySearchData> {
  const entryId = entry.entryId || entry.entry || fallbackEntryId;
  const title = entry.entryName || entry.teamName || "已找到球队";
  const player = entry.playerName || "";

  return {
    hasPreview: true,
    previewEntryId: entryId,
    previewTitle: title,
    previewSubtitle: player ? `${player} #${entryId}` : `#${entryId}`,
    previewTotalPoints: entry.totalPoints === undefined ? "-" : String(entry.totalPoints),
    previewOverallRank: entry.overallRank === undefined ? "-" : String(entry.overallRank),
    isCurrentEntry: getApp<IAppOption>().globalData.entryId === entryId
  };
}
