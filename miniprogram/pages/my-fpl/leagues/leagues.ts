import { PerformancePage } from "../../../utils/performance-page";
import { getMyFplLeagues } from "../../../services/my-fpl.service";
import type { MyFplLeagueBrief } from "../../../models/my-fpl";
import { goToEntrySearch } from "../../../utils/navigation";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { recordMyFplVisit } from "../../../utils/perf";
import { currentFollowEntryId, waitForAuthoritativeFollow } from "../../../utils/follow";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

interface LeaguesCache {
  entryId: number;
  season: string;
  leagues: MyFplLeagueBrief[];
  storedAt: number;
}

const LEAGUES_CACHE_KEY = "my-fpl:leagues";

function readStoredLeaguesCache(): LeaguesCache | null {
  try {
    const cached = wx.getStorageSync(LEAGUES_CACHE_KEY) as LeaguesCache | undefined;
    return cached && cached.entryId && cached.season && Array.isArray(cached.leagues) ? cached : null;
  } catch {
    return null;
  }
}

export function readLeaguesCache(
  entryId: number | undefined,
  season: string | undefined
): LeaguesCache | null {
  if (!entryId || !season) {
    return null;
  }
  const cached = readStoredLeaguesCache();
  // Same-context only: official league membership never crosses a known season.
  if (
    cached
    && cached.entryId === entryId
    && cached.season === season
  ) {
    return cached;
  }
  return null;
}

