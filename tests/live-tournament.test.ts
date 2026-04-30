import {
  filterTournamentLiveRows,
  filterTournamentRowsByOwnership,
  filterTournamentRowsByTeamExposure,
  getTournamentTeamOptions,
  mapTournamentLiveRows
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

const arsenalDouble = filterTournamentRowsByTeamExposure(rows, { teamShortName: "ARS", exactCount: 2, scope: "starter" });
assertEqual(arsenalDouble.length, 1, "team exposure exact count");
assertEqual(arsenalDouble[0]?.entry, 101, "team exposure exact result");

const teams = getTournamentTeamOptions(rows);
assertEqual(teams.length, 2, "team options are deduplicated");
assertEqual(teams[0]?.name, "Arsenal", "team options are sorted by name");
