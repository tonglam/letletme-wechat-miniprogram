import { PerformancePage } from "../../../utils/performance-page";
import { getTeamList } from "../../../services/common.service";
import type { TeamOption } from "../../../models/common";
import { goToTeamDetail } from "../../../utils/navigation";
import { ensureAppContext } from "../../../services/app-context.service";

PerformancePage({
  data: {
    loading: false,
    error: "",
    teams: [] as TeamOption[]
  },

  async onLoad() {
    await this.loadData();
  },

  async loadData(forceRefresh = false) {
    this.setData({ loading: true, error: "" });
    try {
      const context = await ensureAppContext({
        reason: forceRefresh ? "pull-refresh" : "page-load",
        forceRefresh
      });
      const teams = await getTeamList(context.season, forceRefresh);
      this.setData({ teams });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "球队列表加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onOpenTeam(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { team: string }>) {
    goToTeamDetail(event.currentTarget.dataset.team);
  },

  onRetry() {
    this.loadData(true);
  }
});
