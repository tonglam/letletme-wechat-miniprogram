import type { EntryHistory, EntryInfo, EntryLeague, EntrySearchResult, EntryTransfer } from "../models/entry";
import { graphqlRequest } from "./graphql.service";

const GET_ENTRY = `
  query GetEntry($id: Int!) {
    entry(id: $id) {
      id
      entryName
      playerName
      region
      overallPoints
      overallRank
      bank
      teamValue
      totalTransfers
    }
  }
`;

interface GetEntryResponse {
  entry: {
    id: number;
    entryName: string;
    playerName: string;
    region?: string | null;
    overallPoints?: number | null;
    overallRank?: number | null;
    bank?: number | null;
    teamValue?: number | null;
    totalTransfers?: number | null;
  } | null;
}

const GET_ENTRY_LEAGUES = `
  query EntryLeagues($entryId: Int!) {
    entryLeagues(entryId: $entryId) {
      id
      name
      startedEvent
    }
  }
`;

const GET_ENTRY_HISTORY = `
  query EntryHistory($entryId: Int!) {
    entryHistory(entryId: $entryId) {
      history {
        season
        totalPoints
        overallRank
      }
      results {
        eventId
        eventPoints
        eventRank
        overallRank
      }
    }
  }
`;

const GET_ENTRY_EVENT_RESULT = `
  query EntryEventResult($entryId: Int!, $eventId: Int!) {
    entryEventResult(entryId: $entryId, eventId: $eventId) {
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
  }
`;

interface EntryLeaguesResponse {
  entryLeagues: Array<{
    id: number;
    name: string;
    startedEvent?: number | null;
  }>;
}

interface EntryHistoryResponse {
  entryHistory: {
    history: Array<{
      season: string;
      totalPoints: number;
      overallRank: number;
    }>;
    results: Array<{
      eventId: number;
      eventPoints: number;
      eventRank?: number | null;
      overallRank: number;
    }>;
  };
}

interface EntryEventResultResponse {
  entryEventResult: unknown;
}

function mapGraphQLEntry(entry: GetEntryResponse["entry"]): EntryInfo | undefined {
  if (!entry) {
    return undefined;
  }

  return {
    entry: entry.id,
    entryId: entry.id,
    entryName: entry.entryName,
    teamName: entry.entryName,
    playerName: entry.playerName,
    overallRank: entry.overallRank ?? undefined,
    totalPoints: entry.overallPoints ?? undefined,
    totalTransfers: entry.totalTransfers ?? undefined,
    bank: entry.bank ?? undefined,
    teamValue: entry.teamValue ?? undefined,
    region: entry.region ?? undefined
  };
}

export async function searchEntries(keyword: string): Promise<EntrySearchResult[]> {
  const entryId = Number(keyword.trim());
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return [];
  }

  const entry = await getEntryInfo(entryId);
  return entry ? [entry] : [];
}

export async function getEntryInfo(entry: number, forceRefresh = false): Promise<EntryInfo> {
  const data = await graphqlRequest<GetEntryResponse>(GET_ENTRY, { id: entry }, {
    cacheTtl: 3600 * 1000,
    forceRefresh
  });
  const result = mapGraphQLEntry(data.entry);
  if (!result) {
    throw new Error("没有找到这个 FPL 球队，请检查 Entry ID");
  }
  return result;
}

export async function getEntryLeagueInfo(entry: number, forceRefresh = false): Promise<EntryLeague[]> {
  const data = await graphqlRequest<EntryLeaguesResponse>(GET_ENTRY_LEAGUES, { entryId: entry }, {
    cacheTtl: 3600 * 1000,
    forceRefresh
  });
  return (data.entryLeagues || []).map((league) => ({
    id: league.id,
    name: league.name
  }));
}

export async function getEntryHistoryInfo(entry: number): Promise<EntryHistory[]> {
  const data = await graphqlRequest<EntryHistoryResponse>(GET_ENTRY_HISTORY, { entryId: entry });
  return (data.entryHistory.results || []).map((result) => ({
    event: result.eventId,
    points: result.eventPoints,
    rank: result.eventRank ?? undefined,
    overallRank: result.overallRank
  }));
}

