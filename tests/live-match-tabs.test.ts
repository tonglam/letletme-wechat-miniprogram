import {
  countLiveMatchTabs,
  liveMatchTabKey,
  preferredLiveMatchTab,
} from "../miniprogram/utils/live-match-tabs";

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

// --- liveMatchTabKey ---
equal(liveMatchTabKey("playing"), "playing", "playing bucket");
equal(liveMatchTabKey("live"), "playing", "live aliases to playing");
equal(liveMatchTabKey("finished"), "finished", "finished bucket");
equal(liveMatchTabKey("not_start"), "not_start", "not_start bucket");
equal(liveMatchTabKey("not_started"), "not_start", "not_started bucket");
equal(liveMatchTabKey(undefined), "not_start", "missing status is not_start");
equal(liveMatchTabKey("LIVE"), "playing", "case-insensitive");

// --- preferredLiveMatchTab (web getPreferredLiveMatchesTab parity) ---
equal(
  preferredLiveMatchTab(["finished", "playing", "not_start"]),
  "playing",
  "live beats everything",
);
equal(
  preferredLiveMatchTab(["finished", "not_start"]),
  "not_start",
  "upcoming before finished",
);
equal(preferredLiveMatchTab(["finished", "finished"]), "finished", "finished fallback");
equal(preferredLiveMatchTab([]), "playing", "empty desk keeps the live default");

// --- countLiveMatchTabs ---
const counts = countLiveMatchTabs([
  "playing",
  "live",
  "finished",
  "not_start",
  undefined,
]);
equal(counts.playing, 2, "playing count");
equal(counts.finished, 1, "finished count");
equal(counts.not_start, 2, "not_start count");
const empty = countLiveMatchTabs([]);
check(
  empty.playing === 0 && empty.not_start === 0 && empty.finished === 0,
  "empty desk counts are zero",
);

console.log("live-match-tabs tests passed");
