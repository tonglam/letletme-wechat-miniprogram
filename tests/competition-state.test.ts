import {
  adaptEntryTournament,
  adaptEntryTournaments,
  listCountBucket,
  type EntryTournamentRow
} from "../miniprogram/utils/competition-state";

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

function row(partial: Partial<EntryTournamentRow>): EntryTournamentRow {
  return { id: 1, name: "赛事", ...partial };
}

function testIdentityGate(): void {
  assertEqual(adaptEntryTournament(row({ id: 0 })), null, "id 0 is dropped");
  assertEqual(adaptEntryTournament(row({ id: -3 })), null, "negative id is dropped");
  assertEqual(adaptEntryTournament(row({ id: "abc" })), null, "non-numeric id is dropped");
  assertEqual(adaptEntryTournament(row({ id: 1.5 })), null, "non-integer id is dropped");
  assert(adaptEntryTournament(row({ id: "42" })) !== null, "numeric string id adapts");
}

function testLifecycleMapping(): void {
  assertEqual(adaptEntryTournament(row({ state: "ACTIVE" }))?.lifecycle, "ACTIVE", "active passes through");
  assertEqual(adaptEntryTournament(row({ state: "INACTIVE" }))?.lifecycle, "INACTIVE", "inactive passes through");
  assertEqual(adaptEntryTournament(row({ state: "FINISHED" }))?.lifecycle, "FINISHED", "finished passes through");
  assertEqual(adaptEntryTournament(row({ state: "PAUSED" }))?.lifecycle, "UNKNOWN", "an unverified state is never guessed");
  assertEqual(adaptEntryTournament(row({ state: null }))?.lifecycle, "UNKNOWN", "missing state is unknown");
}

function testFormatHintMapping(): void {
  assertEqual(adaptEntryTournament(row({ groupMode: "POINTS_RACES" }))?.formatHint, "POINTS_TABLE", "points races maps to points table");
  assertEqual(
    adaptEntryTournament(row({ groupMode: null, knockoutMode: "SINGLE" }))?.formatHint,
    "KNOCKOUT",
    "a knockout mode without points races maps to knockout"
  );
  assertEqual(adaptEntryTournament(row({ knockoutMode: "NO_KNOCKOUT" }))?.formatHint, "UNKNOWN", "no-knockout alone tells nothing");
  assertEqual(adaptEntryTournament(row({}))?.formatHint, "UNKNOWN", "empty modes stay unknown");
}

function testKindNeverInferred(): void {
  assertEqual(adaptEntryTournament(row({ groupMode: "POINTS_RACES", state: "ACTIVE" }))?.kind, "UNKNOWN",
    "kind is always UNKNOWN from the adapter — never inferred");
}

function testOptionalFields(): void {
  const item = adaptEntryTournament(row({ totalTeamNum: 38, groupStartedEventId: 1, groupEndedEventId: 38 }));
  assertEqual(item?.participantCount, 38, "participant count passes through");
  assertEqual(item?.startedEventId, 1, "group window start passes through");
  const knockout = adaptEntryTournament(row({ knockoutMode: "DOUBLE", knockoutStartedEventId: 30, knockoutEndedEventId: 38 }));
  assertEqual(knockout?.startedEventId, 30, "knockout window fills in when group window is absent");
  assertEqual(adaptEntryTournament(row({ totalTeamNum: 0 }))?.participantCount, undefined, "zero participants is absent, not rank zero");
}

function testOrdering(): void {
  const items = adaptEntryTournaments([
    row({ id: 3, name: "乙", state: "FINISHED" }),
    row({ id: 1, name: "甲", state: "ACTIVE" }),
    row({ id: 2, name: "甲", state: "ACTIVE" }),
    row({ id: 4, name: "丁" })
  ]);
  assertEqual(items.map((i) => i.competitionId).join(","), "1,2,4,3",
    "active first, unknown before finished, id breaks ties within a group");
}

function testBuckets(): void {
  assertEqual(listCountBucket(0), "0", "empty bucket");
  assertEqual(listCountBucket(1), "1", "single bucket");
  assertEqual(listCountBucket(2), "2-5", "small bucket lower edge");
  assertEqual(listCountBucket(5), "2-5", "small bucket upper edge");
  assertEqual(listCountBucket(6), "6-20", "medium bucket lower edge");
  assertEqual(listCountBucket(20), "6-20", "medium bucket upper edge");
  assertEqual(listCountBucket(21), ">20", "large bucket");
}

function main(): void {
  testIdentityGate();
  testLifecycleMapping();
  testFormatHintMapping();
  testKindNeverInferred();
  testOptionalFields();
  testOrdering();
  testBuckets();
  console.log("competition-state tests passed");
}

main();
