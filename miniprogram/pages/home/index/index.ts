import {
  readCoreEventFixtureSchedule
} from "../../../services/fixture.service";
import { getEntryInfo, getEntryLeagueInfo } from "../../../services/entry.service";
import type { EntryLeague } from "../../../models/entry";
import { awaitLinkedAccountSnapshot, getApiSessionToken } from "../../../services/auth.service";
import {
  getMiniHomeMarket,
  getMiniHomePersonalLeagues,
  getMiniHomeSupplement
} from "../../../services/home.service";
import type {
  HomeAvailabilityRow,
  HomeMarketMover,
  MiniHomeMarketMode
} from "../../../services/home.service";
import type { Fixture } from "../../../models/common";
import type { EntryInfo } from "../../../models/entry";
import type { GameweekOverallSummary, SummaryChipPlay } from "../../../models/summary";
import { routes } from "../../../config/routes";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { formatCountdown, getDeadlineDiffMs } from "../../../utils/date";
import type { CountdownParts } from "../../../utils/date";
import { waitForAuthoritativeFollow } from "../../../utils/follow";
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
  marketUnavailable: boolean;
  gameweekStatsError: string;
  supplementLoading: boolean;
  entry: EntryInfo;
  leagues: EntryLeague[];
  fixtureDays: HomeFixtureDay[];
  selectedFixtureDayKey: string;
  selectedDayRows: HomeFixtureMatch[];
  fixtureCount: number;
  gameweekStats: HomeStatRow[];
  marketMode: MiniHomeMarketMode;
  marketCoverage: string;
  marketLeadTitle: string;
  marketLeadRows: HomeMarketMover[];
  marketRisers: HomeMarketMover[];
  marketFallers: HomeMarketMover[];
  availabilityRows: HomeAvailabilityRow[];
  gw: number;
  currentGw: number;
  nextGw: number;
  selectedFixtureGw: number;
  minFixtureGw: number;
  deadline: string;
  utcDeadline: string;
  countdown: CountdownParts;
  noticeText: string;
  noticeClosed: boolean;
  accountLinked: boolean;
  accountLinkReady: boolean;
}

export interface HomeFixtureMatch {
  id: string;
  homeName: string;
  awayName: string;
  centerLabel: string;
  finished: boolean;
}

export interface HomeFixtureDay {
  dateKey: string;
  tabLabel: string;
  rows: HomeFixtureMatch[];
}

interface HomeStatRow {
  key: string;
  label: string;
  value: string;
}

/** Home warm-show skip window. Live index and leagues use the same 60s; team uses 5 min. */
const HOME_REVALIDATE_MS = 60 * 1000;
const HOME_DEADLINE_RETRY_MS = 60 * 1000;
export const NOTICE_AUTO_CLOSE_MS = 5 * 1000;

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

/** Yellow desk banners only when prior content remains on screen. */
export function retainedDeskMessage(base: string, retained: boolean): string {
  const message = base.trim();
  if (!message) return "";
  return retained ? `${message}，已保留上次成功数据` : message;
}

