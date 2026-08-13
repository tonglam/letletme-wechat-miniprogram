import {
  readCoreEventFixtureSchedule
} from "../../../services/fixture.service";
import { getEntryInfo } from "../../../services/entry.service";
import { getApiSessionToken } from "../../../services/auth.service";
import { getMiniHomeSupplement } from "../../../services/home.service";
import type { Fixture } from "../../../models/common";
import type { EntryInfo } from "../../../models/entry";
import type { PlayerValue } from "../../../models/player";
import type { GameweekOverallSummary, SummaryChipPlay } from "../../../models/summary";
import { routes } from "../../../config/routes";
import { goToEntryProfile, goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { formatCountdown, formatDateKey, getDeadlineDiffMs } from "../../../utils/date";
import type { CountdownParts } from "../../../utils/date";
import { formatPrice } from "../../../utils/fpl";
import { recordHomeFixtureTiming, recordRenderCommit } from "../../../utils/perf";
import {
  ensureAppContext,
  getAppContextSnapshot
} from "../../../services/app-context.service";
import { PagePerformanceTracker } from "../../../utils/page-performance";
import type { PageRequestTrace } from "../../../services/graphql.service";
import { observeSoftTimeout, setDataAsync } from "../../../utils/page-request";

interface HomeData {
  loading: boolean;
  fixtureLoading: boolean;
  fixtureError: string;
  fixtureStaleMessage: string;
  fixtureStoredAt: number | null;
  fixtureStaleStoredAt: number | null;
  error: string;
  entryError: string;
  priceError: string;
  gameweekStatsError: string;
  supplementLoading: boolean;
  entry: EntryInfo;
  fixtureRows: HomeFixtureRow[];
  priceRises: HomePriceChangeRow[];
  priceFalls: HomePriceChangeRow[];
  gameweekStats: HomeStatRow[];
  noticeText: string;
  noticeClosed: boolean;
  gw: number;
  nextGw: number;
  selectedFixtureGw: number;
  minFixtureGw: number;
  deadline: string;
  utcDeadline: string;
  countdown: CountdownParts;
}

interface HomeFixtureRow {
  id: string;
  homeName: string;
  awayName: string;
  kickoffTime: string;
  kickoffLabel: string;
  homeDifficulty?: number;
  awayDifficulty?: number;
  teamId?: number | string;
  againstTeamId?: number | string;
}

interface HomePriceChangeRow {
  id: string;
  name: string;
  team: string;
  position: string;
  oldPrice: string;
  newPrice: string;
  changeText: string;
}

interface HomeStatRow {
  key: string;
  label: string;
  value: string;
}

const HOME_REVALIDATE_MS = 60 * 1000;
const HOME_DEADLINE_RETRY_MS = 60 * 1000;

export function shouldReloadHome(
  lastLoadAt: number,
  loadedContextRevision: number,
  currentContextRevision: number,
  now = Date.now()
): boolean {
  return loadedContextRevision !== currentContextRevision
    || !lastLoadAt
    || now - lastLoadAt >= HOME_REVALIDATE_MS;
}

export function fixtureStaleMessage(storedAt?: number | null): string {
  if (!storedAt) return "当前为上次成功赛程";
  const date = new Date(storedAt);
  if (Number.isNaN(date.getTime())) return "当前为上次成功赛程";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `当前为上次成功赛程 · ${hours}:${minutes}`;
}

Page({
  data: {
    loading: false,
    fixtureLoading: false,
    fixtureError: "",
    fixtureStaleMessage: "",
    fixtureStoredAt: null,
    fixtureStaleStoredAt: null,
    error: "",
    entryError: "",
    priceError: "",
    gameweekStatsError: "",
    supplementLoading: false,
    entry: {},
    fixtureRows: [],
    priceRises: [],
    priceFalls: [],
    gameweekStats: [],
    noticeText: "",
    noticeClosed: false,
    gw: 0,
    nextGw: 0,
    selectedFixtureGw: 0,
    minFixtureGw: 0,
    deadline: "",
    utcDeadline: "",
    countdown: formatCountdown(0)
  } as HomeData,

  countdownTimer: undefined as number | undefined,
  _initialLoadDone: false,
  _lastLoadAt: 0,
  _loadRequestId: 0,
  _fixtureGwRequestId: 0,
  _loadedContextRevision: 0,
  _perfTracker: undefined as PagePerformanceTracker | undefined,
  _pageVisible: false,
  _secondaryPending: false,
  _resumeSecondaryOnShow: false,
  _startupPending: false,
  _resumeStartupOnShow: false,
  _refreshPending: false,
  _resumeRefreshOnShow: false,
  _activeRefreshDeadlineTriggered: false,
  _resumeRefreshDeadlineTriggered: false,
  _refreshRequestId: 0,
  _hasShown: false,
  _lifecycleRevision: 0,

  onLoad() {
    this._pageVisible = true;
    this._initialLoadDone = false;
    return this.startHomeLifecycle("cold-launch", "page-load");
  },

  async onShow() {
    this._pageVisible = true;
    const resumed = this._hasShown;
    this._hasShown = true;
    if (!resumed) return;
    if (this._resumeRefreshOnShow) {
      const deadlineTriggered = this._resumeRefreshDeadlineTriggered;
      this._resumeRefreshOnShow = false;
      this._resumeRefreshDeadlineTriggered = false;
      this._perfTracker = deadlineTriggered
        ? undefined
        : new PagePerformanceTracker(this, "pages/home/index/index", "refresh");
      await this.refreshHome(deadlineTriggered);
      return;
    }
    if (this._resumeStartupOnShow) {
      this._resumeStartupOnShow = false;
      await this.startHomeLifecycle("warm-enter", "page-show");
      return;
    }
    if (!this._initialLoadDone) return;
    this._perfTracker = new PagePerformanceTracker(this, "pages/home/index/index", "warm-enter");
    const tracker = this._perfTracker;
    const lifecycleRevision = this._lifecycleRevision;
    try {
      const context = await ensureAppContext({ reason: "page-show" });
      if (
        !this._pageVisible
        || lifecycleRevision !== this._lifecycleRevision
        || tracker !== this._perfTracker
      ) return;
      tracker.mark("contextReadyAt");
      this.syncAppState();
      if (shouldReloadHome(
        this._lastLoadAt,
        this._loadedContextRevision,
        context.contextRevision
      )) {
        this._resumeSecondaryOnShow = false;
        this._loadedContextRevision = context.contextRevision;
        void this.loadPage();
      } else {
        wx.nextTick(() => tracker.observePrimary("#perf-primary-fixtures"));
        recordHomeFixtureTiming({
          surface: "home-fixtures",
          trigger: "onShow",
          mode: "warm",
          requestDuration: 0,
          responseToSetData: 0,
          setDataCallback: 0,
          loadToVisible: 0
        });
        if (this._resumeSecondaryOnShow) {
          this._resumeSecondaryOnShow = false;
          this.startSecondaryData();
        }
      }
    } catch (error) {
      if (this._pageVisible) this.showContextError(error);
    }
    this.startCountdown();
  },

  async startHomeLifecycle(
    trigger: "cold-launch" | "warm-enter",
    reason: "page-load" | "page-show"
  ) {
    const lifecycleRevision = this._lifecycleRevision;
    this._startupPending = true;
    this._perfTracker?.disconnect();
    const tracker = new PagePerformanceTracker(this, "pages/home/index/index", trigger);
    this._perfTracker = tracker;
    const isActiveLifecycle = () => (
      this._pageVisible
      && lifecycleRevision === this._lifecycleRevision
      && tracker === this._perfTracker
    );
    try {
      const context = await ensureAppContext({ reason });
      if (!isActiveLifecycle()) return;
      tracker.mark("contextReadyAt");
      this._loadedContextRevision = context.contextRevision;
      await this.loadPage(false, tracker);
    } catch (error) {
      if (isActiveLifecycle()) this.showContextError(error, tracker);
    } finally {
      if (!isActiveLifecycle()) return;
      this._startupPending = false;
      this._initialLoadDone = true;
      this.startCountdown();
    }
  },

  onUnload() {
    this._pageVisible = false;
    this._resumeSecondaryOnShow = false;
    this._resumeStartupOnShow = false;
    this._resumeRefreshOnShow = false;
    this._resumeRefreshDeadlineTriggered = false;
    this._refreshPending = false;
    this._lifecycleRevision += 1;
    this._loadRequestId += 1;
    this._fixtureGwRequestId += 1;
    this._refreshRequestId += 1;
    this.stopCountdown();
    this._perfTracker?.disconnect();
  },

  onHide() {
    this._pageVisible = false;
    this._resumeStartupOnShow = this._startupPending;
    this._resumeSecondaryOnShow = this._secondaryPending;
    this._resumeRefreshOnShow = this._refreshPending;
    this._resumeRefreshDeadlineTriggered = this._activeRefreshDeadlineTriggered;
    this._lifecycleRevision += 1;
    this._loadRequestId += 1;
    this._refreshRequestId += 1;
    this.stopCountdown();
    this._perfTracker?.disconnect();
  },

  onPullDownRefresh() {
    this._perfTracker?.disconnect();
    this._perfTracker = new PagePerformanceTracker(this, "pages/home/index/index", "refresh");
    return this.refreshHome().finally(() => wx.stopPullDownRefresh());
  },

  async loadPage(
    forceRefresh = false,
    originatingTracker?: PagePerformanceTracker | null
  ) {
    this._resumeSecondaryOnShow = false;
    const tracker = originatingTracker === undefined
      ? this._perfTracker ?? null
      : originatingTracker;
    const requestId = ++this._loadRequestId;
    const app = getApp<IAppOption>();
    if (!app.globalData.gw) {
      const context = await ensureAppContext({ reason: "page-load" });
      if (!this._pageVisible || requestId !== this._loadRequestId) return false;
      this._loadedContextRevision = context.contextRevision;
      this.syncAppState();
    }

    try {
      const fixtureLoadStartedAt = Date.now();
      const fixtureRequestStartedAt = Date.now();
      const fixtureGw = clampFixtureGw(this.data.selectedFixtureGw || app.globalData.nextGw, app.globalData.nextGw);
      const currentGw = app.globalData.gw;
      const hadFixtureRows = this.data.fixtureRows.length > 0 && this.data.selectedFixtureGw === fixtureGw;
      await this.syncAppState({
        loading: !this._initialLoadDone && !hadFixtureRows,
        fixtureLoading: !hadFixtureRows,
        error: "",
        fixtureError: "",
        fixtureStaleMessage: "",
        entryError: "",
        selectedFixtureGw: fixtureGw,
        minFixtureGw: app.globalData.nextGw
      });

      let fixtureError = "";
      const snapshot = getAppContextSnapshot();
      const trace: PageRequestTrace | null = tracker && snapshot
        ? {
            navigationId: tracker.navigationId,
            callerSurface: "home-fixtures",
            trigger: forceRefresh ? "refresh" : "load",
            forceReason: forceRefresh ? "user-refresh" : undefined,
            contextRevision: snapshot.contextRevision
          }
        : null;
      tracker?.mark("primaryRequestStartAt");
      const fixtureTask = readCoreEventFixtureSchedule(
        fixtureGw,
        String(app.globalData.season || ""),
        { forceRefresh, trace }
      ).then((read) => ({
        fixtures: read.data,
        failed: false,
        stale: read.meta.stale,
        storedAt: read.meta.storedAt || Date.now()
      })).catch((error) => {
        fixtureError = error instanceof Error ? error.message : "赛程加载失败";
        return {
          fixtures: hadFixtureRows ? null : [] as Fixture[],
          failed: true,
          stale: hadFixtureRows,
          storedAt: this.data.fixtureStoredAt || undefined
        };
      });
      observeSoftTimeout(fixtureTask, 3000, () => {
        if (requestId !== this._loadRequestId) return;
        tracker?.mark("softFailureAt");
        this.setData({
          loading: false,
          fixtureLoading: false,
          fixtureError: hadFixtureRows ? "" : "赛程加载时间较长，仍在后台等待",
          fixtureStaleMessage: hadFixtureRows ? "刷新较慢，当前继续显示上次成功赛程" : ""
        });
      });
      const fixtureResult = await fixtureTask;
      if (!this._pageVisible || requestId !== this._loadRequestId) return;
      const fixtureResponseAt = Date.now();
      tracker?.mark("primaryResponseAt");
      if (fixtureResult.failed && hadFixtureRows) {
        fixtureError = "";
      }
      const staleStoredAt = fixtureResult.stale ? fixtureResult.storedAt || null : null;
      const staleMessage = fixtureResult.failed && hadFixtureRows
        ? fixtureStaleMessage(this.data.fixtureStoredAt)
        : fixtureResult.stale
          ? fixtureStaleMessage(staleStoredAt)
          : "";
      const fixtureCommitStartedAt = Date.now();
      await new Promise<void>((resolve) => {
        this.setData({
          ...(fixtureResult.fixtures === null
            ? {}
            : { fixtureRows: fixtureResult.fixtures.map(mapFixtureRow) }),
          fixtureError,
          fixtureStaleMessage: staleMessage,
          fixtureStoredAt: fixtureResult.fixtures === null
            ? this.data.fixtureStoredAt
            : fixtureResult.storedAt || Date.now(),
          fixtureStaleStoredAt: staleStoredAt,
          fixtureLoading: false,
          loading: false
        }, () => {
          tracker?.mark("primarySetDataAt");
          wx.nextTick(() => tracker?.observePrimary("#perf-primary-fixtures"));
          const fixtureSetDataCallbackAt = Date.now();
          recordRenderCommit({
            surface: "home-fixtures",
            itemCount: this.data.fixtureRows.length,
            duration: fixtureSetDataCallbackAt - fixtureCommitStartedAt
          });
          recordHomeFixtureTiming({
            surface: "home-fixtures",
            trigger: "load",
            mode: forceRefresh ? "refresh" : hadFixtureRows ? "warm" : "cold",
            requestDuration: fixtureResponseAt - fixtureRequestStartedAt,
            responseToSetData: fixtureCommitStartedAt - fixtureResponseAt,
            setDataCallback: fixtureSetDataCallbackAt - fixtureCommitStartedAt,
            loadToVisible: fixtureSetDataCallbackAt - fixtureLoadStartedAt
          });
          resolve();
        });
      });
      if (!this._pageVisible || requestId !== this._loadRequestId) return;

      this._lastLoadAt = Date.now();
      void this.loadSecondaryData(requestId, currentGw, forceRefresh, trace, tracker);
      return !fixtureResult.failed && !fixtureResult.stale;
    } catch (error) {
      if (requestId === this._loadRequestId) {
        this.setData({ error: error instanceof Error ? error.message : "首页加载失败" });
      }
      return false;
    } finally {
      if (requestId === this._loadRequestId) {
        this.setData({ loading: false, fixtureLoading: false });
      }
    }
  },

  async refreshHome(deadlineTriggered = false) {
    const tracker = deadlineTriggered ? null : this._perfTracker ?? null;
    const lifecycleRevision = this._lifecycleRevision;
    const refreshRequestId = ++this._refreshRequestId;
    const isActiveRefresh = () => (
      this._pageVisible
      && lifecycleRevision === this._lifecycleRevision
      && refreshRequestId === this._refreshRequestId
      && (tracker === null || tracker === this._perfTracker)
    );
    this._refreshPending = true;
    this._activeRefreshDeadlineTriggered = deadlineTriggered;
    this.setData({ error: "" });
    try {
      const app = getApp<IAppOption>();
      const contextMissing = !app.globalData.gw || !app.globalData.nextGw;
      const deadlineExpired = Boolean(app.globalData.utcDeadline)
        && getDeadlineDiffMs(app.globalData.utcDeadline) <= 0;
      const forceContextForUserRefresh = !deadlineTriggered;
      if (forceContextForUserRefresh || contextMissing || deadlineExpired) {
        const context = await ensureAppContext({
          forceRefresh: true,
          reason: "pull-refresh",
          trace: deadlineTriggered ? null : undefined
        });
        if (!isActiveRefresh()) return;
        this._loadedContextRevision = context.contextRevision;
        tracker?.mark("contextReadyAt");
        await this.syncAppState();
        if (!isActiveRefresh()) return;
      } else {
        tracker?.mark("contextReadyAt");
      }
      const fixtureFresh = await this.loadPage(true, tracker);
      if (!isActiveRefresh()) return;
      const refreshedDeadlineExpired = Boolean(this.data.utcDeadline)
        && getDeadlineDiffMs(this.data.utcDeadline) <= 0;
      if (deadlineTriggered && refreshedDeadlineExpired) {
        this.scheduleDeadlineRetry();
      } else {
        this.startCountdown();
      }
      if (!deadlineTriggered && fixtureFresh === true) {
        wx.showToast({ title: "刷新成功", icon: "success", duration: 1000 });
      }
    } catch (error) {
      if (!isActiveRefresh()) return;
      this.showContextError(error, tracker);
      if (deadlineTriggered) {
        this.scheduleDeadlineRetry();
      }
    } finally {
      if (isActiveRefresh()) {
        this._refreshPending = false;
        this._activeRefreshDeadlineTriggered = false;
        this.setData({ loading: false });
      }
    }
  },

  showContextError(
    error: unknown,
    originatingTracker?: PagePerformanceTracker | null
  ) {
    const tracker = originatingTracker === undefined
      ? this._perfTracker ?? null
      : originatingTracker;
    const message = error instanceof Error ? error.message : "赛季和比赛轮信息加载失败";
    const hasFixtureRows = this.data.fixtureRows.length > 0;
    const primarySelector = hasFixtureRows
      ? "#perf-primary-fixtures"
      : "#perf-primary-home-error";
    this.setData({
      loading: false,
      fixtureLoading: false,
      error: hasFixtureRows ? "" : message,
      fixtureError: "",
      fixtureStaleMessage: hasFixtureRows
        ? `${message}，当前继续显示上次成功赛程`
        : ""
    }, () => {
      tracker?.mark("primarySetDataAt");
      wx.nextTick(() => tracker?.observePrimary(primarySelector));
    });
  },

  async loadSecondaryData(
    requestId: number,
    currentGw: number,
    forceRefresh: boolean,
    primaryTrace: PageRequestTrace | null,
    tracker: PagePerformanceTracker | null
  ) {
    const isActiveSecondary = () => this._pageVisible && requestId === this._loadRequestId;
    if (!isActiveSecondary()) return;
    this._secondaryPending = true;
    const app = getApp<IAppOption>();
    this.setData({
      supplementLoading: true,
      priceError: "",
      gameweekStatsError: "",
      entryError: ""
    });
    const entryTask = (async (): Promise<void> => {
      if (!getApiSessionToken()) {
        try { await app.authReady; } catch {}
      }
      if (!isActiveSecondary()) return;
      const entryId = app.globalData.entryId;
      if (!entryId) return;
      try {
        const entryTrace: PageRequestTrace | null = primaryTrace
          ? { ...primaryTrace, callerSurface: "home-entry" }
          : null;
        const entry = await getEntryInfo(entryId, forceRefresh, entryTrace);
        if (isActiveSecondary()) this.setData({ entry, entryError: "" });
      } catch (error) {
        if (isActiveSecondary()) {
          this.setData({ entryError: error instanceof Error ? error.message : "球队信息加载失败" });
        }
      }
    })();
    const supplementTrace: PageRequestTrace | null = primaryTrace
      ? { ...primaryTrace, callerSurface: "home-supplement" }
      : null;
    const supplementTask = getMiniHomeSupplement(
      currentGw,
      formatDateKey(),
      forceRefresh,
      supplementTrace
    )
      .catch((error) => ({
        notice: "",
        summary: undefined,
        playerValues: [] as PlayerValue[],
        errors: {
          notice: "",
          summary: error instanceof Error ? error.message : "GW 数据加载失败",
          playerValues: error instanceof Error ? error.message : "身价数据加载失败"
        }
      }))
      .then((supplement) => {
        if (!isActiveSecondary()) return;
        const priceGroups = mapHomePriceChanges(supplement.playerValues);
        this.setData({
          priceError: supplement.errors.playerValues,
          gameweekStatsError: supplement.errors.summary,
          supplementLoading: false,
          ...(this.data.noticeClosed ? {} : { noticeText: supplement.notice }),
          ...(supplement.errors.playerValues && supplement.playerValues.length === 0
            ? {}
            : { priceRises: priceGroups.rises, priceFalls: priceGroups.falls }),
          ...(supplement.errors.summary && !supplement.summary
            ? {}
            : { gameweekStats: mapHomeGameweekStats(supplement.summary) })
        });
      });
    await Promise.allSettled([entryTask, supplementTask]);
    if (!isActiveSecondary()) return;
    this._secondaryPending = false;
    tracker?.mark("secondaryCompleteAt");
  },

  startSecondaryData() {
    const requestId = ++this._loadRequestId;
    const snapshot = getAppContextSnapshot();
    const tracker = this._perfTracker ?? null;
    const trace: PageRequestTrace | null = tracker && snapshot
      ? {
          navigationId: tracker.navigationId,
          callerSurface: "home-fixtures",
          trigger: "show",
          contextRevision: snapshot.contextRevision
        }
      : null;
    void this.loadSecondaryData(
      requestId,
      getApp<IAppOption>().globalData.gw,
      false,
      trace,
      tracker
    );
  },

  syncAppState(extra: Partial<HomeData> = {}): Promise<void> {
    const app = getApp<IAppOption>();
    return setDataAsync(this, {
      gw: app.globalData.gw,
      nextGw: app.globalData.nextGw,
      minFixtureGw: app.globalData.nextGw,
      selectedFixtureGw: clampFixtureGw(this.data.selectedFixtureGw || app.globalData.nextGw, app.globalData.nextGw),
      deadline: app.globalData.deadline,
      utcDeadline: app.globalData.utcDeadline,
      countdown: formatCountdown(getDeadlineDiffMs(app.globalData.utcDeadline)),
      ...extra
    });
  },

  startCountdown() {
    this.stopCountdown();
    if (!this._pageVisible) return;
    if (this.updateCountdown()) return;
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000) as unknown as number;
  },

  stopCountdown() {
    if (this.countdownTimer !== undefined) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
  },

  scheduleDeadlineRetry() {
    this.stopCountdown();
    this.countdownTimer = setTimeout(() => {
      this.countdownTimer = undefined;
      if (!this._pageVisible) return;
      void this.refreshHome(true);
    }, HOME_DEADLINE_RETRY_MS) as unknown as number;
  },

  updateCountdown(): boolean {
    const ms = getDeadlineDiffMs(this.data.utcDeadline);
    this.setData({ countdown: formatCountdown(ms) });
    if (this.data.utcDeadline && ms <= 0) {
      this.stopCountdown();
      void this.refreshHome(true);
      return true;
    }
    return false;
  },

  onRetry() {
    this.setData({ error: "" });
    void this.refreshHome().finally(() => this.startCountdown());
  },

  onCloseNotice() {
    this.setData({ noticeClosed: true, noticeText: "" });
  },

  onChangeEntry() {
    goToEntrySearch();
  },

  onGoAccountLink() {
    navigateTo(routes.accountLink);
  },

  onOpenEntry() {
    const entryId = getApp<IAppOption>().globalData.entryId;
    if (entryId) {
      goToEntryProfile(entryId);
    }
  },

  onOpenPriceChanges() {
    navigateTo(routes.dataPrice);
  },

  onPreviousFixtureGw() {
    if (this.data.selectedFixtureGw <= (this.data.minFixtureGw || this.data.nextGw)) {
      return;
    }

    const nextGw = Math.max(this.data.minFixtureGw || this.data.nextGw, this.data.selectedFixtureGw - 1);
    if (nextGw !== this.data.selectedFixtureGw) {
      this.loadFixtureGw(nextGw);
    }
  },

  onNextFixtureGw() {
    if (this.data.selectedFixtureGw >= 38) {
      return;
    }

    const nextGw = Math.min(38, this.data.selectedFixtureGw + 1);
    if (nextGw !== this.data.selectedFixtureGw) {
      this.loadFixtureGw(nextGw);
    }
  },

  async loadFixtureGw(event: number, forceRefresh = false) {
    const requestId = ++this._fixtureGwRequestId;
    this.setData({
      fixtureLoading: true,
      fixtureError: "",
      fixtureStaleMessage: "",
      fixtureStoredAt: null,
      fixtureStaleStoredAt: null,
      selectedFixtureGw: event,
      fixtureRows: []
    });
    try {
      const read = await readCoreEventFixtureSchedule(
        event,
        getApp<IAppOption>().globalData.season,
        { forceRefresh }
      );
      if (requestId !== this._fixtureGwRequestId || event !== this.data.selectedFixtureGw) return;
      const staleStoredAt = read.meta.stale ? read.meta.storedAt || null : null;
      this.setData({
        fixtureRows: read.data.map(mapFixtureRow),
        fixtureStoredAt: read.meta.storedAt || Date.now(),
        fixtureStaleStoredAt: staleStoredAt,
        fixtureStaleMessage: read.meta.stale ? fixtureStaleMessage(staleStoredAt) : ""
      });
    } catch (error) {
      if (requestId !== this._fixtureGwRequestId || event !== this.data.selectedFixtureGw) return;
      this.setData({
        fixtureRows: [],
        fixtureStaleMessage: "",
        fixtureStaleStoredAt: null,
        fixtureError: error instanceof Error ? error.message : "赛程加载失败"
      });
    } finally {
      if (requestId === this._fixtureGwRequestId && event === this.data.selectedFixtureGw) {
        this.setData({ fixtureLoading: false });
      }
    }
  },

  onRetryFixtures() {
    this.loadFixtureGw(this.data.selectedFixtureGw || this.data.nextGw, true);
  }
});

