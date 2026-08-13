import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Players preserves forced search semantics across hide/show", () => {
  const page = read("miniprogram/pages/data/players/players.ts");
  assert.match(page, /searchPendingForceRefresh/);
  assert.match(page, /onHide\(\)[\s\S]*resumeSearchAfterShow = this\.searchPending[\s\S]*resumeSearchForceRefresh = this\.searchPendingForceRefresh/);
  assert.match(page, /onShow\(\)[\s\S]*resumeSearch[\s\S]*startSearch\(this\.data\.keyword, resumeSearchForceRefresh\)/);
  assert.match(page, /onRetry\(\)[\s\S]*startSearch\(this\.data\.keyword, true\)/);
});

test("Teams preserves forced directory retries across hide/show", () => {
  const page = read("miniprogram/pages/data/teams/teams.ts");
  assert.match(page, /activeForceRefresh/);
  assert.match(page, /onHide\(\)[\s\S]*resumeForceRefresh = this\.resumeOnShow && this\.activeForceRefresh/);
  assert.match(page, /onShow\(\)[\s\S]*loadData\(resumeForceRefresh, trace\)/);
});

test("Price player retry uses the lifecycle-owned forced refresh", () => {
  const page = read("miniprogram/pages/data/price/price.ts");
  assert.match(page, /onRetryPlayers\(\)[\s\S]*runPlayerRefresh\(this\.perfTracker\)/);
});

test("My FPL primary retry preserves forced refresh ownership", () => {
  const page = read("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(page, /onRetry\(\)[\s\S]*data\.error[\s\S]*runForcedRefresh\(/);
  assert.match(page, /onRetry\(\)[\s\S]*activeTab === "squad"[\s\S]*runForcedRefresh\(/);
});

test("My FPL treats unresolved AppContext as unavailable", () => {
  const service = read("miniprogram/services/my-fpl.service.ts");
  assert.match(service, /eventContextAvailable =\s*appContext\.phase !== "unresolved"/);
  assert.match(service, /appContext\.displayEvent !== null \|\| appContext\.phase === "settled"/);
});
