import {
  getCurrentSnapshotState,
  getMyFplContext,
  getMyFplLeagues,
  getMyFplTeamBrief
} from "../../../services/my-fpl.service";
import type { MyFplContext, MyFplPhase, MyFplTeamBrief } from "../../../models/my-fpl";
import type { MyFplPrincipalState } from "../../../models/principal";
import { deriveMyFplPhase, derivePrincipalDisplay } from "../../../utils/my-fpl-phase";
import { subscribeNetworkStatus } from "../../../utils/live-network";
import { durationBucket, recordMyFplVisit } from "../../../utils/perf";
import { formatDeadline } from "../../../utils/date";
import { goToEntrySearch, goToLiveEntry, navigateTo } from "../../../utils/navigation";
import { routes } from "../../../config/routes";

interface OverviewCache {
  entryId: number;
  event: number;
  teamBrief: MyFplTeamBrief | null;
  leagueCount: number;
  storedAt: number;
}

const OVERVIEW_CACHE_KEY = "my-fpl:overview";

function readOverviewCache(entryId: number | undefined, event: number | undefined): OverviewCache | null {
  if (!entryId || !event) {
    return null;
  }
  try {
    const cached = wx.getStorageSync(OVERVIEW_CACHE_KEY) as OverviewCache | undefined;
    // Same-context only: last-good never crosses principal or event (§11).
    if (cached && cached.entryId === entryId && cached.event === event) {
      return cached;
    }
  } catch { /* no cache */ }
  return null;
}

Page({
  data: {
    loading: true,
    phase: "PRE_DEADLINE" as MyFplPhase,
    principalState: "NO_FOLLOW" as MyFplPrincipalState,
    deadlineText: "",
    teamBrief: null as MyFplTeamBrief | null,
    leagueCount: 0,
    leaguesLoaded: false,
    offline: false,
    error: ""
  },

  context: null as MyFplContext | null,
  requestId: 0,
  hasShown: false,
  unsubscribeNetwork: undefined as (() => void) | undefined,

  onLoad() {
    this.unsubscribeNetwork = subscribeNetworkStatus((online) => {
      this.setData({ offline: !online });
      this.syncPrincipalState();
    });
    void this.loadOverview();
  },

  onShow() {
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed) {
      // Return from the website handoff or team search: re-read the follow
      // pointer before any personal content (§9 return refresh).
      void this.loadOverview();
    }
  },

  onUnload() {
    this.unsubscribeNetwork?.();
  },

  onPullDownRefresh() {
    this.loadOverview(true).finally(() => wx.stopPullDownRefresh());
  },

  isStale(requestId: number): boolean {
    return requestId !== this.requestId;
  },

  async loadOverview(forceRefresh = false) {
    const requestId = ++this.requestId;
    const loadStart = Date.now();
    this.setData({ loading: true, error: "" });

    const context = await getMyFplContext(forceRefresh);
    if (this.isStale(requestId)) return;
    this.context = context;

    const event = context.currentEvent ?? context.nextEvent ?? 0;
    const cached = readOverviewCache(context.entryId, event);
    if (cached) {
      this.setData({ teamBrief: cached.teamBrief, leagueCount: cached.leagueCount });
    }

    // Phase renders from context alone — secondary reads must not block it.
    const snapshotState = context.currentEvent
      ? await getCurrentSnapshotState(context.currentEvent)
      : undefined;
    if (this.isStale(requestId)) return;

    const phase = deriveMyFplPhase({
      currentEvent: context.currentEvent,
      nextEvent: context.nextEvent,
      nextUtcDeadline: context.utcDeadline,
      now: Date.now(),
      snapshotState
    });
    this.setData({
      loading: false,
      phase,
      deadlineText: context.utcDeadline ? formatDeadline(context.utcDeadline) : ""
    });
    // Primary card render: the observability anchor for time-to-phase-card.
    recordMyFplVisit({
      surface: "overview",
      phase,
      eventId: event || undefined,
      cacheOutcome: cached ? "last-good" : "miss",
      durationBucket: durationBucket(Date.now() - loadStart)
    });
    this.syncPrincipalState();

    if (!context.entryId) {
      this.setData({ teamBrief: null, leagueCount: 0, leaguesLoaded: true });
      return;
    }

    // Bounded secondary summaries, independently degraded on failure.
    const [brief, leagues] = await Promise.all([
      getMyFplTeamBrief(context.entryId, event).catch(() => null),
      getMyFplLeagues(context.entryId, forceRefresh).catch(() => null)
    ]);
    if (this.isStale(requestId)) return;

    if (brief === null && leagues === null) {
      // Total failure: keep last-good and surface a retryable data state.
      this.setData({ error: cached ? "刷新失败，当前显示上次成功结果" : "加载失败，请稍后重试" });
      return;
    }
    const nextBrief = brief ?? cached?.teamBrief ?? null;
    const nextLeagueCount = leagues ? leagues.length : cached?.leagueCount ?? 0;
    this.setData({
      teamBrief: nextBrief,
      leagueCount: nextLeagueCount,
      leaguesLoaded: true
    });
    try {
      wx.setStorageSync(OVERVIEW_CACHE_KEY, {
        entryId: context.entryId,
        event,
        teamBrief: nextBrief,
        leagueCount: nextLeagueCount,
        storedAt: Date.now()
      } satisfies OverviewCache);
    } catch { /* cache is best effort */ }
    this.syncPrincipalState();
  },

  syncPrincipalState() {
    const context = this.context;
    const event = context?.currentEvent ?? context?.nextEvent ?? 0;
    const hasCachedContent = Boolean(readOverviewCache(context?.entryId, event));
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
    this.setData({ principalState: next });
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
