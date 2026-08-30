import assert from "node:assert/strict";
import test from "node:test";

globalThis.Page = () => {};
const leaguesModule =
  await import("../miniprogram/pages/my-fpl/leagues/leagues.ts");

test("tournament directory cache never crosses season boundaries", () => {
  globalThis.wx = {
    getStorageSync() {
      return {
        entryId: 123,
        season: "2025-26",
        tournaments: [{ id: 9, name: "Old tournament" }],
        storedAt: 1,
      };
    },
  };

  assert.equal(leaguesModule.readTournamentsCache(123, "2026-27"), null);
  assert.equal(
    leaguesModule.readTournamentsCache(123, "2025-26")?.tournaments[0]?.name,
    "Old tournament",
  );
  assert.equal(leaguesModule.readTournamentsCache(123, undefined), null);
});

test("My FPL page routes the settled tournament review through V2", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../miniprogram/pages/my-fpl/leagues/leagues.ts", import.meta.url),
    "utf8",
  );
  const template = readFileSync(
    new URL(
      "../miniprogram/pages/my-fpl/leagues/leagues.wxml",
      import.meta.url,
    ),
    "utf8",
  );
  const service = readFileSync(
    new URL("../miniprogram/services/tournament.service.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /v2Enabled: true/);
  assert.match(page, /getMyTournamentReviewCatalog/);
  assert.match(template, /<block wx:if="\{\{v2Enabled\}\}">/);
  assert.match(template, /已结算快照复盘中心/);
  assert.match(template, /本轮积分（Gross）/);
  assert.match(template, /H2H 对战/);
  assert.match(template, /淘汰赛对阵/);
  assert.match(service, /X-LetLetMe-Contract|MY_TOURNAMENT_REVIEW_CONTRACT/);
});

test("league warm show reloads only after identity change or the 60s window", () => {
  assert.equal(
    leaguesModule.shouldReloadLeagues(
      1_000,
      9,
      9,
      "2025-26",
      "2025-26",
      12,
      12,
      4,
      4,
      1_100,
    ),
    false,
  );
  assert.equal(
    leaguesModule.shouldReloadLeagues(
      1_000,
      9,
      9,
      "2025-26",
      "2025-26",
      12,
      12,
      4,
      4,
      61_000,
    ),
    true,
  );
  assert.equal(
    leaguesModule.shouldReloadLeagues(
      1_000,
      9,
      10,
      "2025-26",
      "2025-26",
      12,
      12,
      4,
      4,
      1_100,
    ),
    true,
  );
  assert.equal(
    leaguesModule.shouldReloadLeagues(
      1_000,
      9,
      9,
      "2025-26",
      "2026-27",
      12,
      12,
      4,
      4,
      1_100,
    ),
    true,
  );
  assert.equal(
    leaguesModule.shouldReloadLeagues(
      1_000,
      9,
      9,
      "2025-26",
      "2025-26",
      12,
      13,
      4,
      4,
      1_100,
    ),
    true,
  );
});

