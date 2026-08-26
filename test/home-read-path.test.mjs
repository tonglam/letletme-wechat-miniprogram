import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const service = readFileSync(
  new URL("../miniprogram/services/home.service.ts", import.meta.url),
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

  it("rides recorded price changes on the existing market pulse query", () => {
    assert.match(service, /marketPulse\(days: \$days\) \{[\s\S]*?priceChanges \{[\s\S]*?changeDate[\s\S]*?oldPrice[\s\S]*?newPrice[\s\S]*?direction/);
    assert.match(service, /mapPriceChanges/);
    assert.match(service, /priceRisers/);
    assert.match(service, /priceFallers/);
  });

  it("loads the prediction board lazily from the price tab only", () => {
    assert.match(home, /onSelectMarketTab[\s\S]*?tab === "price"[\s\S]*?loadPricePredictions/);
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
    assert.match(
      home,
      /supplement\.summary\?\.event[\s\S]*?loadDreamTeam\(summaryEvent/,
    );
  });

  it("renders the dream team on the shared squad pitch with share actions", () => {
    assert.match(homeJson, /squad-pitch/);
    assert.match(homeWxml, /<squad-pitch[\s\S]*?bind:playertap="onDreamPlayerTap"/);
    assert.match(home, /buildDreamTeamPitchState/);
    assert.match(home, /onDreamPlayerTap[\s\S]*?goToPlayerDetail/);
    assert.match(home, /onShareDreamPitch[\s\S]*?exportPortraitShareImage[\s\S]*?presentSquadPitchShareImage/);
    assert.match(home, /onCopyDreamShare[\s\S]*?formatGameweekShareText[\s\S]*?"dreamTeam"/);
  });

  it("routes tappable GW stat tiles to entry and player pages", () => {
    assert.match(home, /targetId: Number\(summary\.highestScoringEntry\)/);
    assert.match(home, /targetId: Number\(summary\.mostCaptainedPlayer\?\.id\)/);
    assert.match(home, /key === "highestScore"[\s\S]*?goToLiveEntry/);
    assert.match(home, /onOpenGameweekStats[\s\S]*?routes\.summaryGameweek/);
  });

  it("shows a LIVE strip once the deadline passes and resets backoff on a fresh deadline", () => {
    assert.match(home, /deadlinePassed: Boolean\(utcDeadline\) && getDeadlineDiffMs\(utcDeadline\) <= 0/);
    assert.match(home, /patch\.deadlinePassed = passed/);
    assert.match(home, /this\._deadlineRetryAttempts = 0/);
  });

  it("shares the countdown card as copyable text with cleanup on hide", () => {
    assert.match(homeWxml, /deadline-share[\s\S]*?catchtap="onCopyDeadlineShare"/);
    assert.match(
      home,
      /onCopyDeadlineShare\(\) \{[\s\S]*?formatDeadlineShareText\(\{[\s\S]*?event: this\.data\.nextGw[\s\S]*?passed: this\.data\.deadlinePassed[\s\S]*?\}\)[\s\S]*?copyShareText/,
    );
    assert.match(home, /onHide\(\) \{[\s\S]*?clearDeadlineShareCopiedTimer/);
    assert.match(home, /onUnload\(\) \{[\s\S]*?clearDeadlineShareCopiedTimer/);
    const util = readFileSync(
      new URL("../miniprogram/utils/deadline-share.ts", import.meta.url),
      "utf8",
    );
    assert.match(util, /export function formatDeadlineShareText/);
    assert.match(util, /passed/);
  });

  it("exports the countdown card as a branded share image", () => {
    assert.match(homeWxml, /catchtap="onShareDeadlineImage"/);
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
});
