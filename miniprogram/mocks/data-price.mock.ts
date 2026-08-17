export const dataPriceMockData = {
  activeMode: "daily" as const,
  loading: false,
  refreshing: false,
  playerLoading: false,
  loadingMore: false,
  historyLoading: false,
  error: "",
  staleMessage: "",
  playersError: "",
  historyError: "",
  changeDate: "2026-08-14",
  players: [
    { element: 301, name: "Haaland", teamId: 13, team: "MCI", teamName: "Man City", position: "FWD", price: 14.1, priceText: "14.1" },
    { element: 302, name: "Salah", teamId: 12, team: "LIV", teamName: "Liverpool", position: "MID", price: 13.1, priceText: "13.1" },
    { element: 303, name: "Palmer", teamId: 4, team: "CHE", teamName: "Chelsea", position: "MID", price: 10.6, priceText: "10.6" },
    { element: 304, name: "Saka", teamId: 1, team: "ARS", teamName: "Arsenal", position: "MID", price: 10.1, priceText: "10.1" }
  ],
  filteredPlayers: [],
  filteredPlayerCount: 0,
  playersLoaded: true,
  playerListReady: false,
  playerListVisible: false,
  selectedPlayer: null,
  playerKeyword: "",
  teamFilter: "ALL",
  positionFilter: "ALL",
  teamOptions: [
    { label: "全部球队", value: "ALL" },
    { label: "Arsenal", value: "1" },
    { label: "Chelsea", value: "4" },
    { label: "Liverpool", value: "12" },
    { label: "Man City", value: "13" }
  ],
  teamOptionNames: ["全部球队", "Arsenal", "Chelsea", "Liverpool", "Man City"],
  selectedTeamIndex: 0,
  positionOptions: [
    { label: "全部位置", value: "ALL" },
    { label: "GKP", value: "GOALKEEPER" },
    { label: "DEF", value: "DEFENDER" },
    { label: "MID", value: "MIDFIELDER" },
    { label: "FWD", value: "FORWARD" }
  ],
  positionOptionNames: ["全部位置", "GKP", "DEF", "MID", "FWD"],
  selectedPositionIndex: 0,
  nextCursor: null,
  hasMorePlayers: false,
  riseChanges: [
    { element: 301, name: "Haaland", playerName: "Haaland", team: "MCI", teamShortName: "MCI", position: "FWD", oldValue: 14.0, newValue: 14.1, changeDate: "2026-08-14", oldPriceText: "14.0", newPriceText: "14.1", changeText: "+0.1", movementText: "↑", movementClass: "rise" },
    { element: 302, name: "Salah", playerName: "Salah", team: "LIV", teamShortName: "LIV", position: "MID", oldValue: 13.0, newValue: 13.1, changeDate: "2026-08-14", oldPriceText: "13.0", newPriceText: "13.1", changeText: "+0.1", movementText: "↑", movementClass: "rise" },
    { element: 303, name: "Palmer", playerName: "Palmer", team: "CHE", teamShortName: "CHE", position: "MID", oldValue: 10.5, newValue: 10.6, changeDate: "2026-08-14", oldPriceText: "10.5", newPriceText: "10.6", changeText: "+0.1", movementText: "↑", movementClass: "rise" },
    { element: 304, name: "Saka", playerName: "Saka", team: "ARS", teamShortName: "ARS", position: "MID", oldValue: 10.0, newValue: 10.1, changeDate: "2026-08-14", oldPriceText: "10.0", newPriceText: "10.1", changeText: "+0.1", movementText: "↑", movementClass: "rise" }
  ],
  fallChanges: [
    { element: 401, name: "Rashford", playerName: "Rashford", team: "MUN", teamShortName: "MUN", position: "MID", oldValue: 8.5, newValue: 8.4, changeDate: "2026-08-14", oldPriceText: "8.5", newPriceText: "8.4", changeText: "-0.1", movementText: "↓", movementClass: "fall" },
    { element: 402, name: "Nkunku", playerName: "Nkunku", team: "CHE", teamShortName: "CHE", position: "MID", oldValue: 7.5, newValue: 7.4, changeDate: "2026-08-14", oldPriceText: "7.5", newPriceText: "7.4", changeText: "-0.1", movementText: "↓", movementClass: "fall" }
  ],
  historyRows: [
    { element: 301, name: "Haaland", playerName: "Haaland", team: "MCI", teamShortName: "MCI", position: "FWD", value: 14.1, changeDate: "2026-08-14", priceText: "14.1", movementText: "↑", movementClass: "rise", changeText: "+0.1" },
    { element: 301, name: "Haaland", playerName: "Haaland", team: "MCI", teamShortName: "MCI", position: "FWD", value: 14.0, changeDate: "2026-08-12", priceText: "14.0", movementText: "—", movementClass: "stable", changeText: "0.0" },
    { element: 301, name: "Haaland", playerName: "Haaland", team: "MCI", teamShortName: "MCI", position: "FWD", value: 14.0, changeDate: "2026-08-10", priceText: "14.0", movementText: "↑", movementClass: "rise", changeText: "+0.1" }
  ],

  /* 市场全景 — mirrors buildPulseView output (price.ts). */
  pulseLoaded: true,
  pulseError: "",
  coverageText: "快照 2026-08-14 · 观察 14/14 天",
  pulseStale: false,
  glanceTiles: [
    { key: "rise", label: "上涨", valueText: "4", subText: "2026-08-14", tone: "good" as const },
    { key: "fall", label: "下跌", valueText: "2", subText: "2026-08-14", tone: "bad" as const },
    { key: "hot", label: "持有最热", valueText: "Palmer", subText: "+2.4% → 55.9%", tone: "good" as const },
    { key: "cold", label: "持有最冷", valueText: "Rashford", subText: "-1.8% → 12.3%", tone: "bad" as const }
  ],
  mostSelectedRows: [
    { id: 302, name: "Salah", meta: "LIV · MID", valueText: "55.2%", subText: "£13.1m", tone: "" as const, barStyle: "width: 55.2%" },
    { id: 301, name: "Haaland", meta: "MCI · FWD", valueText: "52.6%", subText: "£14.1m", tone: "" as const, barStyle: "width: 52.6%" },
    { id: 303, name: "Palmer", meta: "CHE · MID", valueText: "48.8%", subText: "£10.6m", tone: "" as const, barStyle: "width: 48.8%" },
    { id: 304, name: "Saka", meta: "ARS · MID", valueText: "45.1%", subText: "£10.1m", tone: "" as const, barStyle: "width: 45.1%" }
  ],
  ownershipRiserRows: [
    { id: 303, name: "Palmer", meta: "CHE · MID", valueText: "+2.4%", subText: "53.5% → 55.9%", tone: "good" as const, barStyle: "width: 100%" },
    { id: 304, name: "Saka", meta: "ARS · MID", valueText: "+1.6%", subText: "43.5% → 45.1%", tone: "good" as const, barStyle: "width: 66.7%" },
    { id: 305, name: "Isak", meta: "NEW · FWD", valueText: "+0.9%", subText: "21.0% → 21.9%", tone: "good" as const, barStyle: "width: 37.5%" }
  ],
  ownershipFallerRows: [
    { id: 401, name: "Rashford", meta: "MUN · MID", valueText: "-1.8%", subText: "14.1% → 12.3%", tone: "bad" as const, barStyle: "width: 100%" },
    { id: 402, name: "Nkunku", meta: "CHE · MID", valueText: "-0.7%", subText: "8.9% → 8.2%", tone: "bad" as const, barStyle: "width: 38.9%" }
  ],
  transferRows: [
    { id: 303, name: "Palmer", meta: "CHE · MID", valueText: "+215.6k", subText: "转入 890.1k · 转出 674.5k", tone: "good" as const, barStyle: "" },
    { id: 305, name: "Isak", meta: "NEW · FWD", valueText: "+162.3k", subText: "转入 650.2k · 转出 487.9k", tone: "good" as const, barStyle: "" },
    { id: 401, name: "Rashford", meta: "MUN · MID", valueText: "-188.4k", subText: "转入 320.6k · 转出 509.0k", tone: "bad" as const, barStyle: "" }
  ],
  availabilityRows: [
    { id: 501, name: "Saka", meta: "ARS · MID", valueText: "存疑", subText: "Knock — 75% chance of playing · 本轮出场 75%", tone: "" as const, barStyle: "" },
    { id: 502, name: "Jesus", meta: "ARS · FWD", valueText: "受伤", subText: "Hamstring injury, expected back mid September", tone: "" as const, barStyle: "" }
  ],
  availabilityRowsAll: [
    { id: 501, name: "Saka", meta: "ARS · MID", valueText: "存疑", subText: "Knock — 75% chance of playing · 本轮出场 75%", tone: "" as const, barStyle: "" },
    { id: 502, name: "Jesus", meta: "ARS · FWD", valueText: "受伤", subText: "Hamstring injury, expected back mid September", tone: "" as const, barStyle: "" },
    { id: 503, name: "Chilwell", meta: "CHE · DEF", valueText: "受伤", subText: "Knee injury, expected back late August", tone: "" as const, barStyle: "" }
  ],
  availabilityUpdateCount: 3,
  availabilityExpanded: false,
  availabilityLoading: false,
  newPlayerRows: [
    { id: 601, name: "Geovany Quenda", meta: "SPO · MID", valueText: "£5.5m", subText: "首次观察 2026-08-12", tone: "" as const, barStyle: "" },
    { id: 602, name: "Estevao", meta: "CHE · MID", valueText: "£6.0m", subText: "首次观察 2026-08-10", tone: "" as const, barStyle: "" }
  ]
};
