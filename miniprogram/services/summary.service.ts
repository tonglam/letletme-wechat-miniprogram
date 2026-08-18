import { graphqlRead, graphqlRequest } from "./graphql.service";
import type {
  GraphQLReadMeta,
  GraphQLReadResult,
  GraphQLErrorInfo,
  PageRequestTrace
} from "./graphql.service";
import type { GameweekOverallSummary } from "../models/summary";
import { getAppContextSnapshot } from "./app-context.service";

// Documents here are not shared with entry.service: field selections differ
// (transfer history also uses live:true). Merging would change query hashes
// and therefore cache keys.

// Keep the summary panels as separate documents. The production GraphQL
// endpoint enforces both a weighted complexity budget and a 200-node AST
// limit; the old all-in-one document exceeded the latter before execution.
const SUMMARY_PLAYER_FIELDS = `
  player { id webName team { name shortName } position }
  totalPoints
  minutes
  goalsScored
  assists
  cleanSheets
  saves
  bonus
  bps
  yellowCards
  redCards
  ownGoals
  penaltiesSaved
  penaltiesMissed
`;

export const EVENT_DREAM_TEAM_QUERY = `
  query EventDreamTeam($eventId: Int!) {
    eventLive(eventId: $eventId) {
      dreamTeam { ${SUMMARY_PLAYER_FIELDS} }
    }
  }
`;

export const EVENT_ELITE_ELEMENTS_QUERY = `
  query EventEliteElements($eventId: Int!, $limit: Int!) {
    eventLive(eventId: $eventId) {
      topPerformers(limit: $limit) { ${SUMMARY_PLAYER_FIELDS} }
    }
  }
`;

export const EVENT_OVERALL_TRANSFERS_QUERY = `
  query EventOverallTransfers($eventId: Int!, $limit: Int!) {
    topTransfersIn(eventId: $eventId, limit: $limit) {
      transfersInEvent
      player { id webName team { name shortName } position }
    }
    topTransfersOut(eventId: $eventId, limit: $limit) {
      transfersOutEvent
      player { id webName team { name shortName } position }
    }
  }
`;

const HOME_EVENT_OVERALL_RESULT = `
  query EventOverallResult {
    eventOverallResult {
      event
      averageScore
      highestScore
      highestScoringEntry
      transfersMade
      mostViceCaptainedPlayer { id webName }
      mostTransferInPlayer { id webName }
      mostSelectedPlayer { id webName }
      mostCaptainedPlayer { id webName }
      topElementInfo {
        element
        points
        teamShortName
        player { id webName team { name shortName } }
      }
      chipPlays { chipName numberPlayed }
    }
  }
`;

const ENTRY_EVENT_RESULT = `
  query EntryEventResult($entryId: Int!, $eventId: Int!) {
    entryEventResult(entryId: $entryId, eventId: $eventId) {
      eventId
      eventPoints
      overallPoints
      overallRank
      eventTransfers
      eventTransfersCost
      eventNetPoints
      eventBenchPoints
      eventChip
      eventCaptainPoints
      eventPlayedCaptain {
        webName
      }
      eventPicks {
        webName
        teamShortName
        teamName
        elementTypeName
        isCaptain
        isViceCaptain
        multiplier
        totalPoints
        minutes
        position
        goalsScored
        assists
        cleanSheets
        saves
        yellowCards
        redCards
        bonus
        bps
        againstShortName
        wasHome
        isPlayed
      }
      teamValue
      bank
      entry {
        id
        entryName
        playerName
        totalTransfers
        region
      }
    }
  }
`;

const ENTRY_HISTORY = `
  query EntryHistory($entryId: Int!) {
    entryHistory(entryId: $entryId) {
      results {
        eventId
        eventPoints
        eventRank
        overallPoints
        overallRank
        eventTransfers
        eventTransfersCost
        eventNetPoints
        eventBenchPoints
        eventChip
        eventCaptainPoints
        eventPlayedCaptain {
          webName
          team { shortName }
        }
        teamValue
        bank
      }
      history {
        season
        totalPoints
        overallRank
      }
    }
  }
`;

