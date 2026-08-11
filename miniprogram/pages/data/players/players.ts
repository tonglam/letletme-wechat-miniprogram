import {
  getPlayersForPickerPage,
  type PlayerPickerPageResult
} from "../../../services/player.service";
import type { PlayerOption } from "../../../models/player";
import { goToPlayerDetail } from "../../../utils/navigation";

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

Page({
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

  onLoad(options: Record<string, string | undefined>) {
    const keyword = String(options?.keyword || "").trim();
    this.setData({ keyword });
    this.startSearch(keyword);
  },

  onPullDownRefresh() {
    this.startSearch(this.data.keyword, true)
      .finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  startSearch(keyword: string, forceRefresh = false): Promise<void> {
    this.requestRevision += 1;
    const revision = this.requestRevision;
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
    return this.fetchPage(revision, null, false, forceRefresh);
  },

  async fetchPage(
    revision: number,
    cursor: number | null,
    append: boolean,
    forceRefresh: boolean
  ): Promise<void> {
    try {
      const page: PlayerPickerPageResult = await getPlayersForPickerPage({
        search: this.data.keyword,
        limit: 50,
        cursor,
        forceRefresh
      });
      if (!shouldApplyPlayerResponse(revision, this.requestRevision)) return;

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
      if (!shouldApplyPlayerResponse(revision, this.requestRevision)) return;
      const message = error instanceof Error ? error.message : "球员数据加载失败";
      if (append) {
        this.setData({ loadMoreError: message });
      } else {
        this.setData({ error: message });
      }
    } finally {
      if (shouldApplyPlayerResponse(revision, this.requestRevision)) {
        this.setData({ loading: false, loadingMore: false });
      }
    }
  },

  loadMore(): Promise<void> {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) {
      return Promise.resolve();
    }
    this.setData({ loadingMore: true, loadMoreError: "" });
    return this.fetchPage(
      this.requestRevision,
      this.data.nextCursor,
      true,
      false
    );
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
