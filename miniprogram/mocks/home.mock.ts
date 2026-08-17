export const homeMockData = {
  loading: false,
  fixtureLoading: false,
  fixtureError: "",
  fixtureStaleMessage: "",
  fixtureStoredAt: null,
  fixtureStaleStoredAt: null,
  error: "",
  entryError: "",
  priceError: "",
  gameweekStatsError: "",
  supplementLoading: false,
  noticeText: "",
  noticeClosed: false,
  entry: {
    entry: 123456,
    entryId: 123456,
    playerName: "Tong W",
    entryName: "WhoamI FC",
    teamName: "WhoamI FC",
    region: "CN",
    overallRank: 12580,
    totalPoints: 1856,
    totalTransfers: 8,
    bank: 2.3,
    teamValue: 103.5
  },
  leagues: [
    { id: 1, name: "Overall", rank: 12580 },
    { id: 2, name: "Friends League", rank: 3 },
    { id: 3, name: "Office League", rank: 1 }
  ],
  fixtureDays: [
    {
      dateKey: "d1",
      tabLabel: "16/08 六",
      rows: [
        { id: "1", homeName: "Arsenal", awayName: "Chelsea", centerLabel: "22:00", finished: false },
        { id: "5", homeName: "Brighton", awayName: "West Ham", centerLabel: "22:00", finished: false },
        { id: "6", homeName: "Fulham", awayName: "Brentford", centerLabel: "22:00", finished: false },
        { id: "2", homeName: "Liverpool", awayName: "Man City", centerLabel: "00:30", finished: false }
      ]
    },
    {
      dateKey: "d2",
      tabLabel: "17/08 日",
      rows: [
        { id: "3", homeName: "Man Utd", awayName: "Tottenham", centerLabel: "21:00", finished: false },
        { id: "4", homeName: "Newcastle", awayName: "Aston Villa", centerLabel: "23:30", finished: false }
      ]
    }
  ],
  selectedFixtureDayKey: "d1",
  selectedDayRows: [
    { id: "1", homeName: "Arsenal", awayName: "Chelsea", centerLabel: "22:00", finished: false },
    { id: "5", homeName: "Brighton", awayName: "West Ham", centerLabel: "22:00", finished: false },
    { id: "6", homeName: "Fulham", awayName: "Brentford", centerLabel: "22:00", finished: false },
    { id: "2", homeName: "Liverpool", awayName: "Man City", centerLabel: "00:30", finished: false }
  ],
  fixtureCount: 6,
  gameweekStats: [
    { key: "average_score", label: "平均分", value: "62" },
    { key: "highest_score", label: "最高分", value: "127" },
    { key: "transfers_made", label: "总转会", value: "2,456,789" },
    { key: "most_captained", label: "最多队长", value: "Haaland" },
    { key: "most_transferred_in", label: "最多转入", value: "Palmer" }
  ],
  marketMode: "ownership",
  marketCoverage: "最近 14 天最值得关注的信号",
  marketLeadTitle: "持有率变化最大",
  marketLeadRows: [],
  marketRisers: [
    { id: "301", name: "Palmer", team: "CHE", position: "MID", meta: "28.4% → 34.1%", changeText: "+5.7%", rising: true },
    { id: "302", name: "Saka", team: "ARS", position: "MID", meta: "41.0% → 44.2%", changeText: "+3.2%", rising: true },
    { id: "303", name: "Haaland", team: "MCI", position: "FWD", meta: "62.1% → 64.0%", changeText: "+1.9%", rising: true }
  ],
  marketFallers: [
    { id: "401", name: "Rashford", team: "MUN", position: "MID", meta: "18.6% → 12.1%", changeText: "-6.5%", rising: false },
    { id: "402", name: "Nkunku", team: "CHE", position: "MID", meta: "9.4% → 6.8%", changeText: "-2.6%", rising: false }
  ],
  availabilityRows: [
    { id: "501", name: "Salah", team: "LIV", owned: "51.2%", status: "出场存疑", statusKey: "doubtful", body: "Hamstring issue, will be assessed closer to kick-off." },
    { id: "502", name: "Isak", team: "NEW", owned: "22.0%", status: "伤病", statusKey: "injured", body: "Groin injury. Expected back in two weeks." }
  ],
  gw: 3,
  currentGw: 3,
  nextGw: 4,
  selectedFixtureGw: 3,
  minFixtureGw: 1,
  deadline: "周六 18:30",
  utcDeadline: "2026-08-16T17:30:00Z",
  countdown: { days: "2", hours: "05", minutes: "30", seconds: "12" }
};
