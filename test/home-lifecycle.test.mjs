import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("home paints Core fixtures before starting independent secondary sections", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  const fixtureAwait = page.indexOf("const fixtureResult = await fixtureTask");
  const primaryCommit = page.indexOf("fixtureRows: fixtureResult.fixtures.map");
  const secondaryStart = page.indexOf("void this.loadSecondaryData");
  assert.ok(fixtureAwait >= 0 && primaryCommit > fixtureAwait && secondaryStart > primaryCommit);
  assert.match(page, /await this\.syncAppState\([\s\S]*tracker\?\.mark\("primaryRequestStartAt"\)/);
  assert.match(page, /syncAppState\(extra: Partial<HomeData> = \{\}\): Promise<void>[\s\S]*return setDataAsync\(this/);
  assert.doesNotMatch(page, /this\._loadedContextRevision = context\.contextRevision;\s*this\.syncAppState\(\);\s*this\.startCountdown\(\);\s*await this\.loadPage\(\)/);
  assert.match(page, /Promise\.allSettled\(\[entryTask, supplementTask\]\)/);
  assert.match(page, /getEntryInfo[\s\S]*this\.setData\(\{ entry, entryError: "" \}\)/);
  assert.match(page, /getMiniHomeSupplement[\s\S]*\.then\(\(supplement\)/);
});

test("home first viewport order is deadline, fixtures, entry, then auxiliary notice", () => {
  const template = source("miniprogram/pages/home/index/index.wxml");
  const deadline = template.indexOf("deadline-card");
  const fixtures = template.indexOf("perf-primary-fixtures");
  const entry = template.indexOf("<entry-card");
  const notice = template.indexOf("notice-strip");
  assert.ok(deadline >= 0 && fixtures > deadline && entry > fixtures && notice > entry);
});

test("home secondary completion stays on the navigation tracker that started it", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  assert.match(page, /loadPage\([\s\S]*originatingTracker\?: PagePerformanceTracker \| null[\s\S]*originatingTracker === undefined/);
  assert.match(page, /loadSecondaryData\(requestId, currentGw, forceRefresh, trace, tracker\)/);
  assert.match(page, /loadSecondaryData\([\s\S]*tracker: PagePerformanceTracker \| null[\s\S]*tracker\?\.mark\("secondaryCompleteAt"\)/);
  assert.doesNotMatch(page, /this\._perfTracker\?\.mark\("secondaryCompleteAt"\)/);
});

test("home pull refresh does not force CurrentEventInfo while context is fresh", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  assert.match(
    page,
    /const contextMissing = !app\.globalData\.season[\s\S]*!app\.globalData\.gw[\s\S]*!app\.globalData\.nextGw;[\s\S]*const refreshContext = contextMissing \|\| deadlineExpired;[\s\S]*if \(refreshContext\)[\s\S]*forceRefresh: true/
  );
  assert.match(
    page,
    /else \{[\s\S]*ensureAppContext\(\{[\s\S]*reason: "pull-refresh"[\s\S]*\}\);[\s\S]*loadPage\(true, tracker\)/
  );
  assert.doesNotMatch(page, /const forceContextForUserRefresh = !deadlineTriggered/);
});
