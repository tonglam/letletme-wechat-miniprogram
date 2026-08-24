import {
  getEntryTeamStatsEventResult,
  getEntryTeamStatsHistory,
  getEntryTeamStatsTransfers,
  type EntryEventPick,
  type EntryEventResult,
  type EntryGameweekTransfers,
  type EntryHistoryItem,
  type EntryHistoryPayload,
  type EntrySeasonHistoryItem,
  type EntryTransferMove,
} from "../../../services/summary.service";
import {
  goToEntrySearch,
  goToLiveEntry,
  setPageTitle,
} from "../../../utils/navigation";
import {
  buildPlayerLiveDetail,
  type PlayerLiveDetailView,
} from "../../live/entry/player-detail";
import type { LivePlayerRow } from "../../../models/live";
import {
  formatCompactNumber,
  formatPoints,
} from "../../../utils/summary-format";
import {
  buildSquadPitchView,
  type SquadPitchHeader,
  type SquadPitchPlayer,
} from "../../../utils/squad-pitch";
import { resetShareImageCache } from "../../../utils/squad-pitch-canvas";
import { presentImage } from "../../../utils/album-presenter";
import {
  SEASON_CHART_MODES,
  buildSeasonChartView,
  historyToSeasonChartPoints,
  isCurrentSeasonLabel,
  pastSeasonSummary,
  toPastSeasonChartPoints,
  type PastSeasonChartPoint,
  type SeasonChartMode,
  type SeasonChartPoint,
} from "../../../utils/season-chart";
import type { MiniChartPoint, MiniChartType } from "../../../utils/mini-chart";
import { getCurrentSnapshotState } from "../../../services/my-fpl.service";
import type { LiveSnapshotState } from "../../../models/live";
import {
  currentMyFplEntryId,
  refreshAuthoritativeFollow,
  waitForAuthoritativeFollow,
} from "../../../utils/follow";
import { canReadEventReporting } from "../../../utils/event-context";
import {
  ensureAppContext,
  getAppContextSnapshot,
  shouldRefreshAppContext,
} from "../../../services/app-context.service";
import { PagePerformanceTracker } from "../../../utils/page-performance";
import {
  capturePageRequestTrace,
  isViewerEntryAuthorizationError,
  type PageRequestTrace,
} from "../../../services/graphql.service";

export function phaseBannerFromSnapshot(
  snapshotState: LiveSnapshotState | undefined,
): "" | "live" | "settling" {
  // The current snapshot contract has no explicit SETTLING state. Without a
  // successful probe (or a deadline passed into this page), absence is
  // unknown rather than evidence that processing has begun.
  return snapshotState === "LIVE" ? "live" : "";
}

type EntrySummaryTab = "squad" | "transfer" | "chips" | "history";
type EntrySummaryEmptyState = "" | "entry" | "event";

interface MetricCard {
  label: string;
  value: string;
  meta?: string;
  tone?: "default" | "bad";
}

/** player-row contract — the same shape the live entry page renders, plus the
 *  raw match stats buildPlayerLiveDetail reads when a row is tapped. */
interface SquadRow {
  id: string;
  name: string;
  roleText: string;
  team: string;
  position: string;
  metaText: string;
  statusText: string;
  points: string;
  bench: boolean;
  captain?: boolean;
  viceCaptain?: boolean;
  multiplier?: number;
  minutes?: number;
  goalsScored?: number;
  assists?: number;
  cleanSheets?: number;
  saves?: number;
  yellowCards?: number;
  redCards?: number;
  bonus?: number;
  bps?: number;
}

/** swap-row contract — the same shape the live entry page renders. */
interface TransferMoveRow {
  id: string;
  outName: string;
  outTeam: string;
  /** 当轮得分 — entryTransferHistory(live: true) reads the per-GW stats table. */
  outPointsText: string;
  inName: string;
  inTeam: string;
  inPointsText: string;
  priceText: string;
}

interface TransferRow {
  id: string;
  gameweek: string;
  transfers: string;
  cost: string;
  hasCost: boolean;
  emptyText: string;
  moves: TransferMoveRow[];
  /** Normalized chip code for this GW ("" when none) — WC/FH weeks render collapsed. */
  chip: string;
  transferCount: number;
  /** WC/FH or bulk weeks collapse behind a tap instead of flooding the list (web parity). */
  collapsible: boolean;
  collapsed: boolean;
}

type TransferFilter = "with" | "all" | "none";

/** WC/FH (unlimited transfers) or any week whose move list would flood the page. */
const TRANSFER_COLLAPSE_MOVE_THRESHOLD = 8;

/* Long-list paging — web TeamTransfersTab shows 6+8, TeamGameweekHistory 12+12. */
export const TRANSFER_PAGE_SIZE = 8;
export const HISTORY_PAGE_SIZE = 12;

export function retainTransferRowsAfterFailure(
  freshRows: TransferRow[],
  previousRows: TransferRow[],
  transferFailed: boolean,
  sameSeason: boolean,
): TransferRow[] {
  return transferFailed && sameSeason && previousRows.length > 0
    ? previousRows
    : freshRows;
}

/** One row per chip family — web TeamChipsTab inventory: used/remaining per half. */
interface ChipInventoryRow {
  id: string;
  code: string;
  name: string;
  firstText: string;
  secondText: string;
  firstOut: boolean;
  secondOut: boolean;
}

/** Usage log row — GW / chip / that round's outcome. */
interface ChipLogRow {
  id: string;
  gameweek: string;
  halfText: string;
  chip: string;
  pointsText: string;
  netText: string;
  rankText: string;
}

interface HistoryRow {
  id: string;
  gameweek: string;
  /** 本轮得分 — the number users scan a GW history for. */
  pointsText: string;
  captainName: string;
  captainPointsText: string;
  costText: string;
  costBad: boolean;
  rankText: string;
}

interface SeasonHistoryRow {
  id: string;
  season: string;
  totalPoints: string;
  overallRank: string;
  pointsValue: number;
  rankValue: number;
  /** True only when the row matches the authoritative app-context season. */
  current: boolean;
}

interface TeamStatsViewModel {
  headerTitle: string;
  headerSubtitle: string;
  heroScore: string;
  heroScoreSub: string;
  totalTransfersText: string;
  overviewStats: MetricCard[];
  eventStats: MetricCard[];
  squadRows: SquadRow[];
  transferRows: TransferRow[];
  chipInventoryRows: ChipInventoryRow[];
  chipLogRows: ChipLogRow[];
  historyRows: HistoryRow[];
  seasonHistoryRows: SeasonHistoryRow[];
}

