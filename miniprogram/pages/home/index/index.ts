import {
  readCoreEventFixtureSchedule
} from "../../../services/fixture.service";
import { getEntryInfo, getEntryLeagueInfo } from "../../../services/entry.service";
import type { EntryLeague } from "../../../models/entry";
import { awaitLinkedAccountSnapshot, getApiSessionToken } from "../../../services/auth.service";
import {
  getMiniHomeDreamTeam,
  getMiniHomeMarket,
  getMiniHomePersonalLeagues,
  getMiniHomePricePredictions,
  getMiniHomeSupplement,
  mapHomePredictionRows
} from "../../../services/home.service";
import type {
  HomeAvailabilityRow,
  HomeMarketMover,
  HomeMarketSectionState,
  MiniHomeMarketMode
} from "../../../services/home.service";
import { buildDreamTeamPitchState } from "../../../utils/squad-pitch";
import type { SquadPitchHeader, SquadPitchPlayer } from "../../../utils/squad-pitch";
import { buildPlayerLiveDetail, type PlayerLiveDetailView } from "../../live/entry/player-detail";
import { indexDreamTeamById } from "../../summary/gameweek/dream-detail";
import { getPlayerLiveStats } from "../../../services/live.service";
import type { LivePlayerRow } from "../../../models/live";
import { presentSquadPitchShareImage } from "../../../utils/squad-pitch-canvas";
import {
  exportDeadlineShareImage,
  presentDeadlineShareImage,
} from "../../../utils/deadline-share-image";
import {
  exportHomeMarketMoversShareImage,
  exportHomeMarketWatchShareImage,
  presentHomeMarketShareImage,
} from "../../../utils/home-market-share-image";
import {
  exportHomeFixtureShareImage,
  presentHomeFixtureShareImage,
} from "../../../utils/home-fixture-share-image";
import { PriceChangeLivePoller } from "../../../utils/price-change-live";
import type { Fixture } from "../../../models/common";
import type { EntryInfo } from "../../../models/entry";
import type { GameweekOverallSummary, SummaryChipPlay } from "../../../models/summary";
import { routes } from "../../../config/routes";
import { goToEntrySearch, goToLiveEntry, goToPlayerDetail, navigateTo } from "../../../utils/navigation";
import { formatCalendarDayLabel, formatCountdown, formatLocalCapturedAt, getDeadlineDiffMs } from "../../../utils/date";
import type { CountdownParts } from "../../../utils/date";
import {
  currentFollowEntryId,
  waitForAuthoritativeFollow,
} from "../../../utils/follow";
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
  fixtureLive: boolean;
  fixtureEmptyPast: boolean;
  gameweekStats: HomeStatRow[];
  dreamTeamEvent: number;
  hasDreamTeam: boolean;
  dreamPlayers: SquadPitchPlayer[];
  dreamHeader: Partial<SquadPitchHeader>;
  dreamShareBusy: boolean;
  playerDetailOpen: boolean;
  playerDetail: PlayerLiveDetailView | null;
  deadlineShareBusy: boolean;
  marketMode: MiniHomeMarketMode;
  pulseTab: "ownership" | "watch";
  priceTab: "today" | "likely";
  marketCoverage: string;
  marketLeadTitle: string;
  marketLeadRows: HomeMarketMover[];
  marketRisers: HomeMarketMover[];
  marketFallers: HomeMarketMover[];
  availabilityRows: HomeAvailabilityRow[];
  priceChangeDate: string;
  priceRisers: HomeMarketMover[];
  priceFallers: HomeMarketMover[];
  /** Raw capture ISO strings + section states from homeMarketDesk. */
  marketCapturedAt: string;
  marketOwnershipCapturedAt: string;
  ownershipState: HomeMarketSectionState;
  priceChangesState: HomeMarketSectionState;
  availabilityState: HomeMarketSectionState;
  /** Per-view 更新于 subtitles (web LocalUpdatedLabel parity). */
  marketOwnershipUpdated: string;
  marketWatchUpdated: string;
  priceTodayUpdated: string;
  predictionUpdated: string;
  marketShareBusy: boolean;
  priceShareBusy: boolean;
  fixtureShareBusy: boolean;
  predictedAllRisers: HomeMarketMover[];
  predictedAllFallers: HomeMarketMover[];
  predictedRiseCount: number;
  predictedFallCount: number;
  predictionNotice: string;
  predictionLoading: boolean;
  predictionError: string;
  predictionLoaded: boolean;
  gw: number;
  currentGw: number;
  nextGw: number;
  selectedFixtureGw: number;
  minFixtureGw: number;
  deadline: string;
  utcDeadline: string;
  deadlinePassed: boolean;
  countdown: CountdownParts;
  noticeText: string;
  noticeClosed: boolean;
  /** True when a viewer entry id is bound, even if its detail read failed. */
  hasEntryBinding: boolean;
  accountLinked: boolean;
  accountLinkReady: boolean;
}

export interface HomeFixtureMatch {
  id: string;
  homeName: string;
  awayName: string;
  centerLabel: string;
  finished: boolean;
  live: boolean;
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
  /** Entry id for the highest-score tile, player id for player tiles; 0 = not tappable. */
  targetId: number;
}

