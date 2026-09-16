import { PerformancePage } from "../../../utils/performance-page";
import { EntryLookupError, getEntryInfo, searchEntries } from "../../../services/entry.service";
import type { EntryInfo, EntrySearchResult } from "../../../models/entry";
import {
  entryPersistencePresentation,
  hasMatchingEntryPreview
} from "../../../utils/entry-lookup-presentation";
import { routes } from "../../../config/routes";
import { navigateTo } from "../../../utils/navigation";
import {
  getCurrentPageInteractionToken,
  getPageInteractionToken,
  handoffPageInteraction,
  runPageInteractionDelegation,
  type PageInteractionToken,
} from "../../../utils/page-performance";
import { formatRank } from "../../../utils/summary-format";
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
  errorCode: string;
  canRetryLookup: boolean;
  lookupNotice: string;
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

interface LookupInteractionState {
  requestId: number;
  token: PageInteractionToken | null;
}

function emptyEntryPreviewData(): Pick<
  EntrySearchData,
  | "hasPreview"
  | "previewEntryId"
  | "previewTitle"
  | "previewSubtitle"
  | "previewTotalPoints"
  | "previewOverallRank"
  | "isCurrentEntry"
> {
  return {
    hasPreview: false,
    previewEntryId: 0,
    previewTitle: "",
    previewSubtitle: "",
    previewTotalPoints: "-",
    previewOverallRank: "-",
    isCurrentEntry: false
  };
}

