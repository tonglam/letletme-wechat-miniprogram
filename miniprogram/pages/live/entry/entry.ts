import { getEntryEventTransfers, getEntryInfo } from "../../../services/entry.service";
import { getLivePointsByEntrySnapshot, getLiveSnapshot } from "../../../services/live.service";
import { getApiSessionToken } from "../../../services/auth.service";
import type { LiveManagerScore, LivePlayerRow, LiveSnapshotStatus } from "../../../models/live";
import type { EntryTransfer } from "../../../models/entry";
import { goToEntrySearch } from "../../../utils/navigation";
import { chipShareLabel, copyShareText, formatLiveEntryShareText } from "../../../utils/live-share";
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
import { miniLogger } from "../../../utils/logger";
import { currentFollowEntryId } from "../../../utils/follow";
import { normalizePlayer } from "./player";
import { buildPlayerLiveDetail, type PlayerLiveDetailView } from "./player-detail";
import { normalizeTransfer, type TransferRow } from "./transfer";
import {
  ensureAppContext,
  getAppContextSnapshot,
  shouldRefreshAppContext,
  type AppContextSnapshot
} from "../../../services/app-context.service";
import { PagePerformanceTracker } from "../../../utils/page-performance";
import { observeSoftTimeout } from "../../../utils/page-request";
import type { PageRequestTrace } from "../../../services/graphql.service";
import {
  buildLiveSquadPitchState,
  type SquadPitchHeader,
  type SquadPitchPlayer
} from "../../../utils/squad-pitch";
import { presentSquadPitchShareImage } from "../../../utils/squad-pitch-canvas";

interface SummaryTile {
  label: string;
  value: string;
}

type LiveEntryEmptyState = "" | "entry" | "preseason";

export function noLiveEventState() {
  return {
    loading: false,
    refreshing: false,
    hasData: false,
    noPicks: false,
    error: "",
    transfersError: "",
    emptyState: "preseason" as const,
    event: 0,
    maxGw: 0,
    scoreState: "UNAVAILABLE",
    scoreStatusText: "官方分数不可用",
    scoreDetailText: "",
    scoreNextRefreshAt: "",
    lastUpdated: "",
    livePointsText: "—",
    totalText: "—"
  };
}

function currentLiveEventId(context?: { currentEvent?: number | null } | null): number {
  if (context && Object.prototype.hasOwnProperty.call(context, "currentEvent")) {
    return Math.max(0, Number(context.currentEvent) || 0);
  }
  const snapshot = getAppContextSnapshot();
  if (snapshot) return Math.max(0, Number(snapshot.currentEvent) || 0);
  return Math.max(0, Number(getApp<IAppOption>().globalData.currentGw) || 0);
}

interface LiveEntryData {
  loading: boolean;
  refreshing: boolean;
  transfersLoading: boolean;
  hasData: boolean;
  noPicks: boolean;
  error: string;
  transfersError: string;
  emptyState: LiveEntryEmptyState;
  displayState: LiveDisplayState;
  viewOnly: boolean;
  event: number;
  maxGw: number;
  entryId?: number;
  entryName: string;
  playerName: string;
  scoreState: string;
  scoreStatusText: string;
  scoreDetailText: string;
  scoreNextRefreshAt: string;
  livePointsText: string;
  totalText: string;
  total: number;
  livePoints: number;
  netPoints: number;
  netPointsKnown: boolean;
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
  playerDetailOpen: boolean;
  playerDetail: PlayerLiveDetailView | null;
  shareLabel: string;
  shareCopied: boolean;
  shareSheetOpen: boolean;
  shareText: string;
  pitchPlayers: SquadPitchPlayer[];
  pitchBench: SquadPitchPlayer[];
  pitchHeader: SquadPitchHeader | null;
  pitchBenchBoost: boolean;
  shareImagePath: string;
  shareBusy: boolean;
}

