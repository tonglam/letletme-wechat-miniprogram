import { getTeamSummary } from "../../../services/team.service";
import type { TeamSummary } from "../../../models/team";

Page({
  data: {
    loading: false,
    error: "",
    teamId: "",
    team: undefined as TeamSummary | undefined
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ teamId: options.teamId || "" });
    this.loadData();
  },

  async loadData() {
    if (!this.data.teamId) {
      this.setData({ error: "缺少球队 ID" });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const team = await getTeamSummary(this.data.teamId, getApp<IAppOption>().globalData.season);
      this.setData({ team });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "球队详情加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetry() {
    this.loadData();
  }
});
