import {
  clearPerf,
  durationBucket,
  getPerf,
  recordApi,
  recordLiveTransition
} from "../miniprogram/utils/perf";

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

const store = new Map<string, unknown>();
let setStorageThrows = false;

(globalThis as { wx?: unknown }).wx = {
  getStorageSync: (key: string) => store.get(key),
  setStorage: ({ key, data }: { key: string; data: unknown }) => {
    if (setStorageThrows) {
      throw new Error("storage full");
    }
    store.set(key, data);
  },
  removeStorage: ({ key }: { key: string }) => {
    store.delete(key);
  }
};

function testLegacyCacheWithoutLiveTransitions(): void {
  // Seed storage with the pre-WP6 shape before perf.ts reads it: no
  // liveTransitions field at all. Recording must upgrade it in place.
  store.set("perf:v1", { apiRecords: [{ name: "x", duration: 1, ok: true, ts: 1 }] });
  recordLiveTransition({ surface: "entry", eventId: 33, displayState: "fresh" });
  const perf = getPerf();
  assertEqual(perf.apiRecords.length, 1, "legacy api records survive the upgrade");
  assertEqual(perf.liveTransitions?.length, 1, "legacy cache gains a transitions list");
  assertEqual(perf.liveTransitions?.[0].surface, "entry", "recorded surface is kept");
  clearPerf();
}

function testRoundTrip(): void {
  recordLiveTransition({
    surface: "tournament",
    season: "2025-26",
    eventId: 33,
    isCurrentEvent: true,
    snapshotState: "LIVE",
    revisionChanged: true,
    coverageFailed: 2,
    retainedRowCount: 5,
    probeDurationBucket: "<500ms",
    fullFetchDurationBucket: "1-2s"
  });
  const perf = getPerf();
  assertEqual(perf.liveTransitions?.length, 1, "one transition is stored");
  const record = perf.liveTransitions?.[0];
  assertEqual(record?.surface, "tournament", "surface round-trips");
  assertEqual(record?.retainedRowCount, 5, "retained row count round-trips");
  assertEqual(record?.revisionChanged, true, "revision flag round-trips");
  assert(typeof record?.ts === "number" && record.ts > 0, "a timestamp is attached");
  clearPerf();
}

function testRingBufferCap(): void {
  for (let i = 0; i < 105; i += 1) {
    recordLiveTransition({ surface: "match", eventId: i });
  }
  const perf = getPerf();
  assertEqual(perf.liveTransitions?.length, 100, "transitions are capped at 100");
  assertEqual(perf.liveTransitions?.[0].eventId, 5, "oldest records are dropped first");
  assertEqual(perf.liveTransitions?.[99].eventId, 104, "newest record is kept");
  clearPerf();
}

function testFlushFailureNeverThrows(): void {
  setStorageThrows = true;
  try {
    recordLiveTransition({ surface: "entry" });
    recordApi("probe", 1, true);
  } finally {
    setStorageThrows = false;
  }
  // In-memory cache still holds the record even though persistence failed.
  assertEqual(getPerf().liveTransitions?.length, 1, "in-memory record survives a flush failure");
  clearPerf();
}

function testDurationBucketBoundaries(): void {
  assertEqual(durationBucket(0), "<500ms", "0ms bucket");
  assertEqual(durationBucket(499), "<500ms", "499ms bucket");
  assertEqual(durationBucket(500), "0.5-1s", "500ms bucket");
  assertEqual(durationBucket(999), "0.5-1s", "999ms bucket");
  assertEqual(durationBucket(1000), "1-2s", "1000ms bucket");
  assertEqual(durationBucket(2000), "2-5s", "2000ms bucket");
  assertEqual(durationBucket(5000), ">5s", "5000ms bucket");
}

function main(): void {
  testLegacyCacheWithoutLiveTransitions();
  testRoundTrip();
  testRingBufferCap();
  testFlushFailureNeverThrows();
  testDurationBucketBoundaries();
  console.log("perf-live tests passed");
}

main();
