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
    assert.match(component, /onRetry\(\)[\s\S]*getGraphQLCooldownState\(/);
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
