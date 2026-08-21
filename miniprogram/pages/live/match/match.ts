import { getLiveMatchByStatusSnapshot, getLiveSnapshot } from "../../../services/live.service";
import type { LiveMatch, LivePlayerRow, LiveSnapshotStatus } from "../../../models/live";
import { readCoreEventFixtureSchedule } from "../../../services/fixture.service";
import type { Fixture } from "../../../models/common";
import {
  ensureAppContext,
  getAppContextSnapshot,
  shouldRefreshAppContext
} from "../../../services/app-context.service";
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
import { copyShareText, formatLiveMatchShareText } from "../../../utils/live-share";
import { miniLogger } from "../../../utils/logger";

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

export type MatchHighlightKind =
  | "bonus"
  | "goals"
  | "assists"
  | "defensive"
  | "bps"
  | "saves"
  | "cleansheet"
  | "pensaved"
  | "yellow"
  | "red"
  | "penmissed"
  | "owngoal";

export interface MatchHighlightItem {
  key: string;
  name: string;
  team: string;
  text: string;
  /** Row display value: counts drop "1" and read "×N"; bonus/DC/BPS keep text. */
  display: string;
}

export interface MatchHighlightGroup {
  kind: MatchHighlightKind;
  label: string;
  items: MatchHighlightItem[];
}

const HIGHLIGHT_LABELS: Record<MatchHighlightKind, string> = {
  bonus: "奖励分",
  goals: "进球",
  assists: "助攻",
  defensive: "防守贡献",
  bps: "BPS",
  saves: "扑救",
  cleansheet: "零封",
  pensaved: "扑点",
  yellow: "黄牌",
  red: "红牌",
  penmissed: "失点",
  owngoal: "乌龙"
};

function playerTeam(player: LivePlayerRow): string {
  return textValue(player.teamShortName || player.team, "");
}

function playerShortName(player: LivePlayerRow): string {
  return textValue(player.webName || player.name, "-");
}

export function isDefensiveContributionEarned(player: LivePlayerRow): boolean {
  const contribution = numberValue(player.defensiveContribution);
  const type = numberValue(player.elementType);
  if (type === 2) return contribution >= 10;
  if (type === 3 || type === 4) return contribution >= 12;
  return false;
}

/** Clean sheet scores only with 60+ minutes, and only for GKP/DEF (+4) / MID (+1). */
export function isCleanSheetEarned(player: LivePlayerRow): boolean {
  const type = numberValue(player.elementType);
  if (type < 1 || type > 3) return false;
  return numberValue(player.cleanSheets) > 0 && numberValue(player.minutes) >= 60;
}

