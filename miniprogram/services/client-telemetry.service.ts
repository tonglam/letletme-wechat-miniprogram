import {
  getMiniProgramApiBase,
  getMiniProgramEnv,
  REQUEST_TIMEOUT_MS,
} from "../config/env";
import { storageKeys } from "../config/storage-keys";
import { devicePlatform } from "../utils/system-info";

export type ClientTelemetrySurface =
  | "home"
  | "live_matches"
  | "live_match"
  | "live_entry"
  | "price_changes"
  | "my_fpl"
  | "player_stats"
  | "fixtures"
  | "auth"
  | "other";

export type ClientTelemetryMetric =
  | "route_ready_ms"
  | "api_duration_ms"
  | "graphql_proxy_ms"
  | "lcp_ms"
  | "inp_ms"
  | "cls"
  | "availability"
  | "auth_result"
  | "runtime_error"
  | "update_failure"
  | "last_good_age_ms";

export type ClientTelemetryResult =
  | "ok"
  | "error"
  | "timeout"
  | "auth_error"
  | "stale"
  | "unavailable";

export type ClientTelemetrySample = {
  observedAt: string;
  surface: ClientTelemetrySurface;
  metric: ClientTelemetryMetric;
  deviceGroup: "wechat_phone" | "wechat_devtools";
  sampleSource: "real" | "synthetic";
  result: ClientTelemetryResult;
  value?: number;
};

type PendingTelemetryQueue = {
  batchId: string;
  samples: ClientTelemetrySample[];
};

type InFlightTelemetrySlice = {
  batchId: string;
  samples: ClientTelemetrySample[];
};

const MAX_QUEUE_SAMPLES = 100;
const BATCH_SIZE = 50;
const FLUSH_SAMPLE_COUNT = 20;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SAMPLE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SAMPLE_VALUES: Partial<Record<ClientTelemetryMetric, number>> = {
  route_ready_ms: 10_000_000,
  api_duration_ms: 10_000_000,
  graphql_proxy_ms: 10_000_000,
  lcp_ms: 10_000_000,
  inp_ms: 10_000_000,
  cls: 10,
  last_good_age_ms: 24 * 60 * 60 * 1000,
};

const VALID_SURFACES = new Set<ClientTelemetrySurface>([
  "home",
  "live_matches",
  "live_match",
  "live_entry",
  "price_changes",
  "my_fpl",
  "player_stats",
  "fixtures",
  "auth",
  "other",
]);
const VALID_METRICS = new Set<ClientTelemetryMetric>([
  "route_ready_ms",
  "api_duration_ms",
  "graphql_proxy_ms",
  "lcp_ms",
  "inp_ms",
  "cls",
  "availability",
  "auth_result",
  "runtime_error",
  "update_failure",
  "last_good_age_ms",
]);
const VALID_RESULTS = new Set<ClientTelemetryResult>([
  "ok",
  "error",
  "timeout",
  "auth_error",
  "stale",
  "unavailable",
]);

let queue: PendingTelemetryQueue | null = null;
let queueOwner: unknown;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;
let inFlightSlice: InFlightTelemetrySlice | null = null;

function currentEnvironment(): {
  deviceGroup: "wechat_phone" | "wechat_devtools";
  sampleSource: "real" | "synthetic";
} {
  const synthetic = getMiniProgramEnv() === "develop";
  let isDevTools = false;
  try {
    isDevTools = devicePlatform() === "devtools";
  } catch {
    // Node tests and older runtimes default to the real-device bucket.
  }
  return {
    deviceGroup: isDevTools ? "wechat_devtools" : "wechat_phone",
    sampleSource: synthetic ? "synthetic" : "real",
  };
}

