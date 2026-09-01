import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("My FPL uses the V2.1 settled tournament-review contract", async () => {
  const [page, template, service] = await Promise.all([
    read("miniprogram/pages/my-fpl/leagues/leagues.ts"),
    read("miniprogram/pages/my-fpl/leagues/leagues.wxml"),
    read("miniprogram/services/tournament.service.ts"),
  ]);

  assert.match(service, /my-tournament-review-v2\.1/);
  assert.match(page, /getMyTournamentReviewCatalog/);
  assert.match(page, /getMyTournamentGameweekReview/);
  assert.match(page, /getMyTournamentSeasonReview/);
  assert.match(page, /getMyTournamentSeasonReviewSection/);
  assert.match(page, /latestFinalizedEventId/);
  assert.match(service, /previousReadyEventId/);
  assert.match(page, /isViewerEntryAuthorizationError/);
  assert.match(page, /requestId === this\.requestId/);
  assert.match(page, /requestId === this\.viewRequestId/);
  assert.doesNotMatch(page, /getMyFplCompetition|readTournamentsCache|v2Enabled/);
  assert.doesNotMatch(page, /mapStaleTournamentReviewData/);

  assert.match(template, /已结算快照复盘中心/);
  assert.match(template, /本轮积分（Gross）/);
  assert.match(template, /Net（赛事排名）/);
  assert.match(template, /H2H 对战/);
  assert.match(template, /淘汰赛晋级路径/);
  assert.match(template, /前往 Live 查看未结算数据/);
  assert.match(template, /v2Season\.phases/);
  assert.doesNotMatch(template, /freshness\.ageSeconds/);
  assert.doesNotMatch(template, /wx:else[\s\S]*v1/i);

  assert.match(service, /MY_TOURNAMENT_REVIEW_CONTRACT/);
  assert.match(service, /MyTournamentReviewCatalog/);
  assert.match(service, /MyTournamentReviewSeasonSection/);
  assert.match(service, /first: Math\.min\(100/);
  assert.match(service, /staleTtl: 0/);
  assert.doesNotMatch(service, /GET_MY_FPL_COMPETITION|MyFplCompetition/);
});

test("the Mini catalog is connection-shaped and supports a custom setup shell", async () => {
  const service = await read("miniprogram/services/tournament.service.ts");
  const page = await read("miniprogram/pages/my-fpl/leagues/leagues.ts");

  assert.match(service, /edges: Array<\{ cursor: string; node: MyTournamentReviewCatalogItem \}>/);
  assert.match(service, /pageInfo: MyTournamentReviewPageInfo/);
  assert.match(service, /setupStatus: string/);
  assert.match(service, /latestFinalizedScope/);
  assert.match(service, /adminReadAll/);
  assert.match(page, /scopeOverride/);
  assert.match(page, /v2Scope === "ALL"/);
  assert.match(page, /catalog\.viewerEntryId/);
});

test("latest finalized non-ready data stays visible as state and is never silently replaced", async () => {
  const [page, template] = await Promise.all([
    read("miniprogram/pages/my-fpl/leagues/leagues.ts"),
    read("miniprogram/pages/my-fpl/leagues/leagues.wxml"),
  ]);

  assert.match(page, /const eventId = selected\?\.latestFinalizedEventId \?\? 0/);
  assert.match(page, /const visibleState = visibleMeta\.state/);
  assert.match(page, /v2State: visibleState/);
  assert.match(page, /state === "READY"/);
  assert.match(template, /v2State !== 'READY'/);
  assert.match(template, /不会回退到旧快照/);
  assert.match(template, /未结算数据统一前往 Live/);
});

test("review pagination and upgrade recovery remain bounded", async () => {
  const [page, service] = await Promise.all([
    read("miniprogram/pages/my-fpl/leagues/leagues.ts"),
    read("miniprogram/services/tournament.service.ts"),
  ]);

  assert.match(page, /async onV2LoadMore/);
  assert.match(page, /sectionPageInfo/);
  assert.match(page, /payloadCursor/);
  assert.match(page, /mergePayload/);
  assert.match(page, /mergeSection/);
  assert.match(page, /isClientUpgradeRequired/);
  assert.match(page, /getUpdateManager/);
  assert.match(service, /first: 100/);
  assert.match(service, /first: 50/);
  assert.doesNotMatch(service, /contentSha256/);
});

test("the Mini review cache is keyed to V2.1 and cannot serve transient review state", async () => {
  const [service, cachePolicy] = await Promise.all([
    read("miniprogram/services/graphql.service.ts"),
    read("miniprogram/services/graphql-cache-policy.ts"),
  ]);
  assert.match(service, /operationName === "MyTournamentReviewCatalog"/);
  assert.match(service, /edge\.node\?\.state === "READY"/);
  assert.match(service, /operationName === "MyTournamentSeasonReviewSection"/);
  assert.match(cachePolicy, /MyTournamentReviewCatalog/);
  assert.match(cachePolicy, /MyTournamentSeasonReviewSection/);
});