export function homePersonalLeaguesMatchEntry(
  entry: EntryInfo,
  desk: { entryId: number }
): boolean {
  const entryId = Number(entry.entryId ?? entry.entry);
  const personalEntryId = Number(desk.entryId);
  return Number.isSafeInteger(entryId)
    && entryId > 0
    && Number.isSafeInteger(personalEntryId)
    && personalEntryId > 0
    && entryId === personalEntryId;
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
    marketUnavailable: false,
    gameweekStatsError: "",
    supplementLoading: false,
    entry: {},
    leagues: [],
    fixtureDays: [],
    selectedFixtureDayKey: "",
    selectedDayRows: [],
    fixtureCount: 0,
    gameweekStats: [],
    marketMode: "empty",
    marketCoverage: "最新每日持有率变化",
    marketLeadTitle: "最新每日持有率变化",
    marketLeadRows: [],
    marketRisers: [],
    marketFallers: [],
    availabilityRows: [],
    gw: 0,
    currentGw: 0,
    nextGw: 0,
    selectedFixtureGw: 0,
    minFixtureGw: 0,
    deadline: "",
    utcDeadline: "",
    countdown: formatCountdown(0),
    noticeText: "",
    noticeClosed: false,
    accountLinked: false,
    accountLinkReady: false
  } as HomeData,

  countdownTimer: undefined as number | undefined,
  noticeTimer: undefined as number | undefined,
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
  _resumeFixtureGwOnShow: false,
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
      await this.syncAccountLink();
      this.syncAppState();
      if (shouldReloadHome(
        this._lastLoadAt,
        this._loadedContextRevision,
        context.contextRevision
      )) {
        this._resumeSecondaryOnShow = false;
        this._resumeFixtureGwOnShow = false;
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
        if (this._resumeFixtureGwOnShow) {
          this._resumeFixtureGwOnShow = false;
          const event = this.data.selectedFixtureGw;
          if (event > 0) void this.loadFixtureGw(event);
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
    this._resumeFixtureGwOnShow = false;
    this._refreshPending = false;
    this._lifecycleRevision += 1;
    this._loadRequestId += 1;
    this._fixtureGwRequestId += 1;
    this._refreshRequestId += 1;
    this.stopCountdown();
    this.clearNoticeTimer();
    this._perfTracker?.disconnect();
  },

  onHide() {
    this._pageVisible = false;
    this._resumeStartupOnShow = this._startupPending;
    this._resumeSecondaryOnShow = this._secondaryPending;
    this._resumeRefreshOnShow = this._refreshPending;
    this._resumeRefreshDeadlineTriggered = this._activeRefreshDeadlineTriggered;
    this._resumeFixtureGwOnShow = this.data.fixtureLoading;
    this._lifecycleRevision += 1;
    this._loadRequestId += 1;
    this._fixtureGwRequestId += 1;
    this._refreshRequestId += 1;
    this.stopCountdown();
    this.clearNoticeTimer();
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
    await this.syncAccountLink();
    if (!this._pageVisible || requestId !== this._loadRequestId) return false;
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
      const hadFixtureRows = this.data.fixtureCount > 0 && this.data.selectedFixtureGw === fixtureGw;
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
      // Entry/leagues + market/supplement start with fixtures — do not wait for
      // the fixture response. Personal desk is above the fold; public desks are
      // independent and must not gate each other.
      void this.loadSecondaryData(requestId, currentGw, forceRefresh, trace, tracker);
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
            : fixtureDeskState(fixtureResult.fixtures)),
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
            itemCount: this.data.fixtureCount,
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
      const contextMissing = !app.globalData.season
        || !app.globalData.gw
        || !app.globalData.nextGw;
      const deadlineExpired = Boolean(app.globalData.utcDeadline)
        && getDeadlineDiffMs(app.globalData.utcDeadline) <= 0;
      const refreshContext = contextMissing || deadlineExpired;
      if (refreshContext) {
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
        const context = await ensureAppContext({
          reason: "pull-refresh",
          trace: deadlineTriggered ? null : undefined
        });
        if (!isActiveRefresh()) return;
        this._loadedContextRevision = context.contextRevision;
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
    const hasFixtureRows = this.data.fixtureCount > 0;
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
      marketUnavailable: false,
      gameweekStatsError: "",
      entryError: ""
    });
    const personalTask = (async (): Promise<void> => {
      if (!getApiSessionToken()) {
        try { await app.authReady; } catch {}
      }
      if (getApiSessionToken()) {
        await waitForAuthoritativeFollow();
      }
      if (!isActiveSecondary()) return;
      const entryId = app.globalData.entryId;
      if (!entryId) {
        this.setData({
          entry: {},
          leagues: [],
          entryError: ""
        });
        return;
      }
      let loadedEntry: EntryInfo | null = null;
      try {
        const entryTrace: PageRequestTrace | null = primaryTrace
          ? { ...primaryTrace, callerSurface: "home-entry" }
          : null;
        const entry = await getEntryInfo(entryId, forceRefresh, entryTrace);
        if (!isActiveSecondary()) return;
        loadedEntry = entry;
        const previousEntryId = Number(
          this.data.entry.entryId ?? this.data.entry.entry ?? 0,
        );
        const nextEntryId = Number(entry.entryId ?? entry.entry ?? 0);
        this.setData({
          entry,
          entryError: "",
          ...(previousEntryId !== nextEntryId ? { leagues: [] } : {}),
        });
      } catch (error) {
        if (isActiveSecondary()) {
          this.setData({ entryError: error instanceof Error ? error.message : "球队信息加载失败" });
        }
      }
      // Load all leagues in a single request, then update UI once
      const leagueTrace: PageRequestTrace | null = primaryTrace
        ? { ...primaryTrace, callerSurface: "home-leagues" }
        : null;
      try {
        let allLeagues: EntryLeague[] | null = null;
        if (getApiSessionToken() && loadedEntry) {
          try {
            const personal = await getMiniHomePersonalLeagues(
              forceRefresh,
              leagueTrace,
            );
            if (homePersonalLeaguesMatchEntry(loadedEntry, personal)) {
              allLeagues = personal.leagues;
            }
          } catch {}
        }
        if (!allLeagues) {
          allLeagues = await getEntryLeagueInfo(entryId, forceRefresh, leagueTrace || undefined);
        }
        if (isActiveSecondary()) {
          this.setData({ leagues: allLeagues });
        }
      } catch {
        // League load failure is non-critical, ignore silently
      }
    })().catch(() => undefined);
    const supplementTrace: PageRequestTrace | null = primaryTrace
      ? { ...primaryTrace, callerSurface: "home-supplement" }
      : null;
    const marketTrace: PageRequestTrace | null = primaryTrace
      ? { ...primaryTrace, callerSurface: "home-market" }
      : null;
    const marketTask = getMiniHomeMarket(forceRefresh, marketTrace)
      .then((value) => ({ value, error: "" }))
      .catch((error) => ({
        value: null,
        error: error instanceof Error ? error.message : "市场动态加载失败",
      }));
    const supplementTask = getMiniHomeSupplement(
      currentGw,
      forceRefresh,
      supplementTrace,
    ).catch((error) => ({
        notice: "",
        summary: undefined,
        errors: {
          notice: "",
          summary: error instanceof Error ? error.message : "GW 数据加载失败",
        }
      }));
    const [marketResult, supplement] = await Promise.all([marketTask, supplementTask]);
    if (!isActiveSecondary()) return;
    const market = marketResult.value;
    const hasPreviousMarket =
      this.data.marketLeadRows.length > 0 ||
      this.data.marketRisers.length > 0 ||
      this.data.marketFallers.length > 0 ||
      this.data.availabilityRows.length > 0;
    const marketPatch = market
      ? {
          priceError: "",
          marketUnavailable: false,
          marketMode: market.mode,
          marketCoverage: market.coverage,
          marketLeadTitle: market.leadTitle,
          marketLeadRows: market.leadRows,
          marketRisers: market.risers,
          marketFallers: market.fallers,
          availabilityRows: market.availability,
        }
      : hasPreviousMarket
        ? {
            priceError: retainedDeskMessage(
              marketResult.error || "市场动态刷新失败",
              true
            ),
            marketUnavailable: false,
          }
        : {
            // No last-good desk: stay quiet — soft empty + retry, no alarm bar.
            priceError: "",
            marketUnavailable: true,
            marketMode: "empty" as MiniHomeMarketMode,
            marketLeadRows: [],
            marketRisers: [],
            marketFallers: [],
            availabilityRows: [],
          };
    const nextNotice = this.data.noticeClosed || supplement.errors.notice
      ? this.data.noticeText
      : (supplement.notice || "");
    const hadGwStats = this.data.gameweekStats.length > 0;
    const gwStats = supplement.summary
      ? mapHomeGameweekStats(supplement.summary)
      : null;
    this.setData({
      ...marketPatch,
      // Alarm only when prior GW stats remain; otherwise omit the empty error card.
      gameweekStatsError:
        gwStats
          ? ""
          : hadGwStats
            ? retainedDeskMessage(supplement.errors.summary || "GW 数据刷新失败", true)
            : "",
      ...(this.data.noticeClosed || supplement.errors.notice
        ? {}
        : { noticeText: nextNotice }),
      supplementLoading: false,
      ...(gwStats ? { gameweekStats: gwStats } : {})
    });
    if (!isActiveSecondary()) return;
    await personalTask;
    if (!isActiveSecondary()) return;
    this._secondaryPending = false;
    if (!this.data.noticeClosed && nextNotice) this.scheduleNoticeAutoClose(nextNotice);
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
      currentGw: app.globalData.currentGw,
      nextGw: app.globalData.nextGw,
      minFixtureGw: app.globalData.nextGw,
      selectedFixtureGw: clampFixtureGw(this.data.selectedFixtureGw || app.globalData.nextGw, app.globalData.nextGw),
      deadline: app.globalData.deadline,
      utcDeadline: app.globalData.utcDeadline,
      countdown: formatCountdown(getDeadlineDiffMs(app.globalData.utcDeadline)),
      ...extra
    });
  },

  async syncAccountLink() {
    const snapshot = await awaitLinkedAccountSnapshot();
    this.setData({
      accountLinkReady: true,
      accountLinked: snapshot.linked
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
    const countdown = formatCountdown(ms);
    if (countdown !== this.data.countdown) {
      this.setData({ countdown });
    }
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
    this.clearNoticeTimer();
    this.setData({ noticeClosed: true, noticeText: "" });
  },

  scheduleNoticeAutoClose(text: string) {
    this.clearNoticeTimer();
    if (!text || this.data.noticeClosed) return;
    this.noticeTimer = setTimeout(() => {
      this.noticeTimer = undefined;
      if (!this._pageVisible || this.data.noticeClosed || !this.data.noticeText) return;
      this.setData({ noticeClosed: true, noticeText: "" });
    }, NOTICE_AUTO_CLOSE_MS) as unknown as number;
  },

  clearNoticeTimer() {
    if (this.noticeTimer !== undefined) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = undefined;
    }
  },

  onChangeEntry() {
    goToEntrySearch();
  },

  onGoAccountLink() {
    navigateTo(routes.accountLink);
  },

  onOpenEntry() {
    navigateTo(routes.myFplTeam);
  },

  onOpenLeagues() {
    navigateTo(routes.myFplLeagues);
  },

  onOpenPriceChanges() {
    navigateTo(routes.dataPrice);
  },

  onOpenLiveMatches() {
    navigateTo(routes.liveMatch);
  },

  onSelectFixtureDay(event: WechatMiniprogram.TouchEvent) {
    const dateKey = String(event.currentTarget.dataset.key || "");
    const day = this.data.fixtureDays.find((item) => item.dateKey === dateKey);
    if (!day || dateKey === this.data.selectedFixtureDayKey) return;
    this.setData({
      selectedFixtureDayKey: dateKey,
      selectedDayRows: day.rows
    });
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
      ...emptyFixtureDesk()
    });
    try {
      const read = await readCoreEventFixtureSchedule(
        event,
        getApp<IAppOption>().globalData.season,
        { forceRefresh }
      );
      if (!this._pageVisible || requestId !== this._fixtureGwRequestId || event !== this.data.selectedFixtureGw) return;
      const staleStoredAt = read.meta.stale ? read.meta.storedAt || null : null;
      this.setData({
        ...fixtureDeskState(read.data),
        fixtureStoredAt: read.meta.storedAt || Date.now(),
        fixtureStaleStoredAt: staleStoredAt,
        fixtureStaleMessage: read.meta.stale ? fixtureStaleMessage(staleStoredAt) : ""
      });
    } catch (error) {
      if (!this._pageVisible || requestId !== this._fixtureGwRequestId || event !== this.data.selectedFixtureGw) return;
      this.setData({
        ...emptyFixtureDesk(),
        fixtureStaleMessage: "",
        fixtureStaleStoredAt: null,
        fixtureError: error instanceof Error ? error.message : "赛程加载失败"
      });
    } finally {
      if (this._pageVisible && requestId === this._fixtureGwRequestId && event === this.data.selectedFixtureGw) {
        this.setData({ fixtureLoading: false });
      }
    }
  },

  onRetryFixtures() {
    this.loadFixtureGw(this.data.selectedFixtureGw || this.data.nextGw, true);
  }
});

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTabLabel(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)} ${WEEKDAYS[date.getDay()]}`;
}

function formatKickoffTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function mapHomeFixtureMatch(fixture: Fixture, index: number): HomeFixtureMatch {
  const kickoff = fixture.kickoffTime ? new Date(fixture.kickoffTime) : null;
  const validKickoff = Boolean(kickoff && !Number.isNaN(kickoff.getTime()));
  const finished = fixture.finished === true
    && typeof fixture.homeScore === "number"
    && typeof fixture.awayScore === "number";
  return {
    id: String(fixture.id || `${fixture.teamId || "team"}-${fixture.againstTeamId || "against"}-${index}`),
    homeName: fixture.teamName || fixture.homeTeam || fixture.teamShortName || "-",
    awayName: fixture.againstTeamName || fixture.awayTeam || fixture.againstTeamShortName || "-",
    centerLabel: finished
      ? `${fixture.homeScore}-${fixture.awayScore}`
      : validKickoff
        ? formatKickoffTime(kickoff as Date)
        : "待定",
    finished
  };
}

export function groupHomeFixturesByDay(
  fixtures: Fixture[],
  now = new Date()
): { days: HomeFixtureDay[]; selectedDayKey: string } {
  const buckets = new Map<string, { sortKey: string; tabLabel: string; rows: HomeFixtureMatch[] }>();
  fixtures.forEach((fixture, index) => {
    const kickoff = fixture.kickoffTime ? new Date(fixture.kickoffTime) : null;
    const validKickoff = Boolean(kickoff && !Number.isNaN(kickoff.getTime()));
    const dateKey = validKickoff ? localDateKey(kickoff as Date) : "tbd";
    const match = mapHomeFixtureMatch(fixture, index);
    const existing = buckets.get(dateKey);
    if (existing) {
      existing.rows.push(match);
      return;
    }
    buckets.set(dateKey, {
      sortKey: dateKey,
      tabLabel: validKickoff ? formatTabLabel(kickoff as Date) : "待定",
      rows: [match]
    });
  });
  const days = Array.from(buckets.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([dateKey, bucket]) => ({
      dateKey,
      tabLabel: bucket.tabLabel,
      rows: bucket.rows
    }));
  const today = localDateKey(now);
  const selectedDayKey = days.some((day) => day.dateKey === today)
    ? today
    : (days[0]?.dateKey || "");
  return { days, selectedDayKey };
}

function fixtureDeskState(fixtures: Fixture[]): Pick<HomeData, "fixtureDays" | "selectedFixtureDayKey" | "selectedDayRows" | "fixtureCount"> {
  const grouped = groupHomeFixturesByDay(fixtures);
  const selected = grouped.days.find((day) => day.dateKey === grouped.selectedDayKey);
  return {
    fixtureDays: grouped.days,
    selectedFixtureDayKey: grouped.selectedDayKey,
    selectedDayRows: selected ? selected.rows : [],
    fixtureCount: grouped.days.reduce((count, day) => count + day.rows.length, 0)
  };
}

function emptyFixtureDesk(): Pick<HomeData, "fixtureDays" | "selectedFixtureDayKey" | "selectedDayRows" | "fixtureCount"> {
  return {
    fixtureDays: [],
    selectedFixtureDayKey: "",
    selectedDayRows: [],
    fixtureCount: 0
  };
}

function clampFixtureGw(value: number, min: number): number {
  return Math.min(38, Math.max(min || 1, value || min || 1));
}

export function mapHomeGameweekStats(summary?: GameweekOverallSummary): HomeStatRow[] {
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
  return typeof value === "number" && value > 0 ? String(value) : "-";
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
