import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(
    /\s+/g,
    " ",
  );

test("the live picker includes official H2H tournaments", () => {
  const service = source("miniprogram/services/tournament.service.ts");

  // Kind detection needs leagueType + rosterMode from the directory query.
  assert.match(service, /leagueType\s*\n?\s*rosterMode/);
  // Points races plus official H2H rows (web isOfficialH2HTournament parity).
  assert.match(
    service,
    /!t\.groupMode \|\| t\.groupMode === "POINTS_RACES" \|\| isOfficialH2HTournamentRow\(t\)/,
  );
});

test("the picker splits classic and H2H leagues like the web", () => {
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  const groups = source("miniprogram/utils/tournament-picker-groups.ts");

  // Web TournamentSelector: leagueType === "H2H" picks the 对战联赛 group,
  // everything else stays 经典联赛.
  assert.match(groups, /leagueType !== "H2H"/);
  assert.match(groups, /leagueType === "H2H"/);
  assert.match(groups, /选择积分联赛/);
  assert.match(groups, /选择对战联赛/);
  assert.match(
    template,
    /range="\{\{classicTournamentNames\}\}" value="\{\{selectedClassicIndex\}\}" bindchange="onClassicTournamentChange"/,
  );
  assert.match(
    template,
    /range="\{\{h2hTournamentNames\}\}" value="\{\{selectedH2HIndex\}\}" bindchange="onH2HTournamentChange"/,
  );
  // The single combined picker is gone.
  assert.doesNotMatch(template, /onTournamentChange/);
  // Both groups route through the same selection pipeline.
  assert.match(controller, /onTournamentGroupChange\(event, "classic"\)/);
  assert.match(controller, /onTournamentGroupChange\(event, "h2h"\)/);
  assert.match(
    controller,
    /buildTournamentPickerState\(this\.data\.tournaments, selectedTournament\)/,
  );
  assert.match(
    controller,
    /buildTournamentPickerState\(tournaments, selectedTournament\)/,
  );
});

