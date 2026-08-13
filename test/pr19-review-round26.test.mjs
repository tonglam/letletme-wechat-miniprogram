import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("Tournament Summary resumes the selected summary context", () => {
  const summary = source("miniprogram/pages/summary/tournament/tournament.ts");
  assert.match(summary, /resumeStage: null as TournamentSummaryResumeStage \| null/);
  assert.match(summary, /resumeStage === "summary"[\s\S]*loadSummary\(false, trace\)[\s\S]*resumeStage === "tournaments"[\s\S]*loadTournaments\(false, trace\)/);
  assert.match(summary, /resumeStage = this\.startupPending[\s\S]*\? "initialize"[\s\S]*: this\.activeLoadStage/);
});

test("Home invalidates hidden secondary work and resumes it with a new owner", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(home, /onHide\(\)[\s\S]*_resumeSecondaryOnShow = this\._secondaryPending[\s\S]*_loadRequestId \+= 1/);
  assert.match(home, /const isActiveSecondary = \(\) => this\._pageVisible && requestId === this\._loadRequestId/);
  assert.match(home, /if \(this\._resumeSecondaryOnShow\)[\s\S]*startSecondaryData\(\)/);
  assert.match(home, /startSecondaryData\(\)[\s\S]*\+\+this\._loadRequestId[\s\S]*loadSecondaryData/);
});

for (const path of [
  "miniprogram/pages/data/player-detail/player-detail.ts",
  "miniprogram/pages/data/team-detail/team-detail.ts"
]) {
  test(`${path} forces AppContext recovery on explicit retry`, () => {
    const page = source(path);
    assert.match(page, /ensureAppContext\(\{[\s\S]*reason: forceRefresh \? "pull-refresh" : "page-load",[\s\S]*forceRefresh/);
    assert.match(page, /onRetry\(\)[\s\S]*loadData\("refresh", true\)/);
  });
}

test("Players forces AppContext recovery when retrying", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(players, /ensureAppContext\(\{[\s\S]*reason: forceRefresh \? "pull-refresh" : "page-load",[\s\S]*forceRefresh/);
  assert.match(players, /onRetry\(\)[\s\S]*startSearch\(this\.data\.keyword, true\)/);
});

test("Price resumes interrupted primary stages and invalidates hidden responses", () => {
  const price = source("miniprogram/pages/data/price/price.ts");
  assert.match(price, /resumeStage: null as PriceResumeStage \| null/);
  assert.match(price, /resumeStage === "daily"[\s\S]*loadDailyChanges\(\)[\s\S]*resumeStage === "player"[\s\S]*ensurePlayerModeReady\(\)[\s\S]*resumeStage === "history"/);
  assert.match(price, /onHide\(\)[\s\S]*activeMode === "player"[\s\S]*nextRequestRevision\(this\.dailyRequestOwner, "daily"\)[\s\S]*invalidatePlayerRequest\(\)[\s\S]*historyRequestRevision \+= 1/);
});
