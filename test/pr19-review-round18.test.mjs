import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("Home drops fixture results after visibility ends", () => {
  const page = source("miniprogram/pages/home/index/index.ts");

  assert.match(page, /const fixtureResult = await fixtureTask;\s+if \(!this\._pageVisible \|\| requestId !== this\._loadRequestId\) return;/);
  assert.match(page, /await new Promise<void>\([\s\S]*?\);\s+if \(!this\._pageVisible \|\| requestId !== this\._loadRequestId\) return;/);
});

test("Live Tournament captures the cold trace before auth and stops hidden continuation", () => {
  const page = source("miniprogram/pages/live/tournament/tournament.ts");

  assert.match(page, /async onLoad\(\) \{\s+const app = getApp<IAppOption>\(\);\s+this\.pageVisible = true;\s+const trace = capturePageRequestTrace/);
  assert.match(page, /await app\.authReady; \} catch \{\}\s+\}\s+if \(!this\.pageVisible\) return;/);
  assert.match(page, /this\.loadTournaments\(false, trace\)/);
});

test("Live Entry controls get a fresh refresh tracker", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");

  assert.match(page, /onGwChange[\s\S]*?this\.perfTracker = new PagePerformanceTracker\(this, "pages\/live\/entry\/entry", "refresh"\)/);
  assert.match(page, /onRetry\(\) \{\s+this\.perfTracker\?\.disconnect\(\);\s+this\.perfTracker = new PagePerformanceTracker\(this, "pages\/live\/entry\/entry", "refresh"\)/);
});
