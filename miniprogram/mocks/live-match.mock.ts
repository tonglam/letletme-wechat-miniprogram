type MockPlayer = {
  webName: string;
  teamShortName: string;
  elementType?: number;
  goalsScored?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  bonus?: number;
  bps?: number;
  defensiveContribution?: number;
  saves?: number;
  minutes?: number;
  cleanSheets?: number;
  penaltiesSaved?: number;
  penaltiesMissed?: number;
  ownGoals?: number;
};

export type MockLiveMatch = {
  id: number;
  matchId: number;
  status: "playing" | "not_start" | "finished";
  playStatus: "playing" | "not_start" | "finished";
  minutes: number;
  homeTeamName: string;
  homeTeamShortName: string;
  awayTeamName: string;
  awayTeamShortName: string;
  homeScore: number;
  awayScore: number;
  kickoffTime: string;
  homeTeamDataList: MockPlayer[];
  awayTeamDataList: MockPlayer[];
};

function players(list: MockPlayer[]): MockPlayer[] {
  return list.map((player) => ({
    name: player.webName,
    ...player
  }));
}

function fixture(
  id: number,
  status: MockLiveMatch["status"],
  minutes: number,
  kickoffTime: string,
  home: [string, string],
  away: [string, string],
  score: [number, number],
  homePlayers: MockPlayer[] = [],
  awayPlayers: MockPlayer[] = []
): MockLiveMatch {
  return {
    id,
    matchId: id,
    status,
    playStatus: status,
    minutes,
    homeTeamName: home[0],
    homeTeamShortName: home[1],
    awayTeamName: away[0],
    awayTeamShortName: away[1],
    homeScore: score[0],
    awayScore: score[1],
    kickoffTime,
    homeTeamDataList: players(homePlayers),
    awayTeamDataList: players(awayPlayers)
  };
}