PerformancePage({
  data: {
    loading: true,
    error: "",
    entryId: 0,
    leagues: [] as MyFplLeagueBrief[],
    displayLeagues: [] as MyFplLeagueBrief[],
    keyword: "",
    fromCache: false
  },

  requestId: 0,
  hasShown: false,
  loadedSeason: undefined as string | undefined,
  pageVisible: false,
  lifecycleRevision: 0,
  startupPending: false,
  resumeOnShow: false,
  loadPending: false,
  loadForceRefresh: false,
  resumeForceRefresh: false,

  async onLoad() {
    this.pageVisible = true;
    const lifecycleRevision = this.lifecycleRevision;
    this.startupPending = true;
    const trace = capturePageRequestTrace({ callerSurface: "my-fpl-leagues", trigger: "load" });
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    try { await getApp<IAppOption>().initAppData(false); } catch { /* load without cache identity */ }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    this.startupPending = false;
    await this.loadLeagues(false, trace, lifecycleRevision);
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed || this.resumeOnShow) {
      const forceRefresh = this.resumeForceRefresh;
      const lifecycleRevision = this.lifecycleRevision;
      const trace = capturePageRequestTrace({ callerSurface: "my-fpl-leagues", trigger: "show" });
      // Re-read the follow pointer after a handoff or team switch (§9).
      await waitForAuthoritativeFollow();
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
      try { await getApp<IAppOption>().initAppData(false); } catch { /* retain the last context */ }
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
      this.resumeOnShow = false;
      this.resumeForceRefresh = false;
      await this.loadLeagues(forceRefresh, trace, lifecycleRevision);
    }
  },

  onHide() {
    this.pageVisible = false;
    this.resumeOnShow = this.resumeOnShow || this.startupPending || this.data.loading || this.loadPending;
    if (this.loadPending) {
      this.resumeForceRefresh = this.resumeForceRefresh || this.loadForceRefresh;
    }
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    this.loadPending = false;
    this.loadForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  async onPullDownRefresh() {
    const trace = capturePageRequestTrace({ callerSurface: "my-fpl-leagues", trigger: "refresh" });
    this.loadPending = true;
    this.loadForceRefresh = true;
    try { await getApp<IAppOption>().initAppData(true); } catch { /* retain the last context */ }
    if (!this.pageVisible) return;
    await this.loadLeagues(true, trace).finally(() => wx.stopPullDownRefresh());
  },

  async loadLeagues(
    forceRefresh = false,
    trace: PageRequestTrace | null | undefined = capturePageRequestTrace({
      callerSurface: "my-fpl-leagues",
      trigger: forceRefresh ? "refresh" : "load"
    }),
    lifecycleRevision?: number
  ) {
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    const requestId = ++this.requestId;
    const isActiveRequest = () => this.pageVisible
      && ownerRevision === this.lifecycleRevision
      && requestId === this.requestId;
    const entryId = currentFollowEntryId();
    const season = getApp<IAppOption>().globalData.season || undefined;

    if (!entryId) {
      this.loadedSeason = undefined;
      this.setData({ loading: false, error: "", entryId: 0, leagues: [], displayLeagues: [], fromCache: false });
      return;
    }

    const principalChanged = this.data.entryId > 0 && this.data.entryId !== entryId;
    const seasonChanged = Boolean(this.loadedSeason && season && this.loadedSeason !== season);
    if (principalChanged || seasonChanged) {
      this.loadedSeason = undefined;
      this.setData({ leagues: [], displayLeagues: [], fromCache: false });
    }
    // On a cold offline launch the persisted cache season is the only known
    // identity; keep that last-good view until authoritative context returns.
    const offlineCached = season ? null : readStoredLeaguesCache();
    const cacheSeason = season || offlineCached?.season;
    const cached = readLeaguesCache(entryId, cacheSeason) || (
      offlineCached?.entryId === entryId ? offlineCached : null
    );
    if (cached && (principalChanged || seasonChanged || !this.data.leagues.length)) {
      this.setData({ leagues: cached.leagues, fromCache: true });
      this.loadedSeason = cacheSeason;
      this.syncDisplay();
    }
    this.setData({ loading: !cached, error: "", entryId });
    this.loadPending = true;
    this.loadForceRefresh = forceRefresh;

    try {
      const leagues = await getMyFplLeagues(entryId, forceRefresh, trace);
      if (!isActiveRequest()) return;
      const currentSeason = getApp<IAppOption>().globalData.season || undefined;
      if (season !== currentSeason) {
        this.setData({ leagues: [], displayLeagues: [], fromCache: false });
        void this.loadLeagues(true, trace);
        return;
      }
      if (currentFollowEntryId() !== entryId) {
        this.setData({ leagues: [], displayLeagues: [], fromCache: false });
        void this.loadLeagues(true, trace);
        return;
      }
      this.setData({ loading: false, leagues, fromCache: false });
      this.loadedSeason = currentSeason || cached?.season;
      this.syncDisplay();
      try {
        if (season) {
          wx.setStorageSync(LEAGUES_CACHE_KEY, {
            entryId,
            season,
            leagues,
            storedAt: Date.now()
          } satisfies LeaguesCache);
        }
      } catch { /* cache is best effort */ }
    } catch (error) {
      if (!isActiveRequest()) return;
      const currentSeason = getApp<IAppOption>().globalData.season || undefined;
      if (season !== currentSeason) {
        this.setData({ leagues: [], displayLeagues: [], fromCache: false });
        void this.loadLeagues(true, trace);
        return;
      }
      if (currentFollowEntryId() !== entryId) {
        this.setData({ leagues: [], displayLeagues: [], fromCache: false });
        void this.loadLeagues(true, trace);
        return;
      }
      this.setData({
        loading: false,
        error: cached
          ? "刷新失败，当前显示上次成功结果"
          : error instanceof Error ? error.message : "联赛加载失败"
      });
    } finally {
      if (isActiveRequest()) {
        this.loadPending = false;
        this.loadForceRefresh = false;
      }
    }
  },

  onKeyword(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.setData({ keyword: event.detail.keyword });
    this.syncDisplay();
  },

  onResetSearch() {
    this.setData({ keyword: "" });
    this.syncDisplay();
  },

  /** Client-side filter — league lists are small; server-bounded search is
   * backend-gated (plan §10). */
  syncDisplay() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const displayLeagues = keyword
      ? this.data.leagues.filter((league) => league.name.toLowerCase().includes(keyword))
      : this.data.leagues;
    this.setData({ displayLeagues });
  },

  async onOpenWebsite() {
    // Competition preparation and league management are Website-only (§7.3).
    const action = canonicalAction("LEAGUE_PREPARE");
    if (await openWebsiteAction(action)) {
      recordMyFplVisit({ surface: "leagues", handoffActionType: action.actionType });
    }
  },

  onEmptyAction() {
    goToEntrySearch();
  },

  onRetry() {
    void this.loadLeagues(true);
  }
});
