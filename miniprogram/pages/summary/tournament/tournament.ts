import { PerformancePage } from "../../../utils/performance-page";
import {
  getEntrySummaryTournaments,
  getTournamentSummary,
  type EntryTournament,
  type TournamentEntryRankingSummary,
  type TournamentEventResult
} from "../../../services/tournament.service";
import { getApiSessionToken } from "../../../services/auth.service";
import { waitForAuthoritativeFollow } from "../../../utils/follow";
import { storageKeys } from "../../../config/storage-keys";
import { goToEntrySearch } from "../../../utils/navigation";
import { compactJoin, formatCompactNumber, formatMoney, formatPoints, formatRank } from "../../../utils/summary-format";
import { getAppContextSnapshot } from "../../../services/app-context.service";
import { capturePageRequestTrace } from "../../../services/graphql.service";
import type { PageRequestTrace } from "../../../services/graphql.service";
import { canReadEventReporting } from "../../../utils/event-context";

type TournamentSummaryTab = "overview" | "rankings" | "metrics";
type TournamentEmptyState = "" | "entry" | "tournaments";
type TournamentSummaryResumeStage = "initialize" | "tournaments" | "summary";

interface MetricCard {
  label: string;
  value: string;
  meta?: string;
}

interface RankingRow {
  id: string;
  rank: string;
  entryName: string;
  playerName: string;
  points: string;
  netPoints: string;
  overallRank: string;
  chip: string;
  isMine: boolean;
}

interface SummaryData {
  loading: boolean;
  error: string;
  emptyState: TournamentEmptyState;
  emptyEyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionText: string;
  entryId?: number;
  event: number;
  maxGw: number;
  tournaments: EntryTournament[];
  tournamentNames: string[];
  selectedTournamentIndex: number;
  selectedTournamentName: string;
  headerSubtitle: string;
  activeTab: TournamentSummaryTab;
  showOverview: boolean;
  showRankings: boolean;
  showMetrics: boolean;
  overviewStats: MetricCard[];
  tournamentStats: MetricCard[];
  entryMetricStats: MetricCard[];
  rankingRows: RankingRow[];
  allRankingRows: RankingRow[];
  displayedRankingCount: number;
  hasMoreRankings: boolean;
  hasOverview: boolean;
  hasRankings: boolean;
  hasMetrics: boolean;
}

