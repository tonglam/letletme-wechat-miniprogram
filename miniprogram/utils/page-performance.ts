import { recordPagePerformance, type PagePerformanceRecord } from "./perf";

type PageOwner = {
  createIntersectionObserver?: (
    options: WechatMiniprogram.CreateIntersectionObserverOption
  ) => WechatMiniprogram.IntersectionObserver;
};

function monotonicNow(): number {
  try {
    const performance = wx.getPerformance() as unknown as { now?: () => number };
    return performance.now?.() ?? Date.now();
  } catch {
    return Date.now();
  }
}

let sequence = 0;
let activeTracker: PagePerformanceTracker | undefined;

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
  private pendingSetDataAt?: number;
  private record: Omit<PagePerformanceRecord, "ts">;

  constructor(
    private readonly page: PageOwner,
    route: string,
    trigger: PagePerformanceRecord["trigger"]
  ) {
    sequence += 1;
    this.route = route;
    this.trigger = trigger;
    this.navigationId = `${route}:${Date.now().toString(36)}:${sequence.toString(36)}`;
    this.record = {
      navigationId: this.navigationId,
      route,
      trigger,
      routeStartedAt: monotonicNow(),
      operationCount: 0,
      networkOperationCount: 0
    };
    setActiveTracker(this);
    this.flush();
  }

  mark(field: "contextReadyAt" | "primaryRequestStartAt" | "primaryResponseAt" | "primarySetDataAt" | "secondaryCompleteAt" | "softFailureAt"): void {
    this.record[field] = monotonicNow();
    this.flush();
    if (field === "secondaryCompleteAt" || field === "softFailureAt") {
      this.finishRequestAttribution();
    }
  }

  countOperation(network: boolean): void {
    this.record.operationCount += 1;
    if (network) this.record.networkOperationCount += 1;
    this.flush();
  }

  observePrimary(selector = "#perf-primary-content"): void {
    if (this.visibleRecorded) return;
    this.pendingSetDataAt = monotonicNow();
    this.observer?.disconnect();
    const observer = this.page.createIntersectionObserver?.({});
    if (!observer) return;
    this.observer = observer;
    observer.relativeToViewport().observe(
      selector,
      (entry: WechatMiniprogram.IntersectionObserverObserveCallbackResult) => {
        if (this.visibleRecorded || entry.intersectionRatio <= 0) return;
        this.visibleRecorded = true;
        if (this.record.primarySetDataAt === undefined) {
          this.record.primarySetDataAt = this.pendingSetDataAt;
        }
        this.record.primaryViewportVisibleAt = monotonicNow();
        this.flush();
        observer.disconnect();
        if (this.observer === observer) this.observer = undefined;
        this.finishRequestAttribution();
      }
    );
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.finishRequestAttribution();
  }

  private finishRequestAttribution(): void {
    if (activeTracker === this) setActiveTracker(undefined);
  }

  private flush(): void {
    recordPagePerformance(this.record);
  }
}