interface LiveEntryLoadOptions {
  background?: boolean;
  includeTransfers?: boolean;
  forceRefresh?: boolean;
  trackNavigation?: boolean;
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

function managerScoreStatusText(score?: LiveManagerScore): string {
	if (!score || score.state === "UNAVAILABLE") return "官方分数不可用";
	if (score.state === "SETTLING") return "结算中";
	if (score.state === "STALE") return "官方数据延迟";
	return "官方实时";
}

function captainDisplayName(
  players: Array<{ captain?: boolean; multiplier?: number; webName?: string; name?: string }>,
  captainName: unknown
): string {
  const fromSquad = players.find((player) => player.captain || (player.multiplier || 0) >= 2);
  const squadName = fromSquad?.webName || fromSquad?.name;
  if (squadName) return String(squadName);
  const raw = textValue(captainName);
  if (raw === "-") return raw;
  return raw.replace(/\s*[\(（].*$/, "").replace(/\s+[·—-].*$/, "").replace(/\s+\d.*$/, "").trim() || raw;
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
    emptyState: "",
    displayState: "fresh",
    viewOnly: false,
    event: 0,
    maxGw: 0,
    entryId: 0,
    entryName: "",
    playerName: "",
    scoreState: "UNAVAILABLE",
    scoreStatusText: "官方分数不可用",
    scoreDetailText: "",
    scoreNextRefreshAt: "",
    livePointsText: "—",
    totalText: "—",
    total: 0,
    livePoints: 0,
    netPoints: 0,
    netPointsKnown: false,
    transferCost: 0,
    captainText: "-",
    chipText: "无",
    playedText: "-",
    lastUpdated: "",
    summaryTiles: [],
    starters: [],
    bench: [],
    managers: [],
    transfers: [],
    playerDetailOpen: false,
    playerDetail: null,
    shareLabel: "复制分享",
    shareCopied: false,
    shareSheetOpen: false,
    shareText: "",
    pitchPlayers: [],
    pitchBench: [],
    pitchHeader: null,
    pitchBenchBoost: false,
    shareImagePath: "",
    shareBusy: false
  } as LiveEntryData,

  liveRequest: null as Promise<void> | null,
  liveRequestKey: "",
  liveRequestForced: false,
  liveForcedFollowup: null as Promise<void> | null,
  liveForcedFollowupIncludeTransfers: false,
  liveForcedFollowupTrackNavigation: false,
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
  shareCopiedTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  resumeTransfersAfterShow: false,
  resumeLiveAfterShow: false,
  resumeStartupAfterShow: false,
  startupPending: false,
  refreshContextPending: false,
  forcedRefreshPending: false,
  resumeForcedRefreshAfterShow: false,
  routeEntryId: 0,
  hasRouteEntry: false,

  ensureContext(reason: "page-load" | "page-show" | "pull-refresh", forceRefresh = false) {
    return ensureAppContext({ reason, forceRefresh });
  },

  async onLoad(options?: Record<string, string | undefined>) {
    this.pageVisible = true;
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/entry/entry", "cold-launch");
    const routeEntry = Number(options?.entry);
    this.hasRouteEntry = Number.isFinite(routeEntry) && routeEntry > 0;
    this.routeEntryId = this.hasRouteEntry ? routeEntry : 0;
    return this.initializeFromContext("page-load", this.perfTracker);
  },

  async initializeFromContext(
    reason: "page-load" | "page-show",
    tracker: PagePerformanceTracker
  ) {
    const app = getApp<IAppOption>();
    this.startupPending = true;
    // A visible replacement lifecycle now owns recovery; do not let the
    // abandoned pull-refresh keep forcing startup replays on later shows.
    this.refreshContextPending = false;
    // Show the loading state while waiting for shared launch data so a cold
    // open never renders zero scores as if they were loaded content.
    this.setData({ loading: true });
    let context = getAppContextSnapshot();
    try {
      context = await this.ensureContext(reason);
    } catch (error) {
      if (!context) {
        if (this.pageVisible && this.perfTracker === tracker) {
          this.startupPending = false;
          this.showContextError(error);
        }
        return;
      }
    }
    if (!this.pageVisible || this.perfTracker !== tracker) return;
    if (!context) {
      this.startupPending = false;
      this.showContextError(new Error("赛季和比赛轮信息加载失败"));
      return;
    }
    tracker.mark("contextReadyAt");
    this.loadedSeason = context.season || undefined;
    if (!this.hasRouteEntry && !getApiSessionToken()) {
      // With no valid session the stored follow is only offline/display
      // fallback: the account may have been linked to a different entry
      // since, so wait for the refreshed profile to re-assert it (the login
      // may not even have started while the privacy callback is pending).
      try { await app.authReady; } catch {}
    }
    if (!this.pageVisible || this.perfTracker !== tracker) return;
    this.startupPending = false;
    const currentGw = currentLiveEventId(context);
    const followedEntry = app.globalData.entryId;
    const entryId = this.hasRouteEntry ? this.routeEntryId : (followedEntry ?? 0);
    this.setData({
      event: currentGw,
      maxGw: currentGw,
      entryId,
      // An explicit route entry that is not the followed team is read-only
      // view mode; it never changes the stored follow.
      viewOnly: this.hasRouteEntry && this.routeEntryId !== followedEntry
    });
    void this.loadEntryIdentity(entryId);
    this.initLiveRefresh();
    // onShow can run while initAppData is still pending. Re-arm here once the
    // entry/event context exists so an initial failure still recovers by poll.
    this.liveRefresh?.sync();
    if (!this.data.entryId || currentGw > 0) {
      void this.loadData({ includeTransfers: true });
    } else {
      this.liveRefresh?.stop();
      this.setData(noLiveEventState(), () => {
        this.perfTracker?.mark("primarySetDataAt");
        wx.nextTick(() => this.perfTracker?.observePrimary());
      });
    }
    this.syncDisplayState();
  },

  initLiveRefresh() {
    if (this.liveRefresh) return;
    this.liveRefresh = createLiveRefreshController({
      isEligible: () => this.shouldAutoRefresh(),
      getAcceptedSnapshot: () => this.liveSnapshot,
      probe: () => getLiveSnapshot(this.data.event),
      shouldReloadOnUnchangedProbe: () => Boolean(
        this.data.scoreState === "SETTLING" || (
          this.data.scoreNextRefreshAt &&
          Date.parse(this.data.scoreNextRefreshAt) <= Date.now()
        )
      ),
      getNextRefreshAt: () => this.data.scoreNextRefreshAt || null,
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
          isCurrentEvent: this.data.event === currentLiveEventId(),
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
    let showContext = getAppContextSnapshot();
    if (resumed) {
      const resumeForcedRefresh = this.resumeForcedRefreshAfterShow;
      this.resumeForcedRefreshAfterShow = false;
      this.perfTracker?.disconnect();
      this.perfTracker = new PagePerformanceTracker(
        this,
        "pages/live/entry/entry",
        resumeForcedRefresh ? "refresh" : "warm-enter"
      );
      if (resumeForcedRefresh) {
        await this.runForcedRefresh(this.perfTracker);
        return;
      }
      if (this.resumeStartupAfterShow) {
        this.resumeStartupAfterShow = false;
        await this.initializeFromContext("page-show", this.perfTracker);
        return;
      }
      const app = getApp<IAppOption>();
      try {
        showContext = await this.ensureContext("page-show");
        this.perfTracker.mark("contextReadyAt");
      } catch { /* keep the last known event */ }
      if (!this.pageVisible) return;
      if (this.restartForPrincipalChange(this.data.entryId)) return;
      const nextSeason = showContext?.season || app.globalData.season || undefined;
      const seasonChanged = Boolean(this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason);
      if (nextSeason) this.loadedSeason = nextSeason;
      const nextEventId = currentLiveEventId(showContext);
      const wasCurrentEvent = this.data.event === this.data.maxGw;
      const leavingPreseason = nextEventId > 0 && this.data.emptyState === "preseason";
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
          ...(nextEventId > 0
            ? {
                event: nextEventId,
                maxGw: nextEventId,
                hasData: false,
                noPicks: false,
                lastUpdated: "",
                error: "",
                ...(leavingPreseason ? { emptyState: "" as const } : {})
              }
            : noLiveEventState()),
          transfersError: "",
          total: 0,
          livePoints: 0,
          livePointsText: "—",
          totalText: "—",
          netPoints: 0,
          transferCost: 0,
          captainText: "-",
          chipText: "无",
          playedText: "-",
          summaryTiles: [],
          starters: [],
          bench: [],
          managers: [],
          transfers: [],
          ...emptyLiveOverlayState(),
          ...emptyLivePitchState()
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
    if (resumed && this.resumeLiveAfterShow && this.data.entryId && this.data.event > 0) {
      this.resumeLiveAfterShow = false;
      await this.loadData({ includeTransfers: true });
      return;
    }
    this.liveRefresh?.sync();
    if (!this.revalidateCachedSnapshot() && resumed && this.shouldAutoRefresh()) {
      void this.liveRefresh?.probeNow();
    }
    const currentEventId = currentLiveEventId(showContext);
    const resumeTransfers = this.resumeTransfersAfterShow;
    this.resumeTransfersAfterShow = false;
    if (
      resumed
      && this.data.entryId
      && this.data.event > 0
      && (resumeTransfers || (currentEventId > 0 && this.data.event === currentEventId))
    ) {
      // Current-GW transfers churn independently of the score revision.
      // Historical GW only reloads when hide interrupted an in-flight read.
      void this.loadTransfers(this.data.entryId, this.data.event, false);
    }
  },

  onHide() {
    const queuedLiveResume = this.resumeLiveAfterShow;
    this.resumeForcedRefreshAfterShow = this.forcedRefreshPending;
    this.resumeStartupAfterShow = !this.resumeForcedRefreshAfterShow && this.startupPending;
    this.pageVisible = false;
    this.liveRefresh?.stop();
    this.resumeLiveAfterShow = queuedLiveResume || (
      !this.resumeStartupAfterShow
      && !this.resumeForcedRefreshAfterShow
      && this.liveRequest !== null
    );
    this.resumeTransfersAfterShow = this.resumeTransfersAfterShow || this.data.transfersLoading;
    if (this.data.transfersLoading) this.setData({ transfersLoading: false });
    this.liveRequestId += 1;
    this.transfersRequestId += 1;
    this.liveRequest = null;
    this.liveRequestKey = "";
    this.liveRequestForced = false;
    this.liveForcedFollowup = null;
    this.liveForcedFollowupIncludeTransfers = false;
    this.liveForcedFollowupTrackNavigation = false;
    this.loadTransfersAfterLive = false;
    this.perfTracker?.disconnect();
    this.clearShareCopiedTimer();
  },

  onUnload() {
    this.pageVisible = false;
    this.liveRefresh?.dispose();
    this.resumeLiveAfterShow = false;
    this.resumeTransfersAfterShow = false;
    this.resumeStartupAfterShow = false;
    this.resumeForcedRefreshAfterShow = false;
    this.startupPending = false;
    this.refreshContextPending = false;
    this.forcedRefreshPending = false;
    this.liveRequestId += 1;
    this.transfersRequestId += 1;
    this.liveRequest = null;
    this.liveRequestKey = "";
    this.liveRequestForced = false;
    this.liveForcedFollowup = null;
    this.liveForcedFollowupIncludeTransfers = false;
    this.liveForcedFollowupTrackNavigation = false;
    this.loadTransfersAfterLive = false;
    this.perfTracker?.disconnect();
    this.clearShareCopiedTimer();
  },

  async onPullDownRefresh() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/entry/entry", "refresh");
    const tracker = this.perfTracker;
    try {
      await this.runForcedRefresh(tracker);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async runForcedRefresh(tracker: PagePerformanceTracker) {
    this.forcedRefreshPending = true;
    this.refreshContextPending = true;
    try {
      let context = getAppContextSnapshot();
      if (shouldRefreshAppContext(context)) {
        context = await this.ensureContext("pull-refresh", true);
      }
      if (!context) throw new Error("赛季和比赛轮信息加载失败");
      if (!this.pageVisible || this.perfTracker !== tracker) return;
      this.refreshContextPending = false;
      tracker.mark("contextReadyAt");
      await this.retryWithContext({
        background: true,
        includeTransfers: true,
        forceRefresh: true,
        trackNavigation: true
      }, context);
    } catch (error) {
      if (this.pageVisible && this.perfTracker === tracker) {
        this.showContextError(error);
      }
    } finally {
      if (this.pageVisible && this.perfTracker === tracker) {
        this.refreshContextPending = false;
        this.forcedRefreshPending = false;
      }
    }
  },

  showContextError(error: unknown) {
    const message = error instanceof Error ? error.message : "赛季和比赛轮信息加载失败";
    this.setData({
      loading: false,
      refreshing: false,
      error: message,
      ...(this.data.emptyState === "preseason" ? { emptyState: "" as const } : {})
    }, () => {
      this.perfTracker?.mark("primarySetDataAt");
      wx.nextTick(() => this.perfTracker?.observePrimary());
    });
    this.syncDisplayState();
  },

  async retryWithContext(
    options: LiveEntryLoadOptions = {},
    refreshedContext?: AppContextSnapshot
  ) {
    // An offseason page has event=0 by design. Refresh the shared event
    // context before retrying so a newly opened GW can be discovered without
    // requiring a hide/resume cycle.
    if (this.data.event === 0) {
      const app = getApp<IAppOption>();
      let context: AppContextSnapshot;
      try {
        context = refreshedContext ?? await this.ensureContext("pull-refresh", true);
      } catch (error) {
        this.showContextError(error);
        return;
      }
      const nextEventId = currentLiveEventId(context);
      if (nextEventId > 0) {
        this.loadedSeason = context.season || app.globalData.season || this.loadedSeason;
        this.setData({
          event: nextEventId,
          maxGw: nextEventId,
          error: "",
          hasData: false,
          emptyState: ""
        });
        this.initLiveRefresh();
        this.liveRefresh?.sync();
      } else {
        this.liveRefresh?.stop();
        this.setData(noLiveEventState());
        this.syncDisplayState();
        return;
      }
    }
    return this.loadData(options);
  },

  async loadEntryIdentity(entryId: number) {
    if (!entryId) {
      this.setData({ entryName: "", playerName: "" });
      return;
    }
    try {
      const entry = await getEntryInfo(entryId);
      if (this.data.entryId !== entryId) return;
      this.setData({
        entryName: entry.entryName || entry.teamName || "",
        playerName: entry.playerName || ""
      });
    } catch {
      if (this.data.entryId === entryId) this.setData({ entryName: "", playerName: "" });
    }
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
    this.liveForcedFollowupIncludeTransfers = false;
    this.liveForcedFollowupTrackNavigation = false;
    this.setData({
      entryId: nextEntryId,
      entryName: "",
      playerName: "",
      loading: false,
      refreshing: false,
      transfersLoading: false,
      hasData: false,
      noPicks: false,
      error: "",
      transfersError: "",
      emptyState: nextEntryId ? "" : "entry",
      total: 0,
      livePoints: 0,
      livePointsText: "—",
      totalText: "—",
      netPoints: 0,
      transferCost: 0,
      captainText: "-",
      chipText: "无",
      playedText: "-",
      lastUpdated: "",
      summaryTiles: [],
      starters: [],
      bench: [],
      managers: [],
      transfers: [],
      ...emptyLiveOverlayState(),
      ...emptyLivePitchState()
    });
    if (nextEntryId) {
      void this.loadEntryIdentity(nextEntryId);
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
      this.setData({ loading: false, error: "", emptyState: "entry", noPicks: false }, () => {
        wx.nextTick(() => this.perfTracker?.observePrimary());
      });
      this.syncDisplayState();
      return Promise.resolve();
    }

    const eventId = this.data.event;
    if (!eventId) {
      this.liveRefresh?.stop();
      this.setData(noLiveEventState(), () => {
        wx.nextTick(() => this.perfTracker?.observePrimary());
      });
      this.syncDisplayState();
      return Promise.resolve();
    }
    const requestKey = `${entryId}:${eventId}`;
    if (this.liveRequest && this.liveRequestKey === requestKey) {
      if (options.forceRefresh && !this.liveRequestForced) {
        if (this.liveForcedFollowup) {
          if (options.includeTransfers) this.liveForcedFollowupIncludeTransfers = true;
          if (options.trackNavigation) this.liveForcedFollowupTrackNavigation = true;
          return this.liveForcedFollowup;
        }
        const activeRequest = this.liveRequest;
        const followupOwnerId = this.liveRequestId;
        this.liveForcedFollowupIncludeTransfers = options.includeTransfers === true;
        this.liveForcedFollowupTrackNavigation = options.trackNavigation === true;
        const startForcedFollowup = () => {
          if (
            !this.pageVisible
            || followupOwnerId !== this.liveRequestId
            || entryId !== this.data.entryId
            || eventId !== this.data.event
          ) return;
          const includeTransfers = this.liveForcedFollowupIncludeTransfers;
          const trackNavigation = this.liveForcedFollowupTrackNavigation;
          this.liveForcedFollowupIncludeTransfers = false;
          this.liveForcedFollowupTrackNavigation = false;
          return this.loadData({
            ...options,
            includeTransfers,
            trackNavigation,
            forceRefresh: true
          });
        };
        const followup = activeRequest.then(startForcedFollowup, startForcedFollowup);
        this.liveForcedFollowup = followup;
        const clearFollowup = () => {
          if (this.liveForcedFollowup === followup) {
            this.liveForcedFollowup = null;
            this.liveForcedFollowupIncludeTransfers = false;
            this.liveForcedFollowupTrackNavigation = false;
          }
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
    const navigationTracker = options.background === true && options.trackNavigation !== true
      ? undefined
      : this.perfTracker;
    this.setData(background
      ? { refreshing: true, error: "" }
      : {
          loading: true,
          error: "",
          emptyState: "",
          noPicks: false
        });
    this.loadTransfersAfterLive = options.includeTransfers === true;

    const request = (async () => {
      try {
        navigationTracker?.mark("primaryRequestStartAt");
        const context = getAppContextSnapshot();
        const requestTrace = options.background === true && options.trackNavigation !== true
          ? null
          : navigationTracker && context
            ? {
                navigationId: navigationTracker.navigationId,
                callerSurface: "live-entry",
                trigger: options.forceRefresh ? "refresh" as const : "load" as const,
                forceReason: options.forceRefresh ? "user-refresh" as const : undefined,
                contextRevision: context.contextRevision
              }
            : undefined;
        const liveResult = await getLivePointsByEntrySnapshot(
          entryId,
          eventId,
          options.forceRefresh === true,
          requestTrace
        );
        if (!this.pageVisible || requestId !== this.liveRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;

    const result = liveResult.data;
        navigationTracker?.mark("primaryResponseAt");
        if (result.availability === "NO_PICKS") {
          const officialEventPoints = result.score?.eventPoints;
          const headlinePoints = numberValue(officialEventPoints);
          const netPointsKnown = result.score?.netEventPoints != null;
          const netPoints = netPointsKnown
            ? numberValue(result.score?.netEventPoints)
            : 0;
          const total = numberValue(
            result.score?.totalScope === "OVERALL" && result.score.totalPoints != null
              ? result.score.totalPoints
              : 0
          );
          const hasOfficialHeadline = typeof officialEventPoints === "number";
          const livePointsText = hasOfficialHeadline ? `${headlinePoints}` : "—";
          const totalKnown = result.score?.totalScope === "OVERALL"
            && typeof result.score.totalPoints === "number";
          const totalText = totalKnown ? `${total}` : "—";
          // A score-only NO_PICKS response still carries the authoritative
          // player snapshot. Keep it so unchanged probes do not force a full
          // reload forever once the official score has settled.
          this.liveSnapshot = liveResult.snapshot;
          this.cachedLiveStoredAt = liveResult.servedStoredAt;
          this.setData({
            hasData: hasOfficialHeadline,
            noPicks: true,
            entryName: result.entryName || "",
            playerName: result.playerName || "",
            scoreState: result.score?.state || "UNAVAILABLE",
            scoreStatusText: managerScoreStatusText(result.score),
            scoreDetailText: result.score?.reconciliation === "SOURCE_SKEW" ? "明细同步中" : "",
            scoreNextRefreshAt: result.score?.nextRefreshAt || "",
            error: "",
            total,
            livePoints: headlinePoints,
            livePointsText,
            totalText,
            netPoints,
            netPointsKnown,
            transferCost: numberValue(result.score?.transferCost ?? result.transferCost),
            summaryTiles: hasOfficialHeadline
              ? [
                  { label: "实时得分", value: `${headlinePoints}` },
                  { label: netPointsKnown ? "净得分" : "净得分（待确认）", value: netPointsKnown ? `${netPoints}` : "—" },
                  { label: "实时总分", value: totalText }
                ]
              : [],
            starters: [],
            bench: [],
            managers: [],
            transfers: [],
            ...emptyLivePitchState(),
            transfersLoading: false,
            transfersError: "",
            lastUpdated: formatTime(new Date(liveResult.servedStoredAt || Date.now()))
          }, () => {
            navigationTracker?.mark("primarySetDataAt");
            wx.nextTick(() => navigationTracker?.observePrimary());
          });
          if (hasOfficialHeadline || result.score?.state === "SETTLING") {
            this.liveRefresh?.sync();
          } else {
            this.liveRefresh?.stop();
          }
          this.loadTransfersAfterLive = false;
          this.syncDisplayState();
          return;
        }
        const players = (result.players || result.pickList || []).map(normalizePlayer);
        const managers = players.filter((player) => numberValue(player.elementType) === 5);
        const fieldPlayers = players.filter((player) => numberValue(player.elementType) !== 5);
        const starters = fieldPlayers.filter((player) => player.pickActive !== false);
        const bench = fieldPlayers.filter((player) => player.pickActive === false);
        const livePoints = numberValue(result.score?.eventPoints);
        const livePointsKnown = typeof result.score?.eventPoints === "number";
        const total = numberValue(
          result.score?.totalScope === "OVERALL" ? result.score.totalPoints : 0
        );
        const totalKnown = result.score?.totalScope === "OVERALL"
          && typeof result.score.totalPoints === "number";
        const livePointsText = livePointsKnown ? `${livePoints}` : "—";
        const totalText = totalKnown ? `${total}` : "—";
        const netPointsKnown = result.score?.netEventPoints != null;
        const netPoints = netPointsKnown
          ? numberValue(result.score?.netEventPoints)
          : 0;
        const transferCost = numberValue(result.score?.transferCost ?? result.transferCost);
        const fetchedAt = liveResult.servedStoredAt || Date.now();
        this.liveSnapshot = liveResult.snapshot;
        this.cachedLiveStoredAt = liveResult.servedStoredAt;
        this.setData({
          hasData: true,
          noPicks: false,
          scoreState: result.score?.state || "UNAVAILABLE",
          scoreStatusText: managerScoreStatusText(result.score),
          scoreDetailText: result.score?.reconciliation === "SOURCE_SKEW" ? "明细同步中" : "",
          scoreNextRefreshAt: result.score?.nextRefreshAt || "",
          error: "",
          total,
          livePoints,
          livePointsText,
          totalText,
          netPoints,
          netPointsKnown,
          transferCost,
          captainText: captainDisplayName(players, result.captainName),
          chipText: chipShareLabel(textValue(result.chip, "无")),
          playedText: `${numberValue(result.played)}/${numberValue(result.played) + numberValue(result.toPlay)}`,
          summaryTiles: [
            { label: "实时得分", value: livePointsText },
            { label: netPointsKnown ? "净得分" : "净得分（待确认）", value: netPointsKnown ? `${netPoints}` : "—" },
            { label: "实时总分", value: totalText },
            { label: "转会扣分", value: transferCost > 0 ? `-${transferCost}` : "0" }
          ],
          starters,
          bench,
          managers,
          ...livePitchState({
            starters,
            bench,
            eventId,
            teamName: this.data.entryName,
            managerName: this.data.playerName,
            totalPoints: total,
            gameweekPoints: livePoints,
            totalPointsKnown: totalKnown,
            gameweekPointsKnown: livePointsKnown,
            chip: textValue(result.chip, "")
          }),
          lastUpdated: formatTime(new Date(fetchedAt))
        }, () => {
          navigationTracker?.mark("primarySetDataAt");
          wx.nextTick(() => navigationTracker?.observePrimary());
        });
        this.liveRefresh?.sync();
        if (this.pageVisible && requestId === this.liveRequestId && this.loadTransfersAfterLive) {
          this.loadTransfersAfterLive = false;
          await this.loadTransfers(
            entryId,
            eventId,
            options.forceRefresh === true,
            requestTrace
          );
        }
        this.syncDisplayState();
      } catch (error) {
        if (!this.pageVisible || requestId !== this.liveRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;
        this.setData({ error: error instanceof Error ? error.message : "实时球队加载失败" });
        this.loadTransfersAfterLive = false;
        wx.nextTick(() => navigationTracker?.observePrimary());
        this.syncDisplayState();
      } finally {
        if (this.pageVisible && requestId === this.liveRequestId) {
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
      navigationTracker?.mark("softFailureAt");
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

  async loadTransfers(
    entryId: number,
    eventId: number,
    forceRefresh: boolean,
    trace?: PageRequestTrace | null
  ): Promise<void> {
    const requestId = this.transfersRequestId + 1;
    this.transfersRequestId = requestId;
    this.setData({ transfersLoading: true, transfersError: "" });
    try {
      const transfers: EntryTransfer[] = await getEntryEventTransfers(
        entryId,
        eventId,
        forceRefresh,
        trace
      );
      if (
        !this.pageVisible
        || requestId !== this.transfersRequestId
      ) return;
      if (this.restartForPrincipalChange(entryId)) return;
      if (
        entryId !== this.data.entryId
        || eventId !== this.data.event
      ) {
        return;
      }
      this.setData({ transfers: transfers.map(normalizeTransfer), transfersError: "" });
    } catch (error) {
      if (
        !this.pageVisible
        || requestId !== this.transfersRequestId
      ) return;
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
        this.pageVisible
        && requestId === this.transfersRequestId
        && entryId === this.data.entryId
        && eventId === this.data.event
      ) {
        this.setData({ transfersLoading: false });
      }
    }
  },

  shouldAutoRefresh(): boolean {
    if (!this.data.entryId) return false;
    if (
      this.data.noPicks
      && this.data.scoreState !== "SETTLING"
      && (!this.data.hasData || this.data.scoreState === "UNAVAILABLE")
    ) return false;
    const currentEventId = currentLiveEventId();
    return shouldPollLiveSnapshot({
      pageVisible: this.pageVisible,
      currentEventId,
      selectedEventId: this.data.event,
      snapshot: this.liveSnapshot,
      managerScoreState: this.data.scoreState,
      managerNextRefreshAt: this.data.scoreNextRefreshAt
    });
  },

  revalidateCachedSnapshot(): boolean {
    if (this.data.noPicks && (!this.data.hasData || this.data.scoreState === "UNAVAILABLE")) return false;
    const currentEventId = currentLiveEventId();
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
        isCurrentEvent: this.data.event === currentLiveEventId(),
        displayState: next
      });
    }
    this.setData({ displayState: next });
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const nextEventId = Number(event.detail.value);
    if (!Number.isFinite(nextEventId) || nextEventId <= 0) return;
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/entry/entry", "refresh");
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.cachedLiveStoredAt = undefined;
    // Detach both the rendered rows and any in-flight transfer read from the
    // previous GW before the new score response can make the page visible.
    this.transfersRequestId += 1;
    this.loadTransfersAfterLive = false;
    this.liveForcedFollowupIncludeTransfers = false;
    this.setData({
      event: nextEventId,
      hasData: false,
      noPicks: false,
      lastUpdated: "",
      transfers: [],
      transfersLoading: false,
      transfersError: "",
      ...emptyLiveOverlayState()
    });
    // The new current-event context must own a timer before its first request:
    // a failed request has no snapshot metadata yet but still needs recovery.
    this.liveRefresh?.sync();
    this.loadData({ includeTransfers: true });
    this.syncDisplayState();
  },

  onRetry() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/entry/entry", "refresh");
    void this.runForcedRefresh(this.perfTracker);
  },

  onChooseEntry() {
    goToEntrySearch();
  },

  onOpenPlayer(event: WechatMiniprogram.CustomEvent<{ player: LivePlayerRow }>) {
    const player = event.detail.player;
    if (!player) return;
    this.setData({
      playerDetailOpen: true,
      playerDetail: buildPlayerLiveDetail(player)
    });
  },

  onPitchPlayerTap(event: WechatMiniprogram.CustomEvent<{ playerId: string }>) {
    const playerId = String(event.detail?.playerId || "");
    if (!playerId) return;
    const player = findLivePlayerForPitch(this.data.starters, this.data.bench, playerId);
    if (!player) return;
    this.setData({
      playerDetailOpen: true,
      playerDetail: buildPlayerLiveDetail(player)
    });
  },

  onClosePlayer() {
    this.setData({
      playerDetailOpen: false
    });
  },

  async onSharePitch() {
    if (this.data.shareBusy) return;
    const pitch = this.selectComponent("#live-squad-pitch") as WechatMiniprogram.Component.TrivialInstance & {
      exportShareImage?: () => Promise<string>;
    } | null;
    if (!pitch?.exportShareImage) {
      wx.showToast({ title: "阵容图还没准备好", icon: "none" });
      return;
    }
    this.setData({ shareBusy: true });
    try {
      const path = await pitch.exportShareImage();
      this.setData({ shareImagePath: path });
      await presentSquadPitchShareImage(path);
    } catch {
      wx.showToast({ title: "阵容图生成失败", icon: "none" });
    } finally {
      this.setData({ shareBusy: false });
    }
  },

  onShareAppMessage() {
    const teamName = this.data.pitchHeader?.teamName || this.data.entryName || "实时球队";
    return {
      title: `${teamName} · GW${this.data.event} · ${this.data.livePointsText}分`,
      path: this.data.entryId ? `/pages/live/entry/entry?entry=${this.data.entryId}` : "/pages/live/entry/entry",
      imageUrl: this.data.shareImagePath || undefined
    };
  },

  clearShareCopiedTimer() {
    if (this.shareCopiedTimer) {
      clearTimeout(this.shareCopiedTimer);
      this.shareCopiedTimer = undefined;
    }
  },

  onCopyShare() {
    try {
      if (!this.data.hasData) {
        wx.showToast({ title: "还没有可分享的阵容", icon: "none" });
        return;
      }
      const text = formatLiveEntryShareText({
        gameweek: this.data.event,
        entryId: this.data.entryId,
        entryName: this.data.entryName,
        playerName: this.data.playerName,
        livePoints: this.data.livePointsText,
        netPoints: this.data.netPoints,
        totalPoints: this.data.totalText,
        transferCost: this.data.transferCost,
        chip: this.data.chipText,
        captainName: this.data.captainText,
        starters: this.data.starters || [],
        bench: this.data.bench || []
      });
      void copyShareText(text).then((ok) => {
        if (ok) {
          this.setData({ shareCopied: true, shareSheetOpen: false });
          this.clearShareCopiedTimer();
          this.shareCopiedTimer = setTimeout(() => this.setData({ shareCopied: false }), 2000);
          return;
        }
        this.setData({ shareSheetOpen: true, shareText: text });
      });
    } catch (error) {
      miniLogger.error("copy-share.entry", error instanceof Error ? error.message : "failed");
      wx.showToast({ title: "复制失败", icon: "none" });
    }
  },

  onCloseShareSheet() {
    this.setData({ shareSheetOpen: false });
  }
});

function emptyLiveOverlayState(): {
  playerDetailOpen: false;
  playerDetail: null;
  shareSheetOpen: false;
  shareText: "";
} {
  return {
    playerDetailOpen: false,
    playerDetail: null,
    shareSheetOpen: false,
    shareText: ""
  };
}

function emptyLivePitchState(): {
  pitchPlayers: SquadPitchPlayer[];
  pitchBench: SquadPitchPlayer[];
  pitchHeader: SquadPitchHeader | null;
  pitchBenchBoost: boolean;
} {
  return {
    pitchPlayers: [],
    pitchBench: [],
    pitchHeader: null,
    pitchBenchBoost: false
  };
}

function livePitchState(input: Parameters<typeof buildLiveSquadPitchState>[0]) {
  return buildLiveSquadPitchState(input);
}

function findLivePlayerForPitch(
  starters: LivePlayerRow[],
  bench: LivePlayerRow[],
  playerId: string
): LivePlayerRow | undefined {
  return [...starters, ...bench].find((player) => {
    const elementId = player.element != null ? String(player.element) : "";
    const name = String(player.webName || player.name || "");
    return elementId === playerId || name === playerId;
  });
}
