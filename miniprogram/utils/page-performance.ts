import {
  recordPagePerformance,
  type PageInteractionRecord,
  type PagePerformanceRecord,
} from "./perf";

type PageOwner = {
  route?: string;
  data?: object;
  pageVisible?: boolean;
  pageActive?: boolean;
  __performanceVisible?: boolean;
  __performanceTracker?: PagePerformanceTracker;
  createIntersectionObserver?: (
    options: WechatMiniprogram.CreateIntersectionObserverOption
  ) => WechatMiniprogram.IntersectionObserver;
};

function monotonicNow(): number {
  try {
    const performance = wx.getPerformance() as unknown as { now?: () => number };
    const now = performance.now?.();
    return typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  } catch {
    return Date.now();
  }
}

let sequence = 0;
let interactionSequence = 0;
let activeTracker: PagePerformanceTracker | undefined;
let coldLaunchClaimed = false;
let appWasBackgrounded = false;

/** Called by the app lifecycle so page onShow can distinguish a real resume. */
export function markAppBackgrounded(): void {
  appWasBackgrounded = true;
}

/** Consume the one page-show attribution for a real app background resume. */
export function consumeAppBackgroundResume(): boolean {
  if (!appWasBackgrounded) return false;
  appWasBackgrounded = false;
  return true;
}

function hasVisibleError(data: object | undefined): boolean {
  if (!data) return false;
  return Object.entries(data as Record<string, unknown>).some(([key, value]) => {
    if (!/error/i.test(key) || /workload|retryable/i.test(key)) return false;
    return typeof value === "string" ? value.length > 0 : value === true;
  });
}

function resolveTrigger(
  requested: PagePerformanceRecord["trigger"]
): PagePerformanceRecord["trigger"] {
  const resumedFromBackground = consumeAppBackgroundResume();
  if (requested === "warm-enter") {
    return resumedFromBackground ? "warm-enter" : "in-page-navigation";
  }
  // A refresh tracker may be the first tracker created after an app resume.
  // Consume the shared flag even though refresh remains its own measurement.
  if (requested === "refresh") return requested;
  if (requested !== "cold-launch") return requested;
  if (resumedFromBackground) return "warm-enter";
  if (coldLaunchClaimed) return "in-page-navigation";
  coldLaunchClaimed = true;
  return requested;
}

function setActiveTracker(tracker: PagePerformanceTracker | undefined): void {
  activeTracker = tracker;
}

export interface ActivePagePerformanceTrace {
  navigationId: string;
  route: string;
  trigger: PagePerformanceRecord["trigger"];
}

export interface PageInteractionToken {
  navigationId: string;
  interactionId: string;
  startedAt: number;
  tracker: PagePerformanceTracker;
}

export function getActivePagePerformanceTrace(): ActivePagePerformanceTrace | null {
  if (!activeTracker) return null;
  return {
    navigationId: activeTracker.navigationId,
    route: activeTracker.route,
    trigger: activeTracker.trigger
  };
}

/**
 * Return the visible page's navigation trace even after the primary viewport
 * marker has been recorded. The active attribution slot is intentionally
 * released at that point, but same-page user actions still need a stable
 * navigation id for their request and timing records.
 */
export function getCurrentPagePerformanceTrace(): ActivePagePerformanceTrace | null {
  let page: PageOwner | undefined;
  try {
    const pages = getCurrentPages();
    page = pages?.[pages.length - 1] as PageOwner | undefined;
  } catch {
    page = undefined;
  }
  const visible =
    page?.__performanceVisible ??
    page?.pageVisible ??
    page?.pageActive ??
    true;
  const activeMatches =
    activeTracker && (!page?.route || activeTracker.route === page.route);
  const tracker =
    page?.__performanceTracker ??
    (activeMatches
      ? activeTracker
      : undefined);
  if ((!visible && !activeMatches) || !tracker) return null;
  return {
    navigationId: tracker.navigationId,
    route: tracker.route,
    trigger: tracker.trigger,
  };
}

/**
 * Return the visible page tracker for stage markers that outlive the primary
 * viewport observation. The tracker remains attached to the page until hide
 * or unload, even after request attribution has been released.
 */
