import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("data-status supports a transient notice that leaves the page after surfacing", () => {
  const component = source("miniprogram/components/data-status/data-status.ts");
  const template = source("miniprogram/components/data-status/data-status.wxml");

  assert.match(component, /transient:\s*\{[\s\S]*type: Boolean/);
  assert.match(component, /transientDuration:\s*\{[\s\S]*type: Number/);
  assert.match(component, /setTimeout\([\s\S]*setData\(\{ visible: false \}\)/);
  assert.match(component, /detached\(\)[\s\S]*clearTransientHide/);
  assert.match(template, /wx:if="\{\{visible\}\}"/);
});

test("retained-data notices are transient on every page surface that shows them", () => {
  const pages = [
    "miniprogram/pages/data/price/price.wxml",
    "miniprogram/pages/explore/fixtures/fixtures.wxml",
    "miniprogram/pages/home/index/index.wxml",
    "miniprogram/pages/live/entry/entry.wxml",
    "miniprogram/pages/live/match/match.wxml",
    "miniprogram/pages/live/tournament/tournament.wxml",
    "miniprogram/pages/my-fpl/team/team.wxml",
    "miniprogram/pages/summary/gameweek/gameweek.wxml"
  ];

  for (const path of pages) {
    const template = source(path);
    assert.match(
      template,
      /data-status[\s\S]*status="stale"[\s\S]*transient="\{\{true\}\}"/,
      `${path} must not leave a retained-data notice permanently visible`
    );
  }
});

test("settled tournament-review errors stay persistent until the user retries", () => {
  const template = source("miniprogram/pages/my-fpl/leagues/leagues.wxml");
  assert.match(
    template,
    /data-status[^>]*wx:if="\{\{v2Error\}\}"[^>]*transient="\{\{false\}\}"/,
  );
  assert.match(
    template,
    /data-status[^>]*v2SeasonError[^>]*transient="\{\{false\}\}"/,
  );
  assert.match(
    template,
    /data-status[^>]*v2GameweekError[^>]*transient="\{\{false\}\}"/,
  );
});
