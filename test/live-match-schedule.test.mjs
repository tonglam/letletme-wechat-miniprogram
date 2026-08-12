import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Live Matches paints Core schedule before an optional overlay", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const core = page.indexOf("await readCoreEventFixtureSchedule");
  const primaryCommit = page.indexOf("primarySetDataAt", core);
  const overlay = page.indexOf("await getLiveMatchByStatusSnapshot", core);
  assert.ok(core >= 0 && primaryCommit > core && overlay > primaryCommit);
  assert.match(page, /targetEvent === context\.currentEvent/);
  assert.match(page, /fixture\.started === true[\s\S]*fixture\.kickoffTime/);
  assert.match(page, /return core\.map/);
});

test("preseason uses displayEvent schedule without a Live overlay", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(page, /currentEventId = context\.currentEvent \|\| 0/);
  assert.match(page, /targetEventId = context\.displayEvent \|\| 0/);
  assert.match(page, /this\.liveWindow = targetEvent === context\.currentEvent/);
  const statusHandler = page.slice(page.indexOf("onStatusTap"));
  assert.doesNotMatch(statusHandler.slice(0, statusHandler.indexOf("onRetry")), /loadData\(/);
});
