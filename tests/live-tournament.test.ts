import {
  filterTournamentLiveRows,
  filterTournamentRowsByOwnership,
  filterTournamentRowsByTeamExposure,
  getTournamentTeamOptions,
  mapTournamentLiveRows,
  compareKnownTournamentValues,
  combinedTournamentTraceableEntries,
  combinedTournamentTraceableScoreStates,
  mergeUnavailableTournamentEntryIds,
  tournamentManagerScoreStatus,
  tournamentScoreNextRefreshAt,
} from "../miniprogram/services/live-tournament";
import { managerScoreNextRefreshAt } from "../miniprogram/services/live-manager-score";

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
    score: {
      eventPoints: 45,
      netEventPoints: 41,
      totalPoints: 1510,
      totalScope: "OVERALL",
      transferCost: 4,
      source: "FPL_EVENT_LIVE",
      state: "FRESH",
      revision: "event-live:gw1:r8:101",
      checkedAt: "2026-08-24T06:00:00.000Z"
    },
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
    score: {
      eventPoints: 50,
      netEventPoints: 50,
      totalPoints: 1520,
      totalScope: "OVERALL",
      transferCost: 0,
      source: "FPL_EVENT_LIVE",
      state: "FRESH",
      revision: "event-live:gw1:r8:202",
      checkedAt: "2026-08-24T06:00:00.000Z"
    },
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

const eventLiveRows = mapTournamentLiveRows([
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
      netEventPoints: 6,
      totalScope: "OVERALL",
      overallRank: 123,
      transferCost: 0,
      source: "FPL_EVENT_LIVE",
      state: "FRESH",
      revision: "event-live:gw1:r9:303",
      checkedAt: "2026-08-24T06:01:00.000Z"
    }
  }
]);
assertEqual(eventLiveRows[0]?.rank, 4, "official tournament rank is preserved");
assertEqual(eventLiveRows[0]?.livePoints, 6, "event/live points replace legacy headline zero");
assertEqual(eventLiveRows[0]?.totalPoints, 101, "event/live overall total remains visible");
assertEqual(eventLiveRows[0]?.overallRank, 123, "official overall rank wins");
assertEqual(tournamentManagerScoreStatus(eventLiveRows), "官方实时", "event/live rows are available");
assertEqual(
  mergeUnavailableTournamentEntryIds([2, 3], [3, 4]).join(","),
  "2,3,4",
  "failed and unavailable manager ids are unified",
);
assertEqual(
  managerScoreNextRefreshAt({
    source: "FPL_ENTRY_SUMMARY",
    state: "FRESH",
    nextRefreshAt: "2026-08-24T06:05:00.000Z",
  }),
  "2026-08-24T06:05:00.000Z",
  "retry metadata survives rejection of an untraceable score",
);
assertEqual(
  managerScoreNextRefreshAt({ nextRefreshAt: "not-a-date" }),
  undefined,
  "invalid retry metadata is rejected",
);
assertEqual(
  tournamentScoreNextRefreshAt([
    { entry: 1 },
    {
      entry: 2,
      scoreNextRefreshAt: "2026-08-24T06:07:00.000Z",
    },
  ]),
  "2026-08-24T06:07:00.000Z",
  "a retained failed row keeps the tournament recovery deadline",
);
assertEqual(
  tournamentManagerScoreStatus(eventLiveRows, {
    officialCoverage: 97 / 98,
    unavailableEntryIds: [404],
    totalEntries: 98,
  }),
  "官方实时：1/98 支球队已有分数",
  "official coverage reports only rows whose event/live provenance was verified",
);
assertEqual(
  tournamentManagerScoreStatus(eventLiveRows, {
    officialCoverage: 97 / 98,
    traceableEntries: 97,
    unavailableEntryIds: [404],
    totalEntries: 98,
  }),
  "官方实时：97/98 支球队已有分数",
  "server-side search preserves the pre-filter traceable league coverage",
);
assertEqual(
  combinedTournamentTraceableEntries(97, eventLiveRows, 98),
  98,
  "retained traceable rows extend fresh pre-filter coverage",
);
assertEqual(
  tournamentManagerScoreStatus(eventLiveRows, {
    officialCoverage: 97 / 98,
    traceableEntries: 98,
    unavailableEntryIds: [404],
    totalEntries: 98,
  }),
  "官方实时",
  "retained traceable rows remain available despite a failed refresh",
);
assertEqual(
  combinedTournamentTraceableScoreStates(undefined, eventLiveRows)?.join(","),
  "FRESH",
  "prefilter score states retain official evidence for keyword searches",
);
assertEqual(
  tournamentManagerScoreStatus([], {
    traceableEntries: 97,
    traceableScoreStates: ["FRESH"],
    totalEntries: 98,
  }),
  "官方实时：97/98 支球队已有分数",
  "an empty keyword result preserves the full-board official status",
);
assertEqual(
  tournamentManagerScoreStatus([], {
    traceableEntries: 97,
    traceableScoreStates: ["STALE"],
    totalEntries: 98,
  }),
  "官方数据延迟",
  "an empty keyword result preserves the full-board stale state",
);
assertEqual(
  tournamentManagerScoreStatus([
    ...eventLiveRows,
    { ...eventLiveRows[0], entry: 404, score: undefined }
  ]),
  "官方实时：1/2 支球队已有分数",
  "one missing score keeps the available board visible"
);

