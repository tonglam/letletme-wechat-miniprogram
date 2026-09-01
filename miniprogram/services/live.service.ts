import { getServedCacheStoredAt, graphqlRequest } from "./graphql.service";
import type { GraphQLOptions, PageRequestTrace } from "./graphql.service";
import type {
  LiveEntryAvailability,
  LiveEntryResult,
  LiveMatch,
  LiveMatchdayDelivery,
  LiveMatchdayRevisionVector,
  LiveMatchdayState,
  LiveMatchdayStatus,
  LiveMatchdayTimes,
  LivePlayerRow,
  LivePlayerStatPoints,
  LiveScore,
  LiveSnapshotResult,
  LiveSnapshotStatus,
} from "../models/live";
import { traceableLiveScore } from "./live-score-v2";

// Live payloads are expensive enough to deduplicate rapid page revisits, but
// short-lived enough to stay process-local (graphql.service does not persist
// sub-minute entries). Snapshot polling bypasses this cache when a new backend
// revision is observed.

export const LIVE_SNAPSHOT_QUERY = `
  query GetLiveContext {
    liveContext {
      season
      currentEventId
      anchorEventId
      latestFinalizedEventId
      nextEventId
      scoreCoreRevision
      state
      windowState
      dataAvailability
      revisions { publicationId generation lifecycle fixtureIdentity scoreCore displayStats explain picksBase officialAdjustment previousTotals finalResult rules algorithm input }
      times { sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt servedAt staleAt nextRefreshAt }
      delivery { state servedFrom reasonCodes }
      publishedAt
      sourceCheckedAt
      nextRefreshAt
    }
  }
`;

interface LiveSnapshotResponse {
  liveContext: {
    season: string;
    currentEventId: number | null;
    anchorEventId: number | null;
    latestFinalizedEventId: number | null;
    nextEventId: number | null;
    scoreCoreRevision: string | null;
    state: LiveSnapshotStatus["state"];
    windowState: LiveSnapshotStatus["windowState"];
    dataAvailability: LiveSnapshotStatus["dataAvailability"];
    publishedAt: string | null;
    sourceCheckedAt: string | null;
    nextRefreshAt: string | null;
    revisions: LiveSnapshotStatus["revisions"];
    times: LiveSnapshotStatus["times"];
    delivery: LiveSnapshotStatus["delivery"];
  };
}

export async function getLiveSnapshot(
  expectedEventId?: number,
): Promise<LiveSnapshotStatus | null> {
  const data = await graphqlRequest<LiveSnapshotResponse>(
    LIVE_SNAPSHOT_QUERY,
    {},
  );
  const context = data.liveContext;
  const anchorEventId =
    context?.anchorEventId ?? context?.currentEventId ?? null;
  if (
    !anchorEventId ||
    (expectedEventId !== undefined && anchorEventId !== expectedEventId)
  )
    return null;
  return {
    season: context.season,
    eventId: anchorEventId,
    scoreCoreRevision: context.scoreCoreRevision,
    state: context.state,
    publishedAt: context.publishedAt,
    sourceCheckedAt: context.sourceCheckedAt ?? context.publishedAt,
    windowState: context.windowState,
    dataAvailability: context.dataAvailability,
    revisions: context.revisions,
    times: context.times,
    delivery: context.delivery,
    nextRefreshAt: context.nextRefreshAt,
  };
}

export const CALC_LIVE_POINTS_BY_ENTRY = `
  query CalcLivePointsByEntry($eventId: Int!, $entryId: Int!) {
    calcLivePointsByEntry(eventId: $eventId, entryId: $entryId) {
      availability
      delivery { state servedFrom reasonCodes }
      snapshot {
        season
        eventId
        state
        revisions { publicationId generation lifecycle fixtureIdentity scoreCore displayStats explain picksBase officialAdjustment previousTotals finalResult rules algorithm input }
        times { sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt servedAt staleAt nextRefreshAt }
        delivery { state servedFrom reasonCodes }
      }
      entry
      event
      entryName
      playerName
      score {
        eventPoints
        netEventPoints
        totalPoints
        totalScope
        transferCost
        source
        calculationMode
        revisions { publicationId generation lifecycle fixtureIdentity scoreCore displayStats explain picksBase officialAdjustment previousTotals finalResult rules algorithm input }
        times { sourceCheckedAt contentUpdatedAt publishedAt checkpointedAt servedAt staleAt nextRefreshAt }
        delivery { state servedFrom reasonCodes }
      }
      region
      startedEvent
      value
      bank
      teamValue
      totalTransfers
      lastValue
      playedCaptain
      activeCaptain { id name points }
      captainName
      chip
      played
      toPlay
      pickList {
        element
        code
        webName
        price
        teamId
        teamCode
        teamName
        teamShortName
        elementType
        elementTypeName
        position
        totalPoints
        minutes
        goalsScored
        assists
        bonus
        bps
        playStatus
        pickActive
        isCaptain
        isViceCaptain
        autoSub
        multiplier
        cleanSheets
        saves
        yellowCards
        redCards
        ownGoals
        penaltiesSaved
        penaltiesMissed
        goalsConceded
        defensiveContribution
        starts
        isGwStarted
        isGwFinished
        isPlayed
        bgw
        expectedGoals
        expectedAssists
        expectedGoalInvolvements
        expectedGoalsConceded
      }
    }
  }
`;

