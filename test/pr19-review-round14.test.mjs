import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("disconnected page trackers are terminal for late callbacks", () => {
  const tracker = source("miniprogram/utils/page-performance.ts");
  assert.match(tracker, /private disconnected = false/);
  assert.match(tracker, /mark\([\s\S]*?if \(this\.disconnected\) return;/);
  assert.match(tracker, /observePrimary[\s\S]*?if \(this\.disconnected \|\| this\.visibleRecorded\) return;/);
  assert.match(tracker, /disconnect\(\): void \{\s+this\.disconnected = true;/);
});

test("Live Entry background timeout and error paths only use the captured tracker", () => {
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(entry, /observeSoftTimeout[\s\S]*?navigationTracker\?\.mark\("softFailureAt"\)/);
  assert.match(entry, /catch \(error\)[\s\S]*?wx\.nextTick\(\(\) => navigationTracker\?\.observePrimary\(\)\)/);
});

test("Live Entry delayed transfer reads retain their originating trace", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  const service = source("miniprogram/services/entry.service.ts");
  assert.match(page, /this\.loadTransfers\([\s\S]*?options\.forceRefresh === true,[\s\S]*?requestTrace/);
  assert.match(page, /async loadTransfers[\s\S]*?trace\?: PageRequestTrace \| null[\s\S]*?getEntryEventTransfers\([\s\S]*?trace/);
  assert.match(service, /getEntryEventTransfers[\s\S]*?trace\?: PageRequestTrace \| null[\s\S]*?forceRefresh,\s+trace/);
});

test("Price warm and refresh samples observe the active mode primary", () => {
  const page = source("miniprogram/pages/data/price/price.controller.ts");
  const template = source("miniprogram/pages/data/price/price.wxml");
  assert.match(template, /id="perf-primary-player"/);
  assert.match(page, /primarySelector\(\): string[\s\S]*?activeMode === "player"[\s\S]*?#perf-primary-player/);
  assert.match(page, /onShow\(\)[\s\S]*?const selector = this\.primarySelector\(\)[\s\S]*?tracker\.observePrimary\(selector\)/);
  assert.match(page, /onPullDownRefresh\(\)[\s\S]*?activeMode === "player"[\s\S]*?observePrimary\("#perf-primary-player"\)/);
});
