import { getPlayerInfoByCode } from "../../../services/player.service";
import type { PlayerDetail } from "../../../models/player";

Page({
  data: {
    loading: false,
    error: "",
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
      this.setData({ error: "缺少球员 code" });
      return;
    }

    this.setData({ loading: true, error: "" });
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
  }
});
