import {
  getEntrySummaryTournaments,
  getTournamentSummary,
  type EntryTournament,
  type TournamentEntryRankingSummary,
  type TournamentEventResult
} from "../../../services/tournament.service";
import { getApiSessionToken } from "../../../services/auth.service";
import { storageKeys } from "../../../config/storage-keys";
import { forceEntryBinding } from "../../../utils/navigation";
import { compactJoin, formatCompactNumber, formatMoney, formatPoints, formatRank } from "../../../utils/summary-format";

type TournamentSummaryTab = "overview" | "rankings" | "metrics";
type TournamentEmptyState = "" | "entry" | "tournaments";

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
  hasOverview: boolean;
  hasRankings: boolean;
  hasMetrics: boolean;
}

Page({
  data: {
    loading: false,
    error: "",
    emptyState: "",
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
    entryId: undefined,
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
    hasOverview: false,
    hasRankings: false,
    hasMetrics: false
  } as SummaryData,

  async onLoad() {
    await this.ensureAppDataReady();
    const app = getApp<IAppOption>();
    if (!getApiSessionToken()) {
      // With no valid session the stored binding is only offline/display
      // fallback: the account may have been relinked, so wait for the
      // refreshed profile before snapshotting the entry.
      try { await app.authReady; } catch {}
    }
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({
      entryId: app.globalData.entryId,
      event: currentGw,
      maxGw: currentGw
    });
    await this.loadTournaments();
  },

  onPullDownRefresh() {
    this.refreshData().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    if (!app.globalData.gw) {
      await app.initAppData();
    }
  },

  async loadTournaments() {
    if (!this.data.entryId) {
      this.setData({
        loading: false,
        error: "",
        emptyState: "entry",
        emptyEyebrow: "需要账户",
        emptyTitle: "先关联你的 LetLetMe 账户",
        emptyDescription: "关联后会自动读取你在网站端已验证的 FPL 球队，无需再次输入 Entry ID。",
        emptyActionText: "去关联账户",
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
    try {
      const tournaments = await getEntrySummaryTournaments(this.data.entryId);
      if (tournaments.length === 0) {
        this.setData({
          tournaments: [],
          tournamentNames: [],
          selectedTournamentName: "",
          emptyState: "tournaments",
          emptyEyebrow: "联赛待就绪",
          emptyTitle: "当前球队还没有可查看的联赛",
          emptyDescription: "加入或创建一个积分联赛后，或等待新赛季数据同步，再回到这里重新检查。",
          emptyActionText: "重新检查"
        });
        return;
      }

      const storedId = Number(wx.getStorageSync(storageKeys.selectedSummaryTournamentId));
      const selectedTournamentIndex = Math.max(0, tournaments.findIndex((item) => item.id === storedId));
      const selectedTournament = tournaments[selectedTournamentIndex] || tournaments[0];
      this.setData({
        tournaments,
        tournamentNames: tournaments.map((item) => item.name),
        selectedTournamentIndex,
        selectedTournamentName: selectedTournament.name,
        emptyState: ""
      });
      await this.loadSummary();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "联赛总结加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadSummary() {
    const tournament = this.data.tournaments[this.data.selectedTournamentIndex];
    if (!tournament || !this.data.entryId) {
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const payload = await getTournamentSummary(tournament.id, this.data.event, this.data.entryId);
      wx.setStorageSync(storageKeys.selectedSummaryTournamentId, tournament.id);
      wx.setStorageSync(storageKeys.selectedSummaryTournamentName, tournament.name);
      this.setData(mapTournamentSummaryData(tournament, payload.tournamentEventResults, payload.tournamentEntryRankingSummary, this.data.entryId, this.data.event));
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "联赛总结加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async refreshData() {
    if (this.data.tournaments.length === 0) {
      await this.loadTournaments();
    } else {
      await this.loadSummary();
    }

    if (!this.data.error && this.data.emptyState !== "entry") {
      wx.showToast({
        title: this.data.emptyState ? "已是最新" : "刷新成功",
        icon: "success",
        duration: 1000
      });
    }
  },

  onTournamentChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const selectedTournamentIndex = Number(event.detail.value) || 0;
    const selectedTournament = this.data.tournaments[selectedTournamentIndex];
    this.setData({
      selectedTournamentIndex,
      selectedTournamentName: selectedTournament?.name || ""
    });
    this.loadSummary();
  },

  onEventChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.setData({ event: Number(event.detail.value) || this.data.event });
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

  onRetry() {
    this.loadTournaments();
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      forceEntryBinding();
      return;
    }

    this.loadTournaments();
  }
});

function mapTournamentSummaryData(
  tournament: EntryTournament,
  results: TournamentEventResult[],
  summary: TournamentEntryRankingSummary,
  entryId: number,
  event: number
): Partial<SummaryData> {
  const currentRow = results.find((row) => row.entryId === entryId);
  const rankingRows = results.slice(0, 30).map((row, index) => mapRankingRow(row, index, entryId));
  const currentRankVisible = rankingRows.some((row) => row.isMine);
  if (currentRow && !currentRankVisible) {
    rankingRows.push(mapRankingRow(currentRow, rankingRows.length, entryId));
  }

  const overviewStats = [
    { label: "本轮得分", value: formatPoints(currentRow?.eventPoints) },
    { label: "本轮净分", value: formatPoints(currentRow?.eventNetPoints) },
    { label: "小组排名", value: formatRank(currentRow?.eventGroupRank) },
    { label: "联赛总排名", value: formatRank(summary.tournamentOverallRank) },
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
    hasOverview: overviewStats.length > 0 || tournamentStats.length > 0,
    hasRankings: rankingRows.length > 0,
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
