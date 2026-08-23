/**
 * My FPL principal display state (high-level design §4.1, plan amendment A2).
 *
 * entryId is the standalone Mini Program viewer target. It enables existing
 * read surfaces but never proves ownership or grants management permissions.
 */
export type MyFplPrincipalState = "READY" | "NO_FOLLOW" | "OFFLINE_CACHED";

export interface PrincipalDisplayInput {
  /** Effective viewer team; manual Mini selection or optional Web sync. */
  entryId?: number;
  /** An optional Web account relation exists. */
  accountLinked: boolean;
  online: boolean;
  /** Same-context (entryId + event) last-good content exists. */
  hasCachedContent: boolean;
}
