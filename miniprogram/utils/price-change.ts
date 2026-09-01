import type {
  PersonalPriceState,
  PriceChangePlayer,
  PriceChangePredictionStatus,
} from "../models/price-change";
import { formatCompactNumber } from "./summary-format";

export const PRICE_CHANGE_PAGE_SIZE = 20;

export type PriceChangeMovementFilter = "all" | "rise" | "fall" | "locked";
export type PriceChangeScopeFilter = "all" | "mine";
export type PriceChangeSortColumn =
  | "price"
  | "progress"
  | "signal"
  | "movement"
  | "purchasePrice"
  | "sellingPrice";
export type PriceChangeSortDirection = "asc" | "desc";

export interface PriceChangeSortState {
  column: PriceChangeSortColumn;
  direction: PriceChangeSortDirection;
}

export const DEFAULT_PRICE_CHANGE_SORT: PriceChangeSortState = {
  column: "progress",
  direction: "desc",
};

const STATUS_LIKELIHOOD_RANK: Record<PriceChangePredictionStatus, number> = {
  VERY_LIKELY_RISE: 3,
  VERY_LIKELY_FALL: 3,
  LIKELY_RISE: 2,
  LIKELY_FALL: 2,
  UNLIKELY: 1,
  LOCKED: 0,
  CALIBRATING: 0,
};

const STATUS_LABELS: Record<PriceChangePredictionStatus, string> = {
  VERY_LIKELY_RISE: "很可能上涨",
  LIKELY_RISE: "可能上涨",
  UNLIKELY: "暂不明显",
  LIKELY_FALL: "可能下跌",
  VERY_LIKELY_FALL: "很可能下跌",
  LOCKED: "价格锁定",
  CALIBRATING: "校准中",
};

export interface PriceChangeFilterInput {
  search: string;
  movement: PriceChangeMovementFilter;
  scope: PriceChangeScopeFilter;
  teamId: string;
  squadElementIds?: ReadonlySet<number>;
}

export interface PriceChangeViewRow {
  playerId: number;
  playerCode: number;
  name: string;
  teamLine: string;
  position: string;
  positionClass: string;
  priceText: string;
  statusText: string;
  statusClass: string;
  progressText: string;
  progressBarStyle: string;
  progressClass: string;
  ownershipText: string;
  ownershipTrendText: string;
  ownershipClass: string;
  transfersText: string;
  netTransfersText: string;
  rateText: string;
  personalPriceVisible: boolean;
  purchasePriceText: string;
  sellingPriceText: string;
}

export function isLikelyToChange(player: PriceChangePlayer): boolean {
  return player.status === "VERY_LIKELY_RISE"
    || player.status === "LIKELY_RISE"
    || player.status === "LIKELY_FALL"
    || player.status === "VERY_LIKELY_FALL";
}

export function priceChangeStatusLabel(status: PriceChangePredictionStatus): string {
  return STATUS_LABELS[status];
}

export type PriceChangeStatusTone = "up" | "down" | "neutral";

/** Web predictionStatusClass parity: RISE → green, FALL → red, else muted. */
export function priceChangeStatusTone(
  status: PriceChangePredictionStatus,
): PriceChangeStatusTone {
  if (status.includes("RISE")) return "up";
  if (status.includes("FALL")) return "down";
  return "neutral";
}

/** Web parity: likely squad, other likely, remaining squad, then the pool. */
export function priceChangeRelevanceScore(
  player: PriceChangePlayer,
  squadElementIds: ReadonlySet<number>,
): number {
  return (isLikelyToChange(player) ? 2 : 0)
    + (squadElementIds.has(player.playerId) ? 1 : 0);
}

export function priceChangeMovementValue(player: PriceChangePlayer): number {
  return player.transfersInEvent - player.transfersOutEvent;
}

export function calculateSellingPrice(
  purchasePrice: number,
  currentPrice: number,
): number {
  if (currentPrice <= purchasePrice) return currentPrice;
  return purchasePrice + Math.floor((currentPrice - purchasePrice) / 2);
}

function nullableSortValue(
  player: PriceChangePlayer,
  column: PriceChangeSortColumn,
  purchasePrices: Readonly<Record<string, number>>,
): number | null {
  if (column === "price") return player.currentPrice;
  if (column === "progress") return Math.abs(player.progressPercent);
  if (column === "signal") return STATUS_LIKELIHOOD_RANK[player.status];
  if (column === "movement") return priceChangeMovementValue(player);
  const purchasePrice = purchasePrices[String(player.playerId)];
  if (!Number.isFinite(purchasePrice)) return null;
  return column === "purchasePrice"
    ? purchasePrice
    : calculateSellingPrice(purchasePrice, player.currentPrice);
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: PriceChangeSortDirection,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return 0;
  return direction === "asc" ? left - right : right - left;
}