interface EntrySummaryData {
  loading: boolean;
  error: string;
  transferError: string;
  tabLoading: boolean;
  tabError: string;
  emptyState: EntrySummaryEmptyState;
  emptyEyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionText: string;
  entryId?: number;
  event: number;
  maxGw: number;
  activeTab: EntrySummaryTab;
  showSquad: boolean;
  showTransfer: boolean;
  showChips: boolean;
  showHistory: boolean;
  headerTitle: string;
  headerSubtitle: string;
  heroScore: string;
  heroScoreSub: string;
  totalTransfersText: string;
  overviewStats: MetricCard[];
  eventStats: MetricCard[];
  squadRows: SquadRow[];
  starterRows: SquadRow[];
  benchRows: SquadRow[];
  transferRows: TransferRow[];
  transferFilter: TransferFilter;
  transferSummary: MetricCard[];
  visibleTransferRows: TransferRow[];
  transferFilterNote: string;
  transferPageSize: number;
  transferHasMore: boolean;
  chipInventoryRows: ChipInventoryRow[];
  chipLogRows: ChipLogRow[];
  historyRows: HistoryRow[];
  pagedHistoryRows: HistoryRow[];
  historyPageSize: number;
  historyHasMore: boolean;
  seasonHistoryRows: SeasonHistoryRow[];
  hasSquad: boolean;
  hasBench: boolean;
  hasTransfers: boolean;
  hasChips: boolean;
  hasHistory: boolean;
  hasTeamData: boolean;
  supportAvailable: boolean;
  /** LIVE/SETTLING banner for the current gameweek; "" otherwise. */
  phaseBanner: "" | "live" | "settling";
  /** In-page player sheet — same component the live entry page uses. */
  playerDetailOpen: boolean;
  playerDetail: PlayerLiveDetailView | null;
  pitchPlayers: SquadPitchPlayer[];
  pitchBench: SquadPitchPlayer[];
  pitchHeader: SquadPitchHeader | null;
  pitchBenchBoost: boolean;
  shareImagePath: string;
  shareBusy: boolean;
  seasonChartPoints: SeasonChartPoint[];
  seasonChartModes: Array<{ id: SeasonChartMode; label: string }>;
  seasonChartMode: SeasonChartMode;
  seasonChartVisible: boolean;
  seasonChartType: MiniChartType;
  seasonChartInvertY: boolean;
  seasonChartReferenceY: number | null;
  seasonChartHasReference: boolean;
  seasonChartSeries: MiniChartPoint[];
  seasonChartHint: string;
  seasonChartSummary: string;
  seasonChartSelectedGw: number | null;
  seasonChartHasSelected: boolean;
  pastSeasonVisible: boolean;
  pastSeasonSeries: MiniChartPoint[];
  pastSeasonSummary: string;
  pastSeasonSelected: number | null;
  pastSeasonHasSelected: boolean;
}

