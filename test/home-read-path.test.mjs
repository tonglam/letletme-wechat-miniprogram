import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const service = readFileSync(
  new URL("../miniprogram/services/home.service.ts", import.meta.url),
  "utf8"
);
const liveService = readFileSync(
  new URL("../miniprogram/services/live.service.ts", import.meta.url),
  "utf8"
);
const home = readFileSync(
  new URL("../miniprogram/pages/home/index/index.ts", import.meta.url),
  "utf8"
);
const homeWxml = readFileSync(
  new URL("../miniprogram/pages/home/index/index.wxml", import.meta.url),
  "utf8"
);
const homeJson = readFileSync(
  new URL("../miniprogram/pages/home/index/index.json", import.meta.url),
  "utf8"
);

describe("home public read path", () => {
  it("uses one compact public supplement operation", () => {
    // The supplement operation stays variable-free so a single cache entry
    // serves any event; event-scoped reads (e.g. the dream team) live in
    // their own operations with their own cache variants.
    const supplement = service.slice(
      service.indexOf("MINI_HOME_SUPPLEMENT_QUERY"),
      service.indexOf("interface MiniHomeSupplementResponse"),
    );
    assert.match(supplement, /query MiniHomeSupplement/);
    assert.doesNotMatch(supplement, /\$eventId: Int!/);
    assert.doesNotMatch(supplement, /\$changeDate/);
    assert.match(supplement, /eventOverallResult\s*\{/);
    assert.match(supplement, /miniProgramNotice/);
    assert.match(supplement, /eventOverallResult/);
    assert.doesNotMatch(service, /playerValues/);
    assert.match(service, /authMode: "public"/);
    assert.match(service, /cachePolicy: "market"/);
  });

  it("does not trigger the former standalone public operations from the page", () => {
    assert.doesNotMatch(home, /getMiniProgramNotice|getPlayerValues|getGameweekStatsForHome/);
    assert.match(home, /getMiniHomeSupplement/);
  });

  it("starts secondary data with fixtures, not after fixture commit", () => {
    const secondaryStart = home.indexOf("void this.loadSecondaryData");
    const fixtureAwait = home.indexOf("const fixtureResult = await fixtureTask");
    const fixtureCommit = home.indexOf("fixtureDeskState(fixtureResult.fixtures)");
    assert.ok(
      secondaryStart >= 0 &&
        fixtureAwait > secondaryStart &&
        fixtureCommit > fixtureAwait,
    );
  });

  it("refreshes the viewer before reading personal home data", () => {
    assert.match(
      home,
      /loadSecondaryData\([\s\S]*?await waitForAuthoritativeFollow\(\);[\s\S]*?const entryId = app\.globalData\.entryId/,
    );
    assert.match(
      home,
      /const entryId = app\.globalData\.entryId;[\s\S]*?if \(!entryId\) \{[\s\S]*?entry: \{\},[\s\S]*?leagues: \[\],[\s\S]*?entryError: ""[\s\S]*?return;/,
    );
  });

  it("clears retained leagues when the authoritative viewer changes", () => {
    assert.match(
      home,
      /const previousEntryId = Number\([\s\S]*?const nextEntryId = Number\([\s\S]*?\.\.\.\(previousEntryId !== nextEntryId \? \{ leagues: \[\] \} : \{\}\)/,
    );
  });

  it("keeps secondary work pending until personal viewer data settles", () => {
    const personalTask = home.indexOf("const personalTask =");
    const publicSettled = home.indexOf(
      "const [marketResult, supplement] = await Promise.all",
    );
    const pendingCleared = home.indexOf("this._secondaryPending = false");
    assert.ok(personalTask >= 0);
    assert.ok(publicSettled > personalTask);
    assert.ok(pendingCleared > publicSettled);
    assert.match(
      home,
      /const personalTask = \(async \(\): Promise<void> =>[\s\S]*?await personalTask;[\s\S]*?this\._secondaryPending = false/,
    );
  });

  it("refreshes event context only when missing or expired", () => {
    assert.match(home, /contextMissing \|\| deadlineExpired/);
    assert.doesNotMatch(home, /refreshEventAndDeadline/);
  });

  it("rides recorded price changes on the web's homeMarketDesk query", () => {
    // Web parity (GET_HOME_MARKET_DESK): the desk serves price changes for the
    // latest change date only — marketPulse(days: 7) mixed the whole week's
    // change dates into one list, which is what made the card look wrong.
    assert.match(service, /homeMarketDesk \{/);
    assert.doesNotMatch(service, /marketPulse\(days: \$days\)/);
    assert.doesNotMatch(service, /marketOwnershipDay/);
    assert.match(service, /priceChanges \{[\s\S]*?changeDate[\s\S]*?oldPrice[\s\S]*?newPrice[\s\S]*?direction/);
    assert.match(service, /capturedAt/);
    assert.match(service, /ownershipState/);
    assert.match(service, /priceChangesState/);
    assert.match(service, /availabilityState/);
    assert.match(service, /mapPriceChanges/);
    assert.match(service, /priceRisers/);
    assert.match(service, /priceFallers/);
  });

  it("labels each market view with its own 更新于 capture time", () => {
    // Web LocalUpdatedLabel parity: per-view capture time + fallback copy.
    assert.match(home, /buildMarketUpdatedLabels/);
    // Slice instead of a brace-matched regex: the helper's inline parameter
    // type closes with a line-leading `}` that would end the match early.
    const helper = home.slice(
      home.indexOf("export function buildMarketUpdatedLabels"),
      home.indexOf("export function predictionUpdatedLabel"),
    );
    assert.ok(helper.length > 0, "buildMarketUpdatedLabels helper exists");
    // Ownership: coverage.capturedAt ?? desk.capturedAt, AVAILABLE-only.
    assert.match(helper, /ownershipState === "AVAILABLE"/);
    assert.match(helper, /formatLocalCapturedAt\(market\.ownershipCapturedAt\) \|\| captured/);
    assert.match(helper, /market\.coverage/);
    // Availability: desk.capturedAt, "更新于 —" fallback.
    assert.match(helper, /更新于 —/);
    // Price today: desk.capturedAt, falling back to the latest change date.
    assert.match(helper, /formatCalendarDayLabel\(market\.priceChangeDate\)/);
    // Likely view: prediction board fetchedAt.
    assert.match(home, /predictionUpdatedLabel\(result\.fetchedAt\)/);
    assert.match(homeWxml, /pulseTab === 'ownership' \? marketOwnershipUpdated : marketWatchUpdated/);
    assert.match(homeWxml, /priceTab === 'today' \? priceTodayUpdated : predictionUpdated/);
    // Section states drive the empty/unavailable copy.
    assert.match(homeWxml, /ownershipState === 'UNAVAILABLE' \? '市场数据暂时不可用'/);
    assert.match(homeWxml, /availabilityState === 'UNAVAILABLE' \? '出场状态暂时不可用'/);
    assert.match(homeWxml, /priceChangesState === 'UNAVAILABLE' \? '身价数据暂时不可用'/);
  });

  it("shares both market cards as images (web ShareActions parity)", () => {
    assert.match(homeWxml, /catchtap="onShareMarketImage"/);
    assert.match(homeWxml, /catchtap="onSharePriceImage"/);
    const marketHandler = home.match(/async onShareMarketImage\(\) \{[\s\S]*?\n  \},/);
    assert.ok(marketHandler, "onShareMarketImage handler exists");
    assert.match(marketHandler[0], /exportHomeMarketMoversShareImage/);
    assert.match(marketHandler[0], /exportHomeMarketWatchShareImage/);
    assert.match(marketHandler[0], /presentHomeMarketShareImage/);
    const priceHandler = home.match(/async onSharePriceImage\(\) \{[\s\S]*?\n  \},/);
    assert.ok(priceHandler, "onSharePriceImage handler exists");
    assert.match(priceHandler[0], /title: "涨跌趋势"/);
    assert.match(priceHandler[0], /title: "身价变化"/);
    assert.match(priceHandler[0], /presentHomeMarketShareImage/);
    const image = readFileSync(
      new URL("../miniprogram/utils/home-market-share-image.ts", import.meta.url),
      "utf8",
    );
    assert.match(image, /export function exportHomeMarketMoversShareImage/);
    assert.match(image, /export function exportHomeMarketWatchShareImage/);
    assert.match(image, /drawShareBranding/);
  });

  it("loads the prediction board lazily from the trends tab only", () => {
    assert.match(home, /onSelectPriceTab[\s\S]*?tab === "likely"[\s\S]*?loadPricePredictions/);
    assert.match(home, /getMiniHomePricePredictions/);
    assert.match(
      service,
      /getPriceChangeBoard[\s\S]*?isLikelyToChange[\s\S]*?progressPercent > 0[\s\S]*?progressPercent < 0/,
    );
  });

  it("keeps recorded price rows under the market failure retention rule", () => {
    assert.match(
      home,
      /hasPreviousMarket[\s\S]*?priceRisers\.length > 0[\s\S]*?priceFallers\.length > 0/,
    );
  });

  it("lets the fixture stepper browse back to GW1", () => {
    assert.match(home, /MIN_FIXTURE_GW = 1/);
    assert.match(home, /minFixtureGw: MIN_FIXTURE_GW/);
    assert.doesNotMatch(home, /minFixtureGw: app\.globalData\.nextGw/);
  });

  it("shows live scores and polls every 30s while a match is in progress", () => {
    assert.match(home, /FIXTURE_LIVE_REFRESH_MS = 30 \* 1000/);
    assert.match(home, /fixture\.started === true && !finished/);
    assert.match(home, /setInterval\([\s\S]*?loadFixtureGw\(this\.data\.selectedFixtureGw, true, true\)/);
    assert.match(home, /onHide\(\) \{[\s\S]*?stopFixtureLiveRefresh/);
    assert.match(home, /onUnload\(\) \{[\s\S]*?stopFixtureLiveRefresh/);
  });

  it("loads the dream team for the same event shown in the GW stats card", () => {
    assert.match(service, /query MiniHomeDreamTeam\(\$eventId: Int!\)/);
    assert.match(service, /homeGameweek\(eventId: \$eventId\)/);
    assert.match(service, /dreamTeam \{[\s\S]*?totalPoints/);
    // Player detail sheet stats (GameweekBoardPlayer fields).
    assert.match(service, /dreamTeam \{[\s\S]*?minutes[\s\S]*?goalsScored[\s\S]*?assists[\s\S]*?cleanSheets[\s\S]*?bonus/);
    assert.match(
      home,
      /supplement\.summary\?\.event[\s\S]*?loadDreamTeam\(summaryEvent/,
    );
  });

  it("renders the dream team on the shared squad pitch with share image action", () => {
    assert.match(homeJson, /squad-pitch/);
    assert.match(homeWxml, /<squad-pitch[\s\S]*?bind:playertap="onDreamPlayerTap"/);
    assert.match(home, /buildDreamTeamPitchState/);
    assert.match(home, /onShareDreamPitch[\s\S]*?exportPortraitShareImage[\s\S]*?presentSquadPitchShareImage/);
    // Image-only share: the dream card no longer copies share text.
    assert.doesNotMatch(home, /onCopyDreamShare/);
    assert.doesNotMatch(homeWxml, /onCopyDreamShare/);
  });

  it("opens the player detail sheet on dream player tap (web PlayerDetailModal)", () => {
    assert.match(homeJson, /player-live-sheet/);
    assert.match(
      homeWxml,
      /<player-live-sheet[^>]*show="\{\{playerDetailOpen\}\}"[^>]*bind:close="onClosePlayerDetail"/,
    );
    // Scoped to the handler body so the market-row goToPlayerDetail sibling
    // cannot satisfy these patterns.
    const tapHandler = home.match(
      /onDreamPlayerTap\(event[^)]*\) \{[\s\S]*?\n  \},/,
    );
    assert.ok(tapHandler, "onDreamPlayerTap handler exists");
    assert.match(tapHandler[0], /dreamTeamById\[String\(event\.detail\?\.playerId/);
    assert.match(tapHandler[0], /openPlayerSheet\(player\)/);
    assert.doesNotMatch(tapHandler[0], /goToPlayerDetail/);
    assert.match(home, /indexDreamTeamById\(pitch\.pitchPlayers, result\.players\)/);
    assert.match(home, /onClosePlayerDetail\(\) \{[\s\S]*?playerDetailOpen: false/);
  });

  it("fills the sheet with the full playerLive stat set after opening", () => {
    // Web useMatchPlayerDetail cadence: base row first, playerLive second, so
    // thin card sources (homeGameweek dream team) still show DC/cards/saves.
    const opener = home.match(/openPlayerSheet\(player: LivePlayerRow\) \{[\s\S]*?\n  \},/);
    assert.ok(opener, "openPlayerSheet helper exists");
    assert.match(opener[0], /buildPlayerLiveDetail\(player\)/);
    assert.match(opener[0], /getPlayerLiveStats\(element, eventId\)/);
    assert.match(opener[0], /buildPlayerLiveDetail\(\{[\s\S]*?\.\.\.stats/);
    assert.match(liveService, /playerLive\(playerId: \$playerId, eventId: \$eventId\)/);
    assert.match(liveService, /defensiveContribution totalPoints/);
    assert.match(home, /onClosePlayerDetail\(\) \{\s*this\._playerSheetRequestId \+= 1/);
  });

  it("routes tappable GW stat tiles to entry live points and the player sheet", () => {
    assert.match(home, /targetId: Number\(summary\.highestScoringEntry\)/);
    assert.match(home, /targetId: Number\(summary\.mostCaptainedPlayer\?\.id\)/);
    assert.match(home, /key === "highestScore"[\s\S]*?goToLiveEntry/);
    // Player tiles (top scorer / most captained) open the detail sheet with a
    // base row built from the summary, not the thin standalone page.
    const tapHandler = home.match(/onTapGameweekStat\(event[^)]*\) \{[\s\S]*?\n  \},/);
    assert.ok(tapHandler, "onTapGameweekStat handler exists");
    assert.match(tapHandler[0], /this\._statPlayers\[key\]/);
    assert.match(tapHandler[0], /openPlayerSheet\(player\)/);
    assert.match(home, /buildStatPlayerRows/);
    assert.match(home, /statusText: "最高分球员"/);
    assert.match(home, /statusText: "最多选择队长"/);
    assert.match(home, /onOpenGameweekStats[\s\S]*?routes\.summaryGameweek/);
  });

  it("shows a LIVE strip once the deadline passes and resets backoff on a fresh deadline", () => {
    assert.match(home, /deadlinePassed: Boolean\(utcDeadline\) && getDeadlineDiffMs\(utcDeadline\) <= 0/);
    assert.match(home, /patch\.deadlinePassed = passed/);
    assert.match(home, /this\._deadlineRetryAttempts = 0/);
  });

  it("exports the countdown card as a branded share image", () => {
    assert.match(homeWxml, /catchtap="onShareDeadlineImage"/);
    assert.doesNotMatch(homeWxml, /onCopyDeadlineShare/);
    assert.match(
      home,
      /onShareDeadlineImage[\s\S]*?exportDeadlineShareImage\(\{[\s\S]*?event: this\.data\.nextGw[\s\S]*?passed: this\.data\.deadlinePassed[\s\S]*?\}\)[\s\S]*?presentDeadlineShareImage/,
    );
    const image = readFileSync(
      new URL("../miniprogram/utils/deadline-share-image.ts", import.meta.url),
      "utf8",
    );
    assert.match(image, /export function exportDeadlineShareImage/);
    assert.match(image, /drawShareBranding/);
  });

  it("badges classic league rows with the web visibility labels", () => {
    assert.match(service, /leagueRanks \{[\s\S]*?visibility[\s\S]*?movement/);
    assert.match(service, /visibility: league\.visibility \?\? null/);
    const card = readFileSync(
      new URL("../miniprogram/components/entry-card/entry-card.ts", import.meta.url),
      "utf8",
    );
    const cardWxml = readFileSync(
      new URL("../miniprogram/components/entry-card/entry-card.wxml", import.meta.url),
      "utf8",
    );
    assert.match(card, /visibilityText: "公开"[\s\S]*?visibilityText: "私人"/);
    assert.match(cardWxml, /entry-league-badge \{\{item\.visibilityClass\}\}/);
  });

  it("shares each personal league panel as an image (web PersonalLeagueCarousel)", () => {
    const card = readFileSync(
      new URL("../miniprogram/components/entry-card/entry-card.ts", import.meta.url),
      "utf8",
    );
    const cardWxml = readFileSync(
      new URL("../miniprogram/components/entry-card/entry-card.wxml", import.meta.url),
      "utf8",
    );
    // One share button per panel head; catchtap so the card's open tap does
    // not fire. The full league list is shared, not the visible preview page.
    assert.match(cardWxml, /catchtap="onShareLeagueImage" data-panel="classic"/);
    assert.match(cardWxml, /catchtap="onShareLeagueImage" data-panel="h2h"/);
    assert.match(
      card,
      /async onShareLeagueImage\([\s\S]*exportHomeLeaguesShareImage\(\{[\s\S]*presentHomeLeaguesShareImage\(path\)/,
    );
    assert.match(card, /panel === "h2h" \? this\.data\.h2hLeagues : this\.data\.classicLeagues/);
    assert.match(card, /leagues\.map\(toClassicShareRow\)/);
    assert.match(card, /leagues\.map\(toH2HShareRow\)/);
  });
});
