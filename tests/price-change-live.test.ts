import {
  PRICE_LIVE_FINAL_POLL_MS,
  PRICE_LIVE_HOT_POLL_MS,
  PRICE_LIVE_IDLE_POLL_MS,
  PriceChangeLivePoller,
  resolvePriceChangeLivePollPolicy,
} from "../miniprogram/utils/price-change-live";
import type { PriceChangeBoard } from "../miniprogram/models/price-change";
import type {
  PriceChangeLiveBoard,
  PriceChangeLiveCursor,
  PriceChangeLiveState,
} from "../miniprogram/services/price-change.service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

/* Poll policy (web resolvePriceChangeLivePollPolicy parity) */

const MIN = 60 * 1000;
const now = 1_800_000_000_000;

const idle = resolvePriceChangeLivePollPolicy(
  { deadline: null, nextDeadlines: [] },
  now,
);
assertEqual(idle.delayMs, PRICE_LIVE_IDLE_POLL_MS, "no deadline idles");
assertEqual(idle.windowDeadline, null, "no deadline clears the window");

const hot = resolvePriceChangeLivePollPolicy(
  { deadline: new Date(now + 2 * MIN).toISOString(), nextDeadlines: [] },
  now,
);
assertEqual(hot.delayMs, PRICE_LIVE_HOT_POLL_MS, "deadline within ±5min is hot");

const finalWindow = resolvePriceChangeLivePollPolicy(
  { deadline: new Date(now + 5 * 1000).toISOString(), nextDeadlines: [] },
  now,
);
assertEqual(
  finalWindow.delayMs,
  PRICE_LIVE_FINAL_POLL_MS,
  "final 10s before the deadline polls fastest",
);

// deadline - now <= FINAL_WINDOW_BEFORE_MS is also true just AFTER the
// deadline — exactly when the price moves land, so the cadence stays fastest.
const justAfter = resolvePriceChangeLivePollPolicy(
  { deadline: new Date(now - 3 * MIN).toISOString(), nextDeadlines: [] },
  now,
);
assertEqual(justAfter.delayMs, PRICE_LIVE_FINAL_POLL_MS, "just-passed deadline stays final");

const longAfter = resolvePriceChangeLivePollPolicy(
  { deadline: new Date(now - 6 * MIN).toISOString(), nextDeadlines: [] },
  now,
);
assertEqual(longAfter.delayMs, PRICE_LIVE_IDLE_POLL_MS, "stale window idles");

const farFuture = resolvePriceChangeLivePollPolicy(
  { deadline: new Date(now + 10 * MIN).toISOString(), nextDeadlines: [] },
  now,
);
assertEqual(farFuture.delayMs, PRICE_LIVE_IDLE_POLL_MS, "far deadline idles");

const retained = resolvePriceChangeLivePollPolicy(
  { deadline: null, nextDeadlines: [] },
  now,
  now + 60 * 1000,
);
assertEqual(
  retained.delayMs,
  PRICE_LIVE_HOT_POLL_MS,
  "a retained in-window deadline keeps the hot cadence",
);
assertEqual(retained.windowDeadline, now + 60 * 1000, "retained deadline surfaces");

/* Poller behavior with injected reads */

function fakeBoard(revision: string, players = 1): PriceChangeBoard {
  return {
    status: "READY",
    source: "FPL_BOOTSTRAP",
    deadline: null,
    nextDeadlines: [],
    fetchedAt: new Date(now).toISOString(),
    staleAt: null,
    revision,
    expectedPlayerCount: players,
    observedPlayerCount: players,
    players: [],
  };
}

function fakeCursor(
  state: PriceChangeLiveState,
  revision: string | null,
  sourceHash: string | null = null,
): PriceChangeLiveCursor {
  return {
    seasonCode: "2025-26",
    revision,
    sourceHash,
    state,
    detectedAt: null,
    fetchedAt: null,
    expiresAt: null,
  };
}

function fakeLiveBoard(
  state: PriceChangeLiveState,
  revision: string,
  sourceHash: string | null = null,
): PriceChangeLiveBoard {
  return {
    revision,
    sourceHash,
    state,
    detectedAt: null,
    expiresAt: null,
    durablePublicationId: state === "DURABLE" ? revision : null,
    board: fakeBoard(revision),
  };
}

