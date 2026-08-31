import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(
    /\s+/g,
    " ",
  );

test("Live Matches uses the self-contained V2 publication before the cold Core fallback", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const publication = page.indexOf("await getLiveMatchByStatusSnapshot");
  const core = page.indexOf("await readCoreEventFixtureSchedule");
  assert.ok(publication >= 0 && core > publication);
  assert.match(
    page,
    /if \(publishedMatchday\?\.snapshot\) \{[\s\S]*this\.coreMatches = publicationMatches[\s\S]*return;/,
  );
  assert.match(
    page,
    /if \(preserveData\) \{[\s\S]*publication 暂不可用[\s\S]*return;[\s\S]*await readCoreEventFixtureSchedule/,
  );
  assert.match(
    page,
    /const expectedEventId =\s*options\.useActiveEventPointer\s*\?\s*undefined[\s\S]*this\.currentEventId > 0/,
  );
  assert.match(page, /requestTrace, expectedEventId/);
  assert.match(page, /fixture\.started === true[\s\S]*fixture\.kickoffTime/);
  assert.match(page, /return core\.map/);
  assert.match(
    page,
    /await readCoreEventFixtureSchedule[\s\S]*const activeStatus = this\.resolveActiveStatus\(core\)[\s\S]*filterMatches\(core, activeStatus\)/,
  );
  assert.doesNotMatch(page.slice(core), /await getLiveMatchByStatusSnapshot/);
});

test("stale app context is refreshed before it can pin a cold Match read", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const onLoad = page.slice(
    page.indexOf("async onLoad()"),
    page.indexOf("initLiveRefresh()"),
  );
  assert.match(onLoad, /let context = getAppContextSnapshot\(\)/);
  assert.match(
    onLoad,
    /if \(context && shouldRefreshAppContext\(context\)\) \{[\s\S]*await this\.ensureContext\("page-load", true\)[\s\S]*context = shouldRefreshAppContext\(refreshedContext\)[\s\S]*\? null[\s\S]*: refreshedContext[\s\S]*catch \{[\s\S]*context = null/,
  );
  assert.match(
    onLoad,
    /context = null[\s\S]*if \(context\) \{[\s\S]*this\.currentEventId = context\.currentEvent/,
  );
});

test("forced context refresh failure switches Match reads to the active pointer", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const refresh = page.slice(
    page.indexOf("async runForcedRefresh"),
    page.indexOf("async onShow"),
  );
  assert.match(
    refresh,
    /let useActiveEventPointer = false[\s\S]*context = null[\s\S]*useActiveEventPointer = context === null/,
  );
  assert.match(
    refresh,
    /trackNavigation: true,[\s\S]*useActiveEventPointer/,
  );
  assert.match(
    page,
    /const cachedContext = options\.useActiveEventPointer\s*\?\s*null\s*:\s*getAppContextSnapshot\(\)/,
  );
  assert.match(
    page,
    /const expectedEventId = options\.useActiveEventPointer\s*\?\s*undefined[\s\S]*this\.currentEventId > 0/,
  );
});

test("preseason uses displayEvent schedule without a Live overlay", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(page, /currentEventId = context\.currentEvent \?\? 0/);
  assert.match(page, /targetEventId = context\.displayEvent \?\? 0/);
  assert.match(page, /this\.liveWindow = Boolean\([\s\S]*this\.liveSnapshot/);
  assert.match(
    page,
    /this\.liveWindow = Boolean\([\s\S]*coreRead\.data\.every\(\(fixture\) => fixture\.finished === true\)/,
  );
  const statusHandler = page.slice(page.indexOf("onStatusTap"));
  assert.doesNotMatch(
    statusHandler.slice(0, statusHandler.indexOf("onRetry")),
    /loadData\(/,
  );
});

test("match with no displayEvent commits a scheduled empty state", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  assert.match(page, /if \(!targetEvent\) \{[\s\S]*noScheduleState\(\)/);
  assert.doesNotMatch(page, /当前赛季暂无赛程/);
  assert.match(template, /scheduleEmpty/);
  assert.match(template, /当前赛季暂无赛程/);
});

test("warm resume observes retained Core schedule without refetching", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const onShow = page.slice(
    page.indexOf("async onShow()"),
    page.indexOf("onHide()"),
  );
  assert.match(
    onShow,
    /resumed && \(this\.data\.hasData \|\| Boolean\(this\.data\.error\)\)[\s\S]*observePrimary/,
  );
});

test("warm Match resume retries the active pointer after context failure", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const onShow = page.slice(
    page.indexOf("async onShow()"),
    page.indexOf("onHide()"),
  );
  assert.match(
    onShow,
    /catch \{[\s\S]*context = null;[\s\S]*useActiveEventPointer = true;/,
  );
  assert.match(
    onShow,
    /armContextDeadline\([\s\S]*useActiveEventPointer && context === null/,
  );
  assert.match(
    onShow,
    /if \(useActiveEventPointer\) \{[\s\S]*forceRefresh: true,[\s\S]*useActiveEventPointer: true/,
  );
});

test("scheduled Match context never inherits the previous event snapshot", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const onShow = page.slice(
    page.indexOf("async onShow()"),
    page.indexOf("onHide()"),
  );
  assert.match(
    onShow,
    /if \(context\?\.currentEvent === null\) \{[\s\S]*useActiveEventPointer = true;/,
  );
  assert.match(
    onShow,
    /const nextCurrentEventId = context !== null\s*\?\s*\(context\?\.currentEvent \?\? 0\)/,
  );
  assert.match(
    onShow,
    /const nextTargetEventId = context !== null\s*\?\s*\(context\?\.displayEvent \?\? context\?\.currentEvent \?\? 0\)/,
  );
});

test("current-event schedule arms a kickoff transition without preseason Live work", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    page,
    /armKickoffTransition\([\s\S]*this\.targetEventId !== this\.currentEventId[\s\S]*setTimeout/,
  );
  assert.match(page, /this\.armKickoffTransition\(coreRead\.data\)/);
  assert.match(page, /onHide\(\)[\s\S]*this\.clearKickoffTransition\(\)/);
  assert.match(page, /onHide\(\)[\s\S]*this\.clearCopiedMatchTimer\(\)/);
  assert.match(page, /onUnload\(\)[\s\S]*this\.clearCopiedMatchTimer\(\)/);
  assert.match(page, /onHide\(\)[\s\S]*this\.clearSharedImageMatchTimer\(\)/);
  assert.match(page, /onUnload\(\)[\s\S]*this\.clearSharedImageMatchTimer\(\)/);
  assert.match(
    page,
    /seasonChanged \|\| nextCurrentEventId !== this\.currentEventId[\s\S]*clearCopiedMatchTimer\(\)[\s\S]*shareSheetOpen: false/,
  );
  assert.match(
    page,
    /catch \(error\)[\s\S]*this\.armKickoffTransition\(this\.coreMatches, true\)/,
  );
});

test("resumed no-snapshot pages probe after an overdue kickoff", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const onShow = page.slice(
    page.indexOf("async onShow()"),
    page.indexOf("onHide()"),
  );
  assert.match(
    onShow,
    /resumed[\s\S]*!this\.liveSnapshot[\s\S]*hasUnprocessedKickoff\(this\.coreMatches\)[\s\S]*void this\.loadData\([\s\S]*forceRefresh: true/,
  );
  assert.match(
    page,
    /function hasUnprocessedKickoff\([\s\S]*fixture\.kickoffTime[\s\S]*kickoff <= now/,
  );
});

test("fixture service rejects partial errors before mapping an empty schedule", () => {
  const service = source("miniprogram/services/fixture.service.ts");
  const read = service.indexOf(
    "const result = await graphqlRead<CoreEventFixtureScheduleResponse>",
  );
  const guard = service.indexOf("if (result.errors.length > 0)", read);
  const mapping = service.indexOf(
    "data: (result.data.eventFixtures || [])",
    read,
  );
  assert.ok(read >= 0 && guard > read && mapping > guard);
});

test("Live Matches reads one coherent V2 publication without fixture fan-out", () => {
  const service = source("miniprogram/services/live.service.ts");
  assert.match(service, /query LiveMatchday\(\$eventId: Int\)/);
  assert.match(
    service,
    /const variables = \{ eventId: expectedEventId \?\? null \}/,
  );
  assert.match(service, /validateLiveMatchday\(result\)/);
  assert.match(service, /result\.snapshot\?\.matches\.map\(mapGraphQLMatch\)/);
  assert.doesNotMatch(
    service,
    /fetchLiveFixturePlayers|mergeLiveFixturePlayers/,
  );
  assert.doesNotMatch(service, /liveMatchdayDesk|liveFixturePlayers/);
});

test("an unavailable background publication cannot overwrite the accepted match board", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    page,
    /if \(preserveData\) \{[\s\S]*publication 暂不可用[\s\S]*return;/,
  );
  assert.match(
    page,
    /if \(publishedMatchday\?\.snapshot\)[\s\S]*this\.setData\([\s\S]*matches: visibleMatches/,
  );
});

test("heartbeat-only Match probes update metadata without rebuilding matches", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const accept = page.slice(
    page.indexOf("acceptSnapshot:"),
    page.indexOf("onProbeError:"),
  );
  assert.match(accept, /this\.liveSnapshot = snapshot/);
  assert.match(accept, /fixtureStaleMessage: matchDetailUpdateMessage/);
  assert.match(accept, /snapshot\?\.times\.deskContentUpdatedAt/);
  assert.doesNotMatch(accept, /\bmatches\s*:|\bgroups\s*:/);
});

test("Match refresh probes the head and fetches the full publication only on revision change", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const refresh = page.slice(
    page.indexOf("initLiveRefresh()"),
    page.indexOf("loadData(options"),
  );
  assert.match(
    refresh,
    /await getLiveMatchdayHead\(this\.currentEventId, true\)/,
  );
  assert.match(
    refresh,
    /if \(liveMatchdayNeedsRefresh\(this\.liveSnapshot, head\)\) \{[\s\S]*await getLiveMatchByStatusSnapshot\(/,
  );
  assert.match(
    page,
    /this\.armContextDeadline\(\s*cachedContext\?\.nextDeadlineAt,\s*cachedContext === null,/,
  );
});

test("Live Match surfaces a stale Core fixture fallback", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  assert.match(
    page,
    /fixtureStaleMessage: coreRead\.meta\.stale[\s\S]*fixtureScheduleStaleMessage\(coreRead\.meta\.storedAt\)/,
  );
  assert.match(
    page,
    /lastError: this\.data\.error \|\| this\.data\.fixtureStaleMessage/,
  );
  assert.match(template, /fixtureStaleMessage[\s\S]*status="stale"/);
});

test("live match tabs follow web content preference and carry per-tab counts", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  // Web parity (getPreferredLiveMatchesTab): without a stored/user choice the
  // active tab follows the content; an explicit tap or stored value wins.
  assert.match(page, /preferredLiveMatchTab/);
  assert.match(
    page,
    /resolveActiveStatus\(matches: LiveMatch\[\]\)[\s\S]*this\.statusFromStorage \|\| matches\.length === 0/,
  );
  assert.match(
    page,
    /onStatusTap\([\s\S]*this\.statusFromStorage = true[\s\S]*wx\.setStorageSync/,
  );
  assert.match(
    page,
    /if \(isValidStatus\(storedStatus\)\) \{ this\.statusFromStorage = true/,
  );
  // Per-tab counts come from the same bucketing as the filter.
  assert.match(page, /countLiveMatchTabs/);
  assert.match(page, /statusTabs: buildStatusTabs\(core\)/);
  assert.match(page, /statusTabs: buildStatusTabs\(publicationMatches\)/);
  assert.match(template, /wx:for="\{\{statusTabs\}\}"/);
  assert.match(template, /status-tab-count">\{\{item\.count\}\}/);
});

test("settled desk stays event-scoped without a second fixture overlay", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const service = source("miniprogram/services/live.service.ts");
  // V2 live data is event-scoped and self-contained; the page must not smuggle
  // a next-event LKG into the publication path.
  assert.match(page, /this\.coreMatches = publicationMatches/);
  assert.doesNotMatch(page, /appendNextEventRows\(/);
  assert.doesNotMatch(service, /nextFixtures/);
  assert.doesNotMatch(service, /homeTeamShortName\s+awayTeamShortName/);
});

test("live match player sheet offers image share like the web modal", () => {
  const page = source("miniprogram/pages/live/match/match.ts");
  const template = source("miniprogram/pages/live/match/match.wxml");
  assert.match(template, /player-live-sheet[^>]*shareable="\{\{true\}\}"/);
  assert.match(template, /bind:shareimage="onSharePlayerImage"/);
  assert.match(
    page,
    /async onSharePlayerImage\(\)[\s\S]*exportPlayerLiveShareImage\(\{[\s\S]*presentPlayerLiveShareImage\(path\)/,
  );
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
