import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("team page keeps real data load and only adds a pitch presentation layer", () => {
  const page = source("miniprogram/pages/my-fpl/team/team.controller.ts");
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
  assert.match(canvas, /if \(inFlight && inFlightKey === key\) return inFlight/);
  assert.match(canvas, /if \(generation === shareGeneration && seq === exportSeq\)/);
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
  assert.match(page, /this\.dreamTeamById = mapped\.dreamTeamById/);
  assert.match(page, /this\.eliteById = mapped\.eliteById/);
  const pageDataBlock = page.slice(page.indexOf("pageData: {"), page.indexOf("dreamTeamById:", page.indexOf("pageData: {")));
  assert.doesNotMatch(pageDataBlock, /dreamTeamById/);
  assert.doesNotMatch(pageDataBlock, /eliteById/);
  assert.doesNotMatch(pageDataBlock, /pitchGroups:/);
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

test("deprecated getSystemInfoSync stays behind the system-info helper", () => {
  // wx.getSystemInfoSync is deprecated; first-party code must read
  // pixelRatio/platform through utils/system-info (getWindowInfo/getDeviceInfo
  // with a short-circuited legacy fallback). Sanctioned direct callers:
  // system-info itself, mini-chart's pre-existing inline pattern, and the
  // auth-observability fallback gated on missing getDeviceInfo fields.
  const files = [
    "miniprogram/utils/squad-pitch.ts",
    "miniprogram/components/squad-pitch/squad-pitch.ts",
    "miniprogram/utils/deadline-share-image.ts",
    "miniprogram/utils/live-match-share-image.ts",
    "miniprogram/pages/live/match/match.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(source(file), /wx\.getSystemInfoSync/, file);
  }
  const adapter = source("miniprogram/utils/squad-pitch.ts");
  assert.match(adapter, /devicePlatform\(\) === "devtools"/);
  const helper = source("miniprogram/utils/system-info.ts");
  assert.match(helper, /getWindowInfo/);
  assert.match(helper, /getDeviceInfo/);
});

test("performance diagnostics read system details through the modern helper", () => {
  const page = source("miniprogram/pages/performance/index/index.ts");
  const helper = source("miniprogram/utils/system-info.ts");
  assert.match(page, /deviceSystem\(\)/);
  assert.doesNotMatch(page, /wx\.getSystemInfo\(/);
  assert.match(helper, /export function deviceSystem/);
});

test("active gameweeks do not present zero placeholders as published scores", () => {
  const page = source("miniprogram/pages/summary/gameweek/gameweek.ts");
  assert.match(
    page,
    /HEADLINE_LABELS\.indexOf\(row\.label\) < 0 \|\| Number\(row\.value\) > 0/,
  );
});
