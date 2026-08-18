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

export interface PlayerDetail extends Omit<PlayerOption, "totalPoints" | "selectedByPercent" | "form"> {
  totalPoints?: number;
  selectedByPercent?: string | number;
  form?: string | number;
}

export interface PlayerFilterRow extends PlayerDetail {
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
