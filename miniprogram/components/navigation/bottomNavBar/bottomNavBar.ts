import { getMiniProgramEnv } from "../../../config/env";

interface NavAction {
  name: string;
  subname: string;
}

interface NavMenu {
  pages: NavAction[];
  url: Record<string, string>;
  show: boolean;
}

interface NavTab {
  name: string;
  icon: string;
  label: string;
}

const TABS: NavTab[] = [
  { name: "live", icon: "fire-o", label: "实时" },
  { name: "myFpl", icon: "user-o", label: "我的FPL" },
  { name: "explore", icon: "guide-o", label: "探索" },
  { name: "me", icon: "manager-o", label: "我" }
];

const PERF_TAB: NavTab = { name: "perf", icon: "chart-trending-o", label: "性能" };

const MENU_MAP: Record<string, NavMenu> = {
  me: {
    // One permanent destination at section level — no action sheet (§9.1).
    pages: [],
    url: { 管理: "/pages/account/index/index" },
    show: false
  },
  myFpl: {
    pages: [
      { name: "球队", subname: "阵容、转会、开卡和历史" },
      { name: "联赛", subname: "我的官方 FPL 联赛" }
    ],
    url: {
      球队: "/pages/my-fpl/team/team",
      联赛: "/pages/my-fpl/leagues/leagues"
    },
    show: true
  },
  explore: {
    // Web-aligned section menu (web nav: gameweek / fixtures / market /
    // trends / players). Destinations are physical pages; there is no
    // explore landing page, same as the web.
    pages: [
      { name: "本轮", subname: "本轮得分、阵容与梦之队" },
      { name: "赛程", subname: "20 队未来赛程 · 主客场" },
      { name: "市场", subname: "转会台：身价、持有和出场状态" },
      { name: "趋势", subname: "已筹备赛事的选择率与转会趋势" },
      { name: "球员", subname: "搜索球员和查看详情" }
    ],
    url: {
      本轮: "/pages/summary/gameweek/gameweek",
      赛程: "/pages/explore/fixtures/fixtures",
      市场: "/pages/data/price/price",
      趋势: "/pages/data/selections/selections",
      球员: "/pages/data/players/players"
    },
    show: true
  },
  live: {
    pages: [
      { name: "球队", subname: "查看球队实时得分" },
      { name: "赛事", subname: "查看赛事实时得分和排名" },
      { name: "比赛", subname: "查看实时更新的比赛结果" }
    ],
    url: {
      球队: "/pages/live/entry/entry",
      赛事: "/pages/live/tournament/tournament",
      比赛: "/pages/live/match/match"
    },
    show: true
  },
  perf: {
    pages: [],
    url: { 性能监控: "/pages/performance/index/index" },
    show: false
  }
};

// Order matters: the first matching prefix wins. /pages/summary/gameweek is
// Explore's 本轮 destination; the remaining /pages/summary/ routes are
// compat-only (plan A3) and intentionally highlight no tab.
const ROUTE_GROUPS = [
  { prefix: "/pages/account/", active: "me" },
  { prefix: "/pages/my-fpl/", active: "myFpl" },
  { prefix: "/pages/summary/gameweek", active: "explore" },
  { prefix: "/pages/explore/", active: "explore" },
  { prefix: "/pages/data/", active: "explore" },
  { prefix: "/pages/live/", active: "live" },
  { prefix: "/pages/performance/", active: "perf" }
];

function getCurrentRoute(): string {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  return page ? "/" + page.route : "";
}

function getActiveName(route: string): string {
  const group = ROUTE_GROUPS.find(function (item) {
    return route.startsWith(item.prefix);
  });
  return group ? group.active : "";
}

Component({
  properties: {
    active: {
      type: String,
      value: ""
    }
  },

  data: {
    activeName: "",
    show: false,
    actions: [] as NavAction[],
    navName: "",
    showPerf: false,
    tabs: TABS,
    edgeVisible: false
  },

  lifetimes: {
    attached() {
      this.syncPerfVisibility();
      this.setActiveFromRoute();
      this.scheduleEdgeReveal();
    },
    detached() {
      this.clearEdgeReveal();
    }
  },

  pageLifetimes: {
    show() {
      this.syncPerfVisibility();
      this.setActiveFromRoute();
      this.scheduleEdgeReveal();
    },
    hide() {
      this.clearEdgeReveal();
      if (this.data.edgeVisible) this.setData({ edgeVisible: false });
    }
  },

  methods: {
    syncPerfVisibility() {
      const showPerf = getMiniProgramEnv() !== "release";
      this.setData({
        showPerf,
        tabs: showPerf ? TABS.concat(PERF_TAB) : TABS
      });
    },

    onTapTab(event: WechatMiniprogram.TouchEvent) {
      const name = String(event.currentTarget.dataset.name || "");
      this.applyTabChange(name);
    },

    setActiveFromRoute() {
      const activeName = getActiveName(getCurrentRoute()) || this.properties.active || "";
      this.setData({ activeName });
    },

    onChange(event: WechatMiniprogram.CustomEvent) {
      this.applyTabChange(String(event.detail));
    },

    applyTabChange(name: string) {
      this.setData({ navName: name });

      const menu = MENU_MAP[name];
      if (menu) {
        if (menu.show) {
          this.clearEdgeReveal();
          this.setData({
            show: true,
            actions: menu.pages,
            edgeVisible: false
          });
        } else {
          const firstKey = Object.keys(menu.url)[0];
          const url = menu.url[firstKey];
          // Guard on the route, not the active name: destination pages share
          // their group's active name (explore owns gameweek/data routes),
          // and the tab must still return to the section page from them.
          if (url && getCurrentRoute() !== url) {
            this.clearEdgeReveal();
            this.setData({ edgeVisible: false });
            wx.redirectTo({ url });
          }
        }
      }
    },

    onClose() {
      this.setData({ show: false });
      this.scheduleEdgeReveal();
    },

    onSelect(event: WechatMiniprogram.CustomEvent) {
      const detail = event.detail as NavAction;
      const url = MENU_MAP[this.data.navName] && MENU_MAP[this.data.navName].url[detail.name];
      this.clearEdgeReveal();
      this.setData({ edgeVisible: false });
      if (url && getCurrentRoute() !== url) {
        // Keep the sheet open until this page unloads so the electric edge
        // does not flash back during redirect.
        wx.redirectTo({ url });
        return;
      }
      this.setData({ show: false });
      this.scheduleEdgeReveal();
    },

    scheduleEdgeReveal() {
      this.clearEdgeReveal();
      const host = this as WechatMiniprogram.Component.TrivialInstance & { edgeRevealTimer?: number };
      host.edgeRevealTimer = setTimeout(() => {
        host.edgeRevealTimer = 0;
        if (!this.data.show && !this.data.edgeVisible) {
          this.setData({ edgeVisible: true });
        }
      }, 360) as unknown as number;
    },

    clearEdgeReveal() {
      const host = this as WechatMiniprogram.Component.TrivialInstance & { edgeRevealTimer?: number };
      if (host.edgeRevealTimer) {
        clearTimeout(host.edgeRevealTimer);
        host.edgeRevealTimer = 0;
      }
    }
  }
});
