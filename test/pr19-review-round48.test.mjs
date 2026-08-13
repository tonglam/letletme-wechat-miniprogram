import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../miniprogram/pages/data/selections/selections.ts", import.meta.url), "utf8");

test("Data Selections preserves forced stats refresh across hide/show", () => {
  assert.match(page, /resumeStatsForceRefresh: false/);
  assert.match(page, /activeStatsForceRefresh: false/);
  assert.match(page, /this\.resumeStatsForceRefresh = this\.resumeStage === "stats"\n\s+&& this\.activeStatsForceRefresh/);
  assert.match(page, /const resumeStatsForceRefresh = this\.resumeStatsForceRefresh/);
  assert.match(page, /loadStats\(resumeStatsForceRefresh, trace\)/);
  assert.match(page, /this\.activeStatsForceRefresh = forceRefresh/);
  assert.match(page, /this\.activeStatsForceRefresh = false;\n\s+this\.setData\(\{ loadingStats: false \}\)/);
});
