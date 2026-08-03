import { routes } from "../../../config/routes";
import { forceEntryBinding, navigateTo } from "../../../utils/navigation";

Page({
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
        title: "实时联赛",
        description: "联赛实时排名、搜索和排序",
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

  onOpenCard(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { url: string }>) {
    if (!this.data.entryId) {
      forceEntryBinding();
      return;
    }

    navigateTo(event.currentTarget.dataset.url);
  }
});
