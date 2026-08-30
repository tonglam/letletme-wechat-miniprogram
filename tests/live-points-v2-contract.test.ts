import {
  LIVE_REFRESH_INTERVAL_MS,
  liveSnapshotNeedsRefresh,
  shouldPollLiveSnapshot,
} from "../miniprogram/utils/live-refresh";
import {
  liveScoreDeliveryState,
  liveScoreEventPoints,
  traceableLiveScore,
} from "../miniprogram/services/live-score-v2";
import {
  buildGraphQLRequestHeaders,
  GraphQLTransportError,
  isClientUpgradeRequired,
  isLivePointsV2Query,
} from "../miniprogram/services/graphql.service";
import type { LiveScore, LiveSnapshotStatus } from "../miniprogram/models/live";

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const revision = (value: string): string => value.repeat(64 / value.length);

const snapshot = (
  scoreCoreRevision = revision("a"),
  revisionOverrides: Partial<NonNullable<LiveSnapshotStatus["revisions"]>> = {},
): LiveSnapshotStatus => ({
  season: "2627",
  eventId: 1,
  state: "LIVE_ACTIVE",
  scoreCoreRevision,
  publishedAt: "2026-08-29T10:00:00.000Z",
  sourceCheckedAt: "2026-08-29T10:00:00.000Z",
  revisions: {
    publicationId: "publication-1",
    generation: 1,
    lifecycle: revision("b"),
    fixtureIdentity: revision("c"),
    scoreCore: scoreCoreRevision,
    displayStats: revision("d"),
    explain: revision("e"),
    picksBase: revision("f"),
    officialAdjustment: null,
    previousTotals: revision("g"),
    finalResult: null,
    rules: revision("h"),
    algorithm: "live-points-v2-algorithm-1",
    input: revision("i"),
    ...revisionOverrides,
  },
});

const score = (
  deliveryState: LiveScore["delivery"]["state"] = "FRESH",
): LiveScore => ({
  eventPoints: 71,
  netEventPoints: 67,
  totalPoints: 1267,
  totalScope: "OVERALL",
  transferCost: 4,
  source: "FPL_EVENT_LIVE",
  calculationMode: "PROJECTED_AUTOSUBS",
  revisions: {
    publicationId: "publication-1",
    generation: 1,
    lifecycle: revision("a"),
    fixtureIdentity: revision("b"),
    scoreCore: revision("c"),
    displayStats: revision("d"),
    explain: revision("e"),
    picksBase: revision("f"),
    officialAdjustment: null,
    previousTotals: revision("g"),
    finalResult: null,
    rules: revision("h"),
    algorithm: "live-points-v2-algorithm-1",
    input: revision("i"),
  },
  times: {
    sourceCheckedAt: "2026-08-29T10:00:00.000Z",
    contentUpdatedAt: "2026-08-29T10:00:00.000Z",
    publishedAt: "2026-08-29T10:00:00.000Z",
    checkpointedAt: null,
    servedAt: "2026-08-29T10:00:01.000Z",
    staleAt: "2026-08-29T10:00:30.000Z",
    nextRefreshAt: null,
  },
  delivery: {
    state: deliveryState,
    servedFrom: "REDIS_CURRENT",
    reasonCodes: [],
  },
});

assertEqual(LIVE_REFRESH_INTERVAL_MS, 30_000, "V2 refresh cadence");
assertEqual(
  isLivePointsV2Query("query { liveContext { eventId } }"),
  true,
  "context is gated",
);
assertEqual(
  isLivePointsV2Query("query { events { id } }"),
  false,
  "non-live query is not gated",
);
const headers = buildGraphQLRequestHeaders("public", null, "device");
assertEqual(
  headers["X-LetLetMe-Contract"],
  undefined,
  "base headers stay neutral",
);
assertEqual(
  isClientUpgradeRequired(
    new GraphQLTransportError("upgrade", false, 426, {
      code: "CLIENT_UPGRADE_REQUIRED",
    }),
  ),
  true,
  "upgrade code is explicit",
);
assertEqual(
  liveSnapshotNeedsRefresh(snapshot(), {
    ...snapshot(),
    sourceCheckedAt: "2026-08-29T10:00:29.000Z",
  }),
  false,
  "heartbeat-only change does not reload the score",
);
assertEqual(
  liveSnapshotNeedsRefresh(snapshot(), snapshot(revision("b"))),
  true,
  "score revision change reloads the score",
);
assertEqual(
  liveSnapshotNeedsRefresh(
    snapshot(),
    snapshot(revision("a"), { fixtureIdentity: revision("z") }),
  ),
  true,
  "fixture revision change reloads match data",
);
assertEqual(
  liveSnapshotNeedsRefresh(
    snapshot(),
    snapshot(revision("a"), { officialAdjustment: revision("b") }),
  ),
  true,
  "official adjustment revision reloads the score",
);
assertEqual(
  liveSnapshotNeedsRefresh(
    snapshot(),
    snapshot(revision("a"), { finalResult: revision("b") }),
  ),
  true,
  "final result revision reloads the score",
);
assertEqual(
  shouldPollLiveSnapshot({
    pageVisible: true,
    currentEventId: 1,
    selectedEventId: 1,
    snapshot: snapshot(),
  }),
  true,
  "active event remains eligible",
);
assertEqual(
  shouldPollLiveSnapshot({
    pageVisible: true,
    currentEventId: 2,
    selectedEventId: 1,
    snapshot: snapshot(),
  }),
  false,
  "cross-event polling is forbidden",
);

const traceable = traceableLiveScore(score());
if (!traceable) throw new Error("complete V2 score was rejected");
assertEqual(liveScoreEventPoints(traceable), 71, "traceable event points");
assertEqual(
  liveScoreDeliveryState(traceable),
  "FRESH",
  "traceable delivery state",
);
assertEqual(
  traceableLiveScore(score("UNAVAILABLE")),
  undefined,
  "unavailable score is not renderable",
);

console.log("live-points-v2-contract tests passed");
