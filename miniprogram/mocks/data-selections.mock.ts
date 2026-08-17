export const dataSelectionsMockData = {
  loadingTournaments: false,
  loadingStats: false,
  error: "",
  emptyState: "" as const,
  emptyEyebrow: "",
  emptyTitle: "",
  emptyDescription: "",
  emptyActionText: "",
  statsEmptyTitle: "本轮还没有选择率数据",
  statsEmptyDescription: "GW 数据同步后会显示赛事内的阵容趋势",
  entryId: 123456,
  event: 3,
  maxGw: 38,
  tournaments: [
    { id: 1, name: "Overall", participantCount: 10000000 },
    { id: 2, name: "Friends League", participantCount: 20 }
  ],
  tournamentNames: ["Overall", "Friends League"],
  selectedTournamentIndex: 0,
  selectedTournamentName: "Overall",
  headerSubtitle: "Overall · GW3",
  totalEntriesText: "10000000 队",
  activeTab: "selected" as const,
  activeTabLabel: "选择率",
  tabs: [
    { key: "selected" as const, label: "选择率" },
    { key: "captain" as const, label: "队长" },
    { key: "transfersIn" as const, label: "转入" },
    { key: "transfersOut" as const, label: "转出" }
  ],
  selectedRows: [
    { id: "s1", rank: 1, name: "Haaland", meta: "MCI · FWD · EO 71.3%", primaryValue: "62.5%", barStyle: "width: 62.5%" },
    { id: "s2", rank: 2, name: "Salah", meta: "LIV · MID · EO 60.4%", primaryValue: "55.2%", barStyle: "width: 55.2%" },
    { id: "s3", rank: 3, name: "Palmer", meta: "CHE · MID · EO 55.9%", primaryValue: "48.8%", barStyle: "width: 48.8%" },
    { id: "s4", rank: 4, name: "Saka", meta: "ARS · MID · EO 40.2%", primaryValue: "45.1%", barStyle: "width: 45.1%" },
    { id: "s5", rank: 5, name: "Watkins", meta: "AVL · FWD · EO 35.0%", primaryValue: "38.6%", barStyle: "width: 38.6%" }
  ],
  captainRows: [
    { id: "c1", rank: 1, name: "Haaland", meta: "MCI · FWD · EO 118.4%", primaryValue: "62.5%", barStyle: "width: 62.5%" },
    { id: "c2", rank: 2, name: "Salah", meta: "LIV · MID · EO 72.9%", primaryValue: "55.2%", barStyle: "width: 55.2%" },
    { id: "c3", rank: 3, name: "Palmer", meta: "CHE · MID · EO 58.1%", primaryValue: "48.8%", barStyle: "width: 48.8%" }
  ],
  transferInRows: [
    { id: "ti1", rank: 1, name: "Palmer", meta: "CHE · MID · 890.1k 次", primaryValue: "48.8%", barStyle: "width: 100%" },
    { id: "ti2", rank: 2, name: "Isak", meta: "NEW · FWD · 650.2k 次", primaryValue: "21.4%", barStyle: "width: 73%" },
    { id: "ti3", rank: 3, name: "Rogers", meta: "AVL · MID · 420.1k 次", primaryValue: "8.9%", barStyle: "width: 47%" }
  ],
  transferOutRows: [
    { id: "to1", rank: 1, name: "Rashford", meta: "MUN · MID · 780.3k 次", primaryValue: "12.3%", barStyle: "width: 100%" },
    { id: "to2", rank: 2, name: "Nkunku", meta: "CHE · MID · 520.1k 次", primaryValue: "9.8%", barStyle: "width: 67%" }
  ],
  visibleRows: [
    { id: "s1", rank: 1, name: "Haaland", meta: "MCI · FWD · EO 71.3%", primaryValue: "62.5%", barStyle: "width: 62.5%" },
    { id: "s2", rank: 2, name: "Salah", meta: "LIV · MID · EO 60.4%", primaryValue: "55.2%", barStyle: "width: 55.2%" },
    { id: "s3", rank: 3, name: "Palmer", meta: "CHE · MID · EO 55.9%", primaryValue: "48.8%", barStyle: "width: 48.8%" },
    { id: "s4", rank: 4, name: "Saka", meta: "ARS · MID · EO 40.2%", primaryValue: "45.1%", barStyle: "width: 45.1%" },
    { id: "s5", rank: 5, name: "Watkins", meta: "AVL · FWD · EO 35.0%", primaryValue: "38.6%", barStyle: "width: 38.6%" }
  ]
};
