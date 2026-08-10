import { getPlayersByElementType } from "../../../services/player.service";
import type { PlayerOption } from "../../../models/player";
import { goToPlayerDetail } from "../../../utils/navigation";

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

  async loadPlayers(forceRefresh = false) {
    this.setData({ loading: true, error: "" });
    try {
      const players = await getPlayersByElementType("all", forceRefresh);
      this.setData({ players });
      this.applyKeyword(this.pendingKeyword);
      this.pendingKeyword = "";
    } catch (error) {
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
    this.applyKeyword(event.detail.keyword);
  },

  onResetSearch() {
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
