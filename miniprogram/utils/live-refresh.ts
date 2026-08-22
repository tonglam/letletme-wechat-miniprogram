import type { LiveSnapshotStatus } from "../models/live";

export const LIVE_REFRESH_INTERVAL_MS = 30_000;

export function liveSnapshotNeedsRefresh(
  accepted?: LiveSnapshotStatus | null,
  observed?: LiveSnapshotStatus | null,
): boolean {
  if (!accepted || !observed) return true;
  return (
    accepted.eventId !== observed.eventId ||
    accepted.revision !== observed.revision ||
    accepted.windowState !== observed.windowState
  );
}

export function shouldPollLiveSnapshot(options: {
  pageVisible: boolean;
  currentEventId?: number;
  selectedEventId?: number;
  snapshot?: LiveSnapshotStatus | null;
  windowState?: string | null;
  nextRefreshAt?: string | null;
  managerScoreState?: string | null;
  managerNextRefreshAt?: string | null;
}): boolean {
  const {
    pageVisible,
    currentEventId,
    selectedEventId,
    snapshot,
    windowState,
    nextRefreshAt,
    managerScoreState,
    managerNextRefreshAt,
  } = options;
  if (!pageVisible || !currentEventId || selectedEventId !== currentEventId) {
    return false;
  }
  // Missing or stale metadata must not wedge current-event recovery after a
  // failed gameweek switch or a rolling backend deployment.
  if (!snapshot || snapshot.eventId !== selectedEventId) return true;
  // PRESEASON retains an upcoming anchor and should use the server's low
  // cadence context deadline so all live desks can switch after the first
  // actual kickoff. Only a true offseason has no useful probe target.
  if (windowState === "OFFSEASON") return false;
  if (managerScoreState === "SETTLING") return true;
  if (managerNextRefreshAt && Number.isFinite(Date.parse(managerNextRefreshAt)))
    return true;
  if (nextRefreshAt && Number.isFinite(Date.parse(nextRefreshAt))) return true;
  if (
    !windowState &&
    !snapshot.windowState &&
    (snapshot.state === "SETTLED" || snapshot.state === "FINALIZED")
  ) {
    return false;
  }
  const resolvedWindowState = windowState ?? snapshot.windowState;
  return (
    resolvedWindowState !== "FINALIZED" &&
    resolvedWindowState !== "BETWEEN_GAMEWEEKS"
  );
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
