/**
 * My FPL principal display state (high-level design §4.1, plan amendment A2).
 *
 * This is NOT a new binding authority: the entryId follow pointer stays a
 * local display-only preference (see services/auth.service.ts). These states
 * only decide what the My FPL surfaces render — they never gate, rebind, or
 * clear the follow.
 */
export type MyFplPrincipalState = "READY" | "NO_FOLLOW" | "OFFLINE_CACHED";

export interface PrincipalDisplayInput {
  /** Local follow pointer; manual selection or web-verified sync. */
  entryId?: number;
  /** A WeChat API session token exists (account linked on best effort). */
  accountLinked: boolean;
  online: boolean;
  /** Same-context (entryId + event) last-good content exists. */
  hasCachedContent: boolean;
}
