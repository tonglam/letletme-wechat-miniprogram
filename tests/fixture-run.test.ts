import {
  buildFixtureRunCells,
  buildFixtureRuns,
  fixtureWindowEvents,
  maxFixtureEvent,
  normalizeHorizon,
  sortFixtureRuns,
  summarizeFixtureRun,
  type FixtureRun,
  type FixtureRunTeam
} from "../miniprogram/utils/fixture-run";
import type { Fixture } from "../miniprogram/models/common";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const TEAMS: FixtureRunTeam[] = [
  { id: 1, name: "阿森纳", shortName: "ARS" },
  { id: 2, name: "切尔西", shortName: "CHE" },
  { id: 3, name: "利物浦", shortName: "LIV" }
];

function fixture(partial: Partial<Fixture>): Fixture {
  return {
    id: 100,
    event: 1,
    teamId: 1,
    againstTeamId: 2,
    teamShortName: "ARS",
    againstTeamShortName: "CHE",
    homeDifficulty: 3,
    awayDifficulty: 4,
    finished: false,
    ...partial
  };
}

function testHomeAwayAttribution(): void {
  const runs = buildFixtureRuns([fixture({})], TEAMS, 1, 3);
  const ars = runs.find((run) => run.teamId === 1);
  const che = runs.find((run) => run.teamId === 2);
  assert(ars !== undefined && che !== undefined, "both sides produce a run");
  assertEqual(ars.chips.length, 1, "home team sees the fixture");
  assertEqual(ars.chips[0].home, true, "home flag for the home side");
  assertEqual(ars.chips[0].opponentShortName, "CHE", "home side's opponent is the away short name");
  assertEqual(ars.chips[0].difficulty, 3, "home difficulty belongs to the home side");
  assertEqual(che.chips[0].home, false, "away flag for the away side");
  assertEqual(che.chips[0].opponentShortName, "ARS", "away side's opponent is the home short name");
  assertEqual(che.chips[0].difficulty, 4, "away difficulty belongs to the away side");
  const liv = runs.find((run) => run.teamId === 3);
  assertEqual(liv?.chips.length, 0, "an uninvolved team gets no chip — never a fabricated blank");
}

function testWindowTruncation(): void {
  const fixtures = [1, 2, 3, 4, 5, 6].map((event) =>
    fixture({ id: 100 + event, event, teamId: 1, againstTeamId: 2 })
  );
  const runs = buildFixtureRuns(fixtures, TEAMS, 2, 3);
  const ars = runs.find((run) => run.teamId === 1);
  assert(ars !== undefined, "run exists");
  assertEqual(ars.chips.length, 3, "the window caps at horizon events");
  assertEqual(ars.chips[0].event, 2, "window starts at the chosen event");
  assertEqual(ars.chips[2].event, 4, "window ends at start + horizon - 1");
}

function testHorizonClamping(): void {
  assertEqual(normalizeHorizon(5), 5, "five stays five");
  assertEqual(normalizeHorizon(3), 3, "three stays three");
  assertEqual(normalizeHorizon(8), 8, "eight stays eight — web FDR_HORIZONS");
  assertEqual(normalizeHorizon(4), 3, "anything else clamps to three");
  assertEqual(normalizeHorizon(0), 3, "zero clamps to three");
}

function testEventGapsNotFabricated(): void {
  const fixtures = [fixture({ id: 101, event: 1 }), fixture({ id: 103, event: 3 })];
  const runs = buildFixtureRuns(fixtures, TEAMS, 1, 3);
  const ars = runs.find((run) => run.teamId === 1);
  assert(ars !== undefined, "run exists");
  assertEqual(ars.chips.length, 2, "a missing event contributes no chip");
  assertEqual(ars.chips[1].event, 3, "the surviving chip keeps its real event");
}

function testDoubleGameweekKeepsBoth(): void {
  const fixtures = [
    fixture({ id: 101, event: 2, againstTeamId: 2, againstTeamShortName: "CHE" }),
    fixture({ id: 102, event: 2, againstTeamId: 3, againstTeamShortName: "LIV" })
  ];
  const runs = buildFixtureRuns(fixtures, TEAMS, 2, 3);
  const ars = runs.find((run) => run.teamId === 1);
  assertEqual(ars?.chips.length, 2, "a double gameweek shows both real fixtures");
  assertEqual(ars?.chips[1].opponentShortName, "LIV", "second fixture ordered by id within the event");
}

function testFinishedPassthrough(): void {
  const runs = buildFixtureRuns([fixture({ finished: true })], TEAMS, 1, 3);
  const ars = runs.find((run) => run.teamId === 1);
  assertEqual(ars?.chips[0].finished, true, "finished passes through");
  const missing = buildFixtureRuns([fixture({ finished: undefined })], TEAMS, 1, 3);
  assertEqual(missing.find((run) => run.teamId === 1)?.chips[0].finished, false, "missing finished reads as not finished");
}

