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
  /** LIVE/SETTLING banner for the current gameweek; "" otherwise. */
  phaseBanner: "" | "live" | "settling";
}

Page({
  data: {
    loading: false,
    error: "",
    transferError: "",
    emptyState: "",
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
    entryId: undefined,
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
    phaseBanner: ""
  } as EntrySummaryData,

  async onLoad() {
    await this.ensureAppDataReady();
    const app = getApp<IAppOption>();
    if (!getApiSessionToken()) {
      // With no valid session the stored binding is only offline/display
      // fallback: the account may have been relinked, so wait for the
      // refreshed profile before snapshotting the entry. Enter the loading
      // state first so the wait never renders placeholder content.
      this.setData({ loading: true });
      try { await app.authReady; } catch {}
    }
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({
      entryId: app.globalData.entryId,
      event: currentGw,
      maxGw: currentGw
    });
    this.loadData();
  },

  onShow() {
    // Summary data moves slowly; only reload when the cached view is 5min+ old.
    if (this._loadedAt && Date.now() - this._loadedAt >= 5 * 60 * 1000) {
      this.loadData();
    }
  },

  _loadedAt: 0,
  loadRequestId: 0,
  phaseBannerRequestId: 0,

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    if (!app.globalData.gw) {
      await app.initAppData();
    }
  },

  async loadData(forceRefresh = false) {
    const requestId = ++this.loadRequestId;
    if (!this.data.entryId) {
      this.setData({
        loading: false,
        error: "",
        emptyState: "entry",
        emptyEyebrow: "需要球队",
        emptyTitle: "先选择我的球队",
        emptyDescription: "查找球队并设为我的球队后，即可生成每轮总结。",
        emptyActionText: "去选择球队"
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
    try {
      const entryId = this.data.entryId;
      const history = await getEntryTeamStatsHistory(entryId, forceRefresh);
      if (requestId !== this.loadRequestId) return;
      const latestEvent = latestEventId(history.results);
      const selectedEvent = clampEvent(this.data.event, latestEvent);
      let transferError = "";
      const [eventResult, transferHistory] = await Promise.all([
        getEntryTeamStatsEventResult(entryId, selectedEvent, forceRefresh),
        getEntryTeamStatsTransfers(entryId, forceRefresh).catch((error) => {
          transferError = error instanceof Error ? error.message : "转会历史加载失败";
          return [] as EntryGameweekTransfers[];
        })
      ]);
      if (requestId !== this.loadRequestId) return;

      if (!eventResult) {
        this.setData({
          event: selectedEvent,
          maxGw: latestEvent,
          error: "",
          emptyState: "event",
          emptyEyebrow: "本轮待就绪",
          emptyTitle: `GW${selectedEvent} 球队总结还没生成`,
          emptyDescription: "比赛周开始或球队数据完成同步后，这里会显示阵容、转会和得分。",
          emptyActionText: "重新加载"
        });
        return;
      }

      const viewModel = mapApiDataToTeamStats(eventResult, history, transferHistory);
      this.setData({
        ...viewModel,
        event: selectedEvent,
        maxGw: latestEvent,
        transferError,
        emptyState: "",
        hasSquad: viewModel.squadRows.length > 0,
        hasTransfers: viewModel.transferRows.length > 0,
        hasChips: viewModel.chipUsageRows.length > 0 || viewModel.chipCountRows.length > 0,
        hasHistory: viewModel.historyRows.length > 0 || viewModel.seasonHistoryRows.length > 0
      });
      this._loadedAt = Date.now();
    } catch (error) {
      if (requestId === this.loadRequestId) {
        this.setData({ error: error instanceof Error ? error.message : "球队数据加载失败" });
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
    this.setData({ event: event.detail.value, phaseBanner: "" });
    this.loadData();
  },

  onTabTap(event: WechatMiniprogram.TouchEvent) {
    const tab = String(event.currentTarget.dataset.tab || "squad") as EntrySummaryTab;
    this.setActiveTab(tab);
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
    this.loadData();
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
      return;
    }
    this.loadData();
  }
});

function mapApiDataToTeamStats(
  eventResult: EntryEventResult,
  history: EntryHistoryPayload,
  transferHistory: EntryGameweekTransfers[]
): TeamStatsViewModel {
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
    transferRows: mapTransferRows(sortedHistory, transferByEvent),
    chipSummaryStats: [
      { label: "本轮开卡", value: formatChip(eventResult.eventChip) },
      { label: "开卡次数", value: String(chipUsageRows.length) }
    ],
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

function latestEventId(results: EntryHistoryItem[]): number {
  return Math.max(1, ...results.map((item) => item.eventId));
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
