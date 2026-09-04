import { PerformancePage } from "../../../utils/performance-page";
import { getTeamSummary } from "../../../services/team.service";
import type { TeamSummary } from "../../../models/team";
import { routes } from "../../../config/routes";
import { setPageTitle } from "../../../utils/navigation";
import { ensureAppContext } from "../../../services/app-context.service";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

interface TeamMetric {
  label: string;
  value: string;
}

PerformancePage({
  data: {
    loading: false,
    error: "",
    errorWorkload: "home" as "home" | "player-stats",
    emptyState: false,
    teamId: "",
    season: "",
    team: undefined as TeamSummary | undefined,
    strengthDots: [] as boolean[],
    hasStrength: false,
    hasSeasonRecord: false,
    seasonMetrics: [] as TeamMetric[],
    venueStrengths: [] as TeamMetric[]
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
    const forceRefresh = this.resumeForceRefresh;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    await this.loadData("show", forceRefresh);
  },

  onHide() {
    this.pageVisible = false;
    this.resumeOnShow = this.forceRefreshPending || (this.data.loading && !this.data.team);
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
        if (!this.data.teamId) {
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
      callerSurface: "data-team-detail",
      trigger
    });
    this.setData({ loading: true, error: "", errorWorkload: "home", emptyState: false });
    try {
      let season = this.data.season;
      try {
        const context = await ensureAppContext({
          reason: forceRefresh ? "pull-refresh" : "page-load",
          forceRefresh
        });
        season = this.routeSeason || context.season || season;
      } catch (error) {
        if (!season) throw error;
      }
      if (!isActiveRequest()) return;
      this.setData({ season, errorWorkload: "player-stats" });
      const team = await getTeamSummary(this.data.teamId, season, forceRefresh, trace);
      if (!isActiveRequest()) return;
      const presentation = buildTeamSummaryPresentation(team);
      this.setData({
        team,
        ...presentation
      });
      setPageTitle(team.name || "球队详情");
    } catch (error) {
      if (!isActiveRequest()) return;
      this.setData({ error: error instanceof Error ? error.message : "球队详情加载失败" });
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

  onPullDownRefresh() {
    return this.loadData("refresh", true).finally(() => wx.stopPullDownRefresh());
  },

  onBackToTeams() {
    wx.redirectTo({ url: routes.dataTeams });
  }
});

export function buildTeamSummaryPresentation(team: TeamSummary): {
  strengthDots: boolean[];
  hasStrength: boolean;
  hasSeasonRecord: boolean;
  seasonMetrics: TeamMetric[];
  venueStrengths: TeamMetric[];
} {
  const strength = boundedStrength(team.strength);
  const played = nonNegativeInteger(team.played);
  const hasSeasonRecord = played > 0;
  const venueStrengths = [
    { label: "主场整体", value: boundedStrength(team.strengthOverallHome) },
    { label: "客场整体", value: boundedStrength(team.strengthOverallAway) }
  ]
    .filter((metric) => metric.value > 0)
    .map((metric) => ({ label: metric.label, value: `${metric.value} / 5` }));

  return {
    strengthDots: Array.from({ length: 5 }, (_, index) => index < strength),
    hasStrength: strength > 0,
    hasSeasonRecord,
    seasonMetrics: hasSeasonRecord ? [
      { label: "排名", value: positiveIntegerText(team.position) },
      { label: "积分", value: String(nonNegativeInteger(team.points)) },
      { label: "已赛", value: String(played) },
      {
        label: "战绩",
        value: `${nonNegativeInteger(team.win)}胜 ${nonNegativeInteger(team.draw)}平 ${nonNegativeInteger(team.loss)}负`
      }
    ] : [],
    venueStrengths
  };
}

function boundedStrength(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(5, Math.round(parsed)));
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function positiveIntegerText(value: unknown): string {
  const parsed = nonNegativeInteger(value);
  return parsed > 0 ? String(parsed) : "-";
}
