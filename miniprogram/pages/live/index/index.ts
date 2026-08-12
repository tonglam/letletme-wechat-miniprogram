import { PerformancePage } from "../../../utils/performance-page";
import { routes } from "../../../config/routes";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";

PerformancePage({
  data: {
    entryId: undefined as number | undefined,
    event: 0,
    cards: [
      {
        title: "实时球队",
        description: "阵容、队长、替补、开卡和实时分数",
        meta: "Entry live",
        status: "球队必看",
        url: routes.liveEntry
      },
      {
        title: "实时比赛",
        description: "比赛状态、比分、BPS 和关键事件",
        meta: "Match centre",
        status: "按状态筛选",
        url: routes.liveMatch
      },
      {
        title: "实时竞赛",
        description: "竞赛实时排名、搜索和排序",
        meta: "Tournament table",
        status: "支持切换",
        url: routes.liveTournament
      }
    ]
  },

  onShow() {
    const app = getApp<IAppOption>();
    this.setData({ entryId: app.globalData.entryId, event: app.globalData.gw });
  },

  onOpenEntryStrip() {
    if (this.data.entryId) {
      navigateTo(routes.liveEntry);
      return;
    }

    goToEntrySearch();
  },

  onOpenCard(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { url: string }>) {
    // Cards always open — entry-scoped destinations render their own
    // no-entry empty state instead of blocking navigation here.
    navigateTo(event.currentTarget.dataset.url);
  }
});
