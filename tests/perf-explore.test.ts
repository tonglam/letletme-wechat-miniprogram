import { clearPerf, getPerf, recordExploreVisit } from "../miniprogram/utils/perf";

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
  recordExploreVisit({ surface: "overview", contractSource: "compat", durationBucket: "<500ms" });
  recordExploreVisit({
    surface: "fixtures",
    contractSource: "compat",
    eventId: 12,
    horizon: 5,
    cacheOutcome: "last-good",
    durationBucket: "1-2s"
  });
  const visits = getPerf().exploreVisits;
  assertEqual(visits?.length, 2, "two visits are stored");
  assertEqual(visits?.[0].surface, "overview", "overview surface round-trips");
  assertEqual(visits?.[1].eventId, 12, "the fixtures window start round-trips");
  assertEqual(visits?.[1].horizon, 5, "the horizon round-trips");
  assert(typeof visits?.[0].ts === "number" && visits[0].ts > 0, "a timestamp is attached");
  clearPerf();
}

function testRingBufferCap(): void {
  for (let i = 0; i < 105; i += 1) {
    recordExploreVisit({ surface: "fixtures", contractSource: "compat" });
  }
  assertEqual(getPerf().exploreVisits?.length, 100, "visits are capped at 100");
  clearPerf();
}

function testNoIdentityInRecord(): void {
  recordExploreVisit({ surface: "overview", contractSource: "compat" });
  const visit = getPerf().exploreVisits?.[0];
  assert(visit !== undefined, "visit exists");
  // High-level design §16: full search text is never logged, and entity
  // names are identifiers in disguise.
  assert(!("keyword" in visit), "search text never enters a record");
  assert(!("searchText" in visit), "search text never enters a record");
  assert(!("teamName" in visit), "team names never enter a record");
  assert(!("playerName" in visit), "player names never enter a record");
  assert(!("entryId" in visit), "the follow pointer never enters a record");
  clearPerf();
}

function main(): void {
  testRoundTrip();
  testRingBufferCap();
  testNoIdentityInRecord();
  console.log("perf-explore tests passed");
}

main();
