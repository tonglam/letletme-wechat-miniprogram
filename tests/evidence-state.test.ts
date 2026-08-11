import {
  composeEvidenceLine,
  evidenceClassLabel,
  evidenceTruthLabel
} from "../miniprogram/utils/evidence-state";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function testClassLabels(): void {
  assertEqual(evidenceClassLabel("OFFICIAL_FPL"), "FPL 官方", "official label");
  assertEqual(evidenceClassLabel("VERIFIED_UNDERSTAT"), "Understat 验证", "understat label");
  assertEqual(evidenceClassLabel("EXACT_COHORT"), "精确群体", "exact cohort label");
  assertEqual(evidenceClassLabel("SAMPLED_COHORT"), "抽样群体", "sampled cohort label");
  assertEqual(evidenceClassLabel("ATTRIBUTED_BRIEFING"), "署名来源", "briefing label");
  assertEqual(evidenceClassLabel("UNKNOWN"), "来源未就绪", "unknown stays neutral");
}

function testTruthLabels(): void {
  assertEqual(evidenceTruthLabel("READY"), "", "ready prints nothing");
  assertEqual(evidenceTruthLabel("PARTIAL"), "部分数据", "partial label");
  assertEqual(evidenceTruthLabel("STALE"), "非最新", "stale label");
  assertEqual(evidenceTruthLabel("UNAVAILABLE"), "暂不可用", "unavailable label");
  assertEqual(evidenceTruthLabel("UNKNOWN"), "状态未就绪", "unknown truth stays neutral");
}

function testComposeOrder(): void {
  const line = composeEvidenceLine({
    evidenceClass: "EXACT_COHORT",
    scopeText: "本赛事全部成员",
    exact: true,
    freshnessText: "LetLetMe 计算"
  });
  assertEqual(line, "来源 精确群体 · 范围:本赛事全部成员 · 精确 · LetLetMe 计算", "full line joins in order");
}

function testExactNeverUnverified(): void {
  const withoutExact = composeEvidenceLine({ evidenceClass: "EXACT_COHORT", scopeText: "本赛事全部成员" });
  assert(!withoutExact.includes("精确 ·"), "undefined exact never prints the standalone 精确 segment");
  const explicitFalse = composeEvidenceLine({ evidenceClass: "EXACT_COHORT", exact: false });
  assert(!explicitFalse.includes("精确 ·"), "explicit false never prints 精确 either");
}

function testSampledPrintsSampled(): void {
  const line = composeEvidenceLine({ evidenceClass: "SAMPLED_COHORT", scopeText: "Top 1k" });
  assert(line.includes("抽样"), "a sampled cohort says 抽样, never 精确");
  assert(!line.includes("精确 ·"), "sampled cohort never claims exactness");
}

function testUnknownClassStaysMinimal(): void {
  const line = composeEvidenceLine({
    evidenceClass: "UNKNOWN",
    scopeText: "不该出现",
    exact: true,
    freshnessText: "不该出现"
  });
  assertEqual(line, "来源 来源未就绪", "unknown class renders the neutral wording only");
}

function testOptionalPartsOmitted(): void {
  assertEqual(composeEvidenceLine({ evidenceClass: "OFFICIAL_FPL" }), "来源 FPL 官方", "bare class line");
  const withFreshness = composeEvidenceLine({ evidenceClass: "OFFICIAL_FPL", freshnessText: "每日更新" });
  assertEqual(withFreshness, "来源 FPL 官方 · 每日更新", "freshness appends without scope");
}

function main(): void {
  testClassLabels();
  testTruthLabels();
  testComposeOrder();
  testExactNeverUnverified();
  testSampledPrintsSampled();
  testUnknownClassStaysMinimal();
  testOptionalPartsOmitted();
  console.log("evidence-state tests passed");
}

main();
