import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\s+/g, " ");

test("My FPL Team explicit refresh is forced and tracker-owned", () => {
  const page = read("miniprogram/pages/my-fpl/team/team.controller.ts");
  assert.match(
    page,
    /onPullDownRefresh\(\)[\s\S]*const tracker = this\.perfTracker[\s\S]*contextUnavailable \|\| this\.data\.maxGw <= 0[\s\S]*ensureContext\("pull-refresh", true\)[\s\S]*this\.perfTracker !== tracker/
  );
  assert.match(
    page,
    /recoverContext\([\s\S]*const tracker = this\.perfTracker[\s\S]*ensureContext\(reason, true\)[\s\S]*this\.perfTracker !== tracker[\s\S]*initializeFromContext\(true, trace, tracker\)/
  );
});

test("Live Entry hidden refresh replays startup and reuses forced context", () => {
  const page = read("miniprogram/pages/live/entry/entry.ts");
  assert.match(page, /onHide\(\)[\s\S]*resumeForcedRefreshAfterShow = this\.forcedRefreshPending/);
  assert.match(
    page,
    /onPullDownRefresh\(\)[\s\S]*runForcedRefresh\(tracker\)[\s\S]*runForcedRefresh\([\s\S]*refreshContextPending = true[\s\S]*ensureContext\("pull-refresh", true\)[\s\S]*this\.perfTracker !== tracker[\s\S]*retryWithContext\([\s\S]*}, context,?\s*\)/
  );
  assert.match(
    page,
    /initializeFromContext\([\s\S]*this\.startupPending = true;[\s\S]*this\.refreshContextPending = false/
  );
  assert.match(
    page,
    /retryWithContext\([\s\S]*refreshedContext\?: AppContextSnapshot[\s\S]*let context: AppContextSnapshot[\s\S]*context = refreshedContext \?\? \(?await this\.ensureContext/
  );
});
