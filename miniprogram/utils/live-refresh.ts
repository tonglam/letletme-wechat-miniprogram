import type { LiveSnapshotStatus } from "../models/live";

export const LIVE_REFRESH_INTERVAL_MS = 30_000;

export function liveSnapshotNeedsRefresh(
  accepted?: LiveSnapshotStatus | null,
  observed?: LiveSnapshotStatus | null
): boolean {
  if (!accepted || !observed) return true;
  return accepted.eventId !== observed.eventId || accepted.revision !== observed.revision;
}

export function shouldPollLiveSnapshot(options: {
  pageVisible: boolean;
  currentEventId?: number;
  selectedEventId?: number;
  snapshot?: LiveSnapshotStatus | null;
}): boolean {
  const { pageVisible, currentEventId, selectedEventId, snapshot } = options;
  if (!pageVisible || !currentEventId || selectedEventId !== currentEventId) {
    return false;
  }
  // Missing or stale metadata must not wedge current-event recovery after a
  // failed gameweek switch or a rolling backend deployment.
  if (!snapshot || snapshot.eventId !== selectedEventId) return true;
  return snapshot.state !== "SETTLED";
}

export function shouldRevalidateCachedLiveSnapshot(options: {
  servedStoredAt?: number;
  pageVisible: boolean;
  currentEventId?: number;
  selectedEventId?: number;
  snapshot?: LiveSnapshotStatus | null;
}): boolean {
  const { servedStoredAt, ...pollOptions } = options;
  return servedStoredAt !== undefined && shouldPollLiveSnapshot(pollOptions);
}
