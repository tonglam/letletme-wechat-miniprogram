import { clearPerf, getPerf, recordMyFplVisit } from "../miniprogram/utils/perf";

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
  recordMyFplVisit({
    surface: "overview",
    principalState: "READY",
    phase: "LIVE",
    eventId: 33,
    cacheOutcome: "last-good",
    durationBucket: "<500ms"
  });
  recordMyFplVisit({ surface: "leagues", handoffActionType: "LEAGUE_PREPARE" });
  const visits = getPerf().myFplVisits;
  assertEqual(visits?.length, 2, "two visits are stored");
  assertEqual(visits?.[0].surface, "overview", "overview visit round-trips");
  assertEqual(visits?.[0].cacheOutcome, "last-good", "cache outcome round-trips");
  assertEqual(visits?.[1].handoffActionType, "LEAGUE_PREPARE", "handoff action type round-trips");
  assert(typeof visits?.[0].ts === "number" && visits[0].ts > 0, "a timestamp is attached");
  clearPerf();
}

function testRingBufferCap(): void {
  for (let i = 0; i < 105; i += 1) {
    recordMyFplVisit({ surface: "team", eventId: i });
  }
  const visits = getPerf().myFplVisits;
  assertEqual(visits?.length, 100, "visits are capped at 100");
  assertEqual(visits?.[0].eventId, 5, "oldest records are dropped first");
  clearPerf();
}

function testNoFollowPointerInRecord(): void {
  recordMyFplVisit({ surface: "overview", principalState: "NO_FOLLOW" });
  const visit = getPerf().myFplVisits?.[0];
  assert(visit !== undefined, "visit exists");
  assert(!("entryId" in visit), "the follow pointer is never part of a record");
  assert(!("entryName" in visit), "team names are never part of a record");
  clearPerf();
}

function main(): void {
  testRoundTrip();
  testRingBufferCap();
  testNoFollowPointerInRecord();
  console.log("perf-my-fpl tests passed");
}

main();
