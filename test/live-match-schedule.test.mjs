import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\s+/g, " ");

test("Live Matches paints Core schedule before an optional overlay", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const core = page.indexOf("await readCoreEventFixtureSchedule");
  const primaryCommit = page.indexOf("primarySetDataAt", core);
  const overlay = page.indexOf("await getLiveMatchByStatusSnapshot", core);
  assert.ok(core >= 0 && primaryCommit > core && overlay > primaryCommit);
  assert.match(page, /liveWindowSnapshot\?\.eventId \?\? this\.targetEventId/);
  assert.match(page, /fixture\.started === true[\s\S]*fixture\.kickoffTime/);
  assert.match(page, /return core\.map/);
  assert.match(page, /await readCoreEventFixtureSchedule[\s\S]*const activeStatus = this\.resolveActiveStatus\(core\)[\s\S]*filterMatches\(core, activeStatus\)/);
  assert.match(page, /await getLiveMatchByStatusSnapshot[\s\S]*const overlayStatus = this\.resolveActiveStatus\(this\.coreMatches\)[\s\S]*filterMatches\(this\.coreMatches, overlayStatus\)/);
});

test("preseason uses displayEvent schedule without a Live overlay", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(page, /currentEventId = liveWindow\?\.eventId \?\? context\.currentEvent \?\? 0/);
  assert.match(page, /targetEventId = liveWindow\?\.eventId \?\? context\.displayEvent \?\? 0/);
  assert.match(page, /this\.liveWindow = Boolean\([\s\S]*this\.liveSnapshot/);
  const statusHandler = page.slice(page.indexOf("onStatusTap"));
  assert.doesNotMatch(statusHandler.slice(0, statusHandler.indexOf("onRetry")), /loadData\(/);
});

test("match with no displayEvent commits a scheduled empty state", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  assert.match(page, /if \(!targetEvent\) \{[\s\S]*noScheduleState\(\)/);
  assert.match(page, /if \(!this\.targetEventId\) \{[\s\S]*noScheduleState\(\)/);
  assert.doesNotMatch(page, /当前赛季暂无赛程/);
  assert.match(template, /scheduleEmpty/);
  assert.match(template, /当前赛季暂无赛程/);
});

test("warm resume observes retained Core schedule without refetching", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const onShow = page.slice(page.indexOf("async onShow()"), page.indexOf("onHide()"));
  assert.match(onShow, /resumed && \(this\.data\.hasData \|\| Boolean\(this\.data\.error\)\)[\s\S]*observePrimary/);
});

test("current-event schedule arms a kickoff transition without preseason Live work", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(page, /armKickoffTransition\([\s\S]*this\.targetEventId !== this\.currentEventId[\s\S]*setTimeout/);
  assert.match(page, /this\.armKickoffTransition\(coreRead\.data\)/);
  assert.match(page, /onHide\(\)[\s\S]*this\.clearKickoffTransition\(\)/);
  assert.match(page, /onHide\(\)[\s\S]*this\.clearCopiedMatchTimer\(\)/);
  assert.match(page, /onUnload\(\)[\s\S]*this\.clearCopiedMatchTimer\(\)/);
  assert.match(page, /onHide\(\)[\s\S]*this\.clearSharedImageMatchTimer\(\)/);
  assert.match(page, /onUnload\(\)[\s\S]*this\.clearSharedImageMatchTimer\(\)/);
  assert.match(
    page,
    /seasonChanged \|\| nextCurrentEventId !== this\.currentEventId[\s\S]*clearCopiedMatchTimer\(\)[\s\S]*shareSheetOpen: false/
  );
  assert.match(page, /catch \(error\)[\s\S]*this\.armKickoffTransition\(this\.coreMatches, true\)/);
});

test("fixture service rejects partial errors before mapping an empty schedule", () => {
  const service = source("miniprogram/services/fixture.service.ts");
  const read = service.indexOf("const result = await graphqlRead<CoreEventFixtureScheduleResponse>");
  const guard = service.indexOf("if (result.errors.length > 0)", read);
  const mapping = service.indexOf("data: (result.data.eventFixtures || [])", read);
  assert.ok(read >= 0 && guard > read && mapping > guard);
});

test("Live revision recovery retains the original desk when the forced refresh fails", () => {
  const service = source("miniprogram/services/live.service.ts");
  const recovery = service.slice(service.indexOf('if (!hasGraphQLErrorCode(error, "LIVE_REVISION_GONE"))'));
  assert.match(recovery, /try \{[\s\S]*const refreshed = await graphqlRequest/);
  assert.match(recovery, /catch \{[\s\S]*enriched = mapped/);
});

test("Live Match surfaces a stale Core fixture fallback", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  assert.match(page, /fixtureStaleMessage: coreRead\.meta\.stale[\s\S]*fixtureScheduleStaleMessage\(coreRead\.meta\.storedAt\)/);
  assert.match(page, /lastError: this\.data\.error \|\| this\.data\.fixtureStaleMessage/);
  assert.match(template, /fixtureStaleMessage[\s\S]*status="stale"/);
});

test("live match tabs follow web content preference and carry per-tab counts", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  // Web parity (getPreferredLiveMatchesTab): without a stored/user choice the
  // active tab follows the content; an explicit tap or stored value wins.
  assert.match(page, /preferredLiveMatchTab/);
  assert.match(page, /resolveActiveStatus\(matches: LiveMatch\[\]\)[\s\S]*this\.statusFromStorage \|\| matches\.length === 0/);
  assert.match(page, /onStatusTap\([\s\S]*this\.statusFromStorage = true[\s\S]*wx\.setStorageSync/);
  assert.match(page, /if \(isValidStatus\(storedStatus\)\) \{ this\.statusFromStorage = true/);
  // Per-tab counts come from the same bucketing as the filter.
  assert.match(page, /countLiveMatchTabs/);
  assert.match(page, /statusTabs: buildStatusTabs\(core\)/);
  assert.match(page, /statusTabs: buildStatusTabs\(this\.coreMatches\)/);
  assert.match(template, /wx:for="\{\{statusTabs\}\}"/);
  assert.match(template, /status-tab-count">\{\{item\.count\}\}/);
});

test("live match player sheet offers image share like the web modal", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  assert.match(template, /player-live-sheet[^>]*shareable="\{\{true\}\}"/);
  assert.match(template, /bind:shareimage="onSharePlayerImage"/);
  assert.match(page, /async onSharePlayerImage\(\)[\s\S]*exportPlayerLiveShareImage\(\{[\s\S]*presentPlayerLiveShareImage\(path\)/);
  // The share card eyebrow carries the fixture label, not an entry name.
  assert.match(page, /playerDetailMatchLabel = match/);
});

test("every live match card exposes image share beside text share", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  const presenter = source("miniprogram/utils/album-presenter.ts");
  const actions = template.slice(
    template.indexOf('class="match-card-actions"'),
    template.indexOf('class="scoregrid"'),
  );
  assert.match(actions, /onCopyMatchShare[\s\S]*onShareMatchImage/);
  assert.match(actions, /data-matchid="\{\{match\.matchId\}\}"/);
  assert.match(page, /exportLiveMatchShareImage\(match,/);
  assert.match(page, /presentLiveMatchShareImage\(path\)/);
  assert.match(page, /queryLiveMatchShareCanvas\(this\)/);
  assert.match(template, /id="live-match-share-canvas"/);
  // needShowEntrance is category-whitelisted; passing it fails the whole
  // share call for ineligible categories, so it must stay out.
  assert.doesNotMatch(presenter, /needShowEntrance:/);
  assert.match(presenter, /fail: \(err\)/);
  // Dismissing the share panel is a cancel, not a failure — no album fallback.
  assert.match(presenter, /\/cancel\/\.test\(err\.errMsg/);
  assert.match(presenter, /saveToAlbum\(path\)/);
});
