import {
  LIVE_REFRESH_INTERVAL_MS,
  liveSnapshotNeedsRefresh,
} from "./live-refresh";
import type { LiveSnapshotStatus } from "../models/live";

/**
 * Owns the refresh lifecycle every Live page used to hand-roll: a
 * server-deadline eligibility-gated timer, a single-flight revision probe, score-revision-based
 * full-reload triggering, and stale-response guards — plus offline-aware
 * stop/resume, which previously did not exist anywhere.
 *
 * The core stays wx-free: connectivity is injected so tests can drive it.
 */
type RefreshSnapshot = { eventId: number; state: string };

export interface LiveRefreshControllerOptions<
  Snapshot extends RefreshSnapshot = LiveSnapshotStatus,
> {
  /** Page guard: visible, current event selected, not settled, target exists. */
  isEligible: () => boolean;
  /** The snapshot the page has accepted, for revision comparison. */
  getAcceptedSnapshot: () => Snapshot | null;
  /** Lightweight revision probe (production: getLiveSnapshot). */
  probe: () => Promise<Snapshot | null>;
  /** Background full reload after a revision/event change. */
  reload: () => Promise<void>;
  /** Adopt an observed snapshot that turned out unchanged. */
  acceptSnapshot?: (snapshot: Snapshot | null) => void;
  /** Product-specific revision vector comparison; LP remains the default. */
  hasRevisionChanged?: (
    accepted: Snapshot | null,
    observed: Snapshot | null,
  ) => boolean;
  /** The server's next check deadline; this schedules a probe only. */
  getNextRefreshAt?: () => string | null | undefined;
  /** Reload page-specific data when its advertised deadline has elapsed. */
  reloadOnDeadline?: boolean;
  /** Probe failure: current data is kept, the page only updates its status. */
  onProbeError?: (message: string) => void;
  /** Probe lifecycle for status rendering (true when a probe actually starts). */
  onProbeChange?: (probing: boolean) => void;
  /**
   * One call per settled probe cycle (success, reload, or error) for
   * telemetry. Stale/discarded responses are not reported.
   */
  onProbeSettled?: (info: {
    snapshotState?: string;
    revisionChanged: boolean;
    reloaded: boolean;
    probeDurationMs: number;
    reloadDurationMs?: number;
    error?: string;
  }) => void;
  /** Connectivity transitions, including an immediately-reported offline state. */
  onOnlineChange?: (online: boolean) => void;
  /** Extra staleness guard (page request-id / context switch). */
  isStale?: () => boolean;
  /** Connectivity injection; defaults to optimistic-online for tests. */
  isOnline?: () => boolean;
  /** Returns an unsubscribe. Production: utils/live-network. */
  subscribeNetwork?: (onChange: (online: boolean) => void) => () => void;
  intervalMs?: number;
}

export interface LiveRefreshController {
  /** Recompute the timer from eligibility — call on show and eligibility changes. */
  sync(): void;
  /** Immediate single-flight probe (recovery, stale-cache signal, manual retry). */
  probeNow(): Promise<void>;
  /** Clear the timer and void any in-flight probe — call on hide and context switches. */
  stop(): void;
  /** stop() plus network-unsubscribe — call on unload. */
  dispose(): void;
}

