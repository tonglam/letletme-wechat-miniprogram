import { getPlayersByElementType } from "../../../services/player.service";
import type { PlayerOption } from "../../../models/player";
import { goToPlayerDetail } from "../../../utils/navigation";

export function resolveKeywordAfterPlayerLoad(
  pendingKeyword: string,
  currentKeyword: string,
  searchEditedWhileLoading: boolean
): string {
  return searchEditedWhileLoading ? currentKeyword : pendingKeyword || currentKeyword;
}

Page({
  data: {
    loading: false,
    error: "",
    keyword: "",
    players: [] as PlayerOption[],
    displayedPlayers: [] as PlayerOption[]
  },

  onLoad(options: Record<string, string | undefined>) {
    // The Explore overview hands its search keyword over; filtering still
    // runs client-side over the cached directory (server search is gated).
    if (options?.keyword) {
      this.pendingKeyword = String(options.keyword);
    }
    this.loadPlayers();
  },

  pendingKeyword: "",
  searchRevision: 0,

  async loadPlayers(forceRefresh = false) {
    const searchRevision = this.searchRevision;
    // A route keyword is a one-shot handoff. Consume it before the request so
    // a failed first attempt cannot overwrite a newer user query on retry.
    const pendingKeyword = this.pendingKeyword;
    this.pendingKeyword = "";
    this.setData({ loading: true, error: "" });
    try {
      const players = await getPlayersByElementType("all", forceRefresh);
      this.setData({ players });
      this.applyKeyword(resolveKeywordAfterPlayerLoad(
        pendingKeyword,
        this.data.keyword,
        this.searchRevision !== searchRevision
      ));
    } catch (error) {
      // Keep an unedited route handoff available for the Retry action. If the
      // user changed the search while loading, their current input remains the
      // authoritative query and the stale route keyword stays consumed.
      if (this.searchRevision === searchRevision) {
        this.pendingKeyword = pendingKeyword;
      }
      this.setData({ error: error instanceof Error ? error.message : "球员数据加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyKeyword(keyword: string) {
    const lower = keyword.toLowerCase();
    const displayedPlayers = lower
      ? this.data.players
          .filter((player) => (player.name || "").toLowerCase().indexOf(lower) >= 0)
          .slice(0, 50)
      : this.data.players.slice(0, 50);
    this.setData({ keyword, displayedPlayers });
  },

  onSearch(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.searchRevision += 1;
    this.applyKeyword(event.detail.keyword);
  },

  onResetSearch() {
    this.searchRevision += 1;
    this.setData({
      keyword: "",
      displayedPlayers: this.data.players.slice(0, 50)
    });
  },

  onOpenPlayer(event: WechatMiniprogram.CustomEvent<{ player: PlayerOption }>) {
    const player = event.detail.player;
    if (player && player.code) {
      goToPlayerDetail(player.code);
    }
  },

  onRetry() {
    this.loadPlayers(true);
  }
});
