import {
  HOME_LEAGUE_PAGE_SIZE,
  pageHomeLeagues,
  partitionHomeEntryLeagues
} from "../../utils/entry-leagues";

interface EntryCardInfo {
  entry?: number;
  entryId?: number;
  playerName?: string;
  entryName?: string;
  teamName?: string;
  region?: string;
  overallRank?: number;
  totalPoints?: number;
  totalTransfers?: number;
  bank?: number;
  teamValue?: number;
}

interface StatRow {
  label: string;
  value: string;
}

interface LeagueRow {
  id: number;
  name: string;
  viewerRank?: number;
  rank?: number;
  officialKind?: string;
  shortName?: string | null;
  type?: string | null;
}

interface LeaguePanel {
  key: "classic" | "h2h";
  title: string;
  total: number;
  items: LeagueRow[];
  hasMore: boolean;
}

function formatNumber(value?: number): string {
  return typeof value === "number" ? String(value) : "-";
}

function formatRank(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}m`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }

  return String(value);
}

function formatCurrency(value?: number): string {
  return typeof value === "number" ? `£${(value / 10).toFixed(1)}m` : "-";
}

function buildPanel(
  key: "classic" | "h2h",
  title: string,
  leagues: LeagueRow[],
  visibleCount: number
): LeaguePanel | null {
  const page = pageHomeLeagues(leagues, visibleCount);
  if (page.total <= 0) {
    return null;
  }
  return {
    key,
    title,
    total: page.total,
    items: page.items,
    hasMore: page.hasMore
  };
}

Component({
  properties: {
    entry: {
      type: Object,
      value: {}
    },
    compact: {
      type: Boolean,
      value: false
    },
    rich: {
      type: Boolean,
      value: false
    },
    leagues: {
      type: Array,
      value: []
    }
  },

  data: {
    statRows: [] as StatRow[],
    classicLeagues: [] as LeagueRow[],
    h2hLeagues: [] as LeagueRow[],
    classicVisibleCount: HOME_LEAGUE_PAGE_SIZE,
    h2hVisibleCount: HOME_LEAGUE_PAGE_SIZE,
    classicPanel: null as LeaguePanel | null,
    h2hPanel: null as LeaguePanel | null,
    hasLeaguePanels: false,
    entryMetaText: "",
    transferText: ""
  },

  observers: {
    "entry, rich": function () {
      this.updateEntryStats();
      this.syncLeaguePanelsFromData();
    },
    leagues: function (leagues: LeagueRow[]) {
      this.applyLeagues(leagues || [], HOME_LEAGUE_PAGE_SIZE, HOME_LEAGUE_PAGE_SIZE);
    }
  },

  lifetimes: {
    attached() {
      this.updateEntryStats();
      this.applyLeagues(
        (this.properties.leagues || []) as LeagueRow[],
        HOME_LEAGUE_PAGE_SIZE,
        HOME_LEAGUE_PAGE_SIZE
      );
    }
  },

  methods: {
    updateEntryStats() {
      const entry = this.properties.entry as EntryCardInfo | undefined;
      const entryId = entry?.entry || entry?.entryId;
      const metaParts = [
        entryId ? `#${entryId}` : "",
        entry?.region || ""
      ].filter(Boolean);

      this.setData({
        entryMetaText: metaParts.join(" · "),
        statRows: [
          { label: "总分", value: formatNumber(entry?.totalPoints) },
          { label: "总排名", value: formatRank(entry?.overallRank) },
          { label: "身价", value: formatCurrency(entry?.teamValue) }
        ]
      });
    },

    applyLeagues(
      leagues: LeagueRow[],
      classicVisibleCount: number,
      h2hVisibleCount: number
    ) {
      const partitioned = partitionHomeEntryLeagues(leagues);
      const classicPanel = this.properties.rich
        ? buildPanel("classic", "Classic", partitioned.classic, classicVisibleCount)
        : null;
      const h2hPanel = this.properties.rich
        ? buildPanel("h2h", "H2H", partitioned.h2h, h2hVisibleCount)
        : null;

      this.setData({
        classicLeagues: partitioned.classic,
        h2hLeagues: partitioned.h2h,
        classicVisibleCount,
        h2hVisibleCount,
        classicPanel,
        h2hPanel,
        hasLeaguePanels: Boolean(classicPanel || h2hPanel)
      });
    },

    syncLeaguePanelsFromData() {
      if (!this.properties.rich) {
        this.setData({
          classicPanel: null,
          h2hPanel: null,
          hasLeaguePanels: false
        });
        return;
      }

      const classicPanel = buildPanel(
        "classic",
        "Classic",
        this.data.classicLeagues as LeagueRow[],
        this.data.classicVisibleCount
      );
      const h2hPanel = buildPanel(
        "h2h",
        "H2H",
        this.data.h2hLeagues as LeagueRow[],
        this.data.h2hVisibleCount
      );
      this.setData({
        classicPanel,
        h2hPanel,
        hasLeaguePanels: Boolean(classicPanel || h2hPanel)
      });
    },

    onLoadMoreClassic() {
      const classicVisibleCount = this.data.classicVisibleCount + HOME_LEAGUE_PAGE_SIZE;
      const classicPanel = buildPanel(
        "classic",
        "Classic",
        this.data.classicLeagues as LeagueRow[],
        classicVisibleCount
      );
      this.setData({
        classicVisibleCount,
        classicPanel,
        hasLeaguePanels: Boolean(classicPanel || this.data.h2hPanel)
      });
    },

    onLoadMoreH2h() {
      const h2hVisibleCount = this.data.h2hVisibleCount + HOME_LEAGUE_PAGE_SIZE;
      const h2hPanel = buildPanel(
        "h2h",
        "H2H",
        this.data.h2hLeagues as LeagueRow[],
        h2hVisibleCount
      );
      this.setData({
        h2hVisibleCount,
        h2hPanel,
        hasLeaguePanels: Boolean(this.data.classicPanel || h2hPanel)
      });
    },

    onOpenAllLeagues() {
      this.triggerEvent("openleagues");
    },

    onOpen() {
      this.triggerEvent("open");
    },

    onChange() {
      this.triggerEvent("change");
    }
  }
});
