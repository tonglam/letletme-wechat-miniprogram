const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The FPL price-change sync window, expressed in Asia/Shanghai time. */
export const DAILY_PRICE_SYNC_START_MINUTE = 6 * 60 + 55;
export const DAILY_PRICE_SYNC_END_MINUTE = 7 * 60 + 5;

export type DailyPriceSettlementState =
  | "BEFORE_WINDOW"
  | "IN_WINDOW"
  | "SETTLED"
  | "FUTURE";

export interface DailyPriceEmptyState {
  dailySettlementState: DailyPriceSettlementState;
  dailyEmptyEyebrow: string;
  dailyEmptyTitle: string;
  dailyEmptyDescription: string;
}

interface Utc8Parts {
  dateKey: string;
  minuteOfDay: number;
}

function getUtc8Parts(date: Date): Utc8Parts {
  const shifted = new Date(date.getTime() + UTC8_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return {
    dateKey: `${year}-${month}-${day}`,
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Keep the picker date aligned with the backend's Asia/Shanghai calendar day. */
export function formatPricePickerDate(date = new Date()): string {
  return getUtc8Parts(date).dateKey;
}

export function getDailyPriceEmptyState(
  changeDate: string,
  now = new Date(),
): DailyPriceEmptyState {
  const current = getUtc8Parts(now);

  if (changeDate > current.dateKey) {
    return {
      dailySettlementState: "FUTURE",
      dailyEmptyEyebrow: "尚未到调价日期",
      dailyEmptyTitle: `${changeDate} 尚未开始`,
      dailyEmptyDescription: "选择今天或历史日期查看已经结算的实际调价。",
    };
  }

  if (changeDate === current.dateKey) {
    if (current.minuteOfDay < DAILY_PRICE_SYNC_START_MINUTE) {
      return {
        dailySettlementState: "BEFORE_WINDOW",
        dailyEmptyEyebrow: "今日调价尚未结算",
        dailyEmptyTitle: `${changeDate} 调价尚未开始`,
        dailyEmptyDescription:
          "每日 06:55–07:05（UTC+8）同步，结算后会显示实际涨跌。",
      };
    }

    if (current.minuteOfDay <= DAILY_PRICE_SYNC_END_MINUTE) {
      return {
        dailySettlementState: "IN_WINDOW",
        dailyEmptyEyebrow: "今日调价同步中",
        dailyEmptyTitle: `${changeDate} 调价数据正在更新`,
        dailyEmptyDescription:
          "调价窗口完成后重新加载，系统会显示当日实际涨跌。",
      };
    }
  }

  return {
    dailySettlementState: "SETTLED",
    dailyEmptyEyebrow: "当日无变动",
    dailyEmptyTitle: `${changeDate} 没有球员调价`,
    dailyEmptyDescription: "这是正常情况；有新的涨跌时会显示在这里。",
  };
}