export function getCurrentPagePerformanceTracker(): PagePerformanceTracker | null {
  let page: PageOwner | undefined;
  try {
    const pages = getCurrentPages();
    page = pages?.[pages.length - 1] as PageOwner | undefined;
  } catch {
    page = undefined;
  }
  const visible =
    page?.__performanceVisible ??
    page?.pageVisible ??
    page?.pageActive ??
    true;
  const activeMatches =
    activeTracker && (!page?.route || activeTracker.route === page.route);
  if (!visible && !activeMatches) return null;
  // Some DevTools runtimes expose a page proxy from getCurrentPages() rather
  // than the exact object that owns the tracker. The active tracker is still
  // authoritative during the synchronous stage commit; use it only when its
  // route agrees with the visible page.
  const tracker =
    page?.__performanceTracker ??
    (activeMatches
      ? activeTracker
      : undefined);
  return tracker ?? null;
}

/**
 * Start a user interaction at the page handler boundary.  The optional target
 * is a stable semantic label; event payloads are never retained in the trace.
 */
export function beginPageInteraction(
  handler: string,
  target?: string,
): PageInteractionToken | null {
  const tracker = getCurrentPagePerformanceTracker();
  return tracker?.beginInteraction(handler, target) ?? null;
}

export function completePageInteraction(
  token: PageInteractionToken | null | undefined,
  status: "completed" | "failed" = "completed",
  visible = status === "completed",
): void {
  token?.tracker.completeInteraction(token.interactionId, status, visible);
}

const PAGE_LIFECYCLE_HANDLERS = new Set([
  "onLoad",
  "onShow",
  "onHide",
  "onUnload",
  "onPullDownRefresh",
  "onReachBottom",
  "onShareAppMessage",
  "onShareTimeline",
]);

/**
 * Wrap page event methods without changing lifecycle methods.  P0 pages that
 * own a route-specific tracker can use this helper directly; PerformancePage
 * uses it for ordinary pages.  A resolved handler records its execution
 * boundary, while visibility is completed by an explicit page marker, keeping
 * setData/handler return time separate from pixels visible in the viewport.
 */
export function instrumentPageInteractions<
  TData extends WechatMiniprogram.Page.DataOption,
  TCustom extends WechatMiniprogram.Page.CustomOption,
>(
  definition: WechatMiniprogram.Page.Options<TData, TCustom>,
): WechatMiniprogram.Page.Options<TData, TCustom>;
export function instrumentPageInteractions<T extends Record<string, unknown>>(
  definition: T,
): T {
  const instrumented = { ...definition } as T;
  for (const [name, value] of Object.entries(definition)) {
    if (
      PAGE_LIFECYCLE_HANDLERS.has(name) ||
      (name !== "loadMore" && !/^on[A-Z]/.test(name)) ||
      typeof value !== "function"
    ) {
      continue;
    }
    const handler = value as (...args: unknown[]) => unknown;
    (instrumented as Record<string, unknown>)[name] = function (
      this: PageOwner,
      ...args: unknown[]
    ): unknown {
      const token = beginPageInteraction(name, name);
      let result: unknown;
      try {
        result = handler.apply(this, args);
      } catch (error) {
        token?.tracker.completeInteraction(token.interactionId, "failed", false);
        throw error;
      }
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).then(
          () => token?.tracker.markInteractionHandlerCompleted(token.interactionId),
          () => token?.tracker.completeInteraction(token.interactionId, "failed"),
        );
      } else {
        token?.tracker.markInteractionHandlerCompleted(token.interactionId);
      }
      return result;
    };
  }
  return instrumented;
}

export class PagePerformanceTracker {
  readonly navigationId: string;
  readonly route: string;
  readonly trigger: PagePerformanceRecord["trigger"];
  private observer?: WechatMiniprogram.IntersectionObserver;
  private interactionObservers = new Set<WechatMiniprogram.IntersectionObserver>();
  private visibleRecorded = false;
  private disconnected = false;
  private secondaryCompletionExpected = false;
  private pendingSetDataAt?: number;
  private record: Omit<PagePerformanceRecord, "ts">;

  constructor(
    private readonly page: PageOwner,
    route: string,
    trigger: PagePerformanceRecord["trigger"],
    options: { triggerResolved?: boolean } = {},
  ) {
    sequence += 1;
    this.route = route;
    this.trigger = options.triggerResolved ? trigger : resolveTrigger(trigger);
    this.navigationId = `${route}:${Date.now().toString(36)}:${sequence.toString(36)}`;
    // Keep the tracker discoverable from the active Mini page. PerformancePage
    // owns the generic lifecycle tracker, while P0 pages may replace it with a
    // route-specific tracker inside their own lifecycle; stage markers must
    // always land on that current tracker.
    page.__performanceTracker = this;
    this.record = {
      navigationId: this.navigationId,
      route,
      trigger: this.trigger,
      routeStartedAt: monotonicNow(),
      operationCount: 0,
      networkOperationCount: 0
    };
    setActiveTracker(this);
    this.flush();
  }

