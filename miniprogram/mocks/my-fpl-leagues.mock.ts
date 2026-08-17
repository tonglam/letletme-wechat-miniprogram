/** Mock contract mirrors leagues.ts view-model builders exactly. */
export const myFplLeaguesMockData = {
  loading: false,
  viewLoading: false,
  error: "",
  viewError: "",
  emptyState: "",
  emptyEyebrow: "",
  emptyTitle: "",
  emptyDescription: "",
  emptyActionText: "",
  entryId: 123456,
  event: 3,
  maxGw: 38,
  tournaments: [
    { id: 501, name: "letletme 超级联赛", groupMode: "POINTS_RACES", totalTeamNum: 24, groupStartedEventId: 1, groupEndedEventId: 38, state: "ACTIVE" },
    { id: 502, name: "办公室挑战赛", groupMode: "POINTS_RACES", totalTeamNum: 12, groupStartedEventId: 1, groupEndedEventId: 38, state: "ACTIVE" }
  ],
  tournamentNames: ["letletme 超级联赛", "办公室挑战赛"],
  selectedTournamentIndex: 0,
  selectedTournament: { id: 501, name: "letletme 超级联赛", groupMode: "POINTS_RACES", totalTeamNum: 24, groupStartedEventId: 1, groupEndedEventId: 38, state: "ACTIVE" },
  activeView: "season",
  showSeason: true,
  showGameweek: false,
  keyword: "",
  heroRank: "3",
  heroRankSub: "总积分 1,856 · 距榜首 42 · 距前一名 25 · FPL 总排名 12.6k",
  heroKicker: "截至第 3 轮的积分榜",
  meTiles: [
    { label: "球队价值", value: "£103.5m", meta: "赛事内第 5 名 · 场均 £101.3m" },
    { label: "转会数", value: "12", meta: "赛事内第 9 名 · 场均 14" },
    { label: "总扣分", value: "8", meta: "赛事内第 14 名 · 场均 12" },
    { label: "替补积分", value: "26", meta: "赛事内第 2 名 · 场均 18" },
    { label: "自动换人", value: "6", meta: "赛事内第 7 名 · 场均 4" },
    { label: "每轮均分", value: "61.9", meta: "赛事内第 3 名 · 场均 58.4" }
  ],
  overviewStats: [
    { label: "参赛", value: "24" },
    { label: "榜首总分", value: "1,898" },
    { label: "平均总分", value: "1,742" },
    { label: "冠亚分差", value: "17" }
  ],
  leaderRows: [
    { id: "OVERALL_POINTS", label: "总分", name: "银河战舰", meta: "Kai · 场均 1,742", value: "1,898" },
    { id: "TEAM_VALUE", label: "球队价值", name: "北伦敦红白", meta: "Rex · 场均 £101.3m", value: "£105.1m" },
    { id: "TRANSFERS", label: "转会次数", name: "换人如换刀", meta: "阿哲 · 场均 14", value: "21" },
    { id: "TOTAL_COSTS", label: "转会扣分", name: "换人如换刀", meta: "阿哲 · 场均 12", value: "24" },
    { id: "BENCH_POINTS", label: "板凳分", name: "替补席大亨", meta: "Bo · 场均 18", value: "41" },
    { id: "AUTO_SUB_POINTS", label: "自动换人分", name: "WhoamI FC", meta: "Tong · 场均 4", value: "6" }
  ],
  gwNotice: "",
  gwTiles: [
    { label: "我的排名", value: "3", meta: "上升 2", tone: "good" },
    { label: "第 3 轮积分", value: "62", meta: "本轮扣分：-4" },
    { label: "队长得分", value: "18" },
    { label: "最高得分", value: "91", meta: "银河战舰" }
  ],
  topRows: [
    { id: "top-1", title: "1. 银河战舰", meta: "Kai · TC", value: "91" },
    { id: "top-2", title: "2. 北伦敦红白", meta: "Rex", value: "84" },
    { id: "top-3", title: "3. WhoamI FC", meta: "Tong", value: "72" },
    { id: "top-4", title: "4. 蓝月当空", meta: "Momo", value: "70" },
    { id: "top-5", title: "5. 红军不怕远征难", meta: "Jin", value: "68" }
  ],
  riserRows: [
    { id: "up-1", title: "替补席大亨", meta: "#11 → #6", value: "+5", tone: "good" },
    { id: "up-2", title: "蓝月当空", meta: "#8 → #4", value: "+4", tone: "good" },
    { id: "up-3", title: "WhoamI FC", meta: "#5 → #3", value: "+2", tone: "good" }
  ],
  fallerRows: [
    { id: "down-1", title: "换人如换刀", meta: "#4 → #9", value: "-5", tone: "bad" },
    { id: "down-2", title: "红魔复兴", meta: "#6 → #10", value: "-4", tone: "bad" }
  ],
  boardCol1: "总积分",
  boardCol2: "总排名",
  boardCol3: "价值",
  boardRows: [
    { entryId: 9001, rankText: "1", moveText: "", moveTone: "" as const, name: "银河战舰", manager: "Kai", chip: "", me: false, c1: "1,898", c1Tone: "good", c2: "2.1k", c3: "£104.6m", sortRank: 1, sortC1: 1898, sortC2: 2100, sortC3: 1046 },
    { entryId: 9002, rankText: "2", moveText: "", moveTone: "" as const, name: "北伦敦红白", manager: "Rex", chip: "", me: false, c1: "1,881", c1Tone: "good", c2: "3.4k", c3: "£105.1m", sortRank: 2, sortC1: 1881, sortC2: 3400, sortC3: 1051 },
    { entryId: 123456, rankText: "3", moveText: "", moveTone: "" as const, name: "WhoamI FC", manager: "Tong", chip: "", me: true, c1: "1,856", c1Tone: "good", c2: "12.6k", c3: "£103.5m", sortRank: 3, sortC1: 1856, sortC2: 12600, sortC3: 1035 },
    { entryId: 9004, rankText: "4", moveText: "", moveTone: "" as const, name: "蓝月当空", manager: "Momo", chip: "TC", me: false, c1: "1,820", c1Tone: "good", c2: "21.9k", c3: "£102.8m", sortRank: 4, sortC1: 1820, sortC2: 21900, sortC3: 1028 },
    { entryId: 9005, rankText: "5", moveText: "", moveTone: "" as const, name: "红军不怕远征难", manager: "Jin", chip: "", me: false, c1: "1,802", c1Tone: "good", c2: "30.2k", c3: "£101.9m", sortRank: 5, sortC1: 1802, sortC2: 30200, sortC3: 1019 },
    { entryId: 9006, rankText: "6", moveText: "", moveTone: "" as const, name: "替补席大亨", manager: "Bo", chip: "BB", me: false, c1: "1,790", c1Tone: "good", c2: "41.5k", c3: "£100.4m", sortRank: 6, sortC1: 1790, sortC2: 41500, sortC3: 1004 }
  ],
  displayedRows: [] as unknown[],
  filteredCount: 6,
  sortOptions: [
    { key: "rank", label: "排名", asc: true },
    { key: "c1", label: "总积分", asc: false },
    { key: "c2", label: "总排名", asc: true },
    { key: "c3", label: "价值", asc: false }
  ],
  sortKey: "rank",
  sortAsc: true,
  pageSize: 20,
  hasMore: false,
  hasSeasonData: true,
  hasGwData: true,
  fromCache: false,
  pathPoints: [
    { gameweek: 1, tournamentRank: 6, overallPoints: 620, leaderOverallPoints: 680, averageOverallPoints: 540 },
    { gameweek: 2, tournamentRank: 5, overallPoints: 1240, leaderOverallPoints: 1290, averageOverallPoints: 1120 },
    { gameweek: 3, tournamentRank: 3, overallPoints: 1856, leaderOverallPoints: 1898, averageOverallPoints: 1742 }
  ],
  pathModes: [
    { id: "tournamentRank", label: "排名" },
    { id: "gapToLeader", label: "你 vs 第一" },
    { id: "pointsVsAverage", label: "你 vs 平均" }
  ],
  pathMode: "tournamentRank",
  pathLoading: false,
  pathVisible: true,
  pathSeries: [
    { x: 1, value: 6, label: "1" },
    { x: 2, value: 5, label: "2" },
    { x: 3, value: 3, label: "3" }
  ],
  pathInvertY: true,
  pathHint: "折线 = 各轮赛事内排名（越好越上）。",
  pathSummary: "点某一轮看明细",
  pathSelectedGw: null,
  pathHasSelected: false
};
