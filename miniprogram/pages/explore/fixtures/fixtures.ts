import { PerformancePage } from "../../../utils/performance-page";
import { getFixtureWindow } from "../../../services/fixture.service";
import { getTeamList } from "../../../services/common.service";
import type { Fixture } from "../../../models/common";
import {
  buildFixtureRunCells,
  buildFixtureRuns,
  normalizeHorizon,
  sortFixtureRuns,
  summarizeFixtureRun,
  type FixtureRun,
  type FixtureRunChip,
  type FixtureRunSort,
  type FixtureRunTeam
} from "../../../utils/fixture-run";
import { durationBucket, recordExploreVisit } from "../../../utils/perf";
import { capturePageRequestTrace } from "../../../services/graphql.service";

type FixturesErrorWorkload = "home" | "fixtures" | "player-stats";

function workloadForFixturesError(
  error: unknown,
  season?: string,
): FixturesErrorWorkload {
  const workload =
    error && typeof error === "object"
      ? (error as { rateLimitWorkload?: unknown }).rateLimitWorkload
      : undefined;
  if (workload === "player-stats") return "player-stats";
  return season ? "fixtures" : "home";
}

const FALLBACK_MAX_EVENT = 38;

export interface FixtureRunCardCell {
  key: string;
  event: number;
  blank: boolean;
  double: boolean;
  chips: FixtureRunChip[];
}

export interface FixtureRunCard {
  teamId: number;
  teamName: string;
  avgText: string;
  avgClass: string;
  metaText: string;
  cells: FixtureRunCardCell[];
}

export interface FixtureGlanceCard {
  key: string;
  label: string;
  valueText: string;
  valueClass: string;
  subText: string;
  sort: FixtureRunSort | "";
}

/** The web colors aggregate numbers by their rounded 1-5 difficulty band. */
function fdrBandClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const clamped = Math.min(5, Math.max(1, Math.round(value)));
  return `fdr-${clamped}`;
}

function buildGlanceCards(runs: FixtureRun[]): FixtureGlanceCard[] {
  let best: { teamName: string; avg: number } | null = null;
  let worst: { teamName: string; avg: number } | null = null;
  let soft: { teamName: string; chip: FixtureRunChip; fdr: number } | null = null;
  let hard: { teamName: string; chip: FixtureRunChip; fdr: number } | null = null;
  for (const run of runs) {
    const summary = summarizeFixtureRun(run);
    if (summary.avgFdr !== null) {
      if (!best || summary.avgFdr < best.avg) best = { teamName: run.teamName, avg: summary.avgFdr };
      if (!worst || summary.avgFdr > worst.avg) worst = { teamName: run.teamName, avg: summary.avgFdr };
    }
    const next = summary.next;
    const nextFdr =
      next && typeof next.difficulty === "number" && Number.isFinite(next.difficulty)
        ? next.difficulty
        : null;
    if (next && nextFdr !== null) {
      if (!soft || nextFdr < soft.fdr) soft = { teamName: run.teamName, chip: next, fdr: nextFdr };
      if (!hard || nextFdr > hard.fdr) hard = { teamName: run.teamName, chip: next, fdr: nextFdr };
    }
  }
  const cards: FixtureGlanceCard[] = [];
  if (best) {
    cards.push({
      key: "best",
      label: "最佳赛程",
      valueText: best.avg.toFixed(1),
      valueClass: fdrBandClass(best.avg),
      subText: best.teamName,
      sort: "easiest"
    });
  }
  if (worst) {
    cards.push({
      key: "worst",
      label: "最差赛程",
      valueText: worst.avg.toFixed(1),
      valueClass: fdrBandClass(worst.avg),
      subText: worst.teamName,
      sort: "hardest"
    });
  }
  if (soft) {
    cards.push({
      key: "soft",
      label: "下场最软",
      valueText: String(soft.fdr),
      valueClass: fdrBandClass(soft.fdr),
      subText: `${soft.teamName} · ${soft.chip.home ? "主" : "客"} ${soft.chip.opponentShortName}`,
      sort: ""
    });
  }
  if (hard) {
    cards.push({
      key: "hard",
      label: "下场最硬",
      valueText: String(hard.fdr),
      valueClass: fdrBandClass(hard.fdr),
      subText: `${hard.teamName} · ${hard.chip.home ? "主" : "客"} ${hard.chip.opponentShortName}`,
      sort: ""
    });
  }
  return cards;
}

