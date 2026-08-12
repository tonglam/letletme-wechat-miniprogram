import { graphqlRead, graphqlRequest } from "./graphql.service";
import type { DomainRead, ServiceReadOptions } from "./service-read";
import type { PlayerValue, PlayerValueChange } from "../models/player";
import { formatPrice } from "../utils/fpl";
import { formatDateKey } from "../utils/date";

const PLAYER_VALUES = `
  query GetPlayerValues($changeDate: Date!) {
    playerValues(changeDate: $changeDate) {
      playerId
      playerName
      teamName
      teamShortName
      position
      lastValue
      value
      price
      points
      selectedBy
      transfersIn
      transfersOut
      netTransfers
      form
      totalPoints
      eventPoints
    }
  }
`;

const PLAYER_VALUE_HISTORY = `
  query GetPlayerValueHistory($playerId: Int!) {
    playerValueHistory(playerId: $playerId) {
      playerId
      changeDate
      oldValue
      newValue
      changeType
      transfersIn
      transfersOut
    }
  }
`;

interface PlayerValuesResponse {
  playerValues: PlayerValue[];
}

interface PlayerValueHistoryResponse {
  playerValueHistory: Array<{
    playerId: number;
    changeDate: string;
    oldValue: number;
    newValue: number;
    changeType: string;
    transfersIn?: number | null;
    transfersOut?: number | null;
  }>;
}

function toDateKey(dateKey?: string): string | undefined {
  if (!dateKey) {
    return undefined;
  }

  if (/^\d{8}$/.test(dateKey)) {
    return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
  }

  return dateKey;
}

function formatChangeText(oldValue?: number, newValue?: number): string {
  if (typeof oldValue !== "number" || typeof newValue !== "number") {
    return "";
  }

  const delta = newValue - oldValue;
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${formatPrice(Math.abs(delta))}`;
}

function movementText(changeType: string): string {
  if (changeType === "RISE") {
    return "上涨";
  }

  if (changeType === "FALL") {
    return "下跌";
  }

  return "未变化";
}

function movementClass(changeType: string): string {
  if (changeType === "RISE") {
    return "movement-rise";
  }

  if (changeType === "FALL") {
    return "movement-fall";
  }

  return "movement-flat";
}

function formatTransferText(transfersIn?: number | null, transfersOut?: number | null): string {
  const parts: string[] = [];
  if (typeof transfersIn === "number") {
    parts.push(`转入 ${transfersIn.toLocaleString()}`);
  }
  if (typeof transfersOut === "number") {
    parts.push(`转出 ${transfersOut.toLocaleString()}`);
  }

  return parts.join(" / ");
}

function formatUtc8Date(value?: string): string {
  if (!value) {
    return "";
  }

  let normalized = value;
  if (/^\d{8}$/.test(value)) {
    normalized = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    normalized = `${value}T00:00:00Z`;
  } else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    normalized = `${value}Z`;
  }

  const time = new Date(normalized).getTime();
  if (Number.isNaN(time)) {
    return value;
  }

  const utc8 = new Date(time + 8 * 60 * 60 * 1000);
  const year = utc8.getUTCFullYear();
  const month = utc8.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = utc8.getUTCDate();

  return `${month} ${day}, ${year}`;
}

function enrichPriceChange(change: PlayerValueChange): PlayerValueChange {
  const oldValue = change.oldValue ?? change.lastValue;
  const newValue = change.newValue ?? change.value;
  const computedType = typeof oldValue === "number" && typeof newValue === "number"
    ? newValue > oldValue ? "RISE" : newValue < oldValue ? "FALL" : "UNCHANGED"
    : "UNCHANGED";
  const changeType = change.changeType || computedType;

  return {
    ...change,
    oldPriceText: formatPrice(oldValue),
    newPriceText: formatPrice(newValue),
    priceText: `${formatPrice(oldValue)} -> ${formatPrice(newValue)}`,
    changeDateText: formatUtc8Date(change.changeDate),
    changeText: formatChangeText(oldValue, newValue),
    movementText: movementText(changeType),
    movementClass: movementClass(changeType),
    transferText: formatTransferText(change.transfersIn, change.transfersOut),
    changeType
  };
}

function mapPlayerValueChange(value: PlayerValue): PlayerValueChange {
  return enrichPriceChange({
    element: value.playerId,
    playerId: value.playerId,
    name: value.playerName,
    playerName: value.playerName,
    team: value.teamShortName || value.teamName,
    teamName: value.teamName,
    teamShortName: value.teamShortName,
    position: value.position,
    oldValue: value.lastValue,
    newValue: value.value,
    lastValue: value.lastValue,
    value: value.value,
    transfersIn: value.transfersIn ?? undefined,
    transfersOut: value.transfersOut ?? undefined,
    changeType: value.value > value.lastValue ? "RISE" : value.value < value.lastValue ? "FALL" : "UNCHANGED"
  });
}

/** Local calendar day — matches how the price page builds its picker dates. */
function localTodayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Past dates are immutable; today's board moves once or twice a day. */
function priceCacheTtl(changeDate: string): number {
  const key = toDateKey(changeDate) || "";
  // An unexpected future date gets the short TTL too — never the 24h one.
  return key >= localTodayKey() ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

export async function getPlayerValueByDate(changeDate: string, forceRefresh = false): Promise<PlayerValueChange[]> {
  return (await readPlayerValueByDate(changeDate, { forceRefresh })).data;
}

export async function readPlayerValueByDate(
  changeDate: string,
  options: ServiceReadOptions = {}
): Promise<DomainRead<PlayerValueChange[]>> {
  const result = await graphqlRead<PlayerValuesResponse>(PLAYER_VALUES, { changeDate: toDateKey(changeDate) }, {
    cachePolicy: "market",
    getCacheExpiry: () => Date.now() + priceCacheTtl(changeDate),
    forceRefresh: options.forceRefresh,
    trace: options.trace
  });
  if (result.errors.length > 0) {
    throw new Error(
      result.errors.map((error) => error.message).filter(Boolean).join("; ")
      || "身价变化数据暂时不可用，请稍后重试"
    );
  }
  return {
    data: (result.data.playerValues || [])
      .filter((value) => value.value !== value.lastValue)
      .map(mapPlayerValueChange),
    meta: result.meta
  };
}

export async function getPlayerValueByElement(element: number, forceRefresh = false): Promise<PlayerValueChange[]> {
  const data = await graphqlRequest<PlayerValueHistoryResponse>(PLAYER_VALUE_HISTORY, { playerId: element }, {
    cachePolicy: "historical",
    forceRefresh
  });
  return (data.playerValueHistory || []).map((item) => enrichPriceChange({
    element: item.playerId,
    playerId: item.playerId,
    oldValue: item.oldValue,
    newValue: item.newValue,
    lastValue: item.oldValue,
    value: item.newValue,
    changeDate: item.changeDate,
    transfersIn: item.transfersIn ?? undefined,
    transfersOut: item.transfersOut ?? undefined,
    changeType: item.changeType
  }));
}

export async function getPlayerValues(changeDate: string, forceRefresh = false): Promise<PlayerValue[]> {
  const data = await graphqlRequest<PlayerValuesResponse>(PLAYER_VALUES, { changeDate: toDateKey(changeDate) }, {
    cachePolicy: "market",
    getCacheExpiry: () => Date.now() + priceCacheTtl(changeDate),
    forceRefresh
  });
  return data.playerValues || [];
}

export function refreshPlayerValue(changeDate?: string): Promise<unknown> {
  return changeDate ? getPlayerValueByDate(changeDate, true) : getPlayerValues(changeDate || formatDateKey(), true);
}
