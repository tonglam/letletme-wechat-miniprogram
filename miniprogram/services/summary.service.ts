import { graphqlRead, graphqlRequest } from "./graphql.service";
import type { GraphQLReadMeta, GraphQLErrorInfo, PageRequestTrace } from "./graphql.service";
import type { GameweekOverallSummary } from "../models/summary";
import { getAppContextSnapshot } from "./app-context.service";

export const MINI_GAMEWEEK_SUMMARY_QUERY = `
  query MiniGameweekSummary($eventId: Int!, $limit: Int!) {
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
        player { ...MiniSummaryPlayerFields }
      }
      chipPlays { chipName numberPlayed }
    }
    eventLive(eventId: $eventId) {
      dreamTeam {
        player { ...MiniSummaryPlayerFields }
        totalPoints
      }
      topPerformers(limit: 20) {
        player { ...MiniSummaryPlayerFields }
        totalPoints
      }
    }
    topTransfersIn(eventId: $eventId, limit: $limit) {
      transfersInEvent
      player { ...MiniSummaryPlayerFields }
    }
    topTransfersOut(eventId: $eventId, limit: $limit) {
      transfersOutEvent
      player { ...MiniSummaryPlayerFields }
    }
  }

  fragment MiniSummaryPlayerFields on Player {
    id
    webName
    team { name shortName }
    position
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
    entryTransferHistory(entryId: $entryId) {
      eventId
      eventTransfers
      eventTransfersCost
      transfers {
        event
        elementInWebName
        elementInTypeName
        elementInTeamShortName
        elementInCost
        elementOutWebName
        elementOutTypeName
        elementOutTeamShortName
        elementOutCost
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
}

interface MiniGameweekSummaryResponse extends EventOverallResultResponse {
  eventLive: {
    dreamTeam: GraphQLEventPlayer[];
    topPerformers: GraphQLEventPlayer[];
  } | null;
  topTransfersIn: GraphQLEventPlayer[];
  topTransfersOut: GraphQLEventPlayer[];
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
  elementOutWebName: string;
  elementOutTypeName?: string | null;
  elementOutTeamShortName?: string | null;
  elementOutCost?: number | null;
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
    transfersOutEvent: row.transfersOutEvent
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
  forceRefresh = false
): Promise<MiniGameweekSummaryResult> {
  const result = await graphqlRead<MiniGameweekSummaryResponse>(
    MINI_GAMEWEEK_SUMMARY_QUERY,
    { eventId: event, limit: 10 },
    {
      authMode: "public",
      cachePolicy: "historical",
      cacheVariant: `event:${event}`,
      forceRefresh
    }
  );
  const data = result.data;
  const summary = pickEventOverallResult(data.eventOverallResult, event);
  const dreamTeam = (data.eventLive?.dreamTeam || []).map(mapEventPlayer);
  const elite = (data.eventLive?.topPerformers || []).map(mapEventPlayer);
  const transfersIn = (data.topTransfersIn || []).map(mapEventPlayer);
  const transfersOut = (data.topTransfersOut || []).map(mapEventPlayer);

  return {
    summary: summary ? attachTeamNames(summary) : undefined,
    dreamTeam,
    elite,
    transfers: {
      transfers_in: transfersIn,
      transfers_out: transfersOut
    },
    errors: {
      summary: !summary || hasGraphQLError(result.errors, "eventOverallResult")
        ? `GW${event} 暂时还没有总结数据`
        : "",
      dreamTeam: hasGraphQLError(result.errors, "eventLive", "dreamTeam")
        ? "梦之队加载失败"
        : "",
      elite: hasGraphQLError(result.errors, "eventLive", "topPerformers")
        ? "高分球员加载失败"
        : "",
      transfers: hasGraphQLError(result.errors, "topTransfersIn")
        || hasGraphQLError(result.errors, "topTransfersOut")
        ? "转会趋势加载失败"
        : ""
    },
    meta: result.meta
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
