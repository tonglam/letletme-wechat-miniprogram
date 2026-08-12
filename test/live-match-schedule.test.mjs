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
  assert.match(page, /await readCoreEventFixtureSchedule[\s\S]*const activeStatus = this\.data\.status[\s\S]*filterMatches\(core, activeStatus\)/);
  assert.match(page, /await getLiveMatchByStatusSnapshot[\s\S]*const overlayStatus = this\.data\.status[\s\S]*filterMatches\(this\.coreMatches, overlayStatus\)/);
});

test("preseason uses displayEvent schedule without a Live overlay", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(page, /currentEventId = context\.currentEvent \|\| 0/);
  assert.match(page, /targetEventId = context\.displayEvent \|\| 0/);
  assert.match(page, /this\.liveWindow = targetEvent === context\.currentEvent/);
  const statusHandler = page.slice(page.indexOf("onStatusTap"));
  assert.doesNotMatch(statusHandler.slice(0, statusHandler.indexOf("onRetry")), /loadData\(/);
});

test("warm resume observes retained Core schedule without refetching", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const onShow = page.slice(page.indexOf("async onShow()"), page.indexOf("onHide()"));
  assert.match(onShow, /resumed && \(this\.data\.hasData \|\| Boolean\(this\.data\.error\)\)[\s\S]*observePrimary/);
});

test("current-event schedule arms a kickoff transition without preseason Live work", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(page, /armKickoffTransition\([\s\S]*this\.targetEventId !== this\.currentEventId[\s\S]*setTimeout/);
  assert.match(page, /this\.armKickoffTransition\(coreRead\.data\)/);
  assert.match(page, /onHide\(\)[\s\S]*this\.clearKickoffTransition\(\)/);
  assert.match(page, /catch \(error\)[\s\S]*this\.armKickoffTransition\(this\.coreMatches, true\)/);
});

test("fixture service rejects partial errors before mapping an empty schedule", () => {
  const service = source("miniprogram/services/fixture.service.ts");
  const read = service.indexOf("const result = await graphqlRead<CoreEventFixtureScheduleResponse>");
  const guard = service.indexOf("if (result.errors.length > 0)", read);
  const mapping = service.indexOf("data: (result.data.eventFixtures || [])", read);
  assert.ok(read >= 0 && guard > read && mapping > guard);
});

test("Live Match surfaces a stale Core fixture fallback", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  assert.match(page, /fixtureStaleMessage: coreRead\.meta\.stale[\s\S]*fixtureScheduleStaleMessage\(coreRead\.meta\.storedAt\)/);
  assert.match(page, /lastError: this\.data\.error \|\| this\.data\.fixtureStaleMessage/);
  assert.match(template, /fixtureStaleMessage[\s\S]*status="stale"/);
});