Page({
  data: {
    loading: false,
    error: "",
    transferError: "",
    tabLoading: false,
    tabError: "",
    emptyState: "",
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
    entryId: 0,
    event: 1,
    maxGw: 1,
    activeTab: "squad",
    showSquad: true,
    showTransfer: false,
    showChips: false,
    showHistory: false,
    headerTitle: "球队数据",
    headerSubtitle: "",
    heroScore: "",
    heroScoreSub: "",
    totalTransfersText: "",
    overviewStats: [],
    eventStats: [],
    squadRows: [],
    starterRows: [],
    benchRows: [],
    transferRows: [],
    transferFilter: "with",
    transferSummary: [],
    visibleTransferRows: [],
    transferFilterNote: "",
    transferPageSize: TRANSFER_PAGE_SIZE,
    transferHasMore: false,
    chipInventoryRows: [],
    chipLogRows: [],
    historyRows: [],
    pagedHistoryRows: [],
    historyPageSize: HISTORY_PAGE_SIZE,
    historyHasMore: false,
    seasonHistoryRows: [],
    hasSquad: false,
    hasBench: false,
    hasTransfers: false,
    hasChips: false,
    hasHistory: false,
    hasTeamData: false,
    supportAvailable: false,
    phaseBanner: "",
    playerDetailOpen: false,
    playerDetail: null,
    pitchPlayers: [],
    pitchBench: [],
    pitchHeader: null,
    pitchBenchBoost: false,
    shareImagePath: "",
    shareBusy: false,
    ...emptySeasonChartState(),
  } as EntrySummaryData,

  async onLoad() {
    this.pageVisible = true;
    this.perfTracker = new PagePerformanceTracker(
      this,
      "pages/my-fpl/team/team",
      "cold-launch",
    );
    const tracker = this.perfTracker;
    this.startupPending = true;
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-team-primary",
      trigger: "load",
    });
    try {
      await this.ensureContext("page-load");
    } catch (error) {
      if (this.pageVisible && this.perfTracker === tracker) {
        this.startupPending = false;
        this.showContextError(error);
      }
      return;
    }
    if (!this.pageVisible || this.perfTracker !== tracker) return;
    this.perfTracker.mark("contextReadyAt");
    await this.initializeFromContext(false, trace, tracker);
  },

  async initializeFromContext(
    forceRefresh: boolean,
    trace?: PageRequestTrace,
    tracker?: PagePerformanceTracker,
  ) {
    const app = getApp<IAppOption>();
    const owningTracker = tracker ?? this.perfTracker;
    // Wait for standalone authentication and any queued team sync before
    // snapshotting the read-only viewer entry.
    this.setData({ loading: true });
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || this.perfTracker !== owningTracker) return;
    const currentGw = Math.max(0, Number(app.globalData.gw) || 0);
    this.loadedSeason = app.globalData.season || undefined;
    this.startupPending = false;
    this.resumeStartupAfterShow = false;
    this.setData({
      entryId: currentMyFplEntryId() ?? 0,
      event: currentGw,
      maxGw: currentGw,
    });
    // First paint honors the reporting policy; explicit refresh and context
    // changes still bypass it below.
    await this.loadData(forceRefresh, trace);
  },

  showContextError(error: unknown) {
    this.contextUnavailable = true;
    const message =
      error instanceof Error ? error.message : "赛季和比赛轮信息加载失败";
    this.setData(
      {
        loading: false,
        error: message,
        emptyState: "",
        hasTeamData: false,
        supportAvailable: false,
      },
      () => {
        this.markPrimaryCommit(this.perfTracker);
      },
    );
  },

  async recoverContext(reason: "page-show" | "pull-refresh") {
    this.contextRecoveryPending = true;
    const tracker = this.perfTracker;
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-team-primary",
      trigger: reason === "page-show" ? "show" : "refresh",
      forceReason: "context-missing",
    });
    this.setData({ loading: true, error: "" });
    try {
      await this.ensureContext(reason, true);
      if (!this.pageVisible || this.perfTracker !== tracker) return;
      this.contextUnavailable = false;
      tracker?.mark("contextReadyAt");
      await this.initializeFromContext(true, trace, tracker);
    } catch (error) {
      if (this.pageVisible && this.perfTracker === tracker)
        this.showContextError(error);
    } finally {
      if (this.pageVisible && this.perfTracker === tracker)
        this.contextRecoveryPending = false;
    }
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return;

    const app = getApp<IAppOption>();
    const resumeForcedRefresh = this.resumeRefreshAfterShow;
    this.resumeRefreshAfterShow = false;
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(
      this,
      "pages/my-fpl/team/team",
      resumeForcedRefresh ? "refresh" : "warm-enter",
    );
    if (this.resumeContextRecovery) {
      this.resumeContextRecovery = false;
      this.resumeRefreshAfterShow = false;
      this.refreshPending = false;
      await this.recoverContext("page-show");
      return;
    }
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-team-primary",
      trigger: resumeForcedRefresh ? "refresh" : "show",
    });
    if (resumeForcedRefresh) {
      await this.runForcedRefresh(this.perfTracker, trace);
      return;
    }
    if (this.contextUnavailable) {
      await this.recoverContext("page-show");
      return;
    }
    try {
      await this.ensureContext("page-show");
      if (!this.pageVisible) return;
      this.perfTracker.mark("contextReadyAt");
    } catch (error) {
      if (this.resumeStartupAfterShow && !getAppContextSnapshot()) {
        this.startupPending = false;
        this.resumeStartupAfterShow = false;
        this.showContextError(error);
        return;
      }
      // A resident page may continue using its retained context.
    }
    if (!this.pageVisible) return;
    await waitForAuthoritativeFollow();
    if (!this.pageVisible) return;
    if (this.resumeStartupAfterShow) {
      this.resumeStartupAfterShow = false;
      this.startupPending = true;
      await this.initializeFromContext(false, trace, this.perfTracker);
      return;
    }
    const entryId = this.data.entryId;
    if (this.restartForPrincipalChange(entryId)) return;

    const nextGw = Number(app.globalData.gw) || 0;
    const nextSeason = app.globalData.season || undefined;
    const seasonChanged = Boolean(
      this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason,
    );
    if (nextSeason) this.loadedSeason = nextSeason;
    const wasCurrentEvent = this.data.event === this.data.maxGw;
    const eventChanged = nextGw > 0 && nextGw !== this.data.maxGw;
    const contextChanged = seasonChanged || (eventChanged && wasCurrentEvent);
    if (contextChanged) {
      this.phaseBannerRequestId += 1;
      if (seasonChanged) this.invalidateSeasonSupport();
      this.setData({
        maxGw: nextGw,
        event: nextGw,
        phaseBanner: "",
        hasTeamData: false,
        playerDetailOpen: false,
        playerDetail: null,
        ...(seasonChanged
          ? {
              error: "",
              transferError: "",
              tabLoading: false,
              tabError: "",
              headerTitle: "球队数据",
              headerSubtitle: "",
              heroScore: "",
              heroScoreSub: "",
              totalTransfersText: "",
              overviewStats: [],
              eventStats: [],
              squadRows: [],
              starterRows: [],
              benchRows: [],
              transferRows: [],
              transferFilter: "with",
              transferSummary: [],
              visibleTransferRows: [],
              transferFilterNote: "",
              transferPageSize: TRANSFER_PAGE_SIZE,
              transferHasMore: false,
              chipInventoryRows: [],
              chipLogRows: [],
              historyRows: [],
              pagedHistoryRows: [],
              historyPageSize: HISTORY_PAGE_SIZE,
              historyHasMore: false,
              seasonHistoryRows: [],
              ...emptyPitchState(),
              hasSquad: false,
              hasTransfers: false,
              hasChips: false,
              hasHistory: false,
            }
          : {}),
      });
    } else if (eventChanged) {
      this.setData({ maxGw: nextGw });
    }
    // Summary data moves slowly, so team uses a 5-minute warm window
    // (home / live index / leagues stay at 60s). An advancing current GW
    // still reloads immediately via contextChanged.
    const primaryMissing =
      !this.data.hasTeamData && !this.data.emptyState && !this.data.error;
    const resumeTab = this.resumeTab;
    const resumeTabForceRefresh = this.resumeTabForceRefresh;
    const clearResumeTab = () => {
      if (this.resumeTab === resumeTab) {
        this.resumeTab = null;
        this.resumeTabForceRefresh = false;
      }
    };
    const primaryReloaded =
      contextChanged ||
      primaryMissing ||
      Boolean(this._loadedAt && Date.now() - this._loadedAt >= 5 * 60 * 1000);
    if (primaryReloaded) {
      await this.loadData(contextChanged || resumeTabForceRefresh, trace);
      if (this.tabForceRefreshPending || this.data.tabLoading) clearResumeTab();
    } else if (this.data.hasTeamData || Boolean(this.data.emptyState) || Boolean(this.data.error)) {
      wx.nextTick(() => this.perfTracker?.observePrimary());
    }
    if (!primaryReloaded && resumeTab && resumeTab === this.data.activeTab && resumeTab !== "squad") {
      this.setData({ tabLoading: false });
      await this.loadTab(resumeTab, resumeTabForceRefresh, trace);
      clearResumeTab();
    }
  },

  _loadedAt: 0,
  loadRequestId: 0,
  phaseBannerRequestId: 0,
  hasShown: false,
  pageVisible: false,
  loadedSeason: undefined as string | undefined,
  loadedDataSeason: undefined as string | undefined,
  historyPayload: null as EntryHistoryPayload | null,
  transferPayload: null as EntryGameweekTransfers[] | null,
  tabRequestId: 0,
  resumeTab: null as EntrySummaryTab | null,
  resumeTabForceRefresh: false,
  tabForceRefreshPending: false,
  contextUnavailable: false,
  contextRecoveryPending: false,
  resumeContextRecovery: false,
  startupPending: false,
  resumeStartupAfterShow: false,
  refreshPending: false,
  resumeRefreshAfterShow: false,
  perfTracker: undefined as PagePerformanceTracker | undefined,

  ensureContext(
    reason: "page-load" | "page-show" | "pull-refresh",
    forceRefresh = false,
  ) {
    return ensureAppContext({ reason, forceRefresh });
  },

  markPrimaryCommit(tracker?: PagePerformanceTracker) {
    if (!tracker || !this.pageVisible || tracker !== this.perfTracker) return;
    tracker.mark("primarySetDataAt");
    wx.nextTick(() => {
      if (this.pageVisible && tracker === this.perfTracker) {
        tracker.observePrimary();
      }
    });
  },

  invalidateSeasonSupport() {
    // Lazy tab payloads are season-scoped even though they are retained in
    // memory. Invalidate the active request and both payloads atomically.
    this.tabRequestId += 1;
    this.historyPayload = null;
    this.transferPayload = null;
  },

  async onPullDownRefresh() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(
      this,
      "pages/my-fpl/team/team",
      "refresh",
    );
    const tracker = this.perfTracker;
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-team-primary",
      trigger: "refresh",
    });
    try {
      await this.runForcedRefresh(tracker, trace);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async runForcedRefresh(
    tracker: PagePerformanceTracker,
    trace?: PageRequestTrace,
  ) {
    this.refreshPending = true;
    if (this.contextUnavailable || this.data.maxGw <= 0) {
      await this.recoverContext("pull-refresh");
      if (this.pageVisible && this.perfTracker === tracker)
        this.refreshPending = false;
      return;
    }
    const app = getApp<IAppOption>();
    try {
      let context = getAppContextSnapshot();
      if (shouldRefreshAppContext(context)) {
        context = await this.ensureContext("pull-refresh", true);
      }
      if (!context) throw new Error("赛季和比赛轮信息加载失败");
      if (!this.pageVisible || this.perfTracker !== tracker) {
        return;
      }
      tracker.mark("contextReadyAt");
    } catch {
      if (!this.pageVisible || this.perfTracker !== tracker) {
        return;
      }
      // A resident page may still refresh retained reporting data.
    }
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || this.perfTracker !== tracker) return;
    const entryId = this.data.entryId;
    if (this.restartForPrincipalChange(entryId)) {
      this.refreshPending = false;
      return;
    }
    const nextGw = Number(app.globalData.gw) || 0;
    const nextSeason = app.globalData.season || undefined;
    const seasonChanged = Boolean(
      this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason,
    );
    if (nextSeason) this.loadedSeason = nextSeason;
    const wasCurrentEvent = this.data.event === this.data.maxGw;
    const eventChanged = nextGw > 0 && nextGw !== this.data.maxGw;
    const contextChanged = seasonChanged || (eventChanged && wasCurrentEvent);
    if (contextChanged) {
      this.phaseBannerRequestId += 1;
      if (seasonChanged) this.invalidateSeasonSupport();
      this.setData({
        maxGw: nextGw,
        event: nextGw,
        phaseBanner: "",
        hasTeamData: false,
        playerDetailOpen: false,
        playerDetail: null,
        ...(seasonChanged
          ? {
              error: "",
              transferError: "",
              tabLoading: false,
              tabError: "",
              headerTitle: "球队数据",
              headerSubtitle: "",
              heroScore: "",
              heroScoreSub: "",
              totalTransfersText: "",
              overviewStats: [],
              eventStats: [],
              squadRows: [],
              starterRows: [],
              benchRows: [],
              transferRows: [],
              transferFilter: "with",
              transferSummary: [],
              visibleTransferRows: [],
              transferFilterNote: "",
              transferPageSize: TRANSFER_PAGE_SIZE,
              transferHasMore: false,
              chipInventoryRows: [],
              chipLogRows: [],
              historyRows: [],
              pagedHistoryRows: [],
              historyPageSize: HISTORY_PAGE_SIZE,
              historyHasMore: false,
              seasonHistoryRows: [],
              ...emptyPitchState(),
              hasSquad: false,
              hasTransfers: false,
              hasChips: false,
              hasHistory: false,
            }
          : {}),
      });
    } else if (eventChanged) {
      this.setData({ maxGw: nextGw });
    }
    await this.loadData(true, trace, true);
    if (this.pageVisible && this.perfTracker === tracker)
      this.refreshPending = false;
  },

  onHide() {
    this.resumeContextRecovery = this.resumeContextRecovery || this.contextRecoveryPending;
    const activeTab = this.data.tabLoading && this.data.activeTab !== "squad" ? this.data.activeTab : null;
    if (activeTab) this.resumeTab = activeTab;
    this.resumeTabForceRefresh = this.resumeTab
      ? this.resumeTabForceRefresh || this.tabForceRefreshPending
      : false;
    this.resumeStartupAfterShow = this.startupPending;
    this.resumeRefreshAfterShow = this.refreshPending;
    if (this.resumeRefreshAfterShow) this.resumeStartupAfterShow = false;
    if (this.data.loading) {
      this.resumeRefreshAfterShow =
        this.resumeRefreshAfterShow || this.data.hasTeamData;
      this.setData({ loading: false });
    }
    this.pageVisible = false;
    this.loadRequestId += 1;
    this.tabRequestId += 1;
    if (this.data.tabLoading) this.setData({ tabLoading: false });
    this.phaseBannerRequestId += 1;
    this.perfTracker?.disconnect();
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeContextRecovery = false;
    this.contextRecoveryPending = false;
    this.resumeTab = null;
    this.resumeTabForceRefresh = false;
    this.tabForceRefreshPending = false;
    this.startupPending = false;
    this.resumeStartupAfterShow = false;
    this.refreshPending = false;
    this.resumeRefreshAfterShow = false;
    this.loadRequestId += 1;
    this.tabRequestId += 1;
    this.phaseBannerRequestId += 1;
    this.perfTracker?.disconnect();
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    // Deadline-derived freshness owns event context on first paint.
    await app.initAppData(false);
  },

  restartForPrincipalChange(entryId: number | undefined): boolean {
    const nextEntryId = currentMyFplEntryId() ?? 0;
    if (nextEntryId === entryId) return false;

    this.loadRequestId += 1;
    this.phaseBannerRequestId += 1;
    this._loadedAt = 0;
    this.historyPayload = null;
    this.transferPayload = null;
    this.tabRequestId += 1;
    this.setData({
      entryId: nextEntryId,
      loading: false,
      error: "",
      transferError: "",
      emptyState: "",
      headerTitle: "球队数据",
      headerSubtitle: "",
      heroScore: "",
      heroScoreSub: "",
      totalTransfersText: "",
      overviewStats: [],
      eventStats: [],
      squadRows: [],
      starterRows: [],
      benchRows: [],
      transferRows: [],
      transferFilter: "with",
      transferSummary: [],
      visibleTransferRows: [],
      transferFilterNote: "",
      transferPageSize: TRANSFER_PAGE_SIZE,
      transferHasMore: false,
      chipInventoryRows: [],
      chipLogRows: [],
      historyRows: [],
      pagedHistoryRows: [],
      historyPageSize: HISTORY_PAGE_SIZE,
      historyHasMore: false,
      seasonHistoryRows: [],
      ...emptyPitchState(),
      hasSquad: false,
      hasTransfers: false,
      hasChips: false,
      hasHistory: false,
      hasTeamData: false,
      supportAvailable: false,
      phaseBanner: "",
      playerDetailOpen: false,
      playerDetail: null,
    });
    void this.loadData(true);
    return true;
  },

  async loadData(
    forceRefresh = false,
    originatingTrace?: PageRequestTrace,
    awaitActiveTab = false,
  ) {
    const requestId = ++this.loadRequestId;
    const tracker = this.perfTracker;
    const trace = originatingTrace || capturePageRequestTrace({ callerSurface: "my-fpl-team-primary", trigger: forceRefresh ? "refresh" : "load" });
    if (!this.data.entryId) {
      this.setData(
        {
          loading: false,
          error: "",
          emptyState: "entry",
          emptyEyebrow: "需要球队",
          emptyTitle: "先选择我的球队",
          emptyDescription: "查找球队并设为我的球队后，即可生成每轮总结。",
          emptyActionText: "去选择球队",
        }, () => {
          this.markPrimaryCommit(tracker);
        },
      );
      return;
    }

    this.setData({
      loading: true,
      error: "",
      transferError: "",
      emptyState: "",
      emptyEyebrow: "",
      emptyTitle: "",
      emptyDescription: "",
      emptyActionText: "",
    });
    const entryId = this.data.entryId;
    let viewerEntryRecoveryAttempted = false;
    const requestSeason = getApp<IAppOption>().globalData.season || undefined;
    try {
      const authoritativeEvent =
        Number(getApp<IAppOption>().globalData.gw) || 0;
      const selectedEvent =
        authoritativeEvent > 0
          ? clampEvent(this.data.event, authoritativeEvent)
          : 0;
      if (selectedEvent !== this.data.event) {
        this.setData({
          event: selectedEvent,
          maxGw: authoritativeEvent,
          hasTeamData: false,
        });
      }
      this.perfTracker?.mark("primaryRequestStartAt");
      const eventResult =
        selectedEvent > 0 &&
        canReadEventReporting(
          selectedEvent,
          getApp<IAppOption>().globalData.currentGw,
        )
          ? await getEntryTeamStatsEventResult(entryId, selectedEvent, forceRefresh, trace)
          : undefined;
      if (!this.pageVisible || requestId !== this.loadRequestId) return;
      if (this.restartForPrincipalChange(entryId)) return;
      this.perfTracker?.mark("primaryResponseAt");

      if (!eventResult) {
        this.loadedDataSeason = undefined;
        this._loadedAt = Date.now();
        this.setData(
          {
            event: selectedEvent,
            maxGw: authoritativeEvent,
            error: "",
            transferError: "",
            headerTitle: "球队数据",
            headerSubtitle: "",
            heroScore: "",
            heroScoreSub: "",
            totalTransfersText: "",
            overviewStats: [],
            eventStats: [],
            squadRows: [],
            starterRows: [],
            benchRows: [],
            ...emptyPitchState(),
            hasSquad: false,
            hasTeamData: false,
            supportAvailable: true,
            phaseBanner: "",
            emptyState: "event",
            emptyEyebrow: "本轮待就绪",
            emptyTitle: `GW${selectedEvent} 球队总结还没生成`,
            emptyDescription:
              "比赛周开始或球队数据完成同步后，这里会显示阵容、转会和得分。",
            emptyActionText: "重新加载",
          },
          () => {
            this.markPrimaryCommit(tracker);
          },
        );
        if (this.data.activeTab !== "squad") {
          const tabTask = this.loadTab(
            this.data.activeTab,
            forceRefresh,
            trace,
          );
          if (awaitActiveTab) await tabTask;
          else void tabTask;
        }
        return;
      }

      const primary = mapApiDataToTeamStats(
        eventResult,
        { results: [], history: [] },
        [],
        requestSeason,
      );
      setPageTitle(primary.headerTitle || "我的球队");
      this.setData(
        {
          headerTitle: primary.headerTitle,
          headerSubtitle: primary.headerSubtitle,
          heroScore: primary.heroScore,
          heroScoreSub: primary.heroScoreSub,
          totalTransfersText: primary.totalTransfersText,
          overviewStats: primary.overviewStats,
          eventStats: primary.eventStats,
          ...squadListState(primary.squadRows),
          ...pitchStateFromEventResult(eventResult),
          chipInventoryRows: primary.chipInventoryRows,
          chipLogRows: primary.chipLogRows,
          event: selectedEvent,
          maxGw: authoritativeEvent,
          emptyState: "",
          hasTeamData: true,
          supportAvailable: true,
        },
        () => {
          this.markPrimaryCommit(tracker);
        },
      );
      this.loadedDataSeason = requestSeason;
      this._loadedAt = Date.now();
      if (this.data.activeTab !== "squad") {
        const tabTask = this.loadTab(this.data.activeTab, forceRefresh, trace);
        if (awaitActiveTab) await tabTask;
        else void tabTask;
      }
    } catch (error) {
      if (this.pageVisible && requestId === this.loadRequestId) {
        if (
          !viewerEntryRecoveryAttempted &&
          isViewerEntryAuthorizationError(error)
        ) {
          viewerEntryRecoveryAttempted = true;
          try {
            const refreshedEntryId = await refreshAuthoritativeFollow();
            if (!this.pageVisible || requestId !== this.loadRequestId) return;
            if (!refreshedEntryId || refreshedEntryId !== entryId) {
              if (this.restartForPrincipalChange(entryId)) return;
            } else {
              this.setData({ error: "球队状态尚未同步，请稍后重试" });
              return;
            }
          } catch {
            this.setData({ error: "球队状态尚未同步，请稍后重试" });
            return;
          }
        }
        if (this.restartForPrincipalChange(entryId)) return;
        this.setData(
          {
            error: error instanceof Error ? error.message : "球队数据加载失败",
          },
          () => {
            this.markPrimaryCommit(tracker);
          },
        );
      }
    } finally {
      if (this.pageVisible && requestId === this.loadRequestId) {
        this.setData({ loading: false });
        void this.syncPhaseBanner();
      }
    }
  },

  /**
   * LIVE links to the Live section instead of running a second polling
   * engine here; SETTLING shows an explicit processing state. Historical
   * events never show a banner. (High-level design §7.2.)
   */
  async syncPhaseBanner() {
    const requestId = ++this.phaseBannerRequestId;
    const currentGw = Number(getApp<IAppOption>().globalData.gw) || 0;
    const selectedEvent = this.data.event;
    if (!this.data.entryId || !currentGw || selectedEvent !== currentGw) {
      if (this.data.phaseBanner) {
        this.setData({ phaseBanner: "" });
      }
      return;
    }
    const snapshotState = await getCurrentSnapshotState(currentGw);
    if (
      requestId !== this.phaseBannerRequestId ||
      this.data.event !== selectedEvent ||
      Number(getApp<IAppOption>().globalData.gw) !== currentGw
    ) {
      return;
    }
    const banner = phaseBannerFromSnapshot(snapshotState);
    if (banner !== this.data.phaseBanner) {
      this.setData({ phaseBanner: banner });
    }
  },

  onOpenLiveEntry() {
    goToLiveEntry(this.data.entryId);
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const next = Number(event.detail.value);
    if (!Number.isFinite(next) || next <= 0) return;
    this.phaseBannerRequestId += 1;
    this.setData({
      event: next,
      phaseBanner: "",
      error: "",
      emptyState: "",
      headerTitle: "球队数据",
      headerSubtitle: "",
      heroScore: "",
      heroScoreSub: "",
      totalTransfersText: "",
      overviewStats: [],
      eventStats: [],
      squadRows: [],
      starterRows: [],
      benchRows: [],
      ...emptyPitchState(),
      hasSquad: false,
      hasTeamData: false,
      supportAvailable: false,
      playerDetailOpen: false,
      playerDetail: null,
    });
    this.loadData(true);
  },

  onTabTap(event: WechatMiniprogram.TouchEvent) {
    const tab = String(
      event.currentTarget.dataset.tab || "squad",
    ) as EntrySummaryTab;
    this.setActiveTab(tab);
    void this.loadTab(tab, false);
  },

  onTransferFilterTap(event: WechatMiniprogram.TouchEvent) {
    const filter = String(
      event.currentTarget.dataset.filter || "with",
    ) as TransferFilter;
    if (filter === this.data.transferFilter) return;
    this.setData({
      transferFilter: filter,
      transferPageSize: TRANSFER_PAGE_SIZE,
      ...buildTransferView(this.data.transferRows, filter, TRANSFER_PAGE_SIZE),
    });
  },

  onTransferLoadMore() {
    const transferPageSize = this.data.transferPageSize + TRANSFER_PAGE_SIZE;
    this.setData({
      transferPageSize,
      ...buildTransferView(
        this.data.transferRows,
        this.data.transferFilter,
        transferPageSize,
      ),
    });
  },

  onHistoryLoadMore() {
    const historyPageSize = this.data.historyPageSize + HISTORY_PAGE_SIZE;
    this.setData({
      historyPageSize,
      pagedHistoryRows: this.data.historyRows.slice(0, historyPageSize),
      historyHasMore: this.data.historyRows.length > historyPageSize,
    });
  },

  /** WC/FH and bulk weeks start collapsed (web parity); tap the header to expand. */
  onToggleTransferRow(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    const target = this.data.transferRows.find((row) => row.id === id);
    if (!target || !target.collapsible) return;
    const transferRows = this.data.transferRows.map((row) =>
      row.id === id ? { ...row, collapsed: !row.collapsed } : row,
    );
    this.setData({
      transferRows,
      ...buildTransferView(
        transferRows,
        this.data.transferFilter,
        this.data.transferPageSize,
      ),
    });
  },

  onOpenPlayer(event: WechatMiniprogram.CustomEvent<{ player: SquadRow }>) {
    const player = event.detail.player;
    if (!player) return;
    this.setData({
      playerDetailOpen: true,
      // SquadRow.points is display text; buildPlayerLiveDetail re-parses it.
      playerDetail: buildPlayerLiveDetail(player as unknown as LivePlayerRow),
    });
  },

  onPitchPlayerTap(event: WechatMiniprogram.CustomEvent<{ playerId: string }>) {
    const playerId = String(event.detail?.playerId || "");
    if (!playerId) return;
    const player = findSquadRowForPitch(
      this.data.squadRows,
      playerId,
      this.data.pitchPlayers,
      this.data.pitchBench,
    );
    if (!player) return;
    this.setData({
      playerDetailOpen: true,
      playerDetail: buildPlayerLiveDetail(player as unknown as LivePlayerRow),
    });
  },

  async onSharePitch() {
    if (this.data.shareBusy) return;
    const pitch = this.selectComponent("#squad-pitch") as
      | (WechatMiniprogram.Component.TrivialInstance & {
          exportShareImage?: () => Promise<string>;
        })
      | null;
    if (!pitch?.exportShareImage) {
      wx.showToast({ title: "阵容图还没准备好", icon: "none" });
      return;
    }
    this.setData({ shareBusy: true });
    try {
      const path = await pitch.exportShareImage();
      this.setData({ shareImagePath: path });
      await presentImage(path);
    } catch {
      wx.showToast({ title: "阵容图生成失败", icon: "none" });
    } finally {
      this.setData({ shareBusy: false });
    }
  },

  onShareAppMessage() {
    const teamName =
      this.data.pitchHeader?.teamName || this.data.headerTitle || "我的球队";
    return {
      title: `${teamName} · GW${this.data.event}`,
      path: "/pages/my-fpl/team/team",
      imageUrl: this.data.shareImagePath || undefined,
    };
  },

  onClosePlayer() {
    this.setData({
      playerDetailOpen: false,
    });
  },

  async loadTab(
    tab: EntrySummaryTab,
    forceRefresh: boolean,
    originatingTrace?: PageRequestTrace,
  ): Promise<void> {
    if (tab === "squad" || !this.data.entryId) return;
    this.tabForceRefreshPending = forceRefresh;
    const requestId = ++this.tabRequestId;
    const entryId = this.data.entryId;
    const trace = originatingTrace
      ? {
          ...originatingTrace,
          callerSurface: "my-fpl-team-tab",
          trigger: forceRefresh ? ("refresh" as const) : ("tab" as const),
        }
      : capturePageRequestTrace({
          callerSurface: "my-fpl-team-tab",
          trigger: forceRefresh ? "refresh" : "tab",
        });
    this.setData({ tabLoading: true, tabError: "" });
    try {
      let historyPayload = this.historyPayload;
      let transferPayload = this.transferPayload;
      if (forceRefresh || !historyPayload) {
        historyPayload = await getEntryTeamStatsHistory(entryId, forceRefresh, trace);
        if (this.restartForPrincipalChange(entryId)) return;
        if (requestId !== this.tabRequestId || entryId !== this.data.entryId)
          return;
      }
      if (tab === "transfer" && (forceRefresh || !transferPayload)) {
        transferPayload = await getEntryTeamStatsTransfers(entryId, forceRefresh, trace);
        if (this.restartForPrincipalChange(entryId)) return;
        if (requestId !== this.tabRequestId || entryId !== this.data.entryId)
          return;
      }
      if (this.restartForPrincipalChange(entryId)) return;
      if (requestId !== this.tabRequestId || entryId !== this.data.entryId)
        return;
      this.historyPayload = historyPayload;
      this.transferPayload = transferPayload;
      const support = mapHistorySupportRows(
        historyPayload,
        transferPayload || [],
        getApp<IAppOption>().globalData.season,
      );
      this.setData({
        transferRows: support.transferRows,
        ...buildTransferView(
          support.transferRows,
          this.data.transferFilter,
          this.data.transferPageSize,
        ),
        chipInventoryRows: support.chipInventoryRows,
        chipLogRows: support.chipLogRows,
        historyRows: support.historyRows,
        pagedHistoryRows: support.historyRows.slice(
          0,
          this.data.historyPageSize,
        ),
        historyHasMore: support.historyRows.length > this.data.historyPageSize,
        seasonHistoryRows: support.seasonHistoryRows,
        hasTransfers: support.transferRows.length > 0,
        hasChips: support.chipLogRows.length > 0,
        hasHistory:
          support.historyRows.length > 0 ||
          support.seasonHistoryRows.length > 0,
        transferError: "",
        ...seasonChartPageState(
          historyToSeasonChartPoints(historyPayload.results),
          this.data.seasonChartMode,
          this.data.seasonChartSelectedGw,
        ),
        ...pastSeasonPageState(
          support.seasonHistoryRows,
          this.data.pastSeasonSelected,
        ),
      });
    } catch (error) {
      if (this.restartForPrincipalChange(entryId)) return;
      if (requestId !== this.tabRequestId) return;
      const message =
        error instanceof Error ? error.message : "分页数据加载失败";
      this.setData({
        tabError: message,
        ...(tab === "transfer" ? { transferError: message } : {}),
      });
    } finally {
      if (requestId === this.tabRequestId) {
        this.tabForceRefreshPending = false;
        this.setData({ tabLoading: false });
      }
    }
  },

  onSeasonChartMode(event: WechatMiniprogram.TouchEvent) {
    const mode = String(
      event.currentTarget.dataset.mode || "rank",
    ) as SeasonChartMode;
    if (mode === this.data.seasonChartMode) return;
    this.setData(
      seasonChartPageState(
        this.data.seasonChartPoints,
        mode,
        this.data.seasonChartSelectedGw,
      ),
    );
  },

  onSeasonChartSelect(
    event: WechatMiniprogram.CustomEvent<{ x: number | null }>,
  ) {
    const selectedGw = event.detail?.x == null ? null : Number(event.detail.x);
    this.setData(
      seasonChartPageState(
        this.data.seasonChartPoints,
        this.data.seasonChartMode,
        Number.isFinite(selectedGw as number) ? selectedGw : null,
      ),
    );
  },

  onPastSeasonSelect(
    event: WechatMiniprogram.CustomEvent<{ x: number | null }>,
  ) {
    const selected = event.detail?.x == null ? null : Number(event.detail.x);
    this.setData(
      pastSeasonPageState(
        this.data.seasonHistoryRows,
        Number.isFinite(selected as number) ? selected : null,
      ),
    );
  },

  setActiveTab(tab: EntrySummaryTab) {
    this.setData({
      activeTab: tab,
      showSquad: tab === "squad",
      showTransfer: tab === "transfer",
      showChips: tab === "chips",
      showHistory: tab === "history",
    });
  },

  onRetry() {
    // A syntactically valid but unresolved AppContext leaves maxGw at zero
    // without setting contextUnavailable. Explicit retry must force context
    // recovery instead of replaying the GW0 empty state for the backoff window.
    if (this.contextUnavailable || this.data.maxGw <= 0) {
      void this.recoverContext("pull-refresh");
      return;
    }
    if (this.data.error) {
      if (this.perfTracker) {
        void this.runForcedRefresh(
          this.perfTracker,
          capturePageRequestTrace({
            callerSurface: "my-fpl-team-primary",
            trigger: "refresh",
            forceReason: "user-refresh",
          }),
        );
      }
      return;
    }
    if (this.data.activeTab === "squad") {
      if (this.perfTracker) {
        void this.runForcedRefresh(
          this.perfTracker,
          capturePageRequestTrace({
            callerSurface: "my-fpl-team-primary",
            trigger: "refresh",
            forceReason: "user-refresh",
          }),
        );
      }
      return;
    }
    void this.loadTab(this.data.activeTab, true);
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
      return;
    }
    if (this.contextUnavailable || this.data.maxGw <= 0) {
      void this.recoverContext("pull-refresh");
      return;
    }
    this.loadData(true);
  },
});