/** Home warm-show skip window. Live index and leagues use the same 60s; team uses 5 min. */
const HOME_REVALIDATE_MS = 60 * 1000;
/** Web parity: post-deadline refresh retries back off 30s → 60s → … → 300s. */
const DEADLINE_RETRY_BASE_MS = 30 * 1000;
const DEADLINE_RETRY_MAX_MS = 5 * 60 * 1000;
/** Live fixture poll cadence — mirrors the web home fixtures desk (30s). */
const FIXTURE_LIVE_REFRESH_MS = 30 * 1000;
/** Web parity: the fixture stepper can browse every gameweek, not just future ones. */
const MIN_FIXTURE_GW = 1;
export const NOTICE_AUTO_CLOSE_MS = 5 * 1000;

type CoreFixtureRead = Awaited<ReturnType<typeof readCoreEventFixtureSchedule>>;

interface HomeFixtureSelection {
  event: number;
  read: CoreFixtureRead;
}

function positiveFixtureGw(value: number | null | undefined): number {
  const event = Number(value);
  return Number.isSafeInteger(event) && event > 0 ? event : 0;
}

/** The fixture desk follows the live event; only preseason falls back to next. */
export function resolveHomeFixtureEvent(
  currentGw: number | null | undefined,
  displayGw: number | null | undefined,
  nextGw: number | null | undefined
): number {
  return positiveFixtureGw(currentGw)
    || positiveFixtureGw(displayGw)
    || positiveFixtureGw(nextGw)
    || MIN_FIXTURE_GW;
}

/** Move the compact desk to the next GW only after the current GW is settled. */
export function shouldAdvanceHomeFixtureEvent(
  fixtures: readonly Pick<Fixture, "finished">[],
  currentGw: number | null | undefined,
  nextGw: number | null | undefined
): boolean {
  const current = positiveFixtureGw(currentGw);
  const next = positiveFixtureGw(nextGw);
  return current > 0
    && next > current
    && fixtures.length > 0
    && fixtures.every((fixture) => fixture.finished === true);
}

async function readHomeFixtureSelection(
  requestedEvent: number,
  currentGw: number,
  nextGw: number,
  season: string,
  forceRefresh: boolean,
  trace: PageRequestTrace | null,
  allowAutoAdvance: boolean
): Promise<HomeFixtureSelection> {
  const current = await readCoreEventFixtureSchedule(requestedEvent, season, {
    forceRefresh,
    trace
  });
  if (
    allowAutoAdvance
    && requestedEvent === currentGw
    && shouldAdvanceHomeFixtureEvent(current.data, currentGw, nextGw)
  ) {
    try {
      const next = await readCoreEventFixtureSchedule(nextGw, season, {
        forceRefresh,
        trace
      });
      // Do not replace a settled round with an unpublished/empty next round.
      if (next.data.length > 0) return { event: nextGw, read: next };
    } catch {
      // The settled current round remains the safe fallback when the next
      // round is not available yet.
    }
  }
  return { event: requestedEvent, read: current };
}

/** Exponential post-deadline retry with a five-minute ceiling (doubles every two attempts). */
export function deadlineRetryDelayMs(completedAttempts: number): number {
  const safeAttempts = Number.isFinite(completedAttempts)
    ? Math.max(1, Math.trunc(completedAttempts))
    : 1;
  const exponent = Math.min(Math.floor((safeAttempts - 1) / 2), 4);
  return Math.min(DEADLINE_RETRY_BASE_MS * 2 ** exponent, DEADLINE_RETRY_MAX_MS);
}

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

/**
 * Per-view 更新于 subtitles for the two market cards — the mini counterpart of
 * the web carousels' LocalUpdatedLabel. Web sources:
 * - ownership: ownership.coverage.capturedAt ?? desk.capturedAt, but only while
 *   ownershipState is AVAILABLE; otherwise the coverage copy is the fallback.
 * - availability: desk.capturedAt, fallback "更新于 —".
 * - price today: desk.capturedAt, fallback 更新于 <latest change date>, then
 *   the unavailable copy when no change date exists either.
 */
export function buildMarketUpdatedLabels(market: {
  capturedAt: string;
  ownershipCapturedAt: string;
  ownershipState: HomeMarketSectionState;
  coverage: string;
  priceChangeDate: string;
}): Pick<HomeData, "marketOwnershipUpdated" | "marketWatchUpdated" | "priceTodayUpdated"> {
  const captured = formatLocalCapturedAt(market.capturedAt);
  const ownershipCaptured = market.ownershipState === "AVAILABLE"
    ? formatLocalCapturedAt(market.ownershipCapturedAt) || captured
    : "";
  const changeDay = formatCalendarDayLabel(market.priceChangeDate);
  return {
    marketOwnershipUpdated: ownershipCaptured
      ? `更新于 ${ownershipCaptured}`
      : market.coverage,
    marketWatchUpdated: captured ? `更新于 ${captured}` : "更新于 —",
    priceTodayUpdated: captured
      ? `更新于 ${captured}`
      : changeDay
        ? `更新于 ${changeDay}`
        : "已记录的身价变化暂不可用。",
  };
}