const ENTRY_TRANSFER_HISTORY = `
  query EntryTransferHistory($entryId: Int!) {
    entryTransferHistory(entryId: $entryId, live: true) {
      eventId
      eventTransfers
      eventTransfersCost
      transfers {
        event
        elementInWebName
        elementInTypeName
        elementInTeamShortName
        elementInCost
        elementInPoints
        elementInPlayed
        elementOutWebName
        elementOutTypeName
        elementOutTeamShortName
        elementOutCost
        elementOutPoints
        elementOutPlayed
        time
      }
    }
  }
`;

interface EventOverallResultResponse {
  eventOverallResult: GameweekOverallSummary | GameweekOverallSummary[] | null;
}

interface GraphQLEventPlayer {
  player: {
    id: number;
    webName: string;
    team: { shortName: string; name: string };
    position: string;
  };
  totalPoints?: number;
  transfersInEvent?: number;
  transfersOutEvent?: number;
  minutes?: number;
  goalsScored?: number;
  assists?: number;
  cleanSheets?: number;
  saves?: number;
  bonus?: number;
  bps?: number;
  yellowCards?: number;
  redCards?: number;
  ownGoals?: number;
  penaltiesSaved?: number;
  penaltiesMissed?: number;
}

interface EventDreamTeamResponse {
  eventLive: {
    dreamTeam: GraphQLEventPlayer[];
  } | null;
}

interface EventEliteElementsResponse {
  eventLive: {
    topPerformers: GraphQLEventPlayer[];
  } | null;
}

interface EventOverallTransfersResponse {
  topTransfersIn: GraphQLEventPlayer[];
  topTransfersOut: GraphQLEventPlayer[];
}

interface SummarySegment<T> {
  result?: GraphQLReadResult<T>;
  error?: unknown;
}

export interface MiniGameweekSummaryResult {
  summary?: GameweekOverallSummary;
  dreamTeam: unknown[];
  elite: unknown[];
  transfers: {
    transfers_in: unknown[];
    transfers_out: unknown[];
  };
  errors: {
    summary: string;
    dreamTeam: string;
    elite: string;
    transfers: string;
  };
  meta: GraphQLReadMeta;
}

export interface EntryEventPick {
  webName: string;
  teamShortName: string;
  teamName: string;
  elementTypeName: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  totalPoints: number;
  minutes: number;
  position: number;
  goalsScored?: number;
  assists?: number;
  cleanSheets?: number;
  saves?: number;
  yellowCards?: number;
  redCards?: number;
  bonus?: number;
  bps?: number;
  againstShortName?: string;
  wasHome?: boolean;
  isPlayed?: boolean;
}

export interface EntryEventResult {
  eventId: number;
  eventPoints: number;
  overallPoints: number;
  overallRank: number;
  eventTransfers: number;
  eventTransfersCost: number;
  eventNetPoints: number;
  eventBenchPoints: number;
  eventChip: string;
  eventCaptainPoints: number;
  eventPlayedCaptain: {
    webName: string;
  } | null;
  eventPicks: EntryEventPick[];
  teamValue: number | null;
  bank: number | null;
  entry: {
    id: number;
    entryName: string;
    playerName: string | null;
    totalTransfers: number | null;
    region: string | null;
  };
}

interface EntryEventResultResponse {
  entryEventResult: EntryEventResult | null;
}

export interface EntryHistoryItem {
  eventId: number;
  eventChip?: string | null;
  eventPoints: number;
  eventRank: number | null;
  overallPoints: number;
  overallRank: number;
  eventTransfers: number;
  eventTransfersCost: number;
  eventNetPoints: number;
  eventBenchPoints?: number;
  eventCaptainPoints?: number;
  eventPlayedCaptain?: {
    webName?: string;
    team?: { shortName?: string } | null;
  } | null;
  teamValue: number | null;
  bank: number | null;
}

export interface EntrySeasonHistoryItem {
  season: string;
  totalPoints: number;
  overallRank: number;
}

