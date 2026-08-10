import { clearPerf, getPerf, recordCompetitionVisit } from "../miniprogram/utils/perf";

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

const store = new Map<string, unknown>();

(globalThis as { wx?: unknown }).wx = {
  getStorageSync: (key: string) => store.get(key),
  setStorage: ({ key, data }: { key: string; data: unknown }) => {
    store.set(key, data);
  },
  removeStorage: ({ key }: { key: string }) => {
    store.delete(key);
  }
};

function testRoundTrip(): void {
  recordCompetitionVisit({
    surface: "list",
    principalState: "READY",
    contractSource: "compat",
    listCountBucket: "2-5",
    cacheOutcome: "fresh",
    durationBucket: "<500ms"
  });
  recordCompetitionVisit({ surface: "list", contractSource: "compat", handoffActionType: "CREATE_COMPETITION" });
  const visits = getPerf().competitionVisits;
  assertEqual(visits?.length, 2, "two visits are stored");
  assertEqual(visits?.[0].listCountBucket, "2-5", "count bucket round-trips");
  assertEqual(visits?.[1].handoffActionType, "CREATE_COMPETITION", "handoff action type round-trips");
  assert(typeof visits?.[0].ts === "number" && visits[0].ts > 0, "a timestamp is attached");
  clearPerf();
}

function testRingBufferCap(): void {
  for (let i = 0; i < 105; i += 1) {
    recordCompetitionVisit({ surface: "list", contractSource: "compat" });
  }
  assertEqual(getPerf().competitionVisits?.length, 100, "visits are capped at 100");
  clearPerf();
}

function testNoCompetitionIdentityInRecord(): void {
  recordCompetitionVisit({ surface: "list", contractSource: "compat", listCountBucket: "1" });
  const visit = getPerf().competitionVisits?.[0];
  assert(visit !== undefined, "visit exists");
  assert(!("competitionId" in visit), "competition IDs never enter a record");
  assert(!("name" in visit), "competition names never enter a record");
  assert(!("entryId" in visit), "the follow pointer never enters a record");
  clearPerf();
}

function main(): void {
  testRoundTrip();
  testRingBufferCap();
  testNoCompetitionIdentityInRecord();
  console.log("perf-competitions tests passed");
}

main();
