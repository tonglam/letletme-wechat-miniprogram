import { getEntryEventTransfers } from "../../../services/entry.service";
import { getLivePointsByEntrySnapshot, getLiveSnapshot } from "../../../services/live.service";
import { getApiSessionToken } from "../../../services/auth.service";
import type { LivePlayerRow, LiveSnapshotStatus } from "../../../models/live";
import type { EntryTransfer } from "../../../models/entry";
import { goToEntrySearch } from "../../../utils/navigation";
import {
  LIVE_REFRESH_INTERVAL_MS,
  liveSnapshotNeedsRefresh,
  shouldRevalidateCachedLiveSnapshot,
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
  transfersLoading: boolean;
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
  forceRefresh?: boolean;
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
    transfersLoading: false,
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
  transfersRequestId: 0,
  freshnessRequest: null as Promise<void> | null,
  freshnessRequestId: 0,
  liveSnapshot: null as LiveSnapshotStatus | null,
  cachedLiveStoredAt: undefined as number | undefined,
  pageVisible: false,
  hasShown: false,

  async onLoad(options?: Record<string, string | undefined>) {
    const app = getApp<IAppOption>();
    const routeEntry = Number(options?.entry);
    const hasRouteEntry = Number.isFinite(routeEntry) && routeEntry > 0;
    // Show the loading state while waiting for shared launch data so a cold
    // open never renders zero scores as if they were loaded content.
    this.setData({ loading: true });
    await app.initAppData();
    if (!hasRouteEntry && !getApiSessionToken()) {
      // With no valid session the stored binding is only offline/display
      // fallback: the account may have been relinked to a different entry
      // since, so wait for the refreshed profile to re-assert it (the login
      // may not even have started while the privacy callback is pending).
      try { await app.authReady; } catch {}
    }
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({
      event: currentGw,
      maxGw: currentGw,
      entryId: hasRouteEntry ? routeEntry : app.globalData.entryId
    });
    // onShow can run while initAppData is still pending. Re-arm here once the
    // entry/event context exists so an initial failure still recovers by poll.
    this.syncAutoRefresh();
    this.loadData({ includeTransfers: true });
  },

  onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    this.syncAutoRefresh();
    if (!this.revalidateCachedSnapshot() && resumed && this.shouldAutoRefresh()) {
      this.refreshIfChanged();
    }
    const currentEventId = Number(getApp<IAppOption>().globalData.gw) || 0;
    if (
      resumed
      && this.data.entryId
      && currentEventId > 0
      && this.data.event === currentEventId
    ) {
      // Transfers follow their own 30-second cache policy and can change while
      // the score revision does not. Revalidate them independently on resume;
      // the service cache makes a fresh view a memory-only read.
      void this.loadTransfers(this.data.entryId, this.data.event, false);
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
    this.loadData({ background: true, includeTransfers: true, forceRefresh: true })
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
      // A pull-to-refresh can overlap an automatic score request. Reuse that
      // score request, but still refresh and await the independent transfer
      // panel for callers (such as pull-to-refresh) that requested it.
      const transfersRequest = options.includeTransfers
        ? this.loadTransfers(entryId, eventId, options.forceRefresh === true)
        : null;
      return transfersRequest
        ? Promise.all([this.liveRequest, transfersRequest]).then(() => undefined)
        : this.liveRequest;
    }

    const requestId = this.liveRequestId + 1;
    this.liveRequestId = requestId;
    const background = options.background === true && this.data.hasData;
    this.setData(background
      ? { refreshing: true, error: "" }
      : {
          loading: true,
          error: "",
          ...(options.includeTransfers ? { transfers: [], transfersError: "" } : {}),
          emptyState: false
        });

    const transfersRequest = options.includeTransfers
      ? this.loadTransfers(entryId, eventId, options.forceRefresh === true)
      : null;

    const request = (async () => {
      try {
        const liveResult = await getLivePointsByEntrySnapshot(
          entryId,
          eventId,
          options.forceRefresh === true
        );
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
        const fetchedAt = liveResult.servedStoredAt || Date.now();
        this.liveSnapshot = liveResult.snapshot;
        this.cachedLiveStoredAt = liveResult.servedStoredAt;
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
          lastUpdated: formatTime(new Date(fetchedAt))
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
        this.revalidateCachedSnapshot();
      }
    });
    return transfersRequest
      ? Promise.all([request, transfersRequest]).then(() => undefined)
      : request;
  },

  async loadTransfers(entryId: number, eventId: number, forceRefresh: boolean): Promise<void> {
    const requestId = this.transfersRequestId + 1;
    this.transfersRequestId = requestId;
    this.setData({ transfersLoading: true, transfersError: "" });
    try {
      const transfers: EntryTransfer[] = await getEntryEventTransfers(entryId, eventId, forceRefresh);
      if (
        requestId !== this.transfersRequestId
        || entryId !== this.data.entryId
        || eventId !== this.data.event
      ) {
        return;
      }
      this.setData({ transfers: transfers.map(normalizeTransfer), transfersError: "" });
    } catch (error) {
      if (
        requestId !== this.transfersRequestId
        || entryId !== this.data.entryId
        || eventId !== this.data.event
      ) {
        return;
      }
      this.setData({
        transfersError: error instanceof Error ? error.message : "本周转会加载失败"
      });
    } finally {
      if (
        requestId === this.transfersRequestId
        && entryId === this.data.entryId
        && eventId === this.data.event
      ) {
        this.setData({ transfersLoading: false });
      }
    }
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

  revalidateCachedSnapshot(): boolean {
    const currentEventId = Number(getApp<IAppOption>().globalData.gw) || 0;
    if (!shouldRevalidateCachedLiveSnapshot({
      servedStoredAt: this.cachedLiveStoredAt,
      pageVisible: this.pageVisible,
      currentEventId,
      selectedEventId: this.data.event,
      snapshot: this.liveSnapshot
    })) {
      return false;
    }
    // Consume this signal before starting the metadata request so onShow and
    // request cleanup cannot launch duplicate stale-while-revalidate checks.
    this.cachedLiveStoredAt = undefined;
    void this.refreshIfChanged();
    return true;
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
        await this.loadData({ background: true, forceRefresh: true });
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
    this.cachedLiveStoredAt = undefined;
    this.stopAutoRefresh();
    this.setData({ event: event.detail.value, hasData: false, lastUpdated: "" });
    // The new current-event context must own a timer before its first request:
    // a failed request has no snapshot metadata yet but still needs recovery.
    this.syncAutoRefresh();
    this.loadData({ includeTransfers: true });
  },

  onRetry() {
    this.loadData({ includeTransfers: true, forceRefresh: true });
  },

  onChooseEntry() {
    goToEntrySearch();
  }
});
