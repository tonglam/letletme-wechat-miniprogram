import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeTransfer } from "../miniprogram/pages/live/entry/transfer.ts";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(
    /\s+/g,
    " ",
  );

test("Live Entry uses one CalcLive root and no independent LiveSnapshot root", () => {
  const service = source("miniprogram/services/live.service.ts");
  const query = service.slice(
    service.indexOf("query CalcLivePointsByEntry"),
    service.indexOf("`;", service.indexOf("query CalcLivePointsByEntry")),
  );
  assert.equal((query.match(/calcLivePointsByEntry\(/g) || []).length, 1);
  assert.doesNotMatch(query, /^\s{4}liveSnapshot\(/m);
  assert.match(query, /availability[\s\S]*snapshot\s*\{/);
});

test("V2 pending/unavailable preserves same-event data and controls polling", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  const noPicks = page.indexOf('result.availability === "NO_PICKS"');
  const transferLoad = page.indexOf("await this.loadTransfers", noPicks);
  assert.ok(noPicks >= 0 && transferLoad > noPicks);
  const branch = page.slice(noPicks, page.indexOf("const players", noPicks));
  assert.match(branch, /transfers: \[\]/);
  assert.match(branch, /this\.liveRefresh\?\.stop\(\)/);
  assert.match(branch, /result\.scoreNextRefreshAt/);
  assert.match(branch, /liveResult\.snapshot\?\.nextRefreshAt/);
  assert.match(branch, /priorSnapshotNextRefreshAt/);
  assert.match(page, /result\.availability === "PENDING"/);
  assert.match(page, /const retainExisting/);
  assert.match(page, /if \(retainExisting \|\| result\.availability === "PENDING"\)\s*this\.liveRefresh\?\.sync\(\)/);
  assert.match(page, /LIVE_POINTS_UNAVAILABLE_ERROR/);
  assert.match(page, /this\.liveSnapshot\?\.nextRefreshAt/);
  assert.doesNotMatch(page, /Promise\.all\(\[request, transfersRequest\]\)/);
});

test("no-entry state observes primary only after setData commits", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(
    page,
    /if \(!entryId\)[\s\S]*this\.setData\([\s\S]*?\}, \(\) => \{[\s\S]*observePrimary/,
  );
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
  const handler = page.slice(
    page.indexOf("onGwChange"),
    page.indexOf("onRetry"),
  );
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
    time: "2026-01-01T00:00:00Z",
  });
  const second = normalizeTransfer({
    elementOut: 1,
    elementIn: 2,
    cost: 0,
    time: "2026-01-01T00:01:00Z",
  });
  assert.notEqual(first.rowKey, second.rowKey);
});

test("entry transfer history cache keys include season", () => {
  const service = source("miniprogram/services/entry.service.ts");
  const graphql = source("miniprogram/services/graphql.service.ts");
  assert.match(service, /cacheVariant: isLiveEvent \? "live" : "history"/);
  assert.match(
    graphql,
    /SEASON_SCOPED_POLICIES[\s\S]*"reporting"[\s\S]*"historical"/,
  );
});

test("live entry projects auto-subs and captain promotion like the web", () => {
  const service = source("miniprogram/services/live.service.ts");
  const page = source("miniprogram/pages/live/entry/entry.ts");
  const engine = source("miniprogram/utils/live-auto-subs.ts");
  const row = source("miniprogram/components/player-row/player-row.wxml");
  const pitch = source("miniprogram/components/squad-pitch/squad-pitch.wxml");
  const canvas = source("miniprogram/utils/squad-pitch-canvas.ts");

  // The calc query fetches everything the projection needs.
  assert.match(service, /isGwFinished/);
  assert.match(service, /bgw/);
  assert.match(
    service,
    /autoSub multiplier cleanSheets saves yellowCards redCards/,
  );
  assert.match(service, /isCaptain: item\.isCaptain/);

  // The page runs the engine before rows/pitch are built.
  assert.match(
    page,
    /deriveLiveAutoSubProjection\(\{ chip: result\.chip, pickList: rawFieldPlayers, score: renderableScore, snapshot: liveResult\.snapshot,? \}\)/,
  );
  assert.match(
    page,
    /applyLiveAutoSubProjection\(rawFieldPlayers, autoSubProjection\)/,
  );
  assert.match(
    page,
    /autoSubProjection\.captainPromotion\?\.playerInName \|\|/,
  );

  // Engine keeps the web truth tiers.
  assert.match(engine, /score\?\.delivery\.state === "FINAL"/);
  assert.match(engine, /snapshot\?\.state === "FINALIZED"/);
  assert.match(engine, /minutes === 0|Number\(pick\.minutes \?\? 0\) === 0/);
  assert.match(engine, /isValidFormation/);

  // Arrow badges render on rows, pitch kits, bench cards, and the share image.
  assert.match(
    row,
    /autosub-badge \{\{player\.autoSubIncoming \? 'autosub-in' : 'autosub-out'\}\}/,
  );
  assert.match(row, /\{\{player\.autoSubArrow\}\}/);
  assert.match(
    pitch,
    /squad-autosub \{\{player\.autoSubIncoming \? 'in' : 'out'\}\}/,
  );
  assert.match(pitch, /squad-autosub bench/);
  assert.match(canvas, /drawAutoSubBadge/);
  assert.match(canvas, /autoSubRole/);
});

test("live entry retries a first-sync empty pick list with backoff", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(
    page,
    /EMPTY_PICKS_RETRY_DELAYS_MS = \[1500, 3000, 7000, 12000\]/,
  );
  assert.match(
    page,
    /result\.availability === "READY" && rawRoster\.length === 0 && eventId === \(this\.liveSnapshot\?\.eventId \?\? currentLiveEventId\(\)\)/,
  );
  assert.match(
    page,
    /if \(keepLoadingForEmptyPicksRetry\) this\.setData\(\{ loading: true \}\)/,
  );
  assert.match(page, /result\.availability === "UNAVAILABLE"/);
  assert.match(page, /本轮实时数据暂不可用，请稍后重试/);
  assert.match(
    page,
    /this\.liveRequestKey && this\.liveRequestKey !== requestKey/,
  );
});

test("player detail sheet shows expected-goals stats from the calc payload", () => {
  const service = source("miniprogram/services/live.service.ts");
  const detail = source("miniprogram/pages/live/entry/player-detail.ts");
  assert.match(
    service,
    /expectedGoals expectedAssists expectedGoalInvolvements expectedGoalsConceded/,
  );
  assert.match(detail, /expectedStatRow\("xG", player\.expectedGoals\)/);
  assert.match(detail, /expectedStatRow\("xA", player\.expectedAssists\)/);
  assert.match(
    detail,
    /expectedStatRow\("xGC", player\.expectedGoalsConceded\)/,
  );
  assert.match(detail, /statRow\("防守贡献", defensiveContribution\)/);
});
