import {
  getMiniProgramApiBase,
  getMiniProgramEnv,
  REQUEST_TIMEOUT_MS,
} from "../config/env";
import { storageKeys } from "../config/storage-keys";
import { miniClientRelease } from "../config/build-provenance";
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
  "ok" | "error" | "timeout" | "auth_error" | "stale" | "unavailable";

export type ClientTelemetryReasonCode =
  | "none"
  | "auth"
  | "validation"
  | "rate_limit"
  | "client_abort"
  | "upstream_timeout"
  | "connection"
  | "unavailable"
  | "unknown";

export type ClientTelemetryMeasurementKind =
  | "initial_navigation"
  | "in_page_navigation"
  | "interaction"
  | "background_resume"
  | "missing_start"
  | "request";

export type ClientTelemetrySample = {
  observedAt: string;
  surface: ClientTelemetrySurface;
  metric: ClientTelemetryMetric;
  deviceGroup: "wechat_phone" | "wechat_devtools";
  sampleSource: "real" | "synthetic";
  result: ClientTelemetryResult;
  reasonCode: ClientTelemetryReasonCode;
  measurementKind: ClientTelemetryMeasurementKind;
  samplingProbability: number;
  errorClass?: string;
  fingerprint?: string;
  occurrenceCount?: number;
  firstObservedAt?: string;
  lastObservedAt?: string;
  value?: number;
};

type PendingTelemetryQueue = {
  batchId: string;
  /** Keep a queued slice attributed to the build that produced it. */
  clientRelease: string;
  samples: ClientTelemetrySample[];
};

type InFlightTelemetrySlice = {
  batchId: string;
  samples: ClientTelemetrySample[];
};

type PendingTelemetryStorage = {
  schemaVersion: 2;
  queues: PendingTelemetryQueue[];
};

const MAX_QUEUE_SAMPLES = 100;
const BATCH_SIZE = 50;
const FLUSH_SAMPLE_COUNT = 20;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SAMPLE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_OCCURRENCE_COUNT = 1000;
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
const VALID_REASON_CODES = new Set<ClientTelemetryReasonCode>([
  "none",
  "auth",
  "validation",
  "rate_limit",
  "client_abort",
  "upstream_timeout",
  "connection",
  "unavailable",
  "unknown",
]);
const VALID_MEASUREMENT_KINDS = new Set<ClientTelemetryMeasurementKind>([
  "initial_navigation",
  "in_page_navigation",
  "interaction",
  "background_resume",
  "missing_start",
  "request",
]);
const MAX_RUNTIME_ERROR_FINGERPRINTS = 32;
const RUNTIME_ERROR_WINDOW_MS = 60_000;
const seenRuntimeErrorObjects = new WeakSet<object>();
const runtimeErrorFingerprints = new Map<string, number>();

let queue: PendingTelemetryQueue | null = null;
let queues: PendingTelemetryQueue[] = [];
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
    const stored = wx.getStorageSync(
      storageKeys.clientTelemetryQueue,
    ) as unknown;
    const storedQueues = isTelemetryStorage(stored)
      ? stored.queues
      : isQueue(stored)
        ? [stored]
        : [];
    queues = storedQueues
      .map((candidate) => pruneExpiredSamples(candidate))
      .filter((candidate) => candidate.samples.length > 0);
    const currentRelease = miniClientRelease();
    queue = queues.find(
      (candidate) => candidate.clientRelease === currentRelease,
    ) ?? {
      batchId: createBatchId(),
      clientRelease: currentRelease,
      samples: [],
    };
    if (!queues.includes(queue)) queues.push(queue);
    persistQueue();
    return queue;
  } catch {}
  queues = [];
  queue = {
    batchId: createBatchId(),
    clientRelease: miniClientRelease(),
    samples: [],
  };
  queues.push(queue);
  return queue;
}

function isTelemetryStorage(value: unknown): value is PendingTelemetryStorage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<PendingTelemetryStorage>;
  return (
    candidate.schemaVersion === 2 &&
    Array.isArray(candidate.queues) &&
    candidate.queues.every(isQueue)
  );
}

