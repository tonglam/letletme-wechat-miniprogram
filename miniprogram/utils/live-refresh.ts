import type {
  LiveMatch,
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
    accepted.season !== observed.season ||
    accepted.eventId !== observed.eventId ||
    accepted.revisions.lifecycle !== observed.revisions.lifecycle ||
    accepted.revisions.fixtureIdentity !==
      observed.revisions.fixtureIdentity ||
    accepted.revisions.scoreState !== observed.revisions.scoreState ||
    (observed.revisions.detailObservation !== null &&
      observed.revisions.detailObservation !==
        accepted.revisions.detailObservation)
  );
}

/**
 * A metadata-only HEAD has no verified player body. Keep the accepted FULL
 * detail as the same-event LKG while accepting newer heartbeat metadata; a
 * changed detail observation remains untouched so the caller performs one
 * FULL reload.
 */
export function mergeLiveMatchdayHeadStatus(
  accepted: LiveMatchdayStatus | null | undefined,
  observed: LiveMatchdayStatus,
): LiveMatchdayStatus {
  if (
    !accepted ||
    accepted.season !== observed.season ||
    accepted.eventId !== observed.eventId
  ) {
    return observed;
  }
  if (
    accepted.revisions.lifecycle !== observed.revisions.lifecycle ||
    accepted.revisions.fixtureIdentity !== observed.revisions.fixtureIdentity ||
    accepted.revisions.scoreState !== observed.revisions.scoreState ||
    (observed.revisions.detailObservation !== null &&
      observed.revisions.detailObservation !==
        accepted.revisions.detailObservation)
  ) {
    return observed;
  }
  const hasAcceptedDetail =
    accepted.revisions.detailPublicationId !== null &&
    accepted.revisions.detailGeneration !== null &&
    accepted.revisions.playerDetail !== null &&
    accepted.detailDelivery.servedFrom !== null &&
    accepted.detailDelivery.state !== "PENDING" &&
    accepted.detailDelivery.state !== "UNAVAILABLE";
  if (!hasAcceptedDetail) return observed;

  const detailDelivery =
    observed.detailDelivery.state === "FINAL"
      ? {
          ...observed.detailDelivery,
          // The HEAD carries only terminal metadata. The player body is still
          // the accepted FULL LKG, so preserve its source provenance while
          // allowing the terminal delivery state to stop recovery polling.
          servedFrom: accepted.detailDelivery.servedFrom,
          reasonCodes: Array.from(
            new Set([
              ...accepted.detailDelivery.reasonCodes,
              ...observed.detailDelivery.reasonCodes,
              "DETAIL_FINAL",
            ]),
          ),
        }
      : observed.revisions.detailObservation === null
        ? {
            ...accepted.detailDelivery,
            state: "DEGRADED" as const,
            reasonCodes: Array.from(
              new Set([
                ...accepted.detailDelivery.reasonCodes,
                ...observed.detailDelivery.reasonCodes,
                "DETAIL_LKG_RETAINED",
              ]),
            ),
          }
        : accepted.detailDelivery;

  return {
    ...observed,
    revisions: {
      ...observed.revisions,
      detailObservation: accepted.revisions.detailObservation,
      detailPublicationId: accepted.revisions.detailPublicationId,
      detailGeneration: accepted.revisions.detailGeneration,
      playerDetail: accepted.revisions.playerDetail,
    },
    times: {
      ...observed.times,
      detailSourceCheckedAt: accepted.times.detailSourceCheckedAt,
      detailContentUpdatedAt: accepted.times.detailContentUpdatedAt,
      detailPublishedAt: accepted.times.detailPublishedAt,
      detailStaleAt: accepted.times.detailStaleAt,
    },
    detailDelivery,
  };
}

/**
 * A FULL response can contain a newer desk while its detail publication is
 * temporarily absent or older. Keep the accepted same-event player rows in
 * that case; the new desk score/lifecycle remains authoritative.
 */
export function shouldRetainAcceptedLiveMatchDetails(
  candidate: Pick<LiveMatchdayStatus, "revisions">,
  accepted: Pick<LiveMatchdayStatus, "revisions">,
): boolean {
  const acceptedRevision = accepted.revisions;
  const candidateRevision = candidate.revisions;
  if (
    acceptedRevision.detailPublicationId === null ||
    acceptedRevision.detailGeneration === null ||
    acceptedRevision.playerDetail === null
  ) {
    return false;
  }
  if (candidateRevision.detailGeneration === null) return true;
  if (candidateRevision.detailGeneration < acceptedRevision.detailGeneration) {
    return true;
  }
  return (
    candidateRevision.detailGeneration === acceptedRevision.detailGeneration &&
    candidateRevision.detailPublicationId !==
      acceptedRevision.detailPublicationId
  );
}

