import { PerformancePage } from "../../../utils/performance-page";
import {
  getEntryPointsRaceTournament,
  getTournamentSelectionStats
} from "../../../services/tournament.service";
import { getApiSessionToken } from "../../../services/auth.service";
import type { TournamentOption, TournamentSelectionPlayer, TournamentSelectionStats } from "../../../models/tournament";
import { storageKeys } from "../../../config/storage-keys";
import { goToEntrySearch } from "../../../utils/navigation";
import { getAppContextSnapshot } from "../../../services/app-context.service";
import { capturePageRequestTrace } from "../../../services/graphql.service";
import type { PageRequestTrace } from "../../../services/graphql.service";
import { copyShareText } from "../../../utils/live-share";
import { formatSelectionsShareText } from "../../../utils/explore-share";
import { formatCompactNumber } from "../../../utils/summary-format";

type SelectionTab = "selected" | "captain" | "transfersIn" | "transfersOut";
type SelectionsEmptyState = "" | "entry" | "tournaments";
type SelectionsResumeStage = "initialize" | "tournaments" | "stats";

interface SelectionRow {
  id: string;
  rank: number;
  name: string;
  /** team · position · secondary stat (EO% or transfer count) — one compact line. */
  meta: string;
  primaryValue: string;
  barStyle: string;
}

interface TabOption {
  key: SelectionTab;
  label: string;
}

interface SelectionsData {
  loadingTournaments: boolean;
  loadingStats: boolean;
  error: string;
  emptyState: SelectionsEmptyState;
  emptyEyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionText: string;
  statsEmptyTitle: string;
  statsEmptyDescription: string;
  entryId?: number;
  event: number;
  maxGw: number;
  tournaments: TournamentOption[];
  tournamentNames: string[];
  selectedTournamentIndex: number;
  selectedTournamentName: string;
  headerSubtitle: string;
  totalEntriesText: string;
  activeTab: SelectionTab;
  tabs: TabOption[];
  selectedRows: SelectionRow[];
  captainRows: SelectionRow[];
  transferInRows: SelectionRow[];
  transferOutRows: SelectionRow[];
  visibleRows: SelectionRow[];
  activeTabLabel: string;
  shareCopied: boolean;
  shareSheetOpen: boolean;
  shareText: string;
}

const STATS_LIMIT = 10;

const TABS: TabOption[] = [
  { key: "selected", label: "选择率" },
  { key: "captain", label: "队长" },
  { key: "transfersIn", label: "转入" },
  { key: "transfersOut", label: "转出" }
];

