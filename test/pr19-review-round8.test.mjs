import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("route season satisfies the season-scoped Team cache guard", () => {
  const graphql = source("miniprogram/services/graphql.service.ts");
  const team = source("miniprogram/services/team.service.ts");
  assert.match(graphql, /season\?: string/);
  assert.match(graphql, /function resolveSeason/);
  assert.match(graphql, /options\?\.season/);
  assert.match(graphql, /currentSeason\(\)/);
  assert.match(team, /cachePolicy: "team-directory",\s*season/);
});

test("Home retries failed deadline context recovery without a request storm", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  // Post-deadline retries follow the web exponential backoff ladder
  // (30s → 60s → 120s → 240s → 300s ceiling) instead of a fixed interval.
  assert.match(home, /const DEADLINE_RETRY_BASE_MS = 30 \* 1000/);
  assert.match(home, /const DEADLINE_RETRY_MAX_MS = 5 \* 60 \* 1000/);
  assert.match(home, /export function deadlineRetryDelayMs\(completedAttempts/);
  assert.match(
    home,
    /async refreshHome\(deadlineTriggered = false\)[\s\S]*catch \(error\)[\s\S]*if \(deadlineTriggered\)[\s\S]*scheduleDeadlineRetry\(\)/
  );
  assert.match(
    home,
    /scheduleDeadlineRetry\(\)[\s\S]*?deadlineRetryDelayMs\(this\._deadlineRetryAttempts\)[\s\S]*?setTimeout/
  );
  assert.match(home, /updateCountdown\(\)[\s\S]*void this\.refreshHome\(true\)/);
});

test("Live landing waits for shared cold-start context before painting GW", () => {
  const live = source("miniprogram/pages/live/index/index.ts");
  assert.match(live, /import \{ ensureAppContext, getAppContextSnapshot \}/);
  assert.match(
    live,
    /async loadContext\([\s\S]*await ensureAppContext\(\{ reason \}\)[\s\S]*contextResolved: true[\s\S]*event: app\.globalData\.gw/
  );
});
