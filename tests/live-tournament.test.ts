import {
  filterTournamentLiveRows,
  filterTournamentRowsByOwnership,
  filterTournamentRowsByTeamExposure,
  getTournamentTeamOptions,
  mapTournamentLiveRows,
  mergeUnavailableTournamentEntryIds,
  tournamentManagerScoreStatus
} from "../miniprogram/services/live-tournament";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const rows = mapTournamentLiveRows([
  {
    entry: 101,
    entryName: "North London",
    playerName: "Mikel",
    rank: 2,
    livePoints: 45,
    transferCost: 4,
    liveNetPoints: 41,
    liveTotalPoints: 1510,
    played: 8,
    toPlay: 3,
    captainName: "Saka",
    chip: "WILDCARD",
    pickList: [
      {
        element: 1,
        webName: "Saka",
        teamShortName: "ARS",
        teamName: "Arsenal",
        elementTypeName: "MID",
        position: 1,
        isCaptain: true,
        isViceCaptain: false
      },
      {
        element: 2,
        webName: "Gabriel",
        teamShortName: "ARS",
        teamName: "Arsenal",
        elementTypeName: "DEF",
        position: 2,
        isCaptain: false,
        isViceCaptain: false
      },
      {
        element: 3,
        webName: "Palmer",
        teamShortName: "CHE",
        teamName: "Chelsea",
        elementTypeName: "MID",
        position: 12,
        isCaptain: false,
        isViceCaptain: true
      }
    ]
  },
  {
    entry: 202,
    entryName: "Bright Coast",
    playerName: "Roberto",
    rank: 1,
    livePoints: 50,
    transferCost: 0,
    liveNetPoints: 50,
    liveTotalPoints: 1520,
    played: 9,
    toPlay: 2,
    captainName: "Pedro",
    chip: null,
    pickList: [
      {
        element: 4,
        webName: "Pedro",
        teamShortName: "CHE",
        teamName: "Chelsea",
        elementTypeName: "FWD",
        position: 1,
        isCaptain: true,
        isViceCaptain: false
      },
      {
        element: 1,
        webName: "Saka",
        teamShortName: "ARS",
        teamName: "Arsenal",
        elementTypeName: "MID",
        position: 12,
        isCaptain: false,
        isViceCaptain: false
      }
    ]
  }
]);

assertEqual(rows[0]?.entry, 101, "entry id is preserved");
assertEqual(rows[0]?.liveTotalPoints, 1510, "live total is preserved");
assertEqual(rows[0]?.searchText?.includes("saka"), true, "search text includes pick names");

const filteredByEntry = filterTournamentLiveRows(rows, "202");
assertEqual(filteredByEntry.length, 1, "entry id filter count");
assertEqual(filteredByEntry[0]?.entryName, "Bright Coast", "entry id filter result");

const filteredByName = filterTournamentLiveRows(rows, "mikel");
assertEqual(filteredByName.length, 1, "manager name filter count");
assertEqual(filteredByName[0]?.entryName, "North London", "manager name filter result");

const captainSaka = filterTournamentRowsByOwnership(rows, { playerIds: [1], scope: "starter", captainMode: "captain" });
assertEqual(captainSaka.length, 1, "captain ownership filter count");
assertEqual(captainSaka[0]?.entry, 101, "captain ownership filter result");

const benchSaka = filterTournamentRowsByOwnership(rows, { playerIds: [1], scope: "bench", captainMode: "any" });
assertEqual(benchSaka.length, 1, "bench ownership filter count");
assertEqual(benchSaka[0]?.entry, 202, "bench ownership filter result");

const arsenalDouble = filterTournamentRowsByTeamExposure(rows, { rules: [{ teamShortName: "ARS", exactCount: 2 }], scope: "starter" });
assertEqual(arsenalDouble.length, 1, "team exposure exact count");
assertEqual(arsenalDouble[0]?.entry, 101, "team exposure exact result");

const multiRule = filterTournamentRowsByTeamExposure(rows, {
  rules: [
    { teamShortName: "ARS", exactCount: 2 },
    { teamShortName: "CHE", exactCount: 1 }
  ],
  scope: "any"
});
assertEqual(multiRule.length, 1, "multiple team rules all must hold");
assertEqual(multiRule[0]?.entry, 101, "multi-rule exposure result");

const noRules = filterTournamentRowsByTeamExposure(rows, { rules: [], scope: "any" });
assertEqual(noRules.length, 2, "empty rules keep all rows");

const teams = getTournamentTeamOptions(rows);
assertEqual(teams.length, 2, "team options are deduplicated");
assertEqual(teams[0]?.name, "Arsenal", "team options are sorted by name");

const classicRows = mapTournamentLiveRows([
  {
    entry: 303,
    entryName: "Official",
    playerName: "Manager",
    rank: 4,
    overallRank: 999,
    livePoints: 0,
    transferCost: 0,
    liveNetPoints: 0,
    liveTotalPoints: 0,
    played: 3,
    toPlay: 8,
    captainName: "Saka",
    score: {
      eventPoints: 6,
      totalPoints: 101,
      totalScope: "CLASSIC_PHASE",
      overallRank: 123,
      source: "FPL_CLASSIC_STANDINGS",
      state: "LIVE"
    }
  }
]);
assertEqual(classicRows[0]?.rank, 4, "official tournament rank is preserved");
assertEqual(classicRows[0]?.livePoints, 6, "official event points replace legacy headline zero");
assertEqual(classicRows[0]?.totalPoints, 101, "classic phase total remains visible");
assertEqual(classicRows[0]?.overallRank, 123, "official overall rank wins");
assertEqual(tournamentManagerScoreStatus(classicRows), "官方实时", "official rows are available");
assertEqual(
  mergeUnavailableTournamentEntryIds([2, 3], [3, 4]).join(","),
  "2,3,4",
  "failed and unavailable manager ids are unified",
);
assertEqual(
  tournamentManagerScoreStatus(classicRows, {
    officialCoverage: 97 / 98,
    unavailableEntryIds: [404],
    totalEntries: 98,
  }),
  "官方实时：97/98 支球队已有分数",
  "official coverage reports the whole league rather than only returned rows",
);
assertEqual(
  tournamentManagerScoreStatus([
    ...classicRows,
    { ...classicRows[0], entry: 404, score: { source: "UNAVAILABLE", state: "UNAVAILABLE" } }
  ]),
  "官方实时：1/2 支球队已有分数",
  "one missing score keeps the available board visible"
);

const h2hRows = mapTournamentLiveRows([
  {
    entry: 31056,
    entryName: "H2H Team",
    playerName: "Manager",
    rank: 0,
    livePoints: 0,
    transferCost: 0,
    liveNetPoints: 0,
    liveTotalPoints: 0,
    played: 0,
    toPlay: 0,
    captainName: "",
    score: {
      eventPoints: 43,
      netEventPoints: null,
      totalPoints: 146,
      source: "FPL_ENTRY_SUMMARY",
      state: "FRESH",
      eventPointSemantics: "UNKNOWN"
    }
  }
]);
assertEqual(h2hRows[0]?.livePoints, 43, "H2H official gross event points are preserved");
assertEqual(
  tournamentManagerScoreStatus(h2hRows, {
    officialCoverage: 0,
    totalEntries: 1
  }),
  "官方实时",
  "H2H gross score rows are not hidden by zero net coverage"
);