export interface EntryHistoryPayload {
  results: EntryHistoryItem[];
  history: EntrySeasonHistoryItem[];
}

interface EntryHistoryResponse {
  entryHistory: EntryHistoryPayload | null;
}

export interface EntryTransferMove {
  event: number;
  elementInWebName: string;
  elementInTypeName?: string | null;
  elementInTeamShortName?: string | null;
  elementInCost?: number | null;
  elementInPoints?: number;
  elementInPlayed?: boolean;
  elementOutWebName: string;
  elementOutTypeName?: string | null;
  elementOutTeamShortName?: string | null;
  elementOutCost?: number | null;
  elementOutPoints?: number;
  elementOutPlayed?: boolean;
  time?: string | null;
}

export interface EntryGameweekTransfers {
  eventId: number;
  eventTransfers: number;
  eventTransfersCost: number;
  transfers: EntryTransferMove[];
}

interface EntryTransferHistoryResponse {
  entryTransferHistory: EntryGameweekTransfers[];
}

function positionType(position: string): number {
  const map: Record<string, number> = {
    GOALKEEPER: 1,
    DEFENDER: 2,
    MIDFIELDER: 3,
    FORWARD: 4
  };
  return map[position] || 0;
}

function mapEventPlayer(row: GraphQLEventPlayer): Record<string, unknown> {
  return {
    element: row.player.id,
    id: row.player.id,
    webName: row.player.webName,
    teamShortName: row.player.team.shortName,
    teamName: row.player.team.name,
    elementType: positionType(row.player.position),
    position: row.player.position,
    points: row.totalPoints,
    totalPoints: row.totalPoints,
    transfersInEvent: row.transfersInEvent,
    transfersOutEvent: row.transfersOutEvent,
    minutes: row.minutes,
    goalsScored: row.goalsScored,
    assists: row.assists,
    cleanSheets: row.cleanSheets,
    saves: row.saves,
    bonus: row.bonus,
    bps: row.bps,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
    ownGoals: row.ownGoals,
    penaltiesSaved: row.penaltiesSaved,
    penaltiesMissed: row.penaltiesMissed
  };
}

function currentSeasonCacheVariant(): string {
  const season = getAppContextSnapshot()?.season
    || String(getApp<IAppOption>().globalData.season || "");
  if (!season) throw new Error("赛季信息暂时不可用，请稍后重试");
  return `season:${season}`;
}

export async function getEntryTeamStatsEventResult(entry: number, event: number, forceRefresh = false, trace?: PageRequestTrace): Promise<EntryEventResult | undefined> {
  const data = await graphqlRequest<EntryEventResultResponse>(ENTRY_EVENT_RESULT, { entryId: entry, eventId: event }, { cachePolicy: "reporting", cacheVariant: currentSeasonCacheVariant(), forceRefresh, trace });
  return data.entryEventResult || undefined;
}

export async function getEntryTeamStatsHistory(entry: number, forceRefresh = false, trace?: PageRequestTrace): Promise<EntryHistoryPayload> {
  const data = await graphqlRequest<EntryHistoryResponse>(ENTRY_HISTORY, { entryId: entry }, { cachePolicy: "reporting", cacheVariant: currentSeasonCacheVariant(), forceRefresh, trace });
  const payload = data.entryHistory;
  return {
    results: payload?.results || [],
    history: payload?.history || []
  };
}

export async function getEntryTeamStatsTransfers(entry: number, forceRefresh = false, trace?: PageRequestTrace): Promise<EntryGameweekTransfers[]> {
  const data = await graphqlRequest<EntryTransferHistoryResponse>(ENTRY_TRANSFER_HISTORY, { entryId: entry }, { cachePolicy: "reporting", cacheVariant: currentSeasonCacheVariant(), forceRefresh, trace });
  return data.entryTransferHistory || [];
}

function hasGraphQLError(
  errors: GraphQLErrorInfo[],
  rootField: string,
  childField?: string
): boolean {
  return errors.some((error) => {
    if (String(error.path?.[0] || "") !== rootField) return false;
    return childField ? String(error.path?.[1] || "") === childField : true;
  });
}