interface GraphQLPickListItem {
  element: number;
  code: number;
  webName: string;
  price: number;
  teamId: number;
  teamCode: number;
  teamName: string;
  teamShortName: string;
  elementType: number;
  elementTypeName: string;
  position?: number;
  totalPoints: number;
  minutes: number;
  goalsScored: number;
  assists: number;
  bonus: number;
  bps: number;
  playStatus: number;
  pickActive?: boolean;
  autoSub: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  cleanSheets: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  goalsConceded?: number;
  defensiveContribution?: number;
  starts?: boolean;
  isGwStarted?: boolean;
  isGwFinished?: boolean;
  isPlayed?: boolean;
  bgw?: boolean;
  expectedGoals?: number;
  expectedAssists?: number;
  expectedGoalInvolvements?: number;
  expectedGoalsConceded?: number;
}

interface CalcLivePointsByEntryResponse {
  calcLivePointsByEntry: {
    availability: LiveEntryAvailability;
    delivery: LiveScore["delivery"];
    snapshot: LiveSnapshotStatus | null;
    entry: number;
    event: number;
    entryName?: string;
    playerName?: string;
    score: LiveScore;
    region: string | null;
    startedEvent: number;
    value: number;
    bank: number;
    teamValue: number;
    totalTransfers: number;
    lastValue: number;
    playedCaptain: number;
    activeCaptain: { id: number; name: string; points: number };
    captainName: string;
    chip: string;
    played: number;
    toPlay: number;
    pickList: GraphQLPickListItem[];
  };
}

function mapGraphQLPickList(pickList: GraphQLPickListItem[]): LivePlayerRow[] {
  return pickList.map((item) => ({
    element: item.element,
    code: item.code,
    price: item.price,
    teamId: item.teamId,
    teamCode: item.teamCode,
    teamName: item.teamName,
    webName: item.webName,
    teamShortName: item.teamShortName,
    elementType: item.elementType,
    elementTypeName: item.elementTypeName,
    squadPosition: item.position,
    points: item.totalPoints,
    totalPoints: item.totalPoints,
    minutes: item.minutes,
    goalsScored: item.goalsScored,
    assists: item.assists,
    bonus: item.bonus,
    bps: item.bps,
    playStatus: item.playStatus,
    pickActive: item.pickActive,
    autoSub: item.autoSub,
    captain: item.isCaptain || item.multiplier >= 2,
    viceCaptain: item.isViceCaptain,
    isCaptain: item.isCaptain,
    isViceCaptain: item.isViceCaptain,
    multiplier: item.multiplier,
    cleanSheets: item.cleanSheets,
    saves: item.saves,
    yellowCards: item.yellowCards,
    redCards: item.redCards,
    ownGoals: item.ownGoals,
    penaltiesSaved: item.penaltiesSaved,
    penaltiesMissed: item.penaltiesMissed,
    goalsConceded: item.goalsConceded,
    defensiveContribution: item.defensiveContribution,
    starts: item.starts,
    isGwStarted: item.isGwStarted,
    isGwFinished: item.isGwFinished,
    isPlayed: item.isPlayed,
    bgw: item.bgw,
    expectedGoals: item.expectedGoals,
    expectedAssists: item.expectedAssists,
    expectedGoalInvolvements: item.expectedGoalInvolvements,
    expectedGoalsConceded: item.expectedGoalsConceded,
  }));
}

