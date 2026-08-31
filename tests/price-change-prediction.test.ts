import type { PriceChangePlayer } from "../miniprogram/models/price-change";
import { mapHomePredictionRows } from "../miniprogram/services/home.service";
import {
  buildPersonalPurchasePrices,
  buildPriceChangeViewRow,
  calculateSellingPrice,
  DEFAULT_PRICE_CHANGE_SORT,
  filterPriceChangePlayers,
  formatPriceChangeShareText,
  sortPriceChangePlayers,
} from "../miniprogram/utils/price-change";

const assert = {
  equal(actual: unknown, expected: unknown): void {
    if (actual !== expected) {
      throw new Error(`expected ${String(expected)}, received ${String(actual)}`);
    }
  },
  deepEqual(actual: unknown, expected: unknown): void {
    const actualText = JSON.stringify(actual);
    const expectedText = JSON.stringify(expected);
    if (actualText !== expectedText) {
      throw new Error(`expected ${expectedText}, received ${actualText}`);
    }
  },
  match(actual: string, expected: RegExp): void {
    if (!expected.test(actual)) {
      throw new Error(`expected ${JSON.stringify(actual)} to match ${String(expected)}`);
    }
  },
};

function scenario(_name: string, run: () => void): void {
  run();
}

function player(
  playerId: number,
  overrides: Partial<PriceChangePlayer> = {},
): PriceChangePlayer {
  return {
    playerId,
    playerCode: 10_000 + playerId,
    webName: `Player ${playerId}`,
    teamId: playerId,
    teamName: `Team ${playerId}`,
    teamShortName: `T${playerId}`,
    position: "MID",
    currentPrice: 75,
    selectedByPercent: 12.3,
    progressPercent: 0,
    hourlyRate: 0,
    status: "UNLIKELY",
    ownershipTrend: "FLAT",
    transfersInEvent: 0,
    transfersOutEvent: 0,
    lockedUntil: null,
    calibrating: false,
    ...overrides,
  };
}