function mapFixtureRow(fixture: Fixture, index: number): HomeFixtureRow {
  const fixtureWithDifficulty = fixture as Fixture & {
    homeDifficulty?: number;
    awayDifficulty?: number;
  };

  return {
    id: String(fixture.id || `${fixture.teamId || "team"}-${fixture.againstTeamId || "against"}-${index}`),
    homeName: fixture.teamShortName || fixture.homeTeam || fixture.teamName || "-",
    awayName: fixture.againstTeamShortName || fixture.awayTeam || fixture.againstTeamName || "-",
    kickoffTime: fixture.kickoffTime || "",
    kickoffLabel: formatKickoff(fixture.kickoffTime),
    homeDifficulty: fixtureWithDifficulty.homeDifficulty ?? fixture.difficulty,
    awayDifficulty: fixtureWithDifficulty.awayDifficulty,
    teamId: fixture.teamId,
    againstTeamId: fixture.againstTeamId
  };
}

function formatKickoff(value?: string): string {
  if (!value) {
    return "时间待定";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

function clampFixtureGw(value: number, min: number): number {
  return Math.min(38, Math.max(min || 1, value || min || 1));
}

function mapHomePriceChanges(changes: PlayerValue[]): { rises: HomePriceChangeRow[]; falls: HomePriceChangeRow[] } {
  const rows = changes
    .filter((change) => typeof change.lastValue === "number" && typeof change.value === "number")
    .map(mapHomePriceChange);

  return {
    rises: rows
      .filter((row) => row.rawChange > 0)
      .sort((a, b) => b.newValue - a.newValue)
      .slice(0, 5)
      .map(stripPriceSortFields),
    falls: rows
      .filter((row) => row.rawChange < 0)
      .sort((a, b) => a.newValue - b.newValue)
      .slice(0, 5)
      .map(stripPriceSortFields)
  };
}

function mapHomePriceChange(change: PlayerValue): HomePriceChangeRow & { rawChange: number; newValue: number } {
  const oldValue = change.lastValue || 0;
  const newValue = change.value || 0;
  const rawChange = newValue - oldValue;

  return {
    id: String(change.playerId),
    name: change.playerName || "-",
    team: change.teamName || "-",
    position: change.position || "",
    oldPrice: formatPrice(oldValue),
    newPrice: formatPrice(newValue),
    changeText: `${rawChange > 0 ? "+" : "-"}${formatPrice(Math.abs(rawChange))}`,
    rawChange,
    newValue
  };
}

function stripPriceSortFields(row: HomePriceChangeRow & { rawChange: number; newValue: number }): HomePriceChangeRow {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    position: row.position,
    oldPrice: row.oldPrice,
    newPrice: row.newPrice,
    changeText: row.changeText
  };
}

function mapHomeGameweekStats(summary?: GameweekOverallSummary): HomeStatRow[] {
  if (!summary) {
    return [];
  }

  const topChip = (summary.chipPlays || []).reduce<SummaryChipPlay | undefined>((selected, chip) => {
    if (!selected || Number(chip.numberPlayed || 0) > Number(selected.numberPlayed || 0)) {
      return chip;
    }
    return selected;
  }, undefined);

  const rows = [
    {
      key: "highestScore",
      label: "最高分",
      value: formatOptionalNumber(summary.highestScore)
    },
    {
      key: "topScorer",
      label: "最高分球员",
      value: formatTopScorer(summary)
    },
    {
      key: "viceCaptain",
      label: "最多选择队长",
      value: summary.mostCaptainedPlayer?.webName || "-"
    },
    {
      key: "chip",
      label: "开的最多的卡",
      value: topChip ? `${formatChipName(topChip.chipName)} ${formatCompactNumber(topChip.numberPlayed)}` : "-"
    }
  ];

  // Preseason / empty GW: drop placeholder rows so the section hides entirely
  return rows.filter((row) => row.value !== "-" && row.value !== "");
}

function formatTopScorer(summary: GameweekOverallSummary): string {
  const name = summary.topElementInfo?.player?.webName;
  const points = summary.topElementInfo?.points;
  if (!name || typeof points !== "number") {
    return "-";
  }

  return `${name} ${points}`;
}

function formatOptionalNumber(value?: number): string {
  return typeof value === "number" ? String(value) : "-";
}

function formatCompactNumber(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }

  if (value >= 1000000) {
    return `${trimDecimal(value / 1000000)}m`;
  }

  if (value >= 1000) {
    return `${trimDecimal(value / 1000)}k`;
  }

  return String(value);
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatChipName(chipName?: string): string {
  const names: Record<string, string> = {
    bboost: "BB",
    "3xc": "TC",
    wildcard: "WC",
    freehit: "FH",
    manager: "AM"
  };

  return chipName ? names[chipName] || chipName : "-";
}
