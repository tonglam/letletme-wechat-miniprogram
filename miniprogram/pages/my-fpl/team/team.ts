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
  type EntryTransferMove
} from "../../../services/summary.service";
import { getApiSessionToken } from "../../../services/auth.service";
import { goToEntrySearch, goToLiveEntry } from "../../../utils/navigation";
import { formatCompactNumber } from "../../../utils/summary-format";
import { getCurrentSnapshotState } from "../../../services/my-fpl.service";
import type { LiveSnapshotState } from "../../../models/live";
import { currentFollowEntryId } from "../../../utils/follow";
import { ensureAppContext } from "../../../services/app-context.service";
import { PagePerformanceTracker } from "../../../utils/page-performance";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

export function phaseBannerFromSnapshot(
  snapshotState: LiveSnapshotState | undefined
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

interface SquadRow {
  id: string;
  name: string;
  teamName: string;
  position: string;
  minutes: string;
  points: string;
  role: string;
  bench: boolean;
  played: boolean;
}

interface TransferMoveRow {
  id: string;
  text: string;
  costText: string;
}

interface TransferRow {
  id: string;
  gameweek: string;
  transfers: string;
  cost: string;
  hasCost: boolean;
  emptyText: string;
  moves: TransferMoveRow[];
}

export function retainTransferRowsAfterFailure(
  freshRows: TransferRow[],
  previousRows: TransferRow[],
  transferFailed: boolean,
  sameSeason: boolean
): TransferRow[] {
  return transferFailed && sameSeason && previousRows.length > 0 ? previousRows : freshRows;
}

interface SimpleRow {
  id: string;
  label: string;
  value: string;
  meta?: string;
}

interface HistoryRow {
  id: string;
  gameweek: string;
  eventPoints: string;
  eventNetPoints: string;
  eventRank: string;
  overallPoints: string;
  overallRank: string;
  eventTransfers: string;
  eventTransfersCost: string;
  teamValue: string;
  bank: string;
}

interface SeasonHistoryRow {
  id: string;
  order: string;
  season: string;
  totalPoints: string;
  overallRank: string;
}

interface TeamStatsViewModel {
  headerTitle: string;
  headerSubtitle: string;
  overviewStats: MetricCard[];
  eventStats: MetricCard[];
  squadRows: SquadRow[];
  transferRows: TransferRow[];
  chipSummaryStats: MetricCard[];
  chipCountRows: SimpleRow[];
  chipUsageRows: SimpleRow[];
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
  overviewStats: MetricCard[];
  eventStats: MetricCard[];
  squadRows: SquadRow[];
  transferRows: TransferRow[];
  chipSummaryStats: MetricCard[];
  chipCountRows: SimpleRow[];
  chipUsageRows: SimpleRow[];
  historyRows: HistoryRow[];
  seasonHistoryRows: SeasonHistoryRow[];
  hasSquad: boolean;
  hasTransfers: boolean;
  hasChips: boolean;
  hasHistory: boolean;
  hasTeamData: boolean;
  supportAvailable: boolean;
  /** LIVE/SETTLING banner for the current gameweek; "" otherwise. */
  phaseBanner: "" | "live" | "settling";
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
    overviewStats: [],
    eventStats: [],
    squadRows: [],
    transferRows: [],
    chipSummaryStats: [],
    chipCountRows: [],
    chipUsageRows: [],
    historyRows: [],
    seasonHistoryRows: [],
    hasSquad: false,
    hasTransfers: false,
    hasChips: false,
    hasHistory: false,
    hasTeamData: false,
    supportAvailable: false,
    phaseBanner: ""
  } as EntrySummaryData,

  async onLoad() {
    this.perfTracker = new PagePerformanceTracker(this, "pages/my-fpl/team/team", "cold-launch");
    const trace = capturePageRequestTrace({ callerSurface: "my-fpl-team-primary", trigger: "load" });
    try {
      await this.ensureContext("page-load");
    } catch (error) {
      this.showContextError(error);
      return;
    }
    this.perfTracker.mark("contextReadyAt");
    await this.initializeFromContext(false, trace);
  },

  async initializeFromContext(forceRefresh: boolean, trace?: PageRequestTrace) {
    const app = getApp<IAppOption>();
    if (!getApiSessionToken()) {
      // With no valid session the stored binding is only offline/display
      // fallback: the account may have been relinked, so wait for the
      // refreshed profile before snapshotting the entry. Enter the loading
      // state first so the wait never renders placeholder content.
      this.setData({ loading: true });
      try { await app.authReady; } catch {}
    }
    const currentGw = Math.max(0, Number(app.globalData.gw) || 0);
    this.loadedSeason = app.globalData.season || undefined;
    this.setData({
      entryId: app.globalData.entryId ?? 0,
      event: currentGw,
      maxGw: currentGw
    });
    // First paint honors the reporting policy; explicit refresh and context
    // changes still bypass it below.
    await this.loadData(forceRefresh, trace);
  },

  showContextError(error: unknown) {
    this.contextUnavailable = true;
    const message = error instanceof Error ? error.message : "赛季和比赛轮信息加载失败";
    this.setData({
      loading: false,
      error: message,
      emptyState: "",
      hasTeamData: false,
      supportAvailable: false
    }, () => {
      this.perfTracker?.mark("primarySetDataAt");
      wx.nextTick(() => this.perfTracker?.observePrimary());
    });
  },

  async recoverContext(reason: "page-show" | "pull-refresh") {
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-team-primary",
      trigger: reason === "page-show" ? "show" : "refresh",
      forceReason: "context-missing"
    });
    this.setData({ loading: true, error: "" });
    try {
      await this.ensureContext(reason, true);
      this.contextUnavailable = false;
      this.perfTracker?.mark("contextReadyAt");
      await this.initializeFromContext(true, trace);
    } catch (error) {
      this.showContextError(error);
    }
  },

  async onShow() {
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return;

    const app = getApp<IAppOption>();
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/my-fpl/team/team", "warm-enter");
    const trace = capturePageRequestTrace({ callerSurface: "my-fpl-team-primary", trigger: "show" });
    if (this.contextUnavailable) {
      await this.recoverContext("page-show");
      return;
    }
    try {
      await this.ensureContext("page-show");
      this.perfTracker.mark("contextReadyAt");
    } catch {
      // A resident page may continue using its retained context.
    }
    const entryId = this.data.entryId;
    if (this.restartForPrincipalChange(entryId)) return;

    const nextGw = Number(app.globalData.gw) || 0;
    const nextSeason = app.globalData.season || undefined;
    const seasonChanged = Boolean(this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason);
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
        ...(seasonChanged ? {
          error: "",
          transferError: "",
          tabLoading: false,
          tabError: "",
          headerTitle: "球队数据",
          headerSubtitle: "",
          overviewStats: [],
          eventStats: [],
          squadRows: [],
          transferRows: [],
          chipSummaryStats: [],
          chipCountRows: [],
          chipUsageRows: [],
          historyRows: [],
          seasonHistoryRows: [],
          hasSquad: false,
          hasTransfers: false,
          hasChips: false,
          hasHistory: false
        } : {})
      });
    } else if (eventChanged) {
      this.setData({ maxGw: nextGw });
    }
    // Summary data moves slowly, but an advancing current GW reloads now.
    if (contextChanged || (this._loadedAt && Date.now() - this._loadedAt >= 5 * 60 * 1000)) {
      await this.loadData(contextChanged, trace);
    } else if (this.data.hasTeamData || Boolean(this.data.emptyState) || Boolean(this.data.error)) {
      wx.nextTick(() => this.perfTracker?.observePrimary());
    }
  },

  _loadedAt: 0,
  loadRequestId: 0,
  phaseBannerRequestId: 0,
  hasShown: false,
  loadedSeason: undefined as string | undefined,
  loadedDataSeason: undefined as string | undefined,
  historyPayload: null as EntryHistoryPayload | null,
  transferPayload: null as EntryGameweekTransfers[] | null,
  tabRequestId: 0,
  contextUnavailable: false,
  perfTracker: undefined as PagePerformanceTracker | undefined,

  ensureContext(reason: "page-load" | "page-show" | "pull-refresh", forceRefresh = false) {
    return ensureAppContext({ reason, forceRefresh });
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
    this.perfTracker = new PagePerformanceTracker(this, "pages/my-fpl/team/team", "refresh");
    const trace = capturePageRequestTrace({ callerSurface: "my-fpl-team-primary", trigger: "refresh" });
    if (this.contextUnavailable) {
      await this.recoverContext("pull-refresh");
      wx.stopPullDownRefresh();
      return;
    }
    const app = getApp<IAppOption>();
    try {
      await this.ensureContext("pull-refresh");
      this.perfTracker.mark("contextReadyAt");
    } catch { /* reload the retained context */ }
    const entryId = this.data.entryId;
    if (this.restartForPrincipalChange(entryId)) {
      wx.stopPullDownRefresh();
      return;
    }
    const nextGw = Number(app.globalData.gw) || 0;
    const nextSeason = app.globalData.season || undefined;
    const seasonChanged = Boolean(this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason);
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
        ...(seasonChanged ? {
          error: "",
          transferError: "",
          tabLoading: false,
          tabError: "",
          headerTitle: "球队数据",
          headerSubtitle: "",
          overviewStats: [],
          eventStats: [],
          squadRows: [],
          transferRows: [],
          chipSummaryStats: [],
          chipCountRows: [],
          chipUsageRows: [],
          historyRows: [],
          seasonHistoryRows: [],
          hasSquad: false,
          hasTransfers: false,
          hasChips: false,
          hasHistory: false
        } : {})
      });
    } else if (eventChanged) {
      this.setData({ maxGw: nextGw });
    }
    await this.loadData(true, trace);
    wx.stopPullDownRefresh();
  },

  onHide() {
    this.perfTracker?.disconnect();
  },

  onUnload() {
    this.perfTracker?.disconnect();
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    // Deadline-derived freshness owns event context on first paint.
    await app.initAppData(false);
  },

  restartForPrincipalChange(entryId: number | undefined): boolean {
    const nextEntryId = currentFollowEntryId() ?? 0;
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
      overviewStats: [],
      eventStats: [],
      squadRows: [],
      transferRows: [],
      chipSummaryStats: [],
      chipCountRows: [],
      chipUsageRows: [],
      historyRows: [],
      seasonHistoryRows: [],
      hasSquad: false,
      hasTransfers: false,
      hasChips: false,
      hasHistory: false,
      hasTeamData: false,
      supportAvailable: false,
      phaseBanner: ""
    });
    void this.loadData(true);
    return true;
  },

  async loadData(forceRefresh = false, originatingTrace?: PageRequestTrace) {
    const requestId = ++this.loadRequestId;
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "my-fpl-team-primary",
      trigger: forceRefresh ? "refresh" : "load"
    });
    if (!this.data.entryId) {
      this.setData({
        loading: false,
        error: "",
        emptyState: "entry",
        emptyEyebrow: "需要球队",
        emptyTitle: "先选择我的球队",
        emptyDescription: "查找球队并设为我的球队后，即可生成每轮总结。",
        emptyActionText: "去选择球队"
      }, () => {
        wx.nextTick(() => this.perfTracker?.observePrimary());
      });
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
      emptyActionText: ""
    });
    const entryId = this.data.entryId;
    const requestSeason = getApp<IAppOption>().globalData.season || undefined;
    try {
      const authoritativeEvent = Number(getApp<IAppOption>().globalData.gw) || 0;
      const selectedEvent = authoritativeEvent > 0
        ? clampEvent(this.data.event, authoritativeEvent)
        : 0;
      if (selectedEvent !== this.data.event) {
        this.setData({ event: selectedEvent, maxGw: authoritativeEvent, hasTeamData: false });
      }
      this.perfTracker?.mark("primaryRequestStartAt");
      const eventResult = selectedEvent > 0
        ? await getEntryTeamStatsEventResult(entryId, selectedEvent, forceRefresh, trace)
        : undefined;
      if (requestId !== this.loadRequestId) return;
      if (this.restartForPrincipalChange(entryId)) return;
      this.perfTracker?.mark("primaryResponseAt");

      if (!eventResult) {
        this.loadedDataSeason = undefined;
        this._loadedAt = Date.now();
        this.setData({
          event: selectedEvent,
          maxGw: authoritativeEvent,
          error: "",
          transferError: "",
          headerTitle: "球队数据",
          headerSubtitle: "",
          overviewStats: [],
          eventStats: [],
          squadRows: [],
          hasSquad: false,
          hasTeamData: false,
          supportAvailable: true,
          phaseBanner: "",
          emptyState: "event",
          emptyEyebrow: "本轮待就绪",
          emptyTitle: `GW${selectedEvent} 球队总结还没生成`,
          emptyDescription: "比赛周开始或球队数据完成同步后，这里会显示阵容、转会和得分。",
          emptyActionText: "重新加载"
        });
        if (this.data.activeTab !== "squad") void this.loadTab(this.data.activeTab, forceRefresh, trace);
        return;
      }

      const primary = mapApiDataToTeamStats(
        eventResult,
        { results: [], history: [] },
        []
      );
      this.setData({
        headerTitle: primary.headerTitle,
        headerSubtitle: primary.headerSubtitle,
        overviewStats: primary.overviewStats,
        eventStats: primary.eventStats,
        squadRows: primary.squadRows,
        chipSummaryStats: primary.chipSummaryStats,
        event: selectedEvent,
        maxGw: authoritativeEvent,
        emptyState: "",
        hasSquad: primary.squadRows.length > 0,
        hasTeamData: true,
        supportAvailable: true
      }, () => {
        this.perfTracker?.mark("primarySetDataAt");
        wx.nextTick(() => this.perfTracker?.observePrimary());
      });
      this.loadedDataSeason = requestSeason;
      this._loadedAt = Date.now();
      if (this.data.activeTab !== "squad") void this.loadTab(this.data.activeTab, forceRefresh, trace);
    } catch (error) {
      if (requestId === this.loadRequestId) {
        if (this.restartForPrincipalChange(entryId)) return;
        this.setData({ error: error instanceof Error ? error.message : "球队数据加载失败" });
        wx.nextTick(() => this.perfTracker?.observePrimary());
      }
    } finally {
      if (requestId === this.loadRequestId) {
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
      requestId !== this.phaseBannerRequestId
      || this.data.event !== selectedEvent
      || Number(getApp<IAppOption>().globalData.gw) !== currentGw
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
    this.phaseBannerRequestId += 1;
    this.setData({
      event: event.detail.value,
      phaseBanner: "",
      error: "",
      emptyState: "",
      headerTitle: "球队数据",
      headerSubtitle: "",
      overviewStats: [],
      eventStats: [],
      squadRows: [],
      hasSquad: false,
      hasTeamData: false,
      supportAvailable: false
    });
    this.loadData(true);
  },

  onTabTap(event: WechatMiniprogram.TouchEvent) {
    const tab = String(event.currentTarget.dataset.tab || "squad") as EntrySummaryTab;
    this.setActiveTab(tab);
    void this.loadTab(tab, false);
  },

  async loadTab(tab: EntrySummaryTab, forceRefresh: boolean, originatingTrace?: PageRequestTrace): Promise<void> {
    if (tab === "squad" || !this.data.entryId) return;
    const requestId = ++this.tabRequestId;
    const entryId = this.data.entryId;
    const trace = originatingTrace
      ? {
          ...originatingTrace,
          callerSurface: "my-fpl-team-tab",
          trigger: forceRefresh ? "refresh" as const : "tab" as const
        }
      : capturePageRequestTrace({
          callerSurface: "my-fpl-team-tab",
          trigger: forceRefresh ? "refresh" : "tab"
        });
    this.setData({ tabLoading: true, tabError: "" });
    try {
      let historyPayload = this.historyPayload;
      let transferPayload = this.transferPayload;
      if (forceRefresh || !historyPayload) {
        historyPayload = await getEntryTeamStatsHistory(entryId, forceRefresh, trace);
        if (this.restartForPrincipalChange(entryId)) return;
        if (requestId !== this.tabRequestId || entryId !== this.data.entryId) return;
      }
      if (tab === "transfer" && (forceRefresh || !transferPayload)) {
        transferPayload = await getEntryTeamStatsTransfers(entryId, forceRefresh, trace);
        if (this.restartForPrincipalChange(entryId)) return;
        if (requestId !== this.tabRequestId || entryId !== this.data.entryId) return;
      }
      if (this.restartForPrincipalChange(entryId)) return;
      if (requestId !== this.tabRequestId || entryId !== this.data.entryId) return;
      this.historyPayload = historyPayload;
      this.transferPayload = transferPayload;
      const support = mapHistorySupportRows(
        historyPayload,
        transferPayload || []
      );
      const currentEventChip = this.data.chipSummaryStats.find((item) => item.label === "本轮开卡")?.value || "无";
      this.setData({
        transferRows: support.transferRows,
        chipCountRows: support.chipCountRows,
        chipUsageRows: support.chipUsageRows,
        chipSummaryStats: buildChipSummaryStats(currentEventChip, support.chipUsageRows.length),
        historyRows: support.historyRows,
        seasonHistoryRows: support.seasonHistoryRows,
        hasTransfers: support.transferRows.length > 0,
        hasChips: support.chipUsageRows.length > 0 || support.chipCountRows.length > 0,
        hasHistory: support.historyRows.length > 0 || support.seasonHistoryRows.length > 0,
        transferError: ""
      });
    } catch (error) {
      if (this.restartForPrincipalChange(entryId)) return;
      if (requestId !== this.tabRequestId) return;
      const message = error instanceof Error ? error.message : "分页数据加载失败";
      this.setData({
        tabError: message,
        ...(tab === "transfer" ? { transferError: message } : {})
      });
    } finally {
      if (requestId === this.tabRequestId) this.setData({ tabLoading: false });
    }
  },

  setActiveTab(tab: EntrySummaryTab) {
    this.setData({
      activeTab: tab,
      showSquad: tab === "squad",
      showTransfer: tab === "transfer",
      showChips: tab === "chips",
      showHistory: tab === "history"
    });
  },

  onRetry() {
    if (this.contextUnavailable) {
      void this.recoverContext("pull-refresh");
      return;
    }
    if (this.data.activeTab === "squad") {
      void this.loadData(true);
      return;
    }
    void this.loadTab(this.data.activeTab, true);
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
      return;
    }
    this.loadData(true);
  }
});