interface Harness {
  poller: PriceChangeLivePoller;
  updates: string[];
  resets: string[];
  boardCalls: Array<[string | null | undefined, string | null | undefined]>;
  setCursor(cursor: PriceChangeLiveCursor | null): void;
}

function harness(options: {
  cursor: PriceChangeLiveCursor | null;
  liveBoard?: PriceChangeLiveBoard | null;
}): Harness {
  let currentCursor = options.cursor;
  const updates: string[] = [];
  const resets: string[] = [];
  const boardCalls: Array<[string | null | undefined, string | null | undefined]> = [];
  const poller = new PriceChangeLivePoller(
    {
      onUpdate: (board, state) => updates.push(`${state}:${board.revision}`),
      onReset: (state) => resets.push(state),
    },
    {
      readCursor: async () => currentCursor,
      readBoard: async (revision, sourceHash) => {
        boardCalls.push([revision, sourceHash]);
        return options.liveBoard ?? null;
      },
    },
  );
  poller.updateSeed({ revision: "durable-0", deadline: null, nextDeadlines: [] });
  return {
    poller,
    updates,
    resets,
    boardCalls,
    setCursor(cursor) {
      currentCursor = cursor;
    },
  };
}

async function main(): Promise<void> {
  // Provisional update: the board fetch is pinned by revision + sourceHash.
  {
    const run = harness({
      cursor: fakeCursor("PROVISIONAL", "hot-1", "hash-1"),
      liveBoard: fakeLiveBoard("PROVISIONAL", "hot-1", "hash-1"),
    });
    await run.poller.start();
    run.poller.stop();
    assertEqual(run.boardCalls.length, 1, "provisional board fetched once");
    assertEqual(run.boardCalls[0][0], "hot-1", "provisional fetch pins the revision");
    assertEqual(run.boardCalls[0][1], "hash-1", "provisional fetch pins the sourceHash");
    assertEqual(run.updates[0], "PROVISIONAL:hot-1", "provisional board reaches onUpdate");
  }

  // A provisional board whose revision no longer matches the cursor is dropped.
  {
    const run = harness({
      cursor: fakeCursor("PROVISIONAL", "hot-2", "hash-2"),
      liveBoard: fakeLiveBoard("PROVISIONAL", "stale-board", "other"),
    });
    await run.poller.start();
    run.poller.stop();
    assertEqual(run.updates.length, 0, "mismatched provisional board is dropped");
  }

  // Durable cursor: unpinned fetch, remembered as the fallback for resets.
  {
    const run = harness({
      cursor: fakeCursor("DURABLE", "durable-9"),
      liveBoard: fakeLiveBoard("DURABLE", "durable-9"),
    });
    await run.poller.start();
    assertEqual(run.boardCalls.length, 1, "durable board fetched once");
    assertEqual(run.boardCalls[0][0], undefined, "durable fetch passes no revision");
    assertEqual(run.updates[0], "DURABLE:durable-9", "durable board reaches onUpdate");

    // A second tick with an unchanged cursor must not refetch.
    await run.poller.pollOnce();
    assertEqual(run.boardCalls.length, 1, "unchanged cursor does not refetch");

    // The channel withdraws → the remembered durable board is restored.
    run.setCursor(fakeCursor("UNAVAILABLE", null));
    await run.poller.pollOnce();
    run.poller.stop();
    assert(
      run.updates.includes("UNAVAILABLE:durable-9"),
      "withdrawn channel restores the remembered durable board",
    );
  }

  // Without a held durable board the withdrawal falls back to onReset.
  {
    const run = harness({ cursor: fakeCursor("UNAVAILABLE", null) });
    await run.poller.start();
    run.poller.stop();
    assertEqual(run.resets[0], "UNAVAILABLE", "no durable fallback → onReset fires");
    assertEqual(run.updates.length, 0, "onReset path never pushes a board");
  }

  // Cursor read failures are silent and end the tick quietly.
  {
    const run = harness({ cursor: null });
    await run.poller.start();
    run.poller.stop();
    assertEqual(run.updates.length, 0, "a null cursor produces no update");
    assertEqual(run.boardCalls.length, 0, "a null cursor never fetches a board");
  }

  console.log("price-change-live tests passed");
}

void main();
