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

test("a season rollover rebuilds even when the event number is reused", () => {
  const accepted = matchdaySnapshot({ season: "2025-26" });
  const observed = matchdaySnapshot({ season: "2026-27" });
  assert.equal(liveMatchdayNeedsRefresh(accepted, observed), true);
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

test("metadata-only HEAD does not reopen an accepted FINAL detail", () => {
  const accepted = matchdaySnapshot({
    state: "FINALIZED",
    times: { ...matchdaySnapshot().times, nextRefreshAt: null },
    detailDelivery: {
      state: "FINAL",
      servedFrom: "REDIS_CURRENT",
      reasonCodes: ["DETAIL_FINAL"],
    },
  });
  const observed = matchdaySnapshot({
    state: "FINALIZED",
    detailDelivery: {
      state: "PENDING",
      servedFrom: null,
      reasonCodes: ["DETAIL_NOT_INCLUDED"],
    },
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
  });

  const merged = mergeLiveMatchdayHeadStatus(accepted, observed);
  assert.equal(merged.detailDelivery.state, "FINAL");
  assert.ok(
    merged.detailDelivery.reasonCodes.includes("DETAIL_NOT_INCLUDED"),
  );
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

test("metadata-only HEAD keeps a fresh body fresh but propagates real detail fallback", () => {
  const accepted = matchdaySnapshot();
  const metadataOnly = matchdaySnapshot({
    detailDelivery: {
      state: "DEGRADED",
      servedFrom: "REDIS_CURRENT",
      reasonCodes: ["DETAIL_METADATA_ONLY"],
    },
    times: {
      ...accepted.times,
      detailSourceCheckedAt: "2026-08-31T12:01:00.000Z",
      detailStaleAt: "2099-08-31T12:00:00.000Z",
      servedAt: "2026-08-31T12:01:01.000Z",
    },
  });
  const fresh = mergeLiveMatchdayHeadStatus(accepted, metadataOnly);
  assert.equal(fresh.detailDelivery.state, "FRESH");
  assert.equal(fresh.detailDelivery.servedFrom, "REDIS_CURRENT");
  assert.equal(
    fresh.times.detailSourceCheckedAt,
    metadataOnly.times.detailSourceCheckedAt,
  );

  const fallback = matchdaySnapshot({
    detailDelivery: {
      state: "DEGRADED",
      servedFrom: "REDIS_PREVIOUS",
      reasonCodes: ["DETAIL_PREVIOUS"],
    },
    times: {
      ...metadataOnly.times,
      detailStaleAt: "2026-08-31T12:00:30.000Z",
    },
  });
  const degraded = mergeLiveMatchdayHeadStatus(accepted, fallback);
  assert.equal(degraded.detailDelivery.state, "DEGRADED");
  assert.equal(degraded.detailDelivery.servedFrom, "REDIS_CURRENT");
  assert.ok(degraded.detailDelivery.reasonCodes.includes("DETAIL_FALLBACK"));
  assert.ok(degraded.detailDelivery.reasonCodes.includes("DETAIL_STALE"));
  assert.equal(degraded.times.detailStaleAt, fallback.times.detailStaleAt);
  assert.equal(degraded.revisions.playerDetail, accepted.revisions.playerDetail);
});

test("fallback HEAD cannot roll back accepted FULL desk provenance", () => {
  const accepted = matchdaySnapshot();
  const fallback = matchdaySnapshot({
    delivery: {
      state: "DEGRADED",
      servedFrom: "REDIS_PREVIOUS",
      reasonCodes: ["DESK_PREVIOUS"],
    },
    revisions: {
      ...accepted.revisions,
      deskPublicationId: "desk-0",
      deskGeneration: 0,
    },
    times: {
      ...accepted.times,
      deskSourceCheckedAt: "2026-08-31T12:01:00.000Z",
      deskContentUpdatedAt: "2026-08-31T11:58:30.000Z",
      deskPublishedAt: "2026-08-31T11:58:31.000Z",
      servedAt: "2026-08-31T12:01:01.000Z",
    },
  });

  const merged = mergeLiveMatchdayHeadStatus(accepted, fallback);
  assert.equal(merged.revisions.deskPublicationId, "desk-1");
  assert.equal(merged.revisions.deskGeneration, 1);
  assert.equal(
    merged.times.deskContentUpdatedAt,
    accepted.times.deskContentUpdatedAt,
  );
  assert.equal(merged.times.deskPublishedAt, accepted.times.deskPublishedAt);
  assert.equal(
    merged.times.deskSourceCheckedAt,
    fallback.times.deskSourceCheckedAt,
  );
  assert.equal(merged.delivery.servedFrom, "REDIS_CURRENT");
  assert.equal(merged.delivery.state, "DEGRADED");
  assert.ok(merged.delivery.reasonCodes.includes("DESK_FALLBACK"));
  assert.equal(
    canReplaceLiveMatchdayLkg({
      snapshot: {
        ...fallback,
        revisions: {
          ...fallback.revisions,
          deskPublicationId: "desk-0",
          deskGeneration: 0,
        },
      },
    }, merged),
    false,
  );
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
      playStatus: "finished",
      provisional: false,
      homeTeamDataList: [],
      awayTeamDataList: [],
    },
  ];
  const acceptedMatches = [
    {
      matchId: 10,
      homeTeamDataList: [{ element: 1, playStatus: 2 }],
      awayTeamDataList: [{ element: 2, playStatus: 2 }],
    },
  ];
  const retainedMatches = retainLiveMatchPlayerDetails(
    candidateMatches,
    acceptedMatches,
  );
  assert.equal(retainedMatches[0].homeTeamDataList?.[0].element, 1);
  assert.equal(retainedMatches[0].homeTeamDataList?.[0].playStatus, 4);
  assert.equal(retainedMatches[0].awayTeamDataList?.[0].playStatus, 4);
  const retained = retainLiveMatchdayDetailRevision(candidate, accepted);
  assert.equal(retained.revisions.detailPublicationId, "detail-1");
  assert.equal(retained.detailDelivery.state, "DEGRADED");
  assert.ok(
    retained.detailDelivery.reasonCodes.includes("DETAIL_REVISION_RETAINED"),
  );

  const finalAccepted = matchdaySnapshot({
    state: "FINALIZED",
    times: { ...accepted.times, nextRefreshAt: null },
    detailDelivery: {
      state: "FINAL",
      servedFrom: "REDIS_CURRENT",
      reasonCodes: ["DETAIL_FINAL"],
    },
  });
  const finalRetained = retainLiveMatchdayDetailRevision(
    {
      ...candidate,
      state: "FINALIZED",
      detailDelivery: {
        state: "PENDING",
        servedFrom: null,
        reasonCodes: ["DETAIL_CANDIDATE_MISSING"],
      },
    },
    finalAccepted,
  );
  assert.equal(finalRetained.detailDelivery.state, "FINAL");
  assert.ok(
    finalRetained.detailDelivery.reasonCodes.includes(
      "DETAIL_CANDIDATE_MISSING",
    ),
  );
  assert.equal(
    shouldPollLiveMatchday({
      pageVisible: true,
      currentEventId: 3,
      selectedEventId: 3,
      snapshot: finalRetained,
    }),
    false,
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

test("terminal matchday stops polling even when an old deadline remains", () => {
  assert.equal(
    shouldPollLiveMatchday({
      pageVisible: true,
      currentEventId: 3,
      selectedEventId: 3,
      snapshot: matchdaySnapshot({
        state: "FINALIZED",
        detailDelivery: {
          state: "FINAL",
          servedFrom: "REDIS_CURRENT",
          reasonCodes: ["DETAIL_FINAL"],
        },
      }),
    }),
    false,
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