export function sortPriceChangePlayers(
  players: readonly PriceChangePlayer[],
  options: {
    sort?: PriceChangeSortState;
    squadElementIds?: ReadonlySet<number>;
    purchasePrices?: Readonly<Record<string, number>>;
  } = {},
): PriceChangePlayer[] {
  const sort = options.sort ?? DEFAULT_PRICE_CHANGE_SORT;
  const squadElementIds = options.squadElementIds ?? new Set<number>();
  const purchasePrices = options.purchasePrices ?? {};
  const relevanceFirst = sort.column === "progress" && sort.direction === "desc";

  return [...players].sort((left, right) => {
    if (relevanceFirst) {
      const relevance = priceChangeRelevanceScore(right, squadElementIds)
        - priceChangeRelevanceScore(left, squadElementIds);
      if (relevance !== 0) return relevance;
    }
    const primary = compareNullableNumbers(
      nullableSortValue(left, sort.column, purchasePrices),
      nullableSortValue(right, sort.column, purchasePrices),
      sort.direction,
    );
    if (primary !== 0) return primary;
    if (!relevanceFirst) {
      const relevance = priceChangeRelevanceScore(right, squadElementIds)
        - priceChangeRelevanceScore(left, squadElementIds);
      if (relevance !== 0) return relevance;
    }
    const byName = left.webName.localeCompare(right.webName);
    return byName || left.playerId - right.playerId;
  });
}

export function filterPriceChangePlayers(
  players: readonly PriceChangePlayer[],
  input: PriceChangeFilterInput,
): PriceChangePlayer[] {
  const query = input.search.trim().toLowerCase();
  const squad = input.squadElementIds ?? new Set<number>();
  return players.filter((player) => {
    if (input.scope === "mine" && !squad.has(player.playerId)) return false;
    if (input.teamId !== "all" && String(player.teamId) !== input.teamId) return false;
    if (input.movement === "rise" && player.progressPercent <= 0) return false;
    if (input.movement === "fall" && player.progressPercent >= 0) return false;
    if (
      input.movement === "locked"
      && player.status !== "LOCKED"
      && player.status !== "CALIBRATING"
    ) return false;
    if (!query) return true;
    return `${player.webName} ${player.teamName} ${player.teamShortName}`
      .toLowerCase()
      .includes(query);
  });
}