const GET_ENTRY_TRANSFER_HISTORY = `
  query GetEntryTransferHistory($entryId: Int!) {
    entryTransferHistory(entryId: $entryId) {
      eventId
      eventTransfers
      eventTransfersCost
      transfers {
        event
        entry
        elementIn
        elementInWebName
        elementInTeamShortName
        elementOut
        elementOutWebName
        elementOutTeamShortName
        elementInCost
        elementOutCost
        time
      }
    }
  }
`;

interface EntryEventTransfersData {
  event: number;
  entry: number;
  elementIn: number;
  elementInWebName: string;
  elementInTeamShortName: string;
  elementOut: number;
  elementOutWebName: string;
  elementOutTeamShortName: string;
  elementInCost: number;
  elementOutCost: number;
  time: string;
}

interface EntryGameweekTransfers {
  eventId: number;
  eventTransfers: number;
  eventTransfersCost: number;
  transfers: EntryEventTransfersData[];
}

interface GetEntryTransferHistoryResponse {
  entryTransferHistory: EntryGameweekTransfers[];
}

export async function getEntryEventResult(entry: number, event: number): Promise<unknown> {
  const data = await graphqlRequest<EntryEventResultResponse>(GET_ENTRY_EVENT_RESULT, {
    entryId: entry,
    eventId: event
  });
  return data.entryEventResult;
}

const TRANSFERS_HISTORY_CACHE_TTL_MS = 30 * 60 * 1000;
const LIVE_EVENT_TRANSFERS_CACHE_TTL_MS = 30 * 1000;

export async function getEntryEventTransfers(entry: number, event: number, forceRefresh = false): Promise<EntryTransfer[]> {
  // The history payload covers the live gameweek too: while the deadline is
  // open the manager can still make moves, so current-GW views must churn
  // with the live data instead of pinning the payload for the full half hour.
  let currentGw = 0;
  try {
    currentGw = Number(getApp<IAppOption>().globalData.gw) || 0;
  } catch {}
  const isLiveEvent = currentGw > 0 && event >= currentGw;
  const data = await graphqlRequest<GetEntryTransferHistoryResponse>(GET_ENTRY_TRANSFER_HISTORY, { entryId: entry }, {
    // Live and historical freshness policies get separate cache entries:
    // sharing one key would let a 30-minute history serve stand in for the
    // live view, and a memory-only live write could never replace a
    // persisted stale entry.
    cacheVariant: isLiveEvent ? "live" : "history",
    cacheTtl: isLiveEvent ? LIVE_EVENT_TRANSFERS_CACHE_TTL_MS : TRANSFERS_HISTORY_CACHE_TTL_MS,
    forceRefresh
  });
  const gw = data.entryTransferHistory.find((item) => item.eventId === event);
  if (!gw) {
    return [];
  }
  return gw.transfers.map((t) => ({
    event: t.event,
    playerIn: t.elementInWebName,
    playerOut: t.elementOutWebName,
    elementInWebName: t.elementInWebName,
    elementOutWebName: t.elementOutWebName,
    elementInTeamShortName: t.elementInTeamShortName,
    elementOutTeamShortName: t.elementOutTeamShortName,
    cost: t.elementInCost,
  }));
}

export async function getEntryAllTransfers(entry: number, forceRefresh = false): Promise<EntryTransfer[]> {
  const data = await graphqlRequest<GetEntryTransferHistoryResponse>(GET_ENTRY_TRANSFER_HISTORY, { entryId: entry }, {
    // Same freshness class as historical per-event views: share their entry.
    cacheVariant: "history",
    cacheTtl: 30 * 60 * 1000,
    forceRefresh
  });
  return (data.entryTransferHistory || []).flatMap((gw) => gw.transfers.map((t) => ({
    event: t.event,
    playerIn: t.elementInWebName,
    playerOut: t.elementOutWebName,
    elementInWebName: t.elementInWebName,
    elementOutWebName: t.elementOutWebName,
    elementInTeamShortName: t.elementInTeamShortName,
    elementOutTeamShortName: t.elementOutTeamShortName,
    cost: t.elementInCost,
  })));
}
