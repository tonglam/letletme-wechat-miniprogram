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
  assert.doesNotMatch(page, /Promise\.all\([^)]*readPlayerValueByDate[^)]*getTeamList/);
});

test("price primary content includes success, empty and error states", () => {
  const template = source("miniprogram/pages/data/price/price.wxml");
  assert.match(template, /id="perf-primary-content"/);
  assert.match(template, /data-status[\s\S]*status="stale"/);
  assert.match(template, /app-error-state[\s\S]*app-empty-state/);
});

test("price warm resume records viewport visibility without refetching", () => {
  const page = source("miniprogram/pages/data/price/price.ts");
  const onShow = page.slice(page.indexOf("onShow()"), page.indexOf("onHide()"));
  assert.match(onShow, /warm-enter/);
  assert.match(onShow, /observePrimary/);
  assert.doesNotMatch(onShow, /loadDailyChanges|readPlayerValueByDate/);
});
