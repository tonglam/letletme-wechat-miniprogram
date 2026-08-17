const mockTransferRows = [
    {
      id: "tr4",
      gameweek: "GW4",
      transfers: "0",
      cost: "0",
      hasCost: false,
      emptyText: "本轮未转会",
      moves: [],
      chip: "",
      transferCount: 0,
      collapsible: false,
      collapsed: false
    },
    {
      id: "tr3",
      gameweek: "GW3",
      transfers: "2",
      cost: "4",
      hasCost: true,
      emptyText: "",
      moves: [
        { id: "m1", outName: "Palmer", outTeam: "CHE", outPointsText: "10 分", inName: "Eze", inTeam: "ARS", inPointsText: "2 分", priceText: "£10.3m → £7.2m" },
        { id: "m2", outName: "Isak", outTeam: "NEW", outPointsText: "未出场", inName: "Wood", inTeam: "NFO", inPointsText: "7 分", priceText: "£12.1m → £6.4m" }
      ],
      chip: "",
      transferCount: 2,
      collapsible: false,
      collapsed: false
    },
    {
      id: "tr2",
      gameweek: "GW2",
      transfers: "12",
      cost: "0",
      hasCost: false,
      emptyText: "",
      moves: [
        { id: "w1", outName: "Rashford", outTeam: "MUN", outPointsText: "1 分", inName: "Saka", inTeam: "ARS", inPointsText: "3 分", priceText: "£8.9m → £10.1m" },
        { id: "w2", outName: "Sterling", outTeam: "CHE", outPointsText: "2 分", inName: "Palmer", inTeam: "CHE", inPointsText: "10 分", priceText: "£7.0m → £10.3m" },
        { id: "w3", outName: "James", outTeam: "CHE", outPointsText: "0 分", inName: "Gabriel", inTeam: "ARS", inPointsText: "6 分", priceText: "£5.2m → £6.1m" },
        { id: "w4", outName: "Maddison", outTeam: "TOT", outPointsText: "2 分", inName: "Rogers", inTeam: "AVL", inPointsText: "2 分", priceText: "£7.5m → £5.6m" },
        { id: "w5", outName: "Nketiah", outTeam: "CRY", outPointsText: "1 分", inName: "Watkins", inTeam: "AVL", inPointsText: "2 分", priceText: "£5.8m → £9.0m" },
        { id: "w6", outName: "Turner", outTeam: "NFO", outPointsText: "0 分", inName: "Flekken", inTeam: "BRE", inPointsText: "3 分", priceText: "£4.0m → £4.5m" },
        { id: "w7", outName: "Cash", outTeam: "AVL", outPointsText: "1 分", inName: "Ait-Nouri", inTeam: "WOL", inPointsText: "1 分", priceText: "£4.6m → £4.4m" },
        { id: "w8", outName: "Mount", outTeam: "MUN", outPointsText: "0 分", inName: "Salah", inTeam: "LIV", inPointsText: "8 分", priceText: "£6.2m → £12.7m" },
        { id: "w9", outName: "Werner", outTeam: "TOT", outPointsText: "1 分", inName: "Haaland", inTeam: "MCI", inPointsText: "9 分", priceText: "£6.5m → £15.2m" },
        { id: "w10", outName: "Colwill", outTeam: "CHE", outPointsText: "2 分", inName: "Dunk", inTeam: "BHA", inPointsText: "0 分", priceText: "£4.5m → £4.2m" },
        { id: "w11", outName: "Gordon", outTeam: "NEW", outPointsText: "3 分", inName: "Eze", inTeam: "ARS", inPointsText: "2 分", priceText: "£7.4m → £7.2m" },
        { id: "w12", outName: "Vardy", outTeam: "LEI", outPointsText: "2 分", inName: "Wood", inTeam: "NFO", inPointsText: "7 分", priceText: "£5.4m → £6.4m" }
      ],
      chip: "WC",
      transferCount: 12,
      collapsible: true,
      collapsed: true
    },
    {
      id: "tr1",
      gameweek: "GW1",
      transfers: "1",
      cost: "0",
      hasCost: false,
      emptyText: "",
      moves: [
        { id: "m3", outName: "Rashford", outTeam: "MUN", outPointsText: "1 分", inName: "Isak", inTeam: "NEW", inPointsText: "2 分", priceText: "£8.9m → £12.1m" }
      ],
      chip: "",
      transferCount: 1,
      collapsible: false,
      collapsed: false
    }
  ];

