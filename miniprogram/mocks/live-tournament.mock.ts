const mockPicks = [
  { element: 309, webName: "Haaland", teamShortName: "MCI", team: "MCI", elementTypeName: "FWD", position: "FWD", captain: true, viceCaptain: false, pickActive: true },
  { element: 305, webName: "Salah", teamShortName: "LIV", team: "LIV", elementTypeName: "MID", position: "MID", captain: false, viceCaptain: true, pickActive: true },
  { element: 307, webName: "Palmer", teamShortName: "CHE", team: "CHE", elementTypeName: "MID", position: "MID", captain: false, viceCaptain: false, pickActive: true },
  { element: 306, webName: "Saka", teamShortName: "ARS", team: "ARS", elementTypeName: "MID", position: "MID", captain: false, viceCaptain: false, pickActive: true }
];

const seedRows = [
  { entry: 100001, entryName: "Dream Team FC", playerName: "John D", livePoints: 85, liveNetPoints: 85, liveTotalPoints: 2100, transferCost: 0, captainName: "Haaland", chip: "TRIPLE_CAPTAIN", played: 11, toPlay: 0, overallRank: 120, picks: mockPicks },
  { entry: 100002, entryName: "Goal Machine", playerName: "Jane S", livePoints: 78, liveNetPoints: 68, liveTotalPoints: 2050, transferCost: 10, captainName: "Salah", chip: "BENCH_BOOST", played: 11, toPlay: 0, overallRank: 860, picks: mockPicks },
  { entry: 123456, entryName: "WhoamI FC", playerName: "Tong W", livePoints: 72, liveNetPoints: 62, liveTotalPoints: 1856, transferCost: 10, captainName: "Haaland", chip: "WILDCARD", played: 9, toPlay: 2, overallRank: 12580, picks: mockPicks },
  { entry: 100003, entryName: "FPL Kings", playerName: "Mike R", livePoints: 65, liveNetPoints: 65, liveTotalPoints: 1900, transferCost: 0, captainName: "Palmer", chip: "", played: 11, toPlay: 0, overallRank: 5000, picks: mockPicks },
  { entry: 100004, entryName: "Top Bins", playerName: "Alex T", livePoints: 60, liveNetPoints: 60, liveTotalPoints: 1800, transferCost: 0, captainName: "Saka", chip: "FREE_HIT", played: 10, toPlay: 1, overallRank: 8000, picks: mockPicks }
];

const teamPrefixes = [
  "Night Shift", "Greenwood", "Set Piece", "False Nine", "Box to Box",
  "High Line", "Second Ball", "Cut Inside", "Low Block", "Press Trap",
  "Switch Play", "Far Post", "Underlap", "Rest Defence", "Wide Overlap",
  "Half Space", "Third Man", "Late Runner", "Channel Run", "Box Crash"
];
const managerNames = [
  "Chris P", "Sam L", "Riley K", "Jamie H", "Pat C",
  "Dana M", "Owen F", "Leah B", "Noah G", "Ava R",
  "Eli T", "Mia S", "Jack W", "Nina V", "Ben Q",
  "Cara D", "Hugo Z", "Ivy N", "Leo Y", "Uma J"
];
const captains = ["Haaland", "Salah", "Palmer", "Saka", "Semenyo"];
const chips = ["", "", "", "TRIPLE_CAPTAIN", "BENCH_BOOST", "WILDCARD", "FREE_HIT"];

function extraRow(index: number) {
  const prefix = teamPrefixes[index % teamPrefixes.length];
  const batch = Math.floor(index / teamPrefixes.length) + 1;
  const hit = index % 11 === 0 ? 4 : index % 17 === 0 ? 8 : 0;
  const livePoints = Math.max(8, 58 - Math.floor(index * 0.45));
  return {
    entry: 100100 + index,
    entryName: batch === 1 ? `${prefix} FC` : `${prefix} ${batch}`,
    playerName: managerNames[index % managerNames.length],
    livePoints,
    liveNetPoints: livePoints - hit,
    liveTotalPoints: 1780 - index * 7,
    transferCost: hit,
    captainName: captains[index % captains.length],
    chip: chips[index % chips.length],
    played: 8 + (index % 4),
    toPlay: 3 - (index % 4),
    overallRank: 9000 + index * 37,
    picks: mockPicks
  };
}

