import {
  getServedCacheStoredAt,
  graphqlRequest,
  hasGraphQLErrorCode,
} from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";
import type {
  LiveEntryAvailability,
  LiveEntryResult,
  LiveMatch,
  LivePlayerRow,
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
  const eventPoints = renderableScore && Number.isFinite(renderableScore.eventPoints)
    ? renderableScore.eventPoints
    : undefined;
  const netEventPoints = renderableScore && Number.isFinite(renderableScore.netEventPoints)
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
  query LiveMatchdayDesk {
    liveMatchdayDesk {
      season
      eventId
      scoreCoreRevision
      state
      windowState
      dataAvailability
      publishedAt
      sourceCheckedAt
      nextRefreshAt
      revisions {
        publicationId
        generation
        lifecycle
        fixtureIdentity
        scoreCore
        displayStats
        explain
        picksBase
        officialAdjustment
        previousTotals
        finalResult
        rules
        algorithm
        input
      }
      times {
        sourceCheckedAt
        contentUpdatedAt
        publishedAt
        checkpointedAt
        servedAt
        staleAt
        nextRefreshAt
      }
      delivery { state servedFrom reasonCodes }
      matches {
        fixtureId
        eventId
        homeTeamId
        homeTeamName
        awayTeamId
        awayTeamName
        homeScore
        awayScore
        kickoffTime
        minutes
        started
        finished
        finishedProvisional
      }
    }
  }
`;

export interface GraphQLMatchData {
  fixtureId: number;
  eventId: number;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  kickoffTime: string | null;
  minutes: number;
  started: boolean;
  finished: boolean;
  finishedProvisional: boolean;
}

interface LiveMatchesResponse {
  liveMatchdayDesk: {
    season: string;
    eventId: number;
    scoreCoreRevision: string;
    state: LiveSnapshotStatus["state"];
    windowState: LiveSnapshotStatus["windowState"];
    dataAvailability: LiveSnapshotStatus["dataAvailability"];
    publishedAt: string;
    sourceCheckedAt: string;
    nextRefreshAt: string | null;
    revisions: LiveSnapshotStatus["revisions"];
    times: LiveSnapshotStatus["times"];
    delivery: LiveSnapshotStatus["delivery"];
    matches: GraphQLMatchData[];
  };
}

function snapshotFromLiveDesk(
  result: LiveMatchesResponse["liveMatchdayDesk"],
): LiveSnapshotStatus {
  return {
    season: result.season,
    eventId: result.eventId,
    scoreCoreRevision: result.scoreCoreRevision,
    state: result.windowState ?? result.state,
    publishedAt: result.publishedAt,
    sourceCheckedAt: result.sourceCheckedAt ?? result.publishedAt,
    revisions: result.revisions,
    times: result.times,
    delivery: result.delivery,
    windowState: result.windowState,
    dataAvailability: result.dataAvailability,
    nextRefreshAt: result.nextRefreshAt,
  };
}

export function mapGraphQLMatch(match: GraphQLMatchData): LiveMatch {
  return {
    matchId: match.fixtureId,
    homeTeamId: match.homeTeamId,
    homeTeamName: match.homeTeamName,
    homeTeamShortName: match.homeTeamName,
    homeScore: match.homeScore ?? undefined,
    awayTeamName: match.awayTeamName,
    awayTeamShortName: match.awayTeamName,
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
    homeTeamDataList: [],
    awayTeamDataList: [],
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

export interface GraphQLLiveFixturePlayers {
  season: string;
  eventId: number;
  scoreCoreRevision: string;
  fixtureId: number;
  players: GraphQLLivePerformance[];
}

type LiveFixturePlayersBatchResponse = Record<
  string,
  GraphQLLiveFixturePlayers
>;

const POSITION_TYPE: Record<
  NonNullable<GraphQLLivePerformance["player"]>["position"],
  number
> = {
  GOALKEEPER: 1,
  DEFENDER: 2,
  MIDFIELDER: 3,
  FORWARD: 4,
};

const LIVE_FIXTURE_PLAYERS_FRAGMENT = `
  fragment LiveFixturePlayersBatchFields on LiveFixturePlayers {
    season eventId scoreCoreRevision fixtureId
    players {
      player { id webName position team { id name shortName } }
      minutes goalsScored assists cleanSheets goalsConceded ownGoals
      penaltiesSaved penaltiesMissed yellowCards redCards saves bonus bps
      defensiveContribution totalPoints
    }
  }
`;

function liveFixturePlayersSelection(alias: string, variable: string): string {
  return `
    ${alias}: liveFixturePlayers(ref: $ref, fixtureId: $${variable}) {
      ...LiveFixturePlayersBatchFields
    }
  `;
}

export function buildLiveFixturePlayersQuery(count: number): string {
  const definitions = Array.from(
    { length: count },
    (_, index) => `$fixture${index}: Int!`,
  ).join(", ");
  const selections = Array.from({ length: count }, (_, index) =>
    liveFixturePlayersSelection(`fixture${index}`, `fixture${index}`),
  ).join("\n");
  return `query LiveFixturePlayersBatch($ref: LivePublicationRefInput!, ${definitions}) { ${selections} } ${LIVE_FIXTURE_PLAYERS_FRAGMENT}`;
}

function mapLiveFixturePlayer(
  row: GraphQLLivePerformance,
): LivePlayerRow | null {
  const player = row.player;
  if (!player || !player.team) return null;
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

async function fetchLiveFixturePlayers(
  ref: { season: string; eventId: number; scoreCoreRevision: string },
  fixtureIds: readonly number[],
  forceRefresh: boolean,
): Promise<Map<number, GraphQLLiveFixturePlayers>> {
  const result = new Map<number, GraphQLLiveFixturePlayers>();
  for (let offset = 0; offset < fixtureIds.length; offset += 5) {
    const batch = fixtureIds.slice(offset, offset + 5);
    const query = buildLiveFixturePlayersQuery(batch.length);
    const variables: Record<string, unknown> = { ref };
    batch.forEach((fixtureId, index) => {
      variables[`fixture${index}`] = fixtureId;
    });
    const data = await graphqlRequest<LiveFixturePlayersBatchResponse>(
      query,
      variables,
      {
        cachePolicy: "live",
        cacheVariant: `${ref.season}:${ref.eventId}:${ref.scoreCoreRevision}:${batch.join(",")}`,
        forceRefresh,
      },
    );
    batch.forEach((fixtureId, index) => {
      const detail = data[`fixture${index}`];
      if (detail) result.set(fixtureId, detail);
    });
  }
  return result;
}

export function mergeLiveFixturePlayers(
  matches: LiveMatch[],
  details: Map<number, GraphQLLiveFixturePlayers>,
  ref: { season: string; eventId: number; scoreCoreRevision: string },
): LiveMatch[] {
  return matches.map((match) => {
    const fixtureId = Number(match.matchId ?? match.id);
    const detail = details.get(fixtureId);
    if (
      !detail ||
      detail.season !== ref.season ||
      detail.eventId !== ref.eventId ||
      detail.scoreCoreRevision !== ref.scoreCoreRevision ||
      detail.fixtureId !== fixtureId
    ) {
      return match;
    }
    const players = detail.players
      .map(mapLiveFixturePlayer)
      .filter((row): row is LivePlayerRow => row !== null);
    return {
      ...match,
      homeTeamDataList: players.filter(
        (player) => player.teamId === match.homeTeamId,
      ),
      awayTeamDataList: players.filter(
        (player) => player.teamId === match.awayTeamId,
      ),
    };
  });
}

export async function getLiveMatchByStatusSnapshot(
  status: string,
  forceRefresh = false,
  trace?: PageRequestTrace | null,
): Promise<LiveSnapshotResult<LiveMatch[]>> {
  const variables = {};
  const data = await graphqlRequest<LiveMatchesResponse>(
    LIVE_MATCHES_QUERY,
    variables,
    {
      cachePolicy: "live",
      forceRefresh,
      trace,
    },
  );
  const result = data.liveMatchdayDesk;

  const mapped = result.matches.map(mapGraphQLMatch);
  const ref = result.scoreCoreRevision
    ? {
        season: result.season,
        eventId: result.eventId,
        scoreCoreRevision: result.scoreCoreRevision,
      }
    : null;
  const currentMatches = mapped.filter(
    (match) =>
      result.matches.some((item) => item.fixtureId === Number(match.matchId)) &&
      match.playStatus !== "not_started",
  );
  let enriched = mapped;
  if (currentMatches.length > 0 && ref) {
    try {
      const details = await fetchLiveFixturePlayers(
        ref,
        currentMatches.map((match) => Number(match.matchId)),
        forceRefresh,
      );
      enriched = mergeLiveFixturePlayers(mapped, details, ref);
    } catch (error) {
      if (!hasGraphQLErrorCode(error, "LIVE_SCORE_REVISION_GONE")) {
        // Player enrichment is optional. Keep the authoritative score/status
        // desk when a transient detail request fails instead of turning a
        // usable live snapshot into a page-level error.
        enriched = mapped;
      } else {
        try {
          const refreshed = await graphqlRequest<LiveMatchesResponse>(
            LIVE_MATCHES_QUERY,
            variables,
            {
              cachePolicy: "live",
              forceRefresh: true,
              trace,
            },
          );
          const refreshedResult = refreshed.liveMatchdayDesk;
          const refreshedMapped = refreshedResult.matches.map(mapGraphQLMatch);
          const refreshedRef = refreshedResult.scoreCoreRevision
            ? {
                season: refreshedResult.season,
                eventId: refreshedResult.eventId,
                scoreCoreRevision: refreshedResult.scoreCoreRevision,
              }
            : null;
          const refreshedCurrent = refreshedMapped.filter(
            (match) =>
              refreshedResult.matches.some(
                (item) => item.fixtureId === Number(match.matchId),
              ) && match.playStatus !== "not_started",
          );
          let refreshedEnriched = refreshedMapped;
          if (refreshedCurrent.length > 0 && refreshedRef) {
            try {
              const details = await fetchLiveFixturePlayers(
                refreshedRef,
                refreshedCurrent.map((match) => Number(match.matchId)),
                true,
              );
              refreshedEnriched = mergeLiveFixturePlayers(
                refreshedMapped,
                details,
                refreshedRef,
              );
            } catch {
              // The refreshed score/status desk is authoritative even when its
              // optional player-detail retry is unavailable.
              refreshedEnriched = refreshedMapped;
            }
          }
          enriched = refreshedEnriched;
          return {
            data: filterLiveMatchesByStatus(enriched, status),
            snapshot: snapshotFromLiveDesk(refreshedResult),
            servedStoredAt: getServedCacheStoredAt(
              LIVE_MATCHES_QUERY,
              variables,
            ),
          };
        } catch {
          // Revision recovery exists for optional player details. If the
          // authoritative desk itself cannot be refreshed, retain the
          // already valid score/status snapshot instead of failing the page.
          enriched = mapped;
        }
      }
    }
  }
  const matches = filterLiveMatchesByStatus(enriched, status);
  return {
    data: matches,
    snapshot: snapshotFromLiveDesk(data.liveMatchdayDesk),
    servedStoredAt: getServedCacheStoredAt(LIVE_MATCHES_QUERY, variables),
  };
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
