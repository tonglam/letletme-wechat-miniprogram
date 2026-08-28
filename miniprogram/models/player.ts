export interface PlayerOption {
  element?: number;
  code?: number | string;
  name: string;
  teamId?: number;
  team?: string;
  teamName?: string;
  position?: string;
  price?: number;
  priceText?: string;
  totalPoints?: number;
  form?: number;
  selectedByPercent?: number;
  /** Directory meta segment, e.g. "状态 5.2 · 持有 45.1%" (web player-stats row). */
  statText?: string;
}

export interface PlayerDetail extends Omit<
  PlayerOption,
  "totalPoints" | "selectedByPercent" | "form"
> {
  totalPoints?: number;
  selectedByPercent?: string | number;
  form?: string | number;
  injuryAvailability: PlayerAvailability | null;
  dataAvailability: PlayerDetailDataAvailability;
}

export type PlayerDataState =
  "READY" | "EMPTY" | "STALE" | "FALLBACK" | "UNAVAILABLE" | "NOT_APPLICABLE";

export interface PlayerAvailability {
  status: string;
  news?: string | null;
  newsAdded?: string | null;
  observedDate?: string | null;
  capturedAt?: string | null;
  chanceOfPlayingThisRound?: number | null;
  chanceOfPlayingNextRound?: number | null;
  stale?: boolean | null;
}

export interface PlayerDataSectionAvailability {
  state: PlayerDataState;
  reasonCode?: string | null;
  revision?: string | null;
  sourceCheckedAt?: string | null;
}

export interface PlayerDetailDataAvailability {
  isFullyAuthoritative: boolean;
  seasonStats: PlayerDataSectionAvailability;
  market: PlayerDataSectionAvailability;
  historicalTeam: PlayerDataSectionAvailability;
  fixtures: PlayerDataSectionAvailability;
  recentGameweeks: PlayerDataSectionAvailability;
}

export interface PlayerFilterRow extends PlayerOption {
  goals?: number;
  assists?: number;
  cleanSheets?: number;
}

export interface PlayerValueChange {
  element?: number;
  playerId?: number;
  name?: string;
  playerName?: string;
  team?: string;
  teamName?: string;
  teamShortName?: string;
  position?: string;
  oldValue?: number;
  newValue?: number;
  lastValue?: number;
  value?: number;
  changeDate?: string;
  changeDateText?: string;
  changeType?: string;
  transfersIn?: number;
  transfersOut?: number;
  oldPriceText?: string;
  newPriceText?: string;
  priceText?: string;
  changeText?: string;
  movementText?: string;
  movementClass?: string;
  transferText?: string;
  rowKey?: string;
}

export interface PlayerValue {
  playerId: number;
  playerName: string;
  teamName: string;
  teamShortName?: string;
  position: string;
  lastValue: number;
  value: number;
  price?: number;
  points?: number;
  selectedBy?: number;
  transfersIn?: number;
  transfersOut?: number;
  netTransfers?: number;
  form?: number;
  totalPoints?: number;
  eventPoints?: number;
}
