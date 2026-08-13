import { PerformancePage } from "../../../utils/performance-page";
import {
  getCurrentSnapshotState,
  getMyFplContext,
  getMyFplLeagues,
  getMyFplTeamBrief
} from "../../../services/my-fpl.service";
import type { MyFplTeamBriefResult } from "../../../services/my-fpl.service";
import type {
  MyFplContext,
  MyFplLeagueBrief,
  MyFplPhase,
  MyFplTeamBrief
} from "../../../models/my-fpl";
import type { MyFplPrincipalState } from "../../../models/principal";
import { deriveMyFplPhase, derivePrincipalDisplay } from "../../../utils/my-fpl-phase";
import { subscribeNetworkStatus } from "../../../utils/live-network";
import { durationBucket, recordMyFplVisit } from "../../../utils/perf";
import { formatDeadline } from "../../../utils/date";
import { goToEntrySearch, goToLiveEntry, navigateTo } from "../../../utils/navigation";
import { routes } from "../../../config/routes";
import { currentFollowEntryId, waitForAuthoritativeFollow } from "../../../utils/follow";

interface OverviewCache {
  entryId: number;
  season: string;
  event: number;
  teamBrief: MyFplTeamBrief | null;
  leagueCount?: number;
  storedAt: number;
}

const OVERVIEW_CACHE_KEY = "my-fpl:overview";

export function resolveOverviewLeagueState(
  leagues: MyFplLeagueBrief[] | null,
  cachedLeagueCount?: number
): { leagueCount: number; leaguesLoaded: boolean; leaguesUnavailable: boolean } {
  const leagueCount = leagues === null ? cachedLeagueCount : leagues.length;
  if (leagueCount === undefined) {
    return { leagueCount: 0, leaguesLoaded: false, leaguesUnavailable: true };
  }
  return { leagueCount, leaguesLoaded: true, leaguesUnavailable: false };
}

/** Keep cached fields only for the source that failed. Successful reads are
 * authoritative even when a field is absent, so stale values are cleared. */
export function mergeTeamBriefWithCache(
  result: MyFplTeamBriefResult | null,
  cached: MyFplTeamBrief | null | undefined
): MyFplTeamBrief | null {
  if (!result || (!result.entryAvailable && !result.eventResultAvailable)) {
    return cached ?? null;
  }
  const fresh = result.brief ?? {};
  return {
    entryName: result.entryAvailable ? fresh.entryName : cached?.entryName,
    playerName: result.entryAvailable ? fresh.playerName : cached?.playerName,
    eventPoints: result.eventResultAvailable ? fresh.eventPoints : cached?.eventPoints,
    overallPoints: result.eventResultAvailable || result.entryAvailable
      ? fresh.overallPoints
      : cached?.overallPoints,
    overallRank: result.eventResultAvailable || result.entryAvailable
      ? fresh.overallRank
      : cached?.overallRank
  };
}

export function readOverviewCache(
  entryId: number | undefined,
  event: number | undefined,
  season: string | undefined
): OverviewCache | null {
  // Event 0 is the stable OFFSEASON identity (valid context with no current
  // or next event), not a missing context.
  if (!entryId || event === undefined || (!season && event !== 0)) {
    return null;
  }
  try {
    const cached = wx.getStorageSync(OVERVIEW_CACHE_KEY) as OverviewCache | undefined;
    // Same-context only: last-good never crosses principal, season, or event.
    // If event context is unavailable during a cold offseason launch, event 0
    // is still safe to match against the stored event-0 identity; the cache's
    // own season remains the only season evidence available offline.
    if (
      cached
      && cached.entryId === entryId
      && cached.event === event
      && (cached.season === season || (event === 0 && season === undefined))
    ) {
      return cached;
    }
  } catch { /* no cache */ }
  return null;
}

