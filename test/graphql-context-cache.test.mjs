import assert from "node:assert/strict";
import test from "node:test";

const storage = new Map();
const requests = [];
const app = { globalData: { season: "" } };
globalThis.getApp = () => app;
globalThis.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  setStorage: ({ key, data, success }) => {
    storage.set(key, data);
    success?.({});
  },
  request: (options) => {
    requests.push(options);
    setTimeout(() => options.success({
      statusCode: 200,
      data: { data: { teams: [{ id: 1, name: "Arsenal" }] } }
    }), 5);
  }
};

const { graphqlRead } = await import("../miniprogram/services/graphql.service.ts");
const teamsQuery = "query Teams { teams { id name } }";

test("season-scoped operations fail before network when season is unresolved", async () => {
  await assert.rejects(
    graphqlRead(teamsQuery, {}, { authMode: "public", cachePolicy: "team-directory" }),
    /赛季信息/
  );
  await assert.rejects(
    graphqlRead("query GetEntry($id: Int!) { entry(id: $id) { id } }", { id: 1 }, { cachePolicy: "reporting" }),
    /赛季信息/
  );
  assert.equal(requests.length, 0);
  assert.equal([...storage.keys()].some((key) => key.includes("season:unknown")), false);
});

test("season-scoped reporting accepts season from cacheVariant when global season is empty", async () => {
  app.globalData.season = "";
  await graphqlRead(teamsQuery, {}, {
    authMode: "public",
    cachePolicy: "reporting",
    cacheVariant: "season:2025-26"
  });
  assert.equal(requests.length, 1);
});

test("same season-scoped key produces one network request and one in-flight source", async () => {
  requests.length = 0;
  app.globalData.season = "2025-26";
  const options = {
    authMode: "public",
    cachePolicy: "team-directory",
    cacheVariant: "season:2025-26"
  };
  const [first, second] = await Promise.all([
    graphqlRead(teamsQuery, {}, options),
    graphqlRead(teamsQuery, {}, options)
  ]);
  assert.equal(requests.length, 1);
  assert.deepEqual(new Set([first.meta.source, second.meta.source]), new Set(["network", "in-flight"]));
});
