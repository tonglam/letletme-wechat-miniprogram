export interface DisplayMetric {
  label: string;
  value: string;
  meta?: string;
  tone?: "default" | "good" | "bad" | "accent";
}

export interface DisplayRow {
  id: string;
  title: string;
  value: string;
  meta?: string;
  description?: string;
  tone?: "default" | "good" | "bad" | "accent";
}

export interface DisplayGroup {
  id: string;
  title: string;
  rows: DisplayRow[];
  emptyText?: string;
}

export type SummaryRecord = Record<string, unknown>;

export function asRecord(value: unknown): SummaryRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SummaryRecord) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function firstValue(record: SummaryRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

export function textValue(value: unknown, fallback = "-"): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return fallback;
  }

  return String(value);
}

export function fieldText(record: SummaryRecord, keys: string[], fallback = "-"): string {
  return textValue(firstValue(record, keys), fallback);
}

export function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function formatRank(value: unknown): string {
  const number = numberValue(value);
  if (number === undefined) {
    return "-";
  }

  return number.toLocaleString();
}

export function formatPoints(value: unknown): string {
  const number = numberValue(value);
  return number === undefined ? "-" : String(number);
}

export function formatCompactNumber(value: unknown): string {
  const number = numberValue(value);
  if (number === undefined) {
    return "-";
  }

  if (Math.abs(number) >= 1000000) {
    return `${trimDecimal(number / 1000000)}m`;
  }

  if (Math.abs(number) >= 1000) {
    return `${trimDecimal(number / 1000)}k`;
  }

  return String(number);
}

export function formatMoney(value: unknown): string {
  const number = numberValue(value);
  if (number === undefined) {
    return "-";
  }

  const normalized = Math.abs(number) >= 100 ? number / 10 : number;
  return `£${normalized.toFixed(1)}m`;
}

export function formatPercent(value: unknown): string {
  const text = textValue(value);
  if (text === "-") {
    return text;
  }

  return text.indexOf("%") >= 0 ? text : `${text}%`;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function compactJoin(parts: Array<string | undefined>): string {
  return parts.filter((part) => part && part !== "-").join(" · ");
}

export function takeRows(value: unknown, limit = 8): SummaryRecord[] {
  return asArray(value)
    .map(asRecord)
    .filter((row) => Object.keys(row).length > 0)
    .slice(0, limit);
}

export function countRows(value: unknown): number {
  return asArray(value).length;
}

export function mapKeyValueRows(value: unknown, prefix: string): DisplayRow[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const row = asRecord(item);
      return {
        id: `${prefix}-${index}`,
        title: fieldText(row, ["key", "name", "webName", "entryName"], String(index + 1)),
        value: fieldText(row, ["value", "times", "totalPoints", "points"], "-")
      };
    });
  }

  const record = asRecord(value);
  return Object.keys(record).map((key) => ({
    id: `${prefix}-${key}`,
    title: key,
    value: textValue(record[key])
  }));
}
