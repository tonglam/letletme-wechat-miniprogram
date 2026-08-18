import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("forced tournament directory reads refresh unresolved event context", () => {
  const service = read("miniprogram/services/tournament.service.ts");
  assert.match(
    service,
    /const unresolvedEvent = !snapshot\?\.displayEvent;[\s\S]*if \(forceRefresh \|\| !season \|\| unresolvedEvent\)[\s\S]*forceRefresh: forceRefresh \|\| !season/
  );
});

test("Live Match hidden pull refresh is owned and resumed", () => {
  const page = read("miniprogram/pages/live/match/match.ts");
  assert.match(
    page,
    /onHide\(\)[\s\S]*resumeForcedRefreshAfterShow = this\.forcedRefreshPending[\s\S]*resumeLoadAfterShow = this\.resumeLoadAfterShow[\s\S]*\|\| \(!this\.resumeForcedRefreshAfterShow[\s\S]*this\.refreshContextPending[\s\S]*Boolean\(this\.liveRequest\)/
  );
  assert.match(page, /onPullDownRefresh\(\)[\s\S]*const tracker = this\.perfTracker;[\s\S]*runForcedRefresh\(tracker, true\)/);
  assert.match(page, /runForcedRefresh\([\s\S]*refreshContextPending = true[\s\S]*ensureContext\("pull-refresh", true\)[\s\S]*if \(!this\.pageVisible \|\| this\.perfTracker !== tracker\) return/);
  assert.match(
    page,
    /if \(resumeInterruptedLoad\) \{[\s\S]*refreshContextPending = false[\s\S]*initLiveRefresh\(\)/
  );
});

test("Live Tournament event-zero recovery uses startup generation ownership", () => {
  const page = read("miniprogram/pages/live/tournament/tournament.ts");
  assert.match(
    page,
    /retryWithContext\(\)[\s\S]*if \(this\.data\.event === 0\)[\s\S]*const recoveryGeneration = \+\+this\.startupGeneration;[\s\S]*this\.startupPending = true[\s\S]*await this\.ensureContext\("pull-refresh", true\)[\s\S]*this\.startupGeneration !== recoveryGeneration/
  );
  assert.match(
    page,
    /onHide\(\)[\s\S]*if \(this\.startupPending\)[\s\S]*this\.resumeStartupAfterShow = true[\s\S]*this\.startupGeneration \+= 1/
  );
});
