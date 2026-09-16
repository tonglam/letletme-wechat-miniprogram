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
  __performanceInteractionTokens?: Record<string, PageInteractionToken>;
  /** Synchronous wrapper depth used to avoid double-counting delegated taps. */
  __performanceInteractionDepth?: number;
  /** Explicit delegation scope for calls that continue after an await. */
  __performanceInteractionDelegationDepth?: number;
  createIntersectionObserver?: (
    options: WechatMiniprogram.CreateIntersectionObserverOption
  ) => WechatMiniprogram.IntersectionObserver;
};

type NavigationInteraction = {
  interactionId: string;
  handler: string;
  target?: string;
  startedAt: number;
  targetRoute?: string;
  sourceTracker: PagePerformanceTracker;
};

export interface PageInteractionHandoff {
  /** Restore the source action as a failed interaction when navigation rejects. */
  rollback(): void;
}

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
// A destination tracker may be created after more than one redirect has been
// dispatched (for example two rapid tab taps). Keep each handoff independent
// so a later action cannot overwrite the earlier source record or rollback.
const pendingNavigationInteractions: NavigationInteraction[] = [];

function normalizeRoute(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const route = value.split("?")[0]?.replace(/^\/+/, "");
  return route || undefined;
}

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

/**
 * The owner of a rendered surface must tell the tracker whether that exact
 * surface is showing an error. Page data also contains independent errors for
 * hidden tabs and optional modules, so scanning every key is ambiguous.
 */
export interface PagePerformanceObservationOptions {
  errorVisible?: boolean;
  /** Bind this viewport marker to the interaction that scheduled it. */
  interactionId?: string;
}

export interface PagePerformanceInstrumentationOptions {
  /** Handlers that own an explicit result/on-demand viewport boundary. */
  explicitInteractionHandlers?: readonly string[];
  /**
   * WXML handlers whose names do not follow the onXxx convention (for example
   * account-link actions and list pagination callbacks).
   */
  includeInteractionHandlers?: readonly string[];
  /** Page-owned classifier for the primary rendered error surface. */
  primaryError?: (data: object | undefined) => boolean;
}

