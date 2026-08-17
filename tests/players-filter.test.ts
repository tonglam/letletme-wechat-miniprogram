import { dataPlayersMockData } from "../miniprogram/mocks/data-players.mock";
import {
  applyPlayerDirectoryFilters,
  defaultSortDir,
  resolvePlayerPickerSort,
  toggleSortDir
} from "../miniprogram/pages/data/players/directory-filter";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

assertEqual(resolvePlayerPickerSort("PRICE", "ASC"), "PRICE_ASC", "price asc uses backend enum");
assertEqual(resolvePlayerPickerSort("PRICE", "DESC"), "PRICE_DESC", "price desc uses backend enum");
assertEqual(resolvePlayerPickerSort("TOTAL_POINTS", "DESC"), "TOTAL_POINTS_DESC", "points desc native");
assertEqual(resolvePlayerPickerSort("TOTAL_POINTS", "ASC"), "TOTAL_POINTS_DESC", "points asc falls back to native");
assertEqual(defaultSortDir("NAME"), "ASC", "name defaults to asc");
assertEqual(defaultSortDir("PRICE"), "DESC", "price defaults to desc");
assertEqual(toggleSortDir("DESC"), "ASC", "toggle desc");
assertEqual(toggleSortDir("ASC"), "DESC", "toggle asc");

const query = {
  keyword: "",
  teamFilter: "ALL",
  positionFilter: "ALL",
  maxPrice: null as number | null,
  ownBand: "ALL",
  sortField: "TOTAL_POINTS" as const,
  sortDir: "DESC" as const
};

const byPointsDesc = applyPlayerDirectoryFilters(dataPlayersMockData.players, query);
assertEqual(byPointsDesc[0].name, "Haaland", "default sort is season points desc");

const byPointsAsc = applyPlayerDirectoryFilters(dataPlayersMockData.players, { ...query, sortDir: "ASC" });
assertEqual(byPointsAsc[0].name, "Rogers", "points asc is not a second option, it flips the same field");

const byPriceAsc = applyPlayerDirectoryFilters(dataPlayersMockData.players, {
  ...query,
  sortField: "PRICE",
  sortDir: "ASC"
});
assertEqual(byPriceAsc[0].name, "Rogers", "price asc");

const chelse = applyPlayerDirectoryFilters(dataPlayersMockData.players, { ...query, teamFilter: "6" });
assertEqual(chelse.length, 1, "chelsea team id matches mock directory");
assertEqual(chelse[0].name, "Palmer", "chelsea filter returns palmer");

const keepers = applyPlayerDirectoryFilters(dataPlayersMockData.players, {
  ...query,
  positionFilter: "GOALKEEPER"
});
assertEqual(keepers.map((player) => player.name).join(","), "Raya", "position filter");

const cheap = applyPlayerDirectoryFilters(dataPlayersMockData.players, { ...query, maxPrice: 60 });
assertEqual(cheap.every((player) => (player.price || 0) <= 6), true, "max price tenths");

const lowOwn = applyPlayerDirectoryFilters(dataPlayersMockData.players, { ...query, ownBand: "LE5" });
assertEqual(lowOwn.map((player) => player.name).join(","), "Rogers", "ownership band");

const named = applyPlayerDirectoryFilters(dataPlayersMockData.players, { ...query, keyword: "saka" });
assertEqual(named.map((player) => player.name).join(","), "Saka", "keyword search");
assertEqual(
  applyPlayerDirectoryFilters(dataPlayersMockData.players, {
    ...query,
    keyword: "saka",
    teamFilter: "6"
  }).map((player) => player.name).join(","),
  "Saka",
  "keyword search ignores team filter"
);

console.log("players-filter tests passed");
