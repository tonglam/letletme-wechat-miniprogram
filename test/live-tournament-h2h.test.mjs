import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\s+/g, " ");

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

test("the detail desk query selects kind, setup, participants and the H2H board", () => {
  const service = source("miniprogram/services/tournament-detail.service.ts");

  assert.match(service, /tournamentDetailDesk\(tournamentId: \$tournamentId, entryId: \$entryId, eventId: \$eventId\)/);
  assert.match(service, /kind context \{ season coreRevision activeEventId requestedEventId \}/);
  assert.match(service, /participants \{ entryId entryName playerName \}/);
  assert.match(service, /setup \{ status phase completedUnits totalUnits progressMode \}/);
  assert.match(service, /officialH2H \{ eventId awaitingSchedule scoreSource scoreRevision scoreCheckedAt/);
  // The Mini deliberately omits the desk's live block — the board pipeline owns it.
  assert.doesNotMatch(service, /live \{/);
  assert.match(service, /tournamentOfficialH2H\(tournamentId: \$tournamentId, eventId: \$eventId\)/);
});

test("the controller routes official H2H tournaments to the desk, not the board", () => {
  const controller = source("miniprogram/pages/live/tournament/tournament.controller.ts");

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
    /isOfficialH2HTournamentRow\(this\.data\.selectedTournament\)\) \{[\s\S]*void this\.loadH2HBoard\(next\)/,
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

test("the H2H board applies the web traceability gate before rendering scores", () => {
  const controller = source("miniprogram/pages/live/tournament/tournament.controller.ts");

  assert.match(
    controller,
    /const traceable = traceableOfficialH2HBoard\(board\);/,
  );
  assert.match(controller, /scrubUntraceableH2HMatches\(board\.matches \|\| \[\]\)/);
  assert.match(
    controller,
    /shouldShowOfficialH2HStandings\( board\.eventId, activeEventId, \)/,
  );
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

test("the detail disclosure opens from the toolbar and lists statistics, rules and roster", () => {
  const template = source("miniprogram/pages/live/tournament/tournament.wxml");
  const controller = source("miniprogram/pages/live/tournament/tournament.controller.ts");

  assert.match(template, /bindtap="onOpenTournamentDetail"/);
  assert.match(template, /wx:if="\{\{detailOpen\}\}"/);
  assert.match(template, /\{\{detailCreator\}\}/);
  assert.match(template, /\{\{detailLeagueTypeText\}\}/);
  assert.match(template, /\{\{detailParticipantCountText\}\}/);
  assert.match(template, /\{\{detailGroupModeText\}\}/);
  assert.match(template, /\{\{detailKnockoutModeText\}\}/);
  assert.match(template, /bindinput="onDetailRosterSearchInput"/);
  assert.match(template, /bindtap="onOpenDetailRosterEntry"/);
  assert.match(controller, /visibleTournamentRoster\( filtered, visibleCount, viewerEntryId, \)/);
  assert.match(controller, /filterTournamentRoster\(this\.detailParticipants, keyword\)/);
  // Roster rows deep-link to the viewer's live entry page like the web.
  assert.match(controller, /onOpenDetailRosterEntry[\s\S]*routes\.liveEntry\}\?entry=/);
});
