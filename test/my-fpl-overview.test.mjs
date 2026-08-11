import assert from "node:assert/strict";
import test from "node:test";

let capturedPage;
globalThis.Page = (definition) => {
  capturedPage = definition;
};

const overviewModule = await import("../miniprogram/pages/my-fpl/index/index.ts");
const overviewPage = capturedPage;

test("league summary never fabricates zero after an unavailable read", () => {
  assert.deepEqual(
    overviewModule.resolveOverviewLeagueState(null),
    { leagueCount: 0, leaguesLoaded: false, leaguesUnavailable: true }
  );
  assert.deepEqual(
    overviewModule.resolveOverviewLeagueState(null, 7),
    { leagueCount: 7, leaguesLoaded: true, leaguesUnavailable: false }
  );
  assert.deepEqual(
    overviewModule.resolveOverviewLeagueState([]),
    { leagueCount: 0, leaguesLoaded: true, leaguesUnavailable: false }
  );
});

test("overview cache never crosses season boundaries", () => {
  globalThis.wx = {
    getStorageSync() {
      return {
        entryId: 123,
        season: "2025-26",
        event: 1,
        teamBrief: { eventPoints: 77 },
        storedAt: 1
      };
    }
  };

  assert.equal(overviewModule.readOverviewCache(123, 1, "2026-27"), null);
  assert.equal(
    overviewModule.readOverviewCache(123, 1, "2025-26")?.teamBrief?.eventPoints,
    77
  );
});

test("overview cache accepts the stable offseason event identity", () => {
  globalThis.wx = {
    getStorageSync() {
      return {
        entryId: 123,
        season: "2026-27",
        event: 0,
        teamBrief: { overallPoints: 2400 },
        leagueCount: 5,
        storedAt: 1
      };
    }
  };

  const cached = overviewModule.readOverviewCache(123, 0, "2026-27");
  assert.equal(cached?.teamBrief?.overallPoints, 2400);
  assert.equal(cached?.leagueCount, 5);
  assert.equal(
    overviewModule.readOverviewCache(123, 0, undefined)?.teamBrief?.overallPoints,
    2400,
    "event 0 can be restored when cold-start context has no season"
  );
});

test("NO_FOLLOW primary goes to team search, never to a personal page", () => {
  const urls = [];
  globalThis.wx = {
    navigateTo: ({ url }) => urls.push(url)
  };
  const context = {
    ...overviewPage,
    data: { ...overviewPage.data, principalState: "NO_FOLLOW" },
    context: null
  };

  overviewPage.onPhasePrimary.call(context, { detail: { phase: "SETTLED" } });

  assert.deepEqual(urls, ["/pages/entry/search/search"]);
});

test("LIVE primary continues to the live team page with the followed entry", () => {
  const urls = [];
  globalThis.wx = {
    navigateTo: ({ url }) => urls.push(url)
  };
  const context = {
    ...overviewPage,
    data: { ...overviewPage.data, principalState: "READY" },
    context: { entryId: 123 }
  };

  overviewPage.onPhasePrimary.call(context, { detail: { phase: "LIVE" } });

  assert.deepEqual(urls, ["/pages/live/entry/entry?entry=123"]);
});

test("non-live primary with a ready principal opens the team review", () => {
  const urls = [];
  globalThis.wx = {
    navigateTo: ({ url }) => urls.push(url)
  };
  const context = {
    ...overviewPage,
    data: { ...overviewPage.data, principalState: "READY" },
    context: { entryId: 123 }
  };

  overviewPage.onPhasePrimary.call(context, { detail: { phase: "PRE_DEADLINE" } });

  assert.deepEqual(urls, ["/pages/my-fpl/team/team"]);
});

test("resume re-reads the follow pointer; first show does not double-load", () => {
  const loads = [];
  const context = {
    ...overviewPage,
    data: { ...overviewPage.data },
    hasShown: false,
    loadOverview(forceRefresh) {
      loads.push(forceRefresh === true);
      return Promise.resolve();
    }
  };

  overviewPage.onShow.call(context);
  assert.deepEqual(loads, [], "first show skips the reload that onLoad already started");

  overviewPage.onShow.call(context);
  assert.deepEqual(loads, [false], "resume revalidates through the named context and reporting policies");
});

test("NO_FOLLOW secondary opens the optional account sync page", () => {
  const urls = [];
  globalThis.wx = {
    navigateTo: ({ url }) => urls.push(url)
  };
  const context = { ...overviewPage, data: { ...overviewPage.data } };

  overviewPage.onPhaseSecondary.call(context);

  assert.deepEqual(urls, ["/pages/account/link/link"]);
});