function emptySeasonChartState() {
  return {
    ...seasonChartPageState([], "rank", null),
    ...pastSeasonPageState([], null),
  };
}

function seasonChartPageState(
  points: SeasonChartPoint[],
  mode: SeasonChartMode,
  selectedGw: number | null,
) {
  return {
    seasonChartPoints: points,
    seasonChartModes: SEASON_CHART_MODES,
    seasonChartMode: mode,
    ...buildSeasonChartView(points, mode, selectedGw),
  };
}

function pastRowsFromHistory(rows: SeasonHistoryRow[]): PastSeasonChartPoint[] {
  return rows.map((row) => ({
    season: row.season,
    totalPoints: row.pointsValue,
    overallRank: row.rankValue,
    current: row.current,
  }));
}

function pastSeasonPageState(
  rows: SeasonHistoryRow[],
  selectedIndex: number | null,
) {
  const points = pastRowsFromHistory(rows);
  return {
    pastSeasonVisible: points.length >= 2,
    pastSeasonSeries: toPastSeasonChartPoints(points),
    pastSeasonSummary: pastSeasonSummary(points, selectedIndex),
    pastSeasonSelected: selectedIndex,
    pastSeasonHasSelected: selectedIndex != null,
  };
}

function squadListState(rows: SquadRow[]) {
  return {
    squadRows: rows,
    starterRows: rows.filter((row) => !row.bench),
    benchRows: rows.filter((row) => row.bench),
    hasSquad: rows.length > 0,
    hasBench: rows.some((row) => row.bench),
  };
}

