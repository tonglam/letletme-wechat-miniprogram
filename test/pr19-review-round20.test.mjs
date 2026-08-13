import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("launchDuration ends when detached AppContext initialization settles", () => {
  const app = source("miniprogram/app.ts");
  assert.match(app, /const initialization = this\.initAppData\(\)/);
  assert.match(app, /initialization\.then\([\s\S]*recordLaunch\(Date\.now\(\) - launchStart\)/);
  assert.doesNotMatch(app, /void this\.initAppData\(\);\s*recordLaunch/);
});

test("hidden Live Entry reads are invalidated before deferred transfers", () => {
  const entry = source("miniprogram/pages/live/entry/entry.ts");
  assert.match(
    entry,
    /onHide\(\)[\s\S]*liveRequestId \+= 1[\s\S]*transfersRequestId \+= 1[\s\S]*loadTransfersAfterLive = false/
  );
  assert.match(
    entry,
    /await getLivePointsByEntrySnapshot[\s\S]*if \(!this\.pageVisible \|\| requestId !== this\.liveRequestId\) return[\s\S]*this\.pageVisible && requestId === this\.liveRequestId && this\.loadTransfersAfterLive/
  );
  assert.match(
    entry,
    /onHide\(\)[\s\S]*resumeStartupAfterShow = this\.startupPending[\s\S]*resumeLiveAfterShow = !this\.resumeStartupAfterShow && this\.liveRequest !== null/
  );
  assert.match(
    entry,
    /resumed && this\.resumeLiveAfterShow[\s\S]*await this\.loadData\(\{ includeTransfers: true \}\)/
  );
});

test("Players captures its trace before context and cancels hidden continuations", () => {
  const players = source("miniprogram/pages/data/players/players.ts");
  const service = source("miniprogram/services/player.service.ts");
  assert.match(
    players,
    /const trace = capturePageRequestTrace[\s\S]*await ensureAppContext[\s\S]*if \(!this\.pageVisible \|\| !shouldApplyPlayerResponse[\s\S]*fetchPage\(revision, null, false, forceRefresh, trace\)/
  );
  assert.match(players, /onHide\(\)[\s\S]*pageVisible = false[\s\S]*requestRevision \+= 1/);
  assert.match(service, /PlayerPickerPageOptions[\s\S]*trace\?: PageRequestTrace[\s\S]*trace: options\.trace/);
});

test("My FPL invalidates hidden primary work before deferred tabs", () => {
  const team = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(
    team,
    /onHide\(\)[\s\S]*loadRequestId \+= 1[\s\S]*tabRequestId \+= 1[\s\S]*phaseBannerRequestId \+= 1/
  );
  assert.match(
    team,
    /await getEntryTeamStatsEventResult[\s\S]*if \(!this\.pageVisible \|\| requestId !== this\.loadRequestId\) return[\s\S]*this\.loadTab/
  );
  assert.match(team, /const primaryMissing = !this\.data\.hasTeamData[\s\S]*const primaryReloaded = contextChanged[\s\S]*\|\| primaryMissing/);
});

test("tracked Match refreshes do not join untracked background requests", () => {
  const match = source("miniprogram/pages/live/match/match.ts");
  assert.match(
    match,
    /const tracksNavigation = options\.background !== true \|\| options\.trackNavigation === true[\s\S]*requestKey = `\$\{this\.targetEventId\}:\$\{options\.forceRefresh === true\}:\$\{tracksNavigation\}`/
  );
  assert.match(match, /navigationTracker = tracksNavigation \? this\.perfTracker : undefined/);
});
