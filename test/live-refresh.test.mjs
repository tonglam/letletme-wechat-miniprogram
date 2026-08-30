import assert from "node:assert/strict";
import test from "node:test";

const { liveMatchdayNeedsRefresh, liveSnapshotNeedsRefresh } =
  await import("../miniprogram/utils/live-refresh.ts");

const snapshot = (displayStats) => ({
  eventId: 1,
  revisions: {
    scoreCore: "score-r1",
    lifecycle: "lifecycle-r1",
    fixtureIdentity: "fixture-r1",
    displayStats,
    picksBase: "picks-r1",
    officialAdjustment: null,
    finalResult: null,
  },
});

test("display-stat publication changes trigger a live refresh", () => {
  assert.equal(
    liveSnapshotNeedsRefresh(snapshot("display-r1"), snapshot("display-r2")),
    true,
  );
});

const matchdaySnapshot = (overrides = {}) => ({
  season: "2026-27",
  eventId: 3,
  state: "LIVE_ACTIVE",
  availability: "READY",
  delivery: {
    state: "FRESH",
    servedFrom: "REDIS_CURRENT",
    reasonCodes: [],
  },
  detailDelivery: {
    state: "FRESH",
    servedFrom: "REDIS_CURRENT",
    reasonCodes: [],
  },
  revisions: {
    deskPublicationId: "desk-1",
    deskGeneration: 1,
    lifecycle: "lifecycle-1",
    fixtureIdentity: "fixture-1",
    scoreState: "score-1",
    detailPublicationId: "detail-1",
    detailGeneration: 1,
    playerDetail: "detail-r1",
  },
  times: {
    deskSourceCheckedAt: "2026-08-31T12:00:00.000Z",
    deskContentUpdatedAt: "2026-08-31T11:59:30.000Z",
    deskPublishedAt: "2026-08-31T11:59:31.000Z",
    deskStaleAt: null,
    detailSourceCheckedAt: "2026-08-31T12:00:00.000Z",
    detailContentUpdatedAt: "2026-08-31T11:59:30.000Z",
    detailPublishedAt: "2026-08-31T11:59:31.000Z",
    detailStaleAt: null,
    servedAt: "2026-08-31T12:00:01.000Z",
    nextRefreshAt: "2026-08-31T12:00:30.000Z",
  },
  ...overrides,
});

test("Match heartbeat and delivery metadata do not rebuild the match list", () => {
  const accepted = matchdaySnapshot();
  const observed = matchdaySnapshot({
    delivery: {
      state: "STALE",
      servedFrom: "REDIS_CURRENT",
      reasonCodes: ["DESK_STALE"],
    },
    times: {
      ...accepted.times,
      deskSourceCheckedAt: "2026-08-31T12:00:30.000Z",
      servedAt: "2026-08-31T12:00:31.000Z",
      nextRefreshAt: "2026-08-31T12:01:00.000Z",
    },
  });
  assert.equal(liveMatchdayNeedsRefresh(accepted, observed), false);
});

test("Match score and detail revisions independently rebuild the match list", () => {
  const accepted = matchdaySnapshot();
  assert.equal(
    liveMatchdayNeedsRefresh(accepted, {
      ...accepted,
      revisions: { ...accepted.revisions, scoreState: "score-2" },
    }),
    true,
  );
  assert.equal(
    liveMatchdayNeedsRefresh(accepted, {
      ...accepted,
      revisions: { ...accepted.revisions, playerDetail: "detail-r2" },
    }),
    true,
  );
});