function mapApiDataToTeamStats(
  eventResult: EntryEventResult,
  history: EntryHistoryPayload,
  transferHistory: EntryGameweekTransfers[]
): TeamStatsViewModel {
  const historySupport = mapHistorySupportRows(history, transferHistory);

  return {
    headerTitle: eventResult.entry.entryName,
    headerSubtitle: [eventResult.entry.playerName || "-", eventResult.entry.region || "-"].join(" · "),
    overviewStats: [
      { label: "总分", value: String(eventResult.overallPoints) },
      { label: "总排名", value: formatCompactNumber(eventResult.overallRank) },
      { label: "阵容身价", value: formatMoney(eventResult.teamValue) },
      { label: "银行余额", value: formatMoney(eventResult.bank) },
      { label: "总转会", value: formatNumber(eventResult.entry.totalTransfers) }
    ],
    eventStats: [
      { label: "本轮得分", value: String(eventResult.eventPoints) },
      { label: "净得分", value: String(eventResult.eventNetPoints) },
      { label: "开卡", value: formatChip(eventResult.eventChip) },
      { label: "本轮转会", value: String(eventResult.eventTransfers) },
      { label: "板凳分", value: String(eventResult.eventBenchPoints) },
      { label: "队长", value: `${eventResult.eventPlayedCaptain?.webName || "-"} (${eventResult.eventCaptainPoints})` }
    ],
    squadRows: mapSquadRows(eventResult.eventPicks || []),
    transferRows: historySupport.transferRows,
    chipSummaryStats: buildChipSummaryStats(
      formatChip(eventResult.eventChip),
      historySupport.chipUsageRows.length
    ),
    chipCountRows: historySupport.chipCountRows,
    chipUsageRows: historySupport.chipUsageRows,
    historyRows: historySupport.historyRows,
    seasonHistoryRows: historySupport.seasonHistoryRows
  };
}

