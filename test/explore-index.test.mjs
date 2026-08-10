import assert from "node:assert/strict";
import test from "node:test";

let capturedExplore;
let capturedShell;
globalThis.Page = (definition) => {
  if (!capturedExplore) {
    capturedExplore = definition;
  } else {
    capturedShell = definition;
  }
};

await import("../miniprogram/pages/explore/index/index.ts");
await import("../miniprogram/pages/data/index/index.ts");
const explorePage = capturedExplore;
const dataShell = capturedShell;

function stubApp(globalData) {
  globalThis.getApp = () => ({ globalData });
}

function loadedContext(globalData) {
  stubApp(globalData);
  const context = {
    ...explorePage,
    data: { ...explorePage.data },
    setData(patch) {
      this.data = { ...this.data, ...patch };
    }
  };
  explorePage.onLoad.call(context);
  return context;
}

test("route cards point at the physical destinations", () => {
  const context = loadedContext({ season: "2025-26", gw: 12, entryId: 1 });
  const urls = context.data.groups.flatMap((group) => group.cards.map((card) => card.url));
  assert.deepEqual(urls, [
    "/pages/summary/gameweek/gameweek",
    "/pages/explore/fixtures/fixtures",
    "/pages/data/price/price",
    "/pages/data/selections/selections",
    "/pages/data/players/players",
    "/pages/data/teams/teams"
  ]);
  const groups = context.data.groups.map((group) => group.title);
  assert.deepEqual(groups, ["证据", "实体"], "no tools group without the gated entry");
});

test("the performance card stays gated to the designated entry", () => {
  const context = loadedContext({ season: "2025-26", gw: 12, entryId: 15702 });
  const tools = context.data.groups.find((group) => group.title === "工具");
  assert.ok(tools, "tools group appears for the gated entry");
  assert.equal(tools.cards[0].url, "/pages/performance/index/index");
});

test("season and gameweek context renders, and degrades to hidden", () => {
  const ready = loadedContext({ season: "2025-26", gw: 12, entryId: 1 });
  assert.equal(ready.data.contextText, "赛季 2025-26 · 当前 GW 12");
  const missing = loadedContext({ season: "", gw: 0, entryId: 1 });
  assert.equal(missing.data.contextText, "", "a failed context read never fabricates a GW");
});

test("player search hands the keyword to the players page", () => {
  const urls = [];
  globalThis.wx = { navigateTo: ({ url }) => urls.push(url) };
  const context = loadedContext({ season: "2025-26", gw: 12, entryId: 1 });

  explorePage.onSearch.call(context, { detail: { keyword: "  Haaland  " } });
  assert.deepEqual(urls, ["/pages/data/players/players?keyword=Haaland"], "trimmed keyword travels as a query param");

  explorePage.onSearch.call(context, { detail: { keyword: "   " } });
  assert.deepEqual(urls[1], "/pages/data/players/players", "an empty keyword navigates without a query");
});

test("the data hub shell redirects to the explore overview", () => {
  const redirects = [];
  globalThis.wx = { redirectTo: ({ url }) => redirects.push(url) };
  dataShell.onLoad.call({ ...dataShell });
  assert.deepEqual(redirects, ["/pages/explore/index/index"]);
});
