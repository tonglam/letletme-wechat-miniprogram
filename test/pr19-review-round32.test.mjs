import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Live Match resumed startup owns errors and initializes recovery polling", () => {
  const page = read("miniprogram/pages/live/match/match.ts");
  assert.match(
    page,
    /catch \(error\) \{[\s\S]*if \(!context\) \{[\s\S]*if \(!this\.pageVisible \|\| this\.perfTracker !== tracker\) return;[\s\S]*this\.showContextError\(error\)/
  );
  assert.match(
    page,
    /if \(resumeInterruptedLoad\) \{[\s\S]*this\.initLiveRefresh\(\);[\s\S]*if \(resumeInterruptedLoad && !this\.data\.hasData\) \{[\s\S]*loadData\(\{ forceRefresh: true \}\)/
  );
});

test("Live Tournament hide-show replays context, authority, and directory startup", () => {
  const page = read("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(
    page,
    /async initializeFromContext\([\s\S]*await this\.ensureContext\(reason, forceRefresh\)[\s\S]*await app\.authReady[\s\S]*entryId: app\.globalData\.entryId[\s\S]*this\.initLiveRefresh\(\)[\s\S]*await this\.loadTournaments\(forceRefresh, trace\)/
  );
  assert.match(
    page,
    /onShow\(\)[\s\S]*resumeStartupAfterShow[\s\S]*initializeFromContext\("page-show", trace, forceRefresh\)/
  );
  assert.match(
    page,
    /onHide\(\)[\s\S]*if \(this\.startupPending\)[\s\S]*resumeStartupAfterShow = true[\s\S]*startupGeneration \+= 1/
  );
});

test("My FPL Team resumed startup waits for current entry authority", () => {
  const page = read("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(
    page,
    /initializeFromContext\([\s\S]*await app\.authReady[\s\S]*this\.perfTracker !== owningTracker[\s\S]*entryId: app\.globalData\.entryId/
  );
  assert.match(
    page,
    /onShow\(\)[\s\S]*if \(this\.resumeStartupAfterShow\)[\s\S]*initializeFromContext\(false, trace, this\.perfTracker\)/
  );
  assert.match(page, /onHide\(\)[\s\S]*resumeStartupAfterShow = this\.startupPending/);
  assert.match(
    page,
    /if \(!eventResult\) \{[\s\S]*emptyState: "event"[\s\S]*this\.markPrimaryCommit\(tracker\)/
  );
  assert.match(
    page,
    /markPrimaryCommit\(tracker\?: PagePerformanceTracker\)[\s\S]*primarySetDataAt[\s\S]*observePrimary/
  );
});

test("ordinary page metrics ignore intermediate setData until lifecycle settlement", () => {
  const utility = read("miniprogram/utils/performance-page.ts");
  assert.match(utility, /beginLifecycle\(this, generation\)[\s\S]*observeLifecycleSettlement/);
  assert.match(
    utility,
    /if \(!hasPendingLifecycle\(page, generation\)\) \{[\s\S]*schedulePrimaryObservation\(page, generation\)/
  );
  assert.match(
    utility,
    /const settled = \(\) => finishLifecycle\(page, generation\)/
  );
});
