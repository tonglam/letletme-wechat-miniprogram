import { formatRank } from "../miniprogram/utils/summary-format";

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `assertion failed: ${message} (expected ${String(expected)}, got ${String(actual)})`,
    );
  }
}

// formatRank mirrors the web's zh-CN compact rank notation
// (format.number(rank, { notation: "compact" })).
equal(formatRank(1), "1", "single digit stays plain");
equal(formatRank(999), "999", "hundreds stay plain");
equal(formatRank(1234), "1234", "thousands stay plain");
equal(formatRank(9999), "9999", "just below 万 stays plain");
equal(formatRank(10000), "1万", "万 boundary compacts");
equal(formatRank(12345), "1.2万", "five digits keep one decimal");
equal(formatRank(99999), "10万", "decimal rounds across the 10万 boundary");
equal(formatRank(123456), "12万", "six digits drop the decimal");
equal(formatRank(1234567), "123万", "millions render as 万");
equal(formatRank(12345678), "1235万", "eight digits render as 万");
equal(formatRank("1234567"), "123万", "numeric strings coerce");
equal(formatRank(0), "-", "zero rank is unknown");
equal(formatRank(-5), "-", "negative rank is unknown");
equal(formatRank(undefined), "-", "missing rank falls back");
equal(formatRank(null), "-", "null rank falls back");
equal(formatRank("abc"), "-", "non-numeric falls back");

console.log("summary-format tests passed");