function isQueue(value: unknown): value is PendingTelemetryQueue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<PendingTelemetryQueue>;
  return (
    typeof candidate.batchId === "string" &&
    isUuid(candidate.batchId) &&
    typeof candidate.clientRelease === "string" &&
    isSafeDimension(candidate.clientRelease, 128) &&
    Array.isArray(candidate.samples) &&
    candidate.samples.every(isSample) &&
    candidate.samples.length <= MAX_QUEUE_SAMPLES
  );
}

function isSample(value: unknown): value is ClientTelemetrySample {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allowedKeys = new Set([
    "observedAt",
    "surface",
    "metric",
    "deviceGroup",
    "sampleSource",
    "result",
    "reasonCode",
    "measurementKind",
    "samplingProbability",
    "errorClass",
    "fingerprint",
    "occurrenceCount",
    "firstObservedAt",
    "lastObservedAt",
    "value",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  const candidate = value as Partial<ClientTelemetrySample>;
  return (
    typeof candidate.observedAt === "string" &&
    Number.isFinite(Date.parse(candidate.observedAt)) &&
    VALID_SURFACES.has(candidate.surface as ClientTelemetrySurface) &&
    VALID_METRICS.has(candidate.metric as ClientTelemetryMetric) &&
    (candidate.deviceGroup === "wechat_phone" ||
      candidate.deviceGroup === "wechat_devtools") &&
    (candidate.sampleSource === "real" ||
      candidate.sampleSource === "synthetic") &&
    VALID_RESULTS.has(candidate.result as ClientTelemetryResult) &&
    VALID_REASON_CODES.has(candidate.reasonCode as ClientTelemetryReasonCode) &&
    VALID_MEASUREMENT_KINDS.has(
      candidate.measurementKind as ClientTelemetryMeasurementKind,
    ) &&
    typeof candidate.samplingProbability === "number" &&
    Number.isFinite(candidate.samplingProbability) &&
    candidate.samplingProbability >= 0.0001 &&
    candidate.samplingProbability <= 1 &&
    (candidate.errorClass === undefined ||
      isSafeDimension(candidate.errorClass, 64)) &&
    (candidate.fingerprint === undefined ||
      isSafeDimension(candidate.fingerprint, 128)) &&
    (candidate.metric === "runtime_error" ||
      (candidate.errorClass === undefined &&
        candidate.fingerprint === undefined &&
        candidate.occurrenceCount === undefined &&
        candidate.firstObservedAt === undefined &&
        candidate.lastObservedAt === undefined)) &&
    (candidate.occurrenceCount === undefined ||
      (Number.isInteger(candidate.occurrenceCount) &&
        candidate.occurrenceCount >= 1 &&
        candidate.occurrenceCount <= 1000)) &&
    (candidate.firstObservedAt === undefined ||
      validTimestamp(candidate.firstObservedAt)) &&
    (candidate.lastObservedAt === undefined ||
      validTimestamp(candidate.lastObservedAt)) &&
    (candidate.firstObservedAt === undefined ||
      candidate.lastObservedAt === undefined ||
      Date.parse(candidate.firstObservedAt) <=
        Date.parse(candidate.lastObservedAt)) &&
    (candidate.value === undefined ||
      (typeof candidate.value === "number" &&
        Number.isFinite(candidate.value) &&
        candidate.value >= 0 &&
        MAX_SAMPLE_VALUES[candidate.metric as ClientTelemetryMetric] !==
          undefined &&
        candidate.value <=
          MAX_SAMPLE_VALUES[candidate.metric as ClientTelemetryMetric]!))
  );
}

function isSafeDimension(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function pruneExpiredSamples(
  value: PendingTelemetryQueue,
  now = Date.now(),
): PendingTelemetryQueue {
  const samples = value.samples.filter((sample) => {
    const timestamp = Date.parse(sample.observedAt);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= now - MAX_SAMPLE_AGE_MS &&
      timestamp <= now + 5 * 60 * 1000
    );
  });
  if (samples.length === value.samples.length) return value;
  return {
    batchId: samples.length > 0 ? value.batchId : createBatchId(),
    clientRelease: value.clientRelease,
    samples,
  };
}

function persistQueue(): void {
  if (!queue) return;
  try {
    const retainedQueues = queues.filter(
      (candidate) => candidate.samples.length > 0 || candidate === queue,
    );
    wx.setStorageSync(
      storageKeys.clientTelemetryQueue,
      retainedQueues.length === 1
        ? retainedQueues[0]
        : ({
            schemaVersion: 2,
            queues: retainedQueues,
          } satisfies PendingTelemetryStorage),
    );
  } catch {
    // Telemetry is best effort and must never affect the product path.
  }
}

function createBatchId(): string {
  const randomHex = (length: number): string => {
    let value = "";
    while (value.length < length)
      value += Math.floor(Math.random() * 0x100000000)
        .toString(16)
        .padStart(8, "0");
    return value.slice(0, length);
  };
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-8${randomHex(3)}-${randomHex(12)}`;
}

function scheduleFlush(): void {
  if (flushTimer || !queues.some((candidate) => candidate.samples.length > 0))
    return;
  const timer = setTimeout(() => {
    flushTimer = null;
    void flushClientTelemetry();
  }, FLUSH_INTERVAL_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  flushTimer = timer;
}

function samplingProbabilityForResult(result: ClientTelemetryResult): number {
  return result === "ok" ? 0.25 : 1;
}

function reasonCodeForResult(
  result: ClientTelemetryResult,
): ClientTelemetryReasonCode {
  if (result === "auth_error") return "auth";
  if (result === "timeout") return "upstream_timeout";
  if (result === "unavailable") return "unavailable";
  return result === "error" ? "unknown" : "none";
}

export function enqueueClientTelemetry(
  sample: Omit<
    ClientTelemetrySample,
    | "observedAt"
    | "deviceGroup"
    | "sampleSource"
    | "reasonCode"
    | "samplingProbability"
    | "measurementKind"
  > & {
    observedAt?: string;
    deviceGroup?: ClientTelemetrySample["deviceGroup"];
    sampleSource?: ClientTelemetrySample["sampleSource"];
    reasonCode?: ClientTelemetryReasonCode;
    measurementKind?: ClientTelemetryMeasurementKind;
  },
): void {
  const samplingProbability = samplingProbabilityForResult(sample.result);
  if (Math.random() >= samplingProbability) return;
  if (
    sample.value !== undefined &&
    (!Number.isFinite(sample.value) ||
      sample.value < 0 ||
      MAX_SAMPLE_VALUES[sample.metric] === undefined ||
      sample.value > MAX_SAMPLE_VALUES[sample.metric]!)
  )
    return;
  const environment = currentEnvironment();
  const target = loadQueue();
  const normalized: ClientTelemetrySample = {
    observedAt: sample.observedAt ?? new Date().toISOString(),
    surface: sample.surface,
    metric: sample.metric,
    deviceGroup: sample.deviceGroup ?? environment.deviceGroup,
    sampleSource: sample.sampleSource ?? environment.sampleSource,
    result: sample.result,
    reasonCode: sample.reasonCode ?? reasonCodeForResult(sample.result),
    measurementKind: sample.measurementKind ?? "request",
    samplingProbability,
    ...(sample.errorClass === undefined
      ? {}
      : { errorClass: sample.errorClass }),
    ...(sample.fingerprint === undefined
      ? {}
      : { fingerprint: sample.fingerprint }),
    ...(sample.occurrenceCount === undefined
      ? {}
      : { occurrenceCount: sample.occurrenceCount }),
    ...(sample.firstObservedAt === undefined
      ? {}
      : { firstObservedAt: sample.firstObservedAt }),
    ...(sample.lastObservedAt === undefined
      ? {}
      : { lastObservedAt: sample.lastObservedAt }),
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

function sendBatch(
  batch: PendingTelemetryQueue,
  samples: ClientTelemetrySample[],
): Promise<boolean> {
  const payload = {
    schemaVersion: 2 as const,
    batchId: batch.batchId,
    client: "wechat_miniprogram" as const,
    clientRelease: batch.clientRelease,
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
          resolve(
            response.statusCode >= 200 &&
              response.statusCode < 300 &&
              response.data?.accepted === true,
          );
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
  loadQueue();
  queues = queues
    .map((candidate) => pruneExpiredSamples(candidate))
    .filter((candidate) => candidate.samples.length > 0 || candidate === queue);
  persistQueue();
  const pendingQueues = queues.filter(
    (candidate) => candidate.samples.length > 0,
  );
  if (!pendingQueues.length) return;
  const run = (async () => {
    for (const pending of pendingQueues) {
      // Keep the sent objects protected until the acknowledgement arrives. New
      // samples may be appended while the request is in flight, and queue cap
      // eviction must never remove an unacknowledged sample.
      const samples = pending.samples.slice(0, BATCH_SIZE);
      inFlightSlice = { batchId: pending.batchId, samples };
      let delivered = false;
      try {
        delivered = await sendBatch(pending, samples);
      } catch {
        delivered = false;
      }
      const current = queues.find(
        (candidate) => candidate.batchId === pending.batchId,
      );
      if (delivered && current) {
        const acknowledged = new Set(samples);
        current.samples = current.samples.filter(
          (candidate) => !acknowledged.has(candidate),
        );
        // A new slice is a new idempotency unit. Retain the old batchId only
        // while retrying this exact unacknowledged slice.
        current.batchId = createBatchId();
        if (current.samples.length === 0 && current !== queue) {
          queues = queues.filter((candidate) => candidate !== current);
        }
        persistQueue();
      }
      inFlightSlice = null;
    }
    if (queues.some((candidate) => candidate.samples.length > 0))
      scheduleFlush();
  })();
  flushInFlight = run;
  await run;
  if (flushInFlight === run) flushInFlight = null;
}

function runtimeErrorDetails(error: unknown): {
  errorClass: string;
  fingerprint: string;
} {
  let errorClass =
    error &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64) || "unknown"
      : "unknown";
  let location = "unknown";
  let stack: unknown;
  if (typeof error === "string") {
    const message = error.slice(0, 8_192);
    const classMatch = message.match(/^([A-Za-z][A-Za-z0-9._-]{0,63})\s*:/);
    if (classMatch) errorClass = classMatch[1];
    stack = message;
  } else if (error && typeof error === "object" && "stack" in error) {
    try {
      stack = error.stack;
    } catch {
      stack = undefined;
    }
  }
  if (typeof stack === "string") {
    for (const line of stack.slice(0, 8_192).split(/\r?\n/)) {
      const match = line.match(
        /(?:^|[\s/])((?:miniprogram\/)?(?:pages|components|services|utils|config)\/[A-Za-z0-9._/-]+)/,
      );
      if (!match) continue;
      location = match[1]
        .replace(/[^A-Za-z0-9._-]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .slice(0, 80);
      if (!location) location = "unknown";
      break;
    }
  }
  return { errorClass, fingerprint: `runtime.${errorClass}.${location}` };
}

function mergeQueuedRuntimeError(
  target: PendingTelemetryQueue,
  sourceFingerprint: string,
  targetFingerprint: string,
): void {
  if (sourceFingerprint === targetFingerprint) return;
  const sourceIndex = target.samples.findIndex(
    (sample) =>
      sample.metric === "runtime_error" &&
      sample.fingerprint === sourceFingerprint,
  );
  if (sourceIndex < 0) return;
  const source = target.samples[sourceIndex];
  const targetSample = target.samples.find(
    (sample) =>
      sample.metric === "runtime_error" &&
      sample.fingerprint === targetFingerprint,
  );
  if (targetSample) {
    const combinedCount =
      (targetSample.occurrenceCount ?? 1) + (source.occurrenceCount ?? 1);
    const sourceFirst = source.firstObservedAt ?? source.observedAt;
    const sourceLast = source.lastObservedAt ?? source.observedAt;
    const targetFirst = targetSample.firstObservedAt ?? targetSample.observedAt;
    const targetLast = targetSample.lastObservedAt ?? targetSample.observedAt;
    targetSample.occurrenceCount = Math.min(
      MAX_OCCURRENCE_COUNT,
      combinedCount,
    );
    targetSample.firstObservedAt =
      Date.parse(sourceFirst) < Date.parse(targetFirst)
        ? sourceFirst
        : targetFirst;
    targetSample.lastObservedAt =
      Date.parse(sourceLast) > Date.parse(targetLast) ? sourceLast : targetLast;
    target.samples.splice(sourceIndex, 1);
    let remaining = combinedCount - MAX_OCCURRENCE_COUNT;
    while (remaining > 0) {
      const occurrenceCount = Math.min(MAX_OCCURRENCE_COUNT, remaining);
      target.samples.push({
        ...targetSample,
        occurrenceCount,
      });
      remaining -= occurrenceCount;
    }
    return;
  }
  target.samples[sourceIndex] = {
    ...source,
    errorClass: "other",
    fingerprint: targetFingerprint,
  };
}

export function recordClientRuntimeError(error?: unknown): void {
  const now = Date.now();
  const details = runtimeErrorDetails(error);
  if (error && typeof error === "object") {
    if (seenRuntimeErrorObjects.has(error)) return;
    seenRuntimeErrorObjects.add(error);
  }
  const queueState = loadQueue();
  let fingerprint = details.fingerprint;
  let errorClass = details.errorClass;
  if (
    !runtimeErrorFingerprints.has(fingerprint) &&
    runtimeErrorFingerprints.size >= MAX_RUNTIME_ERROR_FINGERPRINTS
  ) {
    const oldest = [...runtimeErrorFingerprints.keys()].find(
      (key) => key !== "runtime.other",
    );
    if (typeof oldest === "string") {
      mergeQueuedRuntimeError(queueState, oldest, "runtime.other");
      runtimeErrorFingerprints.delete(oldest);
    }
    fingerprint = "runtime.other";
    errorClass = "other";
  }
  const inFlightSamples =
    inFlightSlice?.batchId === queueState.batchId
      ? new Set(inFlightSlice.samples)
      : null;
  const queued = queueState.samples.find(
    (sample) =>
      sample.metric === "runtime_error" &&
      sample.fingerprint === fingerprint &&
      !inFlightSamples?.has(sample) &&
      (sample.occurrenceCount ?? 1) < MAX_OCCURRENCE_COUNT &&
      Date.parse(sample.lastObservedAt ?? sample.observedAt) >=
        now - RUNTIME_ERROR_WINDOW_MS,
  );
  if (queued) {
    queued.occurrenceCount = Math.min(
      MAX_OCCURRENCE_COUNT,
      (queued.occurrenceCount ?? 1) + 1,
    );
    queued.lastObservedAt = new Date(now).toISOString();
    runtimeErrorFingerprints.set(fingerprint, now);
    persistQueue();
    return;
  }
  // If the previous aggregate has already been acknowledged and removed from
  // local storage, keep this occurrence. Data's window upsert coalesces the
  // same fingerprint across batches; dropping it here would undercount a
  // continuing error storm after a successful flush.
  runtimeErrorFingerprints.set(fingerprint, now);
  const observedAt = new Date(now).toISOString();
  enqueueClientTelemetry({
    surface: "other",
    metric: "runtime_error",
    result: "error",
    reasonCode: "unknown",
    measurementKind: "request",
    errorClass,
    fingerprint,
    occurrenceCount: 1,
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
  });
}

export function recordClientUpdateFailure(): void {
  enqueueClientTelemetry({
    surface: "other",
    metric: "update_failure",
    result: "error",
  });
}

export function recordClientAuthResult(
  result: "ok" | "auth_error" | "timeout" | "error",
): void {
  enqueueClientTelemetry({
    surface: "auth",
    metric: "auth_result",
    result,
    reasonCode: reasonCodeForResult(result),
  });
}

export function recordLastGoodAge(ageMs: number): void {
  enqueueClientTelemetry({
    surface: "price_changes",
    metric: "last_good_age_ms",
    result: "stale",
    value: ageMs,
  });
}
