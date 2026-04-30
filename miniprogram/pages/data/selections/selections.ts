import {
  getEntryPointsRaceTournament,
  getTournamentSelectionStats
} from "../../../services/tournament.service";
import type { TournamentOption, TournamentSelectionPlayer, TournamentSelectionStats } from "../../../models/tournament";
import { storageKeys } from "../../../config/storage-keys";

type SelectionTab = "selected" | "captain" | "transfersIn" | "transfersOut";

interface SelectionRow {
  id: string;
  rank: number;
  name: string;
  meta: string;
  primaryValue: string;
  primaryLabel: string;
  secondaryValue: string;
  secondaryLabel: string;
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
}

const STATS_LIMIT = 10;

const TABS: TabOption[] = [
  { key: "selected", label: "选择率" },
  { key: "captain", label: "队长" },
  { key: "transfersIn", label: "转入" },
  { key: "transfersOut", label: "转出" }
];

Page({
  data: {
    loadingTournaments: false,
    loadingStats: false,
    error: "",
    entryId: undefined,
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
    visibleRows: []
  } as SelectionsData,

  async onLoad() {
    await this.ensureAppDataReady();
    const app = getApp<IAppOption>();
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({
      entryId: app.globalData.entryId,
      event: currentGw,
      maxGw: currentGw
    });
    await this.loadTournaments();
  },

  onPullDownRefresh() {
    this.loadStats().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    if (!app.globalData.gw) {
      await app.initAppData();
    }
  },

  async loadTournaments(): Promise<void> {
    if (!this.data.entryId) {
      this.setData({
        error: "请先绑定 Entry ID",
        tournaments: [],
        tournamentNames: [],
        visibleRows: []
      });
      return;
    }

    this.setData({ loadingTournaments: true, error: "" });
    try {
      const tournaments = await getEntryPointsRaceTournament(this.data.entryId);
      if (tournaments.length === 0) {
        this.setData({
          tournaments: [],
          tournamentNames: [],
          selectedTournamentName: "",
          error: "暂无可用联赛"
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
        selectedTournamentName: selectedTournament.name
      });
      await this.loadStats();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "阵容选择数据加载失败" });
    } finally {
      this.setData({ loadingTournaments: false });
    }
  },

  async loadStats(): Promise<void> {
    const tournament = this.data.tournaments[this.data.selectedTournamentIndex];
    if (!tournament) {
      return;
    }

    const tournamentId = Number(tournament.id);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
      this.setData({ error: "联赛 ID 无效" });
      return;
    }

    this.setData({ loadingStats: true, error: "" });
    try {
      const stats = await getTournamentSelectionStats(tournamentId, this.data.event, STATS_LIMIT);
      wx.setStorageSync(storageKeys.selectedDataSelectionsTournamentId, tournament.id);
      wx.setStorageSync(storageKeys.selectedDataSelectionsTournamentName, tournament.name);
      this.setData(mapSelectionStats(tournament, this.data.event, stats, this.data.activeTab));
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "阵容选择数据加载失败",
        selectedRows: [],
        captainRows: [],
        transferInRows: [],
        transferOutRows: [],
        visibleRows: []
      });
    } finally {
      this.setData({ loadingStats: false });
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
    this.setData({
      activeTab,
      visibleRows: getRowsForTab(this.data, activeTab)
    });
  },

  onRetry() {
    if (this.data.tournaments.length === 0) {
      this.loadTournaments();
      return;
    }
    this.loadStats();
  }
});

function mapSelectionStats(
  tournament: TournamentOption,
  event: number,
  stats: TournamentSelectionStats | null,
  activeTab: SelectionTab
): Partial<SelectionsData> {
  const selectedRows = mapPercentRows(stats?.mostSelectedPlayers || [], "Selected", "EO");
  const captainRows = mapPercentRows(stats?.captainSelect || [], "Captain", "EO");
  const transferInRows = mapTransferRows(stats?.mostTransferIn || [], "In", "Count");
  const transferOutRows = mapTransferRows(stats?.mostTransferOut || [], "Out", "Count");
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
    visibleRows: getRowsForTab(nextData, activeTab)
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

function mapPercentRows(players: TournamentSelectionPlayer[], primaryLabel: string, secondaryLabel: string): SelectionRow[] {
  return players.map((player, index) => {
    const selectedPercent = safeNumber(player.selectedByPercent);
    const eoPercent = safeNumber(player.eoByPercent);
    return {
      id: `${player.id}-${index}`,
      rank: index + 1,
      name: player.webName,
      meta: compactJoin([player.teamShortName, positionLabel(player.position)]),
      primaryValue: formatPercent(selectedPercent),
      primaryLabel,
      secondaryValue: formatPercent(eoPercent),
      secondaryLabel,
      barStyle: `width: ${Math.min(Math.max(selectedPercent, 0), 100)}%;`
    };
  });
}

function mapTransferRows(players: TournamentSelectionPlayer[], primaryLabel: string, secondaryLabel: string): SelectionRow[] {
  const sorted = [...players].sort((left, right) => safeNumber(right.transfersEvent) - safeNumber(left.transfersEvent));
  const maxTransfers = Math.max(...sorted.map((player) => safeNumber(player.transfersEvent)), 1);

  return sorted.map((player, index) => {
    const transferCount = safeNumber(player.transfersEvent);
    return {
      id: `${player.id}-${index}`,
      rank: index + 1,
      name: player.webName,
      meta: compactJoin([player.teamShortName, positionLabel(player.position)]),
      primaryValue: formatPercent(player.selectedByPercent),
      primaryLabel,
      secondaryValue: String(transferCount),
      secondaryLabel,
      barStyle: `width: ${Math.min(Math.round((transferCount / maxTransfers) * 100), 100)}%;`
    };
  });
}

function positionLabel(position: string): string {
  const normalized = position.toUpperCase();
  const map: Record<string, string> = {
    GOALKEEPER: "GKP",
    DEFENDER: "DEF",
    MIDFIELDER: "MID",
    FORWARD: "FWD"
  };
  return map[normalized] || position;
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
