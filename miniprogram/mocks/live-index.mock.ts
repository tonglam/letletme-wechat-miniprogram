export const liveIndexMockData = {
  contextResolved: true,
  entryId: 123456,
  entryName: "WhoamI FC",
  event: 3,
  currentGw: 3,
  cards: [
    {
      title: "实时球队",
      description: "阵容、队长、替补、开卡和实时分数",
      meta: "实时阵容",
      status: "球队必看",
      url: "/pages/live/entry/entry" as const
    },
    {
      title: "实时比赛",
      description: "比赛状态、比分、BPS 和关键事件",
      meta: "比赛中心",
      status: "按状态筛选",
      url: "/pages/live/match/match" as const
    },
    {
      title: "实时赛事",
      description: "赛事实时排名、搜索和排序",
      meta: "赛事榜",
      status: "支持切换",
      url: "/pages/live/tournament/tournament" as const
    }
  ]
};
