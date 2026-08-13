import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("Price and Players consume resumed pagination only after replacement ownership starts", () => {
  const price = source("miniprogram/pages/data/price/price.ts");
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(price, /const task = this\.loadMorePlayers\(resumePaginationCursor\);[\s\S]*if \(this\.paginationPending && this\.paginationCursor === resumePaginationCursor\)[\s\S]*this\.resumePaginationAfterShow = false/);
  assert.match(players, /const task = this\.loadMoreFromCursor\(resumeCursor\);[\s\S]*if \(this\.paginationPending && this\.paginationCursor === resumeCursor\)[\s\S]*this\.resumePaginationAfterShow = false/);
  assert.match(players, /const task = this\.startSearch\(this\.data\.keyword, resumeSearchForceRefresh\);[\s\S]*this\.searchPendingForceRefresh === resumeSearchForceRefresh/);
});

test("My FPL empty-state action uses the lifecycle-owned retry path", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(page, /onEmptyAction\(\)[\s\S]*if \(this\.contextUnavailable \|\| this\.data\.maxGw <= 0\)[\s\S]*this\.recoverContext\("pull-refresh"\)[\s\S]*this\.loadData\(true\);/);
});
