import { PerformancePage } from "../../../utils/performance-page";
import { getTeamSummary } from "../../../services/team.service";
import type { TeamSummary } from "../../../models/team";
import { routes } from "../../../config/routes";
import { ensureAppContext } from "../../../services/app-context.service";

PerformancePage({
  data: {
    loading: false,
    error: "",
    emptyState: false,
    teamId: "",
    season: "",
    team: undefined as TeamSummary | undefined
  },

  routeSeason: "",

  onLoad(options: Record<string, string | undefined>) {
    this.routeSeason = options.season || "";
    this.setData({
      teamId: options.teamId || "",
      season: this.routeSeason || getApp<IAppOption>().globalData.season || ""
    });
    return this.loadData();
  },

  async loadData() {
    if (!this.data.teamId) {
      this.setData({ loading: false, error: "", emptyState: true });
      return;
    }

    this.setData({ loading: true, error: "", emptyState: false });
    try {
      let season = this.data.season;
      try {
        const context = await ensureAppContext({ reason: "page-load" });
        season = this.routeSeason || context.season || season;
      } catch (error) {
        if (!season) throw error;
      }
      this.setData({ season });
      const team = await getTeamSummary(this.data.teamId, season);
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
