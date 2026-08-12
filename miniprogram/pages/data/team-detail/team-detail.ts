import { PerformancePage } from "../../../utils/performance-page";
import { getTeamSummary } from "../../../services/team.service";
import type { TeamSummary } from "../../../models/team";
import { routes } from "../../../config/routes";

PerformancePage({
  data: {
    loading: false,
    error: "",
    emptyState: false,
    teamId: "",
    team: undefined as TeamSummary | undefined
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ teamId: options.teamId || "" });
    this.loadData();
  },

  async loadData() {
    if (!this.data.teamId) {
      this.setData({ loading: false, error: "", emptyState: true });
      return;
    }

    this.setData({ loading: true, error: "", emptyState: false });
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
  },

  onBackToTeams() {
    wx.redirectTo({ url: routes.dataTeams });
  }
});
