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

function resolveTrigger(
  requested: PagePerformanceRecord["trigger"]
): PagePerformanceRecord["trigger"] {
  if (requested !== "cold-launch") return requested;
  if (coldLaunchClaimed) return "warm-enter";
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
  private pendingSetDataAt?: number;
  private record: Omit<PagePerformanceRecord, "ts">;

  constructor(
    private readonly page: PageOwner,
    route: string,
    trigger: PagePerformanceRecord["trigger"]
  ) {
    sequence += 1;
    this.route = route;
    this.trigger = resolveTrigger(trigger);
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
    this.updateCompleteAt();
    this.flush();
    if (field === "secondaryCompleteAt" || field === "softFailureAt") {
      this.finishRequestAttribution();
    }
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
        this.flush();
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

  private flush(): void {
    recordPagePerformance(this.record);
  }
}
