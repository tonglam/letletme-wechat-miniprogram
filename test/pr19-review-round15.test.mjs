import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("automatic Home deadline refresh is unowned telemetry and backs off stale deadlines", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  const context = source("miniprogram/services/app-context.service.ts");

  assert.match(page, /const tracker = deadlineTriggered \? null : this\._perfTracker \?\? null/);
  assert.match(page, /trace: deadlineTriggered \? null : undefined/);
  assert.match(page, /await this\.loadPage\(true, tracker\)/);
  assert.match(page, /deadlineTriggered && refreshedDeadlineExpired[\s\S]*?this\.scheduleDeadlineRetry\(\)/);
  assert.match(page, /if \(this\.updateCountdown\(\)\) return;/);
  assert.match(context, /trace\?: PageRequestTrace \| null/);
  assert.match(context, /readCurrentEventAndDeadline\(\{ forceRefresh, trace \}\)/);
});

test("Home null trace survives through secondary service boundaries", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  const homeService = source("miniprogram/services/home.service.ts");
  const entryService = source("miniprogram/services/entry.service.ts");

  assert.match(page, /primaryTrace: PageRequestTrace \| null/);
  assert.match(page, /const entryTrace: PageRequestTrace \| null/);
  assert.match(page, /const supplementTrace: PageRequestTrace \| null/);
  assert.match(homeService, /getMiniHomeSupplement[\s\S]*?trace\?: PageRequestTrace \| null/);
  assert.match(entryService, /getEntryInfo[\s\S]*?trace\?: PageRequestTrace \| null/);
});

test("My FPL Team abandons resumed work after the page becomes hidden", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");

  assert.match(page, /pageVisible: false/);
  assert.match(page, /async onShow\(\) \{\s+this\.pageVisible = true/);
  assert.match(page, /await this\.ensureContext\("page-show"\);\s+if \(!this\.pageVisible\) return;/);
  assert.match(page, /onHide\(\)[\s\S]*this\.resumeTab = this\.data\.tabLoading[\s\S]*this\.pageVisible = false/);
  assert.match(page, /onUnload\(\) \{\s+this\.pageVisible = false/);
});
