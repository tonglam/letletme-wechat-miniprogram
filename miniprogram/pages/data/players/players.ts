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

  onLoad() {
    this.loadPlayers();
  },

  async loadPlayers(forceRefresh = false) {
    this.setData({ loading: true, error: "" });
    try {
      const players = await getPlayersByElementType("all", forceRefresh);
      this.setData({ players, displayedPlayers: players.slice(0, 50) });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "球员数据加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSearch(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    const keyword = event.detail.keyword;
    const lower = keyword.toLowerCase();
    const displayedPlayers = this.data.players
      .filter((player) => (player.name || "").toLowerCase().indexOf(lower) >= 0)
      .slice(0, 50);
    this.setData({ keyword, displayedPlayers });
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
