import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("team page keeps real data load and only adds a pitch presentation layer", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.ts");
  assert.match(page, /await getEntryTeamStatsEventResult/);
  assert.match(page, /pitchStateFromEventResult\(eventResult\)/);
  assert.doesNotMatch(page, /toSquadPitchPlayer\(\{\s*webName:\s*"Haaland"/);
});

test("share image is generated from the hidden canvas helper, not a viewport snapshot", () => {
  const component = source("miniprogram/components/squad-pitch/squad-pitch.ts");
  const template = source("miniprogram/components/squad-pitch/squad-pitch.wxml");
  const canvas = source("miniprogram/utils/squad-pitch-canvas.ts");
  assert.match(component, /exportSquadPitchShareImage/);
  assert.match(template, /id="squad-pitch-share-canvas"/);
  assert.match(canvas, /drawSharePlan/);
  assert.match(canvas, /if \(inFlight\) return inFlight/);
  assert.match(canvas, /if \(cachedPath && cachedKey === key\) return Promise.resolve\(cachedPath\)/);
  assert.doesNotMatch(canvas, /createSelectorQuery\(\)[\s\S]*boundingClientRect/);
});

test("pitch component has no baked-in squad mock and keeps C/V plus Chinese bench copy", () => {
  const component = source("miniprogram/components/squad-pitch/squad-pitch.ts");
  const template = source("miniprogram/components/squad-pitch/squad-pitch.wxml");
  const wxss = source("miniprogram/components/squad-pitch/squad-pitch.wxss");
  assert.doesNotMatch(component, /Haaland|Salah|WhoamI/);
  assert.doesNotMatch(template, /板凳加成生效/);
  assert.match(template, /squad-bench-bb/);
  assert.match(template, /player\.marker === 'C'/);
  assert.match(template, /squad-header-team/);
  assert.match(template, /squad-header-score/);
  assert.doesNotMatch(template, /headerView\.eyebrow/);
  assert.doesNotMatch(template, /headerView\.chip/);
  assert.match(wxss, /text-overflow:\s*ellipsis/);
  assert.match(wxss, /left:\s*2%/);
  assert.match(wxss, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.doesNotMatch(wxss, /min-height:\s*980rpx/);
  assert.doesNotMatch(wxss, /squad-row \{[\s\S]*left:\s*\d+px/);
});

test("gameweek dream team tab uses the reusable squad pitch", () => {
  const page = source("miniprogram/pages/summary/gameweek/gameweek.ts");
  const template = source("miniprogram/pages/summary/gameweek/gameweek.wxml");
  const json = source("miniprogram/pages/summary/gameweek/gameweek.json");
  assert.match(page, /buildDreamTeamPitchState/);
  assert.match(template, /id="dream-squad-pitch"/);
  assert.match(template, /bindtap="onShareDreamPitch"/);
  assert.match(template, /bind:playertap="onDreamPlayerTap"/);
  assert.match(page, /onDreamPlayerTap/);
  assert.match(page, /onElitePlayerTap/);
  assert.match(page, /dreamTeamById/);
  assert.match(page, /eliteById/);
  assert.match(page, /buildPlayerLiveDetail/);
  assert.match(template, /bindtap="onElitePlayerTap"/);
  assert.match(json, /player-live-sheet/);
  assert.doesNotMatch(template, /pitch-card/);
  assert.match(json, /squad-pitch/);
});

test("runtime pitch assets are rasterized abstract kits, not official FPL art", () => {
  const adapter = source("miniprogram/utils/squad-pitch.ts");
  assert.match(adapter, /pitch-background\.jpg/);
  assert.match(adapter, /kits\/\$\{teamCode\}\.png/);
  assert.match(adapter, /kits\/DEFAULT\.png/);
});