test("league view loaders discard superseded responses and resume interrupted view loads", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../miniprogram/pages/my-fpl/leagues/leagues.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /isActiveViewRequest\(requestId\)/);
  assert.match(page, /async loadSeasonView\([\s\S]*requestId: number/);
  assert.match(page, /async loadGameweekView\([\s\S]*requestId: number/);
  assert.match(
    page,
    /onHide\(\)[\s\S]*this\.data\.viewLoading[\s\S]*this\.data\.pathLoading/,
  );
  assert.match(
    page,
    /shouldReloadLeagues\([\s\S]*this\.loadedEvent,[\s\S]*this\.data\.event,/,
  );
  assert.match(
    page,
    /this\.pathLoadedKey = pathKey;[\s\S]*this\.setData\(\{ pathLoading: false \}\)/,
  );
  assert.match(page, /this\.pathLoadedKey = "";/);
  assert.doesNotMatch(
    page.slice(
      page.indexOf("const recent = await loadTournamentSeasonPath"),
      page.indexOf("if (window.hasOlder)"),
    ),
    /this\.pathLoadedKey = pathKey/,
  );
});

test("league view failures take precedence over misleading empty states", async () => {
  const { readFileSync } = await import("node:fs");
  const template = readFileSync(
    new URL(
      "../miniprogram/pages/my-fpl/leagues/leagues.wxml",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    template,
    /<app-error-state[\s\S]*wx:if="\{\{viewError && \(\(showSeason && !hasSeasonData\) \|\| \(showGameweek && !hasGwData\)\)\}\}"[\s\S]*message="\{\{viewError\}\}"[\s\S]*bind:retry="onRetry"/,
  );
  assert.match(template, /!hasSeasonData && !viewError/);
  assert.match(template, /!hasGwData && !viewError/);
  assert.match(
    template,
    /showSeason && !viewLoading && \(!viewError \|\| hasSeasonData\)/,
  );
  assert.match(
    template,
    /showGameweek && !viewLoading && \(!viewError \|\| hasGwData\)/,
  );
});

test("My FPL board loads every server page before local search and sort", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../miniprogram/pages/my-fpl/leagues/leagues.ts", import.meta.url),
    "utf8",
  );
  const template = readFileSync(
    new URL(
      "../miniprogram/pages/my-fpl/leagues/leagues.wxml",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(page, /getCompleteMyFplCompetitionBoard/);
  assert.doesNotMatch(
    page,
    /getMyFplCompetitionBoard\([\s\S]{0,160}?\b1,\s*\b100,/,
  );
  assert.match(page, /currentMyFplEntryId/);
  assert.match(template, /boardTotalRows \|\| boardRows\.length/);
  assert.doesNotMatch(template, /再显示 20 队/);
  assert.match(template, /bindtap="onPreviousBoardPage"/);
  assert.match(template, /bindtap="onNextBoardPage"/);
});

test("large My FPL boards use a bounded 20-row UI window", () => {
  const rows = Array.from({ length: 1567 }, (_, index) => index + 1);
  const first = leaguesModule.paginateBoardRows(rows, 1);
  assert.deepEqual(
    {
      rows: first.rows.length,
      page: first.page,
      pageCount: first.pageCount,
      from: first.from,
      to: first.to,
      previous: first.hasPrevious,
      next: first.hasNext,
    },
    {
      rows: 20,
      page: 1,
      pageCount: 79,
      from: 1,
      to: 20,
      previous: false,
      next: true,
    },
  );

  const last = leaguesModule.paginateBoardRows(rows, 999);
  assert.deepEqual(last.rows, [1561, 1562, 1563, 1564, 1565, 1566, 1567]);
  assert.deepEqual(
    {
      page: last.page,
      from: last.from,
      to: last.to,
      previous: last.hasPrevious,
      next: last.hasNext,
    },
    { page: 79, from: 1561, to: 1567, previous: true, next: false },
  );
});

test("My FPL leagues sends every no-team viewer to team selection", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../miniprogram/pages/my-fpl/leagues/leagues.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    page,
    /requiresMyFplAccountLink|goToAccountLink|accountLinkRequired/,
  );
  assert.match(page, /emptyTitle: "先选择我的球队"/);
  assert.match(
    page,
    /if \(this\.data\.emptyState === "entry"\) \{\s*goToEntrySearch\(\)/,
  );
});

test("My FPL league views refresh viewer authority after authorization loss", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../miniprogram/pages/my-fpl/leagues/leagues.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /let viewerEntryRecoveryAttempted = false/);
  assert.match(
    page,
    /isViewerEntryAuthorizationError\(error\)[\s\S]*?await refreshAuthoritativeFollow\(\)[\s\S]*?showEntryEmptyState\(\)[\s\S]*?void this\.loadLeagues\(true, trace\)/,
  );
  assert.match(page, /viewError: "球队状态尚未同步，请稍后重试"/);
});

test("My FPL entry removal clears retained view data and invalidates requests", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../miniprogram/pages/my-fpl/leagues/leagues.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    /showEntryEmptyState\(\)[\s\S]*this\.clearEntryScopedViewState\(\)/,
  );
  assert.match(
    page,
    /if \(principalChanged \|\| seasonChanged\) \{\s*this\.clearEntryScopedViewState\(\)/,
  );
  assert.match(
    page,
    /clearEntryScopedViewState\(\)[\s\S]*this\.viewRequestId \+= 1[\s\S]*this\.pathRequestId \+= 1[\s\S]*this\.seasonRows = \[\][\s\S]*this\.gwRows = \[\][\s\S]*\.\.\.emptyPathState\(\)/,
  );
  assert.match(page, /this\.loadedEntryId = 0[\s\S]*this\.loadedEvent = 0/);
});

test("season path window loads the latest 8 gameweeks first", () => {
  assert.deepEqual(leaguesModule.seasonPathWindow(1, 38), {
    recentStart: 31,
    recentEnd: 38,
    hasOlder: true,
    olderEnd: 30,
  });
  assert.deepEqual(leaguesModule.seasonPathWindow(1, 6), {
    recentStart: 1,
    recentEnd: 6,
    hasOlder: false,
    olderEnd: 0,
  });
  assert.notEqual(
    leaguesModule.seasonPathCacheKey(9, 6953, 1),
    leaguesModule.seasonPathCacheKey(9, 6953, 2),
    "the cached season path must advance with the through-event",
  );
});
