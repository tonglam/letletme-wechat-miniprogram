import { PerformancePage } from "../../../utils/performance-page";
import { getEntryInfo } from "../../../services/entry.service";
import type { EntryInfo } from "../../../models/entry";
import { routes } from "../../../config/routes";
import { navigateTo } from "../../../utils/navigation";
import { clearEntryId, clearEntryScopedStorage, setEntryId } from "../../../utils/storage";
import { commitEntryBinding } from "../../../services/app-context.service";

/** Same contract as the web bind-entry form: a pasted FPL URL yields its ID. */
function extractEntryId(raw: string): string {
  const urlMatch = raw.match(/\/entry\/(\d+)/);
  return urlMatch ? urlMatch[1] : raw.trim();
}

interface EntrySearchData {
  manualEntryId: string;
  loading: boolean;
  error: string;
  buttonText: string;
  hasEntry: boolean;
  currentEntryId: number;
  hasPreview: boolean;
  previewEntryId: number;
  previewTitle: string;
  previewSubtitle: string;
  previewTotalPoints: string;
  previewOverallRank: string;
  isCurrentEntry: boolean;
}

PerformancePage({
  data: {
    manualEntryId: "",
    loading: false,
    error: "",
    buttonText: "查找球队",
    hasEntry: false,
    currentEntryId: 0,
    hasPreview: false,
    previewEntryId: 0,
    previewTitle: "",
    previewSubtitle: "",
    previewTotalPoints: "-",
    previewOverallRank: "-",
    isCurrentEntry: false
  } as EntrySearchData,

  lookupRequestId: 0,

  onShow() {
    this.syncCurrentEntry();
  },

  syncCurrentEntry() {
    const entryId = Number(getApp<IAppOption>().globalData.entryId) || 0;
    this.setData({ hasEntry: entryId > 0, currentEntryId: entryId });
  },

  onManualEntryInput(event: WechatMiniprogram.Input) {
    this.lookupRequestId += 1;
    const raw = String(event.detail.value || "");
    const extracted = extractEntryId(raw);
    this.setData({
      manualEntryId: extracted,
      loading: false,
      buttonText: "查找球队",
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
    const entryId = Number(extractEntryId(this.data.manualEntryId));
    if (!Number.isInteger(entryId) || entryId <= 0) {
      this.setData({ error: "请输入有效的参赛 ID" });
      return;
    }
    const requestId = ++this.lookupRequestId;

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
      if (requestId !== this.lookupRequestId || Number(this.data.manualEntryId) !== entryId) {
        return;
      }
      this.setData(mapPreviewData(entry, entryId));
      wx.showToast({ title: "已找到球队", icon: "success" });
    } catch (error) {
      if (requestId !== this.lookupRequestId) {
        return;
      }
      this.setData({
        error: error instanceof Error ? error.message : "无法找到该参赛 ID 对应的球队"
      });
    } finally {
      if (requestId === this.lookupRequestId) {
        this.setData({ loading: false, buttonText: "查找球队" });
      }
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
    commitEntryBinding(entryId, "rebind");
    this.setData({ hasEntry: true, currentEntryId: entryId });
    wx.showToast({ title: "已设为我的球队", icon: "success", duration: 800 });
    // A fresh Home load renders the newly followed team right away — a plain
    // navigateBack could land on a page still inside its refresh throttle.
    setTimeout(() => wx.reLaunch({ url: routes.home }), 800);
  },

  onUnbind() {
    const entryId = this.data.currentEntryId;
    wx.showModal({
      title: "解除绑定？",
      content: `将解除与球队 #${entryId} 的绑定，首页会回到未绑定状态。`,
      confirmText: "解除绑定",
      confirmColor: "#c9183f",
      success: ({ confirm }) => {
        if (!confirm) return;
        clearEntryScopedStorage();
        clearEntryId();
        commitEntryBinding(null, "rebind");
        this.setData({
          hasEntry: false,
          currentEntryId: 0,
          hasPreview: false,
          isCurrentEntry: false
        });
        wx.showToast({ title: "已解除绑定", icon: "success" });
      }
    });
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
