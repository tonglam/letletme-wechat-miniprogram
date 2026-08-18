import { PerformancePage } from "../../../utils/performance-page";
import { routes } from "../../../config/routes";
import { goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { ensureAppContext } from "../../../services/app-context.service";
import { getEntryInfo } from "../../../services/entry.service";

PerformancePage({
  data: {
    contextResolved: false,
    entryId: 0,
    entryName: "",
    event: 0,
    currentGw: 0,
    cards: [
      {
        title: "实时球队",
        description: "阵容、队长、替补、开卡和实时分数",
        meta: "实时阵容",
        status: "球队必看",
        url: routes.liveEntry
      },
      {
        title: "实时比赛",
        description: "比赛状态、比分、BPS 和关键事件",
        meta: "比赛中心",
        status: "按状态筛选",
        url: routes.liveMatch
      },
      {
        title: "实时赛事",
        description: "赛事实时排名、搜索和排序",
        meta: "赛事榜",
        status: "支持切换",
        url: routes.liveTournament
      }
    ]
  },

  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,

  onLoad() {
    this.pageVisible = true;
    return this.loadContext("page-load");
  },

  onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return undefined;
    return this.loadContext("page-show");
  },

  onHide() {
    this.pageVisible = false;
    this.lifecycleRevision += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.lifecycleRevision += 1;
  },

  async loadContext(reason: "page-load" | "page-show") {
    const lifecycleRevision = this.lifecycleRevision;
    try {
      await ensureAppContext({ reason });
    } catch {
      // Keep the landing page usable with the last normalized app state.
    }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    const app = getApp<IAppOption>();
    const entryId = app.globalData.entryId ?? 0;
    let entryName = this.data.entryName || "";
    if (entryId && !entryName) {
      try {
        const entry = await getEntryInfo(entryId);
        entryName = entry.entryName || entry.teamName || "";
      } catch {
        entryName = "";
      }
    }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    this.setData({
      contextResolved: true,
      entryId,
      entryName: entryId ? entryName : "",
      event: app.globalData.gw,
      currentGw: app.globalData.currentGw || 0
    });
  },

  onOpenEntryStrip() {
    if (this.data.entryId) {
      navigateTo(routes.liveEntry);
      return;
    }

    goToEntrySearch();
  },

  onOpenCard(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { url: string }>) {
    // Cards always open — entry-scoped destinations render their own
    // no-entry empty state instead of blocking navigation here.
    navigateTo(event.currentTarget.dataset.url);
  }
});
