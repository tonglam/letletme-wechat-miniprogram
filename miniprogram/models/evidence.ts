/**
 * Evidence labeling models (high-level design §4.1, plan §4.1).
 *
 * The full EvidenceContext contract (coverage / revision / methodVersion /
 * limitations[]) is backend-gated (plan §10). Until it ships, pages only
 * attach labels the client can actually verify — an unknown coverage is
 * never dressed up as a complete one (plan A6).
 */
export type EvidenceClass =
  | "OFFICIAL_FPL"
  | "VERIFIED_UNDERSTAT"
  | "EXACT_COHORT"
  | "SAMPLED_COHORT"
  | "ATTRIBUTED_BRIEFING"
  | "UNKNOWN";

export type EvidenceTruth = "READY" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "UNKNOWN";

/** Client-verifiable subset of EvidenceContext; contract fields arrive
 * backend-gated. Every field beyond the class is optional — absence means
 * "not verified", never "complete". */
export interface EvidenceLabel {
  evidenceClass: EvidenceClass;
  /** e.g. "本赛事全部成员" — only when the cohort boundary is known. */
  scopeText?: string;
  /** Set true only when exactness is verifiable; anything else never
   * renders the word 精确. */
  exact?: boolean;
  /** e.g. "每日更新" — a static, known refresh cadence. */
  freshnessText?: string;
}
