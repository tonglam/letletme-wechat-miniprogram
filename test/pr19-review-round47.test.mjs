import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../miniprogram/pages/my-fpl/team/team.ts", import.meta.url), "utf8");

test("My FPL tab retries retain force refresh across hide/show", () => {
  assert.match(page, /resumeTabForceRefresh: false/);
  assert.match(page, /tabForceRefreshPending: false/);
  assert.match(page, /this\.resumeTabForceRefresh = this\.resumeTab\n\s+\? this\.resumeTabForceRefresh \|\| this\.tabForceRefreshPending/);
  assert.match(page, /const resumeTabForceRefresh = this\.resumeTabForceRefresh/);
  assert.match(page, /loadTab\(resumeTab, resumeTabForceRefresh, trace\)/);
  assert.match(page, /this\.tabForceRefreshPending = forceRefresh/);
  assert.match(page, /this\.tabForceRefreshPending = false;\n\s+this\.setData\(\{ tabLoading: false \}\)/);
});
