import type { LiveSnapshotStatus } from "../models/live";

export const LIVE_REFRESH_INTERVAL_MS = 30_000;

const contentRevision = (snapshot: LiveSnapshotStatus): string =>
  snapshot.revisions?.scoreCore ?? snapshot.scoreCoreRevision ?? "";

export function liveSnapshotNeedsRefresh(
  accepted?: LiveSnapshotStatus | null,
  observed?: LiveSnapshotStatus | null,
): boolean {
  if (!accepted || !observed) return true;
  return (
    accepted.eventId !== observed.eventId ||
    contentRevision(accepted) !== contentRevision(observed)
  );
}

/** Only the server's next-refresh deadline controls score polling. */
export function shouldPollLiveSnapshot(options: {
  pageVisible: boolean;
  currentEventId?: number;
  selectedEventId?: number;
  snapshot?: LiveSnapshotStatus | null;
  windowState?: string | null;
  nextRefreshAt?: string | null;
}): boolean {
  const {
    pageVisible,
    currentEventId,
    selectedEventId,
    snapshot,
    windowState,
    nextRefreshAt,
  } = options;
  if (!pageVisible || !currentEventId || selectedEventId !== currentEventId)
    return false;
  if (!snapshot || snapshot.eventId !== selectedEventId) return true;
  if (windowState === "OFFSEASON" || windowState === "BETWEEN_GAMEWEEKS")
    return false;
  if (nextRefreshAt && Number.isFinite(Date.parse(nextRefreshAt))) return true;
  return !["FINALIZED", "OFFSEASON", "BETWEEN_GAMEWEEKS"].includes(
    windowState ?? snapshot.state,
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