export function buildChipSummaryStats(currentEventChip: string, usageCount: number): MetricCard[] {
  return [
    { label: "本轮开卡", value: currentEventChip || "无" },
    { label: "开卡次数", value: String(Math.max(0, usageCount)) }
  ];
}

interface HistorySupportViewModel {
  transferRows: TransferRow[];
  chipCountRows: SimpleRow[];
  chipUsageRows: SimpleRow[];
  historyRows: HistoryRow[];
  seasonHistoryRows: SeasonHistoryRow[];
}

function mapHistorySupportRows(
  history: EntryHistoryPayload,
  transferHistory: EntryGameweekTransfers[]
): HistorySupportViewModel {
  const transferByEvent = new Map<number, EntryGameweekTransfers>();
  transferHistory.forEach((item) => transferByEvent.set(item.eventId, item));
  const sortedHistory = [...history.results].sort((a, b) => b.eventId - a.eventId);
  const chipUsageRows = sortedHistory
    .filter((item) => Boolean(item.eventChip) && item.eventChip !== "NONE")
    .map((item) => ({
      id: `chip-${item.eventId}`,
      label: `GW${item.eventId}`,
      value: formatChip(item.eventChip)
    }));

  return {
    transferRows: mapTransferRows(sortedHistory, transferByEvent),
    chipCountRows: mapChipCounts(history.results),
    chipUsageRows,
    historyRows: sortedHistory.map(mapHistoryRow),
    seasonHistoryRows: [...history.history]
      .sort((a, b) => b.season.localeCompare(a.season))
      .map(mapSeasonHistoryRow)
  };
}

