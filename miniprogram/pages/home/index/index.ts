import { getMiniProgramNotice, getNextFixture, refreshEventAndDeadline } from "../../../services/common.service";
import { getEntryInfo } from "../../../services/entry.service";
import { getApiSessionToken } from "../../../services/auth.service";
import { getPlayerValues } from "../../../services/price.service";
import { getGameweekStatsForHome } from "../../../services/summary.service";
import type { Fixture } from "../../../models/common";
import type { EntryInfo } from "../../../models/entry";
import type { PlayerValue } from "../../../models/player";
import type { GameweekOverallSummary, SummaryChipPlay } from "../../../models/summary";
import { routes } from "../../../config/routes";
import { goToEntryProfile, goToEntrySearch, navigateTo } from "../../../utils/navigation";
import { formatCountdown, formatDateKey, getDeadlineDiffMs } from "../../../utils/date";
import type { CountdownParts } from "../../../utils/date";
import { formatPrice } from "../../../utils/fpl";

interface HomeData {
  loading: boolean;
  fixtureLoading: boolean;
  fixtureError: string;
  error: string;
  entryError: string;
  entry: EntryInfo;
  fixtureRows: HomeFixtureRow[];
  priceRises: HomePriceChangeRow[];
  priceFalls: HomePriceChangeRow[];
  gameweekStats: HomeStatRow[];
  noticeText: string;
  noticeClosed: boolean;
  gw: number;
  nextGw: number;
  selectedFixtureGw: number;
  minFixtureGw: number;
  deadline: string;
  utcDeadline: string;
  countdown: CountdownParts;
}

interface HomeFixtureRow {
  id: string;
  homeName: string;
  awayName: string;
  kickoffTime: string;
  kickoffLabel: string;
  homeDifficulty?: number;
  awayDifficulty?: number;
  teamId?: number | string;
  againstTeamId?: number | string;
}

interface HomePriceChangeRow {
  id: string;
  name: string;
  team: string;
  position: string;
  oldPrice: string;
  newPrice: string;
  changeText: string;
}

interface HomeStatRow {
  key: string;
  label: string;
  value: string;
}

