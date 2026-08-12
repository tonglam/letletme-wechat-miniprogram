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
};

function schedulePrimaryObservation(page: InstrumentedPage): void {
  const observe = () => page.__performanceTracker?.observePrimary();
  if (typeof wx !== "undefined" && typeof wx.nextTick === "function") {
    wx.nextTick(observe);
    return;
  }
  observe();
}

function startTracker(
  page: InstrumentedPage,
  trigger: "cold-launch" | "warm-enter" | "refresh"
): void {
  page.__performanceTracker?.disconnect();
  page.__performanceTracker = new PagePerformanceTracker(
    page,
    page.route || "unknown",
    trigger
  );
}

function wrapSetData(page: InstrumentedPage): void {
  if (page.__performanceSetDataWrapped || typeof page.setData !== "function") return;
  page.__performanceSetDataWrapped = true;
  const original = page.setData.bind(page);
  page.setData = (data: object, callback?: () => void) => {
    original(data, () => {
      callback?.();
      schedulePrimaryObservation(page);
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
      startTracker(this, "cold-launch");
      const result = originalOnLoad?.apply(this, args);
      void Promise.resolve(result).finally(() => schedulePrimaryObservation(this));
      return result;
    },
    onShow(this: InstrumentedPage, ...args: unknown[]) {
      if (this.__performanceShown) {
        startTracker(this, "warm-enter");
      }
      this.__performanceShown = true;
      const result = originalOnShow?.apply(this, args);
      void Promise.resolve(result).finally(() => schedulePrimaryObservation(this));
      return result;
    },
    onPullDownRefresh(this: InstrumentedPage, ...args: unknown[]) {
      startTracker(this, "refresh");
      const result = originalOnPullDownRefresh?.apply(this, args);
      void Promise.resolve(result).finally(() => schedulePrimaryObservation(this));
      return result;
    },
    onHide(this: InstrumentedPage, ...args: unknown[]) {
      this.__performanceTracker?.disconnect();
      return originalOnHide?.apply(this, args);
    },
    onUnload(this: InstrumentedPage, ...args: unknown[]) {
      this.__performanceTracker?.disconnect();
      return originalOnUnload?.apply(this, args);
    }
  } as Parameters<typeof Page>[0]);
}) as typeof Page;
