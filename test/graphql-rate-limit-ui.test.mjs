import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("429 cooldown disables generic retry actions and renders a countdown", () => {
  for (const componentPath of [
    "miniprogram/components/app-error-state/app-error-state.ts",
    "miniprogram/components/data-status/data-status.ts",
  ]) {
    const component = source(componentPath);
    assert.match(component, /getGraphQLCooldownState/);
    assert.match(component, /remainingSeconds/);
    assert.match(component, /retryDisabled: cooldown\.active/);
    assert.match(component, /configuredWorkload \?\? state\.cooldownWorkload/);
    const onRetry = component.match(/onRetry\(\) \{[\s\S]*?\n    \},?/)?.[0];
    assert.ok(onRetry, `${componentPath} must define onRetry`);
    assert.match(
      onRetry,
      /getGraphQLCooldownState\([\s\S]*?configuredWorkload \?\? state\.cooldownWorkload/,
    );
    assert.match(component, /subscribeGraphQLCooldown/);
    assert.match(component, /unsubscribeCooldown/);
    assert.match(component, /isGraphQLCooldownMessage/);
    assert.match(component, /GRAPHQL_COOLDOWN_READY_MESSAGE/);
  }

  const errorTemplate = source("miniprogram/components/app-error-state/app-error-state.wxml");
  const statusTemplate = source("miniprogram/components/data-status/data-status.wxml");
  assert.match(errorTemplate, /disabled="\{\{retryDisabled\}\}"/);
  assert.match(statusTemplate, /aria-disabled="\{\{retryDisabled\}\}"/);
});

test("Market stale state exposes a cooldown-aware retry action", () => {
  const template = source("miniprogram/pages/data/price/price.wxml");
  assert.match(
    template,
    /wx:if="\{\{staleMessage\}\}"[\s\S]*showRetry="\{\{true\}\}"[\s\S]*bind:retry="onRetryDaily"/,
  );
  assert.match(
    template,
    /wx:if="\{\{pulseError\}\}"[\s\S]*showRetry="\{\{true\}\}"[\s\S]*bind:retry="onRetryPulse"/,
  );
  const controller = source("miniprogram/pages/data/price/price.controller.ts");
  assert.match(
    controller,
    /onRetryPulse\(\)[\s\S]*loadMarketPulse\(true\)/,
  );
  assert.match(
    controller,
    /onRetryDaily\(\)[\s\S]*loadDailyChanges\(true, false\)/,
  );
});

test("retry controls use the workload of the operation they retry", () => {
  const liveEntry = source("miniprogram/pages/live/entry/entry.wxml");
  const selections = source("miniprogram/pages/data/selections/selections.wxml");
  const price = source("miniprogram/pages/data/price/price.wxml");
  const liveMatch = source("miniprogram/pages/live/match/match.wxml");
  const liveEntryController = source("miniprogram/pages/live/entry/entry.ts");
  const liveMatchController = source("miniprogram/pages/live/match/match.ts");
  const home = source("miniprogram/pages/home/index/index.wxml");
  const tournament = source("miniprogram/pages/live/tournament/tournament.wxml");
  const tournamentController = source("miniprogram/pages/live/tournament/tournament.controller.ts");
  const fixtures = source("miniprogram/pages/explore/fixtures/fixtures.wxml");
  const fixturesController = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  const team = source("miniprogram/pages/my-fpl/team/team.wxml");
  const teamController = source("miniprogram/pages/my-fpl/team/team.controller.ts");
  const players = source("miniprogram/pages/data/players/players.wxml");
  const playersController = source("miniprogram/pages/data/players/players.ts");
  const teams = source("miniprogram/pages/data/teams/teams.ts");
  const teamsTemplate = source("miniprogram/pages/data/teams/teams.wxml");
  const playerDetail = source("miniprogram/pages/data/player-detail/player-detail.ts");
  const playerDetailTemplate = source("miniprogram/pages/data/player-detail/player-detail.wxml");
  const teamDetail = source("miniprogram/pages/data/team-detail/team-detail.ts");
  const teamDetailTemplate = source("miniprogram/pages/data/team-detail/team-detail.wxml");
  const priceController = source("miniprogram/pages/data/price/price.controller.ts");

  assert.match(liveEntry, /app-error-state[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(liveEntry, /data-status[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(liveEntryController, /showContextError[\s\S]*errorWorkload: "home"/);
  assert.match(liveEntryController, /errorWorkload: "gameweek"/);
  assert.match(selections, /app-error-state[\s\S]*workload="interactive"/);
  assert.match(
    price,
    /historyError[\s\S]*workload="gameweek"[\s\S]*onRetryHistory/,
  );
  assert.match(
    liveMatch,
    /fixtureStaleMessage[\s\S]*workload="fixtures"[\s\S]*onRetry/,
  );
  assert.match(
    liveMatch,
    /wx:elif="\{\{error\}\}"[\s\S]*workload="\{\{errorWorkload\}\}"[\s\S]*onRetry/,
  );
  assert.match(liveMatchController, /showContextError[\s\S]*errorWorkload: "home"/);
  assert.match(liveMatchController, /setData\(\{ errorWorkload: "fixtures" \}\)/);
  assert.match(liveMatchController, /setData\(\{ errorWorkload: "gameweek" \}\)/);
  assert.match(home, /gameweekStatsError[\s\S]*workload="market"[\s\S]*onRetry/);
  assert.match(
    tournament,
    /tournamentListError[\s\S]*workload="interactive"[\s\S]*onRetry/,
  );
  assert.match(
    tournament,
    /wx:elif="\{\{error\}\}"[\s\S]*workload="\{\{errorWorkload\}\}"[\s\S]*onRetry/,
  );
  assert.match(tournamentController, /showContextError[\s\S]*errorWorkload: "home"/);
  assert.match(tournamentController, /errorWorkload: "gameweek"/);
  assert.match(fixtures, /app-error-state[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(fixtures, /data-status[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(fixturesController, /errorWorkload: season \? "fixtures" : "home"/);
  assert.match(fixturesController, /workloadForFixturesError/);
  assert.match(team, /app-error-state[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(team, /data-status[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(teamController, /showContextError[\s\S]*errorWorkload: "home"/);
  assert.match(teamController, /errorWorkload: "interactive"/);
  assert.match(
    players,
    /data-status[\s\S]*error && players\.length[\s\S]*workload="\{\{errorWorkload\}\}"[\s\S]*onRetry/,
  );
  assert.match(
    players,
    /data-status[\s\S]*loading && players\.length[\s\S]*正在加载新结果，当前显示上次成功数据[\s\S]*workload="player-stats"/,
  );
  assert.match(players, /players\.length === 0 && activeKeyword/);
  assert.match(players, /title="没有找到“\{\{activeKeyword\}\}”"/);
  assert.match(players, /hasMore && !error/);
  assert.match(playersController, /errorWorkload: "home"/);
  assert.match(playersController, /this\.setData\(\{ errorWorkload: "player-stats" \}\)/);
  assert.match(teams, /errorWorkload: "player-stats"/);
  assert.match(teams, /let contextReady = false/);
  assert.match(teams, /contextReady = true/);
  assert.match(teams, /errorWorkload: contextReady \? "player-stats" : "home"/);
  assert.match(teamsTemplate, /app-error-state[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(playerDetail, /errorWorkload: "home"/);
  assert.match(playerDetail, /errorWorkload: "interactive"/);
  assert.match(playerDetailTemplate, /app-error-state[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(teamDetail, /errorWorkload: "home"/);
  assert.match(teamDetail, /errorWorkload: "player-stats"/);
  assert.match(teamDetailTemplate, /app-error-state[\s\S]*workload="\{\{errorWorkload\}\}"/);
  assert.match(priceController, /playersErrorWorkload: "home"/);
  assert.match(priceController, /playersErrorWorkload: "player-stats"/);
  assert.match(source("miniprogram/pages/data/price/price.wxml"), /perf-primary-player[\s\S]*workload="\{\{playersErrorWorkload\}\}"/);
});
