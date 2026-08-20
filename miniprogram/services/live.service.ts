import { getServedCacheStoredAt, graphqlRequest, hasGraphQLErrorCode } from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";
import type {
  LiveEntryResult,
  LiveMatch,
  LivePlayerRow,
  LiveSnapshotResult,
  LiveSnapshotStatus,
  LiveTournamentRow,
  LiveTournamentRowsResult
} from "../models/live";
import { filterTournamentLiveRows, mapTournamentLiveRows, type TournamentLiveGraphQLRow } from "./live-tournament";

// Live payloads are expensive enough to deduplicate rapid page revisits, but
// short-lived enough to stay process-local (graphql.service does not persist
// sub-minute entries). Snapshot polling bypasses this cache when a new backend
// revision is observed.

export const LIVE_SNAPSHOT_QUERY = `
  query GetLiveContext {
    liveContext {
      season
      currentEventId
      liveRevision
      state
      publishedAt
      sourceCheckedAt
    }
  }
`;

interface LiveSnapshotResponse {
  liveContext: {
    season: string;
    currentEventId: number | null;
    liveRevision: string | null;
    state: LiveSnapshotStatus["state"];
    publishedAt: string | null;
    sourceCheckedAt: string | null;
  };
}

export async function getLiveSnapshot(eventId: number): Promise<LiveSnapshotStatus | null> {
  const data = await graphqlRequest<LiveSnapshotResponse>(LIVE_SNAPSHOT_QUERY, {});
  const context = data.liveContext;
  if (!context?.currentEventId || context.currentEventId !== eventId || !context.liveRevision) return null;
  const checkedAt = context.sourceCheckedAt ?? context.publishedAt;
  if (!context.publishedAt || !checkedAt) return null;
  return {
    eventId: context.currentEventId,
    revision: context.liveRevision,
    state: context.state,
    publishedAt: context.publishedAt,
    checkedAt,
    season: context.season
  };
}

const LIVE_SNAPSHOT_BY_EVENT_QUERY = `
  query LiveSnapshotByEvent($eventId: Int!) {
    liveSnapshot(eventId: $eventId) {
      season
      eventId
      revision
      state
      publishedAt
      checkedAt
    }
  }
`;

interface LiveSnapshotByEventResponse {
  liveSnapshot: {
    season: string;
    eventId: number;
    revision: string;
    state: LiveSnapshotStatus["state"];
    publishedAt: string;
    checkedAt: string;
  } | null;
}

export async function getLiveSnapshotByEvent(
  eventId: number,
  forceRefresh = false
): Promise<LiveSnapshotStatus | null> {
  const variables = { eventId };
  const data = await graphqlRequest<LiveSnapshotByEventResponse>(
    LIVE_SNAPSHOT_BY_EVENT_QUERY,
    variables,
    { cachePolicy: "live", forceRefresh }
  );
  const snapshot = data.liveSnapshot;
  if (!snapshot || snapshot.eventId !== eventId) return null;
  return snapshot;
}

