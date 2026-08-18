import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeTransfer } from "../miniprogram/pages/live/entry/transfer.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Live Entry uses one CalcLive root and no independent LiveSnapshot root", () => {
  const service = source("miniprogram/services/live.service.ts");
  const query = service.slice(service.indexOf("query CalcLivePointsByEntry"), service.indexOf("`;", service.indexOf("query CalcLivePointsByEntry")));
  assert.equal((query.match(/calcLivePointsByEntry\(/g) || []).length, 1);
  assert.doesNotMatch(query, /^\s{4}liveSnapshot\(/m);
  assert.match(query, /availability[\s\S]*snapshot\s*\{/);
});

test("NO_PICKS completes before transfers and disables polling", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  const noPicks = page.indexOf('result.availability === "NO_PICKS"');
  const transferLoad = page.indexOf("await this.loadTransfers", noPicks);
  assert.ok(noPicks >= 0 && transferLoad > noPicks);
  const branch = page.slice(noPicks, page.indexOf("const players", noPicks));
  assert.match(branch, /transfers: \[\]/);
  assert.match(branch, /this\.liveRefresh\?\.stop\(\)/);
  assert.doesNotMatch(page, /Promise\.all\(\[request, transfersRequest\]\)/);
});

test("no-entry state observes primary only after setData commits", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(page, /if \(!entryId\)[\s\S]*this\.setData\([\s\S]*?\}, \(\) => \{[\s\S]*observePrimary/);
});

test("live entry renders the reusable squad pitch from live rows", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  const template = source("miniprogram/pages/live/entry/entry.wxml");
  const json = source("miniprogram/pages/live/entry/entry.json");
  assert.match(page, /buildLiveSquadPitchState/);
  assert.match(page, /onPitchPlayerTap/);
  assert.match(page, /onSharePitch/);
  assert.match(page, /presentSquadPitchShareImage/);
  assert.match(page, /buildPlayerLiveDetail\(player\)/);
  assert.match(template, /live-pitch-section/);
  assert.match(template, /bindtap="onSharePitch"/);
  assert.match(template, /<squad-pitch/);
  assert.match(template, /bind:playertap="onPitchPlayerTap"/);
  assert.match(json, /squad-pitch/);
});

test("changing GW invalidates and clears deferred transfer data", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  const handler = page.slice(page.indexOf("onGwChange"), page.indexOf("onRetry"));
  assert.match(handler, /this\.transfersRequestId \+= 1/);
  assert.match(handler, /this\.loadTransfersAfterLive = false/);
  assert.match(handler, /transfers: \[\]/);
  assert.match(handler, /transfersLoading: false/);
  assert.match(handler, /emptyLiveOverlayState\(\)/);
});

test("transfer row keys include time so repeated swaps stay unique", () => {
  const first = normalizeTransfer({
    elementOut: 1,
    elementIn: 2,
    cost: 0,
    time: "2026-01-01T00:00:00Z"
  });
  const second = normalizeTransfer({
    elementOut: 1,
    elementIn: 2,
    cost: 0,
    time: "2026-01-01T00:01:00Z"
  });
  assert.notEqual(first.rowKey, second.rowKey);
});

test("entry transfer history cache keys include season", () => {
  const service = source("miniprogram/services/entry.service.ts");
  const graphql = source("miniprogram/services/graphql.service.ts");
  assert.match(service, /cacheVariant: isLiveEvent \? "live" : "history"/);
  assert.match(graphql, /SEASON_SCOPED_POLICIES[\s\S]*"reporting"[\s\S]*"historical"/);
});