/** View-model for the fixtures matrix: sorted team cards + glance strip. */
export function buildFixturesView(
  runs: FixtureRun[],
  startEvent: number,
  horizon: number,
  sortOrder: FixtureRunSort
): { runCards: FixtureRunCard[]; glanceCards: FixtureGlanceCard[] } {
  const runCards = sortFixtureRuns(runs, sortOrder).map((run) => {
    const summary = summarizeFixtureRun(run);
    return {
      teamId: run.teamId,
      teamName: run.teamName,
      avgText: summary.avgFdr === null ? "—" : summary.avgFdr.toFixed(1),
      avgClass: fdrBandClass(summary.avgFdr),
      metaText: `易 ${summary.easyCount} · 难 ${summary.hardCount}`,
      cells: buildFixtureRunCells(run, startEvent, horizon).map((cell) => ({
        key: `gw${cell.event}`,
        event: cell.event,
        blank: cell.blank,
        double: cell.double,
        chips: cell.chips
      }))
    };
  });
  return { runCards, glanceCards: buildGlanceCards(runs) };
}

PerformancePage({
  data: {
    loading: true,
    error: "",
    errorWorkload: "home" as FixturesErrorWorkload,
    startEvent: 1,
    maxEvent: FALLBACK_MAX_EVENT,
    horizon: 5 as 3 | 5 | 8,
    sortOrder: "easiest" as FixtureRunSort,
    runs: [] as FixtureRun[],
    runCards: [] as FixtureRunCard[],
    glanceCards: [] as FixtureGlanceCard[]
  },

  // Payload mirrors outside data — rebuilding on control changes must not
  // refetch, and setData never carries the full season fixture list.
  fixtures: [] as Fixture[],
  teams: [] as FixtureRunTeam[],
  loadedSeason: undefined as string | undefined,
  loadedWindowKey: "",
  selectedWindowByUser: false,
  requestId: 0,
  hasShown: false,
  pageVisible: false,
  lifecycleRevision: 0,
  refreshPending: false,
  resumeForceRefresh: false,

  async onLoad() {
    this.pageVisible = true;
    const lifecycleRevision = this.lifecycleRevision;
    const trace = capturePageRequestTrace({ callerSurface: "explore-fixtures", trigger: "load" });
    const seasonChanged = await this.syncEventContext(false, lifecycleRevision);
    if (seasonChanged === null) return;
    // Season is part of fixture/team cache identity, so an ordinary first
    // read can reuse fresh data without crossing a rollover.
    await this.load(false, trace, lifecycleRevision);
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return;
    if (this.resumeForceRefresh) {
      await this.runForcedRefresh();
      if (this.pageVisible && !this.refreshPending) {
        this.resumeForceRefresh = false;
      }
      return;
    }
    const lifecycleRevision = this.lifecycleRevision;
    const trace = capturePageRequestTrace({ callerSurface: "explore-fixtures", trigger: "show" });
    const seasonChanged = await this.syncEventContext(false, lifecycleRevision);
    if (seasonChanged === null) return;
    // A normal cached read lets the fixture service's 30-minute TTL bound
    // staleness. A season rollover bypasses both fixture and team caches.
    await this.load(seasonChanged, trace, lifecycleRevision);
  },

  onHide() {
    this.pageVisible = false;
    this.resumeForceRefresh = this.resumeForceRefresh || this.refreshPending;
    this.refreshPending = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.refreshPending = false;
    this.resumeForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onPullDownRefresh() {
    return this.runForcedRefresh()
      .finally(() => wx.stopPullDownRefresh());
  },

  async syncEventContext(forceRefresh = false, lifecycleRevision?: number): Promise<boolean | null> {
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    const app = getApp<IAppOption>();
    try { await app.initAppData(forceRefresh); } catch { /* the picker falls back to GW 1 */ }
    if (!this.pageVisible || ownerRevision !== this.lifecycleRevision) return null;
    const season = app.globalData.season;
    const seasonChanged = Boolean(this.loadedSeason && season && this.loadedSeason !== season);
    const gw = Math.max(1, Number(app.globalData.gw) || 1);
    if (seasonChanged) {
      // Never relabel last season's payload as the new season. A failed reload
      // must show unavailable, not stale clubs under the new GW picker.
      this.fixtures = [];
      this.teams = [];
      this.loadedWindowKey = "";
      this.selectedWindowByUser = false;
      this.setData({ startEvent: gw, maxEvent: FALLBACK_MAX_EVENT, runs: [], runCards: [], glanceCards: [] });
      return true;
    }
    // Keep an explicitly selected historical window across same-season
    // context refreshes. An untouched default window follows the current GW.
    const startEvent = this.selectedWindowByUser
      ? Math.max(1, Number(this.data.startEvent) || gw)
      : gw;
    this.setData({ startEvent });
    const windowKey = `${season || "unknown"}:${startEvent}:${this.data.horizon}`;
    if (this.teams.length && this.loadedWindowKey === windowKey) {
      this.rebuild();
    } else {
      this.fixtures = [];
      this.setData({ runs: [], runCards: [], glanceCards: [] });
    }
    return false;
  },

  async load(
    forceRefresh = false,
    trace = capturePageRequestTrace({
      callerSurface: "explore-fixtures",
      trigger: forceRefresh ? "refresh" : "load"
    }),
    lifecycleRevision?: number
  ) {
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    const requestId = ++this.requestId;
    const isActiveRequest = () => (
      this.pageVisible
      && ownerRevision === this.lifecycleRevision
      && requestId === this.requestId
    );
    if (!isActiveRequest()) return;
    const loadStart = Date.now();
    const season = getApp<IAppOption>().globalData.season;
    const startEvent = this.data.startEvent;
    const horizon = this.data.horizon;
    const windowKey = `${season || "unknown"}:${startEvent}:${horizon}`;
    const hadLastGood = this.teams.length > 0 && this.loadedWindowKey === windowKey;
    if (!hadLastGood) {
      this.fixtures = [];
      this.setData({ runs: [], runCards: [], glanceCards: [] });
    }
    this.setData({
      loading: !hadLastGood,
      error: "",
      errorWorkload: season ? "fixtures" : "home",
    });
    try {
      const [fixtures, teams] = await Promise.all([
        getFixtureWindow(startEvent, horizon, season, forceRefresh, trace),
        getTeamList(season, forceRefresh, trace)
      ]);
      if (!isActiveRequest()) return;
      this.fixtures = fixtures;
      this.teams = teams;
      this.loadedSeason = season;
      this.loadedWindowKey = windowKey;
      this.setData({ loading: false, maxEvent: FALLBACK_MAX_EVENT, startEvent });
      this.rebuild();
      // Composition settled (plan §9): window and duration only — team
      // names never enter a record.
      recordExploreVisit({
        surface: "fixtures",
        contractSource: "canonical",
        eventId: startEvent,
        horizon: this.data.horizon,
        cacheOutcome: hadLastGood ? "last-good" : "miss",
        durationBucket: durationBucket(Date.now() - loadStart)
      });
    } catch (error) {
      if (!isActiveRequest()) return;
      // Last-good retention: a failed refresh keeps the previous cards.
      this.setData({
        loading: false,
        errorWorkload: workloadForFixturesError(error, season),
        error: hadLastGood
          ? "刷新失败，当前显示上次成功结果"
          : error instanceof Error ? error.message : "赛程加载失败"
      });
    }
  },

  rebuild() {
    if (!this.teams.length) {
      this.setData({ runs: [] });
      this.setData({ runCards: [], glanceCards: [] });
      return;
    }
    const runs = buildFixtureRuns(this.fixtures, this.teams, this.data.startEvent, this.data.horizon);
    this.setData({ runs });
    this.applyView();
  },

  applyView() {
    const { runCards, glanceCards } = buildFixturesView(
      this.data.runs,
      this.data.startEvent,
      this.data.horizon,
      this.data.sortOrder
    );
    this.setData({ runCards, glanceCards });
  },

  applySort(sortOrder: FixtureRunSort) {
    if (sortOrder === this.data.sortOrder) return;
    this.setData({ sortOrder });
    this.applyView();
  },

  onSortChange(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { sort: string }>) {
    this.applySort(event.currentTarget.dataset.sort === "hardest" ? "hardest" : "easiest");
  },

  onGlanceTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { sort: string }>) {
    const sort = event.currentTarget.dataset.sort;
    if (sort !== "easiest" && sort !== "hardest") return;
    this.applySort(sort);
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const startEvent = Number(event.detail.value);
    if (!Number.isFinite(startEvent) || startEvent <= 0) return;
    const currentGw = Math.max(1, Number(getApp<IAppOption>().globalData.gw) || 1);
    this.selectedWindowByUser = startEvent !== currentGw;
    this.setData({ startEvent });
    void this.load(false, capturePageRequestTrace({
      callerSurface: "explore-fixtures",
      trigger: "tab"
    }));
  },

  onHorizonChange(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { horizon: number }>) {
    this.setData({ horizon: normalizeHorizon(Number(event.currentTarget.dataset.horizon)) });
    void this.load(false, capturePageRequestTrace({
      callerSurface: "explore-fixtures",
      trigger: "tab"
    }));
  },

  onRetry() {
    void this.runForcedRefresh();
  },

  async runForcedRefresh() {
    const lifecycleRevision = this.lifecycleRevision;
    this.refreshPending = true;
    const trace = capturePageRequestTrace({ callerSurface: "explore-fixtures", trigger: "refresh" });
    try {
      const seasonChanged = await this.syncEventContext(true, lifecycleRevision);
      if (seasonChanged === null) return;
      await this.load(true, trace, lifecycleRevision);
    } catch (error) {
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : "赛季和比赛轮信息加载失败"
      });
    } finally {
      if (this.pageVisible && lifecycleRevision === this.lifecycleRevision) {
        this.refreshPending = false;
      }
    }
  }
});
