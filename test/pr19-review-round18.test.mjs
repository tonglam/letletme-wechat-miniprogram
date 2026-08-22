import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8").replace(/\s+/g, " ");

test("Home drops fixture results after visibility ends", () => {
  const page = source("miniprogram/pages/home/index/index.ts");

  assert.match(page, /const fixtureResult = await fixtureTask;\s+if \(!this\._pageVisible \|\| requestId !== this\._loadRequestId\) return;/);
  assert.match(page, /await new Promise<void>\([\s\S]*?\);\s+if \(!this\._pageVisible \|\| requestId !== this\._loadRequestId\) return;/);
});

test("Live Tournament captures the cold trace before auth and stops hidden continuation", () => {
  const page = source("miniprogram/pages/live/tournament/tournament.controller.ts");

  assert.match(page, /async onLoad\(\) \{\s+this\.pageVisible = true;\s+const trace = capturePageRequestTrace[\s\S]*initializeFromContext\("page-load", trace\)/);
  assert.match(page, /async initializeFromContext[\s\S]*const startupGeneration = \+\+this\.startupGeneration[\s\S]*await app\.authReady; \} catch \{\}[\s\S]*this\.startupGeneration !== startupGeneration/);
  assert.match(page, /await this\.loadTournaments\(forceRefresh, trace\)/);
});

test("Live Entry controls get a fresh refresh tracker", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");

  assert.match(page, /onGwChange[\s\S]*?this\.perfTracker = new PagePerformanceTracker\(\s*this, "pages\/live\/entry\/entry", "refresh"/);
  assert.match(page, /onRetry\(\) \{\s+this\.perfTracker\?\.disconnect\(\);\s+this\.perfTracker = new PagePerformanceTracker\(\s*this, "pages\/live\/entry\/entry", "refresh"/);
});
