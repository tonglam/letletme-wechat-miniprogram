import { getEntryEventTransfers } from "../../../services/entry.service";
import { getLivePointsByEntry } from "../../../services/live.service";
import type { LivePlayerRow } from "../../../models/live";
import type { EntryTransfer } from "../../../models/entry";
import { goToEntrySearch } from "../../../utils/navigation";
import { normalizePlayer } from "./player";
import { normalizeTransfer, type TransferRow } from "./transfer";

interface SummaryTile {
  label: string;
  value: string;
}

interface LiveEntryData {
  loading: boolean;
  error: string;
  event: number;
  maxGw: number;
  entryId?: number;
  total: number;
  livePoints: number;
  netPoints: number;
  transferCost: number;
  captainText: string;
  chipText: string;
  playedText: string;
  lastUpdated: string;
  summaryTiles: SummaryTile[];
  starters: LivePlayerRow[];
  bench: LivePlayerRow[];
  managers: LivePlayerRow[];
  transfers: TransferRow[];
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = "-"): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

Page({
  data: {
    loading: false,
    error: "",
    event: 0,
    maxGw: 1,
    entryId: undefined,
    total: 0,
    livePoints: 0,
    netPoints: 0,
    transferCost: 0,
    captainText: "-",
    chipText: "-",
    playedText: "-",
    lastUpdated: "",
    summaryTiles: [],
    starters: [],
    bench: [],
    managers: [],
    transfers: []
  } as LiveEntryData,

  onLoad(options?: Record<string, string | undefined>) {
    const app = getApp<IAppOption>();
    const routeEntry = Number(options?.entry);
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({
      event: currentGw,
      maxGw: currentGw,
      entryId: Number.isFinite(routeEntry) && routeEntry > 0 ? routeEntry : app.globalData.entryId
    });
    this.loadData(false);
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadData(_refreshCache: boolean) {
    const entryId = this.data.entryId;
    if (!entryId) {
      this.setData({ error: "请先选择 FPL 球队" });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const [result, transfers] = await Promise.all([
        getLivePointsByEntry(entryId, this.data.event),
        getEntryEventTransfers(entryId, this.data.event).catch(() => [] as EntryTransfer[])
      ]);
      const players = (result.players || result.pickList || []).map(normalizePlayer);
      const managers = players.filter((player) => numberValue(player.elementType) === 5);
      const fieldPlayers = players.filter((player) => numberValue(player.elementType) !== 5);
      const starters = fieldPlayers.filter((player) => player.pickActive !== false);
      const bench = fieldPlayers.filter((player) => player.pickActive === false);
      const livePoints = numberValue(result.livePoints ?? result.total);
      const total = numberValue(result.liveTotalPoints ?? result.total);
      const netPoints = numberValue(result.liveNetPoints ?? livePoints);
      const transferCost = numberValue(result.transferCost);
      this.setData({
        total,
        livePoints,
        netPoints,
        transferCost,
        captainText: textValue(result.captainName),
        chipText: textValue(result.chip, "无"),
        playedText: `${numberValue(result.played)}/${numberValue(result.played) + numberValue(result.toPlay)}`,
        summaryTiles: [
          { label: "实时得分", value: `${livePoints}` },
          { label: "净得分", value: `${netPoints}` },
          { label: "实时总分", value: `${total}` },
          { label: "剁手", value: `${transferCost}` }
        ],
        starters,
        bench,
        managers,
        transfers: transfers.map(normalizeTransfer),
        lastUpdated: formatTime(new Date())
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "实时球队加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.setData({ event: event.detail.value });
    this.loadData(false);
  },

  onRetry() {
    this.loadData(false);
  },

  onChooseEntry() {
    goToEntrySearch();
  }
});
