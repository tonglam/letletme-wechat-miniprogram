import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("Gameweek Summary resumes an interrupted historical event without cold reset", () => {
  const page = source("miniprogram/pages/summary/gameweek/gameweek.ts");
  assert.match(page, /type GameweekResumeStage = "startup" \| "data" \| "refresh"/);
  assert.match(page, /onHide\(\)[\s\S]*this\.resumeStage = this\.startupPending[\s\S]*this\.data\.refreshing[\s\S]*this\.data\.loading/);
  assert.match(page, /onShow\(\)[\s\S]*resumeStage === "startup"[\s\S]*startPageLoad\("show"\)[\s\S]*loadData\(resumeForceRefresh, trace, this\.lifecycleRevision\)/);
  const resumeStart = page.indexOf("onShow()");
  const coldStart = page.indexOf("async startPageLoad");
  assert.doesNotMatch(page.slice(resumeStart, coldStart), /setData\(\{ event: currentGw/);
});

test("My FPL Team resumes an interrupted lazy tab independently of fresh primary", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(page, /resumeTab: null as EntrySummaryTab \| null/);
  assert.match(page, /onHide\(\)[\s\S]*this\.resumeTab = this\.data\.tabLoading[\s\S]*this\.data\.activeTab[\s\S]*tabRequestId \+= 1[\s\S]*tabLoading: false/);
  assert.match(page, /const resumeTab = this\.resumeTab[\s\S]*const resumeTabForceRefresh = this\.resumeTabForceRefresh[\s\S]*const primaryReloaded[\s\S]*if \(!primaryReloaded && resumeTab[\s\S]*loadTab\(resumeTab, resumeTabForceRefresh, trace\)/);
  assert.match(page, /onUnload\(\)[\s\S]*this\.resumeTab = null/);
});
