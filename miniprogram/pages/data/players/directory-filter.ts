import type { PlayerOption } from "../../../models/player";
import type { PlayerPickerSort } from "../../../services/player.service";

export const ALL_VALUE = "ALL";

export type PlayerSortField = "TOTAL_POINTS" | "FORM" | "PRICE" | "OWNERSHIP" | "NAME";
export type PlayerSortDir = "ASC" | "DESC";

export interface PlayerFilterOption {
  label: string;
  value: string;
}

export interface PlayerSortFieldOption {
  label: string;
  value: PlayerSortField;
}

export const POSITION_OPTIONS: PlayerFilterOption[] = [
  { label: "全部位置", value: ALL_VALUE },
  { label: "GKP", value: "GOALKEEPER" },
  { label: "DEF", value: "DEFENDER" },
  { label: "MID", value: "MIDFIELDER" },
  { label: "FWD", value: "FORWARD" }
];

export const SORT_FIELD_OPTIONS: PlayerSortFieldOption[] = [
  { label: "赛季总分", value: "TOTAL_POINTS" },
  { label: "状态", value: "FORM" },
  { label: "价格", value: "PRICE" },
  { label: "持有率", value: "OWNERSHIP" },
  { label: "姓名", value: "NAME" }
];

export const MAX_PRICE_OPTIONS: PlayerFilterOption[] = [
  { label: "不限", value: ALL_VALUE },
  ...Array.from({ length: 24 }, (_, index) => {
    const tenths = 40 + index * 5;
    return { label: `≤£${(tenths / 10).toFixed(1)}m`, value: String(tenths) };
  })
];

export const OWN_BAND_OPTIONS: PlayerFilterOption[] = [
  { label: "全部", value: ALL_VALUE },
  { label: "≤5%", value: "LE5" },
  { label: "5–15%", value: "GT5_LE15" },
  { label: "15–40%", value: "GT15_LE40" },
  { label: "≥40%", value: "GT40" }
];

const POSITION_SHORT: Record<string, string> = {
  GOALKEEPER: "GKP",
  DEFENDER: "DEF",
  MIDFIELDER: "MID",
  FORWARD: "FWD"
};

const NATIVE_SORT: Record<PlayerSortField, Partial<Record<PlayerSortDir, PlayerPickerSort>>> = {
  TOTAL_POINTS: { DESC: "TOTAL_POINTS_DESC" },
  FORM: { DESC: "FORM_DESC" },
  PRICE: { ASC: "PRICE_ASC", DESC: "PRICE_DESC" },
  OWNERSHIP: { DESC: "OWNERSHIP_DESC" },
  NAME: { ASC: "NAME_ASC" }
};

export function defaultSortDir(field: PlayerSortField): PlayerSortDir {
  return field === "NAME" ? "ASC" : "DESC";
}

export function resolvePlayerPickerSort(field: PlayerSortField, dir: PlayerSortDir): PlayerPickerSort {
  return NATIVE_SORT[field][dir]
    || NATIVE_SORT[field][defaultSortDir(field)]
    || "TOTAL_POINTS_DESC";
}

export function toggleSortDir(dir: PlayerSortDir): PlayerSortDir {
  return dir === "DESC" ? "ASC" : "DESC";
}

export interface PlayerDirectoryQuery {
  keyword: string;
  teamFilter: string;
  positionFilter: string;
  maxPrice: number | null;
  ownBand: string;
  sortField: PlayerSortField;
  sortDir: PlayerSortDir;
}

function teamIdOf(player: PlayerOption): string {
  const record = player as PlayerOption & { teamId?: number | string };
  return record.teamId == null ? "" : String(record.teamId);
}

function matchesOwnBand(own: number, band: string): boolean {
  if (band === "LE5") return own <= 5;
  if (band === "GT5_LE15") return own > 5 && own <= 15;
  if (band === "GT15_LE40") return own > 15 && own <= 40;
  if (band === "GT40") return own > 40;
  return true;
}

function sortValue(player: PlayerOption, field: PlayerSortField): number | string {
  if (field === "NAME") return player.name || "";
  if (field === "FORM") return Number(player.form) || 0;
  if (field === "PRICE") return Number(player.price) || 0;
  if (field === "OWNERSHIP") return Number(player.selectedByPercent) || 0;
  return Number(player.totalPoints) || 0;
}

export function sortPlayerOptions(
  players: PlayerOption[],
  field: PlayerSortField,
  dir: PlayerSortDir
): PlayerOption[] {
  const sign = dir === "ASC" ? 1 : -1;
  return players.slice().sort((left, right) => {
    const leftValue = sortValue(left, field);
    const rightValue = sortValue(right, field);
    if (typeof leftValue === "string" || typeof rightValue === "string") {
      const compared = String(leftValue).localeCompare(String(rightValue), "en");
      return compared === 0 ? 0 : compared * sign;
    }
    const delta = leftValue - rightValue;
    if (delta !== 0) return delta * sign;
    return (left.name || "").localeCompare(right.name || "", "en");
  });
}

export function applyPlayerDirectoryFilters(
  players: PlayerOption[],
  query: PlayerDirectoryQuery
): PlayerOption[] {
  const keyword = query.keyword.trim().toLowerCase();
  let items = players.slice();
  if (keyword) {
    items = items.filter((player) =>
      `${player.name} ${player.team || ""} ${player.teamName || ""}`.toLowerCase().includes(keyword)
    );
  } else {
    if (query.teamFilter !== ALL_VALUE) {
      items = items.filter((player) => teamIdOf(player) === query.teamFilter);
    }
    if (query.positionFilter !== ALL_VALUE) {
      const short = POSITION_SHORT[query.positionFilter] || query.positionFilter;
      items = items.filter((player) => player.position === short);
    }
    if (query.maxPrice !== null) {
      const maxPrice = query.maxPrice;
      items = items.filter((player) => Math.round((Number(player.price) || 0) * 10) <= maxPrice);
    }
    if (query.ownBand !== ALL_VALUE) {
      items = items.filter((player) => matchesOwnBand(Number(player.selectedByPercent) || 0, query.ownBand));
    }
  }
  return sortPlayerOptions(items, query.sortField, query.sortDir);
}
