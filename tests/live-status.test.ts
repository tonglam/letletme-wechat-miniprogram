import {
  normalizeLiveDisplayState
} from "../miniprogram/utils/live-status";
import type { LiveDisplayInput } from "../miniprogram/utils/live-status";
import type { LiveSnapshotStatus } from "../miniprogram/models/live";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function snapshot(state: LiveSnapshotStatus["state"]): LiveSnapshotStatus {
  return {
    eventId: 33,
    revision: "a".repeat(24),
    state,
    publishedAt: "2026-08-04T10:00:00.000Z",
    checkedAt: "2026-08-04T10:00:00.000Z"
  };
}

function display(overrides: Partial<LiveDisplayInput> = {}): string {
  return normalizeLiveDisplayState({
    snapshot: snapshot("LIVE"),
    hasData: true,
    loading: false,
    probing: false,
    lastError: "",
    online: true,
    ...overrides
  });
}

// Base mapping — one golden case per display state.
assertEqual(display({ online: false }), "offline", "offline with last-good data");
assertEqual(display({ hasData: false, lastError: "网络异常" }), "unavailable", "no data plus failure");
assertEqual(display({ partialFailedCount: 3 }), "partial", "failed rows inside a successful payload");
assertEqual(display({ snapshot: snapshot("SETTLED") }), "final", "settled snapshot");
assertEqual(display({ snapshot: snapshot("SCHEDULED"), hasData: false }), "scheduled", "scheduled with no payload yet");
assertEqual(display({ probing: true }), "refreshing", "probe in flight");
assertEqual(display({ loading: true }), "refreshing", "full fetch in flight");
assertEqual(display({ lastError: "网络异常" }), "delayed", "error with last-good data still shown");
assertEqual(display(), "fresh", "healthy current data");

// Priority conflicts — the order in normalizeLiveDisplayState decides.
assertEqual(
  display({ online: false, partialFailedCount: 2 }),
  "offline",
  "offline beats partial: connectivity explains the staleness"
);
assertEqual(
  display({ online: false, hasData: false, lastError: "网络异常" }),
  "unavailable",
  "offline with nothing to show asks for retry, not an offline badge"
);
assertEqual(
  display({ partialFailedCount: 2, snapshot: snapshot("SETTLED") }),
  "partial",
  "partial beats final: retained failed rows must stay visible as incomplete"
);
assertEqual(
  display({ snapshot: snapshot("SETTLED"), probing: true }),
  "final",
  "final beats refreshing: settlement is the headline, the probe is housekeeping"
);
assertEqual(
  display({ snapshot: snapshot("SCHEDULED"), hasData: true }),
  "fresh",
  "scheduled with renderable data is not an empty scheduled state"
);
assertEqual(
  display({ loading: true, lastError: "上一轮失败" }),
  "refreshing",
  "an in-flight retry reads as refreshing, not delayed"
);

console.log("live-status tests passed");
