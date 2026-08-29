import {
  GraphQLApplicationError,
  graphqlRead,
  type PageRequestTrace,
} from "./graphql.service";
import { currentMyFplEntryId } from "../utils/follow";
import { storageKeys } from "../config/storage-keys";
import { recordLastGoodAge } from "./client-telemetry.service";
import type {
  PersonalPriceState,
  PriceChangeBoard,
  PriceChangeBoardRead,
  PriceChangePersonalContext,
  PriceChangePersonalPick,
  PriceChangePlayer,
  PriceChangeTransferGameweek,
} from "../models/price-change";
import {
  buildPersonalPurchasePrices,
  isFreeHitChip,
  resolveTransferPlayerIds,
} from "../utils/price-change";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const LAST_GOOD_MAX_AGE_MS = HOUR;
const START_PRICE_BATCH_SIZE = 2;

export const PRICE_CHANGE_BOARD_QUERY = `
  query GetPriceChangeBoard {
    priceChangeBoard {
      status
      source
      deadline
      nextDeadlines
      fetchedAt
      staleAt
      revision
      expectedPlayerCount
      observedPlayerCount
      players {
        playerId
        playerCode
        webName
        teamId
        teamName
        teamShortName
        position
        currentPrice
        selectedByPercent
        progressPercent
        hourlyRate
        status
        ownershipTrend
        transfersInEvent
        transfersOutEvent
        lockedUntil
        calibrating
      }
    }
  }
`;

export const PRICE_CHANGE_PERSONAL_QUERY = `
  query GetPriceChangePersonal($eventId: Int!) {
    myFplTeamGameweek(eventId: $eventId) {
      state
      result {
        picks {
          element
          webName
          teamShortName
          elementTypeName
        }
      }
    }
    myFplTeamDesk(eventId: $eventId) {
      state
      history {
        eventId
        eventChip
      }
    }
    myFplTeamTransfers {
      state
      gameweeks {
        eventId
        transfers {
          eventId
          elementInWebName
          elementInTypeName
          elementInTeamShortName
          elementInCost
          time
        }
      }
    }
  }
`;

export const PRICE_CHANGE_START_PRICES_QUERY = `
  query GetPriceChangeStartPrices($playerIds: [Int!]!, $eventId: Int!) {
    playerStatsDesk(playerIds: $playerIds, eventId: $eventId, horizon: 1) {
      entries {
        playerId
        overview {
          status
          value {
            id
            startPrice
          }
        }
      }
    }
  }
`;

export const EMPTY_PRICE_CHANGE_BOARD: PriceChangeBoard = {
  status: "UNAVAILABLE",
  source: "FPL_BOOTSTRAP",
  deadline: null,
  nextDeadlines: [],
  fetchedAt: null,
  staleAt: null,
  revision: "unavailable",
  expectedPlayerCount: 0,
  observedPlayerCount: 0,
  players: [],
};

interface PriceChangeBoardResponse {
  priceChangeBoard: PriceChangeBoard;
}

type MyFplReviewState = "PRESEASON" | "PENDING" | "READY" | "EMPTY" | "UNAVAILABLE";

interface PriceChangePersonalResponse {
  myFplTeamGameweek?: {
    state: MyFplReviewState;
    result?: { picks?: PriceChangePersonalPick[] } | null;
  } | null;
  myFplTeamDesk?: {
    state: MyFplReviewState;
    history?: Array<{ eventId: number; eventChip: string }>;
  } | null;
  myFplTeamTransfers?: {
    state: MyFplReviewState;
    gameweeks?: PriceChangeTransferGameweek[];
  } | null;
}

interface StartPricesResponse {
  playerStatsDesk?: {
    entries?: Array<{
      playerId: number;
      overview?: {
        status: string;
        value?: { id: number; startPrice: number | null } | null;
      } | null;
    }>;
  } | null;
}

