/**
 * Price-change live-channel poller — the mini counterpart of the web
 * usePriceChangeLiveUpdates hook (web lib/price-change-live-client.ts).
 *
 * The durable priceChangeBoard resolver never merges hot snapshots, so pages
 * poll the lightweight cursor and only fetch the full live board when the
 * revision/state/sourceHash actually changes. Poll cadence follows the web's
 * three tiers: idle 60s, 2s inside the ±5min window around a price deadline,
 * 500ms in the final 10s before it.
 *
 * Pages own the lifecycle: start() when the surface is visible, stop() on
 * hide/unload. Read functions are injectable for tests.
 */
import type { PriceChangeBoard } from "../models/price-change";
import {
  getPriceChangeLiveBoard,
  getPriceChangeLiveCursor,
  type PriceChangeLiveBoard,
  type PriceChangeLiveCursor,
  type PriceChangeLiveState,
} from "../services/price-change.service";

export const PRICE_LIVE_HOT_WINDOW_BEFORE_MS = 5 * 60 * 1000;
export const PRICE_LIVE_HOT_WINDOW_AFTER_MS = 5 * 60 * 1000;
export const PRICE_LIVE_FINAL_WINDOW_BEFORE_MS = 10 * 1000;
export const PRICE_LIVE_HOT_POLL_MS = 2 * 1000;
export const PRICE_LIVE_FINAL_POLL_MS = 500;
export const PRICE_LIVE_IDLE_POLL_MS = 60 * 1000;

/** Lightweight seed — what a consumer needs for policy + identity tracking. */
export interface PriceChangeLiveSeed {
  revision: string;
  deadline: string | null;
  nextDeadlines: string[];
}

type DeadlineCarrier = Pick<PriceChangeBoard, "deadline" | "nextDeadlines">;

function nextDeadlineMs(
  board: DeadlineCarrier,
  now: number,
): number | null {
  const candidates = [board.deadline, ...(board.nextDeadlines || [])]
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter((timestamp) => Number.isFinite(timestamp))
    .filter(
      (timestamp) =>
        timestamp - now <= PRICE_LIVE_HOT_WINDOW_BEFORE_MS &&
        timestamp - now >= -PRICE_LIVE_HOT_WINDOW_AFTER_MS,
    );
  return (
    candidates.sort(
      (left, right) => Math.abs(left - now) - Math.abs(right - now),
    )[0] ?? null
  );
}

/** Port of the web resolvePriceChangeLivePollPolicy. */
export function resolvePriceChangeLivePollPolicy(
  board: DeadlineCarrier,
  now: number = Date.now(),
  retainedDeadline: number | null = null,
): { delayMs: number; windowDeadline: number | null } {
  const retainedDeadlineIsActive =
    retainedDeadline !== null &&
    retainedDeadline - now <= PRICE_LIVE_HOT_WINDOW_BEFORE_MS &&
    retainedDeadline - now >= -PRICE_LIVE_HOT_WINDOW_AFTER_MS;
  const deadline =
    nextDeadlineMs(board, now) ??
    (retainedDeadlineIsActive ? retainedDeadline : null);
  if (deadline === null) {
    return { delayMs: PRICE_LIVE_IDLE_POLL_MS, windowDeadline: null };
  }
  return {
    delayMs:
      deadline - now <= PRICE_LIVE_FINAL_WINDOW_BEFORE_MS
        ? PRICE_LIVE_FINAL_POLL_MS
        : PRICE_LIVE_HOT_POLL_MS,
    windowDeadline: deadline,
  };
}

export interface PriceChangeLivePollerHandlers {
  /** A newer board arrived (provisional or durable). */
  onUpdate(board: PriceChangeBoard, state: PriceChangeLiveState): void;
  /**
   * The channel went UNAVAILABLE / lost its revision and no full durable
   * board is held — restore the server-rendered projection instead.
   */
  onReset(state: PriceChangeLiveState): void;
}

interface PriceChangeLiveReads {
  readCursor(): Promise<PriceChangeLiveCursor | null>;
  readBoard(
    revision?: string | null,
    sourceHash?: string | null,
  ): Promise<PriceChangeLiveBoard | null>;
}

const DEFAULT_READS: PriceChangeLiveReads = {
  readCursor: getPriceChangeLiveCursor,
  readBoard: getPriceChangeLiveBoard,
};

