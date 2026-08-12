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
  assert.match(page, /await this\.syncAppState\([\s\S]*this\._perfTracker\?\.mark\("primaryRequestStartAt"\)/);
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
