import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");
const page = readFileSync(
  join(root, "miniprogram/pages/explore/price-changes/price-changes.ts"),
  "utf8",
);
const view = readFileSync(
  join(root, "miniprogram/pages/explore/price-changes/price-changes.wxml"),
  "utf8",
);
const service = readFileSync(
  join(root, "miniprogram/services/price-change.service.ts"),
  "utf8",
);
const cachePolicy = readFileSync(
  join(root, "miniprogram/services/graphql-cache-policy.ts"),
  "utf8",
);
const pageConfig = JSON.parse(readFileSync(
  join(root, "miniprogram/pages/explore/price-changes/price-changes.json"),
  "utf8",
));

test("price prediction uses the canonical GraphQL board and a public cache policy", () => {
  assert.match(service, /query GetPriceChangeBoard/);
  assert.match(service, /priceChangeBoard\s*\{/);
  assert.match(service, /cacheTtl:\s*5 \* MINUTE/);
  assert.match(service, /LAST_GOOD_MAX_AGE_MS = DAY/);
  assert.match(cachePolicy, /GetPriceChangeBoard:\s*\{ authMode: "public"/);
  assert.match(service, /const START_PRICE_BATCH_SIZE = 2;/);
  assert.match(service, /startPrices\[String\(entry\.playerId\)\] = value\.startPrice;/);
});

test("price prediction exposes the web-equivalent mobile controls and caveat", () => {
  assert.match(view, /我的阵容/);
  assert.match(view, /全部球员/);
  assert.match(view, /movementOptions/);
  assert.match(view, /onTeamChange/);
  assert.match(view, /onSortChange/);
  assert.match(view, /复制分享/);
  assert.match(view, /不是价格保证/);
  assert.match(page, /AUTO_REFRESH_MS = 5 \* 60 \* 1000/);
  assert.match(page, /onShareAppMessage/);
});

test("price prediction resumes an interrupted first load after returning", () => {
  assert.match(
    page,
    /this\.resumeForceRefresh = this\.resumeForceRefresh[\s\S]*\|\| this\.refreshPending[\s\S]*\|\| this\.data\.loading;/,
  );
  assert.match(page, /if \(resumed && this\.resumeForceRefresh\)[\s\S]*loadData\("show", true\)/);
});

test("personal price data is bound and cached by the verified account entry", () => {
  assert.match(service, /const verifiedEntryId = getVerifiedSessionEntryId\(\);/);
  assert.match(service, /!verifiedEntryId \|\| input\.entryId !== verifiedEntryId/);
  assert.match(
    service,
    /cacheVariant: `price-change-personal:entry:\$\{verifiedEntryId\}:event:\$\{input\.eventId\}`/,
  );
  assert.match(
    service,
    /if \(getVerifiedSessionEntryId\(\) !== verifiedEntryId\)[\s\S]*unavailablePersonalContext\("unbound"\)/,
  );
});

test("price prediction is a tracked registered Explore page", () => {
  const app = readFileSync(join(root, "miniprogram/app.json"), "utf8");
  const routes = readFileSync(join(root, "miniprogram/config/routes.ts"), "utf8");
  assert.match(app, /pages\/explore\/price-changes\/price-changes/);
  assert.match(routes, /explorePriceChanges/);
  assert.match(page, /PerformancePage\(/);
  assert.match(view, /id="perf-primary-content"/);
  assert.doesNotMatch(view, /app-loading id="perf-primary-content"/);
  assert.match(view, /bottomNavBar active="explore"/);
  assert.equal("enableShareAppMessage" in pageConfig, false);
  assert.equal("enableShareTimeline" in pageConfig, false);
});