function loadQueue(): PendingTelemetryQueue {
  if (queueOwner === wx && queue) return queue;
  queueOwner = wx;
  try {
    const stored = wx.getStorageSync(storageKeys.clientTelemetryQueue) as unknown;
    if (isQueue(stored)) {
      queue = pruneExpiredSamples(stored);
      persistQueue();
      return queue;
    }
  } catch {}
  queue = { batchId: createBatchId(), samples: [] };
  return queue;
}

function isQueue(value: unknown): value is PendingTelemetryQueue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<PendingTelemetryQueue>;
  return typeof candidate.batchId === "string" &&
    isUuid(candidate.batchId) &&
    Array.isArray(candidate.samples) &&
    candidate.samples.every(isSample) &&
    candidate.samples.length <= MAX_QUEUE_SAMPLES;
}

function isSample(value: unknown): value is ClientTelemetrySample {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ClientTelemetrySample>;
  return typeof candidate.observedAt === "string" &&
    Number.isFinite(Date.parse(candidate.observedAt)) &&
    VALID_SURFACES.has(candidate.surface as ClientTelemetrySurface) &&
    VALID_METRICS.has(candidate.metric as ClientTelemetryMetric) &&
    (candidate.deviceGroup === "wechat_phone" || candidate.deviceGroup === "wechat_devtools") &&
    (candidate.sampleSource === "real" || candidate.sampleSource === "synthetic") &&
    VALID_RESULTS.has(candidate.result as ClientTelemetryResult) &&
    (candidate.value === undefined || (
      typeof candidate.value === "number" &&
      Number.isFinite(candidate.value) &&
      candidate.value >= 0 &&
      MAX_SAMPLE_VALUES[candidate.metric as ClientTelemetryMetric] !== undefined &&
      candidate.value <= MAX_SAMPLE_VALUES[candidate.metric as ClientTelemetryMetric]!
    ));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function pruneExpiredSamples(value: PendingTelemetryQueue, now = Date.now()): PendingTelemetryQueue {
  const samples = value.samples.filter((sample) => {
    const timestamp = Date.parse(sample.observedAt);
    return Number.isFinite(timestamp) && timestamp >= now - MAX_SAMPLE_AGE_MS && timestamp <= now + 5 * 60 * 1000;
  });
  if (samples.length === value.samples.length) return value;
  return {
    batchId: samples.length > 0 ? value.batchId : createBatchId(),
    samples,
  };
}

function persistQueue(): void {
  if (!queue) return;
  try {
    wx.setStorageSync(storageKeys.clientTelemetryQueue, queue);
  } catch {
    // Telemetry is best effort and must never affect the product path.
  }
}

function createBatchId(): string {
  const randomHex = (length: number): string => {
    let value = "";
    while (value.length < length) value += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
    return value.slice(0, length);
  };
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-8${randomHex(3)}-${randomHex(12)}`;
}

function scheduleFlush(): void {
  if (flushTimer || !queue?.samples.length) return;
  const timer = setTimeout(() => {
    flushTimer = null;
    void flushClientTelemetry();
  }, FLUSH_INTERVAL_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  flushTimer = timer;
}

function shouldSample(result: ClientTelemetryResult): boolean {
  return result !== "ok" || Math.random() < 0.25;
}

export function enqueueClientTelemetry(
  sample: Omit<ClientTelemetrySample, "observedAt" | "deviceGroup" | "sampleSource"> & {
    observedAt?: string;
    deviceGroup?: ClientTelemetrySample["deviceGroup"];
    sampleSource?: ClientTelemetrySample["sampleSource"];
  },
): void {
  if (!shouldSample(sample.result)) return;
  if (
    sample.value !== undefined &&
    (!Number.isFinite(sample.value) ||
      sample.value < 0 ||
      MAX_SAMPLE_VALUES[sample.metric] === undefined ||
      sample.value > MAX_SAMPLE_VALUES[sample.metric]!)
  ) return;
  const environment = currentEnvironment();
  const target = loadQueue();
  const normalized: ClientTelemetrySample = {
    observedAt: sample.observedAt ?? new Date().toISOString(),
    surface: sample.surface,
    metric: sample.metric,
    deviceGroup: sample.deviceGroup ?? environment.deviceGroup,
    sampleSource: sample.sampleSource ?? environment.sampleSource,
    result: sample.result,
    ...(sample.value === undefined ? {} : { value: sample.value }),
  };
  target.samples.push(normalized);
  if (target.samples.length > MAX_QUEUE_SAMPLES) {
    const protectedSamples =
      inFlightSlice?.batchId === target.batchId
        ? new Set(inFlightSlice.samples)
        : null;
    while (target.samples.length > MAX_QUEUE_SAMPLES) {
      const evictionIndex = target.samples.findIndex(
        (candidate) => !protectedSamples?.has(candidate),
      );
      if (evictionIndex < 0) break;
      target.samples.splice(evictionIndex, 1);
    }
  }
  persistQueue();
  if (target.samples.length >= FLUSH_SAMPLE_COUNT) {
    void flushClientTelemetry();
  } else {
    scheduleFlush();
  }
}

function sendBatch(batch: PendingTelemetryQueue, samples: ClientTelemetrySample[]): Promise<boolean> {
  const payload = {
    schemaVersion: 1 as const,
    batchId: batch.batchId,
    client: "wechat_miniprogram" as const,
    release: `miniprogram-${getMiniProgramEnv()}`,
    sentAt: new Date().toISOString(),
    samples,
  };
  return new Promise((resolve) => {
    try {
      wx.request<{ accepted?: boolean }>({
        url: `${getMiniProgramApiBase()}/telemetry`,
        method: "POST",
        data: payload,
        header: { "content-type": "application/json" },
        timeout: REQUEST_TIMEOUT_MS,
        success: (response) => {
          resolve(response.statusCode >= 200 && response.statusCode < 300 && response.data?.accepted === true);
        },
        fail: () => resolve(false),
      });
    } catch {
      resolve(false);
    }
  });
}

export async function flushClientTelemetry(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (flushInFlight) {
    await flushInFlight;
    return;
  }
  const pending = pruneExpiredSamples(loadQueue());
  queue = pending;
  persistQueue();
  if (!pending.samples.length) return;
  const samples = pending.samples.slice(0, BATCH_SIZE);
  const run = (async () => {
    // Keep the sent objects protected until the acknowledgement arrives. New
    // samples may be appended while the request is in flight, and queue cap
    // eviction must never remove an unacknowledged sample.
    inFlightSlice = { batchId: pending.batchId, samples };
    let delivered = false;
    try {
      delivered = await sendBatch(pending, samples);
    } catch {
      delivered = false;
    }
    const current = loadQueue();
    if (delivered && current.batchId === pending.batchId) {
      const acknowledged = new Set(samples);
      current.samples = current.samples.filter(
        (candidate) => !acknowledged.has(candidate),
      );
      // A new slice is a new idempotency unit. Retain the old batchId only
      // while retrying this exact unacknowledged slice.
      current.batchId = createBatchId();
      persistQueue();
    }
    inFlightSlice = null;
    if (current.samples.length) scheduleFlush();
  })();
  flushInFlight = run;
  await run;
  if (flushInFlight === run) flushInFlight = null;
}

export function recordClientRuntimeError(): void {
  enqueueClientTelemetry({ surface: "other", metric: "runtime_error", result: "error" });
}

export function recordClientUpdateFailure(): void {
  enqueueClientTelemetry({ surface: "other", metric: "update_failure", result: "error" });
}

export function recordClientAuthResult(result: "ok" | "auth_error" | "timeout" | "error"): void {
  enqueueClientTelemetry({ surface: "auth", metric: "auth_result", result });
}

export function recordLastGoodAge(ageMs: number): void {
  enqueueClientTelemetry({
    surface: "price_changes",
    metric: "last_good_age_ms",
    result: "stale",
    value: ageMs,
  });
}
