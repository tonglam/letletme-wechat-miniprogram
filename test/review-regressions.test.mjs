import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pricePage = readFileSync(
  new URL("../miniprogram/pages/explore/price-changes/price-changes.ts", import.meta.url),
  "utf8",
);
const priceService = readFileSync(
  new URL("../miniprogram/services/price-change.service.ts", import.meta.url),
  "utf8",
);

test("price prediction resumes an interrupted first load after returning", () => {
  assert.match(pricePage, /loadPending: false/);
  assert.match(pricePage, /this\.loadPending = true;[\s\S]*this\.refreshPending = forceRefresh/);
  assert.match(
    pricePage,
    /this\.resumeForceRefresh = this\.resumeForceRefresh[\s\S]*\|\| this\.refreshPending[\s\S]*\|\| this\.loadPending;/,
  );
  assert.match(
    pricePage,
    /if \(resumed && \(this\.resumeForceRefresh \|\| refreshExpired\)\)[\s\S]*loadData\("show", true\)/,
  );
  assert.match(
    pricePage,
    /finally \{\s+if \(isActive\(\)\) \{\s+this\.loadPending = false;/,
  );
  assert.match(
    pricePage,
    /refreshExpired = this\.lastSuccessfulLoadAt > 0[\s\S]*Date\.now\(\) - this\.lastSuccessfulLoadAt >= AUTO_REFRESH_MS/,
  );
  assert.match(pricePage, /resumed && \(this\.resumeForceRefresh \|\| refreshExpired\)/);
  assert.match(
    pricePage,
    /const authorityPromise = waitForAuthoritativeFollow\(\);[\s\S]*authorityPromise\.then\(\(\) => ensureAppContext/,
  );
});

test("personal price data is bound and cached by the verified account entry", () => {
  assert.match(priceService, /const verifiedEntryId = getVerifiedSessionEntryId\(\);/);
  assert.match(priceService, /!verifiedEntryId \|\| input\.entryId !== verifiedEntryId/);
  assert.match(
    priceService,
    /cacheVariant: `price-change-personal:entry:\$\{verifiedEntryId\}:event:\$\{input\.eventId\}`/,
  );
  assert.match(
    priceService,
    /if \(getVerifiedSessionEntryId\(\) !== verifiedEntryId\)[\s\S]*unavailablePersonalContext\("unbound"\)/,
  );
  assert.match(
    priceService,
    /if \(read\.meta\.stale\) \{[\s\S]*unavailablePersonalContext\("unavailable"\)/,
  );
});

test("price prediction falls back to its dedicated last-good board after request failure", () => {
  assert.match(priceService, /function lastGoodPriceChangeBoardRead\(\)/);
  assert.match(
    priceService,
    /catch \(error\) \{[\s\S]*lastGoodPriceChangeBoardRead\(\)[\s\S]*if \(lastGood\) return lastGood;[\s\S]*throw error/,
  );
});

test("price prediction restores account authority and revalidates after a long hide", () => {
  assert.match(
    pricePage,
    /const authorityPromise = waitForAuthoritativeFollow\(\);[\s\S]*authorityPromise\.then\(\(\) => ensureAppContext/,
  );
  assert.match(pricePage, /Promise\.all\(\[contextPromise, boardPromise\]\)/);
  assert.match(pricePage, /ensureAppContext\(\{[\s\S]*?forceRefresh,[\s\S]*?trace,[\s\S]*?\}\)/);
  assert.match(pricePage, /entryId: currentMyFplEntryId\(\) \?\? null/);
  assert.match(pricePage, /defaultScopeInitialized: false/);
  assert.match(pricePage, /!this\.defaultScopeInitialized && personal\.squadElementIds\.length > 0/);
  assert.match(pricePage, /!this\.scopeUserSelected && followsPreviousDefault/);
  assert.match(pricePage, /lastSuccessfulLoadAt: 0/);
  assert.match(pricePage, /Date\.now\(\) - this\.lastSuccessfulLoadAt >= AUTO_REFRESH_MS/);
  assert.match(pricePage, /this\.lastSuccessfulLoadAt = Date\.now\(\)/);
});
