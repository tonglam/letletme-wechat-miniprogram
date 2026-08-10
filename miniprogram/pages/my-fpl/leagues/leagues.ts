import { getMyFplLeagues } from "../../../services/my-fpl.service";
import type { MyFplLeagueBrief } from "../../../models/my-fpl";
import { goToEntrySearch } from "../../../utils/navigation";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { storageKeys } from "../../../config/storage-keys";

interface LeaguesCache {
  entryId: number;
  leagues: MyFplLeagueBrief[];
  storedAt: number;
}

const LEAGUES_CACHE_KEY = "my-fpl:leagues";

function readLeaguesCache(entryId: number | undefined): LeaguesCache | null {
  if (!entryId) {
    return null;
  }
  try {
    const cached = wx.getStorageSync(LEAGUES_CACHE_KEY) as LeaguesCache | undefined;
    // Same-principal only: league lists never cross the follow pointer (§11).
    if (cached && cached.entryId === entryId && Array.isArray(cached.leagues)) {
      return cached;
    }
  } catch { /* no cache */ }
  return null;
}

function currentEntryId(): number | undefined {
  try {
    const appEntryId = Number(getApp<IAppOption>().globalData.entryId);
    if (Number.isInteger(appEntryId) && appEntryId > 0) {
      return appEntryId;
    }
  } catch { /* app not ready */ }
  try {
    const stored = Number(wx.getStorageSync(storageKeys.entryId));
    return Number.isInteger(stored) && stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
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

  onLoad() {
    void this.loadLeagues();
  },

  onShow() {
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed) {
      // Re-read the follow pointer after a handoff or team switch (§9).
      void this.loadLeagues();
    }
  },

  onPullDownRefresh() {
    this.loadLeagues(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadLeagues(forceRefresh = false) {
    const requestId = ++this.requestId;
    const entryId = currentEntryId();

    if (!entryId) {
      this.setData({ loading: false, error: "", entryId: undefined, leagues: [], displayLeagues: [], fromCache: false });
      return;
    }

    const cached = readLeaguesCache(entryId);
    if (cached && !this.data.leagues.length) {
      this.setData({ leagues: cached.leagues, fromCache: true });
      this.syncDisplay();
    }
    this.setData({ loading: !cached, error: "", entryId });

    try {
      const leagues = await getMyFplLeagues(entryId, forceRefresh);
      if (requestId !== this.requestId) return;
      this.setData({ loading: false, leagues, fromCache: false });
      this.syncDisplay();
      try {
        wx.setStorageSync(LEAGUES_CACHE_KEY, { entryId, leagues, storedAt: Date.now() } satisfies LeaguesCache);
      } catch { /* cache is best effort */ }
    } catch (error) {
      if (requestId !== this.requestId) return;
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

  onOpenWebsite() {
    // Competition preparation and league management are Website-only (§7.3).
    openWebsiteAction(canonicalAction("LEAGUE_PREPARE"));
  },

  onEmptyAction() {
    goToEntrySearch();
  },

  onRetry() {
    void this.loadLeagues(true);
  }
});
