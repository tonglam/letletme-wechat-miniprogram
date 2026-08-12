import { PerformancePage } from "../../../utils/performance-page";
import { getPlayerInfoByCode } from "../../../services/player.service";
import type { PlayerDetail } from "../../../models/player";
import { routes } from "../../../config/routes";

PerformancePage({
  data: {
    loading: false,
    error: "",
    emptyState: false,
    code: "",
    season: "",
    player: undefined as PlayerDetail | undefined
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ code: options.code || "", season: options.season || getApp<IAppOption>().globalData.season });
    this.loadData();
  },

  async loadData() {
    if (!this.data.code) {
      this.setData({ loading: false, error: "", emptyState: true });
      return;
    }

    this.setData({ loading: true, error: "", emptyState: false });
    try {
      const player = await getPlayerInfoByCode(this.data.code, this.data.season);
      this.setData({ player });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "球员详情加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetry() {
    this.loadData();
  },

  onBackToPlayers() {
    wx.redirectTo({ url: routes.dataPlayers });
  }
});
