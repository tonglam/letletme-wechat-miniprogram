import { getEntryEventTransfers } from "../../../services/entry.service";
import { getLivePointsByEntrySnapshot, getLiveSnapshot } from "../../../services/live.service";
import type { LivePlayerRow, LiveSnapshotStatus } from "../../../models/live";
import type { EntryTransfer } from "../../../models/entry";
import { forceEntryBinding } from "../../../utils/navigation";
import {
  LIVE_REFRESH_INTERVAL_MS,
  liveSnapshotNeedsRefresh,
  shouldPollLiveSnapshot
} from "../../../utils/live-refresh";
import { normalizePlayer } from "./player";
import { normalizeTransfer, type TransferRow } from "./transfer";

interface SummaryTile {
  label: string;
  value: string;
}

interface LiveEntryData {
  loading: boolean;
  refreshing: boolean;
  hasData: boolean;
  error: string;
  transfersError: string;
  emptyState: boolean;
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

interface LiveEntryLoadOptions {
  background?: boolean;
  includeTransfers?: boolean;
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
    refreshing: false,
    hasData: false,
    error: "",
    transfersError: "",
    emptyState: false,
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

  autoRefreshTimer: undefined as number | undefined,
  liveRequest: null as Promise<void> | null,
  liveRequestKey: "",
  liveRequestId: 0,
  freshnessRequest: null as Promise<void> | null,
  freshnessRequestId: 0,
  liveSnapshot: null as LiveSnapshotStatus | null,
  pageVisible: false,
  hasShown: false,

  onLoad(options?: Record<string, string | undefined>) {
    const app = getApp<IAppOption>();
    const routeEntry = Number(options?.entry);
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({
      event: currentGw,
      maxGw: currentGw,
      entryId: Number.isFinite(routeEntry) && routeEntry > 0 ? routeEntry : app.globalData.entryId
    });
    this.loadData({ includeTransfers: true });
  },

  onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    this.syncAutoRefresh();
    if (resumed && this.shouldAutoRefresh()) {
      this.refreshIfChanged();
    }
  },

  onHide() {
    this.pageVisible = false;
    this.stopAutoRefresh();
    this.cancelFreshnessCheck();
  },

  onUnload() {
    this.pageVisible = false;
    this.stopAutoRefresh();
    this.cancelFreshnessCheck();
  },

  onPullDownRefresh() {
    this.loadData({ background: true, includeTransfers: true })
      .finally(() => wx.stopPullDownRefresh());
  },