PerformancePage({
  data: {
    loadingTournaments: false,
    loadingStats: false,
    error: "",
    emptyState: "",
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
    statsEmptyTitle: "本轮还没有选择率数据",
    statsEmptyDescription: "GW 数据同步后会显示赛事内的阵容趋势",
    entryId: 0,
    event: 1,
    maxGw: 1,
    tournaments: [],
    tournamentNames: [],
    selectedTournamentIndex: 0,
    selectedTournamentName: "",
    headerSubtitle: "",
    totalEntriesText: "",
    activeTab: "selected",
    tabs: TABS,
    selectedRows: [],
    captainRows: [],
    transferInRows: [],
    transferOutRows: [],
    visibleRows: [],
    activeTabLabel: "选择率",
    shareCopied: false,
    shareSheetOpen: false,
    shareText: ""
  } as SelectionsData,

  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  startupPending: false,
  resumeOnShow: false,
  resumeStage: null as SelectionsResumeStage | null,
  activeTournamentForceRefresh: false,
  resumeTournamentForceRefresh: false,
  activeStatsForceRefresh: false,
  resumeStatsForceRefresh: false,

  async onLoad() {
    this.pageVisible = true;
    const trace = capturePageRequestTrace({
      callerSurface: "data-selections",
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
      this.setData({ loadingTournaments: true });
      try { await app.authReady; } catch {}
    }
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
    const resumeTournamentForceRefresh = this.resumeTournamentForceRefresh;
    const resumeStatsForceRefresh = this.resumeStatsForceRefresh;
    this.resumeOnShow = false;
    this.resumeStage = null;
    this.resumeTournamentForceRefresh = false;
    this.resumeStatsForceRefresh = false;
    const trace = capturePageRequestTrace({
      callerSurface: resumeStage === "stats" ? "data-selections-stats" : "data-selections",
      trigger: "show"
    });
    if (resumeStage === "stats") {
      this.setData({ loadingTournaments: false, loadingStats: false });
      await this.loadStats(resumeStatsForceRefresh, trace);
      return;
    }
    if (resumeStage === "tournaments") {
      this.setData({ loadingTournaments: false, loadingStats: false });
      await this.loadTournaments(resumeTournamentForceRefresh, trace);
      return;
    }
    await this.initializePage(trace);
  },

  onHide() {
    this.pageVisible = false;
    this.resumeStage = this.startupPending
      ? "initialize"
      : this.data.loadingStats
        ? "stats"
        : this.data.loadingTournaments
          ? "tournaments"
          : null;
    this.resumeOnShow = this.resumeStage !== null;
    this.resumeTournamentForceRefresh = this.resumeStage === "tournaments"
      && this.activeTournamentForceRefresh;
    this.resumeStatsForceRefresh = this.resumeStage === "stats"
      && this.activeStatsForceRefresh;
    this.lifecycleRevision += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.resumeStage = null;
    this.resumeTournamentForceRefresh = false;
    this.resumeStatsForceRefresh = false;
    this.activeTournamentForceRefresh = false;
    this.activeStatsForceRefresh = false;
    this.lifecycleRevision += 1;
  },

  onPullDownRefresh() {
    // Always re-pull the tournament list (it chains into loadStats when
    // populated): a cached list must not hide a league the user just joined.
    const task = this.loadTournaments(true);
    return task.finally(() => wx.stopPullDownRefresh());
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

  async loadTournaments(forceRefresh = false, originatingTrace?: PageRequestTrace): Promise<void> {
    const lifecycleRevision = this.lifecycleRevision;
    const isActiveLifecycle = () => this.pageVisible && lifecycleRevision === this.lifecycleRevision;
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "data-selections",
      trigger: forceRefresh ? "refresh" : "load"
    });
    this.activeTournamentForceRefresh = forceRefresh;
    if (!this.data.entryId) {
      this.setData({
        loadingTournaments: false,
        error: "",
        emptyState: "entry",
        emptyEyebrow: "需要球队",
        emptyTitle: "先选择我的球队",
        emptyDescription: "查找球队并设为我的球队后即可查看；关联 LetLetMe 账户可自动同步网页已验证球队。",
        emptyActionText: "去选择球队",
        tournaments: [],
        tournamentNames: [],
        visibleRows: []
      });
      return;
    }

    this.setData({
      loadingTournaments: true,
      error: "",
      emptyState: "",
      emptyEyebrow: "",
      emptyTitle: "",
      emptyDescription: "",
      emptyActionText: ""
    });
    const eventBeforeDirectoryRead = this.data.event;
    const contextMissingBeforeDirectoryRead = !getAppContextSnapshot()?.season;
    try {
      const tournaments = await getEntryPointsRaceTournament(this.data.entryId, forceRefresh, trace);
      if (!isActiveLifecycle()) return;
      if (contextMissingBeforeDirectoryRead) {
        this.syncRecoveredEvent(eventBeforeDirectoryRead);
      }
      if (tournaments.length === 0) {
        this.setData({
          tournaments: [],
          tournamentNames: [],
          selectedTournamentName: "",
          visibleRows: [],
          emptyState: "tournaments",
          emptyEyebrow: "赛事待就绪",
          emptyTitle: "当前球队还没有可查看的赛事",
          emptyDescription: "加入一个赛事之后，或等待新赛季数据同步，再回到这里重新检查。",
          emptyActionText: "重新检查"
        });
        return;
      }

      const storedId = Number(wx.getStorageSync(storageKeys.selectedDataSelectionsTournamentId));
      const storedIndex = tournaments.findIndex((item) => Number(item.id) === storedId);
      const selectedTournamentIndex = storedIndex >= 0 ? storedIndex : 0;
      const selectedTournament = tournaments[selectedTournamentIndex] || tournaments[0];

      this.setData({
        tournaments,
        tournamentNames: tournaments.map((item) => item.name),
        selectedTournamentIndex,
        selectedTournamentName: selectedTournament.name,
        emptyState: ""
      });
      await this.loadStats(forceRefresh, trace);
    } catch (error) {
      if (!isActiveLifecycle()) return;
      this.setData({ error: error instanceof Error ? error.message : "阵容选择数据加载失败" });
    } finally {
      if (isActiveLifecycle()) {
        this.activeTournamentForceRefresh = false;
        this.setData({ loadingTournaments: false });
      }
    }
  },

  async loadStats(forceRefresh = false, originatingTrace?: PageRequestTrace): Promise<void> {
    const lifecycleRevision = this.lifecycleRevision;
    const isActiveLifecycle = () => this.pageVisible && lifecycleRevision === this.lifecycleRevision;
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "data-selections-stats",
      trigger: "tab"
    });
    this.activeStatsForceRefresh = forceRefresh;
    const tournament = this.data.tournaments[this.data.selectedTournamentIndex];
    if (!tournament) {
      return;
    }

    const tournamentId = Number(tournament.id);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      this.setData({ error: "联赛 ID 无效" });
      return;
    }

    const requestedEvent = this.data.event;
    const isActiveContext = () => (
      Number(this.data.tournaments[this.data.selectedTournamentIndex]?.id) === tournamentId
      && this.data.event === requestedEvent
    );
    this.setData({ loadingStats: true, error: "" });
    try {
      const stats = await getTournamentSelectionStats(tournamentId, requestedEvent, STATS_LIMIT, forceRefresh, trace);
      if (!isActiveLifecycle() || !isActiveContext()) {
        // Superseded by a tournament/GW change or a list refresh while in
        // flight: the newer load owns rows, header, and loading state.
        return;
      }
      wx.setStorageSync(storageKeys.selectedDataSelectionsTournamentId, tournament.id);
      wx.setStorageSync(storageKeys.selectedDataSelectionsTournamentName, tournament.name);
      this.setData(mapSelectionStats(tournament, requestedEvent, stats, this.data.activeTab));
    } catch (error) {
      if (!isActiveLifecycle() || !isActiveContext()) {
        return;
      }
      this.setData({
        error: error instanceof Error ? error.message : "阵容选择数据加载失败",
        selectedRows: [],
        captainRows: [],
        transferInRows: [],
        transferOutRows: [],
        visibleRows: []
      });
    } finally {
      if (isActiveLifecycle() && isActiveContext()) {
        this.activeStatsForceRefresh = false;
        this.setData({ loadingStats: false });
      }
    }
  },

  onTournamentChange(event: WechatMiniprogram.PickerChange) {
    const selectedTournamentIndex = Number(event.detail.value) || 0;
    const selectedTournament = this.data.tournaments[selectedTournamentIndex];
    this.setData({
      selectedTournamentIndex,
      selectedTournamentName: selectedTournament?.name || ""
    });
    this.loadStats();
  },

  onEventChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.setData({ event: Number(event.detail.value) || this.data.event });
    this.loadStats();
  },

  onTabTap(event: WechatMiniprogram.TouchEvent) {
    const activeTab = String(event.currentTarget.dataset.tab || "selected") as SelectionTab;
    const emptyCopy = selectionEmptyCopy(activeTab, this.data.event);
    const activeTabLabel = TABS.find((item) => item.key === activeTab)?.label || "选择率";
    this.setData({
      activeTab,
      activeTabLabel,
      visibleRows: getRowsForTab(this.data, activeTab),
      statsEmptyTitle: emptyCopy.title,
      statsEmptyDescription: emptyCopy.description
    });
  },

  onRetry() {
    if (this.data.tournaments.length === 0) {
      this.loadTournaments(true);
      return;
    }
    this.loadStats();
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
      return;
    }
    this.loadTournaments(true);
  },

  onCopyShare() {
    try {
      if (this.data.visibleRows.length === 0) {
        wx.showToast({ title: "当前榜单还没有可分享的数据", icon: "none" });
        return;
      }
      const text = formatSelectionsShareText({
        tabLabel: this.data.activeTabLabel,
        tournamentName: this.data.selectedTournamentName,
        event: this.data.event,
        fieldLine: this.data.totalEntriesText ? `范围：${this.data.totalEntriesText}` : "",
        rows: this.data.visibleRows
      });
      void copyShareText(text).then((ok) => {
        if (ok) {
          this.setData({ shareCopied: true, shareSheetOpen: false });
          setTimeout(() => this.setData({ shareCopied: false }), 2000);
          return;
        }
        this.setData({ shareSheetOpen: true, shareText: text });
      });
    } catch (error) {
      console.error("[copy-share] selections", error);
      wx.showToast({ title: "复制失败", icon: "none" });
    }
  },

  onCloseShareSheet() {
    this.setData({ shareSheetOpen: false });
  }
});

