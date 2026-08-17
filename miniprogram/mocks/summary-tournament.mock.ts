export const summaryTournamentMockData = {
  loading: false,
  error: "",
  emptyState: "" as const,
  emptyEyebrow: "",
  emptyTitle: "",
  emptyDescription: "",
  emptyActionText: "",
  entryId: 123456,
  event: 3,
  maxGw: 38,
  tournaments: [
    { id: 1, name: "Overall" },
    { id: 2, name: "Friends League" }
  ],
  tournamentNames: ["Overall", "Friends League"],
  selectedTournamentIndex: 0,
  selectedTournamentName: "Overall",
  headerSubtitle: "Overall · GW3",
  activeTab: "overview" as const,
  showOverview: true,
  showRankings: false,
  showMetrics: false,
  overviewStats: [
    { label: "参赛球队", value: "10,000,000" },
    { label: "平均分", value: "62" },
    { label: "最高分", value: "127" },
    { label: "中位数", value: "58" }
  ],
  tournamentStats: [
    { label: "平均分", value: "62" },
    { label: "最高分", value: "127" },
    { label: "最低分", value: "12" },
    { label: "标准差", value: "18.5" }
  ],
  entryMetricStats: [
    { label: "GW 排名", value: "12,580", meta: "前 0.13%" },
    { label: "总分", value: "1856" },
    { label: "总排名", value: "12,580" },
    { label: "转会扣分", value: "-10" }
  ],
  rankingRows: [
    { id: "r1", rank: "1", entryName: "Dream Team FC", playerName: "John D", points: "127", netPoints: "127", overallRank: "1", chip: "无", isMine: false },
    { id: "r2", rank: "2", entryName: "Goal Machine", playerName: "Jane S", points: "115", netPoints: "105", overallRank: "3", chip: "无", isMine: false },
    { id: "r3", rank: "3", entryName: "FPL Kings", playerName: "Mike R", points: "108", netPoints: "108", overallRank: "5", chip: "BB", isMine: false },
    { id: "r4", rank: "4", entryName: "Top Bins", playerName: "Alex T", points: "102", netPoints: "102", overallRank: "8", chip: "无", isMine: false },
    { id: "r5", rank: "5", entryName: "WhoamI FC", playerName: "Tong W", points: "72", netPoints: "62", overallRank: "12580", chip: "无", isMine: true }
  ],
  hasOverview: true,
  hasRankings: true,
  hasMetrics: true
};