/** Likely-view subtitle: prediction board fetch time, else the static copy. */
export function predictionUpdatedLabel(fetchedAt: string): string {
  const fetched = formatLocalCapturedAt(fetchedAt);
  return fetched ? `更新于 ${fetched}` : "按预测进度展示全部涨跌信号。";
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
    fixtureLive: false,
    fixtureEmptyPast: false,
    gameweekStats: [],
    dreamTeamEvent: 0,
    hasDreamTeam: false,
    dreamPlayers: [],
    dreamHeader: {},
    dreamShareBusy: false,
    playerDetailOpen: false,
    playerDetail: null,
    deadlineShareBusy: false,
    marketMode: "empty",
    pulseTab: "ownership",
    priceTab: "today",
    marketCoverage: "最新每日持有率变化",
    marketLeadTitle: "最新每日持有率变化",
    marketLeadRows: [],
    marketRisers: [],
    marketFallers: [],
    availabilityRows: [],
    priceChangeDate: "",
    priceRisers: [],
    priceFallers: [],
    marketCapturedAt: "",
    marketOwnershipCapturedAt: "",
    ownershipState: "AVAILABLE",
    priceChangesState: "AVAILABLE",
    availabilityState: "AVAILABLE",
    marketOwnershipUpdated: "最新每日持有率变化",
    marketWatchUpdated: "更新于 —",
    priceTodayUpdated: "已记录的身价变化暂不可用。",
    predictionUpdated: "按预测进度展示全部涨跌信号。",
    marketShareBusy: false,
    priceShareBusy: false,
    fixtureShareBusy: false,
    predictedAllRisers: [],
    predictedAllFallers: [],
    predictedRiseCount: 0,
    predictedFallCount: 0,
    predictionNotice: "",
    predictionLoading: false,
    predictionError: "",
    predictionLoaded: false,
    gw: 0,
    currentGw: 0,
    nextGw: 0,
    selectedFixtureGw: 0,
    minFixtureGw: 0,
    deadline: "",
    utcDeadline: "",
    deadlinePassed: false,
    countdown: formatCountdown(0),
    noticeText: "",
    noticeClosed: false,
    hasEntryBinding: false,
    accountLinked: false,
    accountLinkReady: false
  } as HomeData,

  countdownTimer: undefined as number | undefined,
  noticeTimer: undefined as number | undefined,
  fixtureLiveTimer: undefined as number | undefined,
  _initialLoadDone: false,
  _lastLoadAt: 0,
  _loadRequestId: 0,
  _fixtureGwRequestId: 0,
  _priceRequestId: 0,
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
  _fixtureGwUserSelected: false,
  _resumeRefreshDeadlineTriggered: false,
  _refreshRequestId: 0,
  _hasShown: false,
  _lifecycleRevision: 0,
  _dreamTeamLoadedEvent: 0,
  dreamTeamById: {} as Record<string, LivePlayerRow>,
  _statPlayers: {} as Record<string, LivePlayerRow>,
  _statsEvent: 0,
  _playerSheetRequestId: 0,
  // Price live channel (web usePriceChangeLiveUpdates on the home card). The
  // poller is created lazily with the first prediction load; the durable
  // projection is kept so onReset can restore it when a provisional snapshot
  // expires or is withdrawn.
  _priceLivePoller: null as PriceChangeLivePoller | null,
  _durablePredictions: null as {
    rises: HomeMarketMover[];
    falls: HomeMarketMover[];
    allRises: HomeMarketMover[];
    allFalls: HomeMarketMover[];
    riseCount: number;
    fallCount: number;
    notice: string;
    fetchedAt: string;
  } | null,
  _deadlineRetryAttempts: 0,

  onLoad() {
    this._pageVisible = true;
    this._initialLoadDone = false;
    return this.startHomeLifecycle("cold-launch", "page-load");
  },

  async onShow() {
    this._pageVisible = true;
    // The price live poller only resumes after the first prediction load —
    // polling with the "unavailable" seed would fetch a board nobody sees.
    if (this._durablePredictions) this._priceLivePoller?.start();
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
      await waitForAuthoritativeFollow();
      if (
        !this._pageVisible
        || lifecycleRevision !== this._lifecycleRevision
        || tracker !== this._perfTracker
      ) return;
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
        this.syncFixtureLiveRefresh();
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
    this._priceRequestId += 1;
    this._refreshRequestId += 1;
    this.stopCountdown();
    this.stopFixtureLiveRefresh();
    this._priceLivePoller?.stop();
    this._priceLivePoller = null;
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
    this._priceRequestId += 1;
    this._refreshRequestId += 1;
    this.stopCountdown();
    this.stopFixtureLiveRefresh();
    this._priceLivePoller?.stop();
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
    await waitForAuthoritativeFollow();
    if (!this._pageVisible || requestId !== this._loadRequestId) return false;
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
      const currentGw = Number(app.globalData.currentGw) || 0;
      const displayGw = Number(app.globalData.gw) || 0;
      const nextGw = Number(app.globalData.nextGw) || 0;
      const fixtureGw = this._fixtureGwUserSelected && this.data.selectedFixtureGw
        ? clampFixtureGw(this.data.selectedFixtureGw, MIN_FIXTURE_GW)
        : clampFixtureGw(
          resolveHomeFixtureEvent(currentGw, displayGw, nextGw),
          MIN_FIXTURE_GW
        );
      const hadFixtureRows = this.data.fixtureCount > 0 && this.data.selectedFixtureGw === fixtureGw;
      await this.syncAppState({
        loading: !this._initialLoadDone && !hadFixtureRows,
        fixtureLoading: !hadFixtureRows,
        error: "",
        fixtureError: "",
        fixtureStaleMessage: "",
        entryError: "",
        selectedFixtureGw: fixtureGw,
        minFixtureGw: MIN_FIXTURE_GW,
        fixtureEmptyPast: fixtureGw < (app.globalData.currentGw || app.globalData.nextGw || MIN_FIXTURE_GW)
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
      const fixtureTask = readHomeFixtureSelection(
        fixtureGw,
        currentGw,
        nextGw,
        String(app.globalData.season || ""),
        forceRefresh,
        trace,
        !this._fixtureGwUserSelected
      ).then(({ event, read }) => ({
        event,
        fixtures: read.data,
        failed: false,
        stale: read.meta.stale,
        storedAt: read.meta.storedAt || Date.now()
      })).catch((error) => {
        fixtureError = error instanceof Error ? error.message : "赛程加载失败";
        return {
          event: fixtureGw,
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
      // The prediction board is loaded lazily on tab activation; once loaded it
      // follows the same refresh cadence as the rest of the page.
      if (this.data.predictionLoaded) {
        void this.loadPricePredictions(forceRefresh);
      }
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
          selectedFixtureGw: fixtureResult.event,
          fixtureEmptyPast: fixtureResult.event < (currentGw || nextGw || MIN_FIXTURE_GW),
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
          this.syncFixtureLiveRefresh();
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
        this._deadlineRetryAttempts = 0;
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
    tracker?.expectSecondaryCompletion();
    this._secondaryPending = true;
    const app = getApp<IAppOption>();
    this.setData({
      supplementLoading: true,
      priceError: "",
      marketUnavailable: false,
      gameweekStatsError: "",
      entryError: "",
      hasEntryBinding: Boolean(currentFollowEntryId()),
    });
    const personalTask = (async (): Promise<void> => {
      if (!getApiSessionToken()) {
        try { await app.authReady; } catch {}
      }
      if (getApiSessionToken()) {
        await waitForAuthoritativeFollow();
      }
      if (!isActiveSecondary()) return;
      // The bound id is the viewer authority. Do not infer binding from the
      // display object: a failed detail read leaves `entry` empty and must not
      // turn an already-bound team into a "去选择" CTA.
      const entryId = currentFollowEntryId();
      this.setData({ hasEntryBinding: Boolean(entryId) });
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
              currentGw,
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
      this.data.availabilityRows.length > 0 ||
      this.data.priceRisers.length > 0 ||
      this.data.priceFallers.length > 0;
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
          priceChangeDate: market.priceChangeDate,
          priceRisers: market.priceRisers,
          priceFallers: market.priceFallers,
          marketCapturedAt: market.capturedAt,
          marketOwnershipCapturedAt: market.ownershipCapturedAt,
          ownershipState: market.ownershipState,
          priceChangesState: market.priceChangesState,
          availabilityState: market.availabilityState,
          ...buildMarketUpdatedLabels(market),
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
            priceChangeDate: "",
            priceRisers: [],
            priceFallers: [],
            marketCapturedAt: "",
            marketOwnershipCapturedAt: "",
            ownershipState: "UNAVAILABLE" as HomeMarketSectionState,
            priceChangesState: "UNAVAILABLE" as HomeMarketSectionState,
            availabilityState: "UNAVAILABLE" as HomeMarketSectionState,
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
    // Dream team follows the same event as the GW stats card so the two stay
    // consistent; it is below the fold and must not gate personal data.
    const summaryEvent = Number(supplement.summary?.event || 0);
    if (summaryEvent > 0) {
      this._statsEvent = summaryEvent;
      this._statPlayers = buildStatPlayerRows(supplement.summary);
      void this.loadDreamTeam(summaryEvent, forceRefresh);
    }
    await personalTask;
    if (!isActiveSecondary()) return;
    this._secondaryPending = false;
    if (!this.data.noticeClosed && nextNotice) this.scheduleNoticeAutoClose(nextNotice);
    tracker?.mark("secondaryCompleteAt");
  },

  startSecondaryData() {
    const requestId = ++this._loadRequestId;
    const snapshot = getAppContextSnapshot();
    const app = getApp<IAppOption>();
    const currentGw = Number(app.globalData.currentGw) || 0;
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
      currentGw,
      false,
      trace,
      tracker
    );
  },

  syncAppState(extra: Partial<HomeData> = {}): Promise<void> {
    const app = getApp<IAppOption>();
    const utcDeadline = app.globalData.utcDeadline;
    const defaultFixtureGw = resolveHomeFixtureEvent(
      app.globalData.currentGw,
      app.globalData.gw,
      app.globalData.nextGw
    );
    const selectedFixtureGw = this._fixtureGwUserSelected && this.data.selectedFixtureGw
      ? this.data.selectedFixtureGw
      : defaultFixtureGw;
    // A freshly advanced deadline resets the post-deadline backoff ladder.
    if (
      utcDeadline
      && utcDeadline !== this.data.utcDeadline
      && getDeadlineDiffMs(utcDeadline) > 0
    ) {
      this._deadlineRetryAttempts = 0;
    }
    return setDataAsync(this, {
      gw: app.globalData.gw,
      currentGw: app.globalData.currentGw,
      nextGw: app.globalData.nextGw,
      minFixtureGw: MIN_FIXTURE_GW,
      selectedFixtureGw: clampFixtureGw(selectedFixtureGw, MIN_FIXTURE_GW),
      deadline: app.globalData.deadline,
      utcDeadline,
      deadlinePassed: Boolean(utcDeadline) && getDeadlineDiffMs(utcDeadline) <= 0,
      countdown: formatCountdown(getDeadlineDiffMs(utcDeadline)),
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
    this._deadlineRetryAttempts += 1;
    const delay = deadlineRetryDelayMs(this._deadlineRetryAttempts);
    this.countdownTimer = setTimeout(() => {
      this.countdownTimer = undefined;
      if (!this._pageVisible) return;
      void this.refreshHome(true);
    }, delay) as unknown as number;
  },

  updateCountdown(): boolean {
    const ms = getDeadlineDiffMs(this.data.utcDeadline);
    const countdown = formatCountdown(ms);
    const passed = Boolean(this.data.utcDeadline) && ms <= 0;
    const patch: Partial<HomeData> = {};
    if (countdown !== this.data.countdown) {
      patch.countdown = countdown;
    }
    if (passed !== this.data.deadlinePassed) {
      patch.deadlinePassed = passed;
    }
    if (Object.keys(patch).length > 0) {
      this.setData(patch);
    }
    if (passed) {
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

  onSelectPulseTab(event: WechatMiniprogram.TouchEvent) {
    const tab = String(event.currentTarget.dataset.tab || "");
    if ((tab !== "ownership" && tab !== "watch") || tab === this.data.pulseTab) return;
    this.setData({ pulseTab: tab });
  },

  onSelectPriceTab(event: WechatMiniprogram.TouchEvent) {
    const tab = String(event.currentTarget.dataset.tab || "");
    if ((tab !== "today" && tab !== "likely") || tab === this.data.priceTab) return;
    this.setData({ priceTab: tab });
    // The prediction board stays lazy: first activation of the trends view.
    if (tab === "likely" && !this.data.predictionLoaded && !this.data.predictionLoading) {
      void this.loadPricePredictions();
    }
  },

  async loadPricePredictions(forceRefresh = false) {
    const requestId = ++this._priceRequestId;
    const hadRows =
      this.data.predictedAllRisers.length > 0 || this.data.predictedAllFallers.length > 0;
    this.setData({
      predictionLoading: !hadRows,
      predictionError: "",
    });
    try {
      const result = await getMiniHomePricePredictions(forceRefresh);
      if (!this._pageVisible || requestId !== this._priceRequestId) return;
      this.setData({
        predictedAllRisers: result.allRises,
        predictedAllFallers: result.allFalls,
        predictedRiseCount: result.riseCount,
        predictedFallCount: result.fallCount,
        predictionNotice: result.notice,
        predictionLoading: false,
        predictionError: "",
        predictionLoaded: true,
        predictionUpdated: predictionUpdatedLabel(result.fetchedAt),
      });
      this._durablePredictions = {
        rises: result.rises,
        falls: result.falls,
        allRises: result.allRises,
        allFalls: result.allFalls,
        riseCount: result.riseCount,
        fallCount: result.fallCount,
        notice: result.notice,
        fetchedAt: result.fetchedAt,
      };
      // Seed and start the live channel (web HomePriceChangeCarousel
      // usePriceChangeLiveUpdates — the home card passes no durable board and
      // restores its server projection via onReset).
      if (!this._priceLivePoller) {
        this._priceLivePoller = new PriceChangeLivePoller({
          onUpdate: (board) => {
            if (!this._pageVisible) return;
            const rows = mapHomePredictionRows(board);
            this.setData({
              predictedAllRisers: rows.allRises,
              predictedAllFallers: rows.allFalls,
              predictedRiseCount: rows.riseCount,
              predictedFallCount: rows.fallCount,
              predictionNotice: "",
              predictionUpdated: predictionUpdatedLabel(board.fetchedAt || ""),
            });
          },
          onReset: () => {
            if (!this._pageVisible) return;
            const durable = this._durablePredictions;
            if (!durable) return;
            this.setData({
              predictedAllRisers: durable.allRises,
              predictedAllFallers: durable.allFalls,
              predictedRiseCount: durable.riseCount,
              predictedFallCount: durable.fallCount,
              predictionNotice: durable.notice,
              predictionUpdated: predictionUpdatedLabel(durable.fetchedAt),
            });
          },
        });
      }
      this._priceLivePoller.updateSeed(result.seed);
      this._priceLivePoller.start();
    } catch (error) {
      if (!this._pageVisible || requestId !== this._priceRequestId) return;
      this.setData({
        predictionLoading: false,
        predictionLoaded: true,
        predictionError: error instanceof Error ? error.message : "身价预测加载失败",
      });
    }
  },

  onRetryPredictions() {
    void this.loadPricePredictions(true);
  },

  onOpenPricePredictions() {
    navigateTo(routes.explorePriceChanges);
  },

  onOpenLiveMatches() {
    navigateTo(routes.liveMatch);
  },

  onTapGameweekStat(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key || "");
    const targetId = Number(event.currentTarget.dataset.target || 0);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) return;
    // Web parity: highest score opens that entry's live points; player tiles
    // (top scorer, most captained) open the player detail card overlay.
    if (key === "highestScore") {
      goToLiveEntry(targetId);
      return;
    }
    const player = this._statPlayers[key];
    if (player) {
      this.openPlayerSheet(player);
      return;
    }
    goToPlayerDetail(targetId);
  },

  onOpenGameweekStats() {
    navigateTo(routes.summaryGameweek);
  },

  async loadDreamTeam(event: number, forceRefresh = false) {
    if (!forceRefresh && this._dreamTeamLoadedEvent === event) return;
    try {
      const result = await getMiniHomeDreamTeam(event, forceRefresh);
      if (!this._pageVisible) return;
      this._dreamTeamLoadedEvent = event;
      // Same pitch rendering as the gameweek summary page's dream team tab.
      const pitch = buildDreamTeamPitchState(result.players, event);
      // Same player detail sheet as the gameweek summary page: index the raw
      // rows so a pitch tap can open the live-style stat card.
      this.dreamTeamById = indexDreamTeamById(pitch.pitchPlayers, result.players);
      this.setData({
        dreamTeamEvent: event,
        dreamPlayers: pitch.pitchPlayers,
        dreamHeader: pitch.pitchHeader,
        hasDreamTeam: pitch.pitchPlayers.length > 0,
      });
    } catch {
      // The dream team card is optional below-the-fold content: stay hidden on failure.
    }
  },

  onDreamPlayerTap(event: WechatMiniprogram.CustomEvent) {
    // Web parity: the dream-team pitch opens the player detail card as an
    // overlay (PlayerDetailModal), not a page navigation.
    const player = this.dreamTeamById[String(event.detail?.playerId || "")];
    if (!player) return;
    this.openPlayerSheet(player);
  },

  /**
   * Open the player detail sheet with what the hosting card already knows,
   * then lazily fill the full GW stat set (web useMatchPlayerDetail cadence:
   * base row first, playerLive fetch second).
   */
  openPlayerSheet(player: LivePlayerRow) {
    const requestId = ++this._playerSheetRequestId;
    this.setData({
      playerDetailOpen: true,
      playerDetail: buildPlayerLiveDetail(player)
    });
    const element = Number(player.element);
    const eventId = this._statsEvent || this.data.dreamTeamEvent;
    if (!element || !eventId) return;
    void getPlayerLiveStats(element, eventId)
      .then((stats) => {
        if (
          !this._pageVisible
          || requestId !== this._playerSheetRequestId
          || !this.data.playerDetailOpen
          || !stats
        ) return;
        // Keep the card context (status badge, captain marks); fill stats only.
        this.setData({
          playerDetail: buildPlayerLiveDetail({
            ...stats,
            statusText: player.statusText,
            playStatus: player.playStatus,
            captain: player.captain,
            viceCaptain: player.viceCaptain,
            multiplier: player.multiplier
          })
        });
      })
      .catch(() => {});
  },

  onClosePlayerDetail() {
    this._playerSheetRequestId += 1;
    this.setData({ playerDetailOpen: false });
  },

  onTapMarketPlayer(event: WechatMiniprogram.TouchEvent) {
    const playerId = Number(event.currentTarget.dataset.id || 0);
    if (!Number.isSafeInteger(playerId) || playerId <= 0) return;
    goToPlayerDetail(playerId);
  },

  async onShareDreamPitch() {
    if (this.data.dreamShareBusy) return;
    const pitch = this.selectComponent("#home-dream-pitch") as WechatMiniprogram.Component.TrivialInstance & {
      exportPortraitShareImage?: () => Promise<string>;
    } | null;
    if (!pitch?.exportPortraitShareImage) {
      wx.showToast({ title: "阵容图还没准备好", icon: "none" });
      return;
    }
    this.setData({ dreamShareBusy: true });
    try {
      await presentSquadPitchShareImage(await pitch.exportPortraitShareImage());
    } catch {
      wx.showToast({ title: "阵容图生成失败", icon: "none" });
    } finally {
      this.setData({ dreamShareBusy: false });
    }
  },

  async onShareDeadlineImage() {
    if (this.data.deadlineShareBusy || !this.data.utcDeadline) return;
    this.setData({ deadlineShareBusy: true });
    try {
      const path = await exportDeadlineShareImage({
        event: this.data.nextGw,
        deadlineText: this.data.deadline,
        countdown: this.data.countdown,
        passed: this.data.deadlinePassed,
      });
      await presentDeadlineShareImage(path);
    } catch {
      wx.showToast({ title: "图片生成失败", icon: "none" });
    } finally {
      this.setData({ deadlineShareBusy: false });
    }
  },

  // Image-only share on both market cards, mirroring the web carousels'
  // ShareActions (["image"]). The image renders the view the user is looking
  // at: ownership movers, the availability watch list, recorded price changes,
  // or the prediction board.
  async onShareMarketImage() {
    if (this.data.marketShareBusy) return;
    const ownership = this.data.pulseTab === "ownership";
    const rows = ownership
      ? this.data.marketRisers.length + this.data.marketFallers.length
      : this.data.availabilityRows.length;
    if (rows === 0) {
      wx.showToast({ title: "暂无可分享的数据", icon: "none" });
      return;
    }
    this.setData({ marketShareBusy: true });
    try {
      const path = ownership
        ? await exportHomeMarketMoversShareImage({
            title: "持有率变化",
            subtitle: this.data.marketOwnershipUpdated,
            upTitle: "持有上升",
            downTitle: "持有下降",
            upRows: this.data.marketRisers,
            downRows: this.data.marketFallers,
          })
        : await exportHomeMarketWatchShareImage({
            title: "出场状态观察",
            subtitle: this.data.marketWatchUpdated,
            rows: this.data.availabilityRows.map((row) => ({
              name: row.name,
              team: row.team,
              owned: row.owned,
              status: row.status,
              tone: row.statusKey === "available"
                ? "up" as const
                : row.statusKey === "unknown"
                  ? "" as const
                  : "down" as const,
              body: row.body,
            })),
          });
      await presentHomeMarketShareImage(path);
    } catch {
      wx.showToast({ title: "图片生成失败", icon: "none" });
    } finally {
      this.setData({ marketShareBusy: false });
    }
  },

  async onSharePriceImage() {
    if (this.data.priceShareBusy) return;
    const likely = this.data.priceTab === "likely";
    if (likely && !this.data.predictionLoaded) {
      wx.showToast({ title: "预测加载中，请稍候", icon: "none" });
      return;
    }
    const rows = likely
      ? this.data.predictedAllRisers.length + this.data.predictedAllFallers.length
      : this.data.priceRisers.length + this.data.priceFallers.length;
    if (rows === 0) {
      wx.showToast({ title: "暂无可分享的数据", icon: "none" });
      return;
    }
    this.setData({ priceShareBusy: true });
    try {
      // The share image has no pill element, so prediction rows fold the
      // status label back into the meta line.
      const withStatus = (rows: HomeMarketMover[]) =>
        rows.map((row) => ({
          ...row,
          meta: row.statusLabel ? `${row.meta} · ${row.statusLabel}` : row.meta,
        }));
      const path = await exportHomeMarketMoversShareImage(
        likely
          ? {
              title: "涨跌趋势",
              subtitle: this.data.predictionUpdated,
              upTitle: "预计上涨",
              downTitle: "预计下跌",
              upCount: this.data.predictedRiseCount,
              downCount: this.data.predictedFallCount,
              maxRows: Math.max(this.data.predictedRiseCount, this.data.predictedFallCount),
              upRows: withStatus(this.data.predictedAllRisers),
              downRows: withStatus(this.data.predictedAllFallers),
            }
          : {
              title: "身价变化",
              subtitle: this.data.priceTodayUpdated,
              upTitle: "上涨",
              downTitle: "下跌",
              upRows: this.data.priceRisers,
              downRows: this.data.priceFallers,
            },
      );
      await presentHomeMarketShareImage(path);
    } catch {
      wx.showToast({ title: "图片生成失败", icon: "none" });
    } finally {
      this.setData({ priceShareBusy: false });
    }
  },


  // Image-only share on the fixtures card, same affordance as the market
  // cards (web MatchesSection has no share action — this is mini-only). The
  // image covers the whole selected gameweek grouped by day; the day tabs are
  // in-card pagination, not separate shareable views.
  async onShareFixtureImage() {
    if (this.data.fixtureShareBusy) return;
    const days = this.data.fixtureDays;
    const total = days.reduce((sum, day) => sum + day.rows.length, 0);
    if (total === 0) {
      wx.showToast({ title: "暂无可分享的数据", icon: "none" });
      return;
    }
    this.setData({ fixtureShareBusy: true });
    try {
      const gw = this.data.selectedFixtureGw || this.data.nextGw;
      const path = await exportHomeFixtureShareImage({
        title: "近期赛程",
        subtitle: `GW${gw}${this.data.fixtureLive ? " · 直播中" : ""}`,
        days,
      });
      await presentHomeFixtureShareImage(path);
    } catch {
      wx.showToast({ title: "图片生成失败", icon: "none" });
    } finally {
      this.setData({ fixtureShareBusy: false });
    }
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
      this._fixtureGwUserSelected = true;
      this.loadFixtureGw(nextGw);
    }
  },

  onNextFixtureGw() {
    if (this.data.selectedFixtureGw >= 38) {
      return;
    }

    const nextGw = Math.min(38, this.data.selectedFixtureGw + 1);
    if (nextGw !== this.data.selectedFixtureGw) {
      this._fixtureGwUserSelected = true;
      this.loadFixtureGw(nextGw);
    }
  },

  async loadFixtureGw(event: number, forceRefresh = false, silent = false) {
    const requestId = ++this._fixtureGwRequestId;
    const app = getApp<IAppOption>();
    const currentGw = Number(app.globalData.currentGw) || 0;
    const nextGw = Number(app.globalData.nextGw) || 0;
    if (!silent) {
      this.setData({
        fixtureLoading: true,
        fixtureError: "",
        fixtureStaleMessage: "",
        fixtureStoredAt: null,
        fixtureStaleStoredAt: null,
        selectedFixtureGw: event,
        fixtureLive: false,
        fixtureEmptyPast: event < (this.data.currentGw || this.data.nextGw || MIN_FIXTURE_GW),
        ...emptyFixtureDesk()
      });
    }
    try {
      const selection = await readHomeFixtureSelection(
        event,
        currentGw,
        nextGw,
        String(app.globalData.season || ""),
        forceRefresh,
        null,
        !this._fixtureGwUserSelected
      );
      if (!this._pageVisible || requestId !== this._fixtureGwRequestId) return;
      const selectedEvent = selection.event;
      const read = selection.read;
      const staleStoredAt = read.meta.stale ? read.meta.storedAt || null : null;
      this.setData({
        selectedFixtureGw: selectedEvent,
        fixtureEmptyPast: selectedEvent < (currentGw || nextGw || MIN_FIXTURE_GW),
        ...fixtureDeskState(read.data),
        fixtureStoredAt: read.meta.storedAt || Date.now(),
        fixtureStaleStoredAt: staleStoredAt,
        fixtureStaleMessage: read.meta.stale ? fixtureStaleMessage(staleStoredAt) : ""
      }, () => {
        this.syncFixtureLiveRefresh();
      });
    } catch (error) {
      if (!this._pageVisible || requestId !== this._fixtureGwRequestId) return;
      if (silent) return; // Keep showing the last good rows on a failed background tick.
      this.setData({
        ...emptyFixtureDesk(),
        fixtureLive: false,
        fixtureStaleMessage: "",
        fixtureStaleStoredAt: null,
        fixtureError: error instanceof Error ? error.message : "赛程加载失败"
      });
    } finally {
      if (!silent && this._pageVisible && requestId === this._fixtureGwRequestId) {
        this.setData({ fixtureLoading: false });
      }
    }
  },

  syncFixtureLiveRefresh() {
    const shouldRun = this.data.fixtureLive && this._pageVisible;
    if (!shouldRun) {
      this.stopFixtureLiveRefresh();
      return;
    }
    if (this.fixtureLiveTimer !== undefined) return;
    this.fixtureLiveTimer = setInterval(() => {
      // Skip the tick while the page is hidden or a user-initiated load is in
      // flight — the next tick (or the onShow restart) catches up.
      if (!this._pageVisible || !this.data.fixtureLive || this.data.fixtureLoading) return;
      void this.loadFixtureGw(this.data.selectedFixtureGw, true, true);
    }, FIXTURE_LIVE_REFRESH_MS) as unknown as number;
  },

  stopFixtureLiveRefresh() {
    if (this.fixtureLiveTimer !== undefined) {
      clearInterval(this.fixtureLiveTimer);
      this.fixtureLiveTimer = undefined;
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
  const hasScore = typeof fixture.homeScore === "number"
    && typeof fixture.awayScore === "number";
  const finished = fixture.finished === true && hasScore;
  // Web parity: in-progress matches show the live score, not the kickoff time.
  const live = fixture.started === true && !finished && hasScore;
  return {
    id: String(fixture.id || `${fixture.teamId || "team"}-${fixture.againstTeamId || "against"}-${index}`),
    homeName: fixture.teamName || fixture.homeTeam || fixture.teamShortName || "-",
    awayName: fixture.againstTeamName || fixture.awayTeam || fixture.againstTeamShortName || "-",
    centerLabel: finished || live
      ? `${fixture.homeScore}-${fixture.awayScore}`
      : validKickoff
        ? formatKickoffTime(kickoff as Date)
        : "待定",
    finished,
    live
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
  const selectedDayKey = resolvePreferredHomeFixtureDayKey(days, now);
  return { days, selectedDayKey };
}

/** Select today's matchday, then the next upcoming day, then the last day. */
export function resolvePreferredHomeFixtureDayKey(
  days: readonly Pick<HomeFixtureDay, "dateKey">[],
  now = new Date()
): string {
  const today = localDateKey(now);
  const todayDay = days.find((day) => day.dateKey === today);
  if (todayDay) return todayDay.dateKey;

  const nextDay = days.find((day) => day.dateKey !== "tbd" && day.dateKey > today);
  if (nextDay) return nextDay.dateKey;

  const scheduledDays = days.filter((day) => day.dateKey !== "tbd");
  return scheduledDays[scheduledDays.length - 1]?.dateKey
    || days[0]?.dateKey
    || "";
}

function fixtureDeskState(fixtures: Fixture[]): Pick<HomeData, "fixtureDays" | "selectedFixtureDayKey" | "selectedDayRows" | "fixtureCount" | "fixtureLive"> {
  const grouped = groupHomeFixturesByDay(fixtures);
  const selected = grouped.days.find((day) => day.dateKey === grouped.selectedDayKey);
  return {
    fixtureDays: grouped.days,
    selectedFixtureDayKey: grouped.selectedDayKey,
    selectedDayRows: selected ? selected.rows : [],
    fixtureCount: grouped.days.reduce((count, day) => count + day.rows.length, 0),
    fixtureLive: grouped.days.some((day) => day.rows.some((row) => row.live))
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

/**
 * Base rows for the tappable player tiles (top scorer / most captained). The
 * summary carries identity only; openPlayerSheet fills the full stat line via
 * playerLive, mirroring the web modal's base-then-fetch flow.
 */
export function buildStatPlayerRows(
  summary?: GameweekOverallSummary,
): Record<string, LivePlayerRow> {
  const rows: Record<string, LivePlayerRow> = {};
  const top = summary?.topElementInfo;
  const topPlayer = top?.player;
  const topId = Number(topPlayer?.id || 0);
  if (topId > 0) {
    const team = topPlayer?.teamShortName || topPlayer?.team?.shortName || "";
    rows.topScorer = {
      element: topId,
      name: topPlayer?.webName || "-",
      webName: topPlayer?.webName || "-",
      team,
      teamShortName: team,
      points: Number(top?.points) || 0,
      totalPoints: Number(top?.points) || 0,
      statusText: "最高分球员",
      playStatus: 4
    };
  }
  const captained = summary?.mostCaptainedPlayer;
  const captainedId = Number(captained?.id || 0);
  if (captainedId > 0) {
    const team = captained?.teamShortName || "";
    rows.viceCaptain = {
      element: captainedId,
      name: captained?.webName || "-",
      webName: captained?.webName || "-",
      team,
      teamShortName: team,
      statusText: "最多选择队长",
      playStatus: 4
    };
  }
  return rows;
}

export function mapHomeGameweekStats(summary?: GameweekOverallSummary): HomeStatRow[] {  if (!summary) {
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
      value: formatOptionalNumber(summary.highestScore),
      targetId: Number(summary.highestScoringEntry) > 0
        ? Number(summary.highestScoringEntry)
        : 0
    },
    {
      key: "topScorer",
      label: "最高分球员",
      value: formatTopScorer(summary),
      targetId: Number(summary.topElementInfo?.player?.id) > 0
        ? Number(summary.topElementInfo?.player?.id)
        : 0
    },
    {
      key: "viceCaptain",
      label: "最多选择队长",
      value: summary.mostCaptainedPlayer?.webName || "-",
      targetId: Number(summary.mostCaptainedPlayer?.id) > 0
        ? Number(summary.mostCaptainedPlayer?.id)
        : 0
    },
    {
      key: "chip",
      label: "开的最多的卡",
      value: topChip ? `${formatChipName(topChip.chipName)} ${formatCompactNumber(topChip.numberPlayed)}` : "-",
      targetId: 0
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
