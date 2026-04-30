import { routes } from "../../../config/routes";
import { navigateTo } from "../../../utils/navigation";

Page({
  data: {
    cards: [
      { title: "球员数据", description: "搜索球员和查看详情", url: routes.dataPlayers },
      { title: "球队数据", description: "球队阵容、赛程、定位球", url: routes.dataTeams },
      { title: "身价变化", description: "每日涨跌和球员历史", url: routes.dataPrice },
      { title: "阵容选择", description: "联赛选择率、队长和转会趋势", url: routes.dataSelections }
    ]
  },

  onShow() {
  },

  onOpenCard(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { url: string }>) {
    navigateTo(event.currentTarget.dataset.url);
  }
});
