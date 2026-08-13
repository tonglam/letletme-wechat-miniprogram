import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const artifact = JSON.parse(fs.readFileSync(new URL("docs/architecture/miniprogram-full-page-performance-diagnostic-2026-08-12.artifact.json", root), "utf8"));
const markdown = fs.readFileSync(new URL("docs/architecture/miniprogram-full-page-performance-diagnostic-2026-08-12.md", root), "utf8");
const html = fs.readFileSync(new URL("docs/architecture/miniprogram-full-page-performance-diagnostic-2026-08-12.html", root), "utf8");

test("performance report evidence keeps sampled and final commits explicit", () => {
  const evidence = artifact.evidence;
  assert.equal(evidence.reportStatus, "已修复并验收");
  assert.equal(evidence.sampledCodeCommit, "565687c5a0984e5f92c82528080a6d9a9b38d969");
  assert.equal(evidence.finalCodeCommit, "880373d02fe1d16b2e4c3da95e9ee05dfc2b25ae");
  assert.equal(evidence.graphqlCommit, "75de0566fb4f7cdfa4e94ede58dbcfbf79556415");
  assert.equal(evidence.webCommit, "1ffaf9801c3e679cce4b530ef3a57c0dfd8a147c");
  assert.equal(evidence.graphqlHealth.http, 200);
  assert.equal(evidence.finalHeadTargetedEvidence.reviewThreads.unresolved, 0);
  for (const document of [markdown, html]) {
    assert.match(document, /已修复并验收/);
    assert.match(document, /565687c5a0984e5f92c82528080a6d9a9b38d969/);
    assert.match(document, /880373d02fe1d16b2e4c3da95e9ee05dfc2b25ae/);
    assert.match(document, /75de0566fb4f7cdfa4e94ede58dbcfbf79556415/);
    assert.match(document, /1ffaf9801c3e679cce4b530ef3a57c0dfd8a147c/);
  }
});
