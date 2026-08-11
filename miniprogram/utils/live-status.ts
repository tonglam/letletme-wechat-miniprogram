import type { LiveSnapshotStatus } from "../models/live";

/**
 * The single presentation vocabulary every Live surface renders. Derived
 * from result metadata only — pages never invent their own status words.
 */
export type LiveDisplayState =
  | "scheduled"
  | "fresh"
  | "refreshing"
  | "delayed"
  | "partial"
  | "final"
  | "offline"
  | "unavailable";

export interface LiveDisplayInput {
  snapshot: LiveSnapshotStatus | null;
  /** Any renderable payload (fresh or last-good). */
  hasData: boolean;
  /** Full fetch in flight. */
  loading: boolean;
  /** Revision probe in flight. */
  probing: boolean;
  /** Last refresh/probe error message, "" when the last attempt succeeded. */
  lastError: string;
  online: boolean;
  /** Competition rows that failed inside an otherwise successful payload. */
  partialFailedCount?: number;
}

/**
 * Pure metadata-to-presentation normalization. First match wins — the order
 * encodes the product priorities: never hide last-good content behind a
 * transient error, never call partial data complete, never poll-settle into
 * a stale "refreshing".
 */
export function normalizeLiveDisplayState(input: LiveDisplayInput): LiveDisplayState {
  const {
    snapshot,
    hasData,
    loading,
    probing,
    lastError,
    online,
    partialFailedCount = 0
  } = input;

  if (!online && hasData) return "offline";
  if (!hasData && lastError) return "unavailable";
  if (hasData && partialFailedCount > 0) return "partial";
  if (snapshot?.state === "SETTLED") return "final";
  if (snapshot?.state === "SCHEDULED" && !hasData) return "scheduled";
  if (loading || probing) return "refreshing";
  if (lastError && hasData) return "delayed";
  return "fresh";
}