/** Copy only same-fixture player rows from the accepted full LKG. */
export function retainLiveMatchPlayerDetails(
  candidate: readonly LiveMatch[],
  accepted: readonly LiveMatch[],
): LiveMatch[] {
  const acceptedByFixtureId = new Map(
    accepted.map((match) => [String(match.matchId ?? match.id), match]),
  );
  return candidate.map((match) => {
    const previous = acceptedByFixtureId.get(
      String(match.matchId ?? match.id),
    );
    if (!previous) return match;
    return {
      ...match,
      homeTeamDataList: previous.homeTeamDataList,
      awayTeamDataList: previous.awayTeamDataList,
    };
  });
}

/** Carry the exact detail provenance for rows retained from the accepted LKG. */
export function retainLiveMatchdayDetailRevision(
  candidate: LiveMatchdayStatus,
  accepted: LiveMatchdayStatus,
): LiveMatchdayStatus {
  if (!shouldRetainAcceptedLiveMatchDetails(candidate, accepted)) {
    return candidate;
  }
  return {
    ...candidate,
    revisions: {
      ...candidate.revisions,
      detailObservation: accepted.revisions.detailObservation,
      detailPublicationId: accepted.revisions.detailPublicationId,
      detailGeneration: accepted.revisions.detailGeneration,
      playerDetail: accepted.revisions.playerDetail,
    },
    times: {
      ...candidate.times,
      detailSourceCheckedAt: accepted.times.detailSourceCheckedAt,
      detailContentUpdatedAt: accepted.times.detailContentUpdatedAt,
      detailPublishedAt: accepted.times.detailPublishedAt,
      detailStaleAt: accepted.times.detailStaleAt,
    },
    detailDelivery: {
      ...accepted.detailDelivery,
      state: "DEGRADED",
      reasonCodes: Array.from(
        new Set([
          ...accepted.detailDelivery.reasonCodes,
          "DETAIL_REVISION_RETAINED",
        ]),
      ),
    },
  };
}

function compareSeasons(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isSafeInteger(leftNumber) && Number.isSafeInteger(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

/**
 * A fallback publication may be older than the response already painted.
 * Accept only a monotonic same-event candidate so Redis previous or a delayed
 * request cannot roll the page back to an older score/detail pair.
 */
export function canReplaceLiveMatchdayLkg(
  candidate: { snapshot: LiveMatchdayStatus | null },
  accepted?: LiveMatchdayStatus | null,
): boolean {
  if (!candidate.snapshot) return false;
  if (!accepted) return true;
  if (
    candidate.snapshot.season !== accepted.season ||
    candidate.snapshot.eventId !== accepted.eventId
  ) {
    const seasonOrder = compareSeasons(
      candidate.snapshot.season,
      accepted.season,
    );
    return (
      seasonOrder > 0 ||
      (seasonOrder === 0 && candidate.snapshot.eventId > accepted.eventId)
    );
  }

  const candidateRevision = candidate.snapshot.revisions;
  const acceptedRevision = accepted.revisions;
  if (candidateRevision.deskGeneration < acceptedRevision.deskGeneration) {
    return false;
  }
  if (candidateRevision.deskGeneration > acceptedRevision.deskGeneration) {
    return true;
  }
  if (
    candidateRevision.deskPublicationId !== acceptedRevision.deskPublicationId
  ) {
    return false;
  }

  const candidateHasDetail =
    candidateRevision.detailPublicationId !== null &&
    candidateRevision.detailGeneration !== null &&
    candidateRevision.playerDetail !== null;
  const acceptedHasDetail =
    acceptedRevision.detailPublicationId !== null &&
    acceptedRevision.detailGeneration !== null &&
    acceptedRevision.playerDetail !== null;
  if (!candidateHasDetail) {
    if (!acceptedHasDetail) return true;
    return (
      candidateRevision.detailObservation === null ||
      candidateRevision.detailObservation ===
        acceptedRevision.detailObservation
    );
  }
  if (acceptedRevision.detailGeneration === null) return true;
  if (candidateRevision.detailGeneration === null) return false;
  if (
    candidateRevision.detailGeneration < acceptedRevision.detailGeneration
  ) {
    return false;
  }
  if (
    candidateRevision.detailGeneration > acceptedRevision.detailGeneration
  ) {
    return true;
  }
  return (
    candidateRevision.detailPublicationId ===
    acceptedRevision.detailPublicationId
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
  if (
    snapshot.state === "FINALIZED" &&
    snapshot.detailDelivery.state === "FINAL"
  ) {
    return false;
  }
  const nextRefreshAt = snapshot.times.nextRefreshAt;
  if (nextRefreshAt && Number.isFinite(Date.parse(nextRefreshAt))) return true;
  if (snapshot.state === "FINALIZED") {
    // A finalized desk can still be waiting for the exact Match detail
    // publication/checkpoint. Keep the bounded recovery loop alive until
    // detail is final; the server's final publication remains authoritative.
    return snapshot.detailDelivery.state !== "FINAL";
  }
  return true;
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