function toMockRow(
  row: {
    entry: number;
    entryName: string;
    playerName: string;
    livePoints: number;
    liveNetPoints: number;
    liveTotalPoints: number;
    transferCost: number;
    captainName: string;
    chip?: string;
    played: number;
    toPlay: number;
  },
  index: number
) {
  const hit = row.transferCost > 0 ? ` · -${row.transferCost}` : "";
  return {
    ...row,
    totalPoints: row.liveTotalPoints,
    chip: row.chip || "",
    rank: index + 1,
    searchText: `${row.entryName} ${row.playerName}`.toLowerCase(),
    visibleRank: index + 1,
    displayLive: String(row.livePoints),
    displayNet: String(row.liveNetPoints),
    displayTotal: String(row.liveTotalPoints),
    metaText: `C: ${row.captainName}${hit}`
  };
}

const extraCount = 100 - seedRows.length;
const mockRows = [
  ...seedRows,
  ...Array.from({ length: extraCount }, (_, index) => extraRow(index))
].map(toMockRow);

export const liveTournamentMockData = {
  loading: false,
  refreshing: false,
  hasData: true,
  displayState: "fresh" as const,
  retainedRowCount: 0,
  error: "",
  errorSuffix: "",
  tournamentListError: "",
  tournamentListErrorSuffix: "",
  emptyState: "" as const,
  emptyEyebrow: "",
  emptyTitle: "",
  emptyDescription: "",
  emptyActionText: "",
  resultsEmptyTitle: "",
  resultsEmptyDescription: "",
  resultsEmptyActionText: "",
  resultsFiltered: false,
  event: 3,
  maxGw: 38,
  entryId: 123456,
  keyword: "",
  tournaments: [
    { id: 1, name: "Overall", participantCount: 10000000 },
    { id: 2, name: "FPL Cup", participantCount: 500000 },
    { id: 3, name: "Friends League", participantCount: 20 }
  ],
  tournamentNames: ["Overall", "FPL Cup", "Friends League"],
  selectedTournamentIndex: 0,
  selectedTournament: { id: 1, name: "Overall", participantCount: 10000000 },
  rows: mockRows,
  displayedRows: mockRows.slice(0, 20),
  sortOptions: [
    { key: "livePoints" as const, label: "GW" },
    { key: "liveNetPoints" as const, label: "净分" },
    { key: "transferCost" as const, label: "扣分" },
    { key: "played" as const, label: "出场" },
    { key: "totalPoints" as const, label: "总分" }
  ],
  sortKey: "livePoints" as const,
  sortDesc: true,
  filteredCount: mockRows.length,
  ownershipExpanded: false,
  ownershipScope: "any" as const,
  ownershipCaptainMode: "any" as const,
  ownershipPlayers: [],
  ownershipTeamOptions: [],
  ownershipTeamNames: [],
  selectedOwnershipTeamIndex: 0,
  selectedOwnershipTeam: null,
  ownershipPositionOptions: ["GKP", "DEF", "MID", "FWD"],
  selectedOwnershipPositionIndex: 0,
  selectedOwnershipPosition: "",
  ownershipAvailablePlayers: [],
  ownershipAvailablePlayerNames: [],
  selectedOwnershipPlayers: [],
  ownershipPlayerNames: [],
  ownershipSummary: "未筛选",
  teamExposureExpanded: false,
  teamExposureScope: "any" as const,
  teamExposureTeams: [],
  teamExposureTeamNames: [],
  selectedTeamExposureIndex: 0,
  selectedTeamExposure: null,
  teamExposureCount: 1,
  teamExposureSummary: "未筛选",
  pageSize: 20,
  hasMore: mockRows.length > 20,
  lastUpdated: "21:45",
  columns: [
    { key: "rank", label: "排名" },
    { key: "entryName", label: "球队" },
    { key: "livePoints", label: "实时分" },
    { key: "liveNetPoints", label: "净分" },
    { key: "totalPoints", label: "总分" }
  ]
};
