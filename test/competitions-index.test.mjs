import assert from "node:assert/strict";
import test from "node:test";

let capturedPage;
globalThis.Page = (definition) => {
  capturedPage = definition;
};

await import("../miniprogram/pages/competitions/index/index.ts");
const competitionsPage = capturedPage;

test("opening a competition preselects it for Live and navigates there", () => {
  const storage = new Map();
  const urls = [];
  globalThis.wx = {
    setStorageSync: (key, value) => storage.set(key, value),
    getStorageSync: (key) => storage.get(key),
    navigateTo: ({ url }) => urls.push(url)
  };
  const items = [
    { competitionId: 42, name: "我的联赛", kind: "UNKNOWN", lifecycle: "ACTIVE", formatHint: "POINTS_TABLE" },
    { competitionId: 7, name: "淘汰赛", kind: "UNKNOWN", lifecycle: "UNKNOWN", formatHint: "KNOCKOUT" }
  ];
  const context = {
    ...competitionsPage,
    data: { ...competitionsPage.data, displayItems: items }
  };

  competitionsPage.onOpenCompetition.call(context, { currentTarget: { dataset: { index: 1 } } });

  assert.equal(storage.get("live-tournamentId"), 7, "the selected competition id lands in the Live restore key");
  assert.equal(storage.get("live-tournamentName"), "淘汰赛", "the selected name lands in the Live restore key");
  assert.deepEqual(urls, ["/pages/live/tournament/tournament"], "current results continue into Live");
});

test("resume revalidates the list; first show does not double-load", () => {
  const loads = [];
  const context = {
    ...competitionsPage,
    data: { ...competitionsPage.data },
    hasShown: false,
    loadList(forceRefresh) {
      loads.push(forceRefresh === true);
      return Promise.resolve();
    }
  };

  competitionsPage.onShow.call(context);
  assert.deepEqual(loads, [], "first show skips the reload that onLoad already started");

  competitionsPage.onShow.call(context);
  assert.deepEqual(loads, [true], "resume bypasses the cache while revalidating principal and list");
});

test("empty-state create hands off to the Website create action", () => {
  const copied = [];
  globalThis.wx = {
    setClipboardData: ({ data, success }) => {
      copied.push(data);
      success?.();
    },
    showToast: () => {}
  };
  const context = { ...competitionsPage, data: { ...competitionsPage.data } };

  competitionsPage.onCreateCompetition.call(context);

  assert.equal(copied.length, 1, "the create URL is copied for the browser handoff");
  assert.ok(copied[0].includes("letletme.top"), "the handoff targets the Website");
});

test("NO_FOLLOW empty action goes to team search", () => {
  const urls = [];
  globalThis.wx = {
    navigateTo: ({ url }) => urls.push(url)
  };
  const context = { ...competitionsPage, data: { ...competitionsPage.data } };

  competitionsPage.onEmptyAction.call(context);

  assert.deepEqual(urls, ["/pages/entry/search/search"]);
});