function defaultPrimaryError(data: object | undefined): boolean {
  const value = data as Record<string, unknown> | undefined;
  return typeof value?.error === "string" && value.error.length > 0;
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

function scheduleInteractionVisibility(
  token: PageInteractionToken | null,
  page: PageOwner,
  primaryError: (data: object | undefined) => boolean = defaultPrimaryError,
): void {
  if (!token) return;
  const observe = () => {
    token.tracker.observeInteractionVisible(undefined, {
      errorVisible: primaryError(page.data),
      interactionId: token.interactionId,
    });
  };
  if (typeof wx !== "undefined" && typeof wx.nextTick === "function") {
    wx.nextTick(observe);
  } else {
    observe();
  }
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

/** Return the token created by the generic wrapper for a handler in progress. */
export function getPageInteractionToken(
  page: unknown,
  handler: string,
): PageInteractionToken | null {
  const owner = page as PageOwner | null | undefined;
  return owner?.__performanceInteractionTokens?.[handler] ?? null;
}

/**
 * Return the most recent unfinished interaction on the visible page. This is
 * used by the navigation helpers to hand a user action to the destination
 * page before the source page is hidden.
 */
export function getCurrentPageInteractionToken(): PageInteractionToken | null {
  let page: PageOwner | undefined;
  try {
    const pages = getCurrentPages();
    page = pages?.[pages.length - 1] as PageOwner | undefined;
  } catch {
    page = undefined;
  }
  if (!page) return null;
  const tokens = Object.values(page.__performanceInteractionTokens ?? {})
    .filter((token) => token.tracker.hasPendingInteraction(token.interactionId))
    .sort((left, right) => right.startedAt - left.startedAt);
  return tokens[0] ?? null;
}

/**
 * Move the current user action to the route that a navigation helper is about
 * to open. The destination tracker adopts the same interaction id and start
 * time, so a source-page tap is measured until the destination content is
 * actually visible. The source record is retired to avoid duplicate samples;
 * callers must invoke the returned rollback when the navigation API rejects.
 */
export function handoffPageInteraction(
  targetRoute?: string,
  sourceToken?: PageInteractionToken | null,
): PageInteractionHandoff | null {
  // `null` is an explicit "no source action" value for component-owned
  // handlers. Existing page callers omit the argument and continue to use the
  // visible page's most recent pending token.
  const token =
    sourceToken === undefined ? getCurrentPageInteractionToken() : sourceToken;
  if (!token) return null;
  const interaction = token.tracker.takeInteractionForNavigation(token.interactionId);
  if (!interaction) return null;
  const pending: NavigationInteraction = {
    ...interaction,
    targetRoute: normalizeRoute(targetRoute),
  };
  pendingNavigationInteractions.push(pending);
  return {
    rollback: () => {
      const index = pendingNavigationInteractions.indexOf(pending);
      if (index < 0) return;
      pendingNavigationInteractions.splice(index, 1);
      pending.sourceTracker.restoreInteractionFromNavigation(pending);
    },
  };
}

/**
 * Mark a call as an explicit delegated continuation. Unlike the page-wide
 * wrapper depth, this scope lasts only for the call that is being delegated,
 * so unrelated user events can still create their own interaction records
 * while an async handler is suspended.
 */
export function runPageInteractionDelegation<T>(
  page: unknown,
  delegate: () => T,
): T {
  const owner = page as PageOwner;
  owner.__performanceInteractionDelegationDepth =
    (owner.__performanceInteractionDelegationDepth ?? 0) + 1;
  try {
    return delegate();
  } finally {
    owner.__performanceInteractionDelegationDepth = Math.max(
      0,
      (owner.__performanceInteractionDelegationDepth ?? 1) - 1,
    );
  }
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
 * uses it for ordinary pages. A resolved handler records its execution
 * boundary, then observes the primary result boundary on the following render
 * tick. Route-specific pages can replace that default with an on-demand
 * observer for drawers and other secondary surfaces.
 */
export function instrumentPageInteractions<
  TData extends WechatMiniprogram.Page.DataOption,
  TCustom extends WechatMiniprogram.Page.CustomOption,
>(
  definition: WechatMiniprogram.Page.Options<TData, TCustom>,
  options?: PagePerformanceInstrumentationOptions,
): WechatMiniprogram.Page.Options<TData, TCustom>;
export function instrumentPageInteractions<T extends Record<string, unknown>>(
  definition: T,
  options: PagePerformanceInstrumentationOptions = {},
): T {
  const instrumented = { ...definition } as T;
  const explicitInteractionHandlers = new Set(
    options.explicitInteractionHandlers ?? [],
  );
  const includedInteractionHandlers = new Set(
    options.includeInteractionHandlers ?? [],
  );
  const primaryError = options.primaryError ?? defaultPrimaryError;
  for (const [name, value] of Object.entries(definition)) {
    if (
      PAGE_LIFECYCLE_HANDLERS.has(name) ||
      (name !== "loadMore" && !/^on[A-Z]/.test(name) && !includedInteractionHandlers.has(name)) ||
      typeof value !== "function"
    ) {
      continue;
    }
    const handler = value as (...args: unknown[]) => unknown;
    (instrumented as Record<string, unknown>)[name] = function (
      this: PageOwner,
      ...args: unknown[]
    ): unknown {
      // Page handlers sometimes delegate to another on* handler (for example
      // an empty-state action calling the shared retry method). Both methods
      // are wrapped in this loop, but the delegation is still one user event.
      // Bypass a nested wrapper for the synchronous call stack or an explicit
      // delegated continuation so it cannot create a second interaction
      // record or visibility observer. The synchronous depth is released as
      // soon as a promise is returned; it must not span independent events.
      if (
        (this.__performanceInteractionDepth ?? 0) > 0 ||
        (this.__performanceInteractionDelegationDepth ?? 0) > 0
      ) {
        return handler.apply(this, args);
      }
      this.__performanceInteractionDepth =
        (this.__performanceInteractionDepth ?? 0) + 1;
      let token = beginPageInteraction(name, name);
      if (token) {
        this.__performanceInteractionTokens = {
          ...(this.__performanceInteractionTokens ?? {}),
          [name]: token,
        };
      }
      const explicitBoundary = explicitInteractionHandlers.has(name);
      const rebindToCurrentTracker = () => {
        if (!token) return;
        const currentTracker =
          this.__performanceTracker ?? getCurrentPagePerformanceTracker();
        if (currentTracker && currentTracker !== token.tracker) {
          token = currentTracker.rebindInteraction(token);
          this.__performanceInteractionTokens = {
            ...(this.__performanceInteractionTokens ?? {}),
            [name]: token,
          };
        }
      };
      const settleHandler = () => {
        rebindToCurrentTracker();
        token?.tracker.markInteractionHandlerCompleted(token.interactionId);
        if (!explicitBoundary) {
          scheduleInteractionVisibility(token, this, primaryError);
        }
      };
      let result: unknown;
      let depthReleased = false;
      const releaseDepth = () => {
        if (depthReleased) return;
        depthReleased = true;
        this.__performanceInteractionDepth = Math.max(
          0,
          (this.__performanceInteractionDepth ?? 1) - 1,
        );
      };
      try {
        try {
          result = handler.apply(this, args);
        } catch (error) {
          rebindToCurrentTracker();
          token?.tracker.completeInteraction(token.interactionId, "failed", false);
          releaseDepth();
          throw error;
        }
      } catch (error) {
        releaseDepth();
        throw error;
      }
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        releaseDepth();
        void Promise.resolve(result).then(
          () => {
            settleHandler();
          },
          () => {
            rebindToCurrentTracker();
            token?.tracker.completeInteraction(token.interactionId, "failed");
          },
        );
      } else {
        try {
          settleHandler();
        } finally {
          releaseDepth();
        }
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
  private primarySelector = "#perf-primary-content";
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
    this.adoptPendingNavigationInteraction();
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
    ,
    interactionId?: string,
  ): void {
    if (this.disconnected) return;
    const timestamp = monotonicNow();
    const previous = this.record[field];
    this.record[field] =
      field === "defaultContentAt"
        ? (previous ?? timestamp)
        : previous === undefined
          ? timestamp
          : Math.max(previous, timestamp);
    if (field === "errorVisibleAt") {
      this.completePendingInteractions("failed", timestamp, false, interactionId);
    }
    const finalCompletion = field === "secondaryCompleteAt";
    if (finalCompletion) this.secondaryCompletionExpected = false;
    this.updateCompleteAt();
    this.flush(finalCompletion);
    if (field === "secondaryCompleteAt") {
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
    // A rejected navigation restores the source interaction as terminally
    // failed. A previously scheduled viewport observer may still fire on the
    // source page; it must not turn that failure back into a successful tap.
    if (interaction.status === "failed" && status !== "failed") return;
    interaction.handlerCompletedAt ??= timestamp;
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
    interactionId?: string,
  ): void {
    const pending = interactionId
      ? this.record.interactions?.find(
          (interaction) =>
            interaction.interactionId === interactionId &&
            interaction.status !== "failed" &&
            interaction.resultVisibleAt === undefined &&
            interaction.errorVisibleAt === undefined,
        )
      : [...(this.record.interactions ?? [])]
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

  hasPendingInteraction(interactionId: string): boolean {
    const interaction = this.record.interactions?.find(
      (item) => item.interactionId === interactionId,
    );
    return Boolean(
      interaction &&
        interaction.status !== "failed" &&
        interaction.resultVisibleAt === undefined &&
        interaction.errorVisibleAt === undefined,
    );
  }

  observePrimary(
    selector = this.primarySelector,
    options: PagePerformanceObservationOptions = {},
  ): void {
    this.primarySelector = selector;
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
        if (options.errorVisible === true) {
          this.mark("errorVisibleAt");
        }
        if (this.record.primarySetDataAt === undefined) {
          this.record.primarySetDataAt = this.pendingSetDataAt;
        }
        this.record.primaryViewportVisibleAt = visibleAt;
        if (options.errorVisible !== true) {
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
  observeInteractionVisible(
    selector = this.primarySelector,
    options: PagePerformanceObservationOptions = {},
  ): void {
    this.observeMarkerVisible(selector, undefined, options, options.interactionId);
  }

  /**
   * Observe an optional module and record its page-level visibility marker as
   * well as completing the pending interaction that opened it.
   */
  observeOnDemandVisible(
    selector: string,
    options: PagePerformanceObservationOptions = {},
  ): void {
    this.observeMarkerVisible(
      selector,
      "onDemandVisibleAt",
      options,
      options.interactionId,
    );
  }

  private observeMarkerVisible(
    selector: string,
    marker?: "onDemandVisibleAt",
    options: PagePerformanceObservationOptions = {},
    interactionId?: string,
  ): void {
    if (this.disconnected) return;
    const boundInteractionId =
      interactionId ?? options.interactionId ?? this.findPendingInteractionId();
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
        if (options.errorVisible === true) {
          this.mark("errorVisibleAt", boundInteractionId);
          return;
        }
        if (marker) this.mark(marker);
        const visibleAt = monotonicNow();
        if (boundInteractionId) {
          this.completeInteraction(boundInteractionId, "completed", true, visibleAt);
        } else {
          this.completePendingInteractions("completed", visibleAt, true);
        }
      },
    );
  }

  private findPendingInteractionId(): string | undefined {
    return [...(this.record.interactions ?? [])]
      .reverse()
      .find(
        (interaction) =>
          interaction.status !== "failed" &&
          interaction.resultVisibleAt === undefined &&
          interaction.errorVisibleAt === undefined,
      )?.interactionId;
  }

  /**
   * Move an interaction to a replacement tracker while preserving the event
   * start time. Route-specific handlers may replace their tracker synchronously
   * (for example when changing GW); the wrapper must keep that action alive.
   */
  rebindInteraction(token: PageInteractionToken): PageInteractionToken {
    if (this.disconnected || token.tracker === this) return token;
    const sourceTracker = token.tracker;
    const source = sourceTracker.readInteraction(token.interactionId);
    if (!source) return token;
    // The source tracker may already be disconnected when a route-specific
    // handler creates its replacement. Remove the copied interaction there so
    // the persisted page record contains one action, owned by the replacement.
    sourceTracker.retireInteraction(token.interactionId);
    interactionSequence += 1;
    const interactionId = `${this.navigationId}:action:${interactionSequence.toString(36)}`;
    const interaction: PageInteractionRecord = {
      interactionId,
      handler: source.handler,
      ...(source.target ? { target: source.target } : {}),
      startedAt: token.startedAt,
      status: "started",
    };
    const previous = this.record.interactions ?? [];
    this.record.interactions = [...previous, interaction].slice(-32);
    this.flush();
    return {
      ...token,
      interactionId,
      navigationId: this.navigationId,
      tracker: this,
    };
  }

  takeInteractionForNavigation(
    interactionId: string,
  ): NavigationInteraction | null {
    const interaction = this.readInteraction(interactionId);
    if (!interaction || !this.hasPendingInteraction(interactionId)) return null;
    this.retireInteraction(interactionId);
    return {
      interactionId: interaction.interactionId,
      handler: interaction.handler,
      ...(interaction.target ? { target: interaction.target } : {}),
      startedAt: interaction.startedAt,
      sourceTracker: this,
    };
  }

  restoreInteractionFromNavigation(interaction: NavigationInteraction): void {
    if (this.readInteraction(interaction.interactionId)) return;
    const restored: PageInteractionRecord = {
      interactionId: interaction.interactionId,
      handler: interaction.handler,
      ...(interaction.target ? { target: interaction.target } : {}),
      startedAt: interaction.startedAt,
      handlerCompletedAt: monotonicNow(),
      status: "failed",
    };
    const previous = this.record.interactions ?? [];
    this.record.interactions = [...previous, restored].slice(-32);
    this.flush();
  }

  private adoptPendingNavigationInteraction(): void {
    const route = normalizeRoute(this.route);
    const pendingIndex = pendingNavigationInteractions.findIndex(
      (candidate) =>
        !candidate.targetRoute || !route || candidate.targetRoute === route,
    );
    if (pendingIndex < 0) return;
    const [pending] = pendingNavigationInteractions.splice(pendingIndex, 1);
    const previous = this.record.interactions ?? [];
    if (previous.some((interaction) => interaction.interactionId === pending.interactionId)) {
      return;
    }
    this.record.interactions = [
      ...previous,
      {
        interactionId: pending.interactionId,
        handler: pending.handler,
        ...(pending.target ? { target: pending.target } : {}),
        startedAt: pending.startedAt,
        status: "started" as const,
      },
    ].slice(-32);
    this.flush();
  }

  private readInteraction(interactionId: string): PageInteractionRecord | null {
    return (
      this.record.interactions?.find(
        (interaction) => interaction.interactionId === interactionId,
      ) ?? null
    );
  }

  private retireInteraction(interactionId: string): void {
    const previous = this.record.interactions;
    if (!previous?.some((interaction) => interaction.interactionId === interactionId)) {
      return;
    }
    this.record.interactions = previous.filter(
      (interaction) => interaction.interactionId !== interactionId,
    );
    this.flush();
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
