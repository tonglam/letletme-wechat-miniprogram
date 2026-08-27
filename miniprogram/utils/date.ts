const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatDeadline(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const showYear = date.getFullYear() !== now.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAYS[date.getDay()];
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  if (showYear) {
    return `${date.getFullYear()}年${month}月${day}日 ${weekday} ${hours}:${minutes}`;
  }
  return `${month}月${day}日 ${weekday} ${hours}:${minutes}`;
}

export function formatDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * "8月27日 14:32" — compact local datetime for 更新于 capture labels. This is
 * the mini counterpart of the web's LocalUpdatedLabel (medium date + time in
 * the viewer's timezone); returns "" for missing/unparseable values so the
 * caller can fall back to descriptive copy.
 */
export function formatLocalCapturedAt(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "2026-08-27" → "8月27日" — calendar-day label for date-only fallbacks. */
export function formatCalendarDayLabel(value?: string | null): string {
  const raw = String(value || "").slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${Number(match[2])}月${Number(match[3])}日`;
}

export interface CountdownParts {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

export function getDeadlineDiffMs(value: string): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return Math.max(date.getTime() - Date.now(), 0);
}

export function formatCountdown(ms: number): CountdownParts {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: String(days),
    hours: pad(hours),
    minutes: pad(minutes),
    seconds: pad(seconds)
  };
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