function sortedHighlightItems(
  players: LivePlayerRow[],
  read: (player: LivePlayerRow) => number,
  format: (value: number) => string
): MatchHighlightItem[] {
  return players
    .map((player) => ({ player, value: read(player) }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value)
    .map((row) => {
      const name = playerShortName(row.player);
      const team = playerTeam(row.player);
      const display = format(row.value);
      return {
        key: [name, team, display].join(":"),
        name,
        team,
        text: display,
        display
      };
    });
}

/** Top N by BPS, including all players tied at the cutoff position. */
function bpsHighlightItemsWithTies(players: LivePlayerRow[], limit: number): MatchHighlightItem[] {
  const sorted = players
    .filter((player) => player.bps != null && Number.isFinite(Number(player.bps)))
    .sort((left, right) => numberValue(right.bps) - numberValue(left.bps));
  const withTies = sorted.length <= limit
    ? sorted
    : sorted.filter((player) => numberValue(player.bps) >= numberValue(sorted[limit - 1].bps));
  return withTies.map((player) => {
    const name = playerShortName(player);
    const team = playerTeam(player);
    const display = String(numberValue(player.bps));
    return { key: [name, team, player.bps].join(":"), name, team, text: display, display };
  });
}

/** Same groups as the Website match card: bonus, goals, assists, DC, BPS, saves, cards. */
export function buildMatchHighlights(match: LiveMatch): MatchHighlightGroup[] {
  const status = String(match.status || match.playStatus || "");
  if (status === "not_start" || status === "not_started") return [];
  const players = [...(match.homeTeamDataList || []), ...(match.awayTeamDataList || [])];
  const groups: MatchHighlightGroup[] = [
    { kind: "goals", label: HIGHLIGHT_LABELS.goals, items: sortedHighlightItems(players, (player) => numberValue(player.goalsScored), String) },
    { kind: "assists", label: HIGHLIGHT_LABELS.assists, items: sortedHighlightItems(players, (player) => numberValue(player.assists), String) },
    {
      kind: "defensive",
      label: HIGHLIGHT_LABELS.defensive,
      items: sortedHighlightItems(
        players,
        (player) => (isDefensiveContributionEarned(player) ? numberValue(player.defensiveContribution) : 0),
        String
      )
    },
    { kind: "saves", label: HIGHLIGHT_LABELS.saves, items: sortedHighlightItems(players, (player) => numberValue(player.saves), String) },
    {
      kind: "cleansheet",
      label: HIGHLIGHT_LABELS.cleansheet,
      items: sortedHighlightItems(players, (player) => (isCleanSheetEarned(player) ? numberValue(player.cleanSheets) : 0), String)
    },
    { kind: "pensaved", label: HIGHLIGHT_LABELS.pensaved, items: sortedHighlightItems(players, (player) => numberValue(player.penaltiesSaved), String) },
    { kind: "yellow", label: HIGHLIGHT_LABELS.yellow, items: sortedHighlightItems(players, (player) => numberValue(player.yellowCards), String) },
    { kind: "red", label: HIGHLIGHT_LABELS.red, items: sortedHighlightItems(players, (player) => numberValue(player.redCards), String) },
    { kind: "penmissed", label: HIGHLIGHT_LABELS.penmissed, items: sortedHighlightItems(players, (player) => numberValue(player.penaltiesMissed), String) },
    { kind: "owngoal", label: HIGHLIGHT_LABELS.owngoal, items: sortedHighlightItems(players, (player) => numberValue(player.ownGoals), String) },
    { kind: "bonus", label: HIGHLIGHT_LABELS.bonus, items: sortedHighlightItems(players, (player) => numberValue(player.bonus), (value) => `+${value}`) },
    {
      kind: "bps",
      label: HIGHLIGHT_LABELS.bps,
      items: bpsHighlightItemsWithTies(players, 5)
    }
  ];
  const countKinds = new Set<MatchHighlightKind>(["goals", "assists", "saves", "yellow", "red", "cleansheet", "pensaved", "penmissed", "owngoal"]);
  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        display: countKinds.has(group.kind) ? (item.text === "1" ? "" : `×${item.text}`) : item.text
      }))
    }));
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
    eventSummary: buildMatchHighlights(match)
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

