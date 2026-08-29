import {
  appendNextEventRows,
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

// --- appendNextEventRows (web selectLiveMatchEvent fallback parity) ---
function row(
  matchId: number,
  playStatus: string,
): { matchId: number; playStatus: string } {
  return { matchId, playStatus };
}

// Current event still live → next-event rows stay out.
equal(
  appendNextEventRows([row(1, "finished"), row(2, "playing")], [
    row(1, "finished"),
    row(2, "playing"),
    row(11, "not_started"),
  ]).length,
  2,
  "mid-event desk keeps next fixtures out",
);

// Whole event finished → next-event upcoming rows append.
const settled = appendNextEventRows(
  [row(1, "finished"), row(2, "finished")],
  [row(1, "finished"), row(2, "finished"), row(11, "not_started"), row(12, "not_started")],
);
equal(settled.length, 4, "settled event gains next-event fixtures");
equal(settled[2].matchId, 11, "next fixtures keep desk order");

// Overlay rows already in the core list never duplicate.
const noDupes = appendNextEventRows(
  [row(1, "finished")],
  [row(1, "not_started"), row(11, "not_started")],
);
equal(noDupes.length, 2, "overlay rows already in the core list are skipped");
equal(noDupes[1].matchId, 11, "only the fresh row appends");

// Empty or partially-live desks never append.
equal(appendNextEventRows([], [row(11, "not_started")]).length, 0, "empty desk");
equal(
  appendNextEventRows([row(1, "not_start")], [row(11, "not_started")]).length,
  1,
  "unfinished current event",
);

console.log("live-match-tabs tests passed");