function mapSquadRows(picks: EntryEventPick[]): SquadRow[] {
  const positionOrder: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
  return [...picks]
    .sort((a, b) => {
      const aBench = a.multiplier === 0 ? 1 : 0;
      const bBench = b.multiplier === 0 ? 1 : 0;
      if (aBench !== bBench) {
        return aBench - bBench;
      }
      return (positionOrder[a.elementTypeName] || 5) - (positionOrder[b.elementTypeName] || 5);
    })
    .map((pick, index) => {
      const nameParts = [pick.webName];
      if (pick.isCaptain) {
        nameParts.push("(C)");
      }
      if (pick.isViceCaptain) {
        nameParts.push("(VC)");
      }

      return {
        id: `${index}-${pick.webName}`,
        name: nameParts.join(" "),
        teamName: pick.teamName || pick.teamShortName || "-",
        position: pick.elementTypeName,
        minutes: String(pick.minutes),
        points: String(pick.totalPoints),
        role: pick.multiplier === 0 ? "替补" : "首发",
        bench: pick.multiplier === 0,
        played: pick.minutes > 0
      };
    });
}

function mapTransferRows(historyRows: EntryHistoryItem[], transferByEvent: Map<number, EntryGameweekTransfers>): TransferRow[] {
  return historyRows.map((history) => {
    const transferInfo = transferByEvent.get(history.eventId);
    const moves = (transferInfo?.transfers || []).map((move, index) => mapTransferMove(history.eventId, move, index));
    return {
      id: `transfer-${history.eventId}`,
      gameweek: `GW${history.eventId}`,
      transfers: String(history.eventTransfers),
      cost: String(history.eventTransfersCost),
      hasCost: history.eventTransfersCost > 0,
      emptyText: history.eventTransfers > 0 ? "转会明细还在同步" : "本轮未转会",
      moves
    };
  });
}

