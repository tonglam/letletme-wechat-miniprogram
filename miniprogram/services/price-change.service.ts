import {
  GraphQLApplicationError,
  graphqlRead,
  type PageRequestTrace,
} from "./graphql.service";
import { getApiSessionToken } from "./auth.service";
import { storageKeys } from "../config/storage-keys";
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
  resolveTransferPlayerIds,
} from "../utils/price-change";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const LAST_GOOD_MAX_AGE_MS = DAY;
const START_PRICE_BATCH_SIZE = 5;

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

export function isPersistablePriceChangeBoard(value: unknown): value is PriceChangeBoard {
  if (!isRecord(value)) return false;
  return Array.isArray(value.players)
    && value.players.length > 0
    && typeof value.revision === "string"
    && value.revision.length > 0
    && typeof value.observedPlayerCount === "number"
    && value.observedPlayerCount > 0;
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
    if (now - value.savedAt > LAST_GOOD_MAX_AGE_MS || now < value.savedAt - MINUTE) {
      wx.removeStorageSync(storageKeys.lastPriceChangeBoard);
      return null;
    }
    if (!isPersistablePriceChangeBoard(value.board)) return null;
    return { savedAt: value.savedAt, board: value.board };
  } catch {
    return null;
  }
}

export async function getPriceChangeBoard(
  forceRefresh = false,
  trace?: PageRequestTrace,
): Promise<PriceChangeBoardRead> {
  const read = await graphqlRead<PriceChangeBoardResponse>(
    PRICE_CHANGE_BOARD_QUERY,
    {},
    {
      authMode: "public",
      cachePolicy: "market",
      cacheTtl: 5 * MINUTE,
      staleTtl: DAY,
      cacheVariant: "price-change-board:v1",
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
  if (isPersistablePriceChangeBoard(incoming)) {
    const board = read.meta.stale ? { ...incoming, status: "STALE" as const } : incoming;
    if (!read.meta.stale) persistLastGoodBoard(incoming);
    return {
      board,
      cacheStale: read.meta.stale,
      usedLastGood: false,
      storedAt: read.meta.storedAt,
    };
  }

  const lastGood = readLastGoodPriceChangeBoard();
  if (lastGood) {
    return {
      board: { ...lastGood.board, status: "STALE" },
      cacheStale: true,
      usedLastGood: true,
      storedAt: lastGood.savedAt,
    };
  }
  return {
    board: incoming,
    cacheStale: read.meta.stale,
    usedLastGood: false,
    storedAt: read.meta.storedAt,
  };
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
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
    if (value && Number.isFinite(value.startPrice) && Number(value.startPrice) >= 0) {
      startPrices[String(entry.playerId)] = Number(value.startPrice);
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
  if (!input.entryId || !getApiSessionToken()) return unavailablePersonalContext("unbound");
  let read;
  try {
    read = await graphqlRead<PriceChangePersonalResponse>(
      PRICE_CHANGE_PERSONAL_QUERY,
      { eventId: input.eventId },
      {
        authMode: "session",
        cachePolicy: "reporting",
        season: input.season,
        cacheVariant: `price-change-personal:event:${input.eventId}`,
        forceRefresh: input.forceRefresh === true,
        trace: input.trace,
      },
    );
  } catch {
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
  const history = read.data.myFplTeamDesk?.history;
  const historyAvailable = Array.isArray(history);
  const historyChips: Record<string, string> = {};
  (history || []).forEach((row) => {
    if (Number.isSafeInteger(row.eventId) && row.eventId > 0) {
      historyChips[String(row.eventId)] = row.eventChip;
    }
  });
  const prices = buildPersonalPurchasePrices({
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
