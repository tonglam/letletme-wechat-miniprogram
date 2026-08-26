import type { LiveManagerScore } from "../models/live";

function hasRevision(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCheckedAt(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * Only a revisioned official event/live score, or a finalized official result,
 * may be promoted to a public manager score. Summary, Classic, and H2H feeds
 * remain useful metadata/reconciliation inputs but are not live-score sources.
 */
export function traceableOfficialManagerScore(
  score?: LiveManagerScore,
): LiveManagerScore | undefined {
  if (!score || !hasRevision(score.revision) || !hasCheckedAt(score.checkedAt)) {
    return undefined;
  }

  if (
    score.source === "FPL_EVENT_LIVE" &&
    (score.state === "FRESH" ||
      score.state === "STALE" ||
      score.state === "SETTLING")
  ) {
    return score;
  }

  if (score.source === "FPL_FINAL_RESULT" && score.state === "FINAL") {
    return score;
  }

  return undefined;
}

export function officialManagerEventPoints(
  score?: LiveManagerScore,
): number | undefined {
  const traceable = traceableOfficialManagerScore(score);
  return typeof traceable?.eventPoints === "number" &&
    Number.isFinite(traceable.eventPoints)
    ? traceable.eventPoints
    : undefined;
}

export function officialManagerNetPoints(
  score?: LiveManagerScore,
): number | undefined {
  const traceable = traceableOfficialManagerScore(score);
  return typeof traceable?.netEventPoints === "number" &&
    Number.isFinite(traceable.netEventPoints)
    ? traceable.netEventPoints
    : undefined;
}

export function officialManagerTotalPoints(
  score?: LiveManagerScore,
): number | undefined {
  const traceable = traceableOfficialManagerScore(score);
  return traceable?.totalScope === "OVERALL" &&
    typeof traceable.totalPoints === "number" &&
    Number.isFinite(traceable.totalPoints)
    ? traceable.totalPoints
    : undefined;
}

/** Scheduling metadata is safe to retain without promoting untraceable score values. */
export function managerScoreNextRefreshAt(
  score?: LiveManagerScore,
): string | undefined {
  const value = score?.nextRefreshAt;
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : undefined;
}