function mapSelectionStats(
  tournament: TournamentOption,
  event: number,
  stats: TournamentSelectionStats | null,
  activeTab: SelectionTab
): Partial<SelectionsData> {
  const selectedRows = mapPercentRows(stats?.mostSelectedPlayers || []);
  const captainRows = mapPercentRows(stats?.captainSelect || []);
  const transferInRows = mapTransferRows(stats?.mostTransferIn || []);
  const transferOutRows = mapTransferRows(stats?.mostTransferOut || []);
  const emptyCopy = selectionEmptyCopy(activeTab, event);
  const nextData = {
    selectedTournamentName: tournament.name,
    headerSubtitle: `${tournament.name} · GW${event}`,
    totalEntriesText: stats?.totalEntries ? `${stats.totalEntries} 队` : "",
    selectedRows,
    captainRows,
    transferInRows,
    transferOutRows
  };

  return {
    ...nextData,
    visibleRows: getRowsForTab(nextData, activeTab),
    statsEmptyTitle: emptyCopy.title,
    statsEmptyDescription: emptyCopy.description
  };
}

function selectionEmptyCopy(tab: SelectionTab, event: number): { title: string; description: string } {
  if (tab === "captain") {
    return {
      title: `GW${event} 还没有队长趋势`,
      description: "赛事成员提交阵容后会显示队长选择"
    };
  }
  if (tab === "transfersIn") {
    return {
      title: `GW${event} 还没有转入趋势`,
      description: "赛事内产生转会后会显示热门转入"
    };
  }
  if (tab === "transfersOut") {
    return {
      title: `GW${event} 还没有转出趋势`,
      description: "赛事内产生转会后会显示热门转出"
    };
  }
  return {
    title: `GW${event} 还没有选择率数据`,
    description: "赛事成员提交阵容后会显示球员选择率"
  };
}

