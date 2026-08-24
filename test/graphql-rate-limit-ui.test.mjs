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
  const home = source("miniprogram/pages/home/index/index.wxml");
  const tournament = source("miniprogram/pages/live/tournament/tournament.wxml");
  const players = source("miniprogram/pages/data/players/players.wxml");

  assert.match(liveEntry, /app-error-state[\s\S]*workload="gameweek"/);
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
    /wx:elif="\{\{error\}\}"[\s\S]*workload="gameweek"[\s\S]*onRetry/,
  );
  assert.match(home, /gameweekStatsError[\s\S]*workload="market"[\s\S]*onRetry/);
  assert.match(
    tournament,
    /tournamentListError[\s\S]*workload="interactive"[\s\S]*onRetry/,
  );
  assert.match(
    tournament,
    /wx:elif="\{\{error\}\}"[\s\S]*workload="gameweek"[\s\S]*onRetry/,
  );
  assert.match(
    players,
    /data-status[\s\S]*error && players\.length[\s\S]*workload="player-stats"[\s\S]*onRetry/,
  );
  assert.match(
    players,
    /data-status[\s\S]*loading && players\.length[\s\S]*正在加载新结果，当前显示上次成功数据[\s\S]*workload="player-stats"/,
  );
  assert.match(players, /players\.length === 0 && activeKeyword/);
  assert.match(players, /title="没有找到“\{\{activeKeyword\}\}”"/);
  assert.match(players, /hasMore && !error/);
});