const mockHistoryRows = [
    { id: "h3", gameweek: "GW3", pointsText: "72", captainName: "Haaland", captainPointsText: "18", costText: "-4", costBad: true, rankText: "12.6k" },
    { id: "h2", gameweek: "GW2", pointsText: "85", captainName: "Salah", captainPointsText: "16", costText: "0", costBad: false, rankText: "10.0k" },
    { id: "h1", gameweek: "GW1", pointsText: "68", captainName: "Haaland", captainPointsText: "14", costText: "0", costBad: false, rankText: "15.0k" }
  ];

export const mockSeasonChartPoints = [
  { gameweek: 1, overallRank: 15000, overallPoints: 68, netPoints: 68, eventPoints: 68, transfers: 1, transferCost: 0, captainName: "Haaland", captainPoints: 14, benchPoints: 4, chip: "", isChip: false },
  { gameweek: 2, overallRank: 10000, overallPoints: 153, netPoints: 85, eventPoints: 85, transfers: 12, transferCost: 0, captainName: "Salah", captainPoints: 16, benchPoints: 12, chip: "WC", isChip: true },
  { gameweek: 3, overallRank: 12600, overallPoints: 221, netPoints: 68, eventPoints: 72, transfers: 2, transferCost: 4, captainName: "Haaland", captainPoints: 18, benchPoints: 6, chip: "", isChip: false }
];