  mark(
    field:
      | "contextReadyAt"
      | "primaryRequestStartAt"
      | "primaryResponseAt"
      | "primarySetDataAt"
      | "defaultContentAt"
      | "secondaryCompleteAt"
      | "onDemandVisibleAt"
      | "errorVisibleAt"
      | "softFailureAt"
  ): void {
    if (this.disconnected) return;
    const timestamp = monotonicNow();
    const previous = this.record[field];
    this.record[field] =
      previous === undefined ? timestamp : Math.max(previous, timestamp);
    if (field === "errorVisibleAt" || field === "softFailureAt") {
      if (field === "softFailureAt") {
        this.record.errorVisibleAt = Math.max(
          this.record.errorVisibleAt ?? timestamp,
          timestamp,
        );
      }
      this.completePendingInteractions("failed", timestamp, false);
    }
    const finalCompletion = field === "secondaryCompleteAt" || field === "softFailureAt";
    if (finalCompletion) this.secondaryCompletionExpected = false;
    this.updateCompleteAt();
    this.flush(finalCompletion);
    if (field === "secondaryCompleteAt" || field === "softFailureAt") {
      this.finishRequestAttribution();
    }
  }

  beginInteraction(handler: string, target?: string): PageInteractionToken {
    interactionSequence += 1;
    const startedAt = monotonicNow();
    const interaction: PageInteractionRecord = {
      interactionId: `${this.navigationId}:action:${interactionSequence.toString(36)}`,
      handler: String(handler || "unknown").slice(0, 80),
      ...(target ? { target: String(target).slice(0, 120) } : {}),
      startedAt,
      status: "started",
    };
    const previous = this.record.interactions ?? [];
    this.record.interactions = [...previous, interaction].slice(-32);
    this.flush();
    return {
      navigationId: this.navigationId,
      interactionId: interaction.interactionId,
      startedAt,
      tracker: this,
    };
  }

  completeInteraction(
    interactionId: string,
    status: "completed" | "failed" = "completed",
    visible?: boolean,
    timestamp = monotonicNow(),
  ): void {
    if (this.disconnected) return;
    const interaction = this.record.interactions?.find(
      (item) => item.interactionId === interactionId,
    );
    if (!interaction) return;
    interaction.handlerCompletedAt = Math.max(
      interaction.handlerCompletedAt ?? timestamp,
      timestamp,
    );
    interaction.status = status;
    if (visible === true) {
      interaction.resultVisibleAt = Math.max(
        interaction.resultVisibleAt ?? timestamp,
        timestamp,
      );
    } else if (visible === false) {
      interaction.errorVisibleAt = Math.max(
        interaction.errorVisibleAt ?? timestamp,
        timestamp,
      );
    }
    this.flush();
  }

  /**
   * Record the handler boundary while leaving the interaction eligible for a
   * later viewport/error marker.  This is deliberately separate from
   * completeInteraction: a synchronous tap often schedules setData work that
   * is not visible until a following render tick.
   */
  markInteractionHandlerCompleted(
    interactionId: string,
    timestamp = monotonicNow(),
  ): void {
    if (this.disconnected) return;
    const interaction = this.record.interactions?.find(
      (item) => item.interactionId === interactionId,
    );
    if (!interaction || interaction.status === "failed") return;
    interaction.handlerCompletedAt = Math.max(
      interaction.handlerCompletedAt ?? timestamp,
      timestamp,
    );
    interaction.status = "completed";
    this.flush();
  }

  private completePendingInteractions(
    status: "completed" | "failed",
    timestamp: number,
    visible: boolean,
  ): void {
    const pending = [...(this.record.interactions ?? [])]
      .reverse()
      .find(
        (interaction) =>
          interaction.status !== "failed" &&
          interaction.resultVisibleAt === undefined &&
          interaction.errorVisibleAt === undefined,
      );
    if (pending) {
      this.completeInteraction(pending.interactionId, status, visible, timestamp);
    }
  }

