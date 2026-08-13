import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("Player Detail propagates and preserves forced retry ownership", () => {
  const page = source("miniprogram/pages/data/player-detail/player-detail.ts");
  const service = source("miniprogram/services/player.service.ts");
  assert.match(page, /forceRefreshPending: false[\s\S]*resumeForceRefresh: false/);
  assert.match(page, /const forceRefresh = this\.resumeForceRefresh[\s\S]*loadData\("show", forceRefresh\)/);
  assert.match(page, /resumeForceRefresh = this\.resumeForceRefresh \|\| this\.forceRefreshPending/);
  assert.match(page, /getPlayerInfoByCode\(this\.data\.code, season, forceRefresh, trace\)/);
  assert.match(service, /cachePolicy: "reporting"[\s\S]*forceRefresh,[\s\S]*trace/);
});