scenario("price change prediction parity", () => {
  scenario("keeps total signal counts separate from capped home teaser rows", () => {
    const board = [
      player(1, { status: "VERY_LIKELY_RISE", progressPercent: 131 }),
      player(2, { status: "VERY_LIKELY_FALL", progressPercent: -175 }),
      player(3, { status: "VERY_LIKELY_FALL", progressPercent: -150 }),
      player(4, { status: "LIKELY_FALL", progressPercent: -120 }),
      player(5, { status: "VERY_LIKELY_FALL", progressPercent: -110 }),
      player(6, { status: "VERY_LIKELY_FALL", progressPercent: -105 }),
      player(7, { status: "VERY_LIKELY_FALL", progressPercent: -100 }),
    ];
    const rows = mapHomePredictionRows({ players: board });
    assert.equal(rows.riseCount, 1);
    assert.equal(rows.fallCount, 6);
    assert.equal(rows.rises.length, 1);
    assert.equal(rows.falls.length, 5);
    assert.equal(rows.allRises.length, 1);
    assert.equal(rows.allFalls.length, 6);
  });

  scenario("prioritizes likely squad players in the default web sort", () => {
    const players = [
      player(4, { progressPercent: 98 }),
      player(3, { status: "LIKELY_RISE", progressPercent: 30 }),
      player(2, { status: "LIKELY_FALL", progressPercent: -80 }),
      player(1, { status: "VERY_LIKELY_RISE", progressPercent: 20 }),
    ];
    const sorted = sortPriceChangePlayers(players, {
      sort: DEFAULT_PRICE_CHANGE_SORT,
      squadElementIds: new Set([3]),
    });
    assert.deepEqual(sorted.map((item) => item.playerId), [3, 2, 1, 4]);
    assert.deepEqual(players.map((item) => item.playerId), [4, 3, 2, 1]);
  });

  scenario("combines squad, team, movement and text filters", () => {
    const players = [
      player(1, { webName: "Saka", teamId: 5, teamName: "Arsenal", teamShortName: "ARS", progressPercent: 76 }),
      player(2, { webName: "Saliba", teamId: 5, teamName: "Arsenal", teamShortName: "ARS", progressPercent: -32 }),
      player(3, { webName: "Palmer", teamId: 7, teamName: "Chelsea", teamShortName: "CHE", progressPercent: 80 }),
    ];
    const filtered = filterPriceChangePlayers(players, {
      search: "ars",
      movement: "rise",
      scope: "mine",
      teamId: "5",
      squadElementIds: new Set([1, 3]),
    });
    assert.deepEqual(filtered.map((item) => item.playerId), [1]);
  });

  scenario("groups locked and calibrating players under the locked filter", () => {
    const filtered = filterPriceChangePlayers([
      player(1, { status: "LOCKED" }),
      player(2, { status: "CALIBRATING" }),
      player(3, { status: "UNLIKELY" }),
    ], {
      search: "",
      movement: "locked",
      scope: "all",
      teamId: "all",
    });
    assert.deepEqual(filtered.map((item) => item.playerId), [1, 2]);
  });

  scenario("uses FPL half-profit selling prices and sorts personal columns", () => {
    assert.equal(calculateSellingPrice(60, 80), 70);
    assert.equal(calculateSellingPrice(70, 80), 75);
    assert.equal(calculateSellingPrice(80, 70), 70);
    const sorted = sortPriceChangePlayers([
      player(1, { currentPrice: 80 }),
      player(2, { currentPrice: 80 }),
    ], {
      sort: { column: "sellingPrice", direction: "desc" },
      purchasePrices: { "1": 60, "2": 70 },
    });
    assert.deepEqual(sorted.map((item) => item.playerId), [2, 1]);
  });

  scenario("uses canonical transfer player IDs and ignores free-hit prices", () => {
    const transfers = [{
      eventId: 2,
      elementIn: 9,
      elementInCost: 52,
      time: "2026-08-20T10:00:00Z",
    }];
    const freeHit = buildPersonalPurchasePrices({
      selectedEventId: 2,
      squadElementIds: [9],
      startPrices: { "9": 50 },
      transfers,
      historyChips: { "2": "FREE_HIT" },
    });
    assert.deepEqual(freeHit, { state: "UNAVAILABLE", purchasePrices: {} });

    const restoredSquad = buildPersonalPurchasePrices({
      selectedEventId: 3,
      squadElementIds: [9],
      startPrices: { "9": 50 },
      transfers,
      historyChips: { "2": "FREE_HIT" },
    });
    assert.deepEqual(restoredSquad, { state: "READY", purchasePrices: { "9": 50 } });
  });

  scenario("marks incomplete personal price coverage as partial", () => {
    const prices = buildPersonalPurchasePrices({
      selectedEventId: 2,
      squadElementIds: [1, 2],
      startPrices: { "1": 60 },
      transfers: [],
    });
    assert.deepEqual(prices, { state: "PARTIAL", purchasePrices: { "1": 60 } });
  });

  scenario("builds a mobile row and share text from the same active result", () => {
    const source = player(1, {
      webName: "Example",
      teamShortName: "EXM",
      teamName: "Example FC",
      currentPrice: 75,
      progressPercent: 81.2,
      hourlyRate: 1.2,
      status: "LIKELY_RISE",
      ownershipTrend: "UP",
      transfersInEvent: 1_200,
      transfersOutEvent: 200,
    });
    const row = buildPriceChangeViewRow(source, {
      showPersonalPrices: true,
      purchasePrices: { "1": 65 },
    });
    assert.equal(row.progressText, "+81.2%");
    assert.equal(row.purchasePriceText, "£6.5m");
    assert.equal(row.sellingPriceText, "£7.0m");
    assert.equal(row.netTransfersText, "+1k");
    const text = formatPriceChangeShareText({
      players: [source],
      scopeLabel: "我的阵容",
      deadlineLabel: "8月23日 周日 18:00",
    });
    assert.match(text, /身价预测 · 我的阵容/);
    assert.match(text, /Example EXM · £7\.5m · 进度 \+81\.2%/);
    assert.match(text, /净转会 \+1k/);
    assert.match(text, /explore\/price-changes/);
  });
});