interface StoredPriceChangeBoard {
  savedAt: number;
  board: PriceChangeBoard;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUsablePriceChangeBoard(value: unknown): value is PriceChangeBoard {
  if (!isRecord(value)) return false;
  return Array.isArray(value.players)
    && value.players.length > 0
    && typeof value.revision === "string"
    && value.revision.length > 0
    && typeof value.observedPlayerCount === "number"
    && value.observedPlayerCount > 0;
}

export function isPersistablePriceChangeBoard(value: unknown): value is PriceChangeBoard {
  return isUsablePriceChangeBoard(value) && value.status === "READY";
}

function persistLastGoodBoard(board: PriceChangeBoard): void {
	if (!isPersistablePriceChangeBoard(board)) return;
  const fetchedAt = board.fetchedAt ? Date.parse(board.fetchedAt) : NaN;
  const savedAt = Number.isFinite(fetchedAt) ? fetchedAt : Date.now();
	try {
		wx.setStorageSync(storageKeys.lastPriceChangeBoard, { savedAt, board });
  } catch {
    // Persistent last-good is an enhancement; the GraphQL cache still applies.
  }
}

export function readLastGoodPriceChangeBoard(now = Date.now()): StoredPriceChangeBoard | null {
	try {
		const value = wx.getStorageSync(storageKeys.lastPriceChangeBoard) as unknown;
    if (!isRecord(value) || typeof value.savedAt !== "number") return null;
    if (now - value.savedAt >= LAST_GOOD_MAX_AGE_MS || now < value.savedAt - MINUTE) {
      wx.removeStorageSync(storageKeys.lastPriceChangeBoard);
      return null;
    }
    if (!isPersistablePriceChangeBoard(value.board)) return null;
    return { savedAt: value.savedAt, board: value.board };
  } catch {
    return null;
  }
}

function lastGoodPriceChangeBoardRead(): PriceChangeBoardRead | null {
  const lastGood = readLastGoodPriceChangeBoard();
  if (!lastGood) return null;
  recordLastGoodAge(Math.max(0, Date.now() - lastGood.savedAt));
  return {
    board: { ...lastGood.board, status: "STALE" },
    cacheStale: true,
    usedLastGood: true,
    storedAt: lastGood.savedAt,
  };
}

export async function getPriceChangeBoard(
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<PriceChangeBoardRead> {
  try {
    const read = await graphqlRead<PriceChangeBoardResponse>(
      PRICE_CHANGE_BOARD_QUERY,
      {},
      {
        authMode: "public",
        cachePolicy: "market",
		cacheTtl: 5 * MINUTE,
		// graphqlRead adds staleTtl to freshUntil. Subtract the fresh
		// window so the hard one-hour age is not accidentally 65 minutes.
		staleTtl: HOUR - 5 * MINUTE,
		cacheVariant: "price-change-board:v2",
        forceRefresh,
        trace,
        getCacheExpiry: (data) => {
          const response = data as PriceChangeBoardResponse | undefined;
			return Date.now() + (response?.priceChangeBoard?.status === "UNAVAILABLE" ? MINUTE : 5 * MINUTE);
        },
      },
    );
    if (read.errors.length > 0) throw new GraphQLApplicationError(read.errors);
    const incoming = read.data.priceChangeBoard || EMPTY_PRICE_CHANGE_BOARD;
    if (isUsablePriceChangeBoard(incoming)) {
      const board = read.meta.stale && incoming.status === "READY"
        ? { ...incoming, status: "STALE" as const }
        : incoming;
      if (!read.meta.stale && isPersistablePriceChangeBoard(incoming)) {
        persistLastGoodBoard(incoming);
      }
      return {
        board,
        cacheStale: read.meta.stale,
        usedLastGood: false,
        storedAt: read.meta.storedAt,
      };
    }

    const lastGood = lastGoodPriceChangeBoardRead();
    if (lastGood) return lastGood;
    return {
      board: incoming,
      cacheStale: read.meta.stale,
      usedLastGood: false,
      storedAt: read.meta.storedAt,
    };
  } catch (error) {
    const lastGood = lastGoodPriceChangeBoardRead();
    if (lastGood) return lastGood;
    throw error;
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

/* ------------------------------------------------------------------------
 * Provisional price-change live channel (backend feat(price-live) 3cac9cd,
 * web lib/price-change-live-client.ts parity). The durable priceChangeBoard
 * resolver never merges hot snapshots, so pages that want the provisional
 * board must poll the cursor and fetch the live board explicitly.
 * --------------------------------------------------------------------- */

export type PriceChangeLiveState = "PROVISIONAL" | "DURABLE" | "UNAVAILABLE";

export interface PriceChangeLiveCursor {
  seasonCode: string;
  revision: string | null;
  sourceHash: string | null;
  state: PriceChangeLiveState;
  detectedAt: string | null;
  fetchedAt: string | null;
  expiresAt: string | null;
}

export interface PriceChangeLiveBoard {
  revision: string;
  sourceHash: string | null;
  state: PriceChangeLiveState;
  detectedAt: string | null;
  expiresAt: string | null;
  durablePublicationId: string | null;
  board: PriceChangeBoard;
}

export const PRICE_CHANGE_LIVE_CURSOR_QUERY = `
  query PriceChangeLiveCursor {
    priceChangeLiveCursor {
      seasonCode
      revision
      sourceHash
      state
      detectedAt
      fetchedAt
      expiresAt
    }
  }
`;

export const PRICE_CHANGE_LIVE_BOARD_QUERY = `
  query PriceChangeLiveBoard($revision: String, $sourceHash: String) {
    priceChangeLiveBoard(revision: $revision, sourceHash: $sourceHash) {
      revision
      sourceHash
      state
      detectedAt
      expiresAt
      durablePublicationId
      board {
        status
        source
        deadline
        nextDeadlines
        fetchedAt
        staleAt
        revision
        expectedPlayerCount
        observedPlayerCount
        players {
          playerId
          playerCode
          webName
          teamId
          teamName
          teamShortName
          position
          currentPrice
          selectedByPercent
          progressPercent
          hourlyRate
          status
          ownershipTrend
          transfersInEvent
          transfersOutEvent
          lockedUntil
          calibrating
        }
      }
    }
  }
`;

/** Cursor reads must never be cached — the poll cadence IS the freshness. */
export async function getPriceChangeLiveCursor(): Promise<PriceChangeLiveCursor | null> {
  try {
    const read = await graphqlRead<{ priceChangeLiveCursor: PriceChangeLiveCursor | null }>(
      PRICE_CHANGE_LIVE_CURSOR_QUERY,
      {},
      { authMode: "public", cachePolicy: "network-only", forceRefresh: true },
    );
    if (read.errors.length > 0) return null;
    return read.data.priceChangeLiveCursor ?? null;
  } catch {
    return null;
  }
}

/** PROVISIONAL boards are pinned by revision + sourceHash; DURABLE reads pass none. */
export async function getPriceChangeLiveBoard(
  revision?: string | null,
  sourceHash?: string | null,
): Promise<PriceChangeLiveBoard | null> {
  try {
    const read = await graphqlRead<{ priceChangeLiveBoard: PriceChangeLiveBoard | null }>(
      PRICE_CHANGE_LIVE_BOARD_QUERY,
      { revision: revision || null, sourceHash: sourceHash || null },
      { authMode: "public", cachePolicy: "network-only", forceRefresh: true },
    );
    if (read.errors.length > 0) return null;
    return read.data.priceChangeLiveBoard ?? null;
  } catch {
    return null;
  }
}

async function getSquadStartPrices(input: {
  playerIds: readonly number[];
  eventId: number;
  season: string;
  forceRefresh: boolean;
  trace?: PageRequestTrace;
}): Promise<Record<string, number>> {
  const uniqueIds = Array.from(new Set(input.playerIds))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  const pages = await Promise.all(chunks(uniqueIds, START_PRICE_BATCH_SIZE).map(async (playerIds) => {
    try {
      const read = await graphqlRead<StartPricesResponse>(
        PRICE_CHANGE_START_PRICES_QUERY,
        { playerIds, eventId: input.eventId },
        {
          authMode: "public",
          cachePolicy: "player-picker",
          season: input.season,
          cacheVariant: `price-change-start:event:${input.eventId}`,
          forceRefresh: input.forceRefresh,
          trace: input.trace,
        },
      );
      if (read.errors.length > 0) return [];
      return read.data.playerStatsDesk?.entries || [];
    } catch {
      return [];
    }
  }));
  const startPrices: Record<string, number> = {};
  pages.flat().forEach((entry) => {
    const value = entry.overview?.value;
    if (
      typeof value?.startPrice === "number"
      && Number.isFinite(value.startPrice)
      && value.startPrice >= 0
    ) {
      // PlayerStatsDesk already returns official FPL tenths (60 = £6.0m).
      startPrices[String(entry.playerId)] = value.startPrice;
    }
  });
  return startPrices;
}

function unavailablePersonalContext(
  squadState: PriceChangePersonalContext["squadState"],
  squadElementIds: number[] = [],
): PriceChangePersonalContext {
  return {
    squadState,
    squadElementIds,
    purchasePrices: {},
    personalPriceState: "UNAVAILABLE",
  };
}

function personalPriceState(
  value: PersonalPriceState,
  historyAvailable: boolean,
): PersonalPriceState {
  return value === "READY" && !historyAvailable ? "PARTIAL" : value;
}

export async function getPriceChangePersonalContext(input: {
  eventId: number;
  season: string;
  entryId: number | null;
  players: readonly PriceChangePlayer[];
  forceRefresh?: boolean;
  trace?: PageRequestTrace;
}): Promise<PriceChangePersonalContext> {
  const viewerEntryId = currentMyFplEntryId();
  if (!viewerEntryId || input.entryId !== viewerEntryId) {
    return unavailablePersonalContext("unbound");
  }
  let read;
  try {
    read = await graphqlRead<PriceChangePersonalResponse>(
      PRICE_CHANGE_PERSONAL_QUERY,
      { eventId: input.eventId },
      {
        authMode: "session",
        cachePolicy: "reporting",
        season: input.season,
        cacheVariant: `price-change-personal:entry:${viewerEntryId}:event:${input.eventId}`,
        forceRefresh: input.forceRefresh === true,
        trace: input.trace,
      },
    );
  } catch {
    return unavailablePersonalContext("unavailable");
  }
  if (currentMyFplEntryId() !== viewerEntryId) {
    return unavailablePersonalContext("unbound");
  }
  if (read.meta.stale) {
    return unavailablePersonalContext("unavailable");
  }

  const gameweek = read.data.myFplTeamGameweek;
  const picks = Array.isArray(gameweek?.result?.picks) ? gameweek.result.picks : [];
  const squadElementIds = Array.from(new Set(
    picks.map((pick) => Number(pick.element))
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  ));
  if (squadElementIds.length === 0) {
    const unavailable = gameweek?.state === "UNAVAILABLE"
      || read.errors.some((error) => String(error.path?.[0] || "") === "myFplTeamGameweek");
    return unavailablePersonalContext(unavailable ? "unavailable" : "not-published");
  }

  const transfersRoot = read.data.myFplTeamTransfers;
  const transfersAvailable = transfersRoot?.state === "READY"
    || transfersRoot?.state === "EMPTY"
    || transfersRoot?.state === "PRESEASON";
  if (!transfersAvailable) return unavailablePersonalContext("ready", squadElementIds);

  const desk = read.data.myFplTeamDesk;
  const history = desk?.history;
  const historyAvailable = desk?.state === "READY" && Array.isArray(history);
  if (!historyAvailable) return unavailablePersonalContext("ready", squadElementIds);
  const historyChips: Record<string, string> = {};
  (history || []).forEach((row) => {
    if (Number.isSafeInteger(row.eventId) && row.eventId > 0) {
      historyChips[String(row.eventId)] = row.eventChip;
    }
  });
  if (isFreeHitChip(historyChips[String(input.eventId)])) {
    return unavailablePersonalContext("ready", squadElementIds);
  }

  const startPrices = await getSquadStartPrices({
    playerIds: squadElementIds,
    eventId: input.eventId,
    season: input.season,
    forceRefresh: input.forceRefresh === true,
    trace: input.trace,
  });
  const resolvedTransfers = resolveTransferPlayerIds(
    transfersRoot?.gameweeks || [],
    input.players,
  );
  const prices = buildPersonalPurchasePrices({
    selectedEventId: input.eventId,
    squadElementIds,
    startPrices,
    transfers: resolvedTransfers,
    historyChips,
  });
  return {
    squadState: "ready",
    squadElementIds,
    purchasePrices: prices.purchasePrices,
    personalPriceState: personalPriceState(prices.state, historyAvailable),
  };
}
