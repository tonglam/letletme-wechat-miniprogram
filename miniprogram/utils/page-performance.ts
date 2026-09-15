import { recordPagePerformance, type PagePerformanceRecord } from "./perf";

type PageOwner = {
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

export function getActivePagePerformanceTrace(): ActivePagePerformanceTrace | null {
  if (!activeTracker) return null;
  return {
    navigationId: activeTracker.navigationId,
    route: activeTracker.route,
    trigger: activeTracker.trigger
  };
}

export class PagePerformanceTracker {
  readonly navigationId: string;
  readonly route: string;
  readonly trigger: PagePerformanceRecord["trigger"];
  private observer?: WechatMiniprogram.IntersectionObserver;
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
      | "secondaryCompleteAt"
      | "softFailureAt"
  ): void {
    if (this.disconnected) return;
    this.record[field] = monotonicNow();
    const finalCompletion = field === "secondaryCompleteAt" || field === "softFailureAt";
    if (finalCompletion) this.secondaryCompletionExpected = false;
    this.updateCompleteAt();
    this.flush(finalCompletion);
    if (field === "secondaryCompleteAt" || field === "softFailureAt") {
      this.finishRequestAttribution();
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
        if (this.record.primarySetDataAt === undefined) {
          this.record.primarySetDataAt = this.pendingSetDataAt;
        }
        this.record.primaryViewportVisibleAt = monotonicNow();
        this.updateCompleteAt();
        this.flush(!this.secondaryCompletionExpected);
        observer.disconnect();
        if (this.observer === observer) this.observer = undefined;
        this.finishRequestAttribution();
      }
    );
  }

  disconnect(): void {
    this.disconnected = true;
    this.observer?.disconnect();
    this.observer = undefined;
    this.finishRequestAttribution();
  }

  private finishRequestAttribution(): void {
    if (activeTracker === this) setActiveTracker(undefined);
  }

  private updateCompleteAt(): void {
    const primaryVisibleAt = this.record.primaryViewportVisibleAt;
    if (primaryVisibleAt === undefined) return;
    this.record.completeAt = Math.max(
      primaryVisibleAt,
      this.record.secondaryCompleteAt ?? primaryVisibleAt
    );
  }

  private flush(routeReadyFinal = false): void {
    recordPagePerformance(this.record, { routeReadyFinal });
  }
}
