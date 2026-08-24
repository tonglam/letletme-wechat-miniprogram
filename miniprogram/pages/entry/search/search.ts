import { PerformancePage } from "../../../utils/performance-page";
import { getEntryInfo, searchEntries } from "../../../services/entry.service";
import { enqueueMiniProgramEntrySync } from "../../../services/entry-sync.service";
import type { EntryInfo, EntrySearchResult } from "../../../models/entry";
import { routes } from "../../../config/routes";
import { navigateTo } from "../../../utils/navigation";
import { saveMiniProgramFollowEntry } from "../../../services/auth.service";
import { waitForAuthoritativeFollow } from "../../../utils/follow";

/** Same contract as the web bind-entry form: a pasted FPL URL yields its ID. */
function extractEntryId(raw: string): string {
  const urlMatch = raw.match(/\/entry\/(\d+)/);
  return urlMatch ? urlMatch[1] : raw.trim();
}

function parseExactEntryId(raw: string): number | null {
  const extracted = extractEntryId(raw);
  if (!/^\d+$/.test(extracted)) {
    return null;
  }
  const entryId = Number(extracted);
  return Number.isInteger(entryId) && entryId > 0 ? entryId : null;
}

interface EntryNameHit {
  entryId: number;
  entryName: string;
  playerName: string;
  totalPoints: string;
  overallRank: string;
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
  searchHits: EntryNameHit[];
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
    isCurrentEntry: false,
    searchHits: []
  } as EntrySearchData,

  lookupRequestId: 0,
  redirectTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  pageVisible: true,

  async onShow() {
    this.pageVisible = true;
    await waitForAuthoritativeFollow();
    if (!this.pageVisible) return;
    this.syncCurrentEntry();
  },

  onHide() {
    this.pageVisible = false;
    this.cancelRedirectTimer();
  },

  onUnload() {
    this.pageVisible = false;
    this.cancelRedirectTimer();
  },

  cancelRedirectTimer() {
    if (this.redirectTimer) clearTimeout(this.redirectTimer);
    this.redirectTimer = undefined;
  },

  syncCurrentEntry() {
    const entryId = Number(getApp<IAppOption>().globalData.entryId) || 0;
    this.setData({ hasEntry: entryId > 0, currentEntryId: entryId });
  },

  onManualEntryInput(event: WechatMiniprogram.Input) {
    this.applyManualEntry(String(event.detail.value || ""));
  },

  applyManualEntry(raw: string) {
    this.lookupRequestId += 1;
    this.setData({
      manualEntryId: extractEntryId(raw),
      loading: false,
      buttonText: "查找球队",
      error: "",
      hasPreview: false,
      previewEntryId: 0,
      previewTitle: "",
      previewSubtitle: "",
      previewTotalPoints: "-",
      previewOverallRank: "-",
      isCurrentEntry: false,
      searchHits: []
    });
  },

  onEntryConfirm() {
    this.onLookupEntry();
  },

  async onLookupEntry() {
    const keyword = extractEntryId(this.data.manualEntryId);
    const entryId = parseExactEntryId(keyword);
    if (entryId !== null) {
      await this.lookupByEntryId(entryId);
      return;
    }
    if (keyword.length < 2) {
      this.setData({ error: "请输入参赛 ID，或至少 2 个字符的球队名 / 经理名" });
      return;
    }
    await this.lookupByName(keyword);
  },

  async lookupByEntryId(entryId: number) {
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
      isCurrentEntry: false,
      searchHits: []
    });
    try {
      const entry = await getEntryInfo(entryId, true);
      enqueueMiniProgramEntrySync(entryId);
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

  async lookupByName(keyword: string) {
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
      isCurrentEntry: false,
      searchHits: []
    });
    try {
      const hits = await searchEntries(keyword, 10);
      if (requestId !== this.lookupRequestId || extractEntryId(this.data.manualEntryId) !== keyword) {
        return;
      }
      if (hits.length === 0) {
        this.setData({ error: "没有找到匹配的球队，可改用参赛 ID 再试" });
        return;
      }
      const [only] = hits;
      if (hits.length === 1 && only) {
        const hitEntryId = only.entryId || only.entry || 0;
        if (hitEntryId > 0) {
          enqueueMiniProgramEntrySync(hitEntryId);
        }
        this.setData({
          ...mapPreviewData(toEntryInfo(only), hitEntryId),
          searchHits: []
        });
        wx.showToast({ title: "已找到球队", icon: "success" });
        return;
      }
      this.setData({
        searchHits: hits.map(toNameHit),
        error: ""
      });
    } catch (error) {
      if (requestId !== this.lookupRequestId) {
        return;
      }
      this.setData({
        error: error instanceof Error ? error.message : "查找球队失败，请稍后再试"
      });
    } finally {
      if (requestId === this.lookupRequestId) {
        this.setData({ loading: false, buttonText: "查找球队" });
      }
    }
  },

  onSelectSearchHit(event: WechatMiniprogram.TouchEvent) {
    const entryId = Number(event.currentTarget.dataset.entryId);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return;
    }
    const hit = this.data.searchHits.find((item) => item.entryId === entryId);
    this.lookupRequestId += 1;
    enqueueMiniProgramEntrySync(entryId);
    this.setData({
      manualEntryId: String(entryId),
      error: "",
      ...(hit
        ? mapPreviewData(
            {
              entryId: hit.entryId,
              entry: hit.entryId,
              entryName: hit.entryName,
              teamName: hit.entryName,
              playerName: hit.playerName,
              totalPoints: hit.totalPoints === "-" ? undefined : Number(hit.totalPoints),
              overallRank: hit.overallRank === "-" ? undefined : Number(hit.overallRank)
            },
            entryId
          )
        : {})
    });
  },

  onSetMyEntry() {
    const entryId = this.data.previewEntryId;
    if (!entryId) {
      return;
    }

    const sync = saveMiniProgramFollowEntry(entryId);
    enqueueMiniProgramEntrySync(entryId);
    this.setData({ hasEntry: true, currentEntryId: entryId });
    wx.showToast({ title: "已设为我的球队", icon: "success", duration: 800 });
    void sync.then((synced) => {
      if (!synced) {
        wx.showToast({ title: "已选择，联网后自动同步", icon: "none" });
      }
    });
    // A fresh Home load renders the newly followed team right away — a plain
    // navigateBack could land on a page still inside its refresh throttle.
    this.cancelRedirectTimer();
    this.redirectTimer = setTimeout(() => {
      this.redirectTimer = undefined;
      if (!this.pageVisible) return;
      wx.reLaunch({ url: routes.home });
    }, 800);
  },

  onUnbind() {
    const entryId = this.data.currentEntryId;
    wx.showModal({
      title: "取消查看？",
      content: `将取消小程序球队 #${entryId}。如已关联网页账户，网页球队仍可继续显示。`,
      confirmText: "取消查看",
      confirmColor: "#c9183f",
      success: ({ confirm }) => {
        if (!confirm) return;
        const sync = saveMiniProgramFollowEntry(null);
        this.setData({
          hasEntry: false,
          currentEntryId: 0,
          hasPreview: false,
          isCurrentEntry: false,
          searchHits: []
        });
        wx.showToast({ title: "已取消查看", icon: "success" });
        void sync.then((synced) => {
          if (!synced) {
            wx.showToast({ title: "已取消，联网后自动同步", icon: "none" });
          } else {
            this.syncCurrentEntry();
          }
        });
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

function toEntryInfo(hit: EntrySearchResult): EntryInfo {
  return {
    entry: hit.entryId || hit.entry,
    entryId: hit.entryId || hit.entry,
    entryName: hit.entryName,
    teamName: hit.teamName || hit.entryName,
    playerName: hit.playerName,
    overallRank: hit.overallRank,
    totalPoints: hit.totalPoints
  };
}

function toNameHit(hit: EntrySearchResult): EntryNameHit {
  const entryId = hit.entryId || hit.entry || 0;
  return {
    entryId,
    entryName: hit.entryName || hit.teamName || `球队 #${entryId}`,
    playerName: hit.playerName || "",
    totalPoints: hit.totalPoints === undefined ? "-" : String(hit.totalPoints),
    overallRank: hit.overallRank === undefined ? "-" : String(hit.overallRank)
  };
}
