import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("price page keeps date identity and stale state while team directory remains secondary", () => {
  const page = source("miniprogram/pages/data/price/price.ts");
  assert.match(page, /readPlayerValueByDate/);
  assert.match(page, /nextRequestRevision\(this\.dailyRequestOwner, "daily"\)/);
  assert.match(page, /isCurrentRevision\(this\.dailyRequestOwner, "daily", revision\)/);
  assert.match(page, /const changeDate = this\.data\.changeDate/);
  assert.match(page, /readPlayerValueByDate\(changeDate/);
  assert.match(page, /staleMessage/);
  assert.match(page, /loadTeamOptions/);
  assert.match(page, /observeSoftTimeout\(readTask, 2900/);
  assert.match(page, /mark\("softFailureAt"\)/);
  assert.match(page, /!this\.pageActive \|\| !isCurrentRevision/);
  const successCommit = page.slice(page.indexOf("const read = await readTask"), page.indexOf("} catch", page.indexOf("const read = await readTask")));
  assert.match(successCommit, /if \(!this\.pageActive \|\| !isCurrentRevision\(this\.dailyRequestOwner, "daily", revision\)\) return/);
  assert.match(page, /\.\.\.splitChanges\(read\.data\),\s*error: ""/);
  assert.doesNotMatch(page, /Promise\.all\([^)]*readPlayerValueByDate[^)]*getTeamList/);
});

test("price primary content includes success, empty and error states", () => {
  const template = source("miniprogram/pages/data/price/price.wxml");
  assert.match(template, /id="perf-primary-content"/);
  assert.match(template, /data-status[\s\S]*status="stale"/);
  assert.match(template, /app-error-state[\s\S]*app-empty-state/);
});

test("price service rejects partial errors before mapping an empty board", () => {
  const service = source("miniprogram/services/price.service.ts");
  const read = service.indexOf("const result = await graphqlRead<PlayerValuesResponse>");
  const guard = service.indexOf("if (result.errors.length > 0)", read);
  const mapping = service.indexOf("data: (result.data.playerValues || [])", read);
  assert.ok(read >= 0 && guard > read && mapping > guard);
});

test("price warm resume only refetches an interrupted stage", () => {
  const page = source("miniprogram/pages/data/price/price.ts");
  const onShow = page.slice(page.indexOf("onShow()"), page.indexOf("onHide()"));
  assert.match(onShow, /warm-enter/);
  assert.match(onShow, /if \(resumeStage === "daily"\)[\s\S]*loadDailyChanges\(resumeStageForceRefresh\)/);
  assert.match(onShow, /if \(resumeStage === "player"\)[\s\S]*ensurePlayerModeReady\(\)/);
  assert.match(onShow, /if \(resumeStage === "history"[\s\S]*loadSelectedPlayerHistory/);
  assert.match(onShow, /wx\.nextTick\(\(\) => tracker\.observePrimary\(selector\)\)/);
});

test("price date changes and retries create an isolated refresh trace", () => {
  const page = source("miniprogram/pages/data/price/price.ts");
  assert.match(page, /onDateChange[\s\S]*?this\.startDailyRefreshTrace\(\)/);
  assert.match(page, /onRetry[\s\S]*?this\.startDailyRefreshTrace\(\)/);
  assert.match(page, /startDailyRefreshTrace[\s\S]*?new PagePerformanceTracker\(this, "pages\/data\/price\/price", "refresh"\)/);
});
