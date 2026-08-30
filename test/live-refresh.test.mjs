import assert from "node:assert/strict";
import test from "node:test";

const { liveSnapshotNeedsRefresh } =
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