PerformancePage({
  data: {
    loading: false,
    error: "",
    emptyState: "",
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
    entryId: 0,
    event: 1,
    maxGw: 1,
    tournaments: [],
    tournamentNames: [],
    selectedTournamentIndex: 0,
    selectedTournamentName: "",
    headerSubtitle: "",
    activeTab: "overview",
    showOverview: true,
    showRankings: false,
    showMetrics: false,
    overviewStats: [],
    tournamentStats: [],
    entryMetricStats: [],
    rankingRows: [],
    allRankingRows: [],
    displayedRankingCount: 30,
    hasMoreRankings: false,
    hasOverview: false,
    hasRankings: false,
    hasMetrics: false
  } as SummaryData,

  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  startupPending: false,
  resumeOnShow: false,
  resumeStage: null as TournamentSummaryResumeStage | null,
  activeLoadStage: null as Exclude<TournamentSummaryResumeStage, "initialize"> | null,
  summaryRequestId: 0,
  directoryRequestId: 0,
  activeLoadForceRefresh: false,
  resumeForceRefresh: false,

  async onLoad() {
    this.pageVisible = true;
    const trace = capturePageRequestTrace({
      callerSurface: "summary-tournament",
      trigger: "load"
    });
    await this.initializePage(trace);
  },

  async initializePage(trace?: PageRequestTrace) {
    const lifecycleRevision = this.lifecycleRevision;
    this.startupPending = true;
    await this.ensureAppDataReady();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    const app = getApp<IAppOption>();
    if (!getApiSessionToken()) {
      // With no valid session the stored binding is only offline/display
      // fallback: the account may have been relinked, so wait for the
      // refreshed profile before snapshotting the entry. Enter the loading
      // state first so the wait never renders placeholder content.
      this.setData({ loading: true });
      try { await app.authReady; } catch {}
    }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({
      entryId: app.globalData.entryId ?? 0,
      event: currentGw,
      maxGw: currentGw
    });
    this.startupPending = false;
    await this.loadTournaments(false, trace);
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed || !this.resumeOnShow) return;
    const resumeStage = this.resumeStage;
    const resumeForceRefresh = this.resumeForceRefresh;
    this.resumeOnShow = false;
    this.resumeStage = null;
    this.resumeForceRefresh = false;
    const trace = capturePageRequestTrace({
      callerSurface: resumeStage === "summary" ? "summary-tournament-results" : "summary-tournament",
      trigger: "show"
    });
    if (resumeStage === "summary") {
      this.setData({ loading: false });
      await this.loadSummary(resumeForceRefresh, trace);
      return;
    }
    if (resumeStage === "tournaments") {
      this.setData({ loading: false });
      await this.loadTournaments(resumeForceRefresh, trace);
      return;
    }
    await this.initializePage(trace);
  },

  onHide() {
    this.pageVisible = false;
    this.resumeStage = this.startupPending
      ? "initialize"
      : this.activeLoadStage;
    this.resumeOnShow = this.resumeStage !== null;
    this.resumeForceRefresh = this.resumeStage !== null && this.activeLoadForceRefresh;
    this.lifecycleRevision += 1;
    this.summaryRequestId += 1;
    this.directoryRequestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.resumeStage = null;
    this.activeLoadStage = null;
    this.activeLoadForceRefresh = false;
    this.resumeForceRefresh = false;
    this.lifecycleRevision += 1;
    this.summaryRequestId += 1;
    this.directoryRequestId += 1;
  },

  onPullDownRefresh() {
    return this.refreshData().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    if (!app.globalData.gw) {
      await app.initAppData();
    }
  },

  syncRecoveredEvent(eventBeforeDirectoryRead: number): void {
    const context = getAppContextSnapshot();
    const recoveredEvent = Number(context?.displayEvent || context?.currentEvent || 0);
    if (!Number.isSafeInteger(recoveredEvent) || recoveredEvent <= 0) return;
    this.setData({
      event: this.data.event === eventBeforeDirectoryRead ? recoveredEvent : this.data.event,
      maxGw: recoveredEvent
    });
  },

  async loadTournaments(forceRefresh = false, originatingTrace?: PageRequestTrace) {
    const lifecycleRevision = this.lifecycleRevision;
    const requestId = ++this.directoryRequestId;
    const isActiveLifecycle = () => this.pageVisible
      && lifecycleRevision === this.lifecycleRevision
      && requestId === this.directoryRequestId;
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "summary-tournament",
      trigger: forceRefresh ? "refresh" : "load"
    });
    if (!this.data.entryId) {
      this.setData({
        loading: false,
        error: "",
        emptyState: "entry",
        emptyEyebrow: "需要球队",
        emptyTitle: "先选择我的球队",
        emptyDescription: "查找球队并设为我的球队后即可查看；关联 LetLetMe 账户可自动同步网页已验证球队。",
        emptyActionText: "去选择球队",
        tournaments: [],
        tournamentNames: [],
        selectedTournamentName: ""
      });
      return;
    }

    this.setData({
      loading: true,
      error: "",
      emptyState: "",
      emptyEyebrow: "",
      emptyTitle: "",
      emptyDescription: "",
      emptyActionText: ""
    });
    this.activeLoadStage = "tournaments";
    this.activeLoadForceRefresh = forceRefresh;
    const eventBeforeDirectoryRead = this.data.event;
    const contextMissingBeforeDirectoryRead = !getAppContextSnapshot()?.season;
    try {
      const tournaments = await getEntrySummaryTournaments(this.data.entryId, forceRefresh, trace);
      if (!isActiveLifecycle()) return;
      if (contextMissingBeforeDirectoryRead) {
        this.syncRecoveredEvent(eventBeforeDirectoryRead);
      }
      if (tournaments.length === 0) {
        this.setData({
          tournaments: [],
          tournamentNames: [],
          selectedTournamentName: "",
          emptyState: "tournaments",
          emptyEyebrow: "赛事待就绪",
          emptyTitle: "当前球队还没有可查看的赛事",
          emptyDescription: "加入或创建一个赛事之后，或等待新赛季数据同步，再回到这里重新检查。",
          emptyActionText: "重新检查"
        });
        return;
      }

      const storedId = Number((() => {
        try {
          return wx.getStorageSync(storageKeys.selectedSummaryTournamentId);
        } catch {
          return 0;
        }
      })());
      const selectedTournamentIndex = Math.max(0, tournaments.findIndex((item) => item.id === storedId));
      const selectedTournament = tournaments[selectedTournamentIndex] || tournaments[0];
      this.setData({
        tournaments,
        tournamentNames: tournaments.map((item) => item.name),
        selectedTournamentIndex,
        selectedTournamentName: selectedTournament.name,
        emptyState: ""
      });
      await this.loadSummary(forceRefresh, trace);
    } catch (error) {
      if (!isActiveLifecycle()) return;
      this.setData({ error: error instanceof Error ? error.message : "赛事回顾加载失败" });
    } finally {
      if (isActiveLifecycle() && this.activeLoadStage === "tournaments") {
        this.activeLoadStage = null;
        this.activeLoadForceRefresh = false;
        this.setData({ loading: false });
      }
    }
  },

  async loadSummary(forceRefresh = false, originatingTrace?: PageRequestTrace) {
    const lifecycleRevision = this.lifecycleRevision;
    const requestId = ++this.summaryRequestId;
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "summary-tournament-results",
      trigger: forceRefresh ? "refresh" : "tab"
    });
    const tournament = this.data.tournaments[this.data.selectedTournamentIndex];
    const requestedEvent = this.data.event;
    const requestedEntryId = this.data.entryId;
    if (!tournament || !requestedEntryId) {
      return;
    }
    const isActiveRequest = () => (
      this.pageVisible
      && lifecycleRevision === this.lifecycleRevision
      && requestId === this.summaryRequestId
      && String(this.data.tournaments[this.data.selectedTournamentIndex]?.id || "") === String(tournament.id)
      && this.data.event === requestedEvent
      && this.data.entryId === requestedEntryId
    );

    this.activeLoadStage = "summary";
    this.activeLoadForceRefresh = forceRefresh;
    this.setData({ loading: true, error: "" });
    try {
      if (!canReadEventReporting(requestedEvent, getAppContextSnapshot()?.currentEvent)) {
        if (!isActiveRequest()) return;
        this.setData({
          ...mapTournamentSummaryData(
            tournament,
            [],
            {} as TournamentEntryRankingSummary,
            requestedEntryId,
            requestedEvent
          )
        });
        return;
      }
      const payload = await getTournamentSummary(
        tournament.id,
        requestedEvent,
        requestedEntryId,
        forceRefresh,
        trace
      );
      if (!isActiveRequest()) return;
      wx.setStorageSync(storageKeys.selectedSummaryTournamentId, tournament.id);
      wx.setStorageSync(storageKeys.selectedSummaryTournamentName, tournament.name);
      this.setData(mapTournamentSummaryData(tournament, payload.tournamentEventResults, payload.tournamentEntryRankingSummary, requestedEntryId, requestedEvent));
    } catch (error) {
      if (!isActiveRequest()) return;
      this.setData({ error: error instanceof Error ? error.message : "赛事回顾加载失败" });
    } finally {
      if (isActiveRequest()) this.setData({ loading: false });
      if (isActiveRequest() && this.activeLoadStage === "summary") {
        this.activeLoadStage = null;
        this.activeLoadForceRefresh = false;
      }
    }
  },

  async refreshData() {
    await this.loadTournaments(true);

    if (!this.data.error && this.data.emptyState !== "entry") {
      wx.showToast({
        title: this.data.emptyState ? "已是最新" : "刷新成功",
        icon: "success",
        duration: 1000
      });
    }
  },

  onTournamentChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const selectedTournamentIndex = Number(event.detail.value);
    if (!Number.isFinite(selectedTournamentIndex)) return;
    const selectedTournament = this.data.tournaments[selectedTournamentIndex];
    this.setData({
      selectedTournamentIndex,
      selectedTournamentName: selectedTournament?.name || ""
    });
    this.loadSummary();
  },

  onEventChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const next = Number(event.detail.value);
    if (!Number.isFinite(next) || next <= 0) return;
    this.setData({ event: next });
    this.loadSummary();
  },

  onTabTap(event: WechatMiniprogram.TouchEvent) {
    const tab = String(event.currentTarget.dataset.tab || "overview") as TournamentSummaryTab;
    this.setActiveTab(tab);
  },

  setActiveTab(tab: TournamentSummaryTab) {
    this.setData({
      activeTab: tab,
      showOverview: tab === "overview",
      showRankings: tab === "rankings",
      showMetrics: tab === "metrics"
    });
  },

  loadMoreRankings() {
    const { allRankingRows, displayedRankingCount } = this.data;
    const nextCount = displayedRankingCount + 30;
    this.setData({
      rankingRows: allRankingRows.slice(0, nextCount),
      displayedRankingCount: nextCount,
      hasMoreRankings: allRankingRows.length > nextCount
    });
  },

  onRetry() {
    this.loadTournaments(true);
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
      return;
    }

    this.loadTournaments(true);
  }
});