PerformancePage({
  data: {
    manualEntryId: "",
    loading: false,
    error: "",
    errorCode: "",
    canRetryLookup: false,
    lookupNotice: "",
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
  lookupInteraction: null as LookupInteractionState | null,
  redirectTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  redirectHandoff: null as ReturnType<typeof handoffPageInteraction>,
  redirectDispatched: false,
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
    // Once reLaunch has been dispatched, the source page may hide before the
    // destination adopts the handoff. Only cancel before dispatch; a rejected
    // API call owns rollback through its fail callback.
    if (!this.redirectDispatched) this.redirectHandoff?.rollback();
    this.redirectHandoff = null;
    this.redirectDispatched = false;
  },

  syncCurrentEntry() {
    const entryId = Number(getApp<IAppOption>().globalData.entryId) || 0;
    this.setData({
      hasEntry: entryId > 0,
      currentEntryId: entryId,
      isCurrentEntry:
        this.data.hasPreview && this.data.previewEntryId === entryId
    });
  },

  /**
   * Entry lookup results render below the always-visible form. Bind the
   * explicit lookup action to that result/error region so the form cannot
   * satisfy the interaction observer before the requested data is visible.
   */
  observeLookupResult() {
    const interaction = getCurrentPageInteractionToken();
    const tracker = interaction?.tracker;
    if (!tracker) return;
    wx.nextTick(() => {
      if (!this.pageVisible) return;
      tracker.observeInteractionVisible("#perf-entry-search-result", {
        errorVisible: Boolean(this.data.error),
        interactionId: interaction.interactionId,
      });
    });
  },

  getLookupInteractionToken(): PageInteractionToken | null {
    for (const handler of ["onEntryConfirm", "onRetryLookup", "onLookupEntry"]) {
      const token = getPageInteractionToken(this, handler);
      if (token?.tracker.hasPendingInteraction(token.interactionId)) return token;
    }
    return null;
  },

  failLookupInteraction(requestId?: number): void {
    const current = this.lookupInteraction;
    if (!current || (requestId !== undefined && current.requestId !== requestId)) return;
    if (current.token?.tracker.hasPendingInteraction(current.token.interactionId)) {
      // Superseded work is not a visible lookup error. Leaving visibility
      // undefined keeps the action terminal without inflating error latency.
      current.token.tracker.completeInteraction(current.token.interactionId, "failed");
    }
    this.lookupInteraction = null;
  },

  beginLookupRequest(token?: PageInteractionToken | null): number {
    this.failLookupInteraction();
    const requestId = ++this.lookupRequestId;
    this.lookupInteraction = {
      requestId,
      token: token === undefined ? this.getLookupInteractionToken() : token,
    };
    return requestId;
  },

  onManualEntryInput(event: WechatMiniprogram.Input) {
    this.applyManualEntry(String(event.detail.value || ""));
  },

  applyManualEntry(raw: string) {
    this.failLookupInteraction();
    this.lookupRequestId += 1;
    this.setData({
      manualEntryId: extractEntryId(raw),
      loading: false,
      buttonText: "查找球队",
      error: "",
      errorCode: "",
      canRetryLookup: false,
      lookupNotice: "",
      ...emptyEntryPreviewData(),
      searchHits: []
    });
  },

  onEntryConfirm() {
    return runPageInteractionDelegation(this, () => this.onLookupEntry());
  },

  async onLookupEntry() {
    const requestId = this.beginLookupRequest();
    const keyword = extractEntryId(this.data.manualEntryId);
    const entryId = parseExactEntryId(keyword);
    if (entryId !== null) {
      await this.lookupByEntryId(entryId, requestId);
      return;
    }
    if (keyword.length < 2) {
      this.setData({
        error: "请输入参赛 ID，或至少 2 个字符的球队名 / 经理名",
        errorCode: "INVALID_ID",
        canRetryLookup: false
      }, () => this.observeLookupResult());
      return;
    }
    await this.lookupByName(keyword, requestId);
  },

  async lookupByEntryId(entryId: number, requestId?: number) {
    if (requestId === undefined) requestId = this.beginLookupRequest();
    const preservePreview = hasMatchingEntryPreview(
      this.data.hasPreview,
      this.data.previewEntryId,
      entryId
    );

    this.setData({
      loading: true,
      buttonText: "查找中...",
      error: "",
      errorCode: "",
      canRetryLookup: false,
      lookupNotice: "",
      ...(preservePreview ? {} : emptyEntryPreviewData()),
      searchHits: []
    });
    try {
      const entry = await getEntryInfo(entryId, true);
      if (requestId !== this.lookupRequestId || Number(this.data.manualEntryId) !== entryId) {
        this.failLookupInteraction(requestId);
        return;
      }
      const persistence = entryPersistencePresentation(entry.persistenceState);
      this.setData({
        ...mapPreviewData(entry, entryId),
        lookupNotice: persistence?.message ?? "",
        canRetryLookup: persistence?.retryable ?? false
      });
      wx.showToast({ title: "已找到球队", icon: "success" });
    } catch (error) {
      if (requestId !== this.lookupRequestId) {
        this.failLookupInteraction(requestId);
        return;
      }
      const retryable = error instanceof EntryLookupError ? error.retryable : true;
      this.setData({
        error: error instanceof Error ? error.message : "当前无法确认球队数据，请稍后重试",
        errorCode: error instanceof EntryLookupError ? error.status : "UNAVAILABLE",
        canRetryLookup: retryable,
        ...(preservePreview && retryable ? {} : emptyEntryPreviewData())
      });
    } finally {
      if (requestId === this.lookupRequestId) {
        this.setData(
          { loading: false, buttonText: "查找球队" },
          () => this.observeLookupResult(),
        );
      }
    }
  },

  async lookupByName(keyword: string, requestId?: number) {
    if (requestId === undefined) requestId = this.beginLookupRequest();
    this.setData({
      loading: true,
      buttonText: "查找中...",
      error: "",
      errorCode: "",
      canRetryLookup: false,
      lookupNotice: "",
      ...emptyEntryPreviewData(),
      searchHits: []
    });
    try {
      const hits = await searchEntries(keyword, 10);
      if (requestId !== this.lookupRequestId || extractEntryId(this.data.manualEntryId) !== keyword) {
        this.failLookupInteraction(requestId);
        return;
      }
      if (hits.length === 0) {
        this.setData({
          error: "没有找到匹配的球队，可改用参赛 ID 再试",
          errorCode: "NOT_FOUND",
          canRetryLookup: false
        });
        return;
      }
      const [only] = hits;
      if (hits.length === 1 && only) {
        const hitEntryId = only.entryId || only.entry || 0;
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
        this.failLookupInteraction(requestId);
        return;
      }
      this.setData({
        error: error instanceof Error ? error.message : "查找球队失败，请稍后再试",
        errorCode: "UNAVAILABLE",
        canRetryLookup: true
      });
    } finally {
      if (requestId === this.lookupRequestId) {
        this.setData(
          { loading: false, buttonText: "查找球队" },
          () => this.observeLookupResult(),
        );
      }
    }
  },

  onSelectSearchHit(event: WechatMiniprogram.TouchEvent) {
    const entryId = Number(event.currentTarget.dataset.entryId);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      this.observeLookupResult();
      return;
    }
    const hit = this.data.searchHits.find((item) => item.entryId === entryId);
    this.failLookupInteraction();
    this.lookupRequestId += 1;
    this.setData({
      manualEntryId: String(entryId),
      error: "",
      errorCode: "",
      canRetryLookup: false,
      lookupNotice: "",
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
    }, () => this.observeLookupResult());
  },

  onRetryLookup() {
    if (this.data.loading) {
      this.observeLookupResult();
      return;
    }
    return runPageInteractionDelegation(this, () => this.onLookupEntry());
  },

  onSetMyEntry() {
    const entryId = this.data.previewEntryId;
    if (!entryId) {
      return;
    }

    const sync = saveMiniProgramFollowEntry(entryId);
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
    // Keep the follow action attached to the Home content that will confirm
    // the new team after the short transition delay.
    this.redirectHandoff = handoffPageInteraction(routes.home);
    this.redirectDispatched = false;
    this.redirectTimer = setTimeout(() => {
      this.redirectTimer = undefined;
      const handoff = this.redirectHandoff;
      if (!this.pageVisible) {
        handoff?.rollback();
        this.redirectHandoff = null;
        this.redirectDispatched = false;
        return;
      }
      this.redirectDispatched = true;
      wx.reLaunch({
        url: routes.home,
        success: () => {
          if (this.redirectHandoff === handoff) {
            this.redirectHandoff = null;
            this.redirectDispatched = false;
          }
        },
        fail: () => {
          handoff?.rollback();
          if (this.redirectHandoff === handoff) {
            this.redirectHandoff = null;
            this.redirectDispatched = false;
          }
        },
      });
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
}, {
  explicitInteractionHandlers: [
    "onEntryConfirm",
    "onLookupEntry",
    "onRetryLookup",
    "onSelectSearchHit",
  ],
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
    previewOverallRank: formatRank(entry.overallRank),
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
    overallRank: formatRank(hit.overallRank)
  };
}
