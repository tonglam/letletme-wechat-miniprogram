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

export interface LiveMatchTabRow {
  matchId?: number | string;
  id?: number | string;
  status?: string;
  playStatus?: string;
}

/**
 * Web parity (selectLiveMatchEvent fallback): once every core fixture of the
 * displayed event is finished, the useful "not started" view is the NEXT
 * event's fixtures. The live desk already ships them as nextFixtures — append
 * the ones not already in the core list. (The web also pins "today" to
 * Australia/Perth to handle mid-matchday turns; the mini only flips once the
 * whole event is terminal, which needs no timezone math.)
 */
export function appendNextEventRows<T extends LiveMatchTabRow>(
  merged: readonly T[],
  overlay: readonly T[],
): T[] {
  if (
    merged.length === 0 ||
    !merged.every(
      (match) => liveMatchTabKey(match.status || match.playStatus) === "finished",
    )
  ) {
    return [...merged];
  }
  const known = new Set(merged.map((match) => String(match.matchId || match.id)));
  const upcoming = overlay.filter(
    (match) =>
      !known.has(String(match.matchId || match.id)) &&
      liveMatchTabKey(match.status || match.playStatus) === "not_start",
  );
  return upcoming.length > 0 ? [...merged, ...upcoming] : [...merged];
}