/** A full 10-match GW: 3 live, 4 finished, 3 not started. Players stay on their own side. */
export const liveMatchFixtures: MockLiveMatch[] = [
  fixture(1, "playing", 67, "2026-08-16T14:00:00Z", ["Arsenal", "ARS"], ["Chelsea", "CHE"], [2, 1], [
    { webName: "Saka", teamShortName: "ARS", elementType: 3, goalsScored: 1, assists: 1, bonus: 3, bps: 48 },
    { webName: "Havertz", teamShortName: "ARS", elementType: 4, goalsScored: 1, bonus: 1, bps: 32 },
    { webName: "Gabriel", teamShortName: "ARS", elementType: 2, yellowCards: 1, defensiveContribution: 14, bps: 27 },
    { webName: "Rice", teamShortName: "ARS", elementType: 3, defensiveContribution: 16, bps: 29 },
    { webName: "Raya", teamShortName: "ARS", elementType: 1, saves: 4, bps: 24 }
  ], [
    { webName: "Palmer", teamShortName: "CHE", elementType: 3, goalsScored: 1, bonus: 2, bps: 41, penaltiesMissed: 1 },
    { webName: "Cucurella", teamShortName: "CHE", elementType: 2, yellowCards: 1, defensiveContribution: 12, bps: 22 },
    { webName: "Sanchez", teamShortName: "CHE", elementType: 1, saves: 5, penaltiesSaved: 1, bps: 26 }
  ]),
  fixture(2, "playing", 52, "2026-08-16T14:00:00Z", ["Liverpool", "LIV"], ["Man City", "MCI"], [1, 1], [
    { webName: "Salah", teamShortName: "LIV", elementType: 3, goalsScored: 1, bonus: 3, bps: 52 },
    { webName: "Van Dijk", teamShortName: "LIV", elementType: 2, defensiveContribution: 15, bps: 31 },
    { webName: "Gravenberch", teamShortName: "LIV", elementType: 3, defensiveContribution: 13, yellowCards: 1, bps: 25 },
    { webName: "Alisson", teamShortName: "LIV", elementType: 1, saves: 3, bps: 21 }
  ], [
    { webName: "Haaland", teamShortName: "MCI", elementType: 4, goalsScored: 1, bonus: 2, bps: 38 },
    { webName: "Rodri", teamShortName: "MCI", elementType: 3, defensiveContribution: 14, yellowCards: 1, bps: 28 },
    { webName: "Dias", teamShortName: "MCI", elementType: 2, defensiveContribution: 11, bps: 23 }
  ]),
  fixture(3, "playing", 34, "2026-08-16T16:30:00Z", ["Tottenham", "TOT"], ["Newcastle", "NEW"], [0, 0], [
    { webName: "Romero", teamShortName: "TOT", elementType: 2, yellowCards: 1, defensiveContribution: 10, bps: 18 },
    { webName: "Vicario", teamShortName: "TOT", elementType: 1, saves: 2, bps: 16 }
  ], [
    { webName: "Bruno G.", teamShortName: "NEW", elementType: 3, defensiveContribution: 12, bps: 20 },
    { webName: "Pope", teamShortName: "NEW", elementType: 1, saves: 3, bps: 19 }
  ]),
  fixture(4, "finished", 90, "2026-08-16T11:30:00Z", ["Brighton", "BHA"], ["Wolves", "WOL"], [2, 0], [
    { webName: "Mitoma", teamShortName: "BHA", elementType: 3, goalsScored: 1, bonus: 3, bps: 46, minutes: 90, cleanSheets: 1 },
    { webName: "Joao Pedro", teamShortName: "BHA", elementType: 4, goalsScored: 1, bonus: 2, bps: 34, minutes: 90 },
    { webName: "Dunk", teamShortName: "BHA", elementType: 2, defensiveContribution: 13, bonus: 1, bps: 30, minutes: 90, cleanSheets: 1 },
    { webName: "Verbruggen", teamShortName: "BHA", elementType: 1, saves: 4, bps: 24, minutes: 90, cleanSheets: 1 }
  ], [
    { webName: "Ait-Nouri", teamShortName: "WOL", elementType: 2, yellowCards: 1, ownGoals: 1, bps: 12 },
    { webName: "Sa", teamShortName: "WOL", elementType: 1, saves: 6, bps: 22, minutes: 90 }
  ]),
  fixture(5, "finished", 90, "2026-08-16T14:00:00Z", ["Brentford", "BRE"], ["Crystal Palace", "CRY"], [1, 1], [
    { webName: "Mbeumo", teamShortName: "BRE", elementType: 3, goalsScored: 1, bonus: 3, bps: 40 },
    { webName: "Norgaard", teamShortName: "BRE", elementType: 3, defensiveContribution: 15, yellowCards: 1, bps: 26 }
  ], [
    { webName: "Mateta", teamShortName: "CRY", elementType: 4, goalsScored: 1, bonus: 2, bps: 35 },
    { webName: "Guehi", teamShortName: "CRY", elementType: 2, defensiveContribution: 12, bonus: 1, bps: 29 },
    { webName: "Munoz", teamShortName: "CRY", elementType: 2, yellowCards: 1, redCards: 1, bps: 8 }
  ]),
  fixture(6, "finished", 90, "2026-08-16T14:00:00Z", ["Everton", "EVE"], ["Aston Villa", "AVL"], [0, 2], [
    { webName: "Tarkowski", teamShortName: "EVE", elementType: 2, yellowCards: 1, defensiveContribution: 11, bps: 17 },
    { webName: "Pickford", teamShortName: "EVE", elementType: 1, saves: 5, bps: 23 }
  ], [
    { webName: "Watkins", teamShortName: "AVL", elementType: 4, goalsScored: 1, assists: 1, bonus: 3, bps: 44 },
    { webName: "Rogers", teamShortName: "AVL", elementType: 3, goalsScored: 1, bonus: 2, bps: 36 },
    { webName: "Konsa", teamShortName: "AVL", elementType: 2, defensiveContribution: 12, bonus: 1, bps: 28 }
  ]),
  fixture(7, "finished", 90, "2026-08-16T14:00:00Z", ["West Ham", "WHU"], ["Bournemouth", "BOU"], [3, 1], [
    { webName: "Bowen", teamShortName: "WHU", elementType: 4, goalsScored: 2, bonus: 3, bps: 55 },
    { webName: "Paqueta", teamShortName: "WHU", elementType: 3, goalsScored: 1, yellowCards: 1, bonus: 1, bps: 33 },
    { webName: "Wan-Bissaka", teamShortName: "WHU", elementType: 2, defensiveContribution: 14, bps: 27 }
  ], [
    { webName: "Semenyo", teamShortName: "BOU", elementType: 3, goalsScored: 1, bonus: 2, bps: 31 },
    { webName: "Kluivert", teamShortName: "BOU", elementType: 3, yellowCards: 1, bps: 14 }
  ]),
  fixture(8, "not_start", 0, "2026-08-16T19:00:00Z", ["Man Utd", "MUN"], ["Fulham", "FUL"], [0, 0]),
  fixture(9, "not_start", 0, "2026-08-17T13:00:00Z", ["Nott'm Forest", "NFO"], ["Southampton", "SOU"], [0, 0]),
  fixture(10, "not_start", 0, "2026-08-17T15:30:00Z", ["Leicester", "LEI"], ["Ipswich", "IPS"], [0, 0])
];

export const liveMatchMockData = {
  loading: false,
  refreshing: false,
  hasData: true,
  error: "",
  fixtureStaleMessage: "",
  displayState: "fresh" as const,
  status: "playing",
  activeStatusLabel: "比赛中",
  emptyDescription: "目前没有正在进行的比赛，可以切换到未开始",
  statusOptions: [
    { key: "playing", label: "比赛中" },
    { key: "not_start", label: "未开始" },
    { key: "finished", label: "已完赛" }
  ],
  matches: [] as MockLiveMatch[],
  groups: [] as Array<{ title: string; matches: MockLiveMatch[] }>,
  lastUpdated: "21:45"
};
