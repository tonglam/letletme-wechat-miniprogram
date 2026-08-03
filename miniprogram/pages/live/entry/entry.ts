import { getEntryEventTransfers } from "../../../services/entry.service";
import { getLivePointsByEntry } from "../../../services/live.service";
import { getPendingSessionRefresh } from "../../../services/auth.service";
import type { LivePlayerRow } from "../../../models/live";
import type { EntryTransfer } from "../../../models/entry";
import { forceEntryBinding } from "../../../utils/navigation";
import { normalizePlayer } from "./player";
import { normalizeTransfer, type TransferRow } from "./transfer";

interface SummaryTile {
  label: string;
  value: string;
}

interface LiveEntryData {
  loading: boolean;
  error: string;
  transfersError: string;
  emptyState: boolean;
  hasContent: boolean;
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
    transfersError: "",
    emptyState: false,
    hasContent: false,
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

  async onLoad(options?: Record<string, string | undefined>) {
    const app = getApp<IAppOption>();
    const routeEntry = Number(options?.entry);
    const hasRouteEntry = Number.isFinite(routeEntry) && routeEntry > 0;
    // Show the loading state while waiting for shared launch data so a cold
    // open never renders zero scores as if they were loaded content.
    this.setData({ loading: true });
    await app.initAppData();
    if (!app.globalData.entryId && !hasRouteEntry) {
      // No stored binding yet: give the in-flight cold-start login a chance
      // to hydrate the account before falling to the link empty state.
      const pending = getPendingSessionRefresh();
      if (pending) {
        try { await pending; } catch {}
      }
    }
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({
      event: currentGw,
      maxGw: currentGw,
      entryId: hasRouteEntry ? routeEntry : app.globalData.entryId
    });
    this.loadData(false);
  },

  onShow() {
    // Live scores go stale quickly: refresh when returning to the page after
    // 30s+, but keep tab switches within that window instant.
    if (this._loadedAt && Date.now() - this._loadedAt >= 30 * 1000) {
      this.loadData(false);
    }
  },

  _loadedAt: 0,

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadData(forceRefresh: boolean) {
    const entryId = this.data.entryId;
    if (!entryId) {
      this.setData({ loading: false, error: "", emptyState: true });
      return;
    }

    // Stale-while-revalidate: once content exists it stays on screen during
    // refreshes; only the very first load blanks into the loading state.
    this.setData({ loading: true, error: "", transfersError: "", emptyState: false });
    try {
      let transfersError = "";
      const [result, transfers] = await Promise.all([
        getLivePointsByEntry(entryId, this.data.event, forceRefresh),
        getEntryEventTransfers(entryId, this.data.event, forceRefresh).catch((error) => {
          transfersError = error instanceof Error ? error.message : "本周转会加载失败";
          return [] as EntryTransfer[];
        })
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
      // A cache serve keeps its original fetch time: the "updated" label and
      // the onShow refresh clock must reflect the data's real age.
      const fetchedAt = result.servedStoredAt || Date.now();
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
        transfersError,
        lastUpdated: formatTime(new Date(fetchedAt)),
        hasContent: true
      });
      this._loadedAt = fetchedAt;
    } catch (error) {
      const message = error instanceof Error ? error.message : "实时球队加载失败";
      if (this.data.hasContent) {
        // Background refresh failure: keep the stale view, surface a toast.
        wx.showToast({ title: message, icon: "none" });
      } else {
        this.setData({ error: message });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    // New gameweek = new result context: drop the content flag so the old
    // GW's scores cannot linger under the newly selected GW after a failure.
    this.setData({ event: event.detail.value, hasContent: false });
    this.loadData(false);
  },

  onRetry() {
    this.loadData(true);
  },

  onChooseEntry() {
    forceEntryBinding();
  }
});
