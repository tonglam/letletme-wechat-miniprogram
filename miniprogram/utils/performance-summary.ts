import type { PagePerformanceRecord } from "./perf";

/** Convert runtime timings into finite, non-negative millisecond values. */
export function finiteDuration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value);
}

export function formatDuration(value: unknown): string {
  const duration = finiteDuration(value);
  return duration === null ? "--" : `${duration}ms`;
}

/** Nearest-rank percentile over valid duration samples only. */
export function nearestRankDuration(
  values: readonly unknown[],
  quantile: number,
  minimumSamples = 1
): number | null {
  const ordered = values
    .map(finiteDuration)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (ordered.length < minimumSamples) return null;
  const boundedQuantile = Math.min(1, Math.max(0, quantile));
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * boundedQuantile) - 1)
  );
  return ordered[index];
}

/**
 * Resolve the first cold page's route-to-primary-visible duration. The page
 * tracker is the product boundary; invalid native render entries must never
 * become `NaNms` or participate in the score.
 */
export function firstContentVisibleDuration(
  records: readonly PagePerformanceRecord[]
): number | null {
  const candidates = records
    .filter((record) => record.trigger === "cold-launch")
    .map((record) => {
      const startedAt = finiteDuration(record.routeStartedAt);
      const visibleAt = finiteDuration(record.primaryViewportVisibleAt);
      if (startedAt === null || visibleAt === null || visibleAt < startedAt) {
        return null;
      }
      return {
        duration: Math.round(visibleAt - startedAt),
        timestamp: finiteDuration(record.ts) ?? Number.MAX_SAFE_INTEGER
      };
    })
    .filter((candidate): candidate is { duration: number; timestamp: number } => (
      candidate !== null
    ))
    .sort((left, right) => left.timestamp - right.timestamp);

  return candidates[0]?.duration ?? null;
}
