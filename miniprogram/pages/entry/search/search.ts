import { getEntryInfo } from "../../../services/entry.service";
import type { EntryInfo } from "../../../models/entry";

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
    buttonText: "查找球队",
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
      buttonText: "查找中...",
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
      wx.showToast({ title: "已找到球队", icon: "success" });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "无法验证 Entry ID"
      });
    } finally {
      this.setData({ loading: false, buttonText: "查找球队" });
    }
  },

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
