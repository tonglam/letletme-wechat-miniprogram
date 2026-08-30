import type { LiveScore, LiveDeliveryState } from "../models/live";

const validDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

/** A V2 score is renderable only when it is tied to a complete delivery. */
export function traceableLiveScore(score?: LiveScore): LiveScore | undefined {
  if (!score || !score.revisions?.input || !validDate(score.times?.contentUpdatedAt)) {
    return undefined;
  }
  return score.delivery.state === "UNAVAILABLE" || score.source === "UNAVAILABLE"
    ? undefined
    : score;
}

export function liveScoreEventPoints(score?: LiveScore): number | undefined {
  const value = traceableLiveScore(score)?.eventPoints;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function liveScoreNetPoints(score?: LiveScore): number | undefined {
  const value = traceableLiveScore(score)?.netEventPoints;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function liveScoreTotalPoints(score?: LiveScore): number | undefined {
  const value = traceableLiveScore(score);
  return value?.totalScope === "OVERALL" && typeof value.totalPoints === "number" && Number.isFinite(value.totalPoints)
    ? value.totalPoints
    : undefined;
}

export function liveScoreNextRefreshAt(score?: LiveScore): string | undefined {
  const value = score?.times?.nextRefreshAt;
  return validDate(value) ? value : undefined;
}

export function liveScoreDeliveryState(score?: LiveScore): LiveDeliveryState | undefined {
  return traceableLiveScore(score)?.delivery.state;
}
