import assert from "node:assert/strict";
import test from "node:test";

const {
  liveMatchdayNeedsRefresh,
  canReplaceLiveMatchdayLkg,
  mergeLiveMatchdayHeadStatus,
  retainLiveMatchPlayerDetails,
  retainLiveMatchdayDetailRevision,
  shouldRetainAcceptedLiveMatchDetails,
  liveSnapshotNeedsRefresh,
  shouldPollLiveMatchday,
} = await import("../miniprogram/utils/live-refresh.ts");
const { normalizeLiveDisplayState } =
  await import("../miniprogram/utils/live-status.ts");

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
    detailObservation: "detail-r1",
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
      revisions: {
        ...accepted.revisions,
        detailObservation: "detail-r2",
      },
    }),
    true,
  );
});

test("metadata-only HEAD retains the accepted complete detail LKG", () => {
  const accepted = matchdaySnapshot();
  const observed = matchdaySnapshot({
    revisions: {
      ...accepted.revisions,
      detailObservation: null,
      detailPublicationId: null,
      detailGeneration: null,
      playerDetail: null,
    },
    times: {
      ...accepted.times,
      detailSourceCheckedAt: null,
      detailContentUpdatedAt: null,
      detailPublishedAt: null,
      detailStaleAt: null,
    },
    detailDelivery: {
      state: "PENDING",
      servedFrom: null,
      reasonCodes: ["DETAIL_PENDING"],
    },
  });

  const merged = mergeLiveMatchdayHeadStatus(accepted, observed);
  assert.equal(merged.revisions.detailObservation, "detail-r1");
  assert.equal(merged.revisions.detailPublicationId, "detail-1");
  assert.equal(merged.revisions.detailGeneration, 1);
  assert.equal(merged.revisions.playerDetail, "detail-r1");
  assert.equal(merged.times.detailPublishedAt, accepted.times.detailPublishedAt);
  assert.equal(merged.detailDelivery.state, "DEGRADED");
  assert.ok(merged.detailDelivery.reasonCodes.includes("DETAIL_LKG_RETAINED"));
});

test("metadata-only HEAD promotes matching accepted detail to FINAL", () => {
  const accepted = matchdaySnapshot({
    state: "FINALIZED",
    times: { ...matchdaySnapshot().times, nextRefreshAt: null },
    detailDelivery: {
      state: "DEGRADED",
      servedFrom: "PROCESS_LKG",
      reasonCodes: ["DETAIL_LKG_RETAINED"],
    },
  });
  const observed = matchdaySnapshot({
    state: "FINALIZED",
    delivery: {
      state: "FINAL",
      servedFrom: "REDIS_CURRENT",
      reasonCodes: ["DESK_FINAL"],
    },
    detailDelivery: {
      state: "FINAL",
      servedFrom: "REDIS_CURRENT",
      reasonCodes: ["DETAIL_FINAL"],
    },
    times: { ...accepted.times, servedAt: "2026-08-31T12:01:00.000Z" },
  });

  const merged = mergeLiveMatchdayHeadStatus(accepted, observed);
  assert.equal(merged.revisions.playerDetail, accepted.revisions.playerDetail);
  assert.equal(merged.detailDelivery.state, "FINAL");
  assert.equal(merged.detailDelivery.servedFrom, "PROCESS_LKG");
  assert.ok(merged.detailDelivery.reasonCodes.includes("DETAIL_FINAL"));
  assert.equal(
    shouldPollLiveMatchday({
      pageVisible: true,
      currentEventId: 3,
      selectedEventId: 3,
      snapshot: merged,
    }),
    false,
  );
});

test("same-event LKG replacement is monotonic across Redis fallback", () => {
  const accepted = matchdaySnapshot();
  const older = matchdaySnapshot({
    revisions: {
      ...accepted.revisions,
      deskGeneration: 0,
      deskPublicationId: "desk-0",
    },
  });
  const newer = matchdaySnapshot({
    revisions: {
      ...accepted.revisions,
      deskGeneration: 2,
      deskPublicationId: "desk-2",
    },
  });
  assert.equal(canReplaceLiveMatchdayLkg({ snapshot: older }, accepted), false);
  assert.equal(canReplaceLiveMatchdayLkg({ snapshot: newer }, accepted), true);
  assert.equal(
    canReplaceLiveMatchdayLkg(
      { snapshot: { ...accepted, eventId: accepted.eventId - 1 } },
      accepted,
    ),
    false,
  );
  assert.equal(
    canReplaceLiveMatchdayLkg(
      { snapshot: { ...accepted, eventId: accepted.eventId + 1 } },
      accepted,
    ),
    true,
  );
});

test("new desk keeps accepted player detail when FULL detail is absent", () => {
  const accepted = matchdaySnapshot();
  const candidate = matchdaySnapshot({
    revisions: {
      ...accepted.revisions,
      deskGeneration: 2,
      deskPublicationId: "desk-2",
      detailObservation: null,
      detailPublicationId: null,
      detailGeneration: null,
      playerDetail: null,
    },
  });
  assert.equal(
    shouldRetainAcceptedLiveMatchDetails(candidate, accepted),
    true,
  );
  const candidateMatches = [
    {
      matchId: 10,
      homeTeamDataList: [],
      awayTeamDataList: [],
    },
  ];
  const acceptedMatches = [
    {
      matchId: 10,
      homeTeamDataList: [{ element: 1 }],
      awayTeamDataList: [{ element: 2 }],
    },
  ];
  assert.deepEqual(
    retainLiveMatchPlayerDetails(candidateMatches, acceptedMatches),
    acceptedMatches,
  );
  const retained = retainLiveMatchdayDetailRevision(candidate, accepted);
  assert.equal(retained.revisions.detailPublicationId, "detail-1");
  assert.equal(retained.detailDelivery.state, "DEGRADED");
  assert.ok(
    retained.detailDelivery.reasonCodes.includes("DETAIL_REVISION_RETAINED"),
  );
});

test("Match recovery polling continues after the final whistle until detail is final", () => {
  const accepted = matchdaySnapshot({
    state: "FINALIZED",
    times: { ...matchdaySnapshot().times, nextRefreshAt: null },
    detailDelivery: {
      state: "PENDING",
      servedFrom: null,
      reasonCodes: ["DETAIL_PENDING"],
    },
  });
  assert.equal(
    shouldPollLiveMatchday({
      pageVisible: true,
      currentEventId: 3,
      selectedEventId: 3,
      snapshot: accepted,
    }),
    true,
  );
});

test("a finalized matchday with pending detail is not presented as final", () => {
  const accepted = matchdaySnapshot({
    state: "FINALIZED",
    detailDelivery: {
      state: "PENDING",
      servedFrom: null,
      reasonCodes: ["DETAIL_PENDING"],
    },
  });
  assert.notEqual(
    normalizeLiveDisplayState({
      snapshot: accepted,
      hasData: true,
      loading: false,
      probing: false,
      lastError: "",
      online: true,
    }),
    "final",
  );
  assert.equal(
    normalizeLiveDisplayState({
      snapshot: matchdaySnapshot({
        state: "FINALIZED",
        detailDelivery: {
          state: "FINAL",
          servedFrom: "REDIS_CURRENT",
          reasonCodes: [],
        },
      }),
      hasData: true,
      loading: false,
      probing: false,
      lastError: "",
      online: true,
    }),
    "final",
  );
});