export function createLiveRefreshController<Snapshot extends RefreshSnapshot>(
  options: LiveRefreshControllerOptions<Snapshot>,
): LiveRefreshController {
  const intervalMs = options.intervalMs ?? LIVE_REFRESH_INTERVAL_MS;
  let timer: number | undefined;
  let online = options.isOnline ? options.isOnline() : true;
  let probeRequest: Promise<void> | null = null;
  let probeRequestId = 0;
  let consumedDeadline: string | null = null;
  let disposed = false;
  let unsubscribeNetwork: (() => void) | undefined;

  function eligible(): boolean {
    return !disposed && online && options.isEligible();
  }

  function stopTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function cancelProbe(): void {
    const wasProbing = probeRequest !== null;
    probeRequestId += 1;
    probeRequest = null;
    if (wasProbing) {
      options.onProbeChange?.(false);
    }
  }

  function isResponseStale(requestId: number): boolean {
    return (
      disposed || requestId !== probeRequestId || Boolean(options.isStale?.())
    );
  }

  function runProbe(): Promise<void> {
    if (!eligible()) return Promise.resolve();
    if (probeRequest) return probeRequest;

    const nextRefreshAt = options.getNextRefreshAt?.();
    const deadline = nextRefreshAt ? Date.parse(nextRefreshAt) : Number.NaN;
    const deadlineExpired =
      Boolean(nextRefreshAt) &&
      Number.isFinite(deadline) &&
      deadline <= Date.now();
    if (deadlineExpired && nextRefreshAt) {
      consumedDeadline = nextRefreshAt;
    }

    const requestId = probeRequestId + 1;
    probeRequestId = requestId;
    options.onProbeChange?.(true);
    const request = (async () => {
      const probeStart = Date.now();
      try {
        const observed = await options.probe();
        const probeDurationMs = Date.now() - probeStart;
        if (isResponseStale(requestId)) return;
        const accepted = options.getAcceptedSnapshot();
        const revisionChanged = options.hasRevisionChanged
          ? options.hasRevisionChanged(accepted, observed)
          : liveSnapshotNeedsRefresh(
              accepted as unknown as LiveSnapshotStatus | null,
              observed as unknown as LiveSnapshotStatus | null,
            );
        if (
          !revisionChanged &&
          !(options.reloadOnDeadline === true && deadlineExpired)
        ) {
          options.onProbeSettled?.({
            snapshotState: observed?.state,
            revisionChanged: false,
            reloaded: false,
            probeDurationMs,
          });
          options.acceptSnapshot?.(observed);
          sync();
          return;
        }
        const reloadStart = Date.now();
        await options.reload();
        if (isResponseStale(requestId)) return;
        options.onProbeSettled?.({
          snapshotState: observed?.state,
          revisionChanged,
          reloaded: true,
          probeDurationMs,
          reloadDurationMs: Date.now() - reloadStart,
        });
      } catch (error) {
        if (isResponseStale(requestId)) return;
        const message = error instanceof Error ? error.message : "刷新失败";
        options.onProbeSettled?.({
          revisionChanged: false,
          reloaded: false,
          probeDurationMs: Date.now() - probeStart,
          error: message,
        });
        options.onProbeError?.(message);
        // A failed one-shot deadline must not leave the page permanently
        // unrefreshed. Retry at the normal bounded cadence; a successful probe
        // will re-arm from the server-provided deadline.
        stopTimer();
        if (eligible()) {
          timer = setTimeout(() => {
            timer = undefined;
            void runProbe();
          }, intervalMs) as unknown as number;
        }
      }
    })();

    probeRequest = request;
    return request.finally(() => {
      if (probeRequest === request) {
        probeRequest = null;
        options.onProbeChange?.(false);
        // A reload can call sync() while this probe is still active. If its
        // one-shot deadline fires before the request settles, runProbe()
        // coalesces onto this request and consumes that timer. Re-arm only
        // after clearing the single-flight guard so polling cannot stall.
        if (timer === undefined && eligible()) {
          sync();
        }
      }
    });
  }

  function sync(): void {
    stopTimer();
    if (!eligible()) return;
    const nextRefreshAt = options.getNextRefreshAt?.();
    const deadline = nextRefreshAt ? Date.parse(nextRefreshAt) : Number.NaN;
    const deadlineConsumed =
      Boolean(nextRefreshAt) &&
      nextRefreshAt === consumedDeadline &&
      Number.isFinite(deadline) &&
      deadline <= Date.now();
    const baseDelay =
      Number.isFinite(deadline) && !deadlineConsumed
        ? Math.max(10, deadline - Date.now())
        : intervalMs;
    const jitter =
      Number.isFinite(deadline) && !deadlineConsumed
        ? baseDelay * (Math.random() * 0.2 - 0.1)
        : 0;
    const delay = Math.max(10, Math.round(baseDelay + jitter));
    timer = setTimeout(() => {
      timer = undefined;
      void runProbe();
    }, delay) as unknown as number;
  }

  function stop(): void {
    stopTimer();
    cancelProbe();
  }

  if (options.subscribeNetwork) {
    unsubscribeNetwork = options.subscribeNetwork((nextOnline) => {
      const wasOffline = !online;
      online = nextOnline;
      options.onOnlineChange?.(nextOnline);
      if (!online) {
        stop();
      } else if (wasOffline) {
        // One immediate probe on recovery; the timer resumes for the rest.
        sync();
        void runProbe();
      }
    });
  }

  return {
    sync,
    probeNow: runProbe,
    stop,
    dispose() {
      disposed = true;
      stop();
      unsubscribeNetwork?.();
    },
  };
}
