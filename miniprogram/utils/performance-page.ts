import { PagePerformanceTracker } from "./page-performance";

type Lifecycle = (this: InstrumentedPage, ...args: unknown[]) => unknown;

type PageSetData = (data: object, callback?: () => void) => void;

type InstrumentedPage = {
  route?: string;
  setData?: PageSetData;
  createIntersectionObserver?: (
    options: WechatMiniprogram.CreateIntersectionObserverOption
  ) => WechatMiniprogram.IntersectionObserver;
  __performanceTracker?: PagePerformanceTracker;
  __performanceShown?: boolean;
  __performanceSetDataWrapped?: boolean;
  __performanceVisible?: boolean;
  __performanceGeneration?: number;
  __performancePendingLifecycles?: Record<number, number>;
};

function hasPendingLifecycle(page: InstrumentedPage, generation?: number): boolean {
  if (generation === undefined) return false;
  return (page.__performancePendingLifecycles?.[generation] ?? 0) > 0;
}

function beginLifecycle(page: InstrumentedPage, generation: number): void {
  const pending = page.__performancePendingLifecycles ?? {};
  pending[generation] = (pending[generation] ?? 0) + 1;
  page.__performancePendingLifecycles = pending;
}

function finishLifecycle(page: InstrumentedPage, generation: number): void {
  const pending = page.__performancePendingLifecycles;
  const count = pending?.[generation] ?? 0;
  if (count > 1) {
    pending![generation] = count - 1;
    return;
  }
  if (pending) delete pending[generation];
  schedulePrimaryObservation(page, generation);
}

function schedulePrimaryObservation(
  page: InstrumentedPage,
  generation = page.__performanceGeneration
): void {
  const observe = () => {
    if (!page.__performanceVisible || page.__performanceGeneration !== generation) return;
    page.__performanceTracker?.observePrimary();
  };
  if (typeof wx !== "undefined" && typeof wx.nextTick === "function") {
    wx.nextTick(observe);
    return;
  }
  observe();
}

function observeLifecycleSettlement(
  result: unknown,
  page: InstrumentedPage,
  generation: number
): void {
  const settled = () => finishLifecycle(page, generation);
  void Promise.resolve(result).then(settled, settled);
}

function startTracker(
  page: InstrumentedPage,
  trigger: "cold-launch" | "warm-enter" | "refresh"
): number {
  page.__performanceTracker?.disconnect();
  const generation = (page.__performanceGeneration ?? 0) + 1;
  page.__performanceGeneration = generation;
  page.__performanceTracker = new PagePerformanceTracker(
    page,
    page.route || "unknown",
    trigger
  );
  return generation;
}

function stopTracker(page: InstrumentedPage): void {
  page.__performanceVisible = false;
  page.__performanceGeneration = (page.__performanceGeneration ?? 0) + 1;
  page.__performancePendingLifecycles = {};
  page.__performanceTracker?.disconnect();
}

function wrapSetData(page: InstrumentedPage): void {
  if (page.__performanceSetDataWrapped || typeof page.setData !== "function") return;
  page.__performanceSetDataWrapped = true;
  const original = page.setData.bind(page);
  page.setData = (data: object, callback?: () => void) => {
    const generation = page.__performanceGeneration;
    original(data, () => {
      callback?.();
      // Cached/intermediate commits must not close a refresh or navigation
      // measurement while its owning lifecycle is still awaiting the network.
      if (!hasPendingLifecycle(page, generation)) {
        schedulePrimaryObservation(page, generation);
      }
    });
  };
}

/**
 * Page registration with viewport-visible instrumentation for ordinary pages.
 * P0 pages keep their explicit stage markers; this wrapper covers pages whose
 * primary boundary is simply the first rendered data, empty, or error state.
 */
export const PerformancePage = ((options: unknown): void => {
  const definition = options as Record<string, unknown>;
  const originalOnLoad = definition.onLoad as Lifecycle | undefined;
  const originalOnShow = definition.onShow as Lifecycle | undefined;
  const originalOnPullDownRefresh = definition.onPullDownRefresh as Lifecycle | undefined;
  const originalOnHide = definition.onHide as Lifecycle | undefined;
  const originalOnUnload = definition.onUnload as Lifecycle | undefined;

  Page({
    ...definition,
    onLoad(this: InstrumentedPage, ...args: unknown[]) {
      wrapSetData(this);
      this.__performanceVisible = true;
      const generation = startTracker(this, "cold-launch");
      beginLifecycle(this, generation);
      const result = originalOnLoad?.apply(this, args);
      observeLifecycleSettlement(result, this, generation);
      return result;
    },
    onShow(this: InstrumentedPage, ...args: unknown[]) {
      this.__performanceVisible = true;
      let generation = this.__performanceGeneration ?? 0;
      if (this.__performanceShown) {
        generation = startTracker(this, "warm-enter");
      }
      this.__performanceShown = true;
      beginLifecycle(this, generation);
      const result = originalOnShow?.apply(this, args);
      observeLifecycleSettlement(result, this, generation);
      return result;
    },
    onPullDownRefresh(this: InstrumentedPage, ...args: unknown[]) {
      const generation = startTracker(this, "refresh");
      beginLifecycle(this, generation);
      const result = originalOnPullDownRefresh?.apply(this, args);
      observeLifecycleSettlement(result, this, generation);
      return result;
    },
    onHide(this: InstrumentedPage, ...args: unknown[]) {
      stopTracker(this);
      return originalOnHide?.apply(this, args);
    },
    onUnload(this: InstrumentedPage, ...args: unknown[]) {
      stopTracker(this);
      return originalOnUnload?.apply(this, args);
    }
  } as Parameters<typeof Page>[0]);
}) as typeof Page;
