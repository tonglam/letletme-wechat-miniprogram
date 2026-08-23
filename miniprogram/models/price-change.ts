export type PriceChangeBoardStatus = "READY" | "PARTIAL" | "STALE" | "UNAVAILABLE";

export type PriceChangePredictionStatus =
  | "VERY_LIKELY_RISE"
  | "LIKELY_RISE"
  | "UNLIKELY"
  | "LIKELY_FALL"
  | "VERY_LIKELY_FALL"
  | "LOCKED"
  | "CALIBRATING";

export type PriceChangeOwnershipTrend = "UP" | "DOWN" | "FLAT";
export type PriceChangePosition = "GKP" | "DEF" | "MID" | "FWD";

export interface PriceChangePlayer {
  playerId: number;
  playerCode: number;
  webName: string;
  teamId: number;
  teamName: string;
  teamShortName: string;
  position: PriceChangePosition;
  /** FPL price in tenths of a million. */
  currentPrice: number;
  selectedByPercent: number;
  progressPercent: number;
  hourlyRate: number;
  status: PriceChangePredictionStatus;
  ownershipTrend: PriceChangeOwnershipTrend;
  transfersInEvent: number;
  transfersOutEvent: number;
  lockedUntil: string | null;
  calibrating: boolean;
}

export interface PriceChangeBoard {
  status: PriceChangeBoardStatus;
  source: "FPL_BOOTSTRAP";
  deadline: string | null;
  nextDeadlines: string[];
  fetchedAt: string | null;
  staleAt: string | null;
  revision: string;
  expectedPlayerCount: number;
  observedPlayerCount: number;
  players: PriceChangePlayer[];
}

export interface PriceChangeBoardRead {
  board: PriceChangeBoard;
  cacheStale: boolean;
  usedLastGood: boolean;
  storedAt?: number;
}

export type PriceChangeSquadState =
  | "ready"
  | "not-published"
  | "unbound"
  | "unavailable";

export type PersonalPriceState = "READY" | "PARTIAL" | "UNAVAILABLE";

export interface PriceChangePersonalContext {
  squadState: PriceChangeSquadState;
  squadElementIds: number[];
  purchasePrices: Record<string, number>;
  personalPriceState: PersonalPriceState;
}

export interface PriceChangePersonalPick {
  element: number;
  webName: string;
  teamShortName: string;
  elementTypeName: string;
}

export interface PriceChangeTransferMove {
  eventId: number;
  elementInWebName: string;
  elementInTypeName: string;
  elementInTeamShortName: string;
  elementInCost: number;
  time: string;
}

export interface PriceChangeTransferGameweek {
  eventId: number;
  transfers: PriceChangeTransferMove[];
}