  /**
   * Keep the primary viewport metric, but defer route_ready_ms until the
   * caller marks the parallel/secondary work complete.
   */
  expectSecondaryCompletion(): void {
    if (this.disconnected) return;
    this.secondaryCompletionExpected = true;
  }

  countOperation(network: boolean): void {
    if (this.disconnected) return;
    this.record.operationCount += 1;
    if (network) this.record.networkOperationCount += 1;
    this.flush();
  }

  observePrimary(selector = "#perf-primary-content"): void {
    if (this.disconnected || this.visibleRecorded) return;
    this.pendingSetDataAt = monotonicNow();
    this.observer?.disconnect();
    const observer = this.page.createIntersectionObserver?.({ nativeMode: true });
    if (!observer) return;
    this.observer = observer;
    observer.relativeToViewport().observe(
      selector,
      (entry: WechatMiniprogram.IntersectionObserverObserveCallbackResult) => {
        if (this.disconnected || this.visibleRecorded || entry.intersectionRatio <= 0) return;
        this.visibleRecorded = true;
        const visibleAt = monotonicNow();
        if (hasVisibleError(this.page.data)) {
          this.mark("errorVisibleAt");
        }
        if (this.record.primarySetDataAt === undefined) {
          this.record.primarySetDataAt = this.pendingSetDataAt;
        }
        this.record.primaryViewportVisibleAt = visibleAt;
        if (!hasVisibleError(this.page.data)) {
          this.completePendingInteractions("completed", visibleAt, true);
        }
        this.updateCompleteAt();
        this.flush(!this.secondaryCompletionExpected);
        observer.disconnect();
        if (this.observer === observer) this.observer = undefined;
        this.finishRequestAttribution();
      }
    );
  }

  /**
   * Observe a target area for a same-page action. A handler/setData marker is
   * not enough to call an interaction complete: the target must actually enter
   * the viewport. The result is kept on the pending interaction so route-level
   * default/on-demand stage timestamps remain independent.
   */
  observeInteractionVisible(selector: string): void {
    this.observeMarkerVisible(selector);
  }

  /**
   * Observe an optional module and record its page-level visibility marker as
   * well as completing the pending interaction that opened it.
   */
  observeOnDemandVisible(selector: string): void {
    this.observeMarkerVisible(selector, "onDemandVisibleAt");
  }

  private observeMarkerVisible(
    selector: string,
    marker?: "onDemandVisibleAt",
  ): void {
    if (this.disconnected) return;
    const observer = this.page.createIntersectionObserver?.({ nativeMode: true });
    if (!observer) return;
    this.interactionObservers.add(observer);
    const cleanup = () => {
      observer.disconnect();
      this.interactionObservers.delete(observer);
    };
    observer.relativeToViewport().observe(
      selector,
      (entry: WechatMiniprogram.IntersectionObserverObserveCallbackResult) => {
        if (this.disconnected || entry.intersectionRatio <= 0) return;
        cleanup();
        if (hasVisibleError(this.page.data)) {
          this.mark("errorVisibleAt");
          return;
        }
        if (marker) this.mark(marker);
        this.completePendingInteractions("completed", monotonicNow(), true);
      },
    );
  }

  disconnect(): void {
    this.disconnected = true;
    this.observer?.disconnect();
    this.observer = undefined;
    for (const observer of this.interactionObservers) observer.disconnect();
    this.interactionObservers.clear();
    this.finishRequestAttribution();
  }

  private finishRequestAttribution(): void {
    if (activeTracker === this) setActiveTracker(undefined);
  }

  private updateCompleteAt(): void {
    const primaryVisibleAt = this.record.primaryViewportVisibleAt;
    if (primaryVisibleAt === undefined) return;
    // An error surface can be the first element in the viewport. Keep its
    // error boundary separate from successful route completion so an auth or
    // network error page never enters the success telemetry bucket. If a
    // later refresh fails after a successful commit, the earlier completion
    // remains a valid record and errorVisibleAt still explains the refresh.
    if (
      this.record.errorVisibleAt !== undefined &&
      this.record.completeAt === undefined
    ) {
      return;
    }
    this.record.completeAt = Math.max(
      primaryVisibleAt,
      this.record.secondaryCompleteAt ?? primaryVisibleAt
    );
  }

  private flush(routeReadyFinal = false): void {
    recordPagePerformance(this.record, { routeReadyFinal });
  }
}
