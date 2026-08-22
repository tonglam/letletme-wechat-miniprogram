import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\s+/g, " ");

test("Data selections directory rejects superseded responses", () => {
  const page = read("miniprogram/pages/data/selections/selections.ts");
  assert.match(page, /const requestId = \+\+this\.directoryRequestId/);
  assert.match(page, /requestId === this\.directoryRequestId/);
});

test("Tournament summary rejects superseded tournament and event responses", () => {
  const page = read("miniprogram/pages/summary/tournament/tournament.ts");
  assert.match(page, /const requestId = \+\+this\.summaryRequestId/);
  assert.match(page, /requestedEvent = this\.data\.event[\s\S]*requestedEntryId = this\.data\.entryId/);
  assert.match(page, /requestId === this\.summaryRequestId[\s\S]*selectedTournamentIndex[\s\S]*requestedEvent/);
  assert.match(page, /mapTournamentSummaryData\([^;]*requestedEntryId, requestedEvent\)/);
  assert.match(page, /const requestId = \+\+this\.directoryRequestId/);
  assert.match(page, /requestId === this\.directoryRequestId/);
});

test("Home invalidates and resumes a refresh interrupted by page hide", () => {
  const page = read("miniprogram/pages/home/index/index.ts");
  assert.match(page, /const refreshRequestId = \+\+this\._refreshRequestId[\s\S]*isActiveRefresh/);
  assert.match(page, /onHide\(\)[\s\S]*_resumeRefreshOnShow = this\._refreshPending[\s\S]*_refreshRequestId \+= 1/);
  assert.match(page, /onShow\(\)[\s\S]*_resumeRefreshOnShow[\s\S]*await this\.refreshHome\(deadlineTriggered\)/);
  assert.match(page, /ensureAppContext\([\s\S]*if \(!isActiveRefresh\(\)\) return;[\s\S]*this\.loadPage\(true, tracker\)/);
});

test("Live Tournament invalidates and resumes interrupted row reads", () => {
  const page = read("miniprogram/pages/live/tournament/tournament.controller.ts");
  assert.match(page, /onHide\(\)[\s\S]*resumeRowsAfterShow = this\.resumeRowsAfterShow[\s\S]*\|\| \(!this\.resumeDirectoryAfterShow[\s\S]*Boolean\(this\.rowsRequest[\s\S]*rowsRequestId \+= 1[\s\S]*rowsRequest = null/);
  assert.match(page, /onShow\(\)[\s\S]*resumeRowsAfterShow[\s\S]*loadRows\(\{ background: this\.data\.hasData, forceRefresh: true,? \}\)/);
  assert.match(page, /if \(!this\.pageVisible \|\| requestId !== this\.rowsRequestId\) return;/);
});