test("the detail desk is metadata-only and the H2H publication is separate", () => {
  const service = source("miniprogram/services/tournament-detail.service.ts");

  assert.match(
    service,
    /tournamentDetailDesk\(tournamentId: \$tournamentId, entryId: \$entryId, eventId: \$eventId\)/,
  );
  assert.match(
    service,
    /kind context \{ season coreRevision activeEventId requestedEventId \}/,
  );
  assert.match(service, /participants \{ entryId entryName playerName \}/);
  assert.match(
    service,
    /setup \{[\s\S]*status phase completedUnits totalUnits/,
  );
  assert.match(service, /export const GET_TOURNAMENT_OFFICIAL_H2H/);
  assert.match(service, /availability[\s\S]*delivery[\s\S]*revisions/);
  assert.match(
    service,
    /matches \{[\s\S]*officialMatchId[\s\S]*home[\s\S]*away/,
  );
  assert.doesNotMatch(service, /entryOfficialH2HDesk/);
});

test("the controller routes official H2H tournaments to the desk, not the board", () => {
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );

  assert.match(
    controller,
    /if \(isOfficialH2HTournamentRow\(selectedTournament\)\) \{[\s\S]*await this\.loadH2HDesk\(\{ forceRefresh, trace \}\); return;/,
  );
  // The desk is authoritative: a LIVE_POINTS reply falls back to the board.
  assert.match(
    controller,
    /desk\.kind === "LIVE_POINTS"[\s\S]*await this\.loadRows\(options\)/,
  );
  // GW changes on an H2H view refetch the board only.
  assert.match(
    controller,
    /isOfficialH2HTournamentRow\(this\.data\.selectedTournament\)\) \{[\s\S]*const boardRequest = this\.loadH2HBoard\(next\)/,
  );
  assert.match(
    controller,
    /const boardRequest = this\.loadH2HBoard\(next\)[\s\S]*boardRequest\.then\(\(\) => \{[\s\S]*void this\.loadH2HMatchups\(\{ forceRefresh: true \}\)/,
  );
  assert.match(
    controller,
    /\.\.\.emptyH2HViewState\(\),\s*h2hTab: this\.data\.h2hTab,\s*h2hMatchups: \[\],\s*h2hMatchupsLoading: false,\s*h2hMatchupsLoaded: false/,
  );
  // Web cadences: 60s current-GW refresh, 5s setup polling.
  assert.match(controller, /H2H_REFRESH_MS = 60000/);
  assert.match(controller, /SETUP_POLL_MS = 5000/);
  // The live-snapshot probe must not drive the H2H view.
  assert.match(
    controller,
    /if \(this\.data\.h2hActive \|\| this\.data\.setupActive\) return false;/,
  );
});

test("the H2H board applies the V2 traceability gate before rendering scores", () => {
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );

  assert.match(controller, /const traceable = traceableH2HBoard\(board\);/);
  assert.match(
    controller,
    /scrubUntraceableH2HMatches\(candidateMatches\)/,
  );
  assert.match(
    controller,
    /shouldShowH2HStandings\(\s*board\.eventId,\s*activeEventId\s*,?\s*\)/,
  );
});

test("an unavailable H2H refresh retains the last complete board", () => {
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );

  assert.match(
    controller,
    /board\.availability !== "READY" && this\.data\.hasData && this\.data\.h2hActive/,
  );
  assert.match(controller, /errorSuffix: "当前显示上次成功结果"/);
});

test("a single H2H match refresh cannot erase its same-event READY LKG", () => {
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  const helper = source("miniprogram/utils/official-h2h.ts");

  assert.match(helper, /export function retainOfficialH2HMatches/);
  assert.match(helper, /export function canRetainOfficialH2HStandings/);
  assert.match(helper, /previousMatch\.availability !== "READY"/);
  assert.match(helper, /MATCH_PUBLICATION_FALLBACK/);
  assert.match(
    controller,
    /retainOfficialH2HMatches\(this\.h2hMatchSnapshot, candidateMatches\)/,
  );
  assert.match(controller, /h2hMatchSnapshot: \[\] as H2HMatch\[\]/);
  assert.match(
    controller,
    /canRetainOfficialH2HStandings\(this\.h2hBoardSnapshot, board\)/,
  );
  assert.match(controller, /h2hBoardSnapshot = null/);
});

test("the H2H template renders standings, fixtures and the setup card", () => {
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");

  assert.match(template, /data-tab="standings" bindtap="onH2HTabTap"/);
  assert.match(template, /data-tab="matches" bindtap="onH2HTabTap"/);
  assert.match(template, /wx:for="\{\{h2hStandings\}\}"/);
  assert.match(template, /wx:for="\{\{h2hMatches\}\}"/);
  assert.match(template, /\{\{item\.recordText\}\}/);
  assert.match(template, /\{\{item\.matchPointsText\}\}/);
  assert.match(template, /class="h2h-bye">轮空/);
  assert.match(template, /h2hAwaitingSchedule/);
  assert.match(template, /wx:if="\{\{setupActive\}\}"/);
  assert.match(template, /bindtap="onRetry"/);
});

test("the setup card renders the web phase checklist", () => {
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );

  // Web TournamentDetailClient: READY completes every phase, the active
  // phase carries completed/total unless INDETERMINATE.
  assert.match(controller, /tournamentSetupPhaseRows\(setup\)/);
  assert.match(
    controller,
    /setupPhases: failed \? \[\] : tournamentSetupPhaseRows/,
  );
  assert.match(template, /wx:for="\{\{setupPhases\}\}"/);
  assert.match(template, /class="setup-phase-row \{\{item\.state\}\}"/);
  assert.match(template, /\{\{item\.progressText\}\}/);
});

test("the 我的对阵 tab loads bounded history on demand", () => {
  const service = source("miniprogram/services/tournament-detail.service.ts");
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");

  assert.doesNotMatch(service, /entryOfficialH2HDesk/);
  assert.doesNotMatch(controller, /getEntryOfficialH2HMatchups/);
  assert.match(service, /tournamentOfficialH2HHistory/);
  assert.match(controller, /getTournamentOfficialH2HHistory\(/);
  assert.match(controller, /h2hMatchups: matchups/);
  assert.match(
    controller,
    /this\.data\.h2hMatchupsLoaded[\s\S]*h2hMatchupsRequestKey/,
  );
  assert.match(
    controller,
    /if \(tab === "mine"\) void this\.loadH2HMatchups\(\);/,
  );
  assert.match(template, /data-tab="mine" bindtap="onH2HTabTap"/);
  assert.match(template, /wx:for="\{\{h2hMatchups\}\}"/);
  assert.match(template, /\{\{item\.roundText\}\}/);
  assert.match(template, /\{\{item\.statusText\}\}/);
  assert.match(template, /暂无对阵记录。/);
  assert.match(template, /我的对阵暂时无法获取。/);
});

test("the H2H view shares the visible tab as text or image", () => {
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");
  const shareText = source("miniprogram/utils/live-share.ts");

  // Board idiom: one 分享文字/分享图片 pair, content follows the active tab.
  assert.match(template, /bindtap="onCopyH2HShare"/);
  assert.match(template, /bindtap="onShareH2HImage"/);
  assert.match(
    controller,
    /async onShareH2HImage\(\)[\s\S]*exportTournamentH2HShareImage\(\{[\s\S]*presentTournamentH2HShareImage\(path\)/,
  );
  assert.match(
    controller,
    /onCopyH2HShare\(\): Promise<void>[\s\S]*formatOfficialH2HShareText\(\{[\s\S]*copyShareText\(text\)/,
  );
  // Tab-aware payload: 我的对阵 lazy-loads the entry desk before sharing.
  assert.match(
    controller,
    /h2hTab === "mine"\) \{\s*if \(this\.data\.h2hMatchupsLoading\) return;\s*if \(!this\.data\.h2hMatchupsLoaded\) await this\.loadH2HMatchups\(\);/,
  );
  // Web share builders: standings rows, fixture labels, matchup history.
  assert.match(shareText, /对战积分榜:/);
  assert.match(shareText, /本轮对阵:/);
  assert.match(shareText, /我的对阵/);
  assert.match(shareText, /对战积分 · \$\{row\.pointsForText\} 总得分/);
});

test("the detail disclosure opens from the toolbar and lists statistics, rules and roster", () => {
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");
  const controller = source(
    "miniprogram/pages/live/tournament/tournament.controller.ts",
  );

  assert.match(template, /bindtap="onOpenTournamentDetail"/);
  assert.match(template, /wx:if="\{\{detailOpen\}\}"/);
  assert.match(template, /\{\{detailCreator\}\}/);
  assert.match(template, /\{\{detailLeagueTypeText\}\}/);
  assert.match(template, /\{\{detailParticipantCountText\}\}/);
  assert.match(template, /\{\{detailGroupModeText\}\}/);
  assert.match(template, /\{\{detailKnockoutModeText\}\}/);
  assert.match(template, /bindinput="onDetailRosterSearchInput"/);
  assert.match(template, /bindtap="onOpenDetailRosterEntry"/);
  assert.match(
    controller,
    /visibleTournamentRoster\( filtered, visibleCount, viewerEntryId, \)/,
  );
  assert.match(
    controller,
    /filterTournamentRoster\(this\.detailParticipants, keyword\)/,
  );
  // Roster rows deep-link to the viewer's live entry page like the web.
  assert.match(
    controller,
    /onOpenDetailRosterEntry[\s\S]*routes\.liveEntry\}\?entry=/,
  );
});
