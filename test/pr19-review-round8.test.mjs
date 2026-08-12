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
  assert.match(
    graphql,
    /SEASON_SCOPED_POLICIES\.has\(cachePolicy\)[\s\S]*options\?\.season \|\| currentSeason\(\)/
  );
  assert.match(team, /cachePolicy: "team-directory",\s*season/);
});

test("Home retries failed deadline context recovery without a request storm", () => {
  const home = source("miniprogram/pages/home/index/index.ts");
  assert.match(home, /const HOME_DEADLINE_RETRY_MS = 60 \* 1000/);
  assert.match(
    home,
    /async refreshHome\(deadlineTriggered = false\)[\s\S]*catch \(error\)[\s\S]*if \(deadlineTriggered\)[\s\S]*scheduleDeadlineRetry\(\)/
  );
  assert.match(
    home,
    /scheduleDeadlineRetry\(\)[\s\S]*setTimeout\([\s\S]*refreshHome\(true\)[\s\S]*HOME_DEADLINE_RETRY_MS/
  );
  assert.match(home, /updateCountdown\(\)[\s\S]*void this\.refreshHome\(true\)/);
});

test("Live landing waits for shared cold-start context before painting GW", () => {
  const live = source("miniprogram/pages/live/index/index.ts");
  assert.match(live, /import \{ ensureAppContext \}/);
  assert.match(
    live,
    /async onShow\(\)[\s\S]*await ensureAppContext\(\{ reason: "page-show" \}\)[\s\S]*globalData\.gw/
  );
});