const staleClassicRows = mapTournamentLiveRows([
  {
    entry: 305,
    entryName: "Lagging Classic",
    playerName: "Manager",
    rank: 5,
    overallRank: 999,
    livePoints: 23,
    transferCost: 0,
    liveNetPoints: 23,
    liveTotalPoints: 118,
    played: 7,
    toPlay: 4,
    captainName: "Haaland",
    score: {
      eventPoints: 23,
      netEventPoints: 23,
      totalPoints: 118,
      totalScope: "CLASSIC_PHASE",
      source: "FPL_CLASSIC_STANDINGS",
      state: "FRESH",
      revision: "classic:gw1:r4",
      checkedAt: "2026-08-24T06:01:00.000Z",
      nextRefreshAt: "2026-08-24T06:05:00.000Z"
    }
  }
]);
assertEqual(staleClassicRows[0]?.livePoints, undefined, "Classic points cannot become live points");
assertEqual(staleClassicRows[0]?.score, undefined, "Classic score provenance is rejected");
assertEqual(
  staleClassicRows[0]?.scoreNextRefreshAt,
  "2026-08-24T06:05:00.000Z",
  "rejected tournament scores retain only their retry deadline",
);
assertEqual(staleClassicRows[0]?.rank, undefined, "Classic rank cannot become a live rank");
assertEqual(
  staleClassicRows[0]?.overallRank,
  undefined,
  "Classic overall rank cannot become a live rank",
);
assertEqual(staleClassicRows[0]?.transferCost, undefined, "rejected transfer cost stays unknown");
assertEqual(
  combinedTournamentTraceableEntries(97, staleClassicRows, 98),
  97,
  "an untraceable retained Classic row cannot extend official coverage",
);
assertEqual(
  tournamentManagerScoreStatus(staleClassicRows, {
    officialCoverage: 1,
    totalEntries: 1
  }),
  "官方分数不可用",
  "coverage metadata cannot make an untraceable Classic score official"
);

assertEqual(
  compareKnownTournamentValues(undefined, -4, true),
  1,
  "unavailable scores sort after known negative scores when descending",
);
assertEqual(
  compareKnownTournamentValues(-4, undefined, false),
  -1,
  "unavailable scores sort after known negative scores when ascending",
);

const unknownTransferCostRows = mapTournamentLiveRows([
  {
    entry: 306,
    entryName: "Transfer cost pending",
    playerName: "Manager",
    rank: 1,
    livePoints: 6,
    transferCost: 0,
    liveNetPoints: 0,
    liveTotalPoints: 0,
    played: 1,
    toPlay: 10,
    captainName: "Saka",
    score: {
      eventPoints: 6,
      source: "FPL_EVENT_LIVE",
      state: "SETTLING",
      revision: "event-live:gw1:r10:306",
      checkedAt: "2026-08-24T06:02:00.000Z"
    }
  }
]);
assertEqual(
  unknownTransferCostRows[0]?.transferCost,
  undefined,
  "missing official transfer cost stays unknown",
);
const settlingPendingRows = mapTournamentLiveRows([
  {
    entry: 307,
    entryName: "Settling official score",
    playerName: "Manager",
    rank: 1,
    livePoints: 0,
    transferCost: 0,
    liveNetPoints: 0,
    liveTotalPoints: 0,
    played: 1,
    toPlay: 10,
    captainName: "Saka",
    score: {
      source: "FPL_EVENT_LIVE",
      state: "SETTLING",
      revision: "event-live:gw1:r10:307",
      checkedAt: "2026-08-24T06:02:00.000Z"
    }
  }
]);
assertEqual(
  tournamentManagerScoreStatus(settlingPendingRows),
  "结算中",
  "traceable settling state remains visible before event points are published",
);

const stalePendingRows = settlingPendingRows.map((row) => ({
  ...row,
  score: row.score ? { ...row.score, state: "STALE" as const } : undefined,
}));
assertEqual(
  tournamentManagerScoreStatus(stalePendingRows),
  "官方数据延迟",
  "traceable stale state remains visible before event points are published",
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
      netEventPoints: 43,
      totalPoints: 146,
      totalScope: "OVERALL",
      transferCost: 0,
      source: "FPL_EVENT_LIVE",
      state: "FRESH",
      eventPointSemantics: "ZERO_COST_EQUIVALENT",
      revision: "event-live:gw1:r9:31056",
      checkedAt: "2026-08-24T06:01:00.000Z"
    }
  }
]);
assertEqual(h2hRows[0]?.livePoints, 43, "H2H uses event/live manager points");
assertEqual(h2hRows[0]?.liveNetPoints, 43, "H2H uses event/live net points");
assertEqual(
  tournamentManagerScoreStatus(h2hRows, {
    officialCoverage: 1,
    totalEntries: 1
  }),
  "官方实时",
  "H2H event/live score is available"
);

const staleH2hRows = mapTournamentLiveRows([
  {
    entry: 31056,
    entryName: "Lagging H2H",
    playerName: "Manager",
    rank: 0,
    livePoints: 23,
    transferCost: 0,
    liveNetPoints: 23,
    liveTotalPoints: 23,
    played: 7,
    toPlay: 4,
    captainName: "Haaland",
    score: {
      eventPoints: 23,
      source: "FPL_ENTRY_SUMMARY",
      state: "FRESH",
      revision: "summary:gw1:r4",
      checkedAt: "2026-08-24T06:01:00.000Z"
    }
  }
]);
assertEqual(staleH2hRows[0]?.livePoints, undefined, "H2H summary points cannot become live points");
assertEqual(staleH2hRows[0]?.score, undefined, "H2H summary provenance is rejected");
