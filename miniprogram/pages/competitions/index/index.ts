import { PerformancePage } from "../../../utils/performance-page";
import { getMyCompetitionsCompat } from "../../../services/competition.service";
import type { CompetitionListItem } from "../../../models/competition";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { currentFollowEntryId, waitForAuthoritativeFollow } from "../../../utils/follow";
import { listCountBucket } from "../../../utils/competition-state";
import { durationBucket, recordCompetitionVisit } from "../../../utils/perf";
import { routes } from "../../../config/routes";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

interface CompetitionsCache {
  entryId: number;
  season: string;
  items: CompetitionListItem[];
  storedAt: number;
}

const LIST_CACHE_KEY = "my-competitions:list";
const SELECTED_TOURNAMENT_ID_KEY = "live-tournamentId";
const SELECTED_TOURNAMENT_NAME_KEY = "live-tournamentName";

function readStoredListCache(): CompetitionsCache | null {
  try {
    const cached = wx.getStorageSync(LIST_CACHE_KEY) as CompetitionsCache | undefined;
    return cached && cached.entryId && cached.season && Array.isArray(cached.items) ? cached : null;
  } catch {
    return null;
  }
}

export function readListCache(
  entryId: number | undefined,
  season: string | undefined
): CompetitionsCache | null {
  if (!entryId || !season) {
    return null;
  }
  const cached = readStoredListCache();
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
    items: [] as CompetitionListItem[],
    displayItems: [] as CompetitionListItem[],
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

  async onLoad() {
    this.pageVisible = true;
    const lifecycleRevision = this.lifecycleRevision;
    this.startupPending = true;
    const trace = capturePageRequestTrace({ callerSurface: "competitions", trigger: "load" });
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    try { await getApp<IAppOption>().initAppData(false); } catch { /* load without cache identity */ }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    this.startupPending = false;
    await this.loadList(false, trace, lifecycleRevision);
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed || this.resumeOnShow) {
      this.resumeOnShow = false;
      const lifecycleRevision = this.lifecycleRevision;
      const trace = capturePageRequestTrace({ callerSurface: "competitions", trigger: "show" });
      // Website return / team switch: principal and list revalidate (§10.1).
      await waitForAuthoritativeFollow();
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
      try { await getApp<IAppOption>().initAppData(false); } catch { /* retain the last context */ }
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
      await this.loadList(false, trace, lifecycleRevision);
    }
  },

  onHide() {
    this.pageVisible = false;
    this.resumeOnShow = this.startupPending || this.data.loading;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  async onPullDownRefresh() {
    const trace = capturePageRequestTrace({ callerSurface: "competitions", trigger: "refresh" });
    try { await getApp<IAppOption>().initAppData(true); } catch { /* retain the last context */ }
    await this.loadList(true, trace).finally(() => wx.stopPullDownRefresh());
  },

  async loadList(
    forceRefresh = false,
    trace: PageRequestTrace | null | undefined = capturePageRequestTrace({
      callerSurface: "competitions",
      trigger: forceRefresh ? "refresh" : "load"
    }),
    lifecycleRevision?: number
  ) {
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    const requestId = ++this.requestId;
    const isActiveRequest = () => this.pageVisible
      && ownerRevision === this.lifecycleRevision
      && requestId === this.requestId;
    const loadStart = Date.now();
    const entryId = currentFollowEntryId();
    const season = getApp<IAppOption>().globalData.season || undefined;

    if (!entryId) {
      this.loadedSeason = undefined;
      this.setData({ loading: false, error: "", entryId: 0, items: [], displayItems: [], fromCache: false });
      recordCompetitionVisit({
        surface: "list",
        principalState: "NO_FOLLOW",
        contractSource: "compat",
        durationBucket: durationBucket(Date.now() - loadStart)
      });
      return;
    }

    const principalChanged = this.data.entryId > 0 && this.data.entryId !== entryId;
    const seasonChanged = Boolean(this.loadedSeason && season && this.loadedSeason !== season);
    if (principalChanged || seasonChanged) {
      this.loadedSeason = undefined;
      this.setData({ items: [], displayItems: [], fromCache: false });
    }
    // If the authoritative context is unavailable (typically a cold offline
    // launch), the cache's own season is the only safe identity we have. Keep
    // it as a last-good view until the next successful context refresh.
    const offlineCached = season ? null : readStoredListCache();
    const cacheSeason = season || offlineCached?.season;
    const cached = readListCache(entryId, cacheSeason) || (
      offlineCached?.entryId === entryId ? offlineCached : null
    );
    if (cached && (principalChanged || seasonChanged || !this.data.items.length)) {
      this.setData({ items: cached.items, fromCache: true });
      this.loadedSeason = cacheSeason;
      this.syncDisplay();
    }
    this.setData({ loading: !cached, error: "", entryId });

    try {
      const items = await getMyCompetitionsCompat(entryId, forceRefresh, trace);
      if (!isActiveRequest()) return;
      const currentSeason = getApp<IAppOption>().globalData.season || undefined;
      if (season !== currentSeason) {
        this.setData({ items: [], displayItems: [], fromCache: false });
        void this.loadList(true, trace);
        return;
      }
      if (currentFollowEntryId() !== entryId) {
        // A 401 recovery can authoritatively change the followed entry while
        // this request is in flight. Never paint/cache the old principal.
        this.setData({ items: [], displayItems: [], fromCache: false });
        void this.loadList(true, trace);
        return;
      }
      this.setData({ loading: false, items, fromCache: false });
      this.loadedSeason = currentSeason || cached?.season;
      this.syncDisplay();
      recordCompetitionVisit({
        surface: "list",
        principalState: "READY",
        contractSource: "compat",
        listCountBucket: listCountBucket(items.length),
        cacheOutcome: cached ? "last-good" : "miss",
        durationBucket: durationBucket(Date.now() - loadStart)
      });
      try {
        if (season) {
          wx.setStorageSync(LIST_CACHE_KEY, {
            entryId,
            season,
            items,
            storedAt: Date.now()
          } satisfies CompetitionsCache);
        }
      } catch { /* cache is best effort */ }
    } catch (error) {
      if (!isActiveRequest()) return;
      const currentSeason = getApp<IAppOption>().globalData.season || undefined;
      if (season !== currentSeason) {
        this.setData({ items: [], displayItems: [], fromCache: false });
        void this.loadList(true, trace);
        return;
      }
      if (currentFollowEntryId() !== entryId) {
        this.setData({ items: [], displayItems: [], fromCache: false });
        void this.loadList(true, trace);
        return;
      }
      // No previous data plus failure renders unavailable/retry, not an
      // empty list (§13.2).
      this.setData({
        loading: false,
        error: cached
          ? "刷新失败，当前显示上次成功结果"
          : error instanceof Error ? error.message : "赛事加载失败"
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

  /** Client-side filter — the authorized list is small; server-bounded
   * search arrives with the myCompetitions contract (plan §9). */
  syncDisplay() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const displayItems = keyword
      ? this.data.items.filter((item) => item.name.toLowerCase().includes(keyword))
      : this.data.items;
    this.setData({ displayItems });
  },

  onOpenCompetition(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { index: number }>) {
    const item = this.data.displayItems[Number(event.currentTarget.dataset.index)];
    if (!item) {
      return;
    }
    // Current results are owned by Live (§2.2/A7): preselect the object so
    // the Live competitions page restores it, then navigate.
    try {
      wx.setStorageSync(SELECTED_TOURNAMENT_ID_KEY, item.competitionId);
      wx.setStorageSync(SELECTED_TOURNAMENT_NAME_KEY, item.name);
    } catch { /* preselect is best effort; the page defaults sanely */ }
    navigateTo(routes.liveTournament);
  },

  async onManageCompetition() {
    const action = canonicalAction("MANAGE_COMPETITION");
    if (await openWebsiteAction(action)) {
      recordCompetitionVisit({ surface: "list", contractSource: "compat", handoffActionType: action.actionType });
    }
  },

  async onCreateCompetition() {
    // Creation is Website-only (§1); the empty state hands off.
    const action = canonicalAction("CREATE_COMPETITION");
    if (await openWebsiteAction(action)) {
      recordCompetitionVisit({ surface: "list", contractSource: "compat", handoffActionType: action.actionType });
    }
  },

  onEmptyAction() {
    goToEntrySearch();
  },

  onRetry() {
    void this.loadList(true);
  }
});
