import { PerformancePage } from "../../../utils/performance-page";
import { routes } from "../../../config/routes";
import { navigateTo } from "../../../utils/navigation";
import { durationBucket, recordExploreVisit } from "../../../utils/perf";

const PERF_ENTRY_ID = 15702;

interface RouteCard {
  title: string;
  description: string;
  url: string;
}

interface CardGroup {
  title: string;
  cards: RouteCard[];
}

/**
 * Explore overview (plan §7.1). A router page: it carries no destination
 * payloads of its own — cards link out to the physical routes, which stay
 * where they are until the deferred rename (plan A2).
 */
PerformancePage({
  data: {
    contextText: "",
    keyword: "",
    groups: [] as CardGroup[]
  },

  hasShown: false,

  onLoad() {
    const loadStart = Date.now();
    this.buildGroups();
    // First paint of the router page (plan §9): no payload fetch, so no
    // cacheOutcome — just the surface and how long composing the cards took.
    recordExploreVisit({
      surface: "overview",
      contractSource: "compat",
      durationBucket: durationBucket(Date.now() - loadStart)
    });
    this.syncContext();
  },

  onShow() {
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed) {
      this.syncContext();
    }
  },

  refreshContext() {
    this.syncContext();
  },

  /** Season/event context from the launch-populated globalData; when the
   * context read fails the row simply hides — never a fabricated GW. */
  syncContext() {
    const app = getApp<IAppOption>();
    const season = app.globalData.season;
    const currentGw = Number(app.globalData.currentGw);
    const resolvedGw = Number(app.globalData.gw);
    if (!season && !resolvedGw) {
      this.setData({ contextText: "" });
      return;
    }
    const parts: string[] = [];
    if (season) {
      parts.push(`赛季 ${season}`);
    }
    if (Number.isInteger(currentGw) && currentGw > 0) {
      parts.push(`当前 GW ${currentGw}`);
    } else if (Number.isInteger(resolvedGw) && resolvedGw > 0) {
      parts.push(`下轮 GW ${resolvedGw}`);
    }
    this.setData({ contextText: parts.join(" · ") });
  },

  buildGroups() {
    const groups: CardGroup[] = [
      {
        title: "证据",
        cards: [
          { title: "本轮", description: "本轮得分、阵容与梦之队", url: routes.summaryGameweek },
          { title: "赛程", description: "20 队未来赛程 · 主客场与难度", url: routes.exploreFixtures },
          { title: "市场", description: "身价涨跌与球员历史 · 价格模式", url: routes.dataPrice },
          { title: "趋势", description: "已筹备赛事的选择率与转会趋势", url: routes.dataSelections }
        ]
      },
      {
        title: "实体",
        cards: [
          { title: "球员", description: "搜索球员和查看详情", url: routes.dataPlayers },
          { title: "球队", description: "球队阵容、赛程、定位球", url: routes.dataTeams }
        ]
      }
    ];
    const entryId = getApp<IAppOption>().globalData.entryId;
    if (entryId === PERF_ENTRY_ID) {
      groups.push({
        title: "工具",
        cards: [{ title: "性能监控", description: "启动、渲染和 API 响应时间分析", url: routes.performance }]
      });
    }
    this.setData({ groups });
  },

  /** filter-bar fires `search` on every keystroke — that only syncs the
   * local input. Navigation happens on submit (confirm or the 查询 button);
   * the players page then filters its cached directory client-side until
   * the server-bounded playerSearch contract ships (plan §10). */
  onSearch(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.setData({ keyword: event.detail.keyword });
  },

  onSubmitSearch(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    const keyword = (event.detail.keyword || "").trim();
    navigateTo(routes.dataPlayers, keyword ? { keyword } : {});
  },

  onResetSearch() {
    this.setData({ keyword: "" });
  },

  onOpenCard(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { url: string }>) {
    const url = event.currentTarget.dataset.url;
    if (url) {
      navigateTo(url);
    }
  }
});
