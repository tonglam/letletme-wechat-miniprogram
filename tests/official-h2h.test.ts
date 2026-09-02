import {
  filterTournamentRoster,
  h2hMatchupStatusText,
  h2hPhaseLabel,
  h2hScoreStateText,
  h2hSideName,
  isOfficialH2HTournamentRow,
  isTournamentSetupInFlight,
  scrubUntraceableH2HMatches,
  shouldShowH2HStandings,
  sortH2HStandings,
  tournamentEventRangeText,
  tournamentGroupModeText,
  tournamentHasKnockout,
  tournamentKnockoutModeText,
  tournamentLeagueTypeText,
  tournamentSetupPhaseRows,
  tournamentSetupPhaseText,
  tournamentSetupProgressText,
  traceableH2HBoard,
  visibleTournamentRoster,
  type H2HBoard,
  type H2HMatch,
  type H2HRevisionVector,
  type TournamentParticipantRow,
} from "../miniprogram/utils/official-h2h";

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const revision: H2HRevisionVector = {
  publicationId: "pub-1",
  generation: 1,
  roster: "roster-1",
  scoreCore: "score-1",
  fixtureIdentity: "fixture-1",
  entryInputSet: "inputs-1",
  identity: "identity-1",
  officialRank: "rank-1",
  rules: "rules-1",
  algorithm: "algorithm-1",
  content: "content-1",
};

const delivery = {
  state: "FRESH" as const,
  servedFrom: "REDIS_CURRENT" as const,
  reasonCodes: [],
};

const times = {
  sourceCheckedAt: "2026-08-27T10:00:00.000Z",
  contentUpdatedAt: "2026-08-27T10:00:00.000Z",
  publishedAt: "2026-08-27T10:00:00.000Z",
  checkpointedAt: null,
  servedAt: "2026-08-27T10:00:00.000Z",
  staleAt: "2026-08-27T10:00:37.500Z",
  nextRefreshAt: "2026-08-27T10:00:30.000Z",
};

function match(overrides: Partial<H2HMatch> = {}): H2HMatch {
  return {
    officialMatchId: 1,
    eventId: 3,
    groupId: 1,
    sourceOrder: 0,
    phase: "REGULAR",
    knockoutName: null,
    tiebreak: null,
    isBye: false,
    availability: "READY",
    delivery,
    revisions: revision,
    times,
    home: {
      availability: "READY",
      entryId: 1,
      entryName: "主队",
      playerName: "经理一",
      isAverage: false,
      points: 60,
      netPoints: 60,
    },
    away: {
      availability: "READY",
      entryId: 2,
      entryName: "客队",
      playerName: "经理二",
      isAverage: false,
      points: 55,
      netPoints: 55,
    },
    ...overrides,
  };
}

function board(overrides: Partial<H2HBoard> = {}): H2HBoard {
  return {
    eventId: 3,
    availability: "READY",
    delivery,
    revisions: revision,
    times,
    standings: {
      throughEventId: 2,
      state: "READY",
      sourceCheckedAt: times.sourceCheckedAt,
      rows: [],
    },
    matches: [match()],
    ...overrides,
  };
}

check(
  isOfficialH2HTournamentRow({
    leagueType: "H2H",
    rosterMode: "OFFICIAL_SYNC",
    groupMode: "BATTLE_RACES",
  }),
  "official H2H row detected",
);
check(
  !isOfficialH2HTournamentRow({
    leagueType: "H2H",
    rosterMode: "SNAPSHOT",
    groupMode: "BATTLE_RACES",
  }),
  "custom H2H is not the official surface",
);
check(!isOfficialH2HTournamentRow(null), "null row is not H2H");

check(traceableH2HBoard(board()), "complete publication is traceable");
check(
  !traceableH2HBoard(board({ availability: "PENDING" })),
  "pending publication is not traceable",
);
check(
  !traceableH2HBoard(board({ revisions: null })),
  "publication without revision is not traceable",
);
check(
  !traceableH2HBoard(board({ times: { ...times, contentUpdatedAt: "bad" } })),
  "publication without content time is not traceable",
);