function mapTournamentSummaryData(
  tournament: EntryTournament,
  results: TournamentEventResult[],
  summary: TournamentEntryRankingSummary,
  entryId: number,
  event: number,
  displayedRankingCount: number = 30
): Partial<SummaryData> {
  const currentRow = results.find((row) => row.entryId === entryId);
  const allRankingRows = results.map((row, index) => mapRankingRow(row, index, entryId));
  const currentRankVisible = allRankingRows.some((row) => row.isMine);
  if (currentRow && !currentRankVisible) {
    allRankingRows.push(mapRankingRow(currentRow, allRankingRows.length, entryId));
  }
  const rankingRows = allRankingRows.slice(0, displayedRankingCount);
  const hasMoreRankings = allRankingRows.length > displayedRankingCount;

  const overviewStats = [
    { label: "本轮得分", value: formatPoints(currentRow?.eventPoints) },
    { label: "本轮净分", value: formatPoints(currentRow?.eventNetPoints) },
    { label: "小组排名", value: formatRank(currentRow?.eventGroupRank) },
    { label: "赛事排名", value: formatRank(summary.tournamentOverallRank) },
    { label: "总排名", value: formatCompactNumber(summary.overallRank ?? currentRow?.overallRank) },
    { label: "阵容身价", value: formatMoney(summary.teamValue ?? currentRow?.teamValue) }
  ].filter((item) => item.value !== "-");

  const tournamentStats = [
    { label: "参赛队伍", value: formatPoints(tournament.totalTeamNum) },
    { label: "当前 GW", value: `GW${event}` },
    { label: "赛程范围", value: compactJoin([formatGw(tournament.groupStartedEventId), formatGw(tournament.groupEndedEventId)]) || "-" },
    { label: "状态", value: formatState(tournament.state) }
  ].filter((item) => item.value !== "-");

  const entryMetricStats = [
    { label: "身价排名", value: formatRank(summary.tournamentTeamValueRank), meta: formatMoney(summary.teamValue) },
    { label: "转会排名", value: formatRank(summary.tournamentTransfersRank), meta: `${formatPoints(summary.transfersNum)} 次` },
    { label: "剁手排名", value: formatRank(summary.tournamentCostsRank), meta: `${formatPoints(summary.totalCosts)} 分` },
    { label: "板凳排名", value: formatRank(summary.tournamentBenchPointsRank), meta: `${formatPoints(summary.totalBenchPoints)} 分` },
    { label: "自动替补排名", value: formatRank(summary.tournamentAutoSubRank), meta: `${formatPoints(summary.autoSubPoints)} 分` },
    { label: "开卡", value: formatChip(currentRow?.eventChip), meta: `队长 ${formatPoints(currentRow?.captainPoints)} 分` }
  ].filter((item) => item.value !== "-");

  return {
    selectedTournamentName: tournament.name,
    headerSubtitle: compactJoin([`GW${event}`, `${results.length || tournament.totalTeamNum || 0} 队`]),
    overviewStats,
    tournamentStats,
    entryMetricStats,
    rankingRows,
    allRankingRows,
    hasMoreRankings,
    hasOverview: overviewStats.length > 0 || tournamentStats.length > 0,
    hasRankings: allRankingRows.length > 0,
    hasMetrics: entryMetricStats.length > 0
  };
}

function mapRankingRow(row: TournamentEventResult, index: number, entryId: number): RankingRow {
  return {
    id: `${row.entryId}-${index}`,
    rank: formatRank(row.eventGroupRank || index + 1),
    entryName: row.entryName || `Entry #${row.entryId}`,
    playerName: row.playerName || "",
    points: formatPoints(row.eventPoints),
    netPoints: formatPoints(row.eventNetPoints),
    overallRank: formatCompactNumber(row.overallRank),
    chip: formatChip(row.eventChip),
    isMine: row.entryId === entryId
  };
}

function formatGw(value?: number | null): string {
  return value ? `GW${value}` : "";
}

function formatState(value?: string | null): string {
  const labels: Record<string, string> = {
    ACTIVE: "进行中",
    INACTIVE: "未开始",
    FINISHED: "已结束"
  };
  return value ? labels[value] || value : "-";
}

function formatChip(chip?: string | null): string {
  const labels: Record<string, string> = {
    NONE: "无",
    BENCH_BOOST: "BB",
    FREE_HIT: "FH",
    TRIPLE_CAPTAIN: "TC",
    WILDCARD: "WC",
    MANAGER: "AM"
  };
  return chip ? labels[chip] || chip : "无";
}
