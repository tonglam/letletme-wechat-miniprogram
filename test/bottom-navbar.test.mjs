import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

let capturedComponent;
globalThis.Component = (definition) => {
  capturedComponent = definition;
};

await import("../miniprogram/components/navigation/bottomNavBar/bottomNavBar.ts");
const navbar = capturedComponent;

function navbarContext(route, activeName) {
  globalThis.getApp = () => ({ globalData: { entryId: 1 } });
  globalThis.getCurrentPages = () => [{ route }];
  const redirects = [];
  globalThis.wx = { redirectTo: ({ url }) => redirects.push(url) };
  const context = {
    ...navbar.methods,
    properties: { active: activeName },
    data: { ...navbar.data, activeName },
    setData(patch) {
      this.data = { ...this.data, ...patch };
    }
  };
  return { context, redirects };
}

test("the bottom nav leads with live and ends with me: live, myFpl, explore, me", () => {
  const names = navbar.data.tabs.map((tab) => tab.name);
  assert.deepEqual(names, ["live", "myFpl", "explore", "me"]);
  const labels = navbar.data.tabs.map((tab) => tab.label);
  assert.deepEqual(labels, ["实时", "我的FPL", "探索", "我"]);
});

test("tapping 探索 opens the web-aligned section menu from an explore-owned destination", () => {
  const { context, redirects } = navbarContext("pages/explore/fixtures/fixtures", "explore");
  navbar.methods.onChange.call(context, { detail: "explore" });
  assert.deepEqual(redirects, [], "menu sections never redirect");
  assert.equal(context.data.show, true);
  assert.deepEqual(
    context.data.actions.map((action) => action.name),
    ["本轮", "赛程", "市场", "趋势", "球员"],
    "the explore menu mirrors the web section vocabulary"
  );
});

test("the explore menu routes to the physical destinations", () => {
  const { context, redirects } = navbarContext("pages/home/index/index", "");
  navbar.methods.onChange.call(context, { detail: "explore" });
  navbar.methods.onSelect.call(context, { detail: { name: "市场" } });
  assert.deepEqual(redirects, ["/pages/data/price/price"]);
  assert.equal(context.data.show, true, "sheet stays up through redirect so the edge does not flash");
});

test("single-destination groups still navigate from foreign sections", () => {
  const { context, redirects } = navbarContext("pages/live/entry/entry", "live");
  navbar.methods.onChange.call(context, { detail: "me" });
  assert.deepEqual(redirects, ["/pages/account/index/index"]);
});

test("selecting a menu destination does not flash the electric edge before redirect", () => {
  const { context, redirects } = navbarContext("pages/live/entry/entry", "live");
  context.data.show = true;
  context.data.navName = "live";
  context.data.edgeVisible = false;
  context.clearEdgeReveal = () => {};
  navbar.methods.onSelect.call(context, { detail: { name: "比赛" } });
  assert.deepEqual(redirects, ["/pages/live/match/match"]);
  assert.equal(context.data.show, true);
  assert.equal(context.data.edgeVisible, false);
});

test("tapping a menu tab item opens the sheet without redirecting", () => {
  const { context, redirects } = navbarContext("pages/live/entry/entry", "live");
  navbar.methods.onTapTab.call(context, { currentTarget: { dataset: { name: "explore" } } });
  assert.deepEqual(redirects, []);
  assert.equal(context.data.show, true);
});

test("copy fallback uses user-select instead of deprecated selectable", () => {
  const root = fileURLToPath(new URL("../miniprogram/", import.meta.url));
  const fallback = readFileSync(join(root, "components/copy-fallback/copy-fallback.wxml"), "utf8");
  assert.match(fallback, /user-select="\{\{true\}\}"/);
  assert.doesNotMatch(fallback, /selectable/);
});

test("tab bar centers icon+label in the full visual bar height", () => {
  const root = fileURLToPath(new URL("../miniprogram/", import.meta.url));
  const appWxss = readFileSync(join(root, "app.wxss"), "utf8");
  const barWxss = readFileSync(join(root, "components/navigation/bottomNavBar/bottomNavBar.wxss"), "utf8");
  const barWxml = readFileSync(join(root, "components/navigation/bottomNavBar/bottomNavBar.wxml"), "utf8");

  assert.match(appWxss, /--tabbar-height:\s*42px/);
  assert.match(appWxss, /--tabbar-floor:\s*6px/);
  assert.doesNotMatch(barWxml, /van-tabbar/);
  assert.doesNotMatch(barWxml, /<van-icon/);
  assert.match(barWxml, /bindtap="onTapTab"/);
  assert.match(barWxml, /edgeVisible && !show/);
  assert.doesNotMatch(barWxml, /<cover-view/);
  assert.match(barWxml, /van-icon-\{\{item\.icon\}\}/);
  assert.match(barWxml, /<privacy-dialog/);
  assert.match(
    readFileSync(join(root, "components/navigation/bottomNavBar/bottomNavBar.json"), "utf8"),
    /privacy-dialog/
  );
  assert.match(barWxss, /\.ll-tabbar-item\s*\{[^}]*justify-content:\s*center/s);
  assert.match(barWxss, /\.ll-tabbar-item\s*\{[^}]*height:\s*100%/s);
  assert.match(barWxss, /\.ll-tabbar\s*\{[^}]*height:\s*calc\(\s*var\(--tabbar-height\)/s);
});

test("gameweek and data routes derive the explore highlight; summary/tournament derives none", () => {
  const gameweek = navbarContext("pages/summary/gameweek/gameweek", "");
  gameweek.context.setActiveFromRoute();
  assert.equal(gameweek.context.data.activeName, "explore");
  const price = navbarContext("pages/data/price/price", "");
  price.context.setActiveFromRoute();
  assert.equal(price.context.data.activeName, "explore");
  const tournament = navbarContext("pages/summary/tournament/tournament", "");
  tournament.context.setActiveFromRoute();
  assert.equal(tournament.context.data.activeName, "", "compat-only route highlights no tab");
  const account = navbarContext("pages/account/link/link", "");
  account.context.setActiveFromRoute();
  assert.equal(account.context.data.activeName, "me", "account routes highlight 我");
  const home = navbarContext("pages/home/index/index", "");
  home.context.setActiveFromRoute();
  assert.equal(home.context.data.activeName, "", "home route highlights no tab");
});