  loadData(options: LiveEntryLoadOptions = {}): Promise<void> {
    const entryId = this.data.entryId;
    if (!entryId) {
      this.setData({ loading: false, error: "", emptyState: true });
      return Promise.resolve();
    }

    const eventId = this.data.event;
    const requestKey = `${entryId}:${eventId}`;
    if (this.liveRequest && this.liveRequestKey === requestKey) {
      return this.liveRequest;
    }

    const requestId = this.liveRequestId + 1;
    this.liveRequestId = requestId;
    const background = options.background === true && this.data.hasData;
    this.setData(background
      ? { refreshing: true, error: "" }
      : {
          loading: true,
          error: "",
          ...(options.includeTransfers ? { transfersError: "" } : {}),
          emptyState: false
        });

    const request = (async () => {
      try {
        let transfersError = "";
        const [liveResult, transfers] = await Promise.all([
          getLivePointsByEntrySnapshot(entryId, eventId),
          options.includeTransfers
            ? getEntryEventTransfers(entryId, eventId).catch((error) => {
                transfersError = error instanceof Error ? error.message : "本周转会加载失败";
                return [] as EntryTransfer[];
              })
            : Promise.resolve<EntryTransfer[] | null>(null)
        ]);
        if (requestId !== this.liveRequestId) return;

        const result = liveResult.data;
        const players = (result.players || result.pickList || []).map(normalizePlayer);
        const managers = players.filter((player) => numberValue(player.elementType) === 5);
        const fieldPlayers = players.filter((player) => numberValue(player.elementType) !== 5);
        const starters = fieldPlayers.filter((player) => player.pickActive !== false);
        const bench = fieldPlayers.filter((player) => player.pickActive === false);
        const livePoints = numberValue(result.livePoints ?? result.total);
        const total = numberValue(result.liveTotalPoints ?? result.total);
        const netPoints = numberValue(result.liveNetPoints ?? livePoints);
        const transferCost = numberValue(result.transferCost);
        this.liveSnapshot = liveResult.snapshot;
        this.setData({
          hasData: true,
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
          ...(transfers === null ? {} : { transfers: transfers.map(normalizeTransfer) }),
          ...(transfers === null ? {} : { transfersError }),
          lastUpdated: formatTime(new Date())
        });
        this.syncAutoRefresh();
      } catch (error) {
        if (requestId !== this.liveRequestId) return;
        this.setData({ error: error instanceof Error ? error.message : "实时球队加载失败" });
      } finally {
        if (requestId === this.liveRequestId) {
          this.setData({ loading: false, refreshing: false });
        }
      }
    })();

    this.liveRequest = request;
    this.liveRequestKey = requestKey;
    void request.finally(() => {
      if (this.liveRequest === request) {
        this.liveRequest = null;
        this.liveRequestKey = "";
      }
    });
    return request;
  },

  shouldAutoRefresh(): boolean {
    if (!this.data.entryId) return false;
    const currentEventId = Number(getApp<IAppOption>().globalData.gw) || 0;
    return shouldPollLiveSnapshot({
      pageVisible: this.pageVisible,
      currentEventId,
      selectedEventId: this.data.event,
      snapshot: this.liveSnapshot
    });
  },

  refreshIfChanged(): Promise<void> {
    if (!this.shouldAutoRefresh()) return Promise.resolve();
    if (this.freshnessRequest) return this.freshnessRequest;

    const requestId = this.freshnessRequestId + 1;
    this.freshnessRequestId = requestId;
    const eventId = this.data.event;
    const liveRequestId = this.liveRequestId;
    const request = (async () => {
      try {
        const observed = await getLiveSnapshot(eventId);
        if (requestId !== this.freshnessRequestId || liveRequestId !== this.liveRequestId) return;
        if (!liveSnapshotNeedsRefresh(this.liveSnapshot, observed)) {
          this.liveSnapshot = observed;
          this.setData({ error: "" });
          this.syncAutoRefresh();
          return;
        }
        await this.loadData({ background: true });
      } catch (error) {
        if (requestId !== this.freshnessRequestId || liveRequestId !== this.liveRequestId) return;
        this.setData({ error: error instanceof Error ? error.message : "实时球队刷新失败" });
      }
    })();

    this.freshnessRequest = request;
    void request.finally(() => {
      if (this.freshnessRequest === request) {
        this.freshnessRequest = null;
      }
    });
    return request;
  },

  syncAutoRefresh() {
    this.stopAutoRefresh();
    if (!this.shouldAutoRefresh()) return;
    this.autoRefreshTimer = setInterval(() => {
      this.refreshIfChanged();
    }, LIVE_REFRESH_INTERVAL_MS) as unknown as number;
  },

  stopAutoRefresh() {
    if (this.autoRefreshTimer !== undefined) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = undefined;
    }
  },

  cancelFreshnessCheck() {
    this.freshnessRequestId += 1;
    this.freshnessRequest = null;
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.cancelFreshnessCheck();
    this.liveSnapshot = null;
    this.stopAutoRefresh();
    this.setData({ event: event.detail.value, hasData: false, lastUpdated: "" });
    this.loadData({ includeTransfers: true });
  },

  onRetry() {
    this.loadData({ includeTransfers: true });
  },

  onChooseEntry() {
    forceEntryBinding();
  }
});
