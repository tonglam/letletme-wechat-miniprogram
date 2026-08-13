import { PerformancePage } from "../../../utils/performance-page";
import {
  getPlayersForPickerPage,
  type PlayerPickerPageResult
} from "../../../services/player.service";
import type { PlayerOption } from "../../../models/player";
import { goToPlayerDetail } from "../../../utils/navigation";
import { ensureAppContext } from "../../../services/app-context.service";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

export function resolveKeywordAfterPlayerLoad(
  pendingKeyword: string,
  currentKeyword: string,
  searchEditedWhileLoading: boolean
): string {
  return searchEditedWhileLoading ? currentKeyword : pendingKeyword || currentKeyword;
}

export function mergePlayerPages(
  existing: PlayerOption[],
  incoming: PlayerOption[]
): PlayerOption[] {
  const seen = new Set(existing.map((player) => player.element));
  return existing.concat(incoming.filter((player) => {
    if (seen.has(player.element)) return false;
    seen.add(player.element);
    return true;
  }));
}

export function shouldApplyPlayerResponse(
  responseRevision: number,
  currentRevision: number
): boolean {
  return responseRevision === currentRevision;
}

PerformancePage({
  data: {
    loading: false,
    loadingMore: false,
    error: "",
    loadMoreError: "",
    keyword: "",
    players: [] as PlayerOption[],
    displayedPlayers: [] as PlayerOption[],
    nextCursor: null as number | null,
    totalCount: 0,
    hasMore: false
  },

  requestRevision: 0,
  pageVisible: false,
  hasShown: false,
  paginationPending: false,
  paginationCursor: null as number | null,
  resumePaginationAfterShow: false,
  resumePaginationCursor: null as number | null,
  searchPending: false,
  searchPendingForceRefresh: false,
  resumeSearchAfterShow: false,
  resumeSearchForceRefresh: false,

  async onLoad(options: Record<string, string | undefined>) {
    this.pageVisible = true;
    const keyword = String(options?.keyword || "").trim();
    this.setData({ keyword });
    await this.startSearch(keyword);
  },

  onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    const resumePagination = resumed && this.resumePaginationAfterShow;
    const resumeCursor = this.resumePaginationCursor;
    const resumeSearch = resumed && this.resumeSearchAfterShow;
    const resumeSearchForceRefresh = this.resumeSearchForceRefresh;
    if (this.data.loadingMore) {
      this.setData({ loadingMore: false });
    }
    if (resumePagination && resumeCursor !== null) {
      const task = this.loadMoreFromCursor(resumeCursor);
      if (this.paginationPending && this.paginationCursor === resumeCursor) {
        this.resumePaginationAfterShow = false;
        this.resumePaginationCursor = null;
      }
      return task.finally(() => {
        if (this.pageVisible && !this.paginationPending && this.resumePaginationCursor === resumeCursor) {
          this.resumePaginationAfterShow = false;
          this.resumePaginationCursor = null;
        }
      });
    }
    if (resumeSearch) {
      const task = this.startSearch(this.data.keyword, resumeSearchForceRefresh);
      if (this.searchPending && this.searchPendingForceRefresh === resumeSearchForceRefresh) {
        this.resumeSearchAfterShow = false;
        this.resumeSearchForceRefresh = false;
      }
      return task.finally(() => {
        if (this.pageVisible && !this.searchPending && this.resumeSearchAfterShow) {
          this.resumeSearchAfterShow = false;
          this.resumeSearchForceRefresh = false;
        }
      });
    }
    if (resumed && this.data.loading) {
      return this.startSearch(this.data.keyword);
    }
    return undefined;
  },

  onHide() {
    this.resumeSearchAfterShow = this.searchPending;
    this.resumeSearchForceRefresh = this.searchPendingForceRefresh;
    this.resumePaginationAfterShow = this.paginationPending;
    this.resumePaginationCursor = this.paginationCursor;
    this.paginationPending = false;
    this.paginationCursor = null;
    this.pageVisible = false;
    this.requestRevision += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.paginationPending = false;
    this.paginationCursor = null;
    this.resumePaginationAfterShow = false;
    this.resumePaginationCursor = null;
    this.searchPending = false;
    this.searchPendingForceRefresh = false;
    this.resumeSearchAfterShow = false;
    this.resumeSearchForceRefresh = false;
    this.requestRevision += 1;
  },

  onPullDownRefresh() {
    return this.startSearch(this.data.keyword, true)
      .finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  async startSearch(keyword: string, forceRefresh = false): Promise<void> {
    this.searchPending = true;
    this.searchPendingForceRefresh = forceRefresh;
    this.paginationPending = false;
    this.paginationCursor = null;
    this.resumePaginationAfterShow = false;
    this.resumePaginationCursor = null;
    this.requestRevision += 1;
    const revision = this.requestRevision;
    const trace = capturePageRequestTrace({
      callerSurface: "players-directory",
      trigger: forceRefresh ? "refresh" : keyword ? "search" : "load",
      forceReason: forceRefresh ? "user-refresh" : undefined
    });
    this.setData({
      keyword,
      loading: true,
      loadingMore: false,
      error: "",
      loadMoreError: "",
      players: [],
      displayedPlayers: [],
      nextCursor: null,
      totalCount: 0,
      hasMore: false
    });
    try {
      await ensureAppContext({
        reason: forceRefresh ? "pull-refresh" : "page-load",
        forceRefresh
      });
      if (!this.pageVisible || !shouldApplyPlayerResponse(revision, this.requestRevision)) return;
      await this.fetchPage(revision, null, false, forceRefresh, trace);
      if (this.pageVisible && shouldApplyPlayerResponse(revision, this.requestRevision)) {
        this.searchPending = false;
        this.searchPendingForceRefresh = false;
      }
    } catch (error) {
      if (!this.pageVisible || !shouldApplyPlayerResponse(revision, this.requestRevision)) return;
      this.searchPending = false;
      this.searchPendingForceRefresh = false;
      this.setData({
        loading: false,
        loadingMore: false,
        error: error instanceof Error ? error.message : "赛季信息暂时不可用，请稍后重试"
      });
    }
  },

  async fetchPage(
    revision: number,
    cursor: number | null,
    append: boolean,
    forceRefresh: boolean,
    originatingTrace?: PageRequestTrace
  ): Promise<void> {
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "players-directory",
      trigger: append ? "pagination" : forceRefresh ? "refresh" : "load",
      forceReason: forceRefresh ? "user-refresh" : undefined
    });
    try {
      const page: PlayerPickerPageResult = await getPlayersForPickerPage({
        search: this.data.keyword,
        limit: 50,
        cursor,
        forceRefresh,
        trace
      });
      if (!this.pageVisible || !shouldApplyPlayerResponse(revision, this.requestRevision)) return;

      const players = append
        ? mergePlayerPages(this.data.players, page.items)
        : page.items;
      this.setData({
        players,
        displayedPlayers: players,
        nextCursor: page.nextCursor,
        totalCount: page.totalCount,
        hasMore: page.nextCursor !== null,
        error: "",
        loadMoreError: ""
      });
    } catch (error) {
      if (!this.pageVisible || !shouldApplyPlayerResponse(revision, this.requestRevision)) return;
      const message = error instanceof Error ? error.message : "球员数据加载失败";
      if (append) {
        this.setData({ loadMoreError: message });
      } else {
        this.setData({ error: message });
      }
    } finally {
      if (this.pageVisible && shouldApplyPlayerResponse(revision, this.requestRevision)) {
        this.setData({ loading: false, loadingMore: false });
      }
    }
  },

  loadMore(): Promise<void> {
    const cursor = this.data.nextCursor;
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) {
      return Promise.resolve();
    }
    if (cursor === null) return Promise.resolve();
    return this.loadMoreFromCursor(cursor);
  },

  loadMoreFromCursor(cursor: number): Promise<void> {
    const revision = this.requestRevision;
    this.paginationPending = true;
    this.paginationCursor = cursor;
    this.setData({ loadingMore: true, loadMoreError: "" });
    return this.fetchPage(revision, cursor, true, false).finally(() => {
      if (this.pageVisible && revision === this.requestRevision) {
        this.paginationPending = false;
        this.paginationCursor = null;
      }
    });
  },

  onSearch(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    const keyword = String(event.detail.keyword || "").trim();
    this.startSearch(keyword);
  },

  onResetSearch() {
    this.startSearch("");
  },

  onOpenPlayer(event: WechatMiniprogram.CustomEvent<{ player: PlayerOption }>) {
    const player = event.detail.player;
    if (player?.code) {
      goToPlayerDetail(player.code);
    }
  },

  onRetry() {
    this.startSearch(this.data.keyword, true);
  },

  onRetryLoadMore() {
    this.loadMore();
  }
});
