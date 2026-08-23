import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const app = JSON.parse(fs.readFileSync(path.join(root, "miniprogram/app.json"), "utf8"));
const routes = [...(app.pages || [])];
for (const subpackage of app.subpackages || app.subPackages || []) {
  for (const page of subpackage.pages || []) routes.push(`${subpackage.root}/${page}`);
}

const explicitP0 = new Set([
  "pages/home/index/index",
  "pages/live/entry/entry",
  "pages/live/match/match",
  "pages/data/price/price",
  "pages/my-fpl/team/team"
]);

test("all registered pages expose a viewport-visible primary boundary and tracker", () => {
  assert.equal(routes.length, 25);
  for (const route of routes) {
    const controllerRoute = new Set([
      "pages/live/tournament/tournament",
      "pages/my-fpl/team/team",
      "pages/data/price/price"
    ]).has(route)
      ? `${route}.controller.ts`
      : `${route}.ts`;
    const source = fs.readFileSync(path.join(root, "miniprogram", controllerRoute), "utf8");
    const template = fs.readFileSync(path.join(root, "miniprogram", `${route}.wxml`), "utf8");
    assert.match(template, /perf-primary-(?:content|fixtures)/, `${route} lacks a primary node`);
    if (explicitP0.has(route)) {
      assert.match(source, /PagePerformanceTracker/, `${route} lacks explicit P0 tracking`);
    } else {
      assert.match(source, /PerformancePage/, `${route} lacks ordinary page tracking`);
    }
  }
});

test("loading placeholders are never the primary completion boundary", () => {
  for (const route of routes) {
    const template = fs.readFileSync(path.join(root, "miniprogram", `${route}.wxml`), "utf8");
    assert.doesNotMatch(
      template,
      /<app-loading[^>]*id="perf-primary-(?:content|fixtures)"/,
      `${route} counts loading as complete`
    );
  }
});
