import {
  getServedCacheStoredAt,
  graphqlRequest,
  hasGraphQLErrorCode,
} from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";
import type {
  LiveEntryResult,
  LiveMatch,
  LivePlayerRow,
  LiveSnapshotResult,
  LiveSnapshotStatus,
  LiveTournamentRow,
  LiveTournamentRowsResult,
} from "../models/live";
import {
  filterTournamentLiveRows,
  mapTournamentLiveRows,
  combinedTournamentTraceableScoreStates,
  mergeUnavailableTournamentEntryIds,
  type TournamentLiveGraphQLRow,
} from "./live-tournament";
import {
  officialManagerEventPoints,
  officialManagerNetPoints,
  officialManagerTotalPoints,
  managerScoreNextRefreshAt,
  traceableOfficialManagerScore,
} from "./live-manager-score";

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
      liveRevision
      state
      windowState
      dataAvailability
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
    liveRevision: string | null;
    state: LiveSnapshotStatus["state"];
    windowState: LiveSnapshotStatus["windowState"];
    dataAvailability: LiveSnapshotStatus["dataAvailability"];
    publishedAt: string | null;
    sourceCheckedAt: string | null;
    nextRefreshAt: string | null;
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
    eventId: anchorEventId,
    revision: context.liveRevision,
    state: context.state,
    publishedAt: context.publishedAt,
    checkedAt: context.sourceCheckedAt ?? context.publishedAt,
    windowState: context.windowState,
    dataAvailability: context.dataAvailability,
    nextRefreshAt: context.nextRefreshAt,
    season: context.season,
  };
}

export const CALC_LIVE_POINTS_BY_ENTRY = `
  query CalcLivePointsByEntry($eventId: Int!, $entryId: Int!) {
    calcLivePointsByEntry(eventId: $eventId, entryId: $entryId) {
      availability
      snapshot {
        eventId
        revision
        state
        publishedAt
        checkedAt
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
        eventRank
        overallRank
        leagueRank
        transferCost
        source
        state
        eventPointSemantics
        effectiveLineup {
          elementId
          position
          effectiveMultiplier
          pickActive
          autoSub
          isCaptain
          isViceCaptain
        }
        revision
        checkedAt
        upstreamUpdatedAt
        staleAt
        nextRefreshAt
        reconciliation
        reasonCodes
      }
      livePoints
      liveNetPoints
      liveTotalPoints
      transferCost
      captainName
      chip
      played
      toPlay
      pickList {
        element
        webName
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
  webName: string;
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
    availability: "READY" | "NO_PICKS";
    snapshot: LiveSnapshotStatus | null;
    entry: number;
    event: number;
    entryName?: string;
    playerName?: string;
    score?: LiveEntryResult["score"];
    livePoints: number;
    liveNetPoints: number;
    liveTotalPoints: number;
    transferCost: number;
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
  const score = traceableOfficialManagerScore(result.score);
  return {
    data: {
      availability: result.availability,
      entry: result.entry,
      event: result.event,
      entryName: result.entryName,
      playerName: result.playerName,
      score,
      livePoints: officialManagerEventPoints(score),
      liveNetPoints: officialManagerNetPoints(score),
      netPointsKnown: officialManagerNetPoints(score) !== undefined,
      liveTotalPoints: officialManagerTotalPoints(score),
      transferCost: score?.transferCost,
      scoreNextRefreshAt: managerScoreNextRefreshAt(result.score),
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
      revision
      liveRevision
      state
      windowState
      dataAvailability
      publishedAt
      sourceCheckedAt
      nextRefreshAt
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
      }
      nextFixtures {
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
      }
    }
  }
`;

export interface GraphQLMatchData {
  fixtureId: number;
  eventId: number;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamShortName: string | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamShortName: string | null;
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
    revision: string;
    liveRevision: string | null;
    state: LiveSnapshotStatus["state"];
    windowState: LiveSnapshotStatus["windowState"];
    dataAvailability: LiveSnapshotStatus["dataAvailability"];
    publishedAt: string;
    sourceCheckedAt: string;
    nextRefreshAt: string | null;
    matches: GraphQLMatchData[];
    nextFixtures: GraphQLMatchData[];
  };
}

function snapshotFromLiveDesk(
  result: LiveMatchesResponse["liveMatchdayDesk"],
): LiveSnapshotStatus {
  return {
    eventId: result.eventId,
    revision: result.liveRevision,
    state: result.windowState ?? result.state,
    publishedAt: result.liveRevision ? result.publishedAt : null,
    checkedAt: result.liveRevision
      ? (result.sourceCheckedAt ?? result.publishedAt)
      : null,
    windowState: result.windowState,
    dataAvailability: result.dataAvailability,
    nextRefreshAt: result.nextRefreshAt,
    season: result.season,
  };
}