const sorted = sortH2HStandings([
  {
    entryId: 3,
    entryName: "三",
    playerName: null,
    rank: null,
    matchPoints: 30,
    played: 2,
    won: 2,
    drawn: 0,
    lost: 0,
    pointsFor: 900,
  },
  {
    entryId: 1,
    entryName: "一",
    playerName: null,
    rank: 2,
    matchPoints: 12,
    played: 2,
    won: 1,
    drawn: 0,
    lost: 1,
    pointsFor: 400,
  },
  {
    entryId: 2,
    entryName: "二",
    playerName: null,
    rank: 1,
    matchPoints: 15,
    played: 2,
    won: 1,
    drawn: 0,
    lost: 1,
    pointsFor: 500,
  },
]);
equal(sorted.map((row) => row.entryId).join(","), "2,1,3", "standing order");

const scrubbed = scrubUntraceableH2HMatches([match()]);
equal(scrubbed[0]?.home.points, null, "home points are scrubbed");
equal(scrubbed[0]?.away.netPoints, null, "away net points are scrubbed");
equal(match().home.points, 60, "scrubbing does not mutate input");

equal(h2hMatchupStatusText(match(), 3), "进行中", "current live match");
equal(
  h2hMatchupStatusText({ ...match(), eventId: 2 }, 3),
  "已结束",
  "past match",
);
equal(
  h2hMatchupStatusText({ ...match(), availability: "PENDING" }, 3),
  "待开始",
  "pending match",
);
equal(
  h2hMatchupStatusText({ ...match(), availability: "ERROR" }, 3),
  "暂时不可用",
  "error is not upcoming",
);

equal(h2hScoreStateText("READY", "FRESH"), "进行中", "fresh badge");
equal(h2hScoreStateText("READY", "FINAL"), "已结束", "final badge");
equal(h2hScoreStateText("PENDING", "FRESH"), "正在获取", "pending badge");
equal(h2hSideName(match().home), "主队", "normal side name");
equal(
  h2hSideName({ ...match().home, isAverage: true }),
  "平均队",
  "average side name",
);
equal(
  h2hPhaseLabel({ phase: "KNOCKOUT", knockoutName: "半决赛" }),
  "半决赛",
  "knockout label",
);
equal(h2hPhaseLabel({ phase: "REGULAR" }), "常规赛", "regular label");

check(shouldShowH2HStandings(3, 3), "current GW shows standings");
check(!shouldShowH2HStandings(4, 3), "future GW hides standings");
check(shouldShowH2HStandings(4, null), "unknown boundary keeps tab visible");

equal(
  tournamentSetupPhaseText("SYNCING_ENTRIES"),
  "同步经理数据",
  "phase label",
);
equal(tournamentSetupPhaseText("QUEUED"), "排队中", "queued label");
check(isTournamentSetupInFlight({ status: "PROCESSING" }), "processing setup polls");
check(!isTournamentSetupInFlight({ status: "READY" }), "ready setup stops polling");
equal(
  tournamentSetupProgressText({
    status: "PROCESSING",
    phase: "BUILDING_STRUCTURE",
    completedUnits: 2,
    totalUnits: 5,
    progressMode: "DETERMINATE",
  }),
  "构建赛事结构 2/5",
  "progress text",
);
equal(
  tournamentSetupPhaseRows({ phase: "CALCULATING_STANDINGS" })
    .map((row) => row.state)
    .join(","),
  "complete,complete,active,pending,pending",
  "phase checklist",
);

equal(tournamentGroupModeText("BATTLE_RACES"), "对战", "group label");
equal(
  tournamentKnockoutModeText("SINGLE_ELIMINATION"),
  "单败淘汰",
  "knockout label",
);
check(tournamentHasKnockout("SINGLE_ELIMINATION"), "knockout detected");
check(!tournamentHasKnockout("NO_KNOCKOUT"), "no knockout detected");
equal(tournamentLeagueTypeText("H2H"), "对战", "league label");
equal(tournamentEventRangeText(3, 8), "第 3–8 轮", "event range");

const roster: TournamentParticipantRow[] = Array.from({ length: 25 }, (_, i) => ({
  entryId: i + 1,
  entryName: `球队${i + 1}`,
  playerName: i === 24 ? "Tong" : `经理${i + 1}`,
}));
equal(filterTournamentRoster(roster, "tong").length, 1, "manager search");
equal(filterTournamentRoster(roster, "球队10").length, 1, "team search");
equal(filterTournamentRoster(roster, "25").length, 1, "entry search");
equal(visibleTournamentRoster(roster, 20, 25).length, 21, "viewer is visible");

console.log("H2H V2 tests passed");
