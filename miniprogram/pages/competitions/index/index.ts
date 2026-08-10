import { getMyCompetitionsCompat } from "../../../services/competition.service";
import type { CompetitionListItem } from "../../../models/competition";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { currentFollowEntryId, waitForAuthoritativeFollow } from "../../../utils/follow";
import { listCountBucket } from "../../../utils/competition-state";
import { durationBucket, recordCompetitionVisit } from "../../../utils/perf";
import { routes } from "../../../config/routes";

interface CompetitionsCache {
  entryId: number;
  items: CompetitionListItem[];
  storedAt: number;
}

const LIST_CACHE_KEY = "my-competitions:list";
const SELECTED_TOURNAMENT_ID_KEY = "live-tournamentId";
const SELECTED_TOURNAMENT_NAME_KEY = "live-tournamentName";

function readListCache(entryId: number | undefined): CompetitionsCache | null {
  if (!entryId) {
    return null;
  }
  try {
    const cached = wx.getStorageSync(LIST_CACHE_KEY) as CompetitionsCache | undefined;
    // Same-principal only (§13.1 simplified: the follow pointer is the
    // principal boundary until the signed principal contract ships).
    if (cached && cached.entryId === entryId && Array.isArray(cached.items)) {
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
    items: [] as CompetitionListItem[],
    displayItems: [] as CompetitionListItem[],
    keyword: "",
    fromCache: false
  },

  requestId: 0,
  hasShown: false,

  async onLoad() {
    await waitForAuthoritativeFollow();
    void this.loadList();
  },

  onShow() {
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed) {
      // Website return / team switch: principal and list revalidate (§10.1).
      void this.loadList();
    }
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadList(forceRefresh = false) {
    const requestId = ++this.requestId;
    const loadStart = Date.now();
    const entryId = currentFollowEntryId();

    if (!entryId) {
      this.setData({ loading: false, error: "", entryId: undefined, items: [], displayItems: [], fromCache: false });
      recordCompetitionVisit({
        surface: "list",
        principalState: "NO_FOLLOW",
        contractSource: "compat",
        durationBucket: durationBucket(Date.now() - loadStart)
      });
      return;
    }

    const cached = readListCache(entryId);
    if (cached && !this.data.items.length) {
      this.setData({ items: cached.items, fromCache: true });
      this.syncDisplay();
    }
    this.setData({ loading: !cached, error: "", entryId });

    try {
      const items = await getMyCompetitionsCompat(entryId, forceRefresh);
      if (requestId !== this.requestId) return;
      this.setData({ loading: false, items, fromCache: false });
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
        wx.setStorageSync(LIST_CACHE_KEY, { entryId, items, storedAt: Date.now() } satisfies CompetitionsCache);
      } catch { /* cache is best effort */ }
    } catch (error) {
      if (requestId !== this.requestId) return;
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

  onManageCompetition() {
    const action = canonicalAction("MANAGE_COMPETITION");
    if (openWebsiteAction(action)) {
      recordCompetitionVisit({ surface: "list", contractSource: "compat", handoffActionType: action.actionType });
    }
  },

  onCreateCompetition() {
    // Creation is Website-only (§1); the empty state hands off.
    const action = canonicalAction("CREATE_COMPETITION");
    if (openWebsiteAction(action)) {
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