function emptyPitchState(): {
  pitchPlayers: SquadPitchPlayer[];
  pitchBench: SquadPitchPlayer[];
  pitchHeader: SquadPitchHeader | null;
  pitchBenchBoost: boolean;
  shareImagePath: string;
  shareBusy: boolean;
} {
  resetShareImageCache();
  return {
    pitchPlayers: [],
    pitchBench: [],
    pitchHeader: null,
    pitchBenchBoost: false,
    shareImagePath: "",
    shareBusy: false,
  };
}

function pitchStateFromEventResult(eventResult: EntryEventResult) {
  const view = buildSquadPitchView(eventResult);
  resetShareImageCache();
  return {
    pitchPlayers: view.players,
    pitchBench: view.benchPlayers,
    pitchHeader: view.header,
    pitchBenchBoost: view.benchBoost,
    shareImagePath: "",
    shareBusy: false,
  };
}

function findSquadRowForPitch(
  rows: SquadRow[],
  playerId: string,
  pitchPlayers: SquadPitchPlayer[],
  pitchBench: SquadPitchPlayer[],
): SquadRow | undefined {
  const direct = rows.find((row) => row.id === playerId);
  if (direct) return direct;
  const pitchPlayer = [...pitchPlayers, ...pitchBench].find(
    (player) => player.id === playerId,
  );
  if (!pitchPlayer) return undefined;
  return rows.find(
    (row) =>
      row.name === pitchPlayer.webName && row.position === pitchPlayer.position,
  );
}

