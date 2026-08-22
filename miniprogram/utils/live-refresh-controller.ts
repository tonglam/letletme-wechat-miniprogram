import { LIVE_REFRESH_INTERVAL_MS, liveSnapshotNeedsRefresh } from "./live-refresh";
import type { LiveSnapshotStatus } from "../models/live";

/**
 * Owns the refresh lifecycle every Live page used to hand-roll: a 30s
 * eligibility-gated timer, a single-flight revision probe, revision-based
 * full-reload triggering, and stale-response guards — plus offline-aware
 * stop/resume, which previously did not exist anywhere.
 *
 * The core stays wx-free: connectivity is injected so tests can drive it.
 */
export interface LiveRefreshControllerOptions {
  /** Page guard: visible, current event selected, not settled, target exists. */
  isEligible: () => boolean;
  /** The snapshot the page has accepted, for revision comparison. */
  getAcceptedSnapshot: () => LiveSnapshotStatus | null;
  /** Lightweight revision probe (production: getLiveSnapshot). */
  probe: () => Promise<LiveSnapshotStatus | null>;
  /** Background full reload after a revision/event change. */
  reload: () => Promise<void>;
  /** Adopt an observed snapshot that turned out unchanged (fresh checkedAt). */
  acceptSnapshot?: (snapshot: LiveSnapshotStatus | null) => void;
  /** Official manager score may need a reload after the player snapshot settles. */
  shouldReloadOnUnchangedProbe?: () => boolean;
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

export function createLiveRefreshController(options: LiveRefreshControllerOptions): LiveRefreshController {
  const intervalMs = options.intervalMs ?? LIVE_REFRESH_INTERVAL_MS;
  let timer: number | undefined;
  let online = options.isOnline ? options.isOnline() : true;
  let probeRequest: Promise<void> | null = null;
  let probeRequestId = 0;
  let disposed = false;
  let unsubscribeNetwork: (() => void) | undefined;

  function eligible(): boolean {
    return !disposed && online && options.isEligible();
  }

  function stopTimer(): void {
    if (timer !== undefined) {
      clearInterval(timer);
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
    return disposed || requestId !== probeRequestId || Boolean(options.isStale?.());
  }

  function runProbe(): Promise<void> {
    if (!eligible()) return Promise.resolve();
    if (probeRequest) return probeRequest;

    const requestId = probeRequestId + 1;
    probeRequestId = requestId;
    options.onProbeChange?.(true);
    const request = (async () => {
      const probeStart = Date.now();
      try {
        const observed = await options.probe();
        const probeDurationMs = Date.now() - probeStart;
        if (isResponseStale(requestId)) return;
        if (
          !liveSnapshotNeedsRefresh(options.getAcceptedSnapshot(), observed) &&
          !options.shouldReloadOnUnchangedProbe?.()
        ) {
          options.onProbeSettled?.({
            snapshotState: observed?.state,
            revisionChanged: false,
            reloaded: false,
            probeDurationMs
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
          revisionChanged: true,
          reloaded: true,
          probeDurationMs,
          reloadDurationMs: Date.now() - reloadStart
        });
      } catch (error) {
        if (isResponseStale(requestId)) return;
        const message = error instanceof Error ? error.message : "刷新失败";
        options.onProbeSettled?.({
          revisionChanged: false,
          reloaded: false,
          probeDurationMs: Date.now() - probeStart,
          error: message
        });
        options.onProbeError?.(message);
      }
    })();

    probeRequest = request;
    return request.finally(() => {
      if (probeRequest === request) {
        probeRequest = null;
        options.onProbeChange?.(false);
      }
    });
  }

  function sync(): void {
    stopTimer();
    if (!eligible()) return;
    timer = setInterval(() => {
      void runProbe();
    }, intervalMs) as unknown as number;
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
    }
  };
}
