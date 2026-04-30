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
