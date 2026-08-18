import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Home entry retry uses lifecycle-owned refresh recovery", () => {
  const page = read("miniprogram/pages/home/index/index.ts");
  assert.match(page, /onRetry\(\)[\s\S]*setData\(\{ error: "" \}\)[\s\S]*refreshHome\(\)[\s\S]*startCountdown/);
  assert.match(page, /onHide\(\)[\s\S]*_resumeRefreshOnShow = this\._refreshPending/);
});

test("Home invalidates fixture picker reads on hide and unload", () => {
  const page = read("miniprogram/pages/home/index/index.ts");
  assert.match(page, /onUnload\(\)[\s\S]*_loadRequestId \+= 1[\s\S]*_fixtureGwRequestId \+= 1[\s\S]*_refreshRequestId \+= 1/);
  assert.match(page, /onHide\(\)[\s\S]*_fixtureGwRequestId \+= 1[\s\S]*_refreshRequestId \+= 1/);
  assert.match(page, /_resumeFixtureGwOnShow = this\.data\.fixtureLoading/);
});