export function formatPredictionPercent(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatSignedCompact(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCompactNumber(Math.abs(value))}`;
}

function formatTenths(value: number): string {
  return Number.isFinite(value) ? `£${(value / 10).toFixed(1)}m` : "—";
}

function statusTone(status: PriceChangePredictionStatus): string {
  if (status.includes("RISE")) return "status-rise";
  if (status.includes("FALL")) return "status-fall";
  if (status === "LOCKED" || status === "CALIBRATING") return "status-locked";
  return "status-neutral";
}

export function buildPriceChangeViewRow(
  player: PriceChangePlayer,
  options: {
    showPersonalPrices: boolean;
    purchasePrices?: Readonly<Record<string, number>>;
  },
): PriceChangeViewRow {
  const purchasePrice = options.purchasePrices?.[String(player.playerId)];
  const hasPersonalPrice = options.showPersonalPrices
    && typeof purchasePrice === "number"
    && Number.isFinite(purchasePrice);
  const movement = priceChangeMovementValue(player);
  const rate = Number.isFinite(player.hourlyRate) ? player.hourlyRate : 0;
  const ownershipTrendText = player.ownershipTrend === "UP"
    ? "↗"
    : player.ownershipTrend === "DOWN" ? "↘" : "→";
  return {
    playerId: player.playerId,
    playerCode: player.playerCode,
    name: player.webName,
    teamLine: `${player.teamShortName} · ${player.teamName}`,
    position: player.position,
    positionClass: `pos-${player.position.toLowerCase()}`,
    priceText: formatTenths(player.currentPrice),
    statusText: STATUS_LABELS[player.status],
    statusClass: statusTone(player.status),
    progressText: formatPredictionPercent(player.progressPercent),
    progressBarStyle: `width: ${Math.min(100, Math.max(2, Math.abs(player.progressPercent)))}%`,
    progressClass: player.progressPercent > 0
      ? "progress-rise"
      : player.progressPercent < 0 ? "progress-fall" : "progress-flat",
    ownershipText: `${player.selectedByPercent.toFixed(1)}%`,
    ownershipTrendText,
    ownershipClass: player.ownershipTrend === "UP"
      ? "ownership-rise"
      : player.ownershipTrend === "DOWN" ? "ownership-fall" : "ownership-flat",
    transfersText: `${formatCompactNumber(player.transfersInEvent)} 入 · ${formatCompactNumber(player.transfersOutEvent)} 出`,
    netTransfersText: formatSignedCompact(movement),
    rateText: `${formatPredictionPercent(rate)}/时`,
    personalPriceVisible: options.showPersonalPrices,
    purchasePriceText: hasPersonalPrice ? formatTenths(purchasePrice as number) : "—",
    sellingPriceText: hasPersonalPrice
      ? formatTenths(calculateSellingPrice(purchasePrice as number, player.currentPrice))
      : "—",
  };
}

export function isFreeHitChip(value: unknown): boolean {
  const chip = String(value || "").trim().toUpperCase();
  return chip === "FREE_HIT";
}

export function buildPersonalPurchasePrices(input: {
  selectedEventId: number;
  squadElementIds: readonly number[];
  startPrices: Readonly<Record<string, number>>;
  transfers: ReadonlyArray<{
    eventId: number;
    elementIn: number | null;
    elementInCost: number;
    time: string;
  }>;
  historyChips?: Readonly<Record<string, string>>;
}): { state: PersonalPriceState; purchasePrices: Record<string, number> } {
  const squad = input.squadElementIds.filter((id) => Number.isSafeInteger(id) && id > 0);
  if (squad.length === 0) return { state: "UNAVAILABLE", purchasePrices: {} };
  if (isFreeHitChip(input.historyChips?.[String(input.selectedEventId)])) {
    // The event squad is temporary and does not expose reliable acquisition
    // prices. Showing season-start prices here would misstate selling values.
    return { state: "UNAVAILABLE", purchasePrices: {} };
  }
  const permanent = new Map<number, number>();
  for (const playerId of squad) {
    const startPrice = input.startPrices[String(playerId)];
    if (Number.isFinite(startPrice) && startPrice >= 0) permanent.set(playerId, startPrice);
  }
  const transfers = [...input.transfers].sort((left, right) => {
    const leftTime = Date.parse(left.time);
    const rightTime = Date.parse(right.time);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
    return left.eventId - right.eventId;
  });
  for (const transfer of transfers) {
    if (isFreeHitChip(input.historyChips?.[String(transfer.eventId)])) continue;
    if (transfer.elementIn === null || !squad.includes(transfer.elementIn)) continue;
    if (!Number.isFinite(transfer.elementInCost) || transfer.elementInCost < 0) continue;
    permanent.set(transfer.elementIn, transfer.elementInCost);
  }
  const purchasePrices: Record<string, number> = {};
  permanent.forEach((price, playerId) => {
    purchasePrices[String(playerId)] = price;
  });
  return {
    state: permanent.size === squad.length
      ? "READY"
      : permanent.size > 0 ? "PARTIAL" : "UNAVAILABLE",
    purchasePrices,
  };
}

export function formatPriceChangeShareText(input: {
  players: readonly PriceChangePlayer[];
  scopeLabel: string;
  deadlineLabel?: string;
  maxPlayers?: number;
}): string {
  const selected = input.players.slice(0, input.maxPlayers ?? PRICE_CHANGE_PAGE_SIZE);
  const lines = [
    `身价预测 · ${input.scopeLabel}`,
    ...(input.deadlineLabel ? [`截止：${input.deadlineLabel}`] : []),
    "",
  ];
  if (selected.length === 0) {
    lines.push("当前筛选没有匹配球员");
  } else {
    selected.forEach((player) => {
      lines.push(
        `- ${player.webName} ${player.teamShortName} · ${formatTenths(player.currentPrice)} · 进度 ${formatPredictionPercent(player.progressPercent)} · 信号 ${STATUS_LABELS[player.status]} · 净转会 ${formatSignedCompact(priceChangeMovementValue(player))}`,
      );
    });
    if (input.players.length > selected.length) lines.push(`… +${input.players.length - selected.length}`);
  }
  lines.push("", "https://letletme.top/zh-CN/explore/price-changes");
  return lines.join("\n");
}
