import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Price query changes drop interrupted pagination ownership", () => {
  const page = read("miniprogram/pages/data/price/price.controller.ts");
  assert.match(page, /clearPaginationOwnership\(\)/);
  assert.match(page, /onPlayerKeywordInput[\s\S]*clearPaginationOwnership\(\)/);
  assert.match(page, /onClearPlayerFilters[\s\S]*clearPaginationOwnership\(\)/);
  assert.match(page, /startPlayerSearch[\s\S]*resumePaginationAfterShow = false/);
});

test("Leagues always settles the pull-down indicator after a hidden return", () => {
  const page = read("miniprogram/pages/my-fpl/leagues/leagues.ts");
  assert.match(page, /async onPullDownRefresh\(\)[\s\S]*try \{[\s\S]*loadCatalog\([\s\S]*\} finally \{[\s\S]*wx\.stopPullDownRefresh\(\)/);
});

test("Network status ignores an initial probe older than a status event", () => {
  const page = read("miniprogram/utils/network-status.ts");
  assert.match(page, /networkStatusGeneration = 0/);
  assert.match(page, /networkStatusGeneration \+= 1;[\s\S]*knownOnline = result\.isConnected/);
  assert.match(page, /const probeGeneration = networkStatusGeneration/);
  assert.match(page, /if \(probeGeneration === networkStatusGeneration\)[\s\S]*knownOnline = result\.networkType !== "none"/);
});

test("My FPL context refreshes through the centralized AppContext", () => {
  const service = read("miniprogram/services/my-fpl.service.ts");
  assert.match(service, /ensureAppContext\(\{[\s\S]*reason: "page-load"[\s\S]*forceRefresh/);
  assert.match(service, /season = appContext\.season[\s\S]*currentEvent = appContext\.currentEvent[\s\S]*nextEvent = appContext\.nextEvent/);
  assert.doesNotMatch(service, /const eventInfo = await getCurrentEventAndDeadline\(forceRefresh\)/);
});
