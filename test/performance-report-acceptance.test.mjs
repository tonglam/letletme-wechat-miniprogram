import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const artifact = JSON.parse(fs.readFileSync(new URL("docs/architecture/miniprogram-full-page-performance-diagnostic-2026-08-12.artifact.json", root), "utf8"));
const markdown = fs.readFileSync(new URL("docs/architecture/miniprogram-full-page-performance-diagnostic-2026-08-12.md", root), "utf8");
const html = fs.readFileSync(new URL("docs/architecture/miniprogram-full-page-performance-diagnostic-2026-08-12.html", root), "utf8");

test("performance report evidence keeps sampled and final commits explicit", () => {
  const evidence = artifact.evidence;
  assert.equal(evidence.reportStatus, "代码已实施，尚未验收");
  assert.equal(evidence.sampledCodeCommit, "565687c5a0984e5f92c82528080a6d9a9b38d969");
  assert.equal(evidence.finalCodeCommit, "67faafdf9dd20a9e71ba691420c0f7404f8b23a0");
  assert.equal(evidence.graphqlCommit, "75de0566fb4f7cdfa4e94ede58dbcfbf79556415");
  assert.equal(evidence.webCommit, "1ffaf9801c3e679cce4b530ef3a57c0dfd8a147c");
  assert.equal(evidence.graphqlHealth.http, 200);
  assert.equal(evidence.finalHeadTargetedEvidence.reviewThreads.unresolved, "pending");
  for (const document of [markdown, html]) {
    assert.match(document, /代码已实施，尚未验收/);
    assert.match(document, /565687c5a0984e5f92c82528080a6d9a9b38d969/);
    assert.match(document, /67faafdf9dd20a9e71ba691420c0f7404f8b23a0/);
    assert.match(document, /75de0566fb4f7cdfa4e94ede58dbcfbf79556415/);
    assert.match(document, /1ffaf9801c3e679cce4b530ef3a57c0dfd8a147c/);
  }
});

test("performance report refresh summaries agree with raw samples", () => {
  const rows = artifact.snapshot.datasets.raw_p0_refresh;
  const summaryByPage = new Map(artifact.snapshot.datasets.p0.map((row) => [row.page, row]));
  const nearestRank = (values, percentile) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)];
  };
  for (const page of new Set(rows.map((row) => row.page))) {
    const pageRows = rows.filter((row) => row.page === page);
    const visible = pageRows.map((row) => row.primaryVisibleMs);
    const summary = summaryByPage.get(page);
    assert.ok(summary, `missing summary for ${page}`);
    assert.equal(summary.refreshP50Ms, nearestRank(visible, 0.5));
    assert.equal(summary.refreshP95Ms, nearestRank(visible, 0.95));
    assert.equal(summary.refreshMaxMs, Math.max(...visible));
  }
});
