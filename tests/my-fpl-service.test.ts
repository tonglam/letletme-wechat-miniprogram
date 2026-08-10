import { mergeMyFplTeamBrief } from "../miniprogram/services/my-fpl.service";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const ENTRY = { entryName: "我的队", playerName: "玩家", overallPoints: 1800, overallRank: 500000 };

function testBothReadsMerge(): void {
  const brief = mergeMyFplTeamBrief(ENTRY, { eventPoints: 66, overallPoints: 1810, overallRank: 490000 });
  assert(brief !== null, "merged brief exists");
  assertEqual(brief?.entryName, "我的队", "identity comes from entry info");
  assertEqual(brief?.eventPoints, 66, "event points come from the event result");
  assertEqual(brief?.overallPoints, 1810, "event result wins for fresher overall points");
  assertEqual(brief?.overallRank, 490000, "event result wins for fresher overall rank");
}

function testEntryOnlyPartial(): void {
  const brief = mergeMyFplTeamBrief(ENTRY, null);
  assert(brief !== null, "entry-only partial failure still yields a brief");
  assertEqual(brief?.eventPoints, undefined, "missing event result leaves event points absent");
  assertEqual(brief?.overallPoints, 1800, "entry info supplies overall points");
}

function testEventResultOnlyPartial(): void {
  const brief = mergeMyFplTeamBrief(null, { eventPoints: 55 });
  assert(brief !== null, "event-result-only partial failure still yields a brief");
  assertEqual(brief?.eventPoints, 55, "event points survive without identity");
  assertEqual(brief?.entryName, undefined, "identity stays absent");
}

function testTotalFailure(): void {
  assertEqual(mergeMyFplTeamBrief(null, null), null, "total failure returns null for last-good retention");
}

function testGarbageNumbersDropped(): void {
  const brief = mergeMyFplTeamBrief(ENTRY, {
    eventPoints: Number.NaN,
    overallPoints: null,
    overallRank: undefined
  });
  assertEqual(brief?.eventPoints, undefined, "NaN is not a number");
  assertEqual(brief?.overallPoints, 1800, "null event-result points fall back to entry info");
  assertEqual(brief?.overallRank, 500000, "undefined event-result rank falls back to entry info");
}

function main(): void {
  testBothReadsMerge();
  testEntryOnlyPartial();
  testEventResultOnlyPartial();
  testTotalFailure();
  testGarbageNumbersDropped();
  console.log("my-fpl-service tests passed");
}

main();
