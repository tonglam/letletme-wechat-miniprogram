import type { MyFplPhase, MyFplPhaseInput } from "../models/my-fpl";
import type { MyFplPrincipalState, PrincipalDisplayInput } from "../models/principal";

const SERVER_PHASES: ReadonlySet<string> = new Set([
  "PRESEASON",
  "PRE_DEADLINE",
  "LIVE",
  "SETTLING",
  "SETTLED",
  "OFFSEASON"
]);

/**
 * Derive the My FPL season phase (high-level design §4.2, plan amendment A5).
 *
 * The server is authoritative when it ships a phase field; until then the
 * client derives from event context plus the already-known live snapshot.
 * There is no SETTLING signal in the current contract (LiveSnapshotState is
 * SCHEDULED/LIVE/SETTLED only), so a passed deadline without a SETTLED
 * snapshot falls back to SETTLING — a "processing" display that must never
 * assert a final result.
 */
export function deriveMyFplPhase(input: MyFplPhaseInput): MyFplPhase {
  if (input.serverPhase && SERVER_PHASES.has(input.serverPhase)) {
    return input.serverPhase as MyFplPhase;
  }

  const currentEvent = Number(input.currentEvent) || 0;
  const nextEvent = Number(input.nextEvent) || 0;
  if (!currentEvent) {
    return nextEvent ? "PRESEASON" : "OFFSEASON";
  }

  if (input.snapshotState === "LIVE") return "LIVE";
  if (input.snapshotState === "SCHEDULED") return "PRE_DEADLINE";
  if (input.snapshotState === "SETTLED") return "SETTLED";

  const deadline = input.nextUtcDeadline ? Date.parse(input.nextUtcDeadline) : NaN;
  if (!Number.isNaN(deadline)) {
    return input.now < deadline ? "PRE_DEADLINE" : "SETTLING";
  }
  // Active event, no snapshot, no deadline: safest reading is "processing",
  // never a claimed final.
  return "SETTLING";
}

/**
 * Derive the principal display state (plan amendment A2). OFFLINE_CACHED
 * wins so offline launches still show last-good content instead of a
 * misleading NO_FOLLOW or error surface.
 */
export function derivePrincipalDisplay(input: PrincipalDisplayInput): MyFplPrincipalState {
  if (!input.online && input.hasCachedContent) {
    return "OFFLINE_CACHED";
  }
  return input.entryId ? "READY" : "NO_FOLLOW";
}