const CALC_LIVE_POINTS_BY_ENTRY = `
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
        multiplier
        cleanSheets
        saves
        yellowCards
        redCards
        ownGoals
        penaltiesSaved
        penaltiesMissed
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
  totalPoints: number;
  minutes: number;
  goalsScored: number;
  assists: number;
  bonus: number;
  bps: number;
  playStatus: number;
  pickActive: boolean;
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
}

interface CalcLivePointsByEntryResponse {
  calcLivePointsByEntry: {
    availability: "READY" | "NO_PICKS";
    snapshot: LiveSnapshotStatus | null;
    entry: number;
    event: number;
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
    points: item.totalPoints,
    totalPoints: item.totalPoints,
    minutes: item.minutes,
    goalsScored: item.goalsScored,
    assists: item.assists,
    bonus: item.bonus,
    bps: item.bps,
    playStatus: item.playStatus,
    pickActive: item.pickActive,
    captain: item.isCaptain,
    viceCaptain: item.isViceCaptain,
    multiplier: item.multiplier,
    cleanSheets: item.cleanSheets,
    saves: item.saves,
    yellowCards: item.yellowCards,
    redCards: item.redCards,
    ownGoals: item.ownGoals,
    penaltiesSaved: item.penaltiesSaved,
    penaltiesMissed: item.penaltiesMissed
  }));
}

export async function getLivePointsByEntrySnapshot(
  entry: number,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<LiveSnapshotResult<LiveEntryResult>> {
  const variables = { eventId: event, entryId: entry };
  const data = await graphqlRequest<CalcLivePointsByEntryResponse>(CALC_LIVE_POINTS_BY_ENTRY, variables, {
    cachePolicy: "live",
    forceRefresh,
    trace
  });
  const result = data.calcLivePointsByEntry;
  if (!result) {
    throw new Error("实时分数暂时不可用，请稍后重试");
  }
  const servedStoredAt = getServedCacheStoredAt(CALC_LIVE_POINTS_BY_ENTRY, variables);
  return {
    data: {
      availability: result.availability,
      entry: result.entry,
      event: result.event,
      livePoints: result.livePoints,
      liveNetPoints: result.liveNetPoints,
      liveTotalPoints: result.liveTotalPoints,
      transferCost: result.transferCost,
      captainName: result.captainName,
      chip: result.chip,
      played: result.played,
      toPlay: result.toPlay,
      pickList: mapGraphQLPickList(result.pickList),
      servedStoredAt
    },
    snapshot: result.snapshot,
    servedStoredAt
  };
}

export async function getLivePointsByEntry(entry: number, event: number, forceRefresh = false): Promise<LiveEntryResult> {
  return (await getLivePointsByEntrySnapshot(entry, event, forceRefresh)).data;
}

export const LIVE_MATCHES_QUERY = `
  query LiveMatchdayDesk {
    liveMatchdayDesk {
      season
      eventId
      revision
      state
      publishedAt
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
        started
        finished
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
			started
			finished
		}
    }
  }