export function noScheduleState() {
  return {
    loading: false,
    refreshing: false,
    error: "",
    hasData: false,
    scheduleEmpty: true,
    matches: [] as LiveMatch[],
    groups: [] as MatchGroup[],
    displayState: "scheduled" as const,
    lastUpdated: "",
    fixtureStaleMessage: ""
  };
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
    return normalizeMatch({
      ...match,
      ...live,
      // The live overlay owns score/status/minutes/player details. Team
      // identity always comes from the core fixture snapshot so an
      // abbreviated fallback can never overwrite an official short name.
      homeTeamName: match.homeTeamName,
      homeTeamShortName: match.homeTeamShortName,
      awayTeamName: match.awayTeamName,
      awayTeamShortName: match.awayTeamShortName,
      minutes: live.minutes ?? match.minutes,
      status,
      playStatus: status
    }, status);
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
    scheduleEmpty: false,
    displayState: "fresh" as LiveDisplayState,
    status: DEFAULT_STATUS,
    activeStatusLabel: "比赛中",
    emptyDescription: emptyDescription(DEFAULT_STATUS),
    statusOptions: STATUS_OPTIONS,
    matches: [] as LiveMatch[],
    groups: [] as MatchGroup[],
    lastUpdated: "",
    copiedMatchId: "" as number | string,
    shareSheetOpen: false,
    shareText: ""
  },

  copiedMatchTimer: undefined as ReturnType<typeof setTimeout> | undefined,

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
  startupPending: false,
  refreshContextPending: false,
  forcedRefreshPending: false,
  forcedRefreshBackground: false,
  resumeForcedRefreshAfterShow: false,
  resumeForcedRefreshBackground: false,

  ensureContext(reason: "page-load" | "page-show" | "pull-refresh", forceRefresh = false) {
    return ensureAppContext({ reason, forceRefresh });
  },

  async onLoad() {
    this.pageVisible = true;
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/match/match", "cold-launch");
    const tracker = this.perfTracker;
    this.startupPending = true;
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
        if (!this.pageVisible || this.perfTracker !== tracker) return;
        this.showContextError(error);
        this.startupPending = false;
        return;
      }
    }
    if (!this.pageVisible || this.perfTracker !== tracker) return;
    this.startupPending = false;
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

  clearCopiedMatchTimer() {
    if (this.copiedMatchTimer) {
      clearTimeout(this.copiedMatchTimer);
      this.copiedMatchTimer = undefined;
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
    this.setData({
      loading: false,
      refreshing: false,
      error: message,
      scheduleEmpty: false
    }, () => {
      this.perfTracker?.mark("primarySetDataAt");
      wx.nextTick(() => this.perfTracker?.observePrimary());
    });
    this.syncDisplayState();
  },

  async runForcedRefresh(tracker: PagePerformanceTracker, background: boolean) {
    this.forcedRefreshPending = true;
    this.forcedRefreshBackground = background;
    this.refreshContextPending = true;
    try {
      let context = getAppContextSnapshot();
      if (shouldRefreshAppContext(context)) {
        context = await this.ensureContext("pull-refresh", true);
      }
      if (!context) throw new Error("赛季和比赛轮信息加载失败");
      if (!this.pageVisible || this.perfTracker !== tracker) return;
      this.refreshContextPending = false;
      this.currentEventId = context.currentEvent || 0;
      this.targetEventId = context.displayEvent || 0;
      this.loadedSeason = context.season || this.loadedSeason;
      this.armContextDeadline(context.nextDeadlineAt);
      tracker.mark("contextReadyAt");
      if (!this.targetEventId) {
        this.liveRefresh?.stop();
        this.setData(noScheduleState(), () => {
          wx.nextTick(() => tracker.observePrimary());
        });
        this.syncDisplayState();
        return;
      }
      this.initLiveRefresh();
      await this.loadData({ background, forceRefresh: true, trackNavigation: true });
    } catch (error) {
      if (this.pageVisible && this.perfTracker === tracker) this.showContextError(error);
    } finally {
      if (this.pageVisible && this.perfTracker === tracker) {
        this.refreshContextPending = false;
        this.forcedRefreshPending = false;
        this.forcedRefreshBackground = false;
      }
    }
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    const resumeForcedRefresh = resumed && this.resumeForcedRefreshAfterShow;
    const resumeForcedRefreshBackground = this.resumeForcedRefreshBackground;
    this.resumeForcedRefreshAfterShow = false;
    this.resumeForcedRefreshBackground = false;
    const resumeInterruptedLoad = resumed && this.resumeLoadAfterShow;
    let context = getAppContextSnapshot();
    if (resumed) {
      this.perfTracker?.disconnect();
      this.perfTracker = new PagePerformanceTracker(
        this,
        "pages/live/match/match",
        resumeForcedRefresh ? "refresh" : "warm-enter"
      );
      if (resumeForcedRefresh) {
        this.resumeLoadAfterShow = false;
        await this.runForcedRefresh(this.perfTracker, resumeForcedRefreshBackground);
        return;
      }
      try {
        context = await this.ensureContext("page-show");
        this.perfTracker.mark("contextReadyAt");
      } catch { /* keep the last known event */ }
      if (!this.pageVisible) return;
    }
    if (resumeInterruptedLoad) {
      this.resumeLoadAfterShow = false;
      this.startupPending = false;
      this.refreshContextPending = false;
      // A cold startup can be abandoned before onLoad creates the controller.
      // The replacement lifecycle owns both the load and its recovery polling.
      this.initLiveRefresh();
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
        this.clearCopiedMatchTimer();
        this.setData({
          matches: [],
          groups: [],
          hasData: false,
          fixtureStaleMessage: "",
          lastUpdated: "",
          copiedMatchId: "",
          shareSheetOpen: false,
          shareText: ""
        });
        this.liveRefresh?.sync();
        await this.loadData({ forceRefresh: true });
        this.syncDisplayState();
        return;
      }
    }
    if (resumeInterruptedLoad) {
      await this.loadData({ background: this.data.hasData, forceRefresh: true });
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
    this.resumeForcedRefreshAfterShow = this.forcedRefreshPending;
    this.resumeForcedRefreshBackground = this.forcedRefreshBackground;
    this.resumeLoadAfterShow = this.resumeLoadAfterShow
      || (!this.resumeForcedRefreshAfterShow && (this.startupPending
        || this.refreshContextPending
        || Boolean(this.liveRequest)));
    if (this.liveRequest) {
      this.liveRequestId += 1;
      this.liveRequest = null;
      this.liveRequestKey = "";
      if (this.data.refreshing) this.setData({ refreshing: false });
    }
    this.liveRefresh?.stop();
    this.clearKickoffTransition();
    this.clearContextDeadline();
    this.clearCopiedMatchTimer();
    this.perfTracker?.disconnect();
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeLoadAfterShow = false;
    this.resumeForcedRefreshAfterShow = false;
    this.resumeForcedRefreshBackground = false;
    this.startupPending = false;
    this.refreshContextPending = false;
    this.forcedRefreshPending = false;
    this.forcedRefreshBackground = false;
    this.liveRequestId += 1;
    this.liveRequest = null;
    this.liveRequestKey = "";
    this.liveRefresh?.dispose();
    this.clearKickoffTransition();
    this.clearContextDeadline();
    this.clearCopiedMatchTimer();
    this.perfTracker?.disconnect();
  },

  async onPullDownRefresh() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/live/match/match", "refresh");
    const tracker = this.perfTracker;
    try {
      await this.runForcedRefresh(tracker, true);
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
      : { loading: true, error: "", scheduleEmpty: false });

    const request = (async () => {
      try {
        const context = getAppContextSnapshot()
          || await this.ensureContext("page-load");
        const targetEvent = context.displayEvent || 0;
        if (!targetEvent) {
          this.liveRefresh?.stop();
          this.setData(noScheduleState(), () => {
            navigationTracker?.mark("primarySetDataAt");
            wx.nextTick(() => navigationTracker?.observePrimary());
          });
          this.syncDisplayState();
          return;
        }
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
          scheduleEmpty: false,
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
    void this.runForcedRefresh(this.perfTracker, false);
  },

  onCopyMatchShare(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { matchid?: number | string }>) {
    try {
      const matchId = event.currentTarget.dataset.matchid;
      const match = this.coreMatches.find((item) => String(item.matchId) === String(matchId));
      if (!match) {
        wx.showToast({ title: "还没有可分享的比赛", icon: "none" });
        return;
      }
      const text = formatLiveMatchShareText(match);
      void copyShareText(text).then((ok) => {
        if (ok) {
          this.setData({ copiedMatchId: match.matchId || "", shareSheetOpen: false });
          this.clearCopiedMatchTimer();
          this.copiedMatchTimer = setTimeout(() => {
            this.copiedMatchTimer = undefined;
            if (this.data.copiedMatchId === match.matchId) {
              this.setData({ copiedMatchId: "" });
            }
          }, 2000);
          return;
        }
        this.setData({ shareSheetOpen: true, shareText: text });
      });
    } catch (error) {
      miniLogger.error("copy-share.match", error instanceof Error ? error.message : "failed");
      wx.showToast({ title: "复制失败", icon: "none" });
    }
  },

  onCloseShareSheet() {
    this.setData({ shareSheetOpen: false });
  }
});
