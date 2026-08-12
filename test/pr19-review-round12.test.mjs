import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("Explore Fixtures captures lifecycle traces before delayed context reads", () => {
  const page = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  assert.match(
    page,
    /async onLoad\(\) \{\s+const trace = capturePageRequestTrace[\s\S]*?await this\.syncEventContext\(false\);[\s\S]*?await this\.load\(false, trace\);/
  );
  assert.match(
    page,
    /async onShow\(\)[\s\S]*?const trace = capturePageRequestTrace[\s\S]*?await this\.syncEventContext\(false\);[\s\S]*?await this\.load\(seasonChanged, trace\);/
  );
  assert.match(
    page,
    /onPullDownRefresh\(\)[\s\S]*?const trace = capturePageRequestTrace[\s\S]*?syncEventContext\(true\)[\s\S]*?this\.load\(true, trace\)/
  );
});

test("Explore fixture and team reads retain the originating trace", () => {
  const page = source("miniprogram/pages/explore/fixtures/fixtures.ts");
  const fixtureService = source("miniprogram/services/fixture.service.ts");
  const commonService = source("miniprogram/services/common.service.ts");
  assert.match(page, /getFixtureWindow\(startEvent, horizon, season, forceRefresh, trace\)/);
  assert.match(page, /getTeamList\(season, forceRefresh, trace\)/);
  assert.match(fixtureService, /export async function getFixtureWindow[\s\S]*?trace\?: ServiceReadOptions\["trace"\][\s\S]*?forceRefresh,\s+trace/);
  assert.match(commonService, /export async function getTeamList[\s\S]*?trace\?: ServiceReadOptions\["trace"\][\s\S]*?forceRefresh,\s+trace/);
});
