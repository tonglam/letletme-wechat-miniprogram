import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8").replace(/\s+/g, " ");
}

test("Home retries return the refresh promise to the interaction wrapper", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(
    home,
    /onRetry\(\) \{[\s\S]*return this\.refreshHome\(\)\.finally\(\(\) => this\.startCountdown\(\)\)/,
  );
});

test("account unlink interactions settle after the modal outcome", () => {
  const page = source("miniprogram/pages/account/link/link.ts");
  assert.match(page, /unlinkWebAccount\(\) \{[\s\S]*return new Promise<void>/);
  assert.match(page, /if \(!confirm\) \{\s*resolve\(\);/);
  assert.match(page, /await unlinkMiniProgramWebAccount\(\)[\s\S]*finally \{[\s\S]*resolve\(\);/);
  assert.match(page, /fail: reject/);
});

test("automatic live and price probes suppress page trace attribution", () => {
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  const match = source("miniprogram/pages/live/match/match.ts");
  const tournament = source("miniprogram/pages/live/tournament/tournament.controller.ts");
  const live = source("miniprogram/services/live.service.ts");
  const myFpl = source("miniprogram/services/my-fpl.service.ts");
  const price = source("miniprogram/services/price-change.service.ts");

  assert.match(entry, /probe: \(\) => getLiveSnapshot\(undefined, null\)/);
  assert.match(match, /getLiveMatchdayHead\([\s\S]*true, null,[\s\S]*this\.loadedSeason/);
  assert.match(match, /getLiveMatchByStatusSnapshot\([\s\S]*"all", true, null,/);
  assert.match(tournament, /getLiveSnapshot\(undefined, trace\)/);
  assert.match(tournament, /expectedSeason: scope\.season,[\s\S]*trace: null/);
  assert.match(tournament, /expectedSeason:[\s\S]*trace: null/);
  assert.match(live, /export async function getLiveSnapshot\([\s\S]*trace\?: PageRequestTrace \| null/);
  assert.match(myFpl, /getLiveSnapshot\(event, null\)/);
  assert.match(price, /PRICE_CHANGE_LIVE_CURSOR_QUERY[\s\S]*trace: null/);
  assert.match(price, /PRICE_CHANGE_LIVE_BOARD_QUERY[\s\S]*trace: null/);
});
