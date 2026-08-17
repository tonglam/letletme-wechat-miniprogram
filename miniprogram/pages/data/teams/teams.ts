import { MOCK_ENABLED } from "../../../config/mock-mode";
import { dataTeamsMockData } from "../../../mocks/index";
import { PerformancePage } from "../../../utils/performance-page";
import { getTeamList } from "../../../services/common.service";
import type { TeamOption } from "../../../models/common";
import { goToTeamDetail } from "../../../utils/navigation";
import { ensureAppContext } from "../../../services/app-context.service";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

PerformancePage({
  data: {
    loading: false,
    error: "",
    teams: [] as TeamOption[]
  },

  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  resumeOnShow: false,
  activeForceRefresh: false,
  resumeForceRefresh: false,

  async onLoad() {
    this.pageVisible = true;
    await this.loadData();
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed || !this.resumeOnShow) return;
    const resumeForceRefresh = this.resumeForceRefresh;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    const trace = capturePageRequestTrace({
      callerSurface: "data-teams",
      trigger: "show"
    });
    await this.loadData(resumeForceRefresh, trace);
  },

  onHide() {
    this.pageVisible = false;
    this.resumeOnShow = this.data.loading;
    this.resumeForceRefresh = this.resumeOnShow && this.activeForceRefresh;
    this.lifecycleRevision += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    this.activeForceRefresh = false;
    this.lifecycleRevision += 1;
  },

  async loadData(forceRefresh = false, originatingTrace?: PageRequestTrace) {
    if (MOCK_ENABLED) {
      this.setData(dataTeamsMockData);
      return;
    }
    this.activeForceRefresh = forceRefresh;
    const lifecycleRevision = this.lifecycleRevision;
    const isActiveLifecycle = () => this.pageVisible && lifecycleRevision === this.lifecycleRevision;
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "data-teams",
      trigger: forceRefresh ? "refresh" : "load"
    });
    this.setData({ loading: true, error: "" });
    try {
      const context = await ensureAppContext({
        reason: forceRefresh ? "pull-refresh" : "page-load",
        forceRefresh
      });
      if (!isActiveLifecycle()) return;
      const teams = await getTeamList(context.season, forceRefresh, trace);
      if (!isActiveLifecycle()) return;
      this.setData({ teams });
    } catch (error) {
      if (!isActiveLifecycle()) return;
      this.setData({ error: error instanceof Error ? error.message : "球队列表加载失败" });
    } finally {
      if (isActiveLifecycle()) {
        this.setData({ loading: false });
        this.activeForceRefresh = false;
      }
    }
  },

  onOpenTeam(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { team: string }>) {
    goToTeamDetail(event.currentTarget.dataset.team);
  },

  onRetry() {
    this.loadData(true);
  }
});
