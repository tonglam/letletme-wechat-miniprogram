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
  live: {
    pages: [
      { name: "球队", subname: "查看球队实时得分" },
      { name: "联赛", subname: "查看联赛实时得分和排名" },
      { name: "比赛", subname: "查看实时更新的比赛结果" }
    ],
    url: {
      球队: "/pages/live/entry/entry",
      联赛: "/pages/live/tournament/tournament",
      比赛: "/pages/live/match/match"
    },
    show: true
  },
  summary: {
    pages: [
      { name: "比赛周", subname: "查看比赛周总体数据" },
      { name: "球队", subname: "查看球队统计数据" },
      { name: "联赛", subname: "查看联赛统计数据" }
    ],
    url: {
      比赛周: "/pages/summary/gameweek/gameweek",
      球队: "/pages/summary/entry/entry",
      联赛: "/pages/summary/tournament/tourment"
    },
    show: true
  },
  data: {
    pages: [
      { name: "身价变化", subname: "查看每日价格涨跌" },
      { name: "阵容选择", subname: "查看联赛选择率和转会趋势" },
      { name: "球员数据", subname: "查看球员数据" },
      { name: "球队数据", subname: "查看球队数据" }
    ],
    url: {
      身价变化: "/pages/data/price/price",
      阵容选择: "/pages/data/selections/selections",
      球员数据: "/pages/data/players/players",
      球队数据: "/pages/data/teams/teams"
    },
    show: true
  },
  perf: {
    pages: [],
    url: { 性能监控: "/pages/performance/index/index" },
    show: false
  }
};

const ROUTE_GROUPS = [
  { prefix: "/pages/live/", active: "live" },
  { prefix: "/pages/summary/", active: "summary" },
  { prefix: "/pages/data/", active: "data" },
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
          if (url && name !== this.data.activeName) {
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