async function readSummarySegment<T>(
  request: Promise<GraphQLReadResult<T>>
): Promise<SummarySegment<T>> {
  try {
    return { result: await request };
  } catch (error) {
    return { error };
  }
}

function segmentErrors<T>(segment: SummarySegment<T>): GraphQLErrorInfo[] {
  if (segment.result) return segment.result.errors;
  return [{
    message: segment.error instanceof Error ? segment.error.message : "数据加载失败"
  }];
}

function isExpectedLiveUnavailable(errors: GraphQLErrorInfo[]): boolean {
  return errors.some((error) => (
    error.extensions?.code === "LIVE_PUBLICATION_UNAVAILABLE"
      || String(error.message || "").includes("LIVE_PUBLICATION_UNAVAILABLE")
  ));
}

function hasSummaryData(summary?: GameweekOverallSummary): summary is GameweekOverallSummary {
  if (!summary) return false;
  return Boolean(
    Number(summary.averageScore) > 0
      || Number(summary.highestScore) > 0
      || Number(summary.highestScoringEntry) > 0
      || Number(summary.transfersMade) > 0
      || summary.mostSelectedPlayer
      || summary.mostCaptainedPlayer
      || summary.mostViceCaptainedPlayer
      || summary.mostTransferInPlayer
      || summary.topElementInfo?.player
      || (summary.chipPlays?.length || 0) > 0
  );
}

function attachTeamNames(summary: GameweekOverallSummary): GameweekOverallSummary {
  const record = summary as unknown as Record<string, unknown>;
  [
    "mostSelectedPlayer",
    "mostCaptainedPlayer",
    "mostViceCaptainedPlayer",
    "mostTransferInPlayer"
  ].forEach((key) => {
    const player = record[key] as {
      team?: { shortName?: string };
      teamShortName?: string;
    } | undefined;
    if (player?.team?.shortName && !player.teamShortName) {
      player.teamShortName = player.team.shortName;
    }
  });
  return summary;
}

