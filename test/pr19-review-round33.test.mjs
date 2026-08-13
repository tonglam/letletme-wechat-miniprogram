import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Live Match pull refresh bypasses unresolved AppContext backoff", () => {
  const page = read("miniprogram/pages/live/match/match.ts");
  assert.match(page, /async onPullDownRefresh\(\)[\s\S]*runForcedRefresh\(tracker, true\)/);
  assert.match(page, /runForcedRefresh\([\s\S]*ensureContext\("pull-refresh", true\)[\s\S]*loadData\(\{ background, forceRefresh: true, trackNavigation: true \}\)/);
});

test("My FPL Team retry recovers both failed and unresolved context", () => {
  const page = read("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(
    page,
    /onRetry\(\) \{[\s\S]*this\.contextUnavailable \|\| this\.data\.maxGw <= 0[\s\S]*recoverContext\("pull-refresh"\)/
  );
});
