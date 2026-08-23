/**
 * My FPL view models (high-level design §4.2/§4.3, client-composed subset).
 * Every field sourced from a backend-gated contract is optional and degrades
 * when absent — never invent coverage, ranks, or associations client-side.
 */
import type { LiveSnapshotState } from "./live";

export type MyFplPhase = "PRESEASON" | "PRE_DEADLINE" | "LIVE" | "SETTLING" | "SETTLED" | "OFFSEASON";

export interface MyFplContext {
  /** False only when season/event metadata could not be read. */
  eventContextAvailable: boolean;
  season?: string;
  currentEvent?: number;
  nextEvent?: number;
  utcDeadline?: string;
  /** Effective read-only viewer team (see models/principal). */
  entryId?: number;
  accountLinked: boolean;
}

export interface MyFplPhaseInput {
  currentEvent?: number;
  nextEvent?: number;
  nextUtcDeadline?: string;
  /** Injected clock — tests control it, callers pass Date.now(). */
  now: number;
  /** Current event's live snapshot state, when already known. */
  snapshotState?: LiveSnapshotState;
  /** Backend-gated server phase; a valid value wins over all derivation. */
  serverPhase?: string;
}

/** Overview primary card and secondary team summary. */
export interface MyFplTeamBrief {
  entryName?: string;
  playerName?: string;
  /** Latest/current gameweek points. */
  eventPoints?: number;
  overallPoints?: number;
  overallRank?: number;
}

/**
 * Official-league list row. viewerRank is populated from EntryLeagues.entryRank.
 */
export interface MyFplLeagueBrief {
  id: number;
  name: string;
  viewerRank?: number;
  associationCount?: number;
}