function testEmptyAndStringIds(): void {
  assertEqual(buildFixtureRuns([], TEAMS, 1, 3).every((run) => run.chips.length === 0), true, "no fixtures, no chips");
  assertEqual(buildFixtureRuns([fixture({})], [], 1, 3).length, 0, "no teams, no runs");
  const stringIds = buildFixtureRuns([fixture({ teamId: "1" as unknown as number })], TEAMS, 1, 3);
  assertEqual(stringIds.find((run) => run.teamId === 1)?.chips.length, 1, "string team ids still match");
}

function testMaxFixtureEvent(): void {
  assertEqual(maxFixtureEvent([]), 0, "empty yields zero");
  assertEqual(maxFixtureEvent([fixture({ event: 3 }), fixture({ event: 38 }), fixture({ event: undefined })]), 38, "max ignores missing events");
}

function testFixtureWindowEvents(): void {
  assertEqual(JSON.stringify(fixtureWindowEvents(12, 3)), "[12,13,14]", "three-event window is exact");
  assertEqual(JSON.stringify(fixtureWindowEvents(36, 5)), "[36,37,38]", "window never crosses GW38");
}

function testRunCellsMarkBlanksAndDoubles(): void {
  const fixtures = [
    fixture({ id: 101, event: 1 }),
    fixture({ id: 102, event: 3, againstTeamId: 2, againstTeamShortName: "CHE" }),
    fixture({ id: 103, event: 3, againstTeamId: 3, againstTeamShortName: "LIV" })
  ];
  const ars = buildFixtureRuns(fixtures, TEAMS, 1, 3).find((run) => run.teamId === 1);
  assert(ars !== undefined, "run exists");
  const cells = buildFixtureRunCells(ars, 1, 3);
  assertEqual(cells.length, 3, "one cell per event in the window");
  assertEqual(cells[0].blank, false, "GW1 has a fixture");
  assertEqual(cells[1].blank, true, "GW2 without a fixture is a blank (BGW)");
  assertEqual(cells[1].double, false, "a blank is not a double");
  assertEqual(cells[2].double, true, "GW3 with two fixtures is a double (DGW)");
  assertEqual(cells[2].chips.length, 2, "both double-gameweek chips survive");
}

function summarize(teamId: number, chips: FixtureRun["chips"]): ReturnType<typeof summarizeFixtureRun> {
  return summarizeFixtureRun({ teamId, teamName: `T${teamId}`, teamShortName: `T${teamId}`, chips });
}

function testSummarizeMirrorsWebThresholds(): void {
  const summary = summarize(1, [
    { event: 1, opponentShortName: "A", home: true, difficulty: 2, finished: false },
    { event: 2, opponentShortName: "B", home: false, difficulty: 4, finished: false },
    { event: 3, opponentShortName: "C", home: true, difficulty: 5, finished: false }
  ]);
  assertEqual(summary.avgFdr, 11 / 3, "average over known difficulties");
  assertEqual(summary.easyCount, 1, "difficulty 2 counts as easy (web FDR_EASY_MAX)");
  assertEqual(summary.hardCount, 2, "difficulty 4 and 5 count as hard (web FDR_HARD_MIN)");
  assertEqual(summary.next?.opponentShortName, "A", "next is the first fixture of the window");
  const unknown = summarize(2, [
    { event: 1, opponentShortName: "A", home: true, finished: false }
  ]);
  assertEqual(unknown.avgFdr, null, "no known difficulty means no average");
  assertEqual(unknown.easyCount, 0, "unknown difficulty never counts as easy");
  const empty = summarize(3, []);
  assertEqual(empty.next, null, "an empty run has no next fixture");
}

function testSortByAggregateDifficulty(): void {
  const easy = { teamId: 1, teamName: "Easy", teamShortName: "E", chips: [
    { event: 1, opponentShortName: "A", home: true, difficulty: 2, finished: false }
  ] };
  const hard = { teamId: 2, teamName: "Hard", teamShortName: "H", chips: [
    { event: 1, opponentShortName: "B", home: true, difficulty: 5, finished: false }
  ] };
  const unknown = { teamId: 3, teamName: "Unknown", teamShortName: "U", chips: [
    { event: 1, opponentShortName: "C", home: true, finished: false }
  ] };
  const easiest = sortFixtureRuns([hard, unknown, easy], "easiest");
  assertEqual(JSON.stringify(easiest.map((run) => run.teamId)), "[1,2,3]", "easiest first, unknown averages last");
  const hardest = sortFixtureRuns([easy, unknown, hard], "hardest");
  assertEqual(JSON.stringify(hardest.map((run) => run.teamId)), "[2,1,3]", "hardest first, unknown averages last");
}

function main(): void {
  testHomeAwayAttribution();
  testWindowTruncation();
  testHorizonClamping();
  testEventGapsNotFabricated();
  testDoubleGameweekKeepsBoth();
  testFinishedPassthrough();
  testEmptyAndStringIds();
  testMaxFixtureEvent();
  testFixtureWindowEvents();
  testRunCellsMarkBlanksAndDoubles();
  testSummarizeMirrorsWebThresholds();
  testSortByAggregateDifficulty();
  console.log("fixture-run tests passed");
}

main();
