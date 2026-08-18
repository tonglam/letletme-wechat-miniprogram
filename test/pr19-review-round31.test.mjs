import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("Live Entry replays interrupted context and authority startup on show", () => {
  const page = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(page, /onLoad\([\s\S]*this\.hasRouteEntry[\s\S]*initializeFromContext\("page-load", this\.perfTracker\)/);
  assert.match(page, /async initializeFromContext\([\s\S]*startupPending = true[\s\S]*await this\.ensureContext\(reason\)[\s\S]*await app\.authReady[\s\S]*startupPending = false/);
  assert.match(page, /onHide\(\)[\s\S]*const queuedLiveResume = this\.resumeLiveAfterShow[\s\S]*resumeForcedRefreshAfterShow = this\.forcedRefreshPending[\s\S]*resumeStartupAfterShow = !this\.resumeForcedRefreshAfterShow[\s\S]*resumeLiveAfterShow = queuedLiveResume/);
  assert.match(page, /onShow\(\)[\s\S]*resumeStartupAfterShow[\s\S]*initializeFromContext\("page-show", this\.perfTracker\)/);
});

test("Live Match owns cold context startup and resumes it after hide", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(page, /async onLoad\(\)[\s\S]*this\.pageVisible = true[\s\S]*const tracker = this\.perfTracker[\s\S]*startupPending = true[\s\S]*await this\.ensureContext\("page-load"\)[\s\S]*this\.perfTracker !== tracker[\s\S]*startupPending = false/);
  assert.match(page, /onHide\(\)[\s\S]*resumeForcedRefreshAfterShow = this\.forcedRefreshPending[\s\S]*resumeLoadAfterShow = this\.resumeLoadAfterShow[\s\S]*\|\| \(!this\.resumeForcedRefreshAfterShow[\s\S]*Boolean\(this\.liveRequest\)/);
  assert.match(page, /const resumeInterruptedLoad = resumed && this\.resumeLoadAfterShow[\s\S]*if \(resumeInterruptedLoad\)[\s\S]*loadData\(\{ background: this\.data\.hasData, forceRefresh: true \}\)/);
});
