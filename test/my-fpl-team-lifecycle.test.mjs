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
  assert.match(page, /this\.historyPayload = await getEntryTeamStatsHistory/);
  assert.match(page, /tab === "transfer"[\s\S]*getEntryTeamStatsTransfers/);
});

test("My FPL Team owns independent primary and tab status surfaces", () => {
  const template = source("miniprogram/pages/my-fpl/team/team.wxml");
  assert.match(template, /id="perf-primary-content"/);
  assert.match(template, /tabLoading/);
  assert.match(template, /data-status[\s\S]*tabError/);
});
