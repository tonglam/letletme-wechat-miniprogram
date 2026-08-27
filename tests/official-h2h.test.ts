import {
  filterTournamentRoster,
  isOfficialH2HTournamentRow,
  isTournamentSetupInFlight,
  officialH2HMatchupStatusText,
  officialH2HPhaseLabel,
  officialH2HScoreSourceText,
  officialH2HSideName,
  scrubUntraceableH2HMatches,
  shouldShowOfficialH2HStandings,
  sortOfficialH2HStandings,
  tournamentEventRangeText,
  tournamentGroupModeText,
  tournamentHasKnockout,
  tournamentKnockoutModeText,
  tournamentLeagueTypeText,
  tournamentSetupPhaseRows,
  tournamentSetupPhaseText,
  tournamentSetupProgressText,
  traceableOfficialH2HBoard,
  visibleTournamentRoster,
  type OfficialH2HBoard,
  type OfficialH2HMatch,
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

function board(overrides: Partial<OfficialH2HBoard> = {}): OfficialH2HBoard {
  return {
    eventId: 3,
    scoreSource: "FPL_EVENT_LIVE",
    scoreRevision: "rev-1",
    scoreCheckedAt: "2026-08-27T10:00:00.000Z",
    standings: [],
    matches: [],
    ...overrides,
  };
}

function match(overrides: Partial<OfficialH2HMatch> = {}): OfficialH2HMatch {
  return {
    officialMatchId: 1,
    eventId: 3,
    sourceOrder: 0,
    phase: "REGULAR",
    isBye: false,
    home: { entryId: 1, entryName: "主队", points: 60 },
    away: { entryId: 2, entryName: "客队", points: 55 },
    winnerEntryId: 1,
    sourceCheckedAt: "2026-08-27T10:00:00.000Z",
    ...overrides,
  };
}

// --- isOfficialH2HTournamentRow (web isOfficialH2HTournament parity) ---
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
  "custom H2H without official sync is not an official H2H surface",
);
check(
  !isOfficialH2HTournamentRow({
    leagueType: "CLASSIC",
    rosterMode: "OFFICIAL_SYNC",
    groupMode: "BATTLE_RACES",
  }),
  "classic league is not H2H",
);
check(
  !isOfficialH2HTournamentRow({
    leagueType: "H2H",
    rosterMode: "OFFICIAL_SYNC",
    groupMode: "POINTS_RACES",
  }),
  "points race is not H2H",
);
check(!isOfficialH2HTournamentRow(null), "null row is not H2H");
check(!isOfficialH2HTournamentRow(undefined), "undefined row is not H2H");

// --- traceableOfficialH2HBoard (web traceableOfficialH2HScore parity) ---
check(traceableOfficialH2HBoard(board()), "live source with revision passes");
check(
  traceableOfficialH2HBoard(board({ scoreSource: "FPL_H2H_FINAL" })),
  "final source passes",
);
check(
  !traceableOfficialH2HBoard(board({ scoreSource: "UNAVAILABLE" })),
  "unavailable source never passes",
);
check(
  !traceableOfficialH2HBoard(board({ scoreRevision: "" })),
  "empty revision blocks",
);
check(
  !traceableOfficialH2HBoard(board({ scoreRevision: null })),
  "missing revision blocks",
);
check(
  !traceableOfficialH2HBoard(board({ scoreCheckedAt: "not-a-date" })),
  "unparseable checkedAt blocks",
);
check(
  !traceableOfficialH2HBoard(board({ scoreCheckedAt: null })),
  "missing checkedAt blocks",
);
check(!traceableOfficialH2HBoard(null), "missing board blocks");
check(!traceableOfficialH2HBoard(undefined), "undefined board blocks");

// --- sortOfficialH2HStandings (web OfficialH2HCompetitionView order) ---
const sorted = sortOfficialH2HStandings([
  { entryId: 3, rank: null, matchPoints: 30, pointsFor: 900 },
  { entryId: 1, rank: 2, matchPoints: 12, pointsFor: 400 },
  { entryId: 2, rank: 1, matchPoints: 15, pointsFor: 500 },
  { entryId: 4, rank: 3, matchPoints: 12, pointsFor: 450 },
  { entryId: 5, rank: 3, matchPoints: 12, pointsFor: 420 },
]);
check(
  sorted.map((row) => row.entryId).join(",") === "2,1,4,5,3",
  "rank asc, then matchPoints desc, then pointsFor desc; unranked last",
);
const tieBreak = sortOfficialH2HStandings([
  { entryId: 9, rank: null, matchPoints: 5, pointsFor: 100 },
  { entryId: 7, rank: null, matchPoints: 5, pointsFor: 100 },
]);
check(
  tieBreak.map((row) => row.entryId).join(",") === "7,9",
  "full tie falls back to entryId asc",
);

