import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("tournament context recovery retains the originating directory trace", () => {
  const service = source("miniprogram/services/tournament.service.ts");

  assert.match(service, /async function readDirectory[\s\S]*?ensureAppContext\(\{[\s\S]*?forceRefresh: forceRefresh \|\| !season,\s+trace\s+\}\)/);
});

test("Price abandons a superseded cold continuation after context resolution", () => {
  const page = source("miniprogram/pages/data/price/price.controller.ts");

  assert.match(page, /const tracker = this\.perfTracker;[\s\S]*?await ensureAppContext/);
  assert.match(page, /if \(!this\.pageActive \|\| this\.perfTracker !== tracker\) return;\s+tracker\.mark\("contextReadyAt"\)/);
});

test("Player Detail prefers refreshed context unless the route pins a season", () => {
  const page = source("miniprogram/pages/data/player-detail/player-detail.ts");

  assert.match(page, /routeSeason: ""/);
  assert.match(page, /this\.routeSeason = options\.season \|\| ""/);
  assert.match(page, /let season = this\.routeSeason;[\s\S]*?season = this\.routeSeason \|\| context\.season/);
  assert.doesNotMatch(page, /season = season \|\| context\.season/);
});
