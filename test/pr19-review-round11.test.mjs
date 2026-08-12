import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync("miniprogram/pages/home/index/index.ts", "utf8");
const liveEntrySource = readFileSync("miniprogram/pages/live/entry/entry.ts", "utf8");
const performancePageSource = readFileSync("miniprogram/utils/performance-page.ts", "utf8");

test("warm Home work stops when its page hides during context resolution", () => {
  assert.match(
    homeSource,
    /const context = await ensureAppContext\(\{ reason: "page-show" \}\);\s+if \(!this\._pageVisible\) return;\s+this\._perfTracker\.mark\("contextReadyAt"\)/
  );
  assert.match(homeSource, /if \(this\._pageVisible\) this\.showContextError\(error\);/);
});

test("queued Entry forced follow-ups merge tracked refresh intent", () => {
  assert.match(
    liveEntrySource,
    /if \(options\.trackNavigation\) this\.liveForcedFollowupTrackNavigation = true;/
  );
  assert.match(
    liveEntrySource,
    /const trackNavigation = this\.liveForcedFollowupTrackNavigation;[\s\S]*?this\.loadData\(\{[\s\S]*?trackNavigation,[\s\S]*?forceRefresh: true/
  );
});

test("ordinary page observations require visibility and the originating generation", () => {
  assert.match(
    performancePageSource,
    /if \(!page\.__performanceVisible \|\| page\.__performanceGeneration !== generation\) return;/
  );
  assert.match(
    performancePageSource,
    /function stopTracker\(page: InstrumentedPage\): void \{[\s\S]*?page\.__performanceVisible = false;[\s\S]*?page\.__performanceGeneration = \(page\.__performanceGeneration \?\? 0\) \+ 1;/
  );
  assert.match(
    performancePageSource,
    /const generation = page\.__performanceGeneration;[\s\S]*?schedulePrimaryObservation\(page, generation\);/
  );
});