export async function getLivePointsByEntrySnapshot(
  entry: number,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<LiveSnapshotResult<LiveEntryResult>> {
  const variables = { eventId: event, entryId: entry };
  const data = await graphqlRequest<CalcLivePointsByEntryResponse>(
    CALC_LIVE_POINTS_BY_ENTRY,
    variables,
    {
      cachePolicy: "live",
      forceRefresh,
      trace,
    },
  );
  const result = data.calcLivePointsByEntry;
  if (!result) {
    throw new Error("实时分数暂时不可用，请稍后重试");
  }
  const servedStoredAt = getServedCacheStoredAt(
    CALC_LIVE_POINTS_BY_ENTRY,
    variables,
  );
  const score = result.score;
  const renderableScore = traceableLiveScore(score);
  const eventPoints =
    renderableScore && Number.isFinite(renderableScore.eventPoints)
      ? renderableScore.eventPoints
      : undefined;
  const netEventPoints =
    renderableScore && Number.isFinite(renderableScore.netEventPoints)
      ? renderableScore.netEventPoints
      : undefined;
  const totalPoints =
    renderableScore?.totalScope === "OVERALL" &&
    Number.isFinite(renderableScore.totalPoints ?? Number.NaN)
      ? (renderableScore.totalPoints ?? undefined)
      : undefined;
  return {
    data: {
      availability: result.availability,
      entry: result.entry,
      event: result.event,
      entryName: result.entryName,
      playerName: result.playerName,
      score,
      livePoints: eventPoints,
      liveNetPoints: netEventPoints,
      netPointsKnown: netEventPoints !== undefined,
      liveTotalPoints: totalPoints,
      transferCost: renderableScore?.transferCost,
      scoreNextRefreshAt: score.times.nextRefreshAt ?? undefined,
      region: result.region,
      startedEvent: result.startedEvent,
      value: result.value,
      bank: result.bank,
      teamValue: result.teamValue,
      totalTransfers: result.totalTransfers,
      lastValue: result.lastValue,
      playedCaptain: result.playedCaptain,
      activeCaptain: result.activeCaptain,
      captainName: result.captainName,
      chip: result.chip,
      played: result.played,
      toPlay: result.toPlay,
      pickList: mapGraphQLPickList(result.pickList),
      servedStoredAt,
    },
    snapshot: result.snapshot,
    servedStoredAt,
  };
}

export async function getLivePointsByEntry(
  entry: number,
  event: number,
  forceRefresh = false,
): Promise<LiveEntryResult> {
  return (await getLivePointsByEntrySnapshot(entry, event, forceRefresh)).data;
}

export const LIVE_MATCHES_QUERY = `
  query LiveMatchday($eventId: Int) {
    liveMatchday(eventId: $eventId) {
      availability
      delivery { state servedFrom reasonCodes }
      snapshot {
        season
        eventId
        state
        revisions {
          deskPublicationId
          deskGeneration
          lifecycle
          fixtureIdentity
          scoreState
          detailObservation
          detailPublicationId
          detailGeneration
          playerDetail
        }
        times {
          deskSourceCheckedAt
          deskContentUpdatedAt
          deskPublishedAt
          deskStaleAt
          detailSourceCheckedAt
          detailContentUpdatedAt
          detailPublishedAt
          detailStaleAt
          servedAt
          nextRefreshAt
        }
        detailDelivery { state servedFrom reasonCodes }
        matches {
          fixtureId
          eventId
          homeTeamId
          homeTeamName
          homeTeamShortName
          awayTeamId
          awayTeamName
          awayTeamShortName
          homeScore
          awayScore
          kickoffTime
          minutes
          started
          finished
          finishedProvisional
          players {
            id
            webName
            position
            teamId
            totalPoints
            stats { identifier value awardedPoints }
          }
        }
      }
    }
  }
`;

/** Metadata-only probe used by the live refresh controller. */
export const LIVE_MATCHDAY_HEAD_QUERY = `
  query LiveMatchdayHead($eventId: Int) {
    liveMatchday(eventId: $eventId) {
      availability
      delivery { state servedFrom reasonCodes }
      snapshot {
        season
        eventId
        state
        revisions {
          deskPublicationId
          deskGeneration
          lifecycle
          fixtureIdentity
          scoreState
          detailObservation
        }
        times {
          deskSourceCheckedAt
          deskContentUpdatedAt
          deskPublishedAt
          deskStaleAt
          detailSourceCheckedAt
          detailContentUpdatedAt
          detailPublishedAt
          detailStaleAt
          servedAt
          nextRefreshAt
        }
        detailDelivery { state servedFrom reasonCodes }
      }
    }
  }
`;

export interface GraphQLMatchdayPlayerStat {
  identifier: string;
  value: number;
  awardedPoints: number;
}

export interface GraphQLMatchdayPlayer {
  id: number;
  webName: string;
  position: "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";
  teamId: number;
  totalPoints: number;
  stats: GraphQLMatchdayPlayerStat[];
}

export interface GraphQLMatchData {
  fixtureId: number;
  eventId: number;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamShortName?: string | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamShortName?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  kickoffTime: string | null;
  minutes: number;
  started: boolean;
  finished: boolean;
  finishedProvisional: boolean;
  players?: GraphQLMatchdayPlayer[];
}

interface LiveMatchdaySnapshot {
  season: string;
  eventId: number;
  state: LiveMatchdayState;
  revisions: LiveMatchdayRevisionVector;
  times: LiveMatchdayTimes;
  detailDelivery: LiveMatchdayDelivery;
  matches: GraphQLMatchData[];
}

interface LiveMatchesResponse {
  liveMatchday: {
    availability: "READY" | "UNAVAILABLE";
    delivery: LiveMatchdayDelivery;
    snapshot: LiveMatchdaySnapshot | null;
  };
}

type LiveMatchdayHeadRevisionVector = Pick<
  LiveMatchdayRevisionVector,
  | "deskPublicationId"
  | "deskGeneration"
  | "lifecycle"
  | "fixtureIdentity"
  | "scoreState"
  | "detailObservation"
> &
  Partial<
    Pick<
      LiveMatchdayRevisionVector,
      "detailPublicationId" | "detailGeneration" | "playerDetail"
    >
  >;

type LiveMatchdayHeadSnapshot = Omit<
  LiveMatchdaySnapshot,
  "matches" | "revisions"
> & {
  revisions: LiveMatchdayHeadRevisionVector;
};

interface LiveMatchdayHeadResponse {
  liveMatchday: {
    availability: "READY" | "UNAVAILABLE";
    delivery: LiveMatchdayDelivery;
    snapshot: LiveMatchdayHeadSnapshot | null;
  };
}

const POSITION_TYPE: Record<GraphQLMatchdayPlayer["position"], number> = {
  GOALKEEPER: 1,
  DEFENDER: 2,
  MIDFIELDER: 3,
  FORWARD: 4,
};

function normalizeLiveMatchdayRevisionVector(
  revisions: LiveMatchdayHeadRevisionVector,
): LiveMatchdayRevisionVector {
  return {
    ...revisions,
    detailPublicationId: revisions.detailPublicationId ?? null,
    detailGeneration: revisions.detailGeneration ?? null,
    playerDetail: revisions.playerDetail ?? null,
  };
}

function statValue(
  player: GraphQLMatchdayPlayer,
  identifiers: readonly string[],
): number {
  const names = new Set(
    identifiers.map((identifier) => identifier.toLowerCase()),
  );
  return (
    player.stats.find((stat) => names.has(stat.identifier.toLowerCase()))
      ?.value ?? 0
  );
}

function matchPlayerPlayStatus(match: GraphQLMatchData): number {
  if (match.finished) return 4;
  if (match.finishedProvisional) return 3;
  if (match.started) return 2;
  return 1;
}

function mapLiveMatchdayPlayer(
  player: GraphQLMatchdayPlayer,
  match: GraphQLMatchData,
): LivePlayerRow {
  const statPoints: Record<string, LivePlayerStatPoints> = {};
  for (const stat of player.stats) {
    const identifier = stat.identifier.toLowerCase();
    statPoints[identifier] = {
      awardedPoints: stat.awardedPoints,
    };
  }
  const isHomePlayer = player.teamId === match.homeTeamId;
  const isAwayPlayer = player.teamId === match.awayTeamId;
  return {
    element: player.id,
    teamId: player.teamId,
    team: isHomePlayer
      ? match.homeTeamName
      : isAwayPlayer
        ? match.awayTeamName
        : undefined,
    teamShortName: isHomePlayer
      ? (match.homeTeamShortName ?? match.homeTeamName)
      : isAwayPlayer
        ? (match.awayTeamShortName ?? match.awayTeamName)
        : undefined,
    webName: player.webName,
    name: player.webName,
    position: player.position,
    elementType: POSITION_TYPE[player.position],
    elementTypeName: player.position,
    totalPoints: player.totalPoints,
    playStatus: matchPlayerPlayStatus(match),
    minutes: statValue(player, ["minutes", "mins"]),
    goalsScored: statValue(player, ["goals", "goals_scored", "goalsScored"]),
    assists: statValue(player, ["assists"]),
    cleanSheets: statValue(player, ["clean_sheets", "cleanSheets"]),
    goalsConceded: statValue(player, ["goals_conceded", "goalsConceded"]),
    ownGoals: statValue(player, ["own_goals", "ownGoals"]),
    penaltiesSaved: statValue(player, ["penalties_saved", "penaltiesSaved"]),
    penaltiesMissed: statValue(player, ["penalties_missed", "penaltiesMissed"]),
    yellowCards: statValue(player, ["yellow_cards", "yellowCards"]),
    redCards: statValue(player, ["red_cards", "redCards"]),
    saves: statValue(player, ["saves"]),
    bonus: statValue(player, ["bonus"]),
    bps: statValue(player, ["bps"]),
    defensiveContribution: statValue(player, [
      "defensive_contribution",
      "defensiveContribution",
    ]),
    statPoints,
  };
}

const MATCH_LIFECYCLE_STATES = new Set<LiveMatchdayState>([
  "PRE_DEADLINE",
  "LIVE_ACTIVE",
  "BETWEEN_FIXTURES",
  "DAY_SETTLING",
  "GW_REVIEW",
  "FINALIZED",
]);

const MATCH_DELIVERY_STATES = new Set([
  "FRESH",
  "STALE",
  "DEGRADED",
  "FINAL",
  "PENDING",
  "UNAVAILABLE",
]);

const MATCH_SERVED_FROM = new Set([
  "REDIS_CURRENT",
  "REDIS_PREVIOUS",
  "PROCESS_LKG",
  "POSTGRES_CHECKPOINT",
]);

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isOptionalTimestamp(value: unknown): boolean {
  return value === null || isTimestamp(value);
}

function isMatchDelivery(value: unknown): value is LiveMatchdayDelivery {
  if (!value || typeof value !== "object") return false;
  const delivery = value as LiveMatchdayDelivery;
  return (
    MATCH_DELIVERY_STATES.has(delivery.state) &&
    (delivery.servedFrom === null ||
      MATCH_SERVED_FROM.has(delivery.servedFrom)) &&
    Array.isArray(delivery.reasonCodes) &&
    delivery.reasonCodes.every(
      (reason) => typeof reason === "string" && reason.length > 0,
    )
  );
}

export function snapshotFromLiveMatchday(
  result: LiveMatchesResponse["liveMatchday"],
): LiveMatchdayStatus | null {
  const snapshot = result.snapshot;
  if (!snapshot) return null;
  return {
    season: snapshot.season,
    eventId: snapshot.eventId,
    state: snapshot.state,
    revisions: normalizeLiveMatchdayRevisionVector(snapshot.revisions),
    times: snapshot.times,
    availability: result.availability,
    delivery: result.delivery,
    detailDelivery: snapshot.detailDelivery,
  };
}

export function snapshotFromLiveMatchdayHead(
  result: LiveMatchdayHeadResponse["liveMatchday"],
): LiveMatchdayStatus | null {
  const snapshot = result.snapshot;
  if (!snapshot) return null;
  return {
    season: snapshot.season,
    eventId: snapshot.eventId,
    state: snapshot.state,
    revisions: normalizeLiveMatchdayRevisionVector(snapshot.revisions),
    times: snapshot.times,
    availability: result.availability,
    delivery: result.delivery,
    detailDelivery: snapshot.detailDelivery,
  };
}

export function validateLiveMatchday(
  result: LiveMatchesResponse["liveMatchday"] | null | undefined,
  mode: LiveMatchdayValidationMode = "full",
): asserts result is LiveMatchesResponse["liveMatchday"] {
  if (
    !result ||
    (result.availability !== "READY" &&
      result.availability !== "UNAVAILABLE") ||
    !isMatchDelivery(result.delivery)
  ) {
    throw new Error("LIVE_MATCHDAY_INCOHERENT");
  }
  const snapshot = result.snapshot;
  if (result.availability === "UNAVAILABLE") {
    if (
      snapshot !== null ||
      result.delivery.state !== "UNAVAILABLE" ||
      result.delivery.servedFrom !== null
    ) {
      throw new Error("LIVE_MATCHDAY_INCOHERENT");
    }
    return;
  }
  if (
    !snapshot ||
    result.delivery.state === "UNAVAILABLE" ||
    result.delivery.state === "PENDING" ||
    result.delivery.servedFrom === null
  ) {
    throw new Error("LIVE_MATCHDAY_INCOHERENT");
  }
  if (!snapshot.revisions || !snapshot.times) {
    throw new Error("LIVE_MATCHDAY_INCOHERENT");
  }
  const detailRevisionPresent =
    typeof snapshot.revisions.detailPublicationId === "string" &&
    snapshot.revisions.detailPublicationId.length > 0 &&
    Number.isSafeInteger(snapshot.revisions.detailGeneration) &&
    Number(snapshot.revisions.detailGeneration) > 0 &&
    typeof snapshot.revisions.playerDetail === "string" &&
    snapshot.revisions.playerDetail.length > 0;
  const detailRevisionAbsent =
    snapshot.revisions.detailPublicationId === null &&
    snapshot.revisions.detailGeneration === null &&
    snapshot.revisions.playerDetail === null;
  const detailObservationPresent =
    typeof snapshot.revisions.detailObservation === "string" &&
    snapshot.revisions.detailObservation.length > 0;
  const detailObservationAbsent = snapshot.revisions.detailObservation === null;
  const detailTimesPresent =
    isTimestamp(snapshot.times.detailSourceCheckedAt) &&
    isTimestamp(snapshot.times.detailContentUpdatedAt) &&
    isTimestamp(snapshot.times.detailPublishedAt) &&
    isOptionalTimestamp(snapshot.times.detailStaleAt);
  const detailTimesAbsent =
    snapshot.times.detailSourceCheckedAt === null &&
    snapshot.times.detailContentUpdatedAt === null &&
    snapshot.times.detailPublishedAt === null &&
    snapshot.times.detailStaleAt === null;
  const headFinalDetailManifest =
    mode === "head" &&
    result.delivery.state === "FINAL" &&
    snapshot.detailDelivery.state === "FINAL" &&
    detailRevisionAbsent &&
    detailObservationPresent;
  if (
    !snapshot.season ||
    !Number.isSafeInteger(snapshot.eventId) ||
    snapshot.eventId <= 0 ||
    !MATCH_LIFECYCLE_STATES.has(snapshot.state) ||
    !snapshot.revisions.deskPublicationId ||
    !Number.isSafeInteger(snapshot.revisions.deskGeneration) ||
    snapshot.revisions.deskGeneration <= 0 ||
    !snapshot.revisions.lifecycle ||
    !snapshot.revisions.fixtureIdentity ||
    !snapshot.revisions.scoreState ||
    (!detailRevisionPresent && !detailRevisionAbsent) ||
    (!detailObservationPresent && !detailObservationAbsent) ||
    (detailRevisionPresent && !detailObservationPresent) ||
    !isTimestamp(snapshot.times.deskSourceCheckedAt) ||
    !isTimestamp(snapshot.times.deskContentUpdatedAt) ||
    !isTimestamp(snapshot.times.deskPublishedAt) ||
    !isOptionalTimestamp(snapshot.times.deskStaleAt) ||
    !isOptionalTimestamp(snapshot.times.detailSourceCheckedAt) ||
    !isOptionalTimestamp(snapshot.times.detailContentUpdatedAt) ||
    !isOptionalTimestamp(snapshot.times.detailPublishedAt) ||
    !isOptionalTimestamp(snapshot.times.detailStaleAt) ||
    !isTimestamp(snapshot.times.servedAt) ||
    !isOptionalTimestamp(snapshot.times.nextRefreshAt) ||
    !isMatchDelivery(snapshot.detailDelivery) ||
    !Array.isArray(snapshot.matches)
  ) {
    throw new Error("LIVE_MATCHDAY_INCOHERENT");
  }
  if (
    detailTimesPresent !== detailObservationPresent ||
    detailTimesAbsent !== !detailObservationPresent ||
    (detailRevisionAbsent &&
      detailObservationAbsent &&
      (snapshot.detailDelivery.servedFrom !== null ||
        !["PENDING", "DEGRADED"].includes(snapshot.detailDelivery.state))) ||
    (detailRevisionAbsent &&
      detailObservationPresent &&
      (snapshot.detailDelivery.servedFrom === null ||
        (![
          "PENDING",
          "DEGRADED",
        ].includes(snapshot.detailDelivery.state) &&
          !headFinalDetailManifest))) ||
    (detailRevisionPresent &&
      (snapshot.detailDelivery.servedFrom === null ||
        ["PENDING", "UNAVAILABLE"].includes(snapshot.detailDelivery.state))) ||
    (result.delivery.state === "FINAL" &&
      (snapshot.state !== "FINALIZED" ||
        snapshot.detailDelivery.state !== "FINAL" ||
        (mode !== "head" && !detailRevisionPresent)))
  ) {
    throw new Error("LIVE_MATCHDAY_INCOHERENT");
  }
  const fixtureIds = new Set<number>();
  for (const fixture of snapshot.matches) {
    if (
      fixture.eventId !== snapshot.eventId ||
      !Number.isSafeInteger(fixture.fixtureId) ||
      fixture.fixtureId <= 0 ||
      fixtureIds.has(fixture.fixtureId) ||
      !Number.isSafeInteger(fixture.homeTeamId) ||
      !Number.isSafeInteger(fixture.awayTeamId) ||
      fixture.homeTeamId <= 0 ||
      fixture.awayTeamId <= 0 ||
      fixture.homeTeamId === fixture.awayTeamId ||
      !fixture.homeTeamName ||
      !fixture.awayTeamName ||
      (fixture.homeScore !== null &&
        (!Number.isSafeInteger(fixture.homeScore) || fixture.homeScore < 0)) ||
      (fixture.awayScore !== null &&
        (!Number.isSafeInteger(fixture.awayScore) || fixture.awayScore < 0)) ||
      (fixture.kickoffTime !== null && !isTimestamp(fixture.kickoffTime)) ||
      !Number.isSafeInteger(fixture.minutes) ||
      fixture.minutes < 0 ||
      typeof fixture.started !== "boolean" ||
      typeof fixture.finished !== "boolean" ||
      typeof fixture.finishedProvisional !== "boolean" ||
      !Array.isArray(fixture.players)
    ) {
      throw new Error("LIVE_MATCHDAY_INCOHERENT");
    }
    fixtureIds.add(fixture.fixtureId);
    const playerIds = new Set<number>();
    for (const player of fixture.players) {
      if (
        !Number.isSafeInteger(player.id) ||
        player.id <= 0 ||
        playerIds.has(player.id) ||
        (player.teamId !== fixture.homeTeamId &&
          player.teamId !== fixture.awayTeamId) ||
        !player.webName ||
        !Object.prototype.hasOwnProperty.call(POSITION_TYPE, player.position) ||
        !Number.isSafeInteger(player.totalPoints) ||
        !Array.isArray(player.stats)
      ) {
        throw new Error("LIVE_MATCHDAY_INCOHERENT");
      }
      playerIds.add(player.id);
      const statIdentifiers = new Set<string>();
      for (const stat of player.stats) {
        const identifier =
          typeof stat.identifier === "string"
            ? stat.identifier.trim().toLowerCase()
            : "";
        if (
          !identifier ||
          statIdentifiers.has(identifier) ||
          !Number.isFinite(stat.value) ||
          !Number.isFinite(stat.awardedPoints)
        ) {
          throw new Error("LIVE_MATCHDAY_INCOHERENT");
        }
        statIdentifiers.add(identifier);
      }
      const awardedPoints = player.stats.reduce(
        (total, stat) => total + stat.awardedPoints,
        0,
      );
      if (awardedPoints !== player.totalPoints) {
        throw new Error("LIVE_MATCHDAY_INCOHERENT");
      }
    }
  }
}

export function validateLiveMatchdayHead(
  result: LiveMatchdayHeadResponse["liveMatchday"] | null | undefined,
): asserts result is LiveMatchdayHeadResponse["liveMatchday"] {
  if (!result) throw new Error("LIVE_MATCHDAY_INCOHERENT");
  // Reuse the full publication validator for the shared metadata envelope.
  // The head deliberately omits the expensive fixture/player arrays, so an
  // empty synthetic array is sufficient for the common structural checks.
  validateLiveMatchday({
    ...result,
    snapshot: result.snapshot
      ? {
          ...result.snapshot,
          revisions: {
            ...result.snapshot.revisions,
            detailPublicationId: null,
            detailGeneration: null,
            playerDetail: null,
          },
          matches: [],
        }
      : null,
  }, "head");
}

type LiveMatchdayValidationMode = "head" | "full";

function isExpectedLiveMatchdayScope(
  result:
    | LiveMatchesResponse["liveMatchday"]
    | LiveMatchdayHeadResponse["liveMatchday"],
  expectedEventId?: number,
  expectedSeason?: string,
): boolean {
  const snapshot = result.snapshot;
  return (
    !snapshot ||
    (expectedEventId === undefined || snapshot.eventId === expectedEventId) &&
      (!expectedSeason?.trim() || snapshot.season === expectedSeason.trim())
  );
}

function validateLiveMatchdayCacheData(
  data: unknown,
  mode: LiveMatchdayValidationMode,
  expectedEventId?: number,
  expectedSeason?: string,
): boolean {
  if (!data || typeof data !== "object") return false;
  const result = (data as { liveMatchday?: unknown }).liveMatchday;
  try {
    if (mode === "head") {
      validateLiveMatchdayHead(
        result as LiveMatchdayHeadResponse["liveMatchday"],
      );
    } else {
      validateLiveMatchday(result as LiveMatchesResponse["liveMatchday"]);
    }
    // An unavailable envelope is a valid response state, but it is not a
    // publication and must never replace a previously cached same-event LKG.
    if (
      (result as
        | LiveMatchesResponse["liveMatchday"]
        | LiveMatchdayHeadResponse["liveMatchday"]).availability ===
      "UNAVAILABLE"
    ) {
      return false;
    }
    return isExpectedLiveMatchdayScope(
      result as
        | LiveMatchesResponse["liveMatchday"]
        | LiveMatchdayHeadResponse["liveMatchday"],
      expectedEventId,
      expectedSeason,
    );
  } catch {
    return false;
  }
}

export function liveMatchdayRequestOptions(
  expectedEventId: number | undefined,
  forceRefresh: boolean,
  trace?: PageRequestTrace | null,
  mode: LiveMatchdayValidationMode = "full",
  expectedSeason?: string,
): GraphQLOptions {
  const season = expectedSeason?.trim();
  return {
    cachePolicy: "live",
    cacheVariant: `${season ? `season:${season}|` : ""}matchday:event:${expectedEventId ?? "active-pointer"}`,
    // The page-owned same-event LKG is the authority for live matchday data.
    // A client TTL could admit a coherent but older REDIS_PREVIOUS FULL
    // response after a forced refresh, so neither HEAD nor FULL is persisted
    // in the generic GraphQL response cache.
    cacheTtl: 0,
    staleTtl: 0,
    forceRefresh,
    trace,
    validateCacheData: (data) =>
      validateLiveMatchdayCacheData(data, mode, expectedEventId, season),
    // A malformed publication must not evict the same-event last-good value.
    preserveCacheOnValidationFailure: true,
  };
}

export function mapGraphQLMatch(match: GraphQLMatchData): LiveMatch {
  const players = (match.players ?? []).map((player) =>
    mapLiveMatchdayPlayer(player, match),
  );
  return {
    matchId: match.fixtureId,
    homeTeamId: match.homeTeamId,
    homeTeamName: match.homeTeamName,
    homeTeamShortName: match.homeTeamShortName ?? match.homeTeamName,
    homeScore: match.homeScore ?? undefined,
    awayTeamName: match.awayTeamName,
    awayTeamShortName: match.awayTeamShortName ?? match.awayTeamName,
    awayTeamId: match.awayTeamId,
    awayScore: match.awayScore ?? undefined,
    kickoffTime: match.kickoffTime ?? "",
    provisional: match.finishedProvisional === true,
    minutes: match.minutes,
    playStatus:
      match.finished || match.finishedProvisional
        ? "finished"
        : match.started
          ? "playing"
          : "not_started",
    homeTeamDataList: players.filter(
      (player) => player.teamId === match.homeTeamId,
    ),
    awayTeamDataList: players.filter(
      (player) => player.teamId === match.awayTeamId,
    ),
  };
}

interface GraphQLLivePerformance {
  player: {
    id: number;
    webName: string;
    position: "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";
    team: { id: number; name: string; shortName: string } | null;
  } | null;
  minutes: number | null;
  goalsScored: number | null;
  assists: number | null;
  cleanSheets: number | null;
  goalsConceded: number | null;
  ownGoals: number | null;
  penaltiesSaved: number | null;
  penaltiesMissed: number | null;
  yellowCards: number | null;
  redCards: number | null;
  saves: number | null;
  bonus: number | null;
  bps: number | null;
  defensiveContribution: number | null;
  totalPoints: number;
}

function mapLiveFixturePlayer(
  row: GraphQLLivePerformance,
): LivePlayerRow | null {
  const player = row.player;
  if (!player?.team) return null;
  return {
    element: player.id,
    teamId: player.team.id,
    webName: player.webName,
    name: player.webName,
    team: player.team.name,
    teamShortName: player.team.shortName,
    position: player.position,
    elementType: POSITION_TYPE[player.position],
    elementTypeName: player.position,
    points: row.totalPoints,
    totalPoints: row.totalPoints,
    minutes: row.minutes ?? 0,
    goalsScored: row.goalsScored ?? 0,
    assists: row.assists ?? 0,
    cleanSheets: row.cleanSheets ?? 0,
    goalsConceded: row.goalsConceded ?? 0,
    ownGoals: row.ownGoals ?? 0,
    penaltiesSaved: row.penaltiesSaved ?? 0,
    penaltiesMissed: row.penaltiesMissed ?? 0,
    yellowCards: row.yellowCards ?? 0,
    redCards: row.redCards ?? 0,
    saves: row.saves ?? 0,
    bonus: row.bonus ?? 0,
    bps: row.bps ?? 0,
    defensiveContribution: row.defensiveContribution ?? 0,
  };
}

export const PLAYER_LIVE_STATS_QUERY = `
  query PlayerLiveStats($playerId: Int!, $eventId: Int!) {
    playerLive(playerId: $playerId, eventId: $eventId) {
      player { id webName position team { id name shortName } }
      minutes goalsScored assists cleanSheets goalsConceded ownGoals
      penaltiesSaved penaltiesMissed yellowCards redCards saves bonus bps
      defensiveContribution totalPoints
    }
  }
`;

interface PlayerLiveStatsResponse {
  playerLive: GraphQLLivePerformance | null;
}

/**
 * Single-player GW stats for the player detail sheet — the mini counterpart of
 * the web modal's GET_PLAYER_LIVE lazy fill. Keeps the hosting card's query
 * thin while the sheet still shows the full stat set (DC, cards, saves…).
 */
export async function getPlayerLiveStats(
  playerId: number,
  eventId: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<LivePlayerRow | null> {
  if (
    !Number.isSafeInteger(playerId) ||
    playerId <= 0 ||
    !Number.isSafeInteger(eventId) ||
    eventId <= 0
  ) {
    return null;
  }
  const data = await graphqlRequest<PlayerLiveStatsResponse>(
    PLAYER_LIVE_STATS_QUERY,
    { playerId, eventId },
    {
      cachePolicy: "live",
      cacheVariant: `player-live:${eventId}`,
      forceRefresh,
      trace,
    },
  );
  return data.playerLive ? mapLiveFixturePlayer(data.playerLive) : null;
}

export async function getLiveMatchByStatusSnapshot(
  status: string,
  forceRefresh = false,
  trace?: PageRequestTrace | null,
  expectedEventId?: number,
  expectedSeason?: string,
): Promise<LiveSnapshotResult<LiveMatch[], LiveMatchdayStatus>> {
  const variables = { eventId: expectedEventId ?? null };
  const requestOptions = liveMatchdayRequestOptions(
    expectedEventId,
    forceRefresh,
    trace,
    "full",
    expectedSeason,
  );
  const data = await graphqlRequest<LiveMatchesResponse>(
    LIVE_MATCHES_QUERY,
    variables,
    requestOptions,
  );
  const result = data.liveMatchday;
  validateLiveMatchday(result);
  if (!isExpectedLiveMatchdayScope(result, expectedEventId, expectedSeason)) {
    throw new Error("LIVE_MATCHDAY_SCOPE_MISMATCH");
  }
  const mapped = result.snapshot?.matches.map(mapGraphQLMatch) ?? [];
  return {
    data: filterLiveMatchesByStatus(mapped, status),
    snapshot: snapshotFromLiveMatchday(result),
    servedStoredAt: getServedCacheStoredAt(
      LIVE_MATCHES_QUERY,
      variables,
      requestOptions,
    ),
  };
}

export async function getLiveMatchdayHead(
  expectedEventId?: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null,
  expectedSeason?: string,
): Promise<LiveMatchdayStatus | null> {
  const variables = { eventId: expectedEventId ?? null };
  const requestOptions = liveMatchdayRequestOptions(
    expectedEventId,
    forceRefresh,
    trace,
    "head",
    expectedSeason,
  );
  const data = await graphqlRequest<LiveMatchdayHeadResponse>(
    LIVE_MATCHDAY_HEAD_QUERY,
    variables,
    requestOptions,
  );
  const result = data.liveMatchday;
  validateLiveMatchdayHead(result);
  if (!isExpectedLiveMatchdayScope(result, expectedEventId, expectedSeason)) {
    throw new Error("LIVE_MATCHDAY_SCOPE_MISMATCH");
  }
  return snapshotFromLiveMatchdayHead(result);
}

function filterLiveMatchesByStatus(
  matches: LiveMatch[],
  status: string,
): LiveMatch[] {
  switch (status) {
    case "playing":
      return matches.filter((match) => match.playStatus === "playing");
    case "finished":
      return matches.filter((match) => match.playStatus === "finished");
    case "not_start":
      return matches.filter((match) => match.playStatus === "not_started");
    case "all":
    default:
      return matches;
  }
}

export async function getLiveMatchByStatus(
  status: string,
  forceRefresh = false,
): Promise<LiveMatch[]> {
  return (await getLiveMatchByStatusSnapshot(status, forceRefresh)).data;
}
