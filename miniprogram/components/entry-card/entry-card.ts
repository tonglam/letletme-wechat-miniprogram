import {
  HOME_LEAGUE_PAGE_SIZE,
  pageHomeLeagues,
  partitionHomeEntryLeagues
} from "../../utils/entry-leagues";
import { formatHomeH2HMatchup } from "../../utils/home-h2h";
import { formatRank } from "../../utils/summary-format";
import type { HomeH2HDisplay } from "../../utils/home-h2h";
import {
  exportHomeLeaguesShareImage,
  presentHomeLeaguesShareImage,
  type HomeLeaguesShareClassicRow,
  type HomeLeaguesShareH2HRow,
} from "../../utils/home-leagues-share-image";
import type { HomeH2HMatchup } from "../../models/entry";

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
  id: number | string;
  name: string;
  viewerRank?: number;
  rank?: number;
  officialKind?: string;
  shortName?: string | null;
  type?: string | null;
  tournamentId?: number;
  visibility?: string | null;
  movement?: { direction?: string; places?: number | null } | null;
  h2hMatchup?: HomeH2HMatchup | null;
}

interface LeagueDisplayRow extends LeagueRow {
  rankText: string;
  movementText: string;
  movementClass: string;
  visibilityText: string;
  visibilityClass: string;
  h2h: HomeH2HDisplay | null;
}

interface LeaguePanel {
  key: "classic" | "h2h";
  title: string;
  total: number;
  items: LeagueDisplayRow[];
  hasMore: boolean;
}

function formatNumber(value?: number): string {
  return typeof value === "number" ? String(value) : "-";
}

function formatCurrency(value?: number): string {
  return typeof value === "number" ? `£${(value / 10).toFixed(1)}m` : "-";
}

/** Web PersonalLeagueRankList parity: ↑N / ↓N movement next to the rank. */
function formatMovement(
  movement?: { direction?: string; places?: number | null } | null
): { movementText: string; movementClass: string } {
  const places = Number(movement?.places) || 0;
  const direction = String(movement?.direction || "").toUpperCase();
  if (direction === "UP" && places > 0) {
    return { movementText: `↑${places}`, movementClass: "movement-up" };
  }
  if (direction === "DOWN" && places > 0) {
    return { movementText: `↓${places}`, movementClass: "movement-down" };
  }
  return { movementText: "", movementClass: "" };
}

/** Web LeagueVisibilityBadge parity: classic rows lead with a 公开/私人 pill. */
function formatVisibility(
  visibility?: string | null
): { visibilityText: string; visibilityClass: string } {
  const value = String(visibility || "").toUpperCase();
  if (value === "PUBLIC") {
    return { visibilityText: "公开", visibilityClass: "visibility-public" };
  }
  if (value === "PRIVATE") {
    return { visibilityText: "私人", visibilityClass: "visibility-private" };
  }
  return { visibilityText: "", visibilityClass: "" };
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
  const toDisplayRow = (league: LeagueRow): LeagueDisplayRow => {
    const rank = league.viewerRank ?? league.rank;
    return {
      ...league,
      rankText: typeof rank === "number" ? `#${rank}` : "",
      ...formatMovement(league.movement),
      ...formatVisibility(league.visibility),
      h2h: key === "h2h" && league.h2hMatchup
        ? formatHomeH2HMatchup(league.h2hMatchup)
        : null
    };
  };
  return {
    key,
    title,
    total: page.total,
    items: page.items.map(toDisplayRow),
    hasMore: page.hasMore
  };
}

/** Share rows reuse the same display shaping as the visible panels. */
function toClassicShareRow(league: LeagueRow): HomeLeaguesShareClassicRow {
  const movement = formatMovement(league.movement);
  const visibility = formatVisibility(league.visibility);
  const rank = league.viewerRank ?? league.rank;
  return {
    name: league.name,
    badgeText: visibility.visibilityText,
    badgePublic: visibility.visibilityClass === "visibility-public",
    rankText: typeof rank === "number" ? `#${rank}` : "",
    movementText: movement.movementText,
    movementTone:
      movement.movementClass === "movement-up"
        ? "up"
        : movement.movementClass === "movement-down"
          ? "down"
          : ""
  };
}

function toH2HShareRow(league: LeagueRow): HomeLeaguesShareH2HRow {
  const display = league.h2hMatchup
    ? formatHomeH2HMatchup(league.h2hMatchup)
    : null;
  const rank = league.viewerRank ?? league.rank;
  const rankText = typeof rank === "number" ? `#${rank}` : "";
  return {
    name: league.name,
    metaText: display
      ? [display.eventLabel, display.statusLabel, rankText]
          .filter((part) => part)
          .join(" · ")
      : rankText,
    hasMatchup: Boolean(display),
    viewerName: display?.viewer.primary || "",
    opponentName: display?.opponent.primary || "",
    centerText: display?.centerLabel || ""
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
    shareImageBusy: false,
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
          { label: "身价", value: formatCurrency(entry?.teamValue) },
          { label: "银行", value: formatCurrency(entry?.bank) }
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

    /** Web PersonalLeagueCarousel shares the panel as an image (image-only). */
    async onShareLeagueImage(
      event: WechatMiniprogram.BaseEvent<
        WechatMiniprogram.IAnyObject,
        { panel?: string }
      >
    ) {
      const panel = event.currentTarget.dataset.panel === "h2h" ? "h2h" : "classic";
      if (this.data.shareImageBusy) return;
      // Share the panel's full league list (web shares the slide's full
      // content, not the visible preview page).
      const leagues = (
        panel === "h2h" ? this.data.h2hLeagues : this.data.classicLeagues
      ) as LeagueRow[];
      if (!leagues.length) {
        wx.showToast({ title: "暂无可分享的联赛", icon: "none" });
        return;
      }
      this.setData({ shareImageBusy: true });
      try {
        const entry = (this.properties.entry || {}) as EntryCardInfo;
        const path = await exportHomeLeaguesShareImage({
          kind: panel,
          entryName: entry.entryName || entry.teamName || "",
          playerName: entry.playerName || "",
          total: leagues.length,
          classicRows: panel === "classic" ? leagues.map(toClassicShareRow) : [],
          h2hRows: panel === "h2h" ? leagues.map(toH2HShareRow) : []
        });
        await presentHomeLeaguesShareImage(path);
      } catch {
        wx.showToast({ title: "图片生成失败", icon: "none" });
      } finally {
        this.setData({ shareImageBusy: false });
      }
    },

    onOpen() {
      this.triggerEvent("open");
    },

    onChange() {
      this.triggerEvent("change");
    }
  }
});
