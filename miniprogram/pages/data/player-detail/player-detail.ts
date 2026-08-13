import { PerformancePage } from "../../../utils/performance-page";
import { getPlayerInfoByCode } from "../../../services/player.service";
import type { PlayerDetail } from "../../../models/player";
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
    code: "",
    season: "",
    player: undefined as PlayerDetail | undefined
  },

  routeSeason: "",
  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  loadRequestId: 0,
  resumeOnShow: false,
  forceRefreshPending: false,
  resumeForceRefresh: false,

  onLoad(options: Record<string, string | undefined>) {
    this.pageVisible = true;
    this.routeSeason = options.season || "";
    this.setData({
      code: options.code || "",
      season: this.routeSeason || getApp<IAppOption>().globalData.season
    });
    return this.loadData("load");
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed || !this.resumeOnShow) return;
    const forceRefresh = this.resumeForceRefresh;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    await this.loadData("show", forceRefresh);
  },

  onHide() {
    this.pageVisible = false;
    const queuedResume = this.resumeOnShow;
    this.resumeOnShow = this.forceRefreshPending || (this.data.loading && !this.data.player);
    this.resumeOnShow = this.resumeOnShow || queuedResume;
    this.resumeForceRefresh = this.resumeForceRefresh || this.forceRefreshPending;
    this.lifecycleRevision += 1;
    this.loadRequestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    this.forceRefreshPending = false;
    this.lifecycleRevision += 1;
    this.loadRequestId += 1;
  },

  async loadData(trigger: PageRequestTrace["trigger"] = "load", forceRefresh = false) {
    if (!this.data.code) {
      this.setData({ loading: false, error: "", emptyState: true });
      return;
    }

    const lifecycleRevision = this.lifecycleRevision;
    const requestId = ++this.loadRequestId;
    this.forceRefreshPending = forceRefresh;
    const isActiveRequest = () => (
      this.pageVisible
      && lifecycleRevision === this.lifecycleRevision
      && requestId === this.loadRequestId
    );
    const trace = capturePageRequestTrace({
      callerSurface: "data-player-detail",
      trigger,
      forceReason: forceRefresh ? "user-refresh" : undefined
    });
    this.setData({ loading: true, error: "", emptyState: false });
    try {
      let season = this.routeSeason;
      try {
        const context = await ensureAppContext({
          reason: forceRefresh ? "pull-refresh" : "page-load",
          forceRefresh
        });
        season = this.routeSeason || context.season;
      } catch (error) {
        if (!season) throw error;
      }
      if (!isActiveRequest()) return;
      this.setData({ season });
      const player = await getPlayerInfoByCode(this.data.code, season, forceRefresh, trace);
      if (!isActiveRequest()) return;
      this.setData({ player });
    } catch (error) {
      if (!isActiveRequest()) return;
      this.setData({ error: error instanceof Error ? error.message : "球员详情加载失败" });
    } finally {
      if (isActiveRequest()) {
        this.forceRefreshPending = false;
        this.setData({ loading: false });
      }
    }
  },

  onRetry() {
    this.loadData("refresh", true);
  },

  onBackToPlayers() {
    wx.redirectTo({ url: routes.dataPlayers });
  }
});
