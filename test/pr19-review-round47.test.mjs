import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../miniprogram/pages/my-fpl/team/team.controller.ts", import.meta.url), "utf8");

test("My FPL tab retries retain force refresh across hide/show", () => {
  assert.match(page, /resumeTabForceRefresh: false/);
  assert.match(page, /tabForceRefreshPending: false/);
  assert.match(page, /this\.resumeTabForceRefresh = this\.resumeTab\n\s+\? this\.resumeTabForceRefresh \|\| this\.tabForceRefreshPending/);
  assert.match(page, /const resumeTabForceRefresh = this\.resumeTabForceRefresh/);
  assert.match(page, /const clearResumeTab = \(\) => \{[\s\S]*this\.resumeTab === resumeTab[\s\S]*this\.resumeTabForceRefresh = false/);
  assert.match(page, /loadTab\(resumeTab, resumeTabForceRefresh, trace\)/);
  assert.match(page, /if \(activeTab\) this\.resumeTab = activeTab/);
  assert.match(page, /loadData\(contextChanged \|\| resumeTabForceRefresh, trace\)/);
  assert.match(page, /await this\.loadData\(contextChanged \|\| resumeTabForceRefresh, trace\)[\s\S]*if \(this\.tabForceRefreshPending \|\| this\.data\.tabLoading\) clearResumeTab\(\)/);
  assert.match(page, /await this\.loadTab\(resumeTab, resumeTabForceRefresh, trace\)[\s\S]*clearResumeTab\(\)/);
  assert.match(page, /this\.tabForceRefreshPending = forceRefresh/);
  assert.match(page, /this\.tabForceRefreshPending = false;\n\s+this\.setData\(\{ tabLoading: false \}\)/);
});