`;

interface GraphQLMatchData {
  fixtureId: number;
  eventId: number;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamShortName: string;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamShortName: string;
  homeScore: number | null;
  awayScore: number | null;
  kickoffTime: string | null;
  started: boolean;
  finished: boolean;
}

interface LiveMatchesResponse {
  liveMatchdayDesk: {
    season: string;
    eventId: number;
    revision: string;
    state: LiveSnapshotStatus["state"];
    publishedAt: string;
    matches: GraphQLMatchData[];
		nextFixtures: GraphQLMatchData[];
  };
}

function mapGraphQLMatch(match: GraphQLMatchData): LiveMatch {
  return {
    matchId: match.fixtureId,
    homeTeamId: match.homeTeamId,
    homeTeamName: match.homeTeamName,
    homeTeamShortName: match.homeTeamShortName,
    homeScore: match.homeScore ?? 0,
    awayTeamName: match.awayTeamName,
    awayTeamId: match.awayTeamId,
    awayTeamShortName: match.awayTeamShortName,
    awayScore: match.awayScore ?? 0,
    kickoffTime: match.kickoffTime ?? "",
    playStatus: match.finished ? "finished" : match.started ? "playing" : "not_started",
    homeTeamDataList: [],
    awayTeamDataList: []
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

interface GraphQLLiveFixturePlayers {
  season: string;
  eventId: number;
  revision: string;
  fixtureId: number;
  availability: "READY" | "NOT_STARTED" | "UNAVAILABLE";
  bonusProvisional: boolean;
  players: GraphQLLivePerformance[];
}

type LiveFixturePlayersBatchResponse = Record<string, GraphQLLiveFixturePlayers>;

const POSITION_TYPE: Record<NonNullable<GraphQLLivePerformance["player"]>["position"], number> = {
  GOALKEEPER: 1,
  DEFENDER: 2,
  MIDFIELDER: 3,
  FORWARD: 4
};

function liveFixturePlayersSelection(alias: string, variable: string): string {
  return `
    ${alias}: liveFixturePlayers(ref: $ref, fixtureId: $${variable}) {
      season eventId revision fixtureId availability bonusProvisional
      players {
        player { id webName position team { id name shortName } }
        minutes goalsScored assists cleanSheets goalsConceded ownGoals
        penaltiesSaved penaltiesMissed yellowCards redCards saves bonus bps
        defensiveContribution totalPoints
      }
    }
  `;
}

function buildLiveFixturePlayersQuery(count: number): string {
  const definitions = Array.from({ length: count }, (_, index) => `$fixture${index}: Int!`).join(", ");
  const selections = Array.from({ length: count }, (_, index) =>
    liveFixturePlayersSelection(`fixture${index}`, `fixture${index}`)
  ).join("\n");
  return `query LiveFixturePlayersBatch($ref: LiveRevisionRefInput!, ${definitions}) { ${selections} }`;
}

function mapLiveFixturePlayer(row: GraphQLLivePerformance): LivePlayerRow | null {
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
    defensiveContribution: row.defensiveContribution ?? 0
  };
}

async function fetchLiveFixturePlayers(
  ref: { season: string; eventId: number; revision: string },
  fixtureIds: readonly number[],
  forceRefresh: boolean
): Promise<Map<number, GraphQLLiveFixturePlayers>> {
  const result = new Map<number, GraphQLLiveFixturePlayers>();
  for (let offset = 0; offset < fixtureIds.length; offset += 5) {
    const batch = fixtureIds.slice(offset, offset + 5);
    const query = buildLiveFixturePlayersQuery(batch.length);
    const variables: Record<string, unknown> = { ref };
    batch.forEach((fixtureId, index) => { variables[`fixture${index}`] = fixtureId; });
    const data = await graphqlRequest<LiveFixturePlayersBatchResponse>(query, variables, {
      cachePolicy: "live",
      cacheVariant: `${ref.season}:${ref.eventId}:${ref.revision}:${batch.join(",")}`,
      forceRefresh
    });
    batch.forEach((fixtureId, index) => {
      const detail = data[`fixture${index}`];
      if (detail) result.set(fixtureId, detail);
    });
  }
  return result;
}

function mergeLiveFixturePlayers(
  matches: LiveMatch[],
  details: Map<number, GraphQLLiveFixturePlayers>,
  ref: { season: string; eventId: number; revision: string }
): LiveMatch[] {
  return matches.map((match) => {
    const fixtureId = Number(match.matchId ?? match.id);
    const detail = details.get(fixtureId);
    if (!detail || detail.season !== ref.season || detail.eventId !== ref.eventId || detail.revision !== ref.revision || detail.fixtureId !== fixtureId) {
      return match;
    }
    const players = detail.availability === "READY"
      ? detail.players.map(mapLiveFixturePlayer).filter((row): row is LivePlayerRow => row !== null)
      : [];
    return {
      ...match,
      homeTeamDataList: players.filter((player) => player.teamId === match.homeTeamId),
      awayTeamDataList: players.filter((player) => player.teamId === match.awayTeamId)
    };
  });
}

export async function getLiveMatchByStatusSnapshot(
  status: string,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<LiveSnapshotResult<LiveMatch[]>> {
  const variables = {};
  const data = await graphqlRequest<LiveMatchesResponse>(LIVE_MATCHES_QUERY, variables, {
    cachePolicy: "live",
    forceRefresh,
    trace
  });
  const result = data.liveMatchdayDesk;

  const mapped = [...result.matches, ...result.nextFixtures].map(mapGraphQLMatch);
  const ref = { season: result.season, eventId: result.eventId, revision: result.revision };
  const currentMatches = mapped.filter((match) => result.matches.some((item) => item.fixtureId === Number(match.matchId)) && match.playStatus !== "not_started");
  let enriched = mapped;
  if (currentMatches.length > 0) {
    try {
      const details = await fetchLiveFixturePlayers(
        ref,
        currentMatches.map((match) => Number(match.matchId)),
        forceRefresh
      );
      enriched = mergeLiveFixturePlayers(mapped, details, ref);
    } catch (error) {
      if (!hasGraphQLErrorCode(error, "LIVE_REVISION_GONE")) throw error;
      const refreshed = await graphqlRequest<LiveMatchesResponse>(LIVE_MATCHES_QUERY, variables, {
        cachePolicy: "live",
        forceRefresh: true,
        trace
      });
      const refreshedResult = refreshed.liveMatchdayDesk;
      const refreshedMapped = [...refreshedResult.matches, ...refreshedResult.nextFixtures].map(mapGraphQLMatch);
      const refreshedRef = {
        season: refreshedResult.season,
        eventId: refreshedResult.eventId,
        revision: refreshedResult.revision
      };
      const refreshedCurrent = refreshedMapped.filter((match) =>
        refreshedResult.matches.some((item) => item.fixtureId === Number(match.matchId)) && match.playStatus !== "not_started"
      );
      const details = await fetchLiveFixturePlayers(
        refreshedRef,
        refreshedCurrent.map((match) => Number(match.matchId)),
        true
      );
      enriched = mergeLiveFixturePlayers(refreshedMapped, details, refreshedRef);
      return {
        data: filterLiveMatchesByStatus(enriched, status),
        snapshot: refreshedResult.revision
          ? {
              eventId: refreshedResult.eventId,
              revision: refreshedResult.revision,
              state: refreshedResult.state,
              publishedAt: refreshedResult.publishedAt,
              checkedAt: refreshedResult.publishedAt,
              season: refreshedResult.season
            }
          : null,
        servedStoredAt: getServedCacheStoredAt(LIVE_MATCHES_QUERY, variables)
      };
    }
  }
  const matches = filterLiveMatchesByStatus(enriched, status);
  return {
    data: matches,
    snapshot: data.liveMatchdayDesk.revision
      ? {
          eventId: data.liveMatchdayDesk.eventId,
          revision: data.liveMatchdayDesk.revision,
          state: data.liveMatchdayDesk.state,
          publishedAt: data.liveMatchdayDesk.publishedAt,
          checkedAt: data.liveMatchdayDesk.publishedAt,
          season: data.liveMatchdayDesk.season
        }
      : null,
    servedStoredAt: getServedCacheStoredAt(LIVE_MATCHES_QUERY, variables)
  };
}

function filterLiveMatchesByStatus(matches: LiveMatch[], status: string): LiveMatch[] {
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

export async function getLiveMatchByStatus(status: string, forceRefresh = false): Promise<LiveMatch[]> {
  return (await getLiveMatchByStatusSnapshot(status, forceRefresh)).data;
}

const TOURNAMENT_LIVE_POINTS = `
  query GetEntryLiveCompetitionsDesk($entryId: Int!, $selectedTournamentId: Int, $ref: LiveRevisionRefInput) {
    entryLiveCompetitionsDesk(entryId: $entryId, selectedTournamentId: $selectedTournamentId, ref: $ref) {
      eventId
      revision
      state
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
    board: TournamentLiveGraphQLRow[];
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
  entryId = 0
): Promise<LiveSnapshotResult<LiveTournamentRow[]>> {
  const principalEntryId = numericId(entryId);
  const selectedTournamentId = numericId(tournamentId);
  const snapshot = await getLiveSnapshotByEvent(event, forceRefresh);
  if (!snapshot?.season || snapshot.eventId !== event || !snapshot.revision) {
    throw new Error("该轮实时快照暂不可用，请稍后重试");
  }
  let resolvedSnapshot = snapshot;
  let resolvedRef = { season: snapshot.season, eventId: snapshot.eventId, revision: snapshot.revision };
  const variables = { entryId: principalEntryId, selectedTournamentId, ref: resolvedRef };
  let data: TournamentLivePointsResponse;
  try {
    data = await graphqlRequest<TournamentLivePointsResponse>(TOURNAMENT_LIVE_POINTS, variables, {
      cachePolicy: "live",
      forceRefresh,
      trace
    });
  } catch (error) {
    if (!hasGraphQLErrorCode(error, "LIVE_REVISION_GONE")) throw error;
    const refreshed = await getLiveSnapshotByEvent(event, true);
    if (!refreshed?.season || refreshed.eventId !== event || !refreshed.revision) {
      throw new Error("该轮历史快照已不可用，请重新选择轮次");
    }
    const refreshedRef = {
      season: refreshed.season,
      eventId: refreshed.eventId,
      revision: refreshed.revision
    };
    resolvedRef = refreshedRef;
    resolvedSnapshot = refreshed;
    data = await graphqlRequest<TournamentLivePointsResponse>(
      TOURNAMENT_LIVE_POINTS,
      { entryId: principalEntryId, selectedTournamentId, ref: refreshedRef },
      { cachePolicy: "live", forceRefresh: true, trace }
    );
  }
  if (
    data.entryLiveCompetitionsDesk.eventId !== event ||
    data.entryLiveCompetitionsDesk.revision !== resolvedRef.revision
  ) {
    throw new Error("该轮实时快照返回不匹配，请稍后重试");
  }
  const servedStoredAt = getServedCacheStoredAt(TOURNAMENT_LIVE_POINTS, variables);
  return {
    data: mapTournamentLiveRows(data.entryLiveCompetitionsDesk.board),
    snapshot: data.entryLiveCompetitionsDesk.revision
      ? {
          eventId: data.entryLiveCompetitionsDesk.eventId,
          revision: data.entryLiveCompetitionsDesk.revision,
          state: data.entryLiveCompetitionsDesk.state,
          publishedAt: resolvedSnapshot.publishedAt,
          checkedAt: resolvedSnapshot.checkedAt,
          season: resolvedSnapshot.season
        }
      : null,
    servedStoredAt,
    failedEntryIds: data.entryLiveCompetitionsDesk.failedEntryIds,
    partialError: data.entryLiveCompetitionsDesk.partial
      ? `部分结果不可用：${data.entryLiveCompetitionsDesk.failedEntryIds.length}/${data.entryLiveCompetitionsDesk.totalEntries} 支参赛球队计算失败`
      : undefined
  };
}

export async function getLivePointsByTournament(
  tournamentId: number | string,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace,
  entryId = 0
): Promise<LiveTournamentRowsResult> {
  const result = await getLivePointsByTournamentSnapshot(tournamentId, event, forceRefresh, trace, entryId);
  return { rows: result.data, servedStoredAt: result.servedStoredAt };
}

export async function searchLivePointsByTournament(
  tournamentId: number | string,
  event: number,
  keyword: string,
  forceRefresh = false,
  trace?: PageRequestTrace,
  entryId = 0
): Promise<LiveTournamentRowsResult> {
  const { rows, servedStoredAt } = await getLivePointsByTournament(tournamentId, event, forceRefresh, trace, entryId);
  return { rows: filterTournamentLiveRows(rows, keyword), servedStoredAt };
}

export async function searchLivePointsByTournamentSnapshot(
  tournamentId: number | string,
  event: number,
  keyword: string,
  forceRefresh = false,
  trace?: PageRequestTrace,
  entryId = 0
): Promise<LiveSnapshotResult<LiveTournamentRow[]>> {
  const result = await getLivePointsByTournamentSnapshot(tournamentId, event, forceRefresh, trace, entryId);
  return {
    data: filterTournamentLiveRows(result.data, keyword),
    snapshot: result.snapshot,
    servedStoredAt: result.servedStoredAt,
    failedEntryIds: result.failedEntryIds,
    partialError: result.partialError
  };
}