// --- scrubUntraceableH2HMatches ---
const scrubbed = scrubUntraceableH2HMatches([match()]);
equal(scrubbed[0].home.points, null, "home points scrubbed");
equal(scrubbed[0].away.matchPoints, null, "away matchPoints scrubbed");
equal(scrubbed[0].winnerEntryId, null, "winner scrubbed");
equal(scrubbed[0].sourceCheckedAt, null, "checkedAt scrubbed");
equal(scrubbed[0].home.entryName, "主队", "identity fields survive scrubbing");
equal(match().winnerEntryId, 1, "scrubbing does not mutate the input");

// --- shouldShowOfficialH2HStandings (web official-h2h-presentation parity) ---
check(shouldShowOfficialH2HStandings(3, 3), "current GW shows standings");
check(shouldShowOfficialH2HStandings(2, 3), "past GW shows standings");
check(!shouldShowOfficialH2HStandings(4, 3), "future GW hides standings");
check(
  shouldShowOfficialH2HStandings(4, null),
  "unknown boundary keeps the tab visible",
);
check(
  shouldShowOfficialH2HStandings(4, undefined),
  "missing boundary keeps the tab visible",
);

// --- labels (messages/zh-CN.json parity) ---
equal(officialH2HScoreSourceText("FPL_EVENT_LIVE"), "进行中", "live badge");
equal(officialH2HScoreSourceText("FPL_H2H_FINAL"), "已结束", "final badge");
equal(officialH2HScoreSourceText("UNAVAILABLE"), "待开始", "pending badge");
equal(officialH2HScoreSourceText(null), "待开始", "null source badge");
equal(
  officialH2HPhaseLabel({ phase: "KNOCKOUT", knockoutName: "半决赛" }),
  "半决赛",
  "knockout name wins",
);
equal(
  officialH2HPhaseLabel({ phase: "KNOCKOUT", knockoutName: null }),
  "淘汰赛",
  "generic knockout label",
);
equal(officialH2HPhaseLabel({ phase: "REGULAR" }), "常规赛", "regular label");
equal(
  officialH2HSideName({ entryName: "队名", isAverage: false }),
  "队名",
  "normal side name",
);
equal(
  officialH2HSideName({ entryName: "Average", isAverage: true }),
  "平均队",
  "average side label",
);

// --- matchup history status (web MatchupHistoryBoard badge) ---
equal(
  officialH2HMatchupStatusText(
    { eventId: 5 },
    { eventId: 5, isLive: true, isFinal: false },
  ),
  "进行中",
  "live current event is live",
);
equal(
  officialH2HMatchupStatusText(
    { eventId: 4 },
    { eventId: 5, isLive: true, isFinal: false },
  ),
  "已结束",
  "past event is finished",
);
equal(
  officialH2HMatchupStatusText(
    { eventId: 5 },
    { eventId: 5, isLive: false, isFinal: true },
  ),
  "已结束",
  "final current event is finished",
);
equal(
  officialH2HMatchupStatusText(
    { eventId: 5 },
    { eventId: 5, isLive: false, isFinal: false },
  ),
  "待开始",
  "current event neither live nor final is upcoming",
);
equal(
  officialH2HMatchupStatusText(
    { eventId: 6 },
    { eventId: 5, isLive: false, isFinal: false },
  ),
  "待开始",
  "future event is upcoming",
);
equal(
  officialH2HMatchupStatusText({ eventId: 5 }, null),
  "待开始",
  "missing desk is upcoming",
);

// --- setup lifecycle ---
equal(tournamentSetupPhaseText("SYNCING_ENTRIES"), "同步经理数据", "phase label");
equal(tournamentSetupPhaseText("CALCULATING_STANDINGS"), "计算积分榜", "phase label");
equal(tournamentSetupPhaseText("QUEUED"), "排队中", "queued label");
equal(tournamentSetupPhaseText(null), "排队中", "unknown phase falls back");
check(
  isTournamentSetupInFlight({ status: "PENDING" }),
  "pending setup is in flight",
);
check(
  isTournamentSetupInFlight({ status: "PROCESSING" }),
  "processing setup is in flight",
);
check(!isTournamentSetupInFlight({ status: "READY" }), "ready setup is done");
check(!isTournamentSetupInFlight({ status: "FAILED" }), "failed setup stops polling");
check(!isTournamentSetupInFlight(null), "missing setup does not poll");
equal(
  tournamentSetupProgressText({
    status: "PROCESSING",
    phase: "BUILDING_STRUCTURE",
    completedUnits: 2,
    totalUnits: 5,
    progressMode: "DETERMINATE",
  }),
  "构建赛事结构 2/5",
  "determinate progress text",
);
equal(
  tournamentSetupProgressText({
    status: "PROCESSING",
    phase: "BUILDING_STRUCTURE",
    completedUnits: 2,
    totalUnits: 5,
    progressMode: "INDETERMINATE",
  }),
  "构建赛事结构",
  "indeterminate progress hides the counter",
);

