import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("My FPL Team loads the selected event before lazy support tabs", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  const primary = page.indexOf("await getEntryTeamStatsEventResult");
  const primaryCommit = page.indexOf("primarySetDataAt", primary);
  const lazy = page.indexOf("async loadTab");
  assert.ok(primary >= 0 && primaryCommit > primary && lazy > primaryCommit);
  assert.match(page, /if \(tab === "squad" \|\| !this\.data\.entryId\) return/);
  assert.match(page, /let historyPayload = this\.historyPayload[\s\S]*historyPayload = await getEntryTeamStatsHistory/);
  assert.match(page, /tab === "transfer"[\s\S]*transferPayload = await getEntryTeamStatsTransfers/);
  assert.match(page, /restartForPrincipalChange\(entryId\)[\s\S]*this\.historyPayload = historyPayload/);
});

test("My FPL Team owns independent primary and tab status surfaces", () => {
  const template = source("miniprogram/pages/my-fpl/team/team.wxml");
  assert.match(template, /id="perf-primary-content"/);
  assert.match(template, /tabLoading/);
  assert.match(template, /data-status[\s\S]*tabError/);
});

test("My FPL no-entry state observes primary after its terminal commit", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(page, /if \(!this\.data\.entryId\)[\s\S]*this\.setData\([\s\S]*?\}, \(\) => \{[\s\S]*observePrimary/);
});

test("My FPL warm resume observes retained terminal state without refetching", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  const onShow = page.slice(page.indexOf("async onShow()"), page.indexOf("_loadedAt: 0"));
  assert.match(onShow, /hasTeamData \|\| Boolean\(this\.data\.emptyState\) \|\| Boolean\(this\.data\.error\)[\s\S]*observePrimary/);
});

test("My FPL invalidates lazy support payloads on season rollover", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(page, /invalidateSeasonSupport\(\)[\s\S]*this\.tabRequestId \+= 1[\s\S]*this\.historyPayload = null[\s\S]*this\.transferPayload = null/);
  assert.equal((page.match(/if \(seasonChanged\) this\.invalidateSeasonSupport\(\)/g) || []).length, 2);
});