function mapApiDataToTeamStats(
  eventResult: EntryEventResult,
  history: EntryHistoryPayload,
  transferHistory: EntryGameweekTransfers[],
  currentSeason?: string,
): TeamStatsViewModel {
  const historySupport = mapHistorySupportRows(
    history,
    transferHistory,
    currentSeason,
  );

  const squadRows = mapSquadRows(eventResult.eventPicks || []);
  const captain = eventResult.eventPlayedCaptain;

  return {
    headerTitle: eventResult.entry.entryName,
    headerSubtitle: [
      eventResult.entry.playerName || "-",
      eventResult.entry.region || "-",
    ].join(" · "),
    heroScore: String(eventResult.eventPoints),
    heroScoreSub: `净得分 ${eventResult.eventNetPoints} · 队长 ${captain?.webName || "-"} (${eventResult.eventCaptainPoints})`,
    totalTransfersText: `总转会 ${formatNumber(eventResult.entry.totalTransfers)}`,
    overviewStats: [
      { label: "总分", value: String(eventResult.overallPoints) },
      { label: "总排名", value: formatCompactNumber(eventResult.overallRank) },
      { label: "阵容身价", value: formatMoney(eventResult.teamValue) },
      { label: "银行余额", value: formatMoney(eventResult.bank) },
    ],
    eventStats: [
      { label: "开卡", value: formatChip(eventResult.eventChip) },
      { label: "本轮转会", value: String(eventResult.eventTransfers) },
      { label: "板凳分", value: String(eventResult.eventBenchPoints) },
    ],
    squadRows,
    transferRows: historySupport.transferRows,
    chipInventoryRows: historySupport.chipInventoryRows,
    chipLogRows: historySupport.chipLogRows,
    historyRows: historySupport.historyRows,
    seasonHistoryRows: historySupport.seasonHistoryRows,
  };
}

