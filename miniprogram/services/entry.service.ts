import type {
  EntryHistory,
  EntryInfo,
  EntryLeague,
  EntryLookupSource,
  EntryLookupStatus,
  EntryPersistenceState,
  EntrySearchResult,
  EntryTransfer
} from "../models/entry";
import { entryLookupPresentation } from "../utils/entry-lookup-presentation";
import { graphqlRequest } from "./graphql.service";
import type { PageRequestTrace } from "./graphql.service";

// Documents here are not shared with summary.service: field selections differ
// (and live vs history cache variants). Merging would change query hashes.

export const ENTRY_LOOKUP_QUERY = `
  query EntryLookup($id: Int!) {
    entryLookup(id: $id) {
      status
      retryable
      source
      persistenceState
      entry {
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
  }
`;

export type { EntryLookupSource, EntryLookupStatus, EntryPersistenceState } from "../models/entry";

interface GetEntryResponse {
  entryLookup: {
    status: EntryLookupStatus;
    retryable: boolean;
    source?: EntryLookupSource | null;
    persistenceState?: EntryPersistenceState | null;
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
  };
}

export class EntryLookupError extends Error {
  constructor(
    readonly status: EntryLookupStatus,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "EntryLookupError";
  }
}

const GET_ENTRY_LEAGUES = `
  query EntryLeagues($entryId: Int!) {
    entryLeagues(entryId: $entryId) {
      id
      name
      type
      officialKind
      shortName
      startedEvent
      entryRank
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
    type?: string | null;
    officialKind?: string | null;
    shortName?: string | null;
    startedEvent?: number | null;
    entryRank?: number | null;
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

export interface EntryEventResult {
  eventId?: number | null;
  eventPoints?: number | null;
  eventRank?: number | null;
  overallPoints?: number | null;
  overallRank?: number | null;
  eventTransfers?: number | null;
  eventTransfersCost?: number | null;
  eventNetPoints?: number | null;
  teamValue?: number | null;
  bank?: number | null;
}

interface EntryEventResultResponse {
  entryEventResult: EntryEventResult | null;
}

function mapGraphQLEntry(entry: GetEntryResponse["entryLookup"]["entry"]): EntryInfo | undefined {
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

const SEARCH_ENTRIES = `
  query SearchEntries($query: String!, $limit: Int) {
    searchEntries(query: $query, limit: $limit) {
      id
      entryName
      playerName
      overallPoints
      overallRank
    }
  }
`;

interface SearchEntriesResponse {
  searchEntries: Array<{
    id: number;
    entryName: string;
    playerName: string;
    overallPoints?: number | null;
    overallRank?: number | null;
  }>;
}

export async function searchEntries(
  keyword: string,
  limit = 10,
  trace?: PageRequestTrace | null
): Promise<EntrySearchResult[]> {
  const query = keyword.trim();
  if (query.length < 2) {
    return [];
  }

  const data = await graphqlRequest<SearchEntriesResponse>(
    SEARCH_ENTRIES,
    { query, limit },
    {
      cachePolicy: "reporting",
      trace
    }
  );
  return (data.searchEntries || []).map((entry) => ({
    entry: entry.id,
    entryId: entry.id,
    entryName: entry.entryName,
    teamName: entry.entryName,
    playerName: entry.playerName,
    overallRank: entry.overallRank ?? undefined,
    totalPoints: entry.overallPoints ?? undefined
  }));
}

export async function getEntryInfo(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<EntryInfo> {
  const data = await graphqlRequest<GetEntryResponse>(ENTRY_LOOKUP_QUERY, { id: entry }, {
    cachePolicy: "reporting",
    forceRefresh,
    trace
  });
  const lookup = data.entryLookup;
  const result = mapGraphQLEntry(lookup?.entry ?? null);
  if (lookup?.status !== "FOUND" || !result) {
    const status = lookup?.status ?? "UNAVAILABLE";
    const presentation = entryLookupPresentation(status);
    throw new EntryLookupError(
      status,
      typeof lookup?.retryable === "boolean"
        ? lookup.retryable
        : presentation?.retryable ?? true,
      presentation?.message ?? "当前无法确认球队数据，请稍后重试",
    );
  }
  return {
    ...result,
    lookupStatus: lookup.status,
    lookupSource: lookup.source ?? null,
    persistenceState: lookup.persistenceState ?? null
  };
}

export async function getEntryLeagueInfo(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<EntryLeague[]> {
  const data = await graphqlRequest<EntryLeaguesResponse>(GET_ENTRY_LEAGUES, { entryId: entry }, {
    cachePolicy: "reporting",
    forceRefresh,
    trace
  });
  return (data.entryLeagues || []).map((league) => ({
    id: league.id,
    name: league.name,
    rank: league.entryRank ?? undefined,
    officialKind:
      league.officialKind === "SYSTEM" ||
      league.officialKind === "INVITATIONAL" ||
      league.officialKind === "PUBLIC"
        ? league.officialKind
        : undefined,
    type: league.type ?? undefined,
    shortName: league.shortName ?? undefined
  }));
}

export async function getEntryClassicLeagues(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<EntryLeague[]> {
  const allLeagues = await getEntryLeagueInfo(entry, forceRefresh, trace);
  return allLeagues.filter(league => league.type === "CLASSIC");
}

export async function getEntryH2hLeagues(
  entry: number,
  forceRefresh = false,
  trace?: PageRequestTrace
): Promise<EntryLeague[]> {
  const allLeagues = await getEntryLeagueInfo(entry, forceRefresh, trace);
  return allLeagues.filter(league => league.type === "H2H");
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

function mapTransferRecord(t: EntryEventTransfersData): EntryTransfer {
  return {
    event: t.event,
    playerIn: t.elementInWebName,
    playerOut: t.elementOutWebName,
    elementIn: t.elementIn,
    elementOut: t.elementOut,
    elementInWebName: t.elementInWebName,
    elementOutWebName: t.elementOutWebName,
    elementInTeamShortName: t.elementInTeamShortName,
    elementOutTeamShortName: t.elementOutTeamShortName,
    cost: t.elementInCost,
    time: t.time
  };
}

export async function getEntryEventResult(
  entry: number,
  event: number
): Promise<EntryEventResult | undefined> {
  const data = await graphqlRequest<EntryEventResultResponse>(GET_ENTRY_EVENT_RESULT, {
    entryId: entry,
    eventId: event
  });
  return data.entryEventResult || undefined;
}

export async function getEntryEventTransfers(
  entry: number,
  event: number,
  forceRefresh = false,
  trace?: PageRequestTrace | null
): Promise<EntryTransfer[]> {
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
    cachePolicy: isLiveEvent ? "live" : "reporting",
    forceRefresh,
    trace
  });
  const gw = data.entryTransferHistory.find((item) => item.eventId === event);
  if (!gw) {
    return [];
  }
  return gw.transfers.map(mapTransferRecord);
}

export async function getEntryAllTransfers(entry: number, forceRefresh = false): Promise<EntryTransfer[]> {
  const data = await graphqlRequest<GetEntryTransferHistoryResponse>(GET_ENTRY_TRANSFER_HISTORY, { entryId: entry }, {
    // Same freshness class as historical per-event views: share their entry.
    cacheVariant: "history",
    cachePolicy: "reporting",
    forceRefresh
  });
  return (data.entryTransferHistory || []).flatMap((gw) => gw.transfers.map(mapTransferRecord));
}
