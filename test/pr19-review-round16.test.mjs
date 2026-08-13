import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("cold Home work stops when the page hides during context resolution", () => {
  const page = source("miniprogram/pages/home/index/index.ts");

  assert.match(page, /onLoad\(\) \{\s+this\._pageVisible = true[\s\S]*startHomeLifecycle\("cold-launch", "page-load"\)/);
  assert.match(page, /startHomeLifecycle\([\s\S]*const context = await ensureAppContext\(\{ reason \}\);\s+if \(!isActiveLifecycle\(\)\) return;/);
  assert.match(page, /catch \(error\) \{\s+if \(isActiveLifecycle\(\)\) this\.showContextError\(error, tracker\)/);
});

test("a successful cold login commits its binding only inside auth service", () => {
  const app = source("miniprogram/app.ts");

  assert.match(app, /refreshWechatApiSession\(\)\.catch/);
  assert.doesNotMatch(app, /refreshWechatApiSession\(\)\.then\([\s\S]*?commitEntryBinding/);
});

test("My FPL pull refresh waits for the visible deferred tab", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");

  assert.match(page, /await this\.loadData\(true, trace, true\);\s+wx\.stopPullDownRefresh\(\)/);
  assert.match(page, /loadData\([\s\S]*awaitActiveTab = false/);
  assert.match(page, /const tabTask = this\.loadTab[\s\S]*if \(awaitActiveTab\) await tabTask;\s+else void tabTask;/);
});