/** Official FPL: one of each chip before the GW19 deadline, one after. */
export const CHIP_HALF_SPLIT_GW = 19;

const CHIP_INVENTORY_FAMILIES = [
  { code: "WC", name: "Wildcard", keys: ["WC", "WILDCARD"] },
  { code: "FH", name: "Free Hit", keys: ["FH", "FREEHIT", "FREE_HIT"] },
  {
    code: "BB",
    name: "Bench Boost",
    keys: ["BB", "BBOOST", "BENCH_BOOST", "BENCHBOOST"],
  },
  {
    code: "TC",
    name: "Triple Captain",
    keys: ["3XC", "TC", "TRIPLE_CAPTAIN", "TRIPLECAPTAIN"],
  },
];

/** Half-season inventory — mirrors the web TeamChipsTab table. */
export function buildChipInventory(
  usage: Array<{ eventId: number; chip: string }>,
): ChipInventoryRow[] {
  return CHIP_INVENTORY_FAMILIES.map((family) => {
    const used = usage.filter((item) =>
      family.keys.includes(item.chip.toUpperCase().replace(/[\s-]+/g, "_")),
    );
    const firstUsed = used.filter(
      (item) => item.eventId <= CHIP_HALF_SPLIT_GW,
    ).length;
    const secondUsed = used.length - firstUsed;
    const firstLeft = Math.max(0, 1 - firstUsed);
    const secondLeft = Math.max(0, 1 - secondUsed);
    return {
      id: `chip-inv-${family.code}`,
      code: family.code,
      name: family.name,
      firstText: `${firstUsed} / ${firstLeft}`,
      secondText: `${secondUsed} / ${secondLeft}`,
      firstOut: firstLeft === 0,
      secondOut: secondLeft === 0,
    };
  });
}

interface HistorySupportViewModel {
  transferRows: TransferRow[];
  chipInventoryRows: ChipInventoryRow[];
  chipLogRows: ChipLogRow[];
  historyRows: HistoryRow[];
  seasonHistoryRows: SeasonHistoryRow[];
}

function mapHistorySupportRows(
  history: EntryHistoryPayload,
  transferHistory: EntryGameweekTransfers[],
  currentSeason?: string,
): HistorySupportViewModel {
  const transferByEvent = new Map<number, EntryGameweekTransfers>();
  transferHistory.forEach((item) => transferByEvent.set(item.eventId, item));
  const sortedHistory = [...history.results].sort(
    (a, b) => b.eventId - a.eventId,
  );
  const chipEvents = sortedHistory.filter(
    (item) => Boolean(item.eventChip) && item.eventChip !== "NONE",
  );

  return {
    transferRows: mapTransferRows(sortedHistory, transferByEvent),
    chipInventoryRows: buildChipInventory(
      chipEvents.map((item) => ({
        eventId: item.eventId,
        chip: String(item.eventChip),
      })),
    ),
    chipLogRows: chipEvents.map((item) => ({
      id: `chip-${item.eventId}`,
      gameweek: `GW${item.eventId}`,
      halfText: item.eventId <= CHIP_HALF_SPLIT_GW ? "上半" : "下半",
      chip: formatChip(item.eventChip),
      pointsText: formatPoints(item.eventPoints),
      netText: formatPoints(item.eventNetPoints),
      rankText: formatCompactNumber(item.eventRank),
    })),
    historyRows: sortedHistory.map(mapHistoryRow),
    seasonHistoryRows: [...history.history]
      .sort((a, b) => b.season.localeCompare(a.season))
      .map((item) => mapSeasonHistoryRow(item, currentSeason)),
  };
}

function mapSquadRows(picks: EntryEventPick[]): SquadRow[] {
  const positionOrder: Record<string, number> = {
    GKP: 1,
    DEF: 2,
    MID: 3,
    FWD: 4,
  };
  return [...picks]
    .sort((a, b) => {
      const aBench = a.multiplier === 0 ? 1 : 0;
      const bBench = b.multiplier === 0 ? 1 : 0;
      if (aBench !== bBench) {
        return aBench - bBench;
      }
      return (
        (positionOrder[a.elementTypeName] || 5) -
        (positionOrder[b.elementTypeName] || 5)
      );
    })
    .map((pick, index) => ({
      id: `${index}-${pick.webName}`,
      name: pick.webName,
      roleText: pick.isCaptain ? "C" : pick.isViceCaptain ? "VC" : "",
      team: pick.teamName || pick.teamShortName || "-",
      position: pick.elementTypeName,
      metaText: pickMetaText(pick),
      statusText: pick.againstShortName
        ? `vs ${pick.againstShortName}${pick.wasHome ? "·主" : "·客"}`
        : "",
      points: String(pick.totalPoints),
      bench: pick.multiplier === 0,
      captain: pick.isCaptain,
      viceCaptain: pick.isViceCaptain,
      multiplier: pick.multiplier,
      minutes: pick.minutes,
      goalsScored: pick.goalsScored || 0,
      assists: pick.assists || 0,
      cleanSheets: pick.cleanSheets || 0,
      saves: pick.saves || 0,
      yellowCards: pick.yellowCards || 0,
      redCards: pick.redCards || 0,
      bonus: pick.bonus || 0,
      bps: pick.bps,
    }));
}

