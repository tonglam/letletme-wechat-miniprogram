import { PerformancePage } from "../../../utils/performance-page";
import { getTeamSummary } from "../../../services/team.service";
import type { TeamSummary } from "../../../models/team";
import { routes } from "../../../config/routes";
import { ensureAppContext } from "../../../services/app-context.service";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

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
  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  loadRequestId: 0,
  resumeOnShow: false,

  onLoad(options: Record<string, string | undefined>) {
    this.pageVisible = true;
    this.routeSeason = options.season || "";
    this.setData({
      teamId: options.teamId || "",
      season: this.routeSeason || getApp<IAppOption>().globalData.season || ""
    });
    return this.loadData("load");
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed || !this.resumeOnShow) return;
    this.resumeOnShow = false;
    await this.loadData("show");
  },

  onHide() {
    this.pageVisible = false;
    this.resumeOnShow = this.data.loading && !this.data.team;
    this.lifecycleRevision += 1;
    this.loadRequestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.lifecycleRevision += 1;
    this.loadRequestId += 1;
  },

  async loadData(trigger: PageRequestTrace["trigger"] = "load") {
    if (!this.data.teamId) {
      this.setData({ loading: false, error: "", emptyState: true });
      return;
    }

    const lifecycleRevision = this.lifecycleRevision;
    const requestId = ++this.loadRequestId;
    const isActiveRequest = () => (
      this.pageVisible
      && lifecycleRevision === this.lifecycleRevision
      && requestId === this.loadRequestId
    );
    const trace = capturePageRequestTrace({
      callerSurface: "data-team-detail",
      trigger
    });
    this.setData({ loading: true, error: "", emptyState: false });
    try {
      let season = this.data.season;
      try {
        const context = await ensureAppContext({ reason: "page-load" });
        season = this.routeSeason || context.season || season;
      } catch (error) {
        if (!season) throw error;
      }
      if (!isActiveRequest()) return;
      this.setData({ season });
      const team = await getTeamSummary(this.data.teamId, season, trace);
      if (!isActiveRequest()) return;
      this.setData({ team });
    } catch (error) {
      if (!isActiveRequest()) return;
      this.setData({ error: error instanceof Error ? error.message : "球队详情加载失败" });
    } finally {
      if (isActiveRequest()) this.setData({ loading: false });
    }
  },

  onRetry() {
    this.loadData("refresh");
  },

  onBackToTeams() {
    wx.redirectTo({ url: routes.dataTeams });
  }
});