export async function getMiniGameweekSummary(
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<MiniGameweekSummaryResult> {
  const readOptions = {
    authMode: "public" as const,
    cachePolicy: "historical" as const,
    cacheVariant: `event:${event}`,
    forceRefresh,
    trace
  };
  const [overallSegment, dreamTeamSegment, eliteSegment, transfersSegment] = await Promise.all([
    readSummarySegment(graphqlRead<EventOverallResultResponse>(
      HOME_EVENT_OVERALL_RESULT,
      {},
      readOptions
    )),
    readSummarySegment(graphqlRead<EventDreamTeamResponse>(
      EVENT_DREAM_TEAM_QUERY,
      { eventId: event },
      readOptions
    )),
    readSummarySegment(graphqlRead<EventEliteElementsResponse>(
      EVENT_ELITE_ELEMENTS_QUERY,
      { eventId: event, limit: 20 },
      readOptions
    )),
    readSummarySegment(graphqlRead<EventOverallTransfersResponse>(
      EVENT_OVERALL_TRANSFERS_QUERY,
      { eventId: event, limit: 10 },
      readOptions
    ))
  ]);

  const firstMeta = overallSegment.result?.meta
    || dreamTeamSegment.result?.meta
    || eliteSegment.result?.meta
    || transfersSegment.result?.meta;
  if (!firstMeta) {
    const firstError = [overallSegment, dreamTeamSegment, eliteSegment, transfersSegment]
      .find((segment) => segment.error)?.error;
    throw firstError instanceof Error ? firstError : new Error(`GW${event} 总结加载失败`);
  }

  const overallErrors = segmentErrors(overallSegment);
  const dreamTeamErrors = segmentErrors(dreamTeamSegment);
  const eliteErrors = segmentErrors(eliteSegment);
  const transfersErrors = segmentErrors(transfersSegment);
  const rawSummary = pickEventOverallResult(overallSegment.result?.data.eventOverallResult || null, event);
  const summary = hasSummaryData(rawSummary) ? attachTeamNames(rawSummary) : undefined;
  const dreamTeamRows = dreamTeamSegment.result?.data.eventLive?.dreamTeam;
  const eliteRows = eliteSegment.result?.data.eventLive?.topPerformers;
  const transferData = transfersSegment.result?.data;
  const dreamTeam = (Array.isArray(dreamTeamRows) ? dreamTeamRows : []).map(mapEventPlayer);
  const elite = (Array.isArray(eliteRows) ? eliteRows : []).map(mapEventPlayer);
  const transfersIn = (Array.isArray(transferData?.topTransfersIn) ? transferData.topTransfersIn : []).map(mapEventPlayer);
  const transfersOut = (Array.isArray(transferData?.topTransfersOut) ? transferData.topTransfersOut : []).map(mapEventPlayer);

  return {
    summary,
    dreamTeam,
    elite,
    transfers: {
      transfers_in: transfersIn,
      transfers_out: transfersOut
    },
    errors: {
      summary: overallSegment.error || hasGraphQLError(overallErrors, "eventOverallResult")
        ? (overallSegment.error instanceof Error
          ? overallSegment.error.message
          : `GW${event} 总结暂时无法加载`)
        : "",
      dreamTeam: !Array.isArray(dreamTeamRows)
        ? (isExpectedLiveUnavailable(dreamTeamErrors) ? "" : "梦之队加载失败")
        : dreamTeamErrors.length > 0 && !isExpectedLiveUnavailable(dreamTeamErrors)
        ? "梦之队加载失败"
        : "",
      elite: !Array.isArray(eliteRows)
        ? (isExpectedLiveUnavailable(eliteErrors) ? "" : "高分球员加载失败")
        : eliteErrors.length > 0 && !isExpectedLiveUnavailable(eliteErrors)
        ? "高分球员加载失败"
        : "",
      transfers: !Array.isArray(transferData?.topTransfersIn)
        || !Array.isArray(transferData?.topTransfersOut)
        || (transfersErrors.length > 0 && !isExpectedLiveUnavailable(transfersErrors))
        ? "转会趋势加载失败"
        : ""
    },
    meta: firstMeta
  };
}

export async function getGameweekOverallSummary(
  event: number,
  forceRefresh = false
): Promise<GameweekOverallSummary> {
  const result = await getMiniGameweekSummary(event, forceRefresh);
  if (!result.summary) {
    throw new Error(result.errors.summary || `GW${event} 暂时还没有总结数据`);
  }
  return result.summary;
}

export async function getGameweekStatsForHome(
  event: number,
  forceRefresh = false
): Promise<GameweekOverallSummary | undefined> {
  const data = await graphqlRequest<EventOverallResultResponse>(
    HOME_EVENT_OVERALL_RESULT,
    {},
    {
      authMode: "public",
      cachePolicy: "reporting",
      forceRefresh
    }
  );
  return pickEventOverallResult(data.eventOverallResult, event);
}

export async function getEventDreamTeam(event: number): Promise<unknown[]> {
  return (await getMiniGameweekSummary(event)).dreamTeam;
}

export async function getEventEliteElements(event: number): Promise<unknown[]> {
  return (await getMiniGameweekSummary(event)).elite;
}

export async function getEventOverallTransfers(event: number): Promise<unknown> {
  return (await getMiniGameweekSummary(event)).transfers;
}

export function refreshEventOverallSummary(event: number): Promise<unknown> {
  return getMiniGameweekSummary(event, true);
}

function pickEventOverallResult(
  results: GameweekOverallSummary | GameweekOverallSummary[] | null,
  event: number
): GameweekOverallSummary | undefined {
  const list = Array.isArray(results) ? results.filter(Boolean) : results ? [results] : [];
  const exact = list.find((result) => result.event === event);
  if (exact) {
    return exact;
  }

  return list
    .filter((result) => typeof result.event === "number" && Number(result.event) <= event)
    .sort((a, b) => Number(b.event || 0) - Number(a.event || 0))[0];
}