PerformancePage({
  data: {
    loading: true,
    principalResolved: false,
    phase: "PRE_DEADLINE" as MyFplPhase,
    principalState: "NO_FOLLOW" as MyFplPrincipalState,
    deadlineText: "",
    teamBrief: null as MyFplTeamBrief | null,
    leagueCount: 0,
    leaguesLoaded: false,
    leaguesUnavailable: false,
    eventContextAvailable: false,
    offline: false,
    error: ""
  },

  context: null as MyFplContext | null,
  requestId: 0,
  hasShown: false,
  pageVisible: false,
  lifecycleRevision: 0,
  unsubscribeNetwork: undefined as (() => void) | undefined,
  overviewRequestPending: false,
  overviewRequestForceRefresh: false,
  resumeForceRefresh: false,

  async onLoad() {
    this.pageVisible = true;
    const lifecycleRevision = this.lifecycleRevision;
    this.unsubscribeNetwork = subscribeNetworkStatus((online) => {
      this.setData({ offline: !online });
      this.syncPrincipalState();
    });
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    // Named cache policies and season-aware variants keep first paint current
    // without bypassing fresh entry/reporting data.
    await this.loadOverview(false, lifecycleRevision);
  },

  onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed) {
      return this.resumeOverview();
    }
    return undefined;
  },

  async resumeOverview() {
    const lifecycleRevision = this.lifecycleRevision;
    const forceRefresh = this.resumeForceRefresh;
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    this.resumeForceRefresh = false;
    await this.loadOverview(forceRefresh, lifecycleRevision);
  },

  onHide() {
    this.pageVisible = false;
    if (this.overviewRequestPending && this.overviewRequestForceRefresh) {
      this.resumeForceRefresh = true;
    }
    this.overviewRequestPending = false;
    this.overviewRequestForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeForceRefresh = false;
    this.overviewRequestPending = false;
    this.overviewRequestForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
    this.unsubscribeNetwork?.();
  },

  onPullDownRefresh() {
    return this.loadOverview(true).finally(() => wx.stopPullDownRefresh());
  },

  isStale(requestId: number, lifecycleRevision: number): boolean {
    return !this.pageVisible
      || requestId !== this.requestId
      || lifecycleRevision !== this.lifecycleRevision;
  },

  async loadOverview(forceRefresh = false, lifecycleRevision?: number) {
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    this.overviewRequestPending = true;
    this.overviewRequestForceRefresh = forceRefresh;
    try {
      await this.performLoadOverview(forceRefresh, ownerRevision);
    } finally {
      if (this.pageVisible && ownerRevision === this.lifecycleRevision) {
        this.overviewRequestPending = false;
        this.overviewRequestForceRefresh = false;
      }
    }
  },

  async performLoadOverview(forceRefresh: boolean, ownerRevision: number) {
    const requestId = ++this.requestId;
    const loadStart = Date.now();
    this.setData({ loading: true, error: "", leaguesUnavailable: false });

    const previousContext = this.context;
    const context = await getMyFplContext(forceRefresh);
    if (this.isStale(requestId, ownerRevision)) return;
    const app = getApp<IAppOption>();
    const fallbackEvent = previousContext?.currentEvent
      ?? previousContext?.nextEvent
      ?? (Number(app.globalData.gw) || 0);
    const fallbackSeason = previousContext?.season
      ?? (String(app.globalData.season || "") || undefined);
    const event = Number(context.currentEvent ?? context.nextEvent ?? fallbackEvent) || 0;
    const season = context.season ?? fallbackSeason;
    const effectiveContext = context.eventContextAvailable || !event
      ? context
      : {
          ...context,
          season,
          currentEvent: previousContext?.currentEvent
            ?? (Number(app.globalData.currentGw) || undefined)
            ?? event,
          nextEvent: previousContext?.nextEvent
            ?? (Number(app.globalData.nextGw) || undefined),
          utcDeadline: previousContext?.utcDeadline
            ?? app.globalData.utcDeadline
            ?? undefined
        };
    this.context = effectiveContext;

    const cached = readOverviewCache(context.entryId, event, season);
    // Never carry secondary content across principal/event boundaries. Only
    // the same-context cache is allowed to survive while fresh reads settle.
    this.setData({
      teamBrief: cached?.teamBrief ?? null,
      leagueCount: cached?.leagueCount ?? 0,
      leaguesLoaded: cached?.leagueCount !== undefined,
      leaguesUnavailable: false
    });

    if (!context.eventContextAvailable) {
      if (cached) {
        this.setData({
          loading: false,
          eventContextAvailable: true,
          teamBrief: cached.teamBrief,
          ...resolveOverviewLeagueState(null, cached.leagueCount),
          error: "赛季信息刷新失败，当前显示上次成功结果"
        });
        this.syncPrincipalState(true);
        return;
      }
      this.setData({
        loading: false,
        eventContextAvailable: false,
        leaguesLoaded: true,
        error: "赛季信息暂时不可用，请稍后重试"
      });
      this.syncPrincipalState(true);
      return;
    }

    // Render a safe context-only phase immediately. Snapshot and secondary
    // reads continue in parallel, so an unavailable live endpoint never
    // blocks the primary card.
    const initialPhase = deriveMyFplPhase({
      currentEvent: context.currentEvent,
      nextEvent: context.nextEvent,
      nextUtcDeadline: context.utcDeadline,
      now: Date.now()
    });
    this.setData({
      loading: false,
      eventContextAvailable: true,
      phase: initialPhase,
      deadlineText: context.utcDeadline ? formatDeadline(context.utcDeadline) : ""
    });
    // Primary card render: the observability anchor for time-to-phase-card.
    recordMyFplVisit({
      surface: "overview",
      phase: initialPhase,
      eventId: event || undefined,
      cacheOutcome: cached ? "last-good" : "miss",
      durationBucket: durationBucket(Date.now() - loadStart)
    });
    this.syncPrincipalState(true);

    if (!context.entryId) {
      this.setData({
        teamBrief: null,
        leagueCount: 0,
        leaguesLoaded: true,
        leaguesUnavailable: false
      });
      return;
    }

    const secondaryTask = this.loadOverviewSecondary(
      requestId,
      ownerRevision,
      context,
      context.entryId,
      event,
      season,
      cached,
      forceRefresh
    );
    if (forceRefresh) await secondaryTask;
    else void secondaryTask;
  },

  async loadOverviewSecondary(
    requestId: number,
    lifecycleRevision: number,
    context: MyFplContext,
    entryId: number,
    event: number,
    season: string | undefined,
    cached: OverviewCache | null,
    forceRefresh: boolean
  ) {

    // Snapshot and bounded secondary summaries are independent and degrade
    // separately after the primary card is already visible.
    const [snapshotState, briefResult, leagues] = await Promise.all([
      context.currentEvent
        ? getCurrentSnapshotState(context.currentEvent)
        : Promise.resolve(undefined),
      getMyFplTeamBrief(entryId, event, forceRefresh).catch(() => null),
      getMyFplLeagues(entryId, forceRefresh).catch(() => null)
    ]);
    if (this.isStale(requestId, lifecycleRevision)) return;
    if (currentFollowEntryId() !== context.entryId) {
      // A sub-read may recover a 401 and replace the authoritative follow.
      // Clear the old principal immediately, then restart under the new one.
      this.setData({
        teamBrief: null,
        leagueCount: 0,
        leaguesLoaded: false,
        leaguesUnavailable: false
      });
      void this.loadOverview(true);
      return;
    }

    const briefUnavailable = !briefResult
      || (!briefResult.entryAvailable && !briefResult.eventResultAvailable);
    const briefPartial = Boolean(briefResult)
      && !briefUnavailable
      && (!briefResult.entryAvailable || !briefResult.eventResultAvailable);

    const phase = deriveMyFplPhase({
      currentEvent: context.currentEvent,
      nextEvent: context.nextEvent,
      nextUtcDeadline: context.utcDeadline,
      now: Date.now(),
      snapshotState
    });
    if (phase !== this.data.phase) {
      this.setData({ phase });
    }

    if (briefUnavailable && leagues === null) {
      // Total failure: keep last-good and surface a retryable data state.
      this.setData({
        teamBrief: cached?.teamBrief ?? null,
        ...resolveOverviewLeagueState(null, cached?.leagueCount),
        error: cached ? "刷新失败，当前显示上次成功结果" : "加载失败，请稍后重试"
      });
      return;
    }
    const nextBrief = mergeTeamBriefWithCache(briefResult, cached?.teamBrief);
    const leagueState = resolveOverviewLeagueState(leagues, cached?.leagueCount);
    const retainedBrief = (briefUnavailable || briefPartial) && Boolean(cached?.teamBrief);
    const retainedLeagues = leagues === null && cached?.leagueCount !== undefined;
    const partialError = briefUnavailable
      ? retainedBrief ? "球队摘要刷新失败，当前显示上次成功结果" : "球队摘要暂时无法读取"
      : briefPartial
        ? retainedBrief ? "球队摘要部分刷新失败，当前保留上次成功字段" : "球队摘要部分数据暂时无法读取"
      : leagues === null
        ? retainedLeagues ? "联赛摘要刷新失败，当前显示上次成功结果" : "联赛摘要暂时无法读取"
        : "";
    this.setData({
      teamBrief: nextBrief,
      ...leagueState,
      error: partialError
    });
    try {
      if (season) {
        wx.setStorageSync(OVERVIEW_CACHE_KEY, {
          entryId,
          season,
          event,
          teamBrief: nextBrief,
          ...(leagueState.leaguesLoaded ? { leagueCount: leagueState.leagueCount } : {}),
          storedAt: (briefPartial || retainedBrief || retainedLeagues) && cached ? cached.storedAt : Date.now()
        } satisfies OverviewCache);
      }
    } catch { /* cache is best effort */ }
    this.syncPrincipalState();
  },

  syncPrincipalState(principalResolved = false) {
    const context = this.context;
    const event = context?.currentEvent ?? context?.nextEvent ?? 0;
    const hasCachedContent = Boolean(readOverviewCache(context?.entryId, event, context?.season));
    const next = derivePrincipalDisplay({
      entryId: context?.entryId,
      accountLinked: context?.accountLinked ?? false,
      online: !this.data.offline,
      hasCachedContent
    });
    if (next !== this.data.principalState) {
      recordMyFplVisit({
        surface: "overview",
        principalState: next,
        phase: this.data.phase,
        eventId: event || undefined
      });
    }
    this.setData({
      principalState: next,
      ...(principalResolved ? { principalResolved: true } : {})
    });
  },

  onPhasePrimary(event: WechatMiniprogram.CustomEvent<{ phase: MyFplPhase }>) {
    if (this.data.principalState === "NO_FOLLOW") {
      goToEntrySearch();
      return;
    }
    if (event.detail.phase === "LIVE") {
      goToLiveEntry(this.context?.entryId);
      return;
    }
    navigateTo(routes.myFplTeam);
  },

  onPhaseSecondary() {
    // NO_FOLLOW secondary: optional account sync (best effort, never forced).
    navigateTo(routes.accountLink);
  },

  onOpenLeagues() {
    navigateTo(routes.myFplLeagues);
  },

  onRetry() {
    void this.loadOverview(true);
  }
});
