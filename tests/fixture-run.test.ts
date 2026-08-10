import {
  buildFixtureRuns,
  maxFixtureEvent,
  normalizeHorizon,
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

function main(): void {
  testHomeAwayAttribution();
  testWindowTruncation();
  testHorizonClamping();
  testEventGapsNotFabricated();
  testDoubleGameweekKeepsBoth();
  testFinishedPassthrough();
  testEmptyAndStringIds();
  testMaxFixtureEvent();
  console.log("fixture-run tests passed");
}

main();
