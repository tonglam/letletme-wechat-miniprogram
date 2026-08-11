interface NavAction {
  name: string;
  subname: string;
}

interface NavMenu {
  pages: NavAction[];
  url: Record<string, string>;
  show: boolean;
}

const PERF_ENTRY_ID = 15702;

const MENU_MAP: Record<string, NavMenu> = {
  myFpl: {
    pages: [
      { name: "总览", subname: "现在与我的 FPL 最相关的内容" },
      { name: "球队", subname: "阵容、转会、开卡和历史" },
      { name: "联赛", subname: "我的官方 FPL 联赛" }
    ],
    url: {
      总览: "/pages/my-fpl/index/index",
      球队: "/pages/my-fpl/team/team",
      联赛: "/pages/my-fpl/leagues/leagues"
    },
    show: true
  },
  competitions: {
    // One permanent destination at section level — no action sheet (§9.1).
    pages: [],
    url: { 我的赛事: "/pages/competitions/index/index" },
    show: false
  },
  explore: {
    // Explore is one permanent destination: the overview routes onward to
    // the physical pages, which stay put until the deferred rename (plan A2).
    pages: [],
    url: { 探索: "/pages/explore/index/index" },
    show: false
  },
  live: {
    pages: [
      { name: "球队", subname: "查看球队实时得分" },
      { name: "竞赛", subname: "查看竞赛实时得分和排名" },
      { name: "比赛", subname: "查看实时更新的比赛结果" }
    ],
    url: {
      球队: "/pages/live/entry/entry",
      竞赛: "/pages/live/tournament/tournament",
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
  { prefix: "/pages/my-fpl/", active: "myFpl" },
  { prefix: "/pages/competitions/", active: "competitions" },
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
    showPerf: false
  },

  lifetimes: {
    attached() {
      this.syncPerfVisibility();
      this.setActiveFromRoute();
    }
  },

  pageLifetimes: {
    show() {
      this.syncPerfVisibility();
      this.setActiveFromRoute();
    }
  },

  methods: {
    syncPerfVisibility() {
      const entryId = getApp<IAppOption>().globalData.entryId;
      this.setData({ showPerf: entryId === PERF_ENTRY_ID });
    },

    setActiveFromRoute() {
      const activeName = getActiveName(getCurrentRoute()) || this.properties.active || "";
      this.setData({ activeName });
    },

    onChange(event: WechatMiniprogram.CustomEvent) {
      const name = String(event.detail);
      this.setData({ navName: name });

      const menu = MENU_MAP[name];
      if (menu) {
        if (menu.show) {
          this.setData({
            show: true,
            actions: menu.pages
          });
        } else {
          const firstKey = Object.keys(menu.url)[0];
          const url = menu.url[firstKey];
          // Guard on the route, not the active name: destination pages share
          // their group's active name (explore owns gameweek/data routes),
          // and the tab must still return to the section page from them.
          if (url && getCurrentRoute() !== url) {
            wx.redirectTo({ url });
          }
        }
      }
    },

    onClose() {
      this.setData({ show: false });
    },

    onSelect(event: WechatMiniprogram.CustomEvent) {
      const detail = event.detail as NavAction;
      const url = MENU_MAP[this.data.navName] && MENU_MAP[this.data.navName].url[detail.name];
      if (url) {
        wx.redirectTo({ url });
      }
      this.setData({ show: false });
    }
  }
});
