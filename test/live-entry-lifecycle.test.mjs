import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  const transferLoad = page.indexOf("void this.loadTransfers", noPicks);
  assert.ok(noPicks >= 0 && transferLoad > noPicks);
  const branch = page.slice(noPicks, page.indexOf("const players", noPicks));
  assert.match(branch, /transfers: \[\]/);
  assert.match(branch, /this\.liveRefresh\?\.stop\(\)/);
  assert.doesNotMatch(page, /Promise\.all\(\[request, transfersRequest\]\)/);
});
