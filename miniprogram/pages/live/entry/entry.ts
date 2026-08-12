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
import { ensureAppContext, getAppContextSnapshot } from "../../../services/app-context.service";
import { PagePerformanceTracker } from "../../../utils/page-performance";
import { observeSoftTimeout } from "../../../utils/page-request";

interface SummaryTile {
  label: string;
  value: string;
}

interface LiveEntryData {
  loading: boolean;
  refreshing: boolean;
  transfersLoading: boolean;
  hasData: boolean;
  noPicks: boolean;
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
    noPicks: false,
    error: "",
    transfersError: "",
    emptyState: false,
    displayState: "fresh",
    viewOnly: false,
    event: 0,
    maxGw: 1,
    entryId: 0,
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
  liveRequestForced: false,
  liveForcedFollowup: null as Promise<void> | null,
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
  perfTracker: undefined as PagePerformanceTracker | undefined,
  loadTransfersAfterLive: false,

  ensureContext(reason: "page-load" | "page-show" | "pull-refresh", forceRefresh = false) {
    return ensureAppContext({ reason, forceRefresh });
  },

  async onLoad(options?: Record<string, string | undefined>) {
    const app = getApp<IAppOption>();
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/entry/entry", "cold-launch");
    const routeEntry = Number(options?.entry);
    const hasRouteEntry = Number.isFinite(routeEntry) && routeEntry > 0;
    // Show the loading state while waiting for shared launch data so a cold
    // open never renders zero scores as if they were loaded content.
    this.setData({ loading: true });
    const context = await this.ensureContext("page-load");
    this.perfTracker.mark("contextReadyAt");
    this.loadedSeason = context.season || undefined;
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
      entryId: hasRouteEntry ? routeEntry : (followedEntry ?? 0),
      // An explicit route entry that is not the followed team is read-only
      // view mode; it never changes the stored follow.
      viewOnly: hasRouteEntry && routeEntry !== followedEntry
    });
    this.initLiveRefresh();
    // onShow can run while initAppData is still pending. Re-arm here once the
    // entry/event context exists so an initial failure still recovers by poll.
    this.liveRefresh?.sync();
    if (!this.data.entryId || currentGw > 0) {
      void this.loadData({ includeTransfers: true });
    } else {
      this.setData({ loading: false, error: "当前赛季暂无实时比赛周" });
      wx.nextTick(() => this.perfTracker?.observePrimary());
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
      this.perfTracker?.disconnect();
      this.perfTracker = new PagePerformanceTracker(this, "pages/live/entry/entry", "warm-enter");
      const app = getApp<IAppOption>();
      try {
        await this.ensureContext("page-show");
        this.perfTracker.mark("contextReadyAt");
      } catch { /* keep the last known event */ }
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
          noPicks: false,
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
    if (resumed && (this.data.hasData || this.data.noPicks || this.data.emptyState)) {
      wx.nextTick(() => this.perfTracker?.observePrimary());
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
    this.perfTracker?.disconnect();
  },

  onUnload() {
    this.pageVisible = false;
    this.liveRefresh?.dispose();
    this.perfTracker?.disconnect();
  },

  async onPullDownRefresh() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/entry/entry", "refresh");
    try {
      await this.ensureContext("pull-refresh");
      this.perfTracker.mark("contextReadyAt");
      await this.retryWithContext({ background: true, includeTransfers: true, forceRefresh: true });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async retryWithContext(options: LiveEntryLoadOptions = {}) {
    // An offseason page has event=0 by design. Refresh the shared event
    // context before retrying so a newly opened GW can be discovered without
    // requiring a hide/resume cycle.
    if (this.data.event === 0) {
      const app = getApp<IAppOption>();
      try { await this.ensureContext("pull-refresh", true); } catch { /* retain the eventless state */ }
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
    const nextEntryId = currentFollowEntryId() ?? 0;
    if (nextEntryId === entryId) return false;

    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.cachedLiveStoredAt = undefined;
    this.liveRequestId += 1;
    this.transfersRequestId += 1;
    this.liveRequest = null;
    this.liveRequestKey = "";
    this.liveRequestForced = false;
    this.liveForcedFollowup = null;
    this.setData({
      entryId: nextEntryId,
      loading: false,
      refreshing: false,
      transfersLoading: false,
      hasData: false,
      noPicks: false,
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
      this.setData({ loading: false, error: "", emptyState: true, noPicks: false }, () => {
        wx.nextTick(() => this.perfTracker?.observePrimary());
      });
      this.syncDisplayState();
      return Promise.resolve();
    }

    const eventId = this.data.event;
    const requestKey = `${entryId}:${eventId}`;
    if (this.liveRequest && this.liveRequestKey === requestKey) {
      if (options.forceRefresh && !this.liveRequestForced) {
        if (this.liveForcedFollowup) return this.liveForcedFollowup;
        const activeRequest = this.liveRequest;
        const followup = activeRequest.then(() => {
          if (entryId !== this.data.entryId || eventId !== this.data.event) return;
          return this.loadData({ ...options, forceRefresh: true });
        });
        this.liveForcedFollowup = followup;
        const clearFollowup = () => {
          if (this.liveForcedFollowup === followup) this.liveForcedFollowup = null;
        };
        void followup.then(clearFollowup, clearFollowup);
        return followup;
      }
      if (options.includeTransfers) this.loadTransfersAfterLive = true;
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
          emptyState: false,
          noPicks: false
        });
    this.loadTransfersAfterLive = options.includeTransfers === true;

    const request = (async () => {
      try {
        this.perfTracker?.mark("primaryRequestStartAt");
        const context = getAppContextSnapshot();
        const liveResult = await getLivePointsByEntrySnapshot(
          entryId,
          eventId,
          options.forceRefresh === true,
          this.perfTracker && context
            ? {
                navigationId: this.perfTracker.navigationId,
                callerSurface: "live-entry",
                trigger: options.forceRefresh ? "refresh" : "load",
                forceReason: options.forceRefresh ? "user-refresh" : undefined,
                contextRevision: context.contextRevision
              }
            : undefined
        );
        if (requestId !== this.liveRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;

        const result = liveResult.data;
        this.perfTracker?.mark("primaryResponseAt");
        if (result.availability === "NO_PICKS") {
          this.liveSnapshot = null;
          this.cachedLiveStoredAt = liveResult.servedStoredAt;
          this.setData({
            hasData: false,
            noPicks: true,
            error: "",
            total: 0,
            livePoints: 0,
            netPoints: 0,
            transferCost: 0,
            summaryTiles: [],
            starters: [],
            bench: [],
            managers: [],
            transfers: [],
            transfersLoading: false,
            transfersError: "",
            lastUpdated: formatTime(new Date(liveResult.servedStoredAt || Date.now()))
          }, () => {
            this.perfTracker?.mark("primarySetDataAt");
            wx.nextTick(() => this.perfTracker?.observePrimary());
          });
          this.liveRefresh?.stop();
          this.loadTransfersAfterLive = false;
          this.syncDisplayState();
          return;
        }
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
          noPicks: false,
          error: "",
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
        }, () => {
          this.perfTracker?.mark("primarySetDataAt");
          wx.nextTick(() => this.perfTracker?.observePrimary());
        });
        this.liveRefresh?.sync();
        if (this.loadTransfersAfterLive) {
          this.loadTransfersAfterLive = false;
          void this.loadTransfers(entryId, eventId, options.forceRefresh === true);
        }
        this.syncDisplayState();
      } catch (error) {
        if (requestId !== this.liveRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;
        this.setData({ error: error instanceof Error ? error.message : "实时球队加载失败" });
        this.loadTransfersAfterLive = false;
        wx.nextTick(() => this.perfTracker?.observePrimary());
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
    this.liveRequestForced = options.forceRefresh === true;
    observeSoftTimeout(request, 3000, () => {
      if (requestId !== this.liveRequestId || !this.pageVisible) return;
      this.perfTracker?.mark("softFailureAt");
      this.setData({ loading: false, refreshing: false, error: "加载时间较长，请稍后重试；当前请求仍在后台继续" });
      this.syncDisplayState();
    });
    const clearRequest = () => {
      if (this.liveRequest === request) {
        this.liveRequest = null;
        this.liveRequestKey = "";
        this.liveRequestForced = false;
        this.revalidateCachedSnapshot();
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
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
    if (!this.data.entryId || this.data.noPicks) return false;
    const currentEventId = Number(getApp<IAppOption>().globalData.gw) || 0;
    return shouldPollLiveSnapshot({
      pageVisible: this.pageVisible,
      currentEventId,
      selectedEventId: this.data.event,
      snapshot: this.liveSnapshot
    });
  },

  revalidateCachedSnapshot(): boolean {
    if (this.data.noPicks) return false;
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
    this.setData({ event: event.detail.value, hasData: false, noPicks: false, lastUpdated: "" });
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
