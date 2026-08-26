import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("My FPL Team loads the selected event before lazy support tabs", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const primary = page.indexOf("await getEntryTeamStatsEventResult");
  const primaryCommit = page.indexOf("this.markPrimaryCommit(tracker)", primary);
  const lazy = page.indexOf("async loadTab");
  assert.ok(primary >= 0 && primaryCommit > primary && lazy > primaryCommit);
  assert.match(page, /if \(tab === "squad" \|\| !this\.data\.entryId\) return/);
  assert.match(page, /let historyPayload = this\.historyPayload[\s\S]*historyPayload = await getEntryTeamStatsHistory/);
  assert.match(page, /tab === "transfer"[\s\S]*transferPayload = await getEntryTeamStatsTransfers/);
  assert.match(page, /restartForPrincipalChange\(entryId\)[\s\S]*this\.historyPayload = historyPayload/);
});

test("My FPL Team waits for and keeps the standalone viewer entry", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(page, /await waitForAuthoritativeFollow\(\)/);
  assert.match(page, /entryId: currentMyFplEntryId\(\) \?\? 0/);
  assert.match(page, /restartForPrincipalChange\(entryId[\s\S]*currentMyFplEntryId\(\) \?\? 0/);
  assert.doesNotMatch(page, /currentFollowEntryId/);
});

test("My FPL Team sends every no-team viewer to team selection", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.doesNotMatch(page, /requiresMyFplAccountLink|goToAccountLink|accountLinkRequired/);
  assert.match(page, /emptyTitle: "先选择我的球队"/);
  assert.match(page, /if \(this\.data\.emptyState === "entry"\) \{\s*goToEntrySearch\(\)/);
});

test("My FPL lazy tabs recover once after viewer authorization loss", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(page, /let viewerTabRecoveryAttempted = false/);
  assert.match(
    page,
    /async loadTab[\s\S]*catch \(error\)[\s\S]*!viewerTabRecoveryAttempted[\s\S]*isViewerEntryAuthorizationError\(error\)[\s\S]*await refreshAuthoritativeFollow\(\)[\s\S]*球队状态尚未同步，请稍后重试/,
  );
  assert.match(page, /restartForPrincipalChange\(entryId\)[\s\S]*tabLoading: false[\s\S]*tabError: ""/);
});

test("My FPL Team owns independent primary and tab status surfaces", () => {
  const template = source("miniprogram/pages/my-fpl/team/team.wxml");
  assert.match(template, /id="perf-primary-content"/);
  assert.match(template, /tabLoading/);
  assert.match(template, /data-status[\s\S]*tabError/);
});

test("My FPL no-entry state observes primary after its terminal commit", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(page, /if \(!this\.data\.entryId\)[\s\S]*this\.setData\([\s\S]*?\}, \(\) => \{[\s\S]*this\.markPrimaryCommit\(tracker\)/);
  assert.match(page, /markPrimaryCommit\(tracker\?: PagePerformanceTracker\)[\s\S]*tracker\.mark\("primarySetDataAt"\)[\s\S]*tracker\.observePrimary\(\)/);
});

test("My FPL warm resume observes retained terminal state without refetching", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const onShow = page.slice(page.indexOf("async onShow()"), page.indexOf("_loadedAt: 0"));
  assert.match(onShow, /hasTeamData \|\| Boolean\(this\.data\.emptyState\) \|\| Boolean\(this\.data\.error\)[\s\S]*observePrimary/);
});

test("My FPL invalidates lazy support payloads on season rollover", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(page, /invalidateSeasonSupport\(\)[\s\S]*this\.tabRequestId \+= 1[\s\S]*this\.historyPayload = null[\s\S]*this\.transferPayload = null/);
  assert.equal((page.match(/if \(seasonChanged\) this\.invalidateSeasonSupport\(\)/g) || []).length, 2);
});

test("My FPL cold context failure commits a retryable terminal state", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(page, /async onLoad\(\)[\s\S]*catch \(error\)[\s\S]*this\.showContextError\(error\)[\s\S]*return/);
  assert.match(page, /showContextError\(error: unknown\)[\s\S]*this\.contextUnavailable = true[\s\S]*loading: false[\s\S]*observePrimary/);
  assert.match(page, /onRetry\(\)[\s\S]*if \(this\.contextUnavailable \|\| this\.data\.maxGw <= 0\)[\s\S]*recoverContext\("pull-refresh"\)/);
  assert.match(page, /recoverContext[\s\S]*this\.ensureContext\(reason, true\)[\s\S]*initializeFromContext\(true, trace, tracker\)/);
  assert.match(page, /async onShow\(\)[\s\S]*if \(this\.contextUnavailable\)[\s\S]*recoverContext\("page-show"\)[\s\S]*return[\s\S]*this\.ensureContext\("page-show"\)/);
});

test("My FPL carries one originating trace through delayed support reads", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const service = source("miniprogram/services/summary.service.ts");
  assert.match(page, /const trace = originatingTrace \|\| capturePageRequestTrace/);
  assert.match(page, /getEntryTeamStatsEventResult\(entryId, selectedEvent, forceRefresh, trace\)/);
  assert.match(page, /loadTab\(this\.data\.activeTab, forceRefresh, trace\)/);
  assert.match(page, /getEntryTeamStatsHistory\(entryId, forceRefresh, trace\)[\s\S]*getEntryTeamStatsTransfers\(entryId, forceRefresh, trace\)/);
  assert.match(service, /getEntryTeamStatsHistory\([\s\S]*trace\?: PageRequestTrace[\s\S]*forceRefresh, trace/);
});
