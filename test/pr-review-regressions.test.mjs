import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.wx = {
  getStorageSync() {
    return undefined;
  }
};

let releaseAuth;
const app = {
  authReady: new Promise((resolve) => {
    releaseAuth = resolve;
  }),
  globalData: { entryId: 22 }
};
globalThis.getApp = () => app;
globalThis.Page = () => {};

const { waitForAuthoritativeFollow } = await import("../miniprogram/utils/follow.ts");
const { resolveKeywordAfterPlayerLoad } = await import("../miniprogram/pages/data/players/players.ts");

function source(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("personal list pages wait for cold-start auth before reading the follow", async () => {
  let settled = false;
  const waiting = waitForAuthoritativeFollow().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false, "the restored local follow is not authoritative yet");
  releaseAuth();
  await waiting;
  assert.equal(settled, true);

  for (const path of [
    "miniprogram/pages/competitions/index/index.ts",
    "miniprogram/pages/my-fpl/index/index.ts",
    "miniprogram/pages/my-fpl/leagues/leagues.ts"
  ]) {
    assert.match(source(path), /await waitForAuthoritativeFollow\(\)/, path);
  }
});

test("initial request failures do not also claim an empty list", () => {
  const competitions = source("miniprogram/pages/competitions/index/index.wxml");
  const leagues = source("miniprogram/pages/my-fpl/leagues/leagues.wxml");
  assert.match(competitions, /items\.length === 0 && !error/);
  assert.match(leagues, /displayLeagues\.length === 0 && !error/);
});

test("failed event metadata is represented as unavailable, not offseason", () => {
  const service = source("miniprogram/services/my-fpl.service.ts");
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  const template = source("miniprogram/pages/my-fpl/index/index.wxml");
  assert.match(service, /eventContextAvailable = false/);
  assert.match(service, /eventContextAvailable = true/);
  assert.match(overview, /if \(!context\.eventContextAvailable\)/);
  assert.match(template, /wx:if="\{\{eventContextAvailable\}\}"/);
});

test("a total overview secondary failure settles the league module", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  assert.match(
    overview,
    /if \(brief === null && leagues === null\)[\s\S]*resolveOverviewLeagueState\(null, cached\?\.leagueCount\)/,
    "terminal failure renders cached availability or an explicit unavailable state"
  );
});

test("overview never classifies a current event with the following deadline", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  assert.doesNotMatch(overview, /nextUtcDeadline:\s*context\.utcDeadline/);
  assert.match(overview, /snapshotState\s*\n\s*\}\);/);
});

test("empty fixture directories clear previously composed cards", () => {
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(fixtures, /if \(!this\.teams\.length\) \{\s*this\.setData\(\{ runs: \[\] \}\)/);
});

test("Explore waits for shared launch context before syncing its context row", () => {
  const explore = source("miniprogram/pages/explore/index/index.ts");
  assert.match(explore, /async onLoad\(\)/);
  assert.match(explore, /await app\.initAppData\(\)[\s\S]*this\.syncContext\(\)/);
});

test("player directory completion preserves edits made during the request", () => {
  assert.equal(resolveKeywordAfterPlayerLoad("saka", "palmer", true), "palmer");
  assert.equal(resolveKeywordAfterPlayerLoad("saka", "", false), "saka");
  assert.equal(resolveKeywordAfterPlayerLoad("", "palmer", false), "palmer");
  const players = source("miniprogram/pages/data/players/players.ts");
  assert.match(players, /this\.searchRevision !== searchRevision/);
  assert.match(players, /searchEditedWhileLoading \? currentKeyword/);
});

test("overview clears secondary content when the event has no matching cache", () => {
  const overview = source("miniprogram/pages/my-fpl/index/index.ts");
  assert.match(overview, /teamBrief: cached\?\.teamBrief \?\? null/);
  assert.match(
    overview,
    /if \(brief === null && leagues === null\)[\s\S]*teamBrief: cached\?\.teamBrief \?\? null/
  );
});
