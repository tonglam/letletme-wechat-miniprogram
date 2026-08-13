import { getLiveMatchByStatusSnapshot, getLiveSnapshot } from "../../../services/live.service";
import type { LiveMatch, LivePlayerRow, LiveSnapshotStatus } from "../../../models/live";
import { readCoreEventFixtureSchedule } from "../../../services/fixture.service";
import type { Fixture } from "../../../models/common";
import { ensureAppContext, getAppContextSnapshot } from "../../../services/app-context.service";
import { PagePerformanceTracker } from "../../../utils/page-performance";
import { observeSoftTimeout } from "../../../utils/page-request";
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

interface StatusOption {
  key: string;
  label: string;
}

interface MatchGroup {
  title: string;
  matches: LiveMatch[];
}

interface LiveMatchLoadOptions {
  background?: boolean;
  forceRefresh?: boolean;
  trackNavigation?: boolean;
}

const STATUS_OPTIONS: StatusOption[] = [
  { key: "playing", label: "比赛中" },
  { key: "not_start", label: "未开始" },
  { key: "finished", label: "已完赛" }
];

const STORAGE_STATUS_KEY = "letletme_live_match_status";
const DEFAULT_STATUS = "playing";

function isValidStatus(value: unknown): value is string {
  return typeof value === "string" && STATUS_OPTIONS.some((item) => item.key === value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function textValue(value: unknown, fallback = "-"): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function statusLabel(match: LiveMatch, fallbackStatus: string): string {
  const status = match.status || match.playStatus || fallbackStatus;
  if (status === "finished") {
    return "已完赛";
  }
  if (status === "playing") {
    return "比赛中";
  }
  if (status === "not_start" || status === "not_started") {
    return "未开始";
  }
  if (numberValue(match.minutes) > 0) {
    return "比赛中";
  }
  return "比赛";
}

function statusClass(match: LiveMatch, fallbackStatus: string): string {
  const status = match.status || match.playStatus || fallbackStatus;
  if (status === "finished") {
    return "status-finished";
  }
  if (status === "playing") {
    return "status-playing";
  }
  if (numberValue(match.minutes) > 0) {
    return "status-playing";
  }
  return "status-waiting";
}

function kickoffText(match: LiveMatch): string {
  const raw = textValue(match.kickoffTime, "");
  if (!raw) {
    return "开球时间待定";
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hours}:${minutes}`;
  }
  return raw;
}

function minuteText(match: LiveMatch): string {
  const minutes = numberValue(match.minutes);
  return minutes > 0 ? `${minutes}'` : "";
}

function scoreText(match: LiveMatch, fallbackStatus: string): string {
  const status = match.status || match.playStatus || fallbackStatus;
  if (status === "not_start" || status === "not_started") {
    return "VS";
  }
  return `${numberValue(match.homeScore)}-${numberValue(match.awayScore)}`;
}

function playerName(player: LivePlayerRow): string {
  const team = player.teamShortName || player.team || "";
  const name = player.webName || player.name || "-";
  return team ? `${name} (${team})` : name;
}

function collectMetric(players: LivePlayerRow[], key: keyof LivePlayerRow, label: string): { label: string; value: string } | undefined {
  const names = players
    .filter((player) => numberValue(player[key]) > 0)
    .map((player) => {
      const count = numberValue(player[key]);
      return count > 1 ? `${playerName(player)} x${count}` : playerName(player);
    });

  if (names.length === 0) {
    return undefined;
  }

  return { label, value: names.slice(0, 3).join("、") + (names.length > 3 ? "..." : "") };
}

function collectBonus(players: LivePlayerRow[]): { label: string; value: string } | undefined {
  const names = players
    .filter((player) => numberValue(player.bonus) > 0)
    .sort((a, b) => numberValue(b.bonus) - numberValue(a.bonus))
    .map((player) => `${playerName(player)} +${numberValue(player.bonus)}`);

  if (names.length === 0) {
    return undefined;
  }

  return { label: "Bonus", value: names.slice(0, 3).join("、") };
}

function buildEventSummary(match: LiveMatch): Array<{ label: string; value: string }> {
  const players = [...(match.homeTeamDataList || []), ...(match.awayTeamDataList || [])];
  return [
    collectBonus(players),
    collectMetric(players, "goalsScored", "进球"),
    collectMetric(players, "assists", "助攻"),
    collectMetric(players, "redCards", "红牌"),
    collectMetric(players, "yellowCards", "黄牌"),
    collectMetric(players, "penaltiesSaved", "扑点"),
    collectMetric(players, "penaltiesMissed", "丢点"),
    collectMetric(players, "saves", "扑救")
  ].filter((item): item is { label: string; value: string } => Boolean(item));
}

function normalizeMatch(match: LiveMatch, fallbackStatus: string): LiveMatch {
  return {
    ...match,
    matchId: match.matchId || match.id,
    homeTeamDisplay: match.homeTeamShortName || match.homeTeamName || match.homeTeam,
    awayTeamDisplay: match.awayTeamShortName || match.awayTeamName || match.awayTeam,
    statusText: statusLabel(match, fallbackStatus),
    statusClass: statusClass(match, fallbackStatus),
    scoreText: scoreText(match, fallbackStatus),
    kickoffText: kickoffText(match),
    minuteText: minuteText(match),
    eventSummary: buildEventSummary(match)
  };
}

function groupMatches(matches: LiveMatch[], status: string): MatchGroup[] {
  const groups: Record<string, LiveMatch[]> = {};

  matches.forEach((match) => {
    const title = status === "playing" ? "正在进行" : match.kickoffText || "比赛";
    groups[title] = groups[title] || [];
    groups[title].push(match);
  });

  return Object.keys(groups).map((title) => ({ title, matches: groups[title] }));
}

function emptyDescription(status: string): string {
  if (status === "playing") {
    return "目前没有正在进行的比赛，可以切换到未开始";
  }
  if (status === "not_start") {
    return "本轮暂时没有待开球比赛，赛程更新后会自动出现";
  }
  if (status === "finished") {
    return "本轮还没有完赛记录，比赛结束后会显示比分";
  }
  return "暂时没有比赛数据，稍后回来重新加载";
}

export function fixtureScheduleStaleMessage(storedAt?: number): string {
  if (!storedAt) return "赛程刷新失败，当前显示上次成功数据";
  return `赛程刷新失败，当前显示 ${formatTime(new Date(storedAt))} 的上次成功数据`;
}

function coreMatch(fixture: Fixture): LiveMatch {
  const started = fixture.started === true;
  const status = fixture.finished ? "finished" : started ? "playing" : "not_start";
  return normalizeMatch({
    id: fixture.id,
    matchId: fixture.id,
    homeTeamName: fixture.homeTeam,
    awayTeamName: fixture.awayTeam,
    homeTeamShortName: fixture.teamShortName,
    awayTeamShortName: fixture.againstTeamShortName,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    kickoffTime: fixture.kickoffTime,
    minutes: fixture.minutes,
    status,
    playStatus: status,
    homeTeamDataList: [],
    awayTeamDataList: []
  }, status);
}

function matchStatus(match: LiveMatch): string {
  const status = String(match.status || match.playStatus || "not_start").toLowerCase();
  if (status === "playing" || status === "live") return "playing";
  if (status === "finished") return "finished";
  return "not_start";
}

function filterMatches(matches: LiveMatch[] | undefined, status: string): LiveMatch[] {
  return (matches || []).filter((match) => matchStatus(match) === status);
}

export function mergeLiveOverlay(core: LiveMatch[], overlay: LiveMatch[]): LiveMatch[] {
  const liveById = new Map(overlay.map((match) => [String(match.matchId || match.id), match]));
  return core.map((match) => {
    const live = liveById.get(String(match.matchId || match.id));
    if (!live) return match;
    const overlayHasStatus = Boolean(live.status || live.playStatus);
    const status = overlayHasStatus ? matchStatus(live) : matchStatus(match);
    return normalizeMatch({ ...match, ...live, status, playStatus: status }, status);
  });
}

export function contextDeadlineTargetAt(
  nextDeadlineAt: number | null | undefined,
  now: number,
  retry = false
): number | null {
  if (retry) return now + 30_000;
  const deadline = Number(nextDeadlineAt);
  if (!Number.isFinite(deadline) || deadline <= 0) return null;
  return deadline <= now ? now + 30_000 : deadline;
}

Page({
  data: {
    loading: false,
    refreshing: false,
    hasData: false,
    error: "",
    fixtureStaleMessage: "",
    displayState: "fresh" as LiveDisplayState,
    status: DEFAULT_STATUS,
    activeStatusLabel: "比赛中",
    emptyDescription: emptyDescription(DEFAULT_STATUS),
    statusOptions: STATUS_OPTIONS,
    matches: [] as LiveMatch[],
    groups: [] as MatchGroup[],
    lastUpdated: ""
  },

  liveRequest: null as Promise<void> | null,
  liveRequestKey: "",
  liveRequestId: 0,
  liveSnapshot: null as LiveSnapshotStatus | null,
  cachedLiveStoredAt: undefined as number | undefined,
  liveRefresh: null as LiveRefreshController | null,
  probing: false,
  networkOnline: true,
  currentEventId: 0,
  loadedSeason: undefined as string | undefined,
  pageVisible: false,
  hasShown: false,
  targetEventId: 0,
  coreMatches: [] as LiveMatch[],
  liveWindow: false,
  kickoffTransitionTimer: undefined as number | undefined,
  contextDeadlineTimer: undefined as number | undefined,
  perfTracker: undefined as PagePerformanceTracker | undefined,
  resumeLoadAfterShow: false,

  ensureContext(reason: "page-load" | "page-show" | "pull-refresh", forceRefresh = false) {
    return ensureAppContext({ reason, forceRefresh });
  },

  async onLoad() {
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/match/match", "cold-launch");
    const rawStoredStatus = wx.getStorageSync(STORAGE_STATUS_KEY);
    const storedStatus = rawStoredStatus === "next_event" ? "not_start" : rawStoredStatus;
    if (rawStoredStatus === "next_event") {
      wx.setStorageSync(STORAGE_STATUS_KEY, "not_start");
    }
    if (isValidStatus(storedStatus)) {
      this.setData({
        status: storedStatus,
        activeStatusLabel: STATUS_OPTIONS.find((item) => item.key === storedStatus)?.label || "比赛中",
        emptyDescription: emptyDescription(storedStatus)
      });
    }
    // onShow can run before shared launch data has resolved. Wait for the
    // current event, then arm recovery before the first match request so a
    // failed cold-start request still has a revision poll to recover it.
    this.setData({ loading: true });
    let context = getAppContextSnapshot();
    try {
      context = await this.ensureContext("page-load");
    } catch (error) {
      if (!context) {
        this.showContextError(error);
        return;
      }
    }
    this.perfTracker.mark("contextReadyAt");
    this.currentEventId = context.currentEvent || 0;
    this.targetEventId = context.displayEvent || 0;
    this.loadedSeason = context.season || undefined;
    this.armContextDeadline(context.nextDeadlineAt);
    if (!context.currentEvent && this.targetEventId && !isValidStatus(storedStatus)) {
      // Preseason/offseason uses the schema-backed not-started bucket.
      this.setData({
        status: "not_start",
        activeStatusLabel: "未开始",
        emptyDescription: emptyDescription("not_start")
      });
    }
    this.initLiveRefresh();
    void this.loadData();
    this.syncDisplayState();
  },

  initLiveRefresh() {
    if (this.liveRefresh) return;
    this.liveRefresh = createLiveRefreshController({
      isEligible: () => this.shouldAutoRefresh(),
      getAcceptedSnapshot: () => this.liveSnapshot,
      probe: () => getLiveSnapshot(this.currentEventId),
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
          surface: "match",
          season: this.liveSnapshot?.season,
          eventId: this.currentEventId,
          isCurrentEvent: this.currentEventId === Number(getApp<IAppOption>().globalData.gw),
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

  clearKickoffTransition() {
    if (this.kickoffTransitionTimer !== undefined) {
      clearTimeout(this.kickoffTransitionTimer);
      this.kickoffTransitionTimer = undefined;
    }
  },

  clearContextDeadline() {
    if (this.contextDeadlineTimer !== undefined) {
      clearTimeout(this.contextDeadlineTimer);
      this.contextDeadlineTimer = undefined;
    }
  },

  armContextDeadline(nextDeadlineAt?: number | null, retry = false) {
    this.clearContextDeadline();
    if (!this.pageVisible) return;
    const now = Date.now();
    const targetAt = contextDeadlineTargetAt(nextDeadlineAt, now, retry);
    if (targetAt === null) return;
    const delay = Math.min(Math.max(0, targetAt - now + 250), 2_147_000_000);
    this.contextDeadlineTimer = setTimeout(() => {
      this.contextDeadlineTimer = undefined;
      if (!this.pageVisible) return;
      if (targetAt > Date.now()) {
        this.armContextDeadline(targetAt);
        return;
      }
      void this.refreshContextAtDeadline();
    }, delay);
  },

  async refreshContextAtDeadline() {
    try {
      const context = await this.ensureContext("page-show", true);
      if (!this.pageVisible) return;
      const nextCurrentEventId = context.currentEvent || 0;
      const nextTargetEventId = context.displayEvent || 0;
      const nextSeason = context.season || undefined;
      const changed = nextCurrentEventId !== this.currentEventId
        || nextTargetEventId !== this.targetEventId
        || Boolean(this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason);
      this.currentEventId = nextCurrentEventId;
      this.targetEventId = nextTargetEventId;
      if (nextSeason) this.loadedSeason = nextSeason;
      this.armContextDeadline(context.nextDeadlineAt);
      if (!changed) return;
      this.liveRefresh?.stop();
      this.clearKickoffTransition();
      this.liveRequestId += 1;
      this.liveRequest = null;
      this.liveRequestKey = "";
      this.liveSnapshot = null;
      this.cachedLiveStoredAt = undefined;
      this.setData({ matches: [], groups: [], hasData: false, fixtureStaleMessage: "", lastUpdated: "" });
      this.liveRefresh?.sync();
      await this.loadData({ background: true, forceRefresh: true });
      this.syncDisplayState();
    } catch {
      this.armContextDeadline(undefined, true);
    }
  },

  armKickoffTransition(fixtures: Array<{ finished?: boolean; kickoffTime?: string }>, retry = false) {
    this.clearKickoffTransition();
    if (
      !this.pageVisible
      || this.currentEventId <= 0
      || this.targetEventId !== this.currentEventId
    ) {
      return;
    }

    const now = Date.now();
    const kickoffTimes = fixtures
      .filter((fixture) => !fixture.finished && Boolean(fixture.kickoffTime))
      .map((fixture) => new Date(fixture.kickoffTime as string).getTime())
      .filter((kickoff) => Number.isFinite(kickoff));
    const nextKickoff = kickoffTimes
      .filter((kickoff) => kickoff > now)
      .sort((left, right) => left - right)[0];
    const targetAt = retry ? now + 30_000 : nextKickoff;
    if (targetAt === undefined) return;

    // Long timers are chunked so a far-away kickoff does not overflow the
    // JavaScript timer range. The callback re-checks visibility and context.
    const delay = Math.min(Math.max(0, targetAt - now + 250), 2_147_000_000);
    this.kickoffTransitionTimer = setTimeout(() => {
      this.kickoffTransitionTimer = undefined;
      if (
        !this.pageVisible
        || this.currentEventId <= 0
        || this.targetEventId !== this.currentEventId
      ) {
        return;
      }
      if (targetAt > Date.now()) {
        this.armKickoffTransition(fixtures);
        return;
      }
      void this.loadData({ background: true, forceRefresh: true });
    }, delay) as unknown as number;
  },

  showContextError(error: unknown) {
    const message = error instanceof Error ? error.message : "赛季和比赛轮信息加载失败";
    this.setData({ loading: false, refreshing: false, error: message }, () => {
      this.perfTracker?.mark("primarySetDataAt");
      wx.nextTick(() => this.perfTracker?.observePrimary());
    });
    this.syncDisplayState();
  },

  async retryWithContext() {
    if (!this.targetEventId) {
      let context;
      try {
        context = await this.ensureContext("pull-refresh", true);
      } catch (error) {
        this.showContextError(error);
        return;
      }
      this.currentEventId = context.currentEvent || 0;
      this.targetEventId = context.displayEvent || 0;
      this.loadedSeason = context.season || this.loadedSeason;
      if (!this.targetEventId) {
        this.setData({ loading: false, error: "当前赛季暂无赛程" }, () => {
          wx.nextTick(() => this.perfTracker?.observePrimary());
        });
        return;
      }
      this.initLiveRefresh();
    }
    this.perfTracker?.mark("contextReadyAt");
    return this.loadData({ forceRefresh: true });
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    let context = getAppContextSnapshot();
    if (resumed) {
      this.perfTracker?.disconnect();
      this.perfTracker = new PagePerformanceTracker(this, "pages/live/match/match", "warm-enter");
      try {
        context = await this.ensureContext("page-show");
        this.perfTracker.mark("contextReadyAt");
      } catch { /* keep the last known event */ }
      if (!this.pageVisible) return;
    }
    const nextCurrentEventId = context?.currentEvent || 0;
    const nextTargetEventId = context?.displayEvent || 0;
    const nextSeason = context?.season || undefined;
    this.armContextDeadline(context?.nextDeadlineAt);
    const seasonChanged = Boolean(this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason);
    if (nextSeason) this.loadedSeason = nextSeason;
    if (seasonChanged || nextCurrentEventId !== this.currentEventId || nextTargetEventId !== this.targetEventId) {
      this.liveRefresh?.stop();
      this.clearKickoffTransition();
      // The request key is otherwise only the status, which can be unchanged
      // across a GW rollover. Detach and invalidate the old event request
      // before the replacement load so its result can never enter this view.
      this.liveRequestId += 1;
      this.liveRequest = null;
      this.liveRequestKey = "";
      this.currentEventId = nextCurrentEventId;
      this.targetEventId = nextTargetEventId;
      this.liveSnapshot = null;
      this.cachedLiveStoredAt = undefined;
      if (resumed) {
        this.setData({ matches: [], groups: [], hasData: false, fixtureStaleMessage: "", lastUpdated: "" });
        this.liveRefresh?.sync();
        await this.loadData({ forceRefresh: true });
        this.syncDisplayState();
        return;
      }
    }
    if (resumed && this.resumeLoadAfterShow && !this.data.hasData) {
      this.resumeLoadAfterShow = false;
      await this.loadData({ forceRefresh: true });
      return;
    }
    if (resumed && (this.data.hasData || Boolean(this.data.error))) {
      wx.nextTick(() => this.perfTracker?.observePrimary());
    }
    this.armKickoffTransition(this.coreMatches);
    this.liveRefresh?.sync();
    if (!this.revalidateCachedSnapshot() && resumed && this.shouldAutoRefresh()) {
      void this.liveRefresh?.probeNow();
    }
  },

  onHide() {
    this.pageVisible = false;
    if (this.liveRequest) {
      this.resumeLoadAfterShow = !this.data.hasData;
      this.liveRequestId += 1;
      this.liveRequest = null;
      this.liveRequestKey = "";
    }
    this.liveRefresh?.stop();
    this.clearKickoffTransition();
    this.clearContextDeadline();
    this.perfTracker?.disconnect();
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeLoadAfterShow = false;
    this.liveRequestId += 1;
    this.liveRequest = null;
    this.liveRequestKey = "";
    this.liveRefresh?.dispose();
    this.clearKickoffTransition();
    this.clearContextDeadline();
    this.perfTracker?.disconnect();
  },

  async onPullDownRefresh() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/match/match", "refresh");
    try {
      const context = await this.ensureContext("pull-refresh");
      this.currentEventId = context.currentEvent || 0;
      this.targetEventId = context.displayEvent || 0;
      this.armContextDeadline(context.nextDeadlineAt);
      this.perfTracker.mark("contextReadyAt");
      await this.loadData({ background: true, forceRefresh: true, trackNavigation: true });
    } catch (error) {
      this.showContextError(error);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  loadData(options: LiveMatchLoadOptions = {}): Promise<void> {
    const tracksNavigation = options.background !== true || options.trackNavigation === true;
    const requestKey = `${this.targetEventId}:${options.forceRefresh === true}:${tracksNavigation}`;
    if (this.liveRequest && this.liveRequestKey === requestKey) {
      return this.liveRequest;
    }

    const requestId = this.liveRequestId + 1;
    this.liveRequestId = requestId;
    const preserveData = options.background === true && this.data.hasData;
    const navigationTracker = tracksNavigation ? this.perfTracker : undefined;
    this.setData(preserveData
      ? { refreshing: true, error: "" }
      : { loading: true, error: "" });

    const request = (async () => {
      try {
        const context = getAppContextSnapshot()
          || await this.ensureContext("page-load");
        const targetEvent = context.displayEvent || 0;
        if (!targetEvent) throw new Error("当前没有可展示的比赛周");
        this.currentEventId = context.currentEvent || 0;
        this.targetEventId = targetEvent;
        this.armContextDeadline(context.nextDeadlineAt);
        const requestTrace = options.background === true && options.trackNavigation !== true
          ? null
          : navigationTracker
            ? {
                navigationId: navigationTracker.navigationId,
                callerSurface: "live-match-schedule",
                trigger: options.forceRefresh ? "refresh" as const : "load" as const,
                forceReason: options.forceRefresh ? "user-refresh" as const : undefined,
                contextRevision: context.contextRevision
              }
            : undefined;
        navigationTracker?.mark("primaryRequestStartAt");
        const coreRead = await readCoreEventFixtureSchedule(targetEvent, context.season, {
          forceRefresh: options.forceRefresh,
          trace: requestTrace
        });
        if (!this.pageVisible || requestId !== this.liveRequestId) return;
        navigationTracker?.mark("primaryResponseAt");
        const core = coreRead.data.map(coreMatch);
        this.coreMatches = core;
        const now = Date.now();
        this.liveWindow = targetEvent === context.currentEvent && coreRead.data.some((fixture) =>
          !fixture.finished
          && (fixture.started === true || Boolean(fixture.kickoffTime && new Date(fixture.kickoffTime).getTime() <= now))
        );
        this.armKickoffTransition(coreRead.data);
        const activeStatus = this.data.status;
        const activeStatusLabel = STATUS_OPTIONS.find((item) => item.key === activeStatus)?.label || "比赛";
        const matches = filterMatches(core, activeStatus);
        this.setData({
          activeStatusLabel,
          emptyDescription: emptyDescription(activeStatus),
          matches,
          groups: groupMatches(matches, activeStatus),
          hasData: true,
          error: "",
          fixtureStaleMessage: coreRead.meta.stale
            ? fixtureScheduleStaleMessage(coreRead.meta.storedAt)
            : "",
          lastUpdated: formatTime(new Date(coreRead.meta.storedAt || Date.now()))
        }, () => {
          navigationTracker?.mark("primarySetDataAt");
          wx.nextTick(() => navigationTracker?.observePrimary());
        });
        if (this.liveWindow) {
          // Arm revision recovery before the overlay request so a failed first
          // Live acquisition after kickoff still recovers automatically.
          this.liveRefresh?.sync();
          const liveResult = await getLiveMatchByStatusSnapshot(
            "all",
            options.forceRefresh === true,
            requestTrace
          );
          if (!this.pageVisible || requestId !== this.liveRequestId) return;
          this.liveSnapshot = liveResult.snapshot;
          this.cachedLiveStoredAt = liveResult.servedStoredAt;
          this.coreMatches = mergeLiveOverlay(core, liveResult.data);
          const overlayStatus = this.data.status;
          const overlaid = filterMatches(this.coreMatches, overlayStatus);
          this.setData({
            activeStatusLabel: STATUS_OPTIONS.find((item) => item.key === overlayStatus)?.label || "比赛",
            emptyDescription: emptyDescription(overlayStatus),
            matches: overlaid,
            groups: groupMatches(overlaid, overlayStatus),
            error: "",
            lastUpdated: formatTime(new Date(liveResult.servedStoredAt || Date.now()))
          });
          this.liveRefresh?.sync();
        } else {
          this.liveSnapshot = null;
          this.liveRefresh?.stop();
        }
        this.syncDisplayState();
      } catch (error) {
        if (!this.pageVisible || requestId !== this.liveRequestId) return;
        this.setData({ error: error instanceof Error ? error.message : "实时比赛加载失败" });
        this.armKickoffTransition(this.coreMatches, true);
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
        this.revalidateCachedSnapshot();
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  },

  shouldAutoRefresh(): boolean {
    if (!this.liveWindow) return false;
    return shouldPollLiveSnapshot({
      pageVisible: this.pageVisible,
      currentEventId: this.currentEventId,
      selectedEventId: this.currentEventId,
      snapshot: this.liveSnapshot
    });
  },

  revalidateCachedSnapshot(): boolean {
    if (!shouldRevalidateCachedLiveSnapshot({
      servedStoredAt: this.cachedLiveStoredAt,
      pageVisible: this.pageVisible,
      currentEventId: this.currentEventId,
      selectedEventId: this.currentEventId,
      snapshot: this.liveSnapshot
    })) {
      return false;
    }
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
      lastError: this.data.error || this.data.fixtureStaleMessage,
      online: this.networkOnline
    });
    if (next !== this.data.displayState) {
      recordLiveTransition({
        surface: "match",
        season: this.liveSnapshot?.season,
        eventId: this.currentEventId,
        isCurrentEvent: this.currentEventId === Number(getApp<IAppOption>().globalData.gw),
        displayState: next
      });
    }
    this.setData({ displayState: next });
  },

  onStatusTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { status: string }>) {
    const status = event.currentTarget.dataset.status || "playing";
    if (status === this.data.status) {
      return;
    }
    const activeStatusLabel = STATUS_OPTIONS.find((item) => item.key === status)?.label || "比赛";
    wx.setStorageSync(STORAGE_STATUS_KEY, status);
    const matches = filterMatches(this.coreMatches, status);
    this.setData({
      status,
      activeStatusLabel,
      emptyDescription: emptyDescription(status),
      matches,
      groups: groupMatches(matches, status),
      hasData: true
    });
    this.syncDisplayState();
  },

  onRetry() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/match/match", "refresh");
    void this.retryWithContext();
  }
});