/** Minutes plus match stats; bonus stays English (FPL habit), the rest Chinese. */
function pickMetaText(pick: EntryEventPick): string {
  const stats: string[] = [];
  if (pick.goalsScored) stats.push(`进${pick.goalsScored}`);
  if (pick.assists) stats.push(`助${pick.assists}`);
  if (pick.cleanSheets) stats.push("零封");
  if (pick.bonus) stats.push(`B${pick.bonus}`);
  return [`${pick.minutes}'`, ...stats].join(" · ");
}

function normalizeChipCode(chip?: string | null): string {
  const code = String(chip || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!code || code === "NONE") return "";
  if (code === "WILDCARD" || code === "WC") return "WC";
  if (code === "FREE_HIT" || code === "FREEHIT" || code === "FH") return "FH";
  if (
    code === "BENCH_BOOST" ||
    code === "BBOOST" ||
    code === "BENCHBOOST" ||
    code === "BB"
  )
    return "BB";
  if (
    code === "TRIPLE_CAPTAIN" ||
    code === "TRIPLECAPTAIN" ||
    code === "3XC" ||
    code === "TC"
  )
    return "TC";
  if (code === "MANAGER" || code === "AM") return "AM";
  return code;
}

/** WC/FH weeks allow unlimited transfers — they and bulk weeks collapse by default. */
function isUnlimitedTransferChip(chip: string): boolean {
  return chip === "WC" || chip === "FH";
}

function mapTransferRows(
  historyRows: EntryHistoryItem[],
  transferByEvent: Map<number, EntryGameweekTransfers>,
): TransferRow[] {
  return historyRows.map((history) => {
    const transferInfo = transferByEvent.get(history.eventId);
    const moves = (transferInfo?.transfers || []).map((move, index) =>
      mapTransferMove(history.eventId, move, index),
    );
    const chip = normalizeChipCode(history.eventChip);
    const collapsible =
      isUnlimitedTransferChip(chip) ||
      Math.max(moves.length, history.eventTransfers) >=
        TRANSFER_COLLAPSE_MOVE_THRESHOLD;
    return {
      id: `transfer-${history.eventId}`,
      gameweek: `GW${history.eventId}`,
      transfers: String(history.eventTransfers),
      cost: String(history.eventTransfersCost),
      hasCost: history.eventTransfersCost > 0,
      emptyText: history.eventTransfers > 0 ? "转会明细还在同步" : "本轮未转会",
      moves,
      chip,
      transferCount: history.eventTransfers,
      collapsible,
      collapsed: collapsible,
    };
  });
}

/** Top-of-tab summary + filtered page — mirrors the web TeamTransfersTab header. */
export function buildTransferView(
  rows: TransferRow[],
  filter: TransferFilter,
  pageSize = TRANSFER_PAGE_SIZE,
): {
  transferSummary: MetricCard[];
  visibleTransferRows: TransferRow[];
  transferFilterNote: string;
  transferHasMore: boolean;
} {
  const withRows = rows.filter((row) => row.transferCount > 0);
  const noneCount = rows.length - withRows.length;
  const totalMoves = withRows.reduce((sum, row) => sum + row.transferCount, 0);
  const totalCost = rows.reduce((sum, row) => sum + Number(row.cost || 0), 0);
  const transferSummary: MetricCard[] = [
    { label: "总转会", value: String(totalMoves) },
    {
      label: "转会扣分",
      value: totalCost > 0 ? `-${totalCost}` : "0",
      tone: totalCost > 0 ? "bad" : "default",
    },
    { label: "有转会轮数", value: String(withRows.length) },
  ];
  const filtered =
    filter === "all"
      ? rows
      : filter === "none"
        ? rows.filter((row) => row.transferCount === 0)
        : withRows;
  const transferFilterNote =
    filter === "all"
      ? `全部 ${rows.length} 轮`
      : filter === "none"
        ? `无转会 ${noneCount} 轮 · 共 ${rows.length} 轮`
        : `有转会 ${withRows.length} 轮 · 共 ${rows.length} 轮`;
  return {
    transferSummary,
    visibleTransferRows: filtered.slice(0, pageSize),
    transferFilterNote,
    transferHasMore: filtered.length > pageSize,
  };
}

function transferPointsText(
  points: number | undefined,
  played: boolean | undefined,
): string {
  if (played === false) return "未出场";
  return `${points ?? 0} 分`;
}

function mapTransferMove(
  eventId: number,
  move: EntryTransferMove,
  index: number,
): TransferMoveRow {
  return {
    id: `move-${eventId}-${index}`,
    outName: move.elementOutWebName || "-",
    outTeam: move.elementOutTeamShortName || "",
    outPointsText: transferPointsText(
      move.elementOutPoints,
      move.elementOutPlayed,
    ),
    inName: move.elementInWebName || "-",
    inTeam: move.elementInTeamShortName || "",
    inPointsText: transferPointsText(
      move.elementInPoints,
      move.elementInPlayed,
    ),
    priceText: `${formatMoney(move.elementOutCost)} → ${formatMoney(move.elementInCost)}`,
  };
}

/** One compact table row per GW — web TeamGameweekHistory columns, mini-width. */
function mapHistoryRow(item: EntryHistoryItem): HistoryRow {
  const captain = item.eventPlayedCaptain?.webName?.trim() || "";
  const cost = item.eventTransfersCost || 0;
  return {
    id: `history-${item.eventId}`,
    gameweek: `GW${item.eventId}`,
    pointsText: String(item.eventPoints),
    captainName: captain || "—",
    captainPointsText: captain ? String(item.eventCaptainPoints ?? 0) : "",
    costText: cost > 0 ? `-${cost}` : "0",
    costBad: cost > 0,
    rankText: formatCompactNumber(item.overallRank),
  };
}

export function mapSeasonHistoryRow(
  item: EntrySeasonHistoryItem,
  currentSeason?: string,
): SeasonHistoryRow {
  return {
    id: `season-${item.season}`,
    season: item.season,
    totalPoints: formatCompactNumber(item.totalPoints),
    overallRank: formatCompactNumber(item.overallRank),
    pointsValue: item.totalPoints || 0,
    rankValue: item.overallRank || 0,
    current: isCurrentSeasonLabel(item.season, currentSeason),
  };
}

function clampEvent(event: number, maxGw: number): number {
  const normalized = Math.max(1, Number(event) || maxGw || 1);
  return Math.min(normalized, Math.max(1, maxGw));
}

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : String(value);
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return `£${(value / 10).toFixed(1)}m`;
}

function formatChip(chip?: string | null): string {
  if (!chip) {
    return "无";
  }

  const labels: Record<string, string> = {
    NONE: "无",
    BENCH_BOOST: "BB",
    FREE_HIT: "FH",
    TRIPLE_CAPTAIN: "TC",
    WILDCARD: "WC",
    MANAGER: "AM",
  };
  return labels[chip] || chip;
}