Page({
  data: {
    loading: false,
    fixtureLoading: false,
    fixtureError: "",
    error: "",
    entryError: "",
    entry: {},
    fixtureRows: [],
    priceRises: [],
    priceFalls: [],
    gameweekStats: [],
    noticeText: "",
    noticeClosed: false,
    gw: 0,
    nextGw: 0,
    selectedFixtureGw: 0,
    minFixtureGw: 0,
    deadline: "",
    utcDeadline: "",
    countdown: formatCountdown(0)
  } as HomeData,

  countdownTimer: undefined as number | undefined,
  _initialLoadDone: false,
  _lastLoadAt: 0,

  async onLoad() {
    this._initialLoadDone = false;
    await this.ensureAppDataReady();
    this.syncAppState();
    this.startCountdown();
    await this.loadPage();
    this._initialLoadDone = true;
  },

  async onShow() {
    if (!this._initialLoadDone) return;
    await this.ensureAppDataReady();
    this.syncAppState();
    // Returning to the tab within a minute keeps the already-loaded data;
    // pull-to-refresh and the deadline rollover still force a reload.
    if (Date.now() - this._lastLoadAt >= 60 * 1000) {
      this.loadPage();
    }
    this.startCountdown();
  },

  onUnload() {
    this.stopCountdown();
  },

  onPullDownRefresh() {
    this.refreshHome().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    if (app.globalData.gw) {
      return;
    }
    await app.initAppData();
  },

  async loadPage(forceRefresh = false) {
    const app = getApp<IAppOption>();
    if (!getApiSessionToken()) {
      // With no valid session the stored follow is only offline/display
      // fallback: the account may have been linked and synced meanwhile, so
      // wait for the refreshed profile before snapshotting the entry. Show
      // the loading state first so the wait never renders placeholder content.
      this.setData({ loading: true });
      try { await app.authReady; } catch {}
    }
    // No followed team only means the entry card renders its empty state —
    // the public sections (fixtures, prices, stats) never depend on it.
    const entryId = app.globalData.entryId;

    if (!app.globalData.gw) {
      await app.initAppData();
    }

    this.syncAppState({ loading: true, error: "", entryError: "" });

    try {
      const fixtureGw = clampFixtureGw(this.data.selectedFixtureGw || app.globalData.nextGw, app.globalData.nextGw);
      const currentGw = app.globalData.gw;
      // entryInfo no longer gates the independent fixtures/prices/stats
      // requests — all four run in parallel, and a failed entry request only
      // marks the team card. The follow itself is never cleared by failures.
      let fixtureError = "";
      let entryError = "";
      const fixtureTask = getNextFixture(fixtureGw, forceRefresh).catch((error) => {
        fixtureError = error instanceof Error ? error.message : "赛程加载失败";
        return [] as Fixture[];
      });
      const entryTask = entryId
        ? getEntryInfo(entryId, forceRefresh).catch((error) => {
            entryError = error instanceof Error ? error.message : "球队信息加载失败";
            return undefined as EntryInfo | undefined;
          })
        : Promise.resolve(undefined as EntryInfo | undefined);
      const [entry, fixtures, priceChanges, gameweekStats] = await Promise.all([
        entryTask,
        fixtureTask,
        getPlayerValues(formatDateKey(), forceRefresh).catch(() => [] as PlayerValue[]),
        getGameweekStatsForHome(currentGw, forceRefresh).catch(() => undefined)
      ]);
      const priceGroups = mapHomePriceChanges(priceChanges);

      this._lastLoadAt = Date.now();
      this.setData({
        fixtureRows: fixtures.map(mapFixtureRow),
        fixtureError,
        entryError,
        priceRises: priceGroups.rises,
        priceFalls: priceGroups.falls,
        gameweekStats: mapHomeGameweekStats(gameweekStats),
        selectedFixtureGw: fixtureGw,
        minFixtureGw: app.globalData.nextGw,
        entry: entry || {}
      });
      this.loadNotice();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "首页加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async refreshHome() {
    this.setData({ loading: true, error: "" });
    try {
      await refreshEventAndDeadline().catch(() => undefined);
      await getApp<IAppOption>().initAppData();
      await this.loadPage(true);
      this.syncAppState();
      this.startCountdown();
      wx.showToast({ title: "刷新成功", icon: "success", duration: 1000 });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "刷新失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  syncAppState(extra: Partial<HomeData> = {}) {
    const app = getApp<IAppOption>();
    this.setData({
      gw: app.globalData.gw,
      nextGw: app.globalData.nextGw,
      minFixtureGw: app.globalData.nextGw,
      selectedFixtureGw: clampFixtureGw(this.data.selectedFixtureGw || app.globalData.nextGw, app.globalData.nextGw),
      deadline: app.globalData.deadline,
      utcDeadline: app.globalData.utcDeadline,
      countdown: formatCountdown(getDeadlineDiffMs(app.globalData.utcDeadline)),
      ...extra
    });
  },

  startCountdown() {
    this.stopCountdown();
    this.updateCountdown();
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000) as unknown as number;
  },

  stopCountdown() {
    if (this.countdownTimer !== undefined) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
  },

  updateCountdown() {
    const ms = getDeadlineDiffMs(this.data.utcDeadline);
    this.setData({ countdown: formatCountdown(ms) });
    if (this.data.utcDeadline && ms <= 0) {
      this.stopCountdown();
      this.refreshHome();
    }
  },

  onRetry() {
    this.loadPage().finally(() => this.startCountdown());
  },

  async loadNotice() {
    const notice = await getMiniProgramNotice().catch(() => "");
    const noticeText = typeof notice === "string" ? notice : "";
    if (this.data.noticeClosed) {
      return;
    }
    this.setData({ noticeText });
  },

  onCloseNotice() {
    this.setData({ noticeClosed: true, noticeText: "" });
  },

  onChangeEntry() {
    goToEntrySearch();
  },

  onGoAccountLink() {
    navigateTo(routes.accountLink);
  },

  onOpenEntry() {
    const entryId = getApp<IAppOption>().globalData.entryId;
    if (entryId) {
      goToEntryProfile(entryId);
    }
  },

  onOpenPriceChanges() {
    navigateTo(routes.dataPrice);
  },

  onPreviousFixtureGw() {
    if (this.data.selectedFixtureGw <= (this.data.minFixtureGw || this.data.nextGw)) {
      return;
    }

    const nextGw = Math.max(this.data.minFixtureGw || this.data.nextGw, this.data.selectedFixtureGw - 1);
    if (nextGw !== this.data.selectedFixtureGw) {
      this.loadFixtureGw(nextGw);
    }
  },

  onNextFixtureGw() {
    if (this.data.selectedFixtureGw >= 38) {
      return;
    }

    const nextGw = Math.min(38, this.data.selectedFixtureGw + 1);
    if (nextGw !== this.data.selectedFixtureGw) {
      this.loadFixtureGw(nextGw);
    }
  },

  async loadFixtureGw(event: number) {
    this.setData({ fixtureLoading: true, fixtureError: "", selectedFixtureGw: event });
    try {
      const fixtures = await getNextFixture(event);
      this.setData({ fixtureRows: fixtures.map(mapFixtureRow) });
    } catch (error) {
      this.setData({
        fixtureRows: [],
        fixtureError: error instanceof Error ? error.message : "赛程加载失败"
      });
    } finally {
      this.setData({ fixtureLoading: false });
    }
  },

  onRetryFixtures() {
    this.loadFixtureGw(this.data.selectedFixtureGw || this.data.nextGw);
  }
});

function mapFixtureRow(fixture: Fixture, index: number): HomeFixtureRow {
  const fixtureWithDifficulty = fixture as Fixture & {
    homeDifficulty?: number;
    awayDifficulty?: number;
  };

  return {
    id: String(fixture.id || `${fixture.teamId || "team"}-${fixture.againstTeamId || "against"}-${index}`),
    homeName: fixture.teamShortName || fixture.homeTeam || fixture.teamName || "-",
    awayName: fixture.againstTeamShortName || fixture.awayTeam || fixture.againstTeamName || "-",
    kickoffTime: fixture.kickoffTime || "",
    kickoffLabel: formatKickoff(fixture.kickoffTime),
    homeDifficulty: fixtureWithDifficulty.homeDifficulty ?? fixture.difficulty,
    awayDifficulty: fixtureWithDifficulty.awayDifficulty,
    teamId: fixture.teamId,
    againstTeamId: fixture.againstTeamId
  };
}

function formatKickoff(value?: string): string {
  if (!value) {
    return "时间待定";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

function clampFixtureGw(value: number, min: number): number {
  return Math.min(38, Math.max(min || 1, value || min || 1));
}

function mapHomePriceChanges(changes: PlayerValue[]): { rises: HomePriceChangeRow[]; falls: HomePriceChangeRow[] } {
  const rows = changes
    .filter((change) => typeof change.lastValue === "number" && typeof change.value === "number")
    .map(mapHomePriceChange);

  return {
    rises: rows
      .filter((row) => row.rawChange > 0)
      .sort((a, b) => b.newValue - a.newValue)
      .slice(0, 5)
      .map(stripPriceSortFields),
    falls: rows
      .filter((row) => row.rawChange < 0)
      .sort((a, b) => a.newValue - b.newValue)
      .slice(0, 5)
      .map(stripPriceSortFields)
  };
}

function mapHomePriceChange(change: PlayerValue): HomePriceChangeRow & { rawChange: number; newValue: number } {
  const oldValue = change.lastValue || 0;
  const newValue = change.value || 0;
  const rawChange = newValue - oldValue;

  return {
    id: String(change.playerId),
    name: change.playerName || "-",
    team: change.teamName || "-",
    position: change.position || "",
    oldPrice: formatPrice(oldValue),
    newPrice: formatPrice(newValue),
    changeText: `${rawChange > 0 ? "+" : "-"}${formatPrice(Math.abs(rawChange))}`,
    rawChange,
    newValue
  };
}

function stripPriceSortFields(row: HomePriceChangeRow & { rawChange: number; newValue: number }): HomePriceChangeRow {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    position: row.position,
    oldPrice: row.oldPrice,
    newPrice: row.newPrice,
    changeText: row.changeText
  };
}

function mapHomeGameweekStats(summary?: GameweekOverallSummary): HomeStatRow[] {
  if (!summary) {
    return [];
  }

  const topChip = (summary.chipPlays || []).reduce<SummaryChipPlay | undefined>((selected, chip) => {
    if (!selected || Number(chip.numberPlayed || 0) > Number(selected.numberPlayed || 0)) {
      return chip;
    }
    return selected;
  }, undefined);

  const rows = [
    {
      key: "highestScore",
      label: "最高分",
      value: formatOptionalNumber(summary.highestScore)
    },
    {
      key: "topScorer",
      label: "最高分球员",
      value: formatTopScorer(summary)
    },
    {
      key: "viceCaptain",
      label: "最多选择队长",
      value: summary.mostCaptainedPlayer?.webName || "-"
    },
    {
      key: "chip",
      label: "开的最多的卡",
      value: topChip ? `${formatChipName(topChip.chipName)} ${formatCompactNumber(topChip.numberPlayed)}` : "-"
    }
  ];

  // Preseason / empty GW: drop placeholder rows so the section hides entirely
  return rows.filter((row) => row.value !== "-" && row.value !== "");
}

function formatTopScorer(summary: GameweekOverallSummary): string {
  const name = summary.topElementInfo?.player?.webName;
  const points = summary.topElementInfo?.points;
  if (!name || typeof points !== "number") {
    return "-";
  }

  return `${name} ${points}`;
}

function formatOptionalNumber(value?: number): string {
  return typeof value === "number" ? String(value) : "-";
}

function formatCompactNumber(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }

  if (value >= 1000000) {
    return `${trimDecimal(value / 1000000)}m`;
  }

  if (value >= 1000) {
    return `${trimDecimal(value / 1000)}k`;
  }

  return String(value);
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatChipName(chipName?: string): string {
  const names: Record<string, string> = {
    bboost: "BB",
    "3xc": "TC",
    wildcard: "WC",
    freehit: "FH",
    manager: "AM"
  };

  return chipName ? names[chipName] || chipName : "-";
}
