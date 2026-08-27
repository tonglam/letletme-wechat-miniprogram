import { PerformancePage } from "../../../utils/performance-page";
import { EntryLookupError, getEntryInfo } from "../../../services/entry.service";
import { getApiSessionToken } from "../../../services/auth.service";
import { waitForAuthoritativeFollow } from "../../../utils/follow";
import type { EntryInfo } from "../../../models/entry";
import { goToEntrySearch } from "../../../utils/navigation";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

interface EntryProfileData {
  loading: boolean;
  error: string;
  errorRetryable: boolean;
  emptyState: boolean;
  entryId?: number;
  entry: EntryInfo;
}

PerformancePage({
  data: {
    loading: false,
    error: "",
    errorRetryable: false,
    emptyState: false,
    entryId: 0,
    entry: {}
  } as EntryProfileData,

  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  requestId: 0,
  resumeOnShow: false,
  authorityPending: false,
  authorityForceRefresh: false,
  resumeForceRefresh: false,
  routeEntry: undefined as string | undefined,

  async onLoad(options: Record<string, string | undefined>) {
    this.pageVisible = true;
    this.routeEntry = options.entry;
    const lifecycleRevision = this.lifecycleRevision;
    await this.loadAuthoritativeEntry("load", lifecycleRevision);
  },

  async loadAuthoritativeEntry(
    trigger: "load" | "show" | "refresh",
    lifecycleRevision?: number,
    forceRefresh = false
  ) {
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    this.authorityPending = true;
    this.authorityForceRefresh = forceRefresh;
    const trace = capturePageRequestTrace({ callerSurface: "entry-profile", trigger });
    const app = getApp<IAppOption>();
    if (!this.routeEntry && !getApiSessionToken()) {
      // With no valid session the stored binding is only offline/display
      // fallback: the account may have been relinked, so wait for the
      // refreshed profile before snapshotting the entry. Enter the loading
      // state first so the wait never renders the empty entry card.
      this.setData({ loading: true });
      try { await app.authReady; } catch {}
    }
    if (!this.pageVisible || ownerRevision !== this.lifecycleRevision) return;
    if (!this.routeEntry) await waitForAuthoritativeFollow();
    if (!this.pageVisible || ownerRevision !== this.lifecycleRevision) return;
    const entryId = Number(this.routeEntry || app.globalData.entryId);
    this.setData({ entryId: Number.isFinite(entryId) ? entryId : 0 });
    await this.loadEntry(entryId, forceRefresh, trace, ownerRevision);
    if (this.pageVisible && ownerRevision === this.lifecycleRevision) {
      this.authorityPending = false;
      this.authorityForceRefresh = false;
    }
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return undefined;
    const lifecycleRevision = this.lifecycleRevision;
    if (!this.routeEntry) await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return undefined;
    const nextEntryId = Number(this.routeEntry || getApp<IAppOption>().globalData.entryId);
    const normalizedEntryId = Number.isFinite(nextEntryId) ? nextEntryId : 0;
    if (normalizedEntryId !== Number(this.data.entryId)) {
      this.resumeOnShow = false;
      this.resumeForceRefresh = false;
      return this.loadAuthoritativeEntry("show", lifecycleRevision);
    }
    if (!this.resumeOnShow) return undefined;
    const forceRefresh = this.resumeForceRefresh;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    return this.loadAuthoritativeEntry("show", this.lifecycleRevision, forceRefresh);
  },

  onHide() {
    this.pageVisible = false;
    this.resumeOnShow = this.resumeOnShow || this.data.loading || this.authorityPending;
    if (this.authorityPending) {
      this.resumeForceRefresh = this.resumeForceRefresh || this.authorityForceRefresh;
    }
    this.authorityPending = false;
    this.authorityForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    this.authorityPending = false;
    this.authorityForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onPullDownRefresh() {
    return this.loadAuthoritativeEntry("refresh", this.lifecycleRevision, true)
      .finally(() => wx.stopPullDownRefresh());
  },

  async loadEntry(
    entryId: number,
    forceRefresh = false,
    trace?: PageRequestTrace,
    lifecycleRevision?: number
  ) {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      this.setData({
        loading: false,
        error: "",
        errorRetryable: false,
        emptyState: true,
        entry: {}
      });
      return;
    }

    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    const requestId = ++this.requestId;
    const isActiveRequest = () => this.pageVisible
      && ownerRevision === this.lifecycleRevision
      && requestId === this.requestId;
    this.setData({
      loading: true,
      error: "",
      errorRetryable: false,
      emptyState: false,
      entryId
    });
    try {
      const entry = await getEntryInfo(entryId, forceRefresh, trace);
      if (!isActiveRequest()) return;
      this.setData({ entry });
    } catch (error) {
      if (!isActiveRequest()) return;
      this.setData({
        error: error instanceof Error ? error.message : "球队资料加载失败",
        errorRetryable: error instanceof EntryLookupError ? error.retryable : true
      });
    } finally {
      if (isActiveRequest()) this.setData({ loading: false });
    }
  },

  onRetry() {
    void this.loadAuthoritativeEntry("refresh", this.lifecycleRevision, true);
  },

  onLinkAccount() {
    goToEntrySearch();
  },

  onChangeEntry() {
    goToEntrySearch();
  }
});
