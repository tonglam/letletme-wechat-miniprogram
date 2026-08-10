import type { EvidenceClass, EvidenceLabel, EvidenceTruth } from "../models/evidence";

/**
 * Evidence label composition (plan §4.2). Pure and wx-free.
 *
 * The golden rule (high-level design §4.1): unknown coverage is not complete
 * coverage. Anything the client cannot verify degrades to a neutral wording —
 * never a guessed one.
 */

const CLASS_LABELS: Record<EvidenceClass, string> = {
  OFFICIAL_FPL: "FPL 官方",
  VERIFIED_UNDERSTAT: "Understat 验证",
  EXACT_COHORT: "精确群体",
  SAMPLED_COHORT: "抽样群体",
  ATTRIBUTED_BRIEFING: "署名来源",
  UNKNOWN: "来源未就绪"
};

export function evidenceClassLabel(cls: EvidenceClass): string {
  return CLASS_LABELS[cls] ?? CLASS_LABELS.UNKNOWN;
}

export function evidenceTruthLabel(truth: EvidenceTruth): string {
  switch (truth) {
    case "READY":
      return "";
    case "PARTIAL":
      return "部分数据";
    case "STALE":
      return "非最新";
    case "UNAVAILABLE":
      return "暂不可用";
    default:
      return "状态未就绪";
  }
}

/**
 * Composes a single footer line: 来源 · 范围 · 精确/抽样 · 更新节奏.
 * UNKNOWN-class labels render the neutral class wording only; 精确 appears
 * exclusively when `exact === true` — undefined/false never prints it.
 */
export function composeEvidenceLine(label: EvidenceLabel): string {
  const parts: string[] = [`来源 ${evidenceClassLabel(label.evidenceClass)}`];
  if (label.evidenceClass === "UNKNOWN") {
    return parts[0];
  }
  if (label.scopeText) {
    parts.push(`范围:${label.scopeText}`);
  }
  if (label.exact === true) {
    parts.push("精确");
  } else if (label.evidenceClass === "SAMPLED_COHORT") {
    parts.push("抽样");
  }
  if (label.freshnessText) {
    parts.push(label.freshnessText);
  }
  return parts.join(" · ");
}
