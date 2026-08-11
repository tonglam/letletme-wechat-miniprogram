import assert from "node:assert/strict";
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

test("tapping 探索 on an explore-owned destination returns to the overview", () => {
  const { context, redirects } = navbarContext("pages/explore/fixtures/fixtures", "explore");
  navbar.methods.onChange.call(context, { detail: "explore" });
  assert.deepEqual(redirects, ["/pages/explore/index/index"], "the section tab is not dead on its own destinations");
});

test("tapping 探索 on the overview itself is a no-op", () => {
  const { context, redirects } = navbarContext("pages/explore/index/index", "explore");
  navbar.methods.onChange.call(context, { detail: "explore" });
  assert.deepEqual(redirects, [], "no self-redirect");
});

test("single-destination groups still navigate from foreign sections", () => {
  const { context, redirects } = navbarContext("pages/live/entry/entry", "live");
  navbar.methods.onChange.call(context, { detail: "competitions" });
  assert.deepEqual(redirects, ["/pages/competitions/index/index"]);
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
});
