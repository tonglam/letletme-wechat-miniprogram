import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.Page = globalThis.Page || ((definition) => definition);

const homeModule = await import("../miniprogram/pages/home/index/index.ts");

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("home starts entry/market/supplement with fixtures, not after fixture commit", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  const secondaryStart = page.indexOf("void this.loadSecondaryData");
  const fixtureAwait = page.indexOf("const fixtureResult = await fixtureTask");
  const primaryCommit = page.indexOf(
    "fixtureDeskState(fixtureResult.fixtures)",
  );
  assert.ok(
    secondaryStart >= 0 &&
      fixtureAwait > secondaryStart &&
      primaryCommit > fixtureAwait,
    "secondary must start before awaiting fixtures so the personal desk is not gated",
  );
  assert.match(
    page,
    /await this\.syncAppState\([\s\S]*tracker\?\.mark\("primaryRequestStartAt"\)/,
  );
  assert.match(
    page,
    /syncAppState\(extra: Partial<HomeData> = \{\}\): Promise<void>[\s\S]*return setDataAsync\(this/,
  );
  assert.doesNotMatch(
    page,
    /this\._loadedContextRevision = context\.contextRevision;\s*this\.syncAppState\(\);\s*this\.startCountdown\(\);\s*await this\.loadPage\(\)/,
  );
  assert.match(page, /Promise\.all\(\[marketTask, supplementTask\]\)/);
  assert.match(
    page,
    /getEntryInfo[\s\S]*this\.setData\(\{ entry, entryError: "" \}\)/,
  );
  assert.match(
    page,
    /getEntryLeagueInfo/,
  );
  assert.match(page, /getMiniHomePersonalLeagues/);
  assert.match(page, /homePersonalLeaguesMatchEntry/);
  const homeService = source("miniprogram/services/home.service.ts");
  assert.match(homeService, /const verifiedEntryId = getVerifiedSessionEntryId\(\)/);
  assert.match(homeService, /cacheVariant: `home-personal:entry:\$\{verifiedEntryId\}`/);
  assert.match(homeService, /homePersonalDesk \{\s+entryId\s+state/);
  assert.match(homeService, /deskEntryId !== verifiedEntryId/);
  assert.match(homeService, /entryId: deskEntryId/);
  assert.match(
    homeService,
    /desk\.state === "STALE" \|\| result\.meta\.stale/,
    "stale personal desks must fall back instead of rendering old H2H scores as live",
  );
  assert.equal(
    (page.match(/getEntryLeagueInfo\(entryId,/g) || []).length,
    1,
    "home should issue one aggregate league request",
  );
  assert.doesNotMatch(
    page,
    /getEntryClassicLeagues|getEntryH2hLeagues|classicTask|h2hTask/,
    "home must not retain the former split league request path",
  );
  const entryCard = source("miniprogram/components/entry-card/entry-card.wxml");
  assert.match(entryCard, /item\.h2h\.eventLabel/);
  assert.match(entryCard, /item\.h2h\.statusLabel/);
  assert.match(entryCard, /item\.h2h\.viewer\.primary/);
  assert.match(entryCard, /item\.h2h\.opponent\.primary/);
  assert.match(entryCard, /item\.h2h\.centerLabel/);
  assert.match(page, /getMiniHomeMarket/);
  assert.match(page, /getMiniHomeSupplement/);
});

test("home deadline pill is the next-event GW badge, matching the web scoreboard", () => {
  const template = source("miniprogram/pages/home/index/index.wxml");
  const deadline = template.slice(
    template.indexOf("deadline-card"),
    template.indexOf("perf-primary-fixtures"),
  );
  assert.match(deadline, /下一轮截止/);
  assert.match(
    deadline,
    /wx:if="\{\{nextGw\}\}"[\s\S]*class="gw-pill-dark">GW\{\{nextGw\}\}/,
  );
  assert.doesNotMatch(deadline, /Current GW/);
  assert.doesNotMatch(deadline, /Next GW/);
  assert.doesNotMatch(deadline, /GW\{\{nextGw \|\| '-' \}\} Deadline/);
});

test("home transfer desk matches the web market teaser, not a renamed price list", () => {
  const template = source("miniprogram/pages/home/index/index.wxml");
  const service = source("miniprogram/services/home.service.ts");
  assert.match(template, /marketMode === 'ownership'/);
  assert.match(template, /availabilityRows/);
  assert.match(service, /availabilityUpdates/);
  const retiredOwnershipField = "ownership" + "Movers";
  assert.doesNotMatch(service, new RegExp(retiredOwnershipField));
  assert.match(service, /marketOwnershipDay/);
  assert.match(service, /mostSelected/);
  assert.doesNotMatch(service, /latest真实身价变化|最新真实身价变化/);
});

test("breaking market contract is protected by a non-cancelable update gate", () => {
  const app = source("miniprogram/app.ts");
  assert.match(app, /this\.installMandatoryUpdateGuard\(\)/);
  assert.match(app, /wx\.getUpdateManager\(\)/);
  assert.match(app, /showCancel:\s*false/);
  assert.match(app, /updateManager\.applyUpdate\(\)/);
});

test("market ownership requests clear stale tiles and resume after a hidden page", () => {
  const page = source("miniprogram/pages/data/price/price.controller.ts");
  assert.match(page, /ownershipPending: false/);
  assert.match(page, /resumeOwnershipAfterShow/);
  assert.match(
    page,
    /this\.resumeOwnershipAfterShow\s*=\s*this\.resumeOwnershipAfterShow\s*\|\|\s*this\.ownershipPending/,
  );
  assert.match(page, /this\.ownershipData = null;/);
  assert.match(
    page,
    /ownershipDateOptions\(\s*pulse\.snapshot\?\.snapshotDate/,
  );
});

test("home accepts a personal league desk only for the same entry id", () => {
  assert.equal(
    homeModule.homePersonalLeaguesMatchEntry(
      { entryId: 6953, entryName: "Same name", playerName: "Same manager" },
      { entryId: 6953, entryName: "Different", playerName: "Different" },
    ),
    true,
  );
  assert.equal(
    homeModule.homePersonalLeaguesMatchEntry(
      { entryId: 6953, entryName: "Same name", playerName: "Same manager" },
      { entryId: 8743559, entryName: "Same name", playerName: "Same manager" },
    ),
    false,
  );
  assert.equal(
    homeModule.homePersonalLeaguesMatchEntry(
      { entryName: "Same name", playerName: "Same manager" },
      { entryId: 6953, entryName: "Same name", playerName: "Same manager" },
    ),
    false,
  );
});

test("home first viewport order matches the web: deadline, team desk, market, then fixtures last", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  const template = source("miniprogram/pages/home/index/index.wxml");
  const bindTeam = template.indexOf("bind-team");
  const deadline = template.indexOf("deadline-card");
  const boundEntry = template.lastIndexOf("<entry-card");
  const market = template.indexOf("transfer-desk");
  const gwStats = template.indexOf("gw-stats-card");
  const fixtures = template.indexOf("perf-primary-fixtures");
  assert.ok(
    bindTeam >= 0 && bindTeam < deadline,
    "unbound bind CTA sits above public desks",
  );
  assert.ok(
    deadline >= 0 &&
      boundEntry > deadline &&
      market > boundEntry &&
      gwStats > market &&
      fixtures > gwStats,
    "web order: deadline, personal desk, transfer desk, stats, fixtures last",
  );
  assert.match(template, /市场动态/);
  assert.match(template, /打开市场/);
  assert.match(template, /持有上升/);
  assert.match(template, /持有下降/);
  assert.match(template, /出场状态观察/);
  assert.match(template, /市场动态|marketLeadTitle/);
  assert.match(template, /notice-strip/);
  assert.match(template, /noticeText/);
  assert.match(page, /noticeText: supplement\.notice|noticeText: nextNotice/);
  assert.match(page, /NOTICE_AUTO_CLOSE_MS = 5 \* 1000/);
  assert.match(page, /scheduleNoticeAutoClose/);
  assert.doesNotMatch(template, /section-title">身价变化/);
  assert.match(template, /bind-team[\s\S]*onChangeEntry[\s\S]*onGoAccountLink/);
  assert.match(template, /accountLinkReady && !accountLinked/);
  assert.doesNotMatch(template, /选择球队后开始/);
});

test("desks use quiet text actions, not filled pills", () => {
  const entry = source("miniprogram/components/entry-card/entry-card.wxml");
  const filter = source("miniprogram/components/filter-bar/filter-bar.wxml");
  const buttons = source("miniprogram/app.wxss");
  assert.match(entry, /class="action"[^>]*>切换/);
  assert.doesNotMatch(entry, /btn-primary|btn-compact|<button/);
  assert.match(filter, /class="action[^"]*filter-reset"/);
  assert.doesNotMatch(
    buttons,
    /btn-compact[^{]*\{[^}]*border-radius:\s*999rpx/,
  );
});

test("home fixtures follow the web desk: day tabs, score-or-time, no FDR, live board link", () => {
  const template = source("miniprogram/pages/home/index/index.wxml");
  assert.match(template, /近期赛程/);
  assert.match(template, /onOpenLiveMatches/);
  assert.match(template, /打开实时比赛/);
  assert.match(template, /selectedDayRows/);
  assert.match(template, /item\.homeName/);
  assert.match(template, /item\.centerLabel/);
  assert.doesNotMatch(template, /fdr-/);
  assert.doesNotMatch(template, /fixture-vs/);
});

test("groupHomeFixturesByDay buckets by local date and prefers today", () => {
  const grouped = homeModule.groupHomeFixturesByDay(
    [
      {
        id: 1,
        teamName: "Arsenal",
        teamShortName: "ARS",
        againstTeamName: "Chelsea",
        againstTeamShortName: "CHE",
        kickoffTime: new Date(2026, 7, 15, 19, 30).toISOString(),
        finished: false,
      },
      {
        id: 2,
        teamShortName: "LIV",
        againstTeamShortName: "MUN",
        kickoffTime: new Date(2026, 7, 15, 21, 0).toISOString(),
        finished: true,
        homeScore: 2,
        awayScore: 1,
      },
      {
        id: 3,
        teamShortName: "MCI",
        againstTeamShortName: "TOT",
        kickoffTime: new Date(2026, 7, 16, 21, 0).toISOString(),
        finished: false,
      },
    ],
    new Date(2026, 7, 16, 8, 0),
  );
  assert.equal(grouped.days.length, 2);
  assert.equal(grouped.selectedDayKey, grouped.days[1].dateKey);
  assert.equal(grouped.days[0].rows.length, 2);
  assert.equal(grouped.days[0].rows[0].homeName, "Arsenal");
  assert.equal(grouped.days[0].rows[0].awayName, "Chelsea");
  assert.equal(grouped.days[0].rows[1].centerLabel, "2-1");
  assert.equal(grouped.days[0].rows[1].finished, true);
  assert.match(grouped.days[0].rows[0].centerLabel, /^\d{2}:\d{2}$/);
});

test("home secondary completion stays on the navigation tracker that started it", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  assert.match(
    page,
    /loadPage\([\s\S]*originatingTracker\?: PagePerformanceTracker \| null[\s\S]*originatingTracker === undefined/,
  );
  assert.match(
    page,
    /loadSecondaryData\(requestId, currentGw, forceRefresh, trace, tracker\)/,
  );
  assert.match(
    page,
    /loadSecondaryData\([\s\S]*tracker: PagePerformanceTracker \| null[\s\S]*tracker\?\.mark\("secondaryCompleteAt"\)/,
  );
  assert.doesNotMatch(
    page,
    /this\._perfTracker\?\.mark\("secondaryCompleteAt"\)/,
  );
});

test("home pull refresh does not force CurrentEventInfo while context is fresh", () => {
  const page = source("miniprogram/pages/home/index/index.ts");
  assert.match(
    page,
    /const contextMissing = !app\.globalData\.season[\s\S]*!app\.globalData\.gw[\s\S]*!app\.globalData\.nextGw;[\s\S]*const refreshContext = contextMissing \|\| deadlineExpired;[\s\S]*if \(refreshContext\)[\s\S]*forceRefresh: true/,
  );
  assert.match(
    page,
    /else \{[\s\S]*ensureAppContext\(\{[\s\S]*reason: "pull-refresh"[\s\S]*\}\);[\s\S]*loadPage\(true, tracker\)/,
  );
  assert.doesNotMatch(
    page,
    /const forceContextForUserRefresh = !deadlineTriggered/,
  );
});

test("preseason GW summary with highestScore 0 hides the home stats card", () => {
  assert.deepEqual(
    homeModule.mapHomeGameweekStats({ highestScore: 0, chipPlays: [] }),
    [],
    "a lone zero highest score is placeholder data, not a published GW",
  );
  assert.deepEqual(
    homeModule
      .mapHomeGameweekStats({
        highestScore: 98,
        mostCaptainedPlayer: { webName: "Haaland" },
      })
      .map((row) => [row.key, row.value]),
    [
      ["highestScore", "98"],
      ["viceCaptain", "Haaland"],
    ],
  );
});

test("home desk errors only claim retained data when content remains", () => {
  assert.equal(
    homeModule.retainedDeskMessage("网络连接失败，请检查网络后重试", false),
    "网络连接失败，请检查网络后重试",
  );
  assert.equal(
    homeModule.retainedDeskMessage("网络连接失败，请检查网络后重试", true),
    "网络连接失败，请检查网络后重试，已保留上次成功数据",
  );
  const template = source("miniprogram/pages/home/index/index.wxml");
  assert.doesNotMatch(template, /priceError\}\}，已保留上次成功数据/);
  assert.doesNotMatch(template, /gameweekStatsError\}\}，已保留上次成功数据/);
  assert.match(template, /marketUnavailable[\s\S]*市场动态暂时无法加载/);
  assert.match(
    template,
    /supplementLoading \|\| gameweekStats\.length > 0/,
  );
  assert.doesNotMatch(
    template,
    /supplementLoading \|\| gameweekStatsError \|\| gameweekStats\.length/,
  );
});
