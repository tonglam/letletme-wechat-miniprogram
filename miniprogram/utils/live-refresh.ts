import type {
  LiveMatchdayStatus,
  LiveSnapshotStatus,
} from "../models/live";

export const LIVE_REFRESH_INTERVAL_MS = 30_000;

const contentRevision = (snapshot: LiveSnapshotStatus): string =>
  [
    snapshot.revisions?.scoreCore ?? snapshot.scoreCoreRevision ?? "",
    snapshot.revisions?.lifecycle ?? "",
    snapshot.revisions?.fixtureIdentity ?? "",
    snapshot.revisions?.displayStats ?? "",
    snapshot.revisions?.picksBase ?? "",
    snapshot.revisions?.officialAdjustment ?? "",
    snapshot.revisions?.previousTotals ?? "",
    snapshot.revisions?.finalResult ?? "",
  ].join(":");

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

export function liveMatchdayNeedsRefresh(
  accepted?: LiveMatchdayStatus | null,
  observed?: LiveMatchdayStatus | null,
): boolean {
  if (!accepted || !observed) return true;
  return (
    accepted.eventId !== observed.eventId ||
    accepted.revisions.lifecycle !== observed.revisions.lifecycle ||
    accepted.revisions.fixtureIdentity !==
      observed.revisions.fixtureIdentity ||
    accepted.revisions.scoreState !== observed.revisions.scoreState ||
    accepted.revisions.playerDetail !== observed.revisions.playerDetail
  );
}

export function shouldPollLiveMatchday(options: {
  pageVisible: boolean;
  currentEventId?: number;
  selectedEventId?: number;
  snapshot?: LiveMatchdayStatus | null;
}): boolean {
  const { pageVisible, currentEventId, selectedEventId, snapshot } = options;
  if (!pageVisible || !currentEventId || selectedEventId !== currentEventId)
    return false;
  // Keep the recovery loop alive when no publication has been accepted yet.
  // A missing snapshot is a pending/unavailable state, not a terminal one.
  if (!snapshot) return true;
  if (snapshot.eventId !== selectedEventId) return false;
  const nextRefreshAt = snapshot.times.nextRefreshAt;
  if (nextRefreshAt && Number.isFinite(Date.parse(nextRefreshAt))) return true;
  return snapshot.state !== "FINALIZED";
}

export function shouldRevalidateCachedLiveMatchday(
  options: Parameters<typeof shouldPollLiveMatchday>[0] & {
    servedStoredAt?: number;
  },
): boolean {
  const { servedStoredAt, ...pollOptions } = options;
  return servedStoredAt !== undefined && shouldPollLiveMatchday(pollOptions);
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
  const effectiveState = windowState ?? snapshot.state;
  if (nextRefreshAt && Number.isFinite(Date.parse(nextRefreshAt))) return true;
  if (effectiveState === "OFFSEASON") return false;
  if (effectiveState === "BETWEEN_GAMEWEEKS") return false;
  return !["FINALIZED", "OFFSEASON", "BETWEEN_GAMEWEEKS"].includes(
    effectiveState,
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
