import { getMyFplLeagues } from "../../../services/my-fpl.service";
import type { MyFplLeagueBrief } from "../../../models/my-fpl";
import { goToEntrySearch } from "../../../utils/navigation";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { recordMyFplVisit } from "../../../utils/perf";
import { currentFollowEntryId, waitForAuthoritativeFollow } from "../../../utils/follow";

interface LeaguesCache {
  entryId: number;
  season: string;
  leagues: MyFplLeagueBrief[];
  storedAt: number;
}

const LEAGUES_CACHE_KEY = "my-fpl:leagues";

export function readLeaguesCache(
  entryId: number | undefined,
  season: string | undefined
): LeaguesCache | null {
  if (!entryId || !season) {
    return null;
  }
  try {
    const cached = wx.getStorageSync(LEAGUES_CACHE_KEY) as LeaguesCache | undefined;
    // Same-context only: official league membership never crosses a season.
    if (
      cached
      && cached.entryId === entryId
      && cached.season === season
      && Array.isArray(cached.leagues)
    ) {
      return cached;
    }
  } catch { /* no cache */ }
  return null;
}

Page({
  data: {
    loading: true,
    error: "",
    entryId: undefined as number | undefined,
    leagues: [] as MyFplLeagueBrief[],
    displayLeagues: [] as MyFplLeagueBrief[],
    keyword: "",
    fromCache: false
  },

  requestId: 0,
  hasShown: false,
  loadedSeason: undefined as string | undefined,

  async onLoad() {
    await waitForAuthoritativeFollow();
    try { await getApp<IAppOption>().initAppData(true); } catch { /* load without cache identity */ }
    void this.loadLeagues(true);
  },

  async onShow() {
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed) {
      // Re-read the follow pointer after a handoff or team switch (§9).
      try { await getApp<IAppOption>().initAppData(true); } catch { /* retain the last context */ }
      void this.loadLeagues(true);
    }
  },

  async onPullDownRefresh() {
    try { await getApp<IAppOption>().initAppData(true); } catch { /* retain the last context */ }
    await this.loadLeagues(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadLeagues(forceRefresh = false) {
    const requestId = ++this.requestId;
    const entryId = currentFollowEntryId();
    const season = getApp<IAppOption>().globalData.season || undefined;

    if (!entryId) {
      this.loadedSeason = undefined;
      this.setData({ loading: false, error: "", entryId: undefined, leagues: [], displayLeagues: [], fromCache: false });
      return;
    }

    const principalChanged = this.data.entryId !== undefined && this.data.entryId !== entryId;
    const seasonChanged = Boolean(this.loadedSeason && season && this.loadedSeason !== season);
    if (principalChanged || seasonChanged) {
      this.loadedSeason = undefined;
      this.setData({ leagues: [], displayLeagues: [], fromCache: false });
    }
    const cached = readLeaguesCache(entryId, season);
    if (cached && (principalChanged || seasonChanged || !this.data.leagues.length)) {
      this.setData({ leagues: cached.leagues, fromCache: true });
      this.loadedSeason = season;
      this.syncDisplay();
    }
    this.setData({ loading: !cached, error: "", entryId });

    try {
      const leagues = await getMyFplLeagues(entryId, forceRefresh);
      if (requestId !== this.requestId) return;
      const currentSeason = getApp<IAppOption>().globalData.season || undefined;
      if (season !== currentSeason) {
        this.setData({ leagues: [], displayLeagues: [], fromCache: false });
        void this.loadLeagues(true);
        return;
      }
      if (currentFollowEntryId() !== entryId) {
        this.setData({ leagues: [], displayLeagues: [], fromCache: false });
        void this.loadLeagues(true);
        return;
      }
      this.setData({ loading: false, leagues, fromCache: false });
      this.loadedSeason = season;
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
      if (requestId !== this.requestId) return;
      const currentSeason = getApp<IAppOption>().globalData.season || undefined;
      if (season !== currentSeason) {
        this.setData({ leagues: [], displayLeagues: [], fromCache: false });
        void this.loadLeagues(true);
        return;
      }
      if (currentFollowEntryId() !== entryId) {
        this.setData({ leagues: [], displayLeagues: [], fromCache: false });
        void this.loadLeagues(true);
        return;
      }
      this.setData({
        loading: false,
        error: cached
          ? "刷新失败，当前显示上次成功结果"
          : error instanceof Error ? error.message : "联赛加载失败"
      });
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