function mapTransferMove(eventId: number, move: EntryTransferMove, index: number): TransferMoveRow {
  return {
    id: `move-${eventId}-${index}`,
    text: `OUT ${formatPlayerTeam(move.elementOutWebName, move.elementOutTeamShortName)} -> IN ${formatPlayerTeam(move.elementInWebName, move.elementInTeamShortName)}`,
    costText: `Sold: ${formatMoney(move.elementOutCost)} | Bought: ${formatMoney(move.elementInCost)}`
  };
}

function mapChipCounts(results: EntryHistoryItem[]): SimpleRow[] {
  const counts = results.reduce<Record<string, number>>((acc, item) => {
    const chip = item.eventChip;
    if (chip && chip !== "NONE") {
      acc[chip] = (acc[chip] || 0) + 1;
    }
    return acc;
  }, {});

  return Object.keys(counts)
    .map((chip) => ({
      id: `chip-count-${chip}`,
      label: formatChip(chip),
      value: `${counts[chip]}次`
    }))
    .sort((a, b) => Number(b.value.replace(/\D/g, "")) - Number(a.value.replace(/\D/g, "")));
}

function mapHistoryRow(item: EntryHistoryItem): HistoryRow {
  return {
    id: `history-${item.eventId}`,
    gameweek: `GW${item.eventId}`,
    eventPoints: String(item.eventPoints),
    eventNetPoints: String(item.eventNetPoints),
    eventRank: item.eventRank === null || item.eventRank === undefined ? "-" : formatCompactNumber(item.eventRank),
    overallPoints: String(item.overallPoints),
    overallRank: formatCompactNumber(item.overallRank),
    eventTransfers: String(item.eventTransfers),
    eventTransfersCost: String(item.eventTransfersCost),
    teamValue: formatMoney(item.teamValue),
    bank: formatMoney(item.bank)
  };
}

function mapSeasonHistoryRow(item: EntrySeasonHistoryItem, index: number): SeasonHistoryRow {
  return {
    id: `season-${item.season}`,
    order: String(index + 1),
    season: item.season,
    totalPoints: String(item.totalPoints),
    overallRank: formatCompactNumber(item.overallRank)
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

function formatPlayerTeam(playerName: string, teamShortName?: string | null): string {
  return teamShortName ? `${playerName} (${teamShortName})` : playerName;
}

function formatChip(chip?: string | null): string {
  if (!chip) {
    return "-";
  }

  const labels: Record<string, string> = {
    NONE: "无",
    BENCH_BOOST: "BB",
    FREE_HIT: "FH",
    TRIPLE_CAPTAIN: "TC",
    WILDCARD: "WC",
    MANAGER: "AM"
  };
  return labels[chip] || chip || "-";
}
