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

  it("commits fixtures before starting secondary data", () => {
    const fixtureCommit = home.indexOf("recordRenderCommit");
    const secondaryStart = home.indexOf("void this.loadSecondaryData");
    assert.ok(fixtureCommit >= 0 && secondaryStart > fixtureCommit);
  });

  it("refreshes event context only when missing or expired", () => {
    assert.match(home, /contextMissing \|\| deadlineExpired/);
    assert.doesNotMatch(home, /refreshEventAndDeadline/);
  });
});
