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
  });

  it("refreshes event context only when missing or expired", () => {
    assert.match(home, /contextMissing \|\| deadlineExpired/);
    assert.doesNotMatch(home, /refreshEventAndDeadline/);
  });
});
