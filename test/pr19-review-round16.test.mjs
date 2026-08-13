import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("cold Home work stops when the page hides during context resolution", () => {
  const page = source("miniprogram/pages/home/index/index.ts");

  assert.match(page, /async onLoad\(\) \{\s+this\._pageVisible = true/);
  assert.match(page, /const context = await ensureAppContext\(\{ reason: "page-load" \}\);\s+if \(!this\._pageVisible\) return;/);
  assert.match(page, /catch \(error\) \{\s+if \(this\._pageVisible\) this\.showContextError\(error\)/);
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
