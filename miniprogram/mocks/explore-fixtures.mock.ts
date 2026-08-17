interface MockRunChip {
  event: number;
  opponentShortName: string;
  home: boolean;
  difficulty: number;
  finished: boolean;
}

interface MockRun {
  teamId: number;
  teamName: string;
  teamShortName: string;
  chips: MockRunChip[];
}

/** Authored window: GW3–5 with mirrored pairings. */
const TEAMS: MockRun[] = [
  {
    teamId: 1,
    teamName: "Arsenal",
    teamShortName: "ARS",
    chips: [
      { event: 3, opponentShortName: "CHE", home: true, difficulty: 2, finished: false },
      { event: 4, opponentShortName: "BHA", home: false, difficulty: 2, finished: false },
      { event: 5, opponentShortName: "FUL", home: true, difficulty: 2, finished: false }
    ]
  },
  {
    teamId: 2,
    teamName: "Aston Villa",
    teamShortName: "AVL",
    chips: [
      { event: 3, opponentShortName: "NEW", home: false, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "EVE", home: true, difficulty: 2, finished: false },
      { event: 5, opponentShortName: "MUN", home: false, difficulty: 3, finished: false }
    ]
  },
  {
    teamId: 3,
    teamName: "Bournemouth",
    teamShortName: "BOU",
    chips: [
      { event: 3, opponentShortName: "SOU", home: true, difficulty: 2, finished: false },
      { event: 4, opponentShortName: "WHU", home: false, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "BRE", home: true, difficulty: 3, finished: false }
    ]
  },
  {
    teamId: 4,
    teamName: "Brentford",
    teamShortName: "BRE",
    chips: [
      { event: 3, opponentShortName: "CRY", home: true, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "LIV", home: false, difficulty: 5, finished: false },
      { event: 5, opponentShortName: "BOU", home: false, difficulty: 3, finished: false }
    ]
  },
  {
    teamId: 5,
    teamName: "Brighton",
    teamShortName: "BHA",
    chips: [
      { event: 3, opponentShortName: "WOL", home: true, difficulty: 2, finished: false },
      { event: 4, opponentShortName: "ARS", home: true, difficulty: 4, finished: false },
      { event: 5, opponentShortName: "MCI", home: false, difficulty: 5, finished: false }
    ]
  },
  {
    teamId: 6,
    teamName: "Chelsea",
    teamShortName: "CHE",
    chips: [
      { event: 3, opponentShortName: "ARS", home: false, difficulty: 4, finished: false },
      { event: 4, opponentShortName: "MCI", home: true, difficulty: 4, finished: false },
      { event: 5, opponentShortName: "LIV", home: false, difficulty: 5, finished: false }
    ]
  },
  {
    teamId: 7,
    teamName: "Crystal Palace",
    teamShortName: "CRY",
    chips: [
      { event: 3, opponentShortName: "BRE", home: false, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "NFO", home: true, difficulty: 2, finished: false },
      { event: 5, opponentShortName: "TOT", home: false, difficulty: 4, finished: false }
    ]
  },
  {
    teamId: 8,
    teamName: "Everton",
    teamShortName: "EVE",
    chips: [
      { event: 3, opponentShortName: "MUN", home: true, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "AVL", home: false, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "LEI", home: true, difficulty: 2, finished: false }
    ]
  },
  {
    teamId: 9,
    teamName: "Fulham",
    teamShortName: "FUL",
    chips: [
      { event: 3, opponentShortName: "WHU", home: true, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "SOU", home: false, difficulty: 2, finished: false },
      { event: 5, opponentShortName: "ARS", home: false, difficulty: 4, finished: false }
    ]
  },
  {
    teamId: 10,
    teamName: "Ipswich",
    teamShortName: "IPS",
    chips: [
      { event: 3, opponentShortName: "LIV", home: true, difficulty: 5, finished: false },
      { event: 4, opponentShortName: "BHA", home: false, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "SOU", home: true, difficulty: 2, finished: false }
    ]
  },
  {
    teamId: 11,
    teamName: "Leicester",
    teamShortName: "LEI",
    chips: [
      { event: 3, opponentShortName: "TOT", home: true, difficulty: 4, finished: false },
      { event: 4, opponentShortName: "NFO", home: false, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "EVE", home: false, difficulty: 3, finished: false }
    ]
  },
  {
    teamId: 12,
    teamName: "Liverpool",
    teamShortName: "LIV",
    chips: [
      { event: 3, opponentShortName: "MCI", home: true, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "BRE", home: true, difficulty: 2, finished: false },
      { event: 5, opponentShortName: "CHE", home: true, difficulty: 3, finished: false }
    ]
  },
  {
    teamId: 13,
    teamName: "Man City",
    teamShortName: "MCI",
    chips: [
      { event: 3, opponentShortName: "LIV", home: false, difficulty: 4, finished: false },
      { event: 4, opponentShortName: "CHE", home: false, difficulty: 4, finished: false },
      { event: 5, opponentShortName: "BHA", home: true, difficulty: 2, finished: false }
    ]
  },
  {
    teamId: 14,
    teamName: "Man Utd",
    teamShortName: "MUN",
    chips: [
      { event: 3, opponentShortName: "EVE", home: false, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "TOT", home: true, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "AVL", home: true, difficulty: 3, finished: false }
    ]
  },
  {
    teamId: 15,
    teamName: "Newcastle",
    teamShortName: "NEW",
    chips: [
      { event: 3, opponentShortName: "AVL", home: true, difficulty: 2, finished: false },
      { event: 4, opponentShortName: "WOL", home: false, difficulty: 2, finished: false },
      { event: 5, opponentShortName: "NFO", home: true, difficulty: 2, finished: false }
    ]
  },
  {
    teamId: 16,
    teamName: "Nott'm Forest",
    teamShortName: "NFO",
    chips: [
      { event: 3, opponentShortName: "WHU", home: false, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "CRY", home: false, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "NEW", home: false, difficulty: 3, finished: false }
    ]
  },
  {
    teamId: 17,
    teamName: "Southampton",
    teamShortName: "SOU",
    chips: [
      { event: 3, opponentShortName: "BOU", home: false, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "FUL", home: true, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "IPS", home: false, difficulty: 2, finished: false }
    ]
  },
  {
    teamId: 18,
    teamName: "Tottenham",
    teamShortName: "TOT",
    chips: [
      { event: 3, opponentShortName: "LEI", home: false, difficulty: 2, finished: false },
      { event: 4, opponentShortName: "MUN", home: false, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "CRY", home: true, difficulty: 2, finished: false }
    ]
  },
  {
    teamId: 19,
    teamName: "West Ham",
    teamShortName: "WHU",
    chips: [
      { event: 3, opponentShortName: "FUL", home: false, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "NFO", home: true, difficulty: 2, finished: false },
      { event: 5, opponentShortName: "WOL", home: false, difficulty: 2, finished: false }
    ]
  },
  {
    teamId: 20,
    teamName: "Wolves",
    teamShortName: "WOL",
    chips: [
      { event: 3, opponentShortName: "BHA", home: false, difficulty: 3, finished: false },
      { event: 4, opponentShortName: "NEW", home: true, difficulty: 3, finished: false },
      { event: 5, opponentShortName: "WHU", home: true, difficulty: 2, finished: false }
    ]
  }
];

/**
 * Pad the window out to GW10 with a deterministic rotation so the 5轮/8轮
 * tabs render visibly different cards in preview (opponent self-match is
 * impossible: event 6–10 is never a multiple of the 20-team cycle).
 */
function padChips(chips: MockRunChip[], teamIndex: number): MockRunChip[] {
  const extra: MockRunChip[] = [];
  for (let event = 6; event <= 10; event += 1) {
    const opponent = TEAMS[(teamIndex + event) % TEAMS.length];
    extra.push({
      event,
      opponentShortName: opponent.teamShortName,
      home: (teamIndex + event) % 2 === 0,
      difficulty: ((teamIndex * 3 + event) % 5) + 1,
      finished: false
    });
  }
  return chips.concat(extra);
}

// horizon intentionally absent: the page default (5轮) applies, and a user
// tap must survive the mock setData instead of being reset by it.
export const exploreFixturesMockData = {
  loading: false,
  error: "",
  startEvent: 3,
  maxEvent: 38,
  runs: TEAMS.map((team, index) => ({ ...team, chips: padChips(team.chips, index) }))
};
