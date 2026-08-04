import {
  LIVE_REFRESH_INTERVAL_MS,
  liveSnapshotNeedsRefresh,
  shouldRevalidateCachedLiveSnapshot,
  shouldPollLiveSnapshot
} from "../miniprogram/utils/live-refresh";
import type { LiveSnapshotStatus } from "../miniprogram/models/live";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function snapshot(state: LiveSnapshotStatus["state"]): LiveSnapshotStatus {
  return {
    eventId: 33,
    revision: "a".repeat(24),
    state,
    publishedAt: "2026-08-04T10:00:00.000Z",
    checkedAt: "2026-08-04T10:00:00.000Z"
  };
}

assertEqual(LIVE_REFRESH_INTERVAL_MS, 30_000, "live refresh interval");
assertEqual(shouldPollLiveSnapshot({
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: snapshot("SCHEDULED")
}), true, "scheduled pre-kickoff snapshots keep polling");
assertEqual(shouldPollLiveSnapshot({
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: snapshot("LIVE")
}), true, "live snapshots keep polling");
assertEqual(shouldPollLiveSnapshot({
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: snapshot("SETTLED")
}), false, "settled snapshots stop polling");
assertEqual(shouldPollLiveSnapshot({
  pageVisible: false,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: snapshot("LIVE")
}), false, "hidden pages stop polling");
assertEqual(shouldPollLiveSnapshot({
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 32,
  snapshot: snapshot("LIVE")
}), false, "past gameweeks stop polling");
assertEqual(shouldPollLiveSnapshot({
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: null
}), true, "rolling rollout without metadata remains fresh");
assertEqual(shouldPollLiveSnapshot({
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: { ...snapshot("LIVE"), eventId: 34 }
}), true, "stale metadata does not wedge current-event recovery");
assertEqual(shouldRevalidateCachedLiveSnapshot({
  servedStoredAt: Date.now() - 1_000,
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: snapshot("LIVE")
}), true, "cached current-event payloads revalidate immediately");
assertEqual(shouldRevalidateCachedLiveSnapshot({
  servedStoredAt: undefined,
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: snapshot("LIVE")
}), false, "fresh network payloads do not add a metadata request");
assertEqual(shouldRevalidateCachedLiveSnapshot({
  servedStoredAt: Date.now() - 1_000,
  pageVisible: true,
  currentEventId: 33,
  selectedEventId: 32,
  snapshot: snapshot("LIVE")
}), false, "cached historical payloads do not poll");
assertEqual(shouldRevalidateCachedLiveSnapshot({
  servedStoredAt: Date.now() - 1_000,
  pageVisible: false,
  currentEventId: 33,
  selectedEventId: 33,
  snapshot: snapshot("LIVE")
}), false, "cached payloads wait until a hidden page is shown");
assertEqual(
  liveSnapshotNeedsRefresh(snapshot("LIVE"), {
    ...snapshot("LIVE"),
    checkedAt: "2026-08-04T10:01:00.000Z"
  }),
  false,
  "same producer revision skips heavy refresh"
);
assertEqual(
  liveSnapshotNeedsRefresh(snapshot("LIVE"), {
    ...snapshot("LIVE"),
    revision: "b".repeat(24)
  }),
  true,
  "new producer revision runs heavy refresh"
);
assertEqual(
  liveSnapshotNeedsRefresh(null, snapshot("LIVE")),
  true,
  "missing accepted metadata retries heavy refresh"
);
