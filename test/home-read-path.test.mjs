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

describe("home public read path", () => {
  it("uses one compact public supplement operation", () => {
    assert.match(service, /query MiniHomeSupplement/);
    assert.doesNotMatch(service, /\$eventId: Int!/);
    assert.doesNotMatch(service, /\$changeDate/);
    assert.match(service, /eventOverallResult\s*\{/);
    assert.match(service, /miniProgramNotice/);
    assert.match(service, /eventOverallResult/);
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
});