export class PriceChangeLivePoller {
  private readonly handlers: PriceChangeLivePollerHandlers;
  private readonly reads: PriceChangeLiveReads;
  private baseSeed: PriceChangeLiveSeed = {
    revision: "unavailable",
    deadline: null,
    nextDeadlines: [],
  };
  private policySeed: DeadlineCarrier = this.baseSeed;
  private durableBoard: PriceChangeBoard | null = null;
  private revision = "unavailable";
  private sourceHash: string | null = null;
  private state: PriceChangeLiveState = "DURABLE";
  private windowDeadline: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private stopped = true;

  constructor(
    handlers: PriceChangeLivePollerHandlers,
    reads: PriceChangeLiveReads = DEFAULT_READS,
  ) {
    this.handlers = handlers;
    this.reads = reads;
  }

  /** Replace the durable seed after a fresh server read (web [seed] effect). */
  updateSeed(
    seed: PriceChangeLiveSeed,
    durableBoard?: PriceChangeBoard | null,
  ): void {
    this.baseSeed = seed;
    this.policySeed = seed;
    this.durableBoard = durableBoard ?? null;
    this.revision = seed.revision;
    this.sourceHash = null;
    this.state = "DURABLE";
  }

  /** Starts the loop; the returned promise settles when the first tick ends. */
  start(): Promise<void> {
    if (!this.stopped) return Promise.resolve();
    this.stopped = false;
    return this.pollOnce();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delay: number): void {
    if (this.stopped) {
      this.timer = null;
      return;
    }
    // Manual pollOnce ticks (tests, future foreground-refresh hooks) must not
    // strand the previously scheduled timer.
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pollOnce(), delay);
  }

  /** One poll cycle; public so tests can drive ticks without timers. */
  async pollOnce(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    const atStart = resolvePriceChangeLivePollPolicy(
      this.policySeed,
      Date.now(),
      this.windowDeadline,
    );
    this.windowDeadline = atStart.windowDeadline;
    this.inFlight = true;
    try {
      // Read failures degrade to a skipped tick (web fetchJson → null parity).
      const cursor = await this.reads.readCursor().catch(() => null);
      if (cursor) {
        if (!cursor.revision || cursor.state === "UNAVAILABLE") {
          // A provisional snapshot can expire or be withdrawn before the next
          // poll. Restore the durable board immediately instead of leaving
          // expired prices on screen indefinitely.
          const fallback = this.durableBoard;
          const fallbackSeedRevision = fallback
            ? fallback.revision
            : this.baseSeed.revision;
          if (
            this.state !== cursor.state ||
            this.revision !== fallbackSeedRevision ||
            this.sourceHash !== null
          ) {
            this.revision = fallbackSeedRevision;
            this.sourceHash = null;
            this.state = cursor.state;
            this.policySeed = fallback ?? this.baseSeed;
            if (fallback) {
              this.handlers.onUpdate(fallback, cursor.state);
            } else {
              this.handlers.onReset(cursor.state);
            }
          }
        } else if (
          cursor.revision !== this.revision ||
          cursor.state !== this.state ||
          (cursor.state === "PROVISIONAL" &&
            cursor.sourceHash !== this.sourceHash)
        ) {
          const live =
            cursor.state === "PROVISIONAL"
              ? await this.reads
                  .readBoard(cursor.revision, cursor.sourceHash ?? undefined)
                  .catch(() => null)
              : await this.reads.readBoard().catch(() => null);
          const revisionMatches =
            cursor.state !== "PROVISIONAL" ||
            (live?.revision === cursor.revision &&
              live.sourceHash === cursor.sourceHash);
          if (live && revisionMatches && live.state !== "UNAVAILABLE") {
            this.revision = live.revision;
            this.sourceHash = live.sourceHash;
            this.state = live.state;
            this.policySeed = live.board;
            if (live.state === "DURABLE") {
              this.durableBoard = live.board;
            }
            this.handlers.onUpdate(live.board, live.state);
          }
        }
      }
    } finally {
      this.inFlight = false;
      if (!this.stopped) {
        const policy = resolvePriceChangeLivePollPolicy(
          this.policySeed,
          Date.now(),
          this.windowDeadline,
        );
        this.windowDeadline = policy.windowDeadline;
        this.schedule(policy.delayMs);
      }
    }
  }
}
