// Live match desk tab helpers — mirror the web live/matches tab model
// (lib/live-matches.ts getPreferredLiveMatchesTab + per-tab counts).

export type LiveMatchTabKey = "playing" | "not_start" | "finished";

/** Bucket a raw match status into the desk's three tabs. */
export function liveMatchTabKey(status: unknown): LiveMatchTabKey {
  const normalized = String(status || "not_start").toLowerCase();
  if (normalized === "playing" || normalized === "live") return "playing";
  if (normalized === "finished") return "finished";
  return "not_start";
}

/**
 * Web parity (getPreferredLiveMatchesTab): while the user has not picked a
 * tab, follow the content — live first, then upcoming, then finished.
 */
export function preferredLiveMatchTab(
  statuses: readonly unknown[],
): LiveMatchTabKey {
  const buckets = new Set(statuses.map(liveMatchTabKey));
  if (buckets.has("playing")) return "playing";
  if (buckets.has("not_start")) return "not_start";
  if (buckets.has("finished")) return "finished";
  return "playing";
}

/** Per-tab match counts for the tab labels. */
export function countLiveMatchTabs(
  statuses: readonly unknown[],
): Record<LiveMatchTabKey, number> {
  const counts: Record<LiveMatchTabKey, number> = {
    playing: 0,
    not_start: 0,
    finished: 0,
  };
  statuses.forEach((status) => {
    counts[liveMatchTabKey(status)] += 1;
  });
  return counts;
}
