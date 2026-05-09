import { getEntryInfo } from "../../../services/entry.service";
import type { EntryInfo } from "../../../models/entry";
import { setEntryId, clearEntryScopedStorage } from "../../../utils/storage";
import { switchToHome } from "../../../utils/navigation";
import { refreshWechatApiSession } from "../../../services/auth.service";

interface EntrySearchData {
  manualEntryId: string;
  loading: boolean;
  error: string;
  buttonText: string;
  hasPreview: boolean;
  previewTitle: string;
  previewSubtitle: string;
  previewTotalPoints: string;
  previewOverallRank: string;
}

Page({
  data: {
    manualEntryId: "",
    loading: false,
    error: "",
    buttonText: "验证并绑定",
    hasPreview: false,
    previewTitle: "",
    previewSubtitle: "",
    previewTotalPoints: "-",
    previewOverallRank: "-"
  } as EntrySearchData,

  onManualEntryInput(event: WechatMiniprogram.Input) {
    this.setData({
      manualEntryId: event.detail.value,
      error: "",
      hasPreview: false,
      previewTitle: "",
      previewSubtitle: "",
      previewTotalPoints: "-",
      previewOverallRank: "-"
    });
  },

  onEntryConfirm() {
    this.onValidateAndSaveEntry();
  },

  async onValidateAndSaveEntry() {
    const entryId = Number(this.data.manualEntryId);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      this.setData({ error: "请输入有效的 Entry ID" });
      return;
    }

    this.setData({
      loading: true,
      buttonText: "验证中...",
      error: "",
      hasPreview: false,
      previewTitle: "",
      previewSubtitle: "",
      previewTotalPoints: "-",
      previewOverallRank: "-"
    });
    try {
      const entry = await getEntryInfo(entryId);
      this.setData(mapPreviewData(entry, entryId));
      wx.showToast({ title: "绑定成功", icon: "success" });
      this.saveEntry(entry.entryId || entry.entry || entryId);
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "无法验证 Entry ID"
      });
    } finally {
      this.setData({ loading: false, buttonText: "验证并绑定" });
    }
  },

  saveEntry(entryId: number) {
    setEntryId(entryId);
    clearEntryScopedStorage();
    getApp<IAppOption>().globalData.entryId = entryId;
    refreshWechatApiSession(entryId).catch(() => {});
    switchToHome();
  }
});

function mapPreviewData(entry: EntryInfo, fallbackEntryId: number): Partial<EntrySearchData> {
  const entryId = entry.entryId || entry.entry || fallbackEntryId;
  const title = entry.entryName || entry.teamName || "已找到球队";
  const player = entry.playerName || "";

  return {
    hasPreview: true,
    previewTitle: title,
    previewSubtitle: player ? `${player} #${entryId}` : `#${entryId}`,
    previewTotalPoints: entry.totalPoints === undefined ? "-" : String(entry.totalPoints),
    previewOverallRank: entry.overallRank === undefined ? "-" : String(entry.overallRank)
  };
}