export const myFplTeamMockData = {
  loading: false,
  error: "",
  transferError: "",
  tabLoading: false,
  tabError: "",
  emptyState: "" as const,
  emptyEyebrow: "",
  emptyTitle: "",
  emptyDescription: "",
  emptyActionText: "",
  entryId: 123456,
  event: 3,
  maxGw: 38,
  activeTab: "squad" as const,
  showSquad: true,
  showTransfer: false,
  showChips: false,
  showHistory: false,
  headerTitle: "WhoamI FC",
  headerSubtitle: "Tong · 中国",
  heroScore: "72",
  heroScoreSub: "净得分 62 · 队长 Haaland (18)",
  totalTransfersText: "总转会 12",
  overviewStats: [
    { label: "总分", value: "1,856" },
    { label: "总排名", value: "12.6k" },
    { label: "阵容身价", value: "£103.5m" },
    { label: "银行余额", value: "£2.3m" }
  ],
  eventStats: [
    { label: "开卡", value: "无" },
    { label: "本轮转会", value: "2" },
    { label: "板凳分", value: "4" }
  ],
  squadRows: [
    { id: "sq1", minutes: 90, cleanSheets: 1, saves: 3, bps: 32, name: "Raya", roleText: "", team: "ARS", position: "GKP", metaText: "90' · 零封", statusText: "vs WOL·主", points: "6", bench: false },
    { id: "sq2", minutes: 90, assists: 1, cleanSheets: 1, bonus: 2, bps: 41, name: "Alexander-Arnold", roleText: "", team: "LIV", position: "DEF", metaText: "90' · 助1 · 零封 · B2", statusText: "vs BOU·客", points: "12", bench: false },
    { id: "sq3", minutes: 90, cleanSheets: 1, bps: 28, name: "Saliba", roleText: "", team: "ARS", position: "DEF", metaText: "90' · 零封", statusText: "vs WOL·主", points: "6", bench: false },
    { id: "sq4", minutes: 90, cleanSheets: 1, bonus: 1, bps: 30, name: "Gabriel", roleText: "", team: "ARS", position: "DEF", metaText: "90' · 零封 · B1", statusText: "vs WOL·主", points: "6", bench: false },
    { id: "sq5", viceCaptain: true, minutes: 90, goalsScored: 1, bps: 26, name: "Salah", roleText: "VC", team: "LIV", position: "MID", metaText: "90' · 进1", statusText: "vs BOU·客", points: "8", bench: false },
    { id: "sq6", minutes: 72, assists: 1, bps: 24, name: "Saka", roleText: "", team: "ARS", position: "MID", metaText: "72' · 助1", statusText: "vs WOL·主", points: "3", bench: false },
    { id: "sq7", minutes: 90, goalsScored: 1, bonus: 1, bps: 35, name: "Palmer", roleText: "", team: "CHE", position: "MID", metaText: "90' · 进1 · B1", statusText: "vs MCI·主", points: "10", bench: false },
    { id: "sq8", minutes: 65, name: "Rogers", roleText: "", team: "AVL", position: "MID", metaText: "65'", statusText: "vs WHU·客", points: "2", bench: false },
    { id: "sq9", captain: true, multiplier: 2, minutes: 90, goalsScored: 1, bonus: 1, bps: 33, name: "Haaland", roleText: "C", team: "MCI", position: "FWD", metaText: "90' · 进1 · B1", statusText: "vs CHE·客", points: "9", bench: false },
    { id: "sq10", minutes: 80, name: "Watkins", roleText: "", team: "AVL", position: "FWD", metaText: "80'", statusText: "vs WHU·客", points: "2", bench: false },
    { id: "sq11", minutes: 0, name: "Isak", roleText: "", team: "NEW", position: "FWD", metaText: "0'", statusText: "vs SOU·主", points: "0", bench: false },
    { id: "sq12", minutes: 90, cleanSheets: 1, saves: 4, bps: 27, name: "Flekken", roleText: "", team: "BRE", position: "GKP", metaText: "90' · 零封", statusText: "vs CRY·主", points: "3", multiplier: 0, bench: true },
    { id: "sq13", minutes: 45, name: "Ait-Nouri", roleText: "", team: "WOL", position: "DEF", metaText: "45'", statusText: "vs ARS·客", points: "1", multiplier: 0, bench: true },
    { id: "sq14", minutes: 0, name: "Dunk", roleText: "", team: "BHA", position: "DEF", metaText: "0'", statusText: "vs EVE·客", points: "0", multiplier: 0, bench: true }
  ],
  transferRows: mockTransferRows,
  visibleTransferRows: mockTransferRows.filter((row) => row.transferCount > 0),
  transferFilter: "with" as const,
  transferSummary: [
    { label: "总转会", value: "15" },
    { label: "转会扣分", value: "-4", tone: "bad" as const },
    { label: "有转会轮数", value: "3" }
  ],
  transferFilterNote: "有转会 3 轮 · 共 4 轮",
  transferPageSize: 8,
  transferHasMore: false,
  chipInventoryRows: [
    { id: "chip-inv-WC", code: "WC", name: "Wildcard", firstText: "1 / 0", secondText: "0 / 1", firstOut: true, secondOut: false },
    { id: "chip-inv-FH", code: "FH", name: "Free Hit", firstText: "0 / 1", secondText: "0 / 1", firstOut: false, secondOut: false },
    { id: "chip-inv-BB", code: "BB", name: "Bench Boost", firstText: "0 / 1", secondText: "0 / 1", firstOut: false, secondOut: false },
    { id: "chip-inv-TC", code: "TC", name: "Triple Captain", firstText: "0 / 1", secondText: "0 / 1", firstOut: false, secondOut: false }
  ],
  chipLogRows: [
    { id: "chip-2", gameweek: "GW2", halfText: "上半", chip: "WC", pointsText: "85", netText: "85", rankText: "98.2k" }
  ],
  historyRows: mockHistoryRows,
  pagedHistoryRows: mockHistoryRows,
  historyPageSize: 12,
  historyHasMore: false,
  seasonHistoryRows: [
    { id: "sh1", season: "2025/26", totalPoints: "1,856", overallRank: "12.6k", pointsValue: 1856, rankValue: 12600, current: true },
    { id: "sh2", season: "2024/25", totalPoints: "1,980", overallRank: "25.0k", pointsValue: 1980, rankValue: 25000, current: false },
    { id: "sh3", season: "2023/24", totalPoints: "2,140", overallRank: "8.4k", pointsValue: 2140, rankValue: 8400, current: false }
  ],
  hasSquad: true,
  hasBench: true,
  hasTransfers: true,
  hasChips: true,
  hasHistory: true,
  hasTeamData: true,
  supportAvailable: true,
  phaseBanner: "" as const
};
