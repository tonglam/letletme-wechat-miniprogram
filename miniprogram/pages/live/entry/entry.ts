import { getEntryEventTransfers } from "../../../services/entry.service";
import { getLivePointsByEntrySnapshot, getLiveSnapshot } from "../../../services/live.service";
import { getApiSessionToken } from "../../../services/auth.service";
import type { LivePlayerRow, LiveSnapshotStatus } from "../../../models/live";
import type { EntryTransfer } from "../../../models/entry";
import { goToEntrySearch } from "../../../utils/navigation";
import {
  shouldRevalidateCachedLiveSnapshot,
  shouldPollLiveSnapshot
} from "../../../utils/live-refresh";
import {
  createLiveRefreshController,
  type LiveRefreshController
} from "../../../utils/live-refresh-controller";
import { subscribeNetworkStatus } from "../../../utils/live-network";
import {
  normalizeLiveDisplayState,
  type LiveDisplayState
} from "../../../utils/live-status";
import { durationBucket, recordLiveTransition } from "../../../utils/perf";
import { currentFollowEntryId } from "../../../utils/follow";
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
  displayState: LiveDisplayState;
  viewOnly: boolean;
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
    displayState: "fresh",
    viewOnly: false,
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

  liveRequest: null as Promise<void> | null,
  liveRequestKey: "",
  liveRequestId: 0,
  transfersRequestId: 0,
  liveSnapshot: null as LiveSnapshotStatus | null,
  cachedLiveStoredAt: undefined as number | undefined,
  liveRefresh: null as LiveRefreshController | null,
  probing: false,
  networkOnline: true,
  pageVisible: false,
  hasShown: false,
  loadedSeason: undefined as string | undefined,

  async onLoad(options?: Record<string, string | undefined>) {
    const app = getApp<IAppOption>();
    const routeEntry = Number(options?.entry);
    const hasRouteEntry = Number.isFinite(routeEntry) && routeEntry > 0;
    // Show the loading state while waiting for shared launch data so a cold
    // open never renders zero scores as if they were loaded content.
    this.setData({ loading: true });
    await app.initAppData();
    this.loadedSeason = app.globalData.season || undefined;
    if (!hasRouteEntry && !getApiSessionToken()) {
      // With no valid session the stored follow is only offline/display
      // fallback: the account may have been linked to a different entry
      // since, so wait for the refreshed profile to re-assert it (the login
      // may not even have started while the privacy callback is pending).
      try { await app.authReady; } catch {}
    }
    const currentGw = Math.max(0, Number(app.globalData.gw) || 0);
    const followedEntry = app.globalData.entryId;
    this.setData({
      event: currentGw,
      maxGw: currentGw,
      entryId: hasRouteEntry ? routeEntry : followedEntry,
      // An explicit route entry that is not the followed team is read-only
      // view mode; it never changes the stored follow.
      viewOnly: hasRouteEntry && routeEntry !== followedEntry
    });
    this.initLiveRefresh();
    // onShow can run while initAppData is still pending. Re-arm here once the
    // entry/event context exists so an initial failure still recovers by poll.
    this.liveRefresh?.sync();
    if (!this.data.entryId || currentGw > 0) {
      this.loadData({ includeTransfers: true });
    } else {
      this.setData({ loading: false, error: "当前赛季暂无实时比赛周" });
    }
    this.syncDisplayState();
  },

  initLiveRefresh() {
    if (this.liveRefresh) return;
    this.liveRefresh = createLiveRefreshController({
      isEligible: () => this.shouldAutoRefresh(),
      getAcceptedSnapshot: () => this.liveSnapshot,
      probe: () => getLiveSnapshot(this.data.event),
      reload: () => this.loadData({ background: true, forceRefresh: true }),
      acceptSnapshot: (snapshot) => {
        this.liveSnapshot = snapshot;
        this.setData({
          error: "",
          ...(snapshot?.checkedAt ? { lastUpdated: formatTime(new Date(snapshot.checkedAt)) } : {})
        });
        this.syncDisplayState();
      },
      onProbeError: (message) => {
        this.setData({ error: message });
        this.syncDisplayState();
      },
      onProbeChange: (probing) => {
        this.probing = probing;
        this.syncDisplayState();
      },
      onOnlineChange: (online) => {
        this.networkOnline = online;
        this.syncDisplayState();
      },
      onProbeSettled: (info) => {
        recordLiveTransition({
          surface: "entry",
          season: this.liveSnapshot?.season,
          eventId: this.data.event,
          isCurrentEvent: this.data.event === Number(getApp<IAppOption>().globalData.gw),
          snapshotState: info.snapshotState,
          revisionChanged: info.revisionChanged,
          coverageFailed: this.liveSnapshot?.coverageFailed,
          probeDurationBucket: durationBucket(info.probeDurationMs),
          fullFetchDurationBucket: info.reloadDurationMs === undefined ? undefined : durationBucket(info.reloadDurationMs)
        });
      },
      subscribeNetwork: subscribeNetworkStatus
    });
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed) {
      const app = getApp<IAppOption>();
      try { await app.initAppData(false); } catch { /* keep the last known event */ }
      if (!this.pageVisible) return;
      if (this.restartForPrincipalChange(this.data.entryId)) return;
      const nextSeason = app.globalData.season || undefined;
      const seasonChanged = Boolean(this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason);
      if (nextSeason) this.loadedSeason = nextSeason;
      const nextEventId = Number(app.globalData.gw) || 0;
      const wasCurrentEvent = this.data.event === this.data.maxGw;
      const eventContextChanged = seasonChanged || (nextEventId > 0 && nextEventId !== this.data.maxGw);
      if (eventContextChanged && (seasonChanged || wasCurrentEvent)) {
        this.liveRefresh?.stop();
        this.liveSnapshot = null;
        this.cachedLiveStoredAt = undefined;
        if (seasonChanged) {
          // A new season can reuse the same numeric GW, so entry:event is
          // not enough to distinguish pending score/transfer work. Detach
          // the previous season before the forced replacement request.
          this.liveRequestId += 1;
          this.transfersRequestId += 1;
          this.liveRequest = null;
          this.liveRequestKey = "";
        }
        this.setData({
          event: nextEventId,
          maxGw: nextEventId,
          hasData: false,
          lastUpdated: "",
          error: nextEventId > 0 ? "" : "当前赛季暂无实时比赛周",
          transfersError: "",
          total: 0,
          livePoints: 0,
          netPoints: 0,
          transferCost: 0,
          captainText: "-",
          chipText: "-",
          playedText: "-",
          summaryTiles: [],
          starters: [],
          bench: [],
          managers: [],
          transfers: []
        });
        this.liveRefresh?.sync();
        if (nextEventId > 0) {
          await this.loadData({ includeTransfers: true, forceRefresh: true });
        }
        this.syncDisplayState();
        return;
      }
      if (nextEventId > 0 && nextEventId !== this.data.maxGw) {
        this.setData({ maxGw: nextEventId });
      }
    }
    this.liveRefresh?.sync();
    if (!this.revalidateCachedSnapshot() && resumed && this.shouldAutoRefresh()) {
      void this.liveRefresh?.probeNow();
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
    this.liveRefresh?.stop();
  },

  onUnload() {
    this.pageVisible = false;
    this.liveRefresh?.dispose();
  },

  onPullDownRefresh() {
    this.retryWithContext({ background: true, includeTransfers: true, forceRefresh: true })
      .finally(() => wx.stopPullDownRefresh());
  },

  async retryWithContext(options: LiveEntryLoadOptions = {}) {
    // An offseason page has event=0 by design. Refresh the shared event
    // context before retrying so a newly opened GW can be discovered without
    // requiring a hide/resume cycle.
    if (this.data.event === 0) {
      const app = getApp<IAppOption>();
      try { await app.initAppData(true); } catch { /* retain the eventless state */ }
      const nextEventId = Number(app.globalData.gw) || 0;
      if (nextEventId > 0) {
        this.loadedSeason = app.globalData.season || this.loadedSeason;
        this.setData({ event: nextEventId, maxGw: nextEventId, error: "", hasData: false });
        this.liveRefresh?.sync();
      } else {
        this.setData({ error: "当前赛季暂无实时比赛周" });
        this.syncDisplayState();
        return;
      }
    }
    return this.loadData(options);
  },

  restartForPrincipalChange(entryId: number | undefined): boolean {
    // An explicit non-followed route entry is a stable read-only view. The
    // normal personal surface, however, must track the authoritative follow
    // even when a request's 401 recovery changes it mid-flight.
    if (this.data.viewOnly) return false;
    const nextEntryId = currentFollowEntryId();
    if (nextEntryId === entryId) return false;

    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.cachedLiveStoredAt = undefined;
    this.liveRequestId += 1;
    this.transfersRequestId += 1;
    this.liveRequest = null;
    this.liveRequestKey = "";
    this.setData({
      entryId: nextEntryId,
      loading: false,
      refreshing: false,
      transfersLoading: false,
      hasData: false,
      error: "",
      transfersError: "",
      emptyState: !nextEntryId,
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
    });
    if (nextEntryId) {
      this.liveRefresh?.sync();
      void this.loadData({ includeTransfers: true, forceRefresh: true });
    }
    this.syncDisplayState();
    return true;
  },

  loadData(options: LiveEntryLoadOptions = {}): Promise<void> {
    const entryId = this.data.entryId;
    if (this.restartForPrincipalChange(entryId)) {
      return Promise.resolve();
    }
    if (!entryId) {
      this.setData({ loading: false, error: "", emptyState: true });
      this.syncDisplayState();
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
        if (this.restartForPrincipalChange(entryId)) return;

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
        this.liveRefresh?.sync();
        this.syncDisplayState();
      } catch (error) {
        if (requestId !== this.liveRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;
        this.setData({ error: error instanceof Error ? error.message : "实时球队加载失败" });
        this.syncDisplayState();
      } finally {
        if (requestId === this.liveRequestId) {
          this.setData({ loading: false, refreshing: false });
          this.syncDisplayState();
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
      if (requestId !== this.transfersRequestId) return;
      if (this.restartForPrincipalChange(entryId)) return;
      if (
        entryId !== this.data.entryId
        || eventId !== this.data.event
      ) {
        return;
      }
      this.setData({ transfers: transfers.map(normalizeTransfer), transfersError: "" });
    } catch (error) {
      if (requestId !== this.transfersRequestId) return;
      if (this.restartForPrincipalChange(entryId)) return;
      if (
        entryId !== this.data.entryId
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
    void this.liveRefresh?.probeNow();
    return true;
  },

  syncDisplayState() {
    const next = normalizeLiveDisplayState({
      snapshot: this.liveSnapshot,
      hasData: this.data.hasData,
      loading: this.data.loading || this.data.refreshing,
      probing: this.probing,
      lastError: this.data.error,
      online: this.networkOnline
    });
    if (next !== this.data.displayState) {
      recordLiveTransition({
        surface: "entry",
        season: this.liveSnapshot?.season,
        eventId: this.data.event,
        isCurrentEvent: this.data.event === Number(getApp<IAppOption>().globalData.gw),
        displayState: next
      });
    }
    this.setData({ displayState: next });
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.cachedLiveStoredAt = undefined;
    this.setData({ event: event.detail.value, hasData: false, lastUpdated: "" });
    // The new current-event context must own a timer before its first request:
    // a failed request has no snapshot metadata yet but still needs recovery.
    this.liveRefresh?.sync();
    this.loadData({ includeTransfers: true });
    this.syncDisplayState();
  },

  onRetry() {
    this.retryWithContext({ includeTransfers: true, forceRefresh: true });
  },

  onChooseEntry() {
    goToEntrySearch();
  }
});