// --- setup phase checklist (web TournamentDetailClient SETUP_PHASES) ---
const phaseStates = (setup?: Parameters<typeof tournamentSetupPhaseRows>[0]) =>
  tournamentSetupPhaseRows(setup).map((row) => row.state).join(",");
const midSetup = tournamentSetupPhaseRows({
  status: "PROCESSING",
  phase: "CALCULATING_STANDINGS",
  completedUnits: 3,
  totalUnits: 7,
  progressMode: "DETERMINATE",
});
equal(midSetup.length, 5, "five setup phases");
equal(
  midSetup.map((row) => row.state).join(","),
  "complete,complete,active,pending,pending",
  "phases before the current one are complete, the rest pending",
);
equal(midSetup[2].label, "计算积分榜", "active phase label");
equal(midSetup[2].progressText, "3/7", "active phase carries the counter");
equal(midSetup[0].progressText, "", "completed phase hides the counter");
equal(
  phaseStates({
    status: "PROCESSING",
    phase: "QUEUED",
    completedUnits: 0,
    totalUnits: 0,
    progressMode: "INDETERMINATE",
  }),
  "active,pending,pending,pending,pending",
  "QUEUED activates the first phase",
);
equal(
  phaseStates({ status: "READY", phase: "READY" }),
  "complete,complete,complete,complete,complete",
  "READY completes every phase",
);
const indeterminateSetup = tournamentSetupPhaseRows({
  status: "PROCESSING",
  phase: "FINALIZING",
  completedUnits: 0,
  totalUnits: 0,
  progressMode: "INDETERMINATE",
});
equal(
  indeterminateSetup[4].progressText,
  "后台仍在继续处理，完成时间暂无法确定。",
  "indeterminate active phase shows the web fallback copy",
);
equal(
  tournamentSetupPhaseRows(null)[0].state,
  "active",
  "missing setup behaves like QUEUED",
);

// --- disclosure labels ---
equal(tournamentGroupModeText("BATTLE_RACES"), "对战", "group mode H2H");
equal(tournamentGroupModeText("POINTS_RACES"), "积分赛", "group mode points");
equal(tournamentGroupModeText(null), "无小组赛", "no group");
equal(tournamentKnockoutModeText("SINGLE_ELIMINATION"), "单败淘汰", "knockout single");
equal(tournamentKnockoutModeText("DOUBLE_ELIMINATION"), "主客场制", "knockout double");
equal(tournamentKnockoutModeText("HEAD_TO_HEAD"), "淘汰赛", "knockout h2h");
equal(tournamentKnockoutModeText("NO_KNOCKOUT"), "无淘汰赛", "no knockout");
equal(tournamentKnockoutModeText(null), "无淘汰赛", "missing knockout");
check(tournamentHasKnockout("SINGLE_ELIMINATION"), "knockout detected");
check(!tournamentHasKnockout("NO_KNOCKOUT"), "NO_KNOCKOUT is not a knockout");
check(!tournamentHasKnockout(null), "missing knockout mode");
equal(tournamentLeagueTypeText("H2H"), "对战", "league type H2H");
equal(tournamentLeagueTypeText("CLASSIC"), "经典联赛", "league type classic");
equal(tournamentEventRangeText(3, 8), "第 3–8 轮", "event range");
equal(tournamentEventRangeText(3, null), "未安排", "unscheduled range");
equal(tournamentEventRangeText(null, null), "未安排", "missing range");

// --- roster search + window (web TournamentRosterList parity) ---
const roster: TournamentParticipantRow[] = Array.from({ length: 25 }, (_, i) => ({
  entryId: i + 1,
  entryName: `球队${i + 1}`,
  playerName: i === 24 ? "Tong" : `经理${i + 1}`,
}));
equal(filterTournamentRoster(roster, "").length, 25, "empty query keeps all");
equal(filterTournamentRoster(roster, "tong").length, 1, "manager substring match");
equal(filterTournamentRoster(roster, "球队10").length, 1, "name substring match");
equal(filterTournamentRoster(roster, "25").length, 1, "entry id substring match");
equal(
  filterTournamentRoster(roster, "  tong  ").length,
  1,
  "query trims whitespace",
);
const windowed = visibleTournamentRoster(roster, 20, 25);
equal(windowed.length, 21, "viewer pinned beyond the window");
equal(windowed[20].entryId, 25, "viewer appended at the end");
const windowedInView = visibleTournamentRoster(roster, 20, 5);
equal(windowedInView.length, 20, "viewer already visible is not duplicated");
const windowedNoViewer = visibleTournamentRoster(roster, 20, null);
equal(windowedNoViewer.length, 20, "no viewer keeps the plain window");
const windowedSmall = visibleTournamentRoster(roster.slice(0, 5), 20, 3);
equal(windowedSmall.length, 5, "window larger than the list keeps all rows");

console.log("official-h2h tests passed");