export function mapGraphQLMatch(match: GraphQLMatchData): LiveMatch {
  return {
    matchId: match.fixtureId,
    homeTeamId: match.homeTeamId,
    homeTeamName: match.homeTeamName,
    homeTeamShortName: match.homeTeamShortName ?? undefined,
    homeScore: match.homeScore ?? undefined,
    awayTeamName: match.awayTeamName,
    awayTeamShortName: match.awayTeamShortName ?? undefined,
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
  revision: string;
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
    season eventId revision fixtureId
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
  return `query LiveFixturePlayersBatch($ref: LiveRevisionRefInput!, ${definitions}) { ${selections} } ${LIVE_FIXTURE_PLAYERS_FRAGMENT}`;
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

async function fetchLiveFixturePlayers(
  ref: { season: string; eventId: number; revision: string },
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
        cacheVariant: `${ref.season}:${ref.eventId}:${ref.revision}:${batch.join(",")}`,
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
  ref: { season: string; eventId: number; revision: string },
): LiveMatch[] {
  return matches.map((match) => {
    const fixtureId = Number(match.matchId ?? match.id);
    const detail = details.get(fixtureId);
    if (
      !detail ||
      detail.season !== ref.season ||
      detail.eventId !== ref.eventId ||
      detail.revision !== ref.revision ||
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

  const mapped = [...result.matches, ...result.nextFixtures].map(
    mapGraphQLMatch,
  );
  const ref = result.liveRevision
    ? {
        season: result.season,
        eventId: result.eventId,
        revision: result.liveRevision,
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
      if (!hasGraphQLErrorCode(error, "LIVE_REVISION_GONE")) {
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
          const refreshedMapped = [
            ...refreshedResult.matches,
            ...refreshedResult.nextFixtures,
          ].map(mapGraphQLMatch);
          const refreshedRef = refreshedResult.liveRevision
            ? {
                season: refreshedResult.season,
                eventId: refreshedResult.eventId,
                revision: refreshedResult.liveRevision,
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

export const TOURNAMENT_LIVE_POINTS = `
  query GetEntryLiveCompetitionsDesk($entryId: Int!, $selectedTournamentId: Int, $ref: LiveRevisionRefInput) {
    entryLiveCompetitionsDesk(entryId: $entryId, selectedTournamentId: $selectedTournamentId, ref: $ref) {
      eventId
      revision
      windowState
      dataAvailability
      nextRefreshAt
      state
      officialCoverage
      unavailableEntryIds
      partial
      failedEntryIds
      totalEntries
      board {
        entry
        entryName
        playerName
        rank
        overallRank
        chip
        provisional
        score {
          eventPoints
          netEventPoints
          totalPoints
          totalScope
          eventRank
          overallRank
          leagueRank
          transferCost
          source
          state
          eventPointSemantics
          revision
          checkedAt
          upstreamUpdatedAt
          staleAt
          nextRefreshAt
          reconciliation
          reasonCodes
        }
        livePoints
        transferCost
        liveNetPoints
        liveTotalPoints
        played
        toPlay
        captainName
        pickList {
          element
          webName
          teamShortName
          teamName
          elementTypeName
          position
          isCaptain
          isViceCaptain
          multiplier
          pickActive
          autoSub
          totalPoints
        }
      }
    }
  }
`;

interface TournamentLivePointsResponse {
  entryLiveCompetitionsDesk: {
    eventId: number;
    revision: string | null;
    state: LiveSnapshotStatus["state"];
    windowState: LiveSnapshotStatus["windowState"];
    dataAvailability: LiveSnapshotStatus["dataAvailability"];
    nextRefreshAt: string | null;
    board: TournamentLiveGraphQLRow[];
    officialCoverage: number;
    unavailableEntryIds: number[];
    partial: boolean;
    failedEntryIds: number[];
    totalEntries: number;
  };
}

function numericId(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("页面参数无效，请返回后重试");
  }
  return parsed;
}

export async function getLivePointsByTournamentSnapshot(
  tournamentId: number | string,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
  entryId = 0,
): Promise<LiveSnapshotResult<LiveTournamentRow[]>> {
  const principalEntryId = numericId(entryId);
  const selectedTournamentId = numericId(tournamentId);
  const requestVariables: {
    entryId: number;
    selectedTournamentId: number;
    ref: null;
  } = { entryId: principalEntryId, selectedTournamentId, ref: null };
  let data: TournamentLivePointsResponse;
  try {
    data = await graphqlRequest<TournamentLivePointsResponse>(
      TOURNAMENT_LIVE_POINTS,
      requestVariables,
      {
        cachePolicy: "live",
        forceRefresh,
        trace,
      },
    );
  } catch (error) {
    if (!hasGraphQLErrorCode(error, "LIVE_REVISION_GONE")) throw error;
    data = await graphqlRequest<TournamentLivePointsResponse>(
      TOURNAMENT_LIVE_POINTS,
      { entryId: principalEntryId, selectedTournamentId, ref: null },
      { cachePolicy: "live", forceRefresh: true, trace },
    );
  }
  if (data.entryLiveCompetitionsDesk.eventId !== event) {
    throw new Error("该轮实时快照返回不匹配，请稍后重试");
  }
  const servedStoredAt = getServedCacheStoredAt(
    TOURNAMENT_LIVE_POINTS,
    requestVariables,
  );
  const unavailableEntryIds = mergeUnavailableTournamentEntryIds(
    data.entryLiveCompetitionsDesk.failedEntryIds,
    data.entryLiveCompetitionsDesk.unavailableEntryIds,
  );
  const mappedRows = mapTournamentLiveRows(
    data.entryLiveCompetitionsDesk.board,
  );
  return {
    data: mappedRows,
    snapshot: data.entryLiveCompetitionsDesk.revision
      ? {
          eventId: data.entryLiveCompetitionsDesk.eventId,
          revision: data.entryLiveCompetitionsDesk.revision,
          state:
            data.entryLiveCompetitionsDesk.windowState ??
            data.entryLiveCompetitionsDesk.state,
          publishedAt: null,
          checkedAt: null,
          windowState: data.entryLiveCompetitionsDesk.windowState,
          dataAvailability: data.entryLiveCompetitionsDesk.dataAvailability,
          nextRefreshAt: data.entryLiveCompetitionsDesk.nextRefreshAt,
        }
      : null,
    servedStoredAt,
    failedEntryIds: unavailableEntryIds,
    unavailableEntryIds,
    officialCoverage: data.entryLiveCompetitionsDesk.officialCoverage,
    traceableEntries: mappedRows.filter(
      (row) => officialManagerEventPoints(row.score) !== undefined,
    ).length,
    traceableScoreStates: combinedTournamentTraceableScoreStates(
      undefined,
      mappedRows,
    ),
    totalEntries: data.entryLiveCompetitionsDesk.totalEntries,
    partialError: data.entryLiveCompetitionsDesk.partial
      ? `部分结果不可用：${Math.max(1, unavailableEntryIds.length)}/${data.entryLiveCompetitionsDesk.totalEntries} 支参赛球队计算失败`
      : undefined,
  };
}

export async function getLivePointsByTournament(
  tournamentId: number | string,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
  entryId = 0,
): Promise<LiveTournamentRowsResult> {
  const result = await getLivePointsByTournamentSnapshot(
    tournamentId,
    event,
    forceRefresh,
    trace,
    entryId,
  );
  return { rows: result.data, servedStoredAt: result.servedStoredAt };
}

export async function searchLivePointsByTournament(
  tournamentId: number | string,
  event: number,
  keyword: string,
  forceRefresh = false,
  trace?: PageRequestTrace,
  entryId = 0,
): Promise<LiveTournamentRowsResult> {
  const { rows, servedStoredAt } = await getLivePointsByTournament(
    tournamentId,
    event,
    forceRefresh,
    trace,
    entryId,
  );
  return { rows: filterTournamentLiveRows(rows, keyword), servedStoredAt };
}

export async function searchLivePointsByTournamentSnapshot(
  tournamentId: number | string,
  event: number,
  keyword: string,
  forceRefresh = false,
  trace?: PageRequestTrace,
  entryId = 0,
): Promise<LiveSnapshotResult<LiveTournamentRow[]>> {
  const result = await getLivePointsByTournamentSnapshot(
    tournamentId,
    event,
    forceRefresh,
    trace,
    entryId,
  );
  return {
    data: filterTournamentLiveRows(result.data, keyword),
    snapshot: result.snapshot,
    servedStoredAt: result.servedStoredAt,
    failedEntryIds: result.failedEntryIds,
    unavailableEntryIds: result.unavailableEntryIds,
    officialCoverage: result.officialCoverage,
    traceableEntries: result.traceableEntries,
    traceableScoreStates: result.traceableScoreStates,
    totalEntries: result.totalEntries,
    partialError: result.partialError,
  };
}
