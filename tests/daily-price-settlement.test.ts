import {
  DAILY_PRICE_SYNC_END_MINUTE,
  DAILY_PRICE_SYNC_START_MINUTE,
  formatPricePickerDate,
  getDailyPriceEmptyState,
} from "../miniprogram/utils/daily-price-settlement";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${expected}`);
  }
}

const beforeWindow = new Date("2026-08-28T20:17:00.000Z");

assertEqual(DAILY_PRICE_SYNC_START_MINUTE, 415, "sync starts at 06:55 UTC+8");
assertEqual(DAILY_PRICE_SYNC_END_MINUTE, 425, "sync ends at 07:05 UTC+8");
assertEqual(
  formatPricePickerDate(beforeWindow),
  "2026-08-29",
  "picker uses the backend UTC+8 calendar day",
);

const before = getDailyPriceEmptyState("2026-08-29", beforeWindow);
assertEqual(before.dailySettlementState, "BEFORE_WINDOW", "current date before sync is unsettled");
assertIncludes(before.dailyEmptyDescription, "06:55–07:05", "before-window copy exposes the sync window");

const inWindow = getDailyPriceEmptyState(
  "2026-08-29",
  new Date("2026-08-28T23:00:00.000Z"),
);
assertEqual(inWindow.dailySettlementState, "IN_WINDOW", "current date during sync is updating");

const settled = getDailyPriceEmptyState(
  "2026-08-29",
  new Date("2026-08-28T23:06:00.000Z"),
);
assertEqual(settled.dailySettlementState, "SETTLED", "current date after sync is settled");
assertEqual(settled.dailyEmptyTitle, "2026-08-29 没有球员调价", "settled empty copy remains accurate");

const future = getDailyPriceEmptyState(
  "2026-08-30",
  new Date("2026-08-28T23:06:00.000Z"),
);
assertEqual(future.dailySettlementState, "FUTURE", "future date is not reported as no change");