function getRowsForTab(
  data: Pick<SelectionsData, "selectedRows" | "captainRows" | "transferInRows" | "transferOutRows">,
  tab: SelectionTab
): SelectionRow[] {
  if (tab === "captain") {
    return data.captainRows;
  }
  if (tab === "transfersIn") {
    return data.transferInRows;
  }
  if (tab === "transfersOut") {
    return data.transferOutRows;
  }
  return data.selectedRows;
}

function mapPercentRows(players: TournamentSelectionPlayer[]): SelectionRow[] {
  return players.map((player, index) => {
    const selectedPercent = safeNumber(player.selectedByPercent);
    const eoPercent = safeNumber(player.eoByPercent);
    return {
      id: `${player.id}-${index}`,
      rank: index + 1,
      name: player.webName,
      meta: compactJoin([
        player.teamShortName,
        positionLabel(player.position),
        eoPercent > 0 ? `EO ${formatPercent(eoPercent)}` : ""
      ]),
      primaryValue: formatPercent(selectedPercent),
      barStyle: `width: ${Math.min(Math.max(selectedPercent, 0), 100)}%;`
    };
  });
}

function mapTransferRows(players: TournamentSelectionPlayer[]): SelectionRow[] {
  const sorted = [...players].sort((left, right) => safeNumber(right.transfersEvent) - safeNumber(left.transfersEvent));
  const maxTransfers = Math.max(...sorted.map((player) => safeNumber(player.transfersEvent)), 1);

  return sorted.map((player, index) => {
    const transferCount = safeNumber(player.transfersEvent);
    return {
      id: `${player.id}-${index}`,
      rank: index + 1,
      name: player.webName,
      meta: compactJoin([
        player.teamShortName,
        positionLabel(player.position),
        `${formatCompactNumber(transferCount)} 次`
      ]),
      primaryValue: formatPercent(player.selectedByPercent),
      barStyle: `width: ${Math.min(Math.round((transferCount / maxTransfers) * 100), 100)}%;`
    };
  });
}

function positionLabel(position?: string): string {
  const normalized = (position || "").toUpperCase();
  const map: Record<string, string> = {
    GOALKEEPER: "GKP",
    DEFENDER: "DEF",
    MIDFIELDER: "MID",
    FORWARD: "FWD"
  };
  return map[normalized] || position || "";
}

function formatPercent(value?: number): string {
  return `${safeNumber(value).toFixed(1)}%`;
}

function safeNumber(value?: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compactJoin(values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" · ");
}
