import { MOCK_ENABLED } from "../../../config/mock-mode";
import { myFplLeaguesMockData } from "../../../mocks/index";
import { PerformancePage } from "../../../utils/performance-page";
import {
  getEntryAllTournaments,
  getTournamentSeasonSnapshot,
  getTournamentSummary,
  loadTournamentSeasonPath,
  type TournamentEntryRankingSummary,
  type TournamentEventResult,
  type TournamentSeasonMetricKey,
  type TournamentSeasonMetric,
  type TournamentSeasonSnapshot
} from "../../../services/tournament.service";
import type { EntryTournamentRow } from "../../../models/competition";
import { goToEntrySearch } from "../../../utils/navigation";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import { formatCompactNumber, formatMoney, formatPoints } from "../../../utils/summary-format";
import {
  TOURNAMENT_PATH_MODES,
  buildTournamentPathPoint,
  toTournamentChartPoints,
  tournamentPathHint,
  tournamentPathSummary,
  type TournamentPathMode,
  type TournamentPathPoint
} from "../../../utils/season-chart";
import type { MiniChartPoint } from "../../../utils/mini-chart";
import { recordMyFplVisit } from "../../../utils/perf";
import { currentFollowEntryId, waitForAuthoritativeFollow } from "../../../utils/follow";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";

/** 我的赛事 — content mirrors the web my-fpl/competitions review page; the UI
 *  language mirrors the live tournament desk (toolbar, stat strip, board). */

type LeagueView = "season" | "gameweek";
type LeagueEmptyState = "" | "entry" | "tournaments" | "view";
type BoardSortKey = "rank" | "c1" | "c2" | "c3";

interface TileStat {
  label: string;
  value: string;
  meta?: string;
  tone?: "good" | "bad" | "";
}

interface LeaderRow {
  id: string;
  label: string;
  name: string;
  /** 经理名 + 赛事均值 — web shows both on every leader card. */
  meta: string;
  value: string;
}

interface HighlightRow {
  id: string;
  title: string;
  meta: string;
  value: string;
  tone?: "good" | "bad" | "";
}

/** Generic 3-number board row — column labels switch with the active view. */
interface BoardRow {
  entryId: number;
  rankText: string;
  /** 单轮榜:与上一轮相比的名次变化(▲/▼),赛季榜为空 — web RankCell parity. */
  moveText: string;
  moveTone: "good" | "bad" | "";
  name: string;
  manager: string;
  chip: string;
  me: boolean;
  c1: string;
  c1Tone?: "good" | "bad" | "";
  c2: string;
  c2Tone?: "good" | "bad" | "";
  c3: string;
  sortRank: number;
  sortC1: number;
  sortC2: number;
  sortC3: number;
}

interface SortOption {
  key: BoardSortKey;
  label: string;
  /** Natural direction — ranks ascend, points/value descend. */
  asc: boolean;
}

interface LeaguesCache {
  entryId: number;
  season: string;
  tournaments: EntryTournamentRow[];
  storedAt: number;
}

interface LeaguesData {
  loading: boolean;
  viewLoading: boolean;
  error: string;
  viewError: string;
  emptyState: LeagueEmptyState;
  emptyEyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionText: string;
  entryId: number;
  event: number;
  maxGw: number;
  tournaments: EntryTournamentRow[];
  tournamentNames: string[];
  selectedTournamentIndex: number;
  selectedTournament: EntryTournamentRow | null;
  activeView: LeagueView;
  showSeason: boolean;
  showGameweek: boolean;
  keyword: string;
  // 赛季 · 你在赛事中
  heroRank: string;
  heroRankSub: string;
  heroKicker: string;
  meTiles: TileStat[];
  // 赛季 · 联赛概况
  overviewStats: TileStat[];
  leaderRows: LeaderRow[];
  // 单轮
  gwNotice: string;
  gwTiles: TileStat[];
  topRows: HighlightRow[];
  riserRows: HighlightRow[];
  fallerRows: HighlightRow[];
  // board (both views)
  boardCol1: string;
  boardCol2: string;
  boardCol3: string;
  boardRows: BoardRow[];
  displayedRows: BoardRow[];
  filteredCount: number;
  sortOptions: SortOption[];
  sortKey: BoardSortKey;
  sortAsc: boolean;
  pageSize: number;
  hasMore: boolean;
  hasSeasonData: boolean;
  hasGwData: boolean;
  fromCache: boolean;
  pathPoints: TournamentPathPoint[];
  pathModes: Array<{ id: TournamentPathMode; label: string }>;
  pathMode: TournamentPathMode;
  pathVisible: boolean;
  pathLoading: boolean;
  pathSeries: MiniChartPoint[];
  pathInvertY: boolean;
  pathHint: string;
  pathSummary: string;
  pathSelectedGw: number | null;
  pathHasSelected: boolean;
}

const DIRECTORY_CACHE_KEY = "my-fpl:tournaments";
const LAST_PICK_KEY = "my-fpl:tournament:last";
const PAGE_STEP = 20;

const SEASON_SORT_OPTIONS: SortOption[] = [
  { key: "rank", label: "排名", asc: true },
  { key: "c1", label: "总积分", asc: false },
  { key: "c2", label: "总排名", asc: true },
  { key: "c3", label: "价值", asc: false }
];

const GW_SORT_OPTIONS: SortOption[] = [
  { key: "rank", label: "排名", asc: true },
  { key: "c1", label: "本轮", asc: false },
  { key: "c2", label: "扣分", asc: false },
  { key: "c3", label: "总分", asc: false }
];

const METRIC_LABELS: Record<TournamentSeasonMetricKey, string> = {
  OVERALL_POINTS: "总分",
  TEAM_VALUE: "球队价值",
  TRANSFERS: "转会次数",
  TOTAL_COSTS: "转会扣分",
  BENCH_POINTS: "板凳分",
  AUTO_SUB_POINTS: "自动换人分"
};

export function readTournamentsCache(
  entryId: number | undefined,
  season: string | undefined
): LeaguesCache | null {
  if (!entryId || !season) {
    return null;
  }
  const cached = readStoredDirectoryCache();
  // Same-context only: tournament membership never crosses a known season.
  if (cached && cached.entryId === entryId && cached.season === season) {
    return cached;
  }
  return null;
}

function readStoredDirectoryCache(): LeaguesCache | null {
  try {
    const cached = wx.getStorageSync(DIRECTORY_CACHE_KEY) as LeaguesCache | undefined;
    return cached && cached.entryId && cached.season && Array.isArray(cached.tournaments) ? cached : null;
  } catch {
    return null;
  }
}

function readLastPick(entryId: number): number {
  try {
    const all = wx.getStorageSync(LAST_PICK_KEY) as Record<string, number> | undefined;
    return Number(all?.[String(entryId)]) || 0;
  } catch {
    return 0;
  }
}

function writeLastPick(entryId: number, tournamentId: number): void {
  try {
    const all = (wx.getStorageSync(LAST_PICK_KEY) || {}) as Record<string, number>;
    all[String(entryId)] = tournamentId;
    wx.setStorageSync(LAST_PICK_KEY, all);
  } catch { /* best effort */ }
}

function metricValueText(key: TournamentSeasonMetricKey, value?: number | null): string {
  if (value === undefined || value === null) return "-";
  return key === "TEAM_VALUE" ? formatMoney(value) : formatPoints(value);
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emptyPathState() {
  return pathPageState([], "tournamentRank", null);
}

function pathPageState(
  points: TournamentPathPoint[],
  mode: TournamentPathMode,
  selectedGw: number | null
) {
  const selected = selectedGw == null ? null : points.find((point) => point.gameweek === selectedGw) || null;
  return {
    pathPoints: points,
    pathModes: TOURNAMENT_PATH_MODES,
    pathMode: mode,
    pathLoading: false,
    pathVisible: points.length >= 2,
    pathSeries: toTournamentChartPoints(points, mode),
    pathInvertY: mode === "tournamentRank",
    pathHint: tournamentPathHint(mode),
    pathSummary: tournamentPathSummary(selected, mode),
    pathSelectedGw: selected ? selected.gameweek : null,
    pathHasSelected: Boolean(selected)
  };
}

PerformancePage({
  data: {
    loading: true,
    viewLoading: false,
    error: "",
    viewError: "",
    emptyState: "",
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
    entryId: 0,
    event: 0,
    maxGw: 1,
    tournaments: [] as EntryTournamentRow[],
    tournamentNames: [] as string[],
    selectedTournamentIndex: 0,
    selectedTournament: null,
    activeView: "season" as LeagueView,
    showSeason: true,
    showGameweek: false,
    keyword: "",
    heroRank: "-",
    heroRankSub: "",
    heroKicker: "",
    meTiles: [] as TileStat[],
    overviewStats: [] as TileStat[],
    leaderRows: [] as LeaderRow[],
    gwNotice: "",
    gwTiles: [] as TileStat[],
    topRows: [] as HighlightRow[],
    riserRows: [] as HighlightRow[],
    fallerRows: [] as HighlightRow[],
    boardCol1: "总积分",
    boardCol2: "总排名",
    boardCol3: "价值",
    boardRows: [] as BoardRow[],
    displayedRows: [] as BoardRow[],
    filteredCount: 0,
    sortOptions: SEASON_SORT_OPTIONS,
    sortKey: "rank" as BoardSortKey,
    sortAsc: true,
    pageSize: PAGE_STEP,
    hasMore: false,
    hasSeasonData: false,
    hasGwData: false,
    fromCache: false,
    ...emptyPathState()
  } as LeaguesData,

  requestId: 0,
  viewRequestId: 0,
  pathRequestId: 0,
  hasShown: false,
  loadedSeason: undefined as string | undefined,
  pageVisible: false,
  lifecycleRevision: 0,
  startupPending: false,
  resumeOnShow: false,
  loadPending: false,
  loadForceRefresh: false,
  resumeForceRefresh: false,
  seasonRows: [] as BoardRow[],
  gwRows: [] as BoardRow[],

  async onLoad() {
    this.pageVisible = true;
    const lifecycleRevision = this.lifecycleRevision;
    this.startupPending = true;
    const trace = capturePageRequestTrace({ callerSurface: "my-fpl-leagues", trigger: "load" });
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    try { await getApp<IAppOption>().initAppData(false); } catch { /* load without cache identity */ }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    const currentGw = Math.max(0, Number(getApp<IAppOption>().globalData.gw) || 0);
    this.setData({ event: currentGw, maxGw: Math.max(1, currentGw) });
    this.startupPending = false;
    await this.loadLeagues(false, trace, lifecycleRevision);
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed || this.resumeOnShow) {
      const forceRefresh = this.resumeForceRefresh;
      const lifecycleRevision = this.lifecycleRevision;
      const trace = capturePageRequestTrace({ callerSurface: "my-fpl-leagues", trigger: "show" });
      await waitForAuthoritativeFollow();
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
      try { await getApp<IAppOption>().initAppData(false); } catch { /* retain the last context */ }
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
      const nextGw = Math.max(0, Number(getApp<IAppOption>().globalData.gw) || 0);
      if (nextGw > 0 && nextGw !== this.data.maxGw) {
        this.setData({ maxGw: nextGw, event: this.data.event || nextGw });
      }
      this.resumeOnShow = false;
      this.resumeForceRefresh = false;
      await this.loadLeagues(forceRefresh, trace, lifecycleRevision);
    }
  },

  onHide() {
    this.pageVisible = false;
    this.resumeOnShow = this.resumeOnShow || this.startupPending || this.data.loading || this.loadPending;
    if (this.loadPending) {
      this.resumeForceRefresh = this.resumeForceRefresh || this.loadForceRefresh;
    }
    this.lifecycleRevision += 1;
    this.requestId += 1;
    this.viewRequestId += 1;
    this.pathRequestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeOnShow = false;
    this.resumeForceRefresh = false;
    this.loadPending = false;
    this.loadForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
    this.viewRequestId += 1;
    this.pathRequestId += 1;
  },

  async onPullDownRefresh() {
    const trace = capturePageRequestTrace({ callerSurface: "my-fpl-leagues", trigger: "refresh" });
    this.loadPending = true;
    this.loadForceRefresh = true;
    try {
      try { await getApp<IAppOption>().initAppData(true); } catch { /* retain the last context */ }
      if (!this.pageVisible) return;
      await this.loadLeagues(true, trace);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async loadLeagues(
    forceRefresh = false,
    trace: PageRequestTrace | null | undefined = capturePageRequestTrace({
      callerSurface: "my-fpl-leagues",
      trigger: forceRefresh ? "refresh" : "load"
    }),
    lifecycleRevision?: number
  ) {
    if (MOCK_ENABLED) {
      this.setData(myFplLeaguesMockData as unknown as Partial<LeaguesData>);
      this.seasonRows = myFplLeaguesMockData.boardRows as unknown as BoardRow[];
      this.afterDirectoryReady();
      this.syncBoard();
      return;
    }
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    const requestId = ++this.requestId;
    const isActiveRequest = () => this.pageVisible
      && ownerRevision === this.lifecycleRevision
      && requestId === this.requestId;
    const entryId = currentFollowEntryId();
    const season = getApp<IAppOption>().globalData.season || undefined;

    if (!entryId) {
      this.loadedSeason = undefined;
      this.setData({
        loading: false,
        error: "",
        entryId: 0,
        tournaments: [],
        tournamentNames: [],
        selectedTournament: null,
        emptyState: "entry",
        emptyEyebrow: "需要球队",
        emptyTitle: "先选择我的球队",
        emptyDescription: "查找球队并设为我的球队后，即可查看你参与的赛事。",
        emptyActionText: "去选择球队",
        fromCache: false
      });
      return;
    }

    const principalChanged = this.data.entryId > 0 && this.data.entryId !== entryId;
    const seasonChanged = Boolean(this.loadedSeason && season && this.loadedSeason !== season);
    if (principalChanged || seasonChanged) {
      this.loadedSeason = undefined;
      this.setData({ tournaments: [], tournamentNames: [], selectedTournament: null, fromCache: false });
    }
    // On a cold offline launch the persisted cache season is the only known
    // identity; keep that last-good view until authoritative context returns.
    const offlineCached = season ? null : readStoredDirectoryCache();
    const cacheSeason = season || offlineCached?.season;
    const cached = readTournamentsCache(entryId, cacheSeason) || (
      offlineCached?.entryId === entryId ? offlineCached : null
    );
    if (cached && (principalChanged || seasonChanged || !this.data.tournaments.length)) {
      this.setData({
        tournaments: cached.tournaments,
        tournamentNames: cached.tournaments.map((t) => t.name),
        fromCache: true
      });
      this.loadedSeason = cached.season;
      this.afterDirectoryReady();
    }
    this.setData({ loading: !cached, error: "", entryId, emptyState: "" });
    this.loadPending = true;
    this.loadForceRefresh = forceRefresh;

    try {
      const tournaments = await getEntryAllTournaments(entryId, forceRefresh, trace);
      if (!isActiveRequest()) return;
      const currentSeason = getApp<IAppOption>().globalData.season || undefined;
      if ((season && currentSeason && season !== currentSeason) || currentFollowEntryId() !== entryId) {
        void this.loadLeagues(true, trace);
        return;
      }
      this.setData({
        loading: false,
        tournaments,
        tournamentNames: tournaments.map((t) => t.name),
        fromCache: false
      });
      this.loadedSeason = currentSeason || cached?.season;
      try {
        if (currentSeason) {
          wx.setStorageSync(DIRECTORY_CACHE_KEY, {
            entryId,
            season: currentSeason,
            tournaments,
            storedAt: Date.now()
          } satisfies LeaguesCache);
        }
      } catch { /* cache is best effort */ }
      this.afterDirectoryReady();
    } catch (error) {
      if (!isActiveRequest()) return;
      this.setData({
        loading: false,
        error: cached
          ? "刷新失败，当前显示上次成功结果"
          : error instanceof Error ? error.message : "赛事加载失败"
      });
    } finally {
      if (isActiveRequest()) {
        this.loadPending = false;
        this.loadForceRefresh = false;
      }
    }
  },

  /** Directory in hand — pick the tournament, then load the active view. */
  afterDirectoryReady() {
    const tournaments = this.data.tournaments;
    if (!tournaments.length) {
      this.setData({
        selectedTournament: null,
        emptyState: "tournaments",
        emptyEyebrow: "没有赛事",
        emptyTitle: "此 FPL 账户尚未关联赛事",
        emptyDescription: "赛事由经理在网页版创建并关联官方联赛后，会显示在这里。",
        emptyActionText: ""
      });
      return;
    }
    this.setData({ emptyState: "" });
    const lastId = readLastPick(this.data.entryId);
    const index = Math.max(0, tournaments.findIndex((t) => Number(t.id) === lastId));
    this.pickTournament(index, false);
    if (!MOCK_ENABLED) void this.loadView(this.data.activeView, false);
  },

  pickTournament(index: number, reload = true) {
    const tournaments = this.data.tournaments;
    const selected = tournaments[index] || tournaments[0];
    if (!selected) return;
    // A finished tournament pins the review window to its final gameweek.
    const endGw = Number(selected.groupEndedEventId) || 0;
    const maxGw = endGw > 0 && (this.data.maxGw <= 0 || endGw < this.data.maxGw)
      ? endGw
      : this.data.maxGw;
    const event = this.data.event > 0 && this.data.event <= maxGw ? this.data.event : maxGw;
    this.setData({
      selectedTournamentIndex: tournaments.indexOf(selected),
      selectedTournament: selected,
      maxGw,
      event
    });
    if (this.data.entryId) {
      writeLastPick(this.data.entryId, Number(selected.id));
    }
    if (reload) {
      this.seasonRows = [];
      this.gwRows = [];
      this.pathRequestId += 1;
      this.setData({
        hasSeasonData: false,
        hasGwData: false,
        boardRows: [],
        displayedRows: [],
        viewError: "",
        ...emptyPathState(),
        pathLoading: true
      });
      void this.loadView(this.data.activeView, false);
    }
  },

  onTournamentChange(event: WechatMiniprogram.PickerChange) {
    this.pickTournament(Number(event.detail.value));
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const value = Number(event.detail.value);
    if (!Number.isFinite(value) || value <= 0 || value === this.data.event) return;
    this.setData({ event: value, gwNotice: "" });
    this.gwRows = [];
    this.setData({ hasGwData: false });
    void this.loadView(
      this.data.activeView === "gameweek" ? "gameweek" : "season",
      false,
      undefined,
      { reloadPath: false }
    );
  },

  onViewTap(event: WechatMiniprogram.TouchEvent) {
    const view = String(event.currentTarget.dataset.view || "season") as LeagueView;
    if (view === this.data.activeView) return;
    this.setData({
      activeView: view,
      showSeason: view === "season",
      showGameweek: view === "gameweek",
      sortOptions: view === "season" ? SEASON_SORT_OPTIONS : GW_SORT_OPTIONS,
      sortKey: "rank",
      sortAsc: true,
      pageSize: PAGE_STEP,
      keyword: ""
    });
    const cachedRows = view === "season" ? this.seasonRows : this.gwRows;
    if (cachedRows.length) {
      this.setData({
        boardRows: cachedRows,
        boardCol1: view === "season" ? "总积分" : "本轮",
        boardCol2: view === "season" ? "总排名" : "扣分",
        boardCol3: view === "season" ? "价值" : "总分"
      });
      this.syncBoard();
      return;
    }
    void this.loadView(view, false);
  },

  async loadView(
    view: LeagueView,
    forceRefresh: boolean,
    originatingTrace?: PageRequestTrace,
    options?: { reloadPath?: boolean }
  ) {
    if (MOCK_ENABLED) return;
    const tournament = this.data.selectedTournament;
    const entryId = this.data.entryId;
    if (!tournament || !entryId || this.data.event <= 0) return;
    const requestId = ++this.viewRequestId;
    const trace = originatingTrace
      ? { ...originatingTrace, callerSurface: "my-fpl-leagues-view", trigger: forceRefresh ? "refresh" as const : "tab" as const }
      : capturePageRequestTrace({
          callerSurface: "my-fpl-leagues-view",
          trigger: forceRefresh ? "refresh" : "tab"
        });
    this.setData({ viewLoading: true, viewError: "" });
    try {
      if (view === "season") {
        await this.loadSeasonView(
          Number(tournament.id),
          entryId,
          forceRefresh,
          trace,
          options?.reloadPath !== false
        );
      } else {
        await this.loadGameweekView(Number(tournament.id), entryId, forceRefresh, trace);
      }
      if (requestId !== this.viewRequestId) return;
    } catch (error) {
      if (requestId !== this.viewRequestId) return;
      this.setData({
        viewError: error instanceof Error ? error.message : "赛事数据加载失败"
      });
    } finally {
      if (requestId === this.viewRequestId) {
        this.setData({ viewLoading: false });
      }
    }
  },

  async loadSeasonView(
    tournamentId: number,
    entryId: number,
    forceRefresh: boolean,
    trace?: PageRequestTrace,
    reloadPath = true
  ) {
    const event = this.data.event;
    const [snapshot, summary] = await Promise.all([
      getTournamentSeasonSnapshot(tournamentId, event, forceRefresh, trace),
      getTournamentSummary(tournamentId, event, entryId, forceRefresh, trace)
    ]);
    if (!snapshot || !snapshot.standings.length) {
      this.seasonRows = [];
      this.setData({
        hasSeasonData: false,
        boardRows: this.data.activeView === "season" ? [] : this.data.boardRows,
        displayedRows: this.data.activeView === "season" ? [] : this.data.displayedRows
      });
      if (this.data.activeView === "season") this.syncBoard();
      return;
    }
    const me = summary.tournamentEntryRankingSummary;
    this.seasonRows = snapshot.standings.map((row) => seasonBoardRow(row, entryId));
    this.setData({
      hasSeasonData: true,
      heroRank: formatCompactNumber(me?.tournamentOverallRank),
      heroRankSub: heroSubText(me),
      heroKicker: `截至第 ${snapshot.asOfEventId || event} 轮的积分榜`,
      meTiles: meSeasonTiles(me, snapshot.metrics || [], Math.max(1, Number(snapshot.asOfEventId || event) || 1)),
      overviewStats: overviewStatTiles(snapshot),
      leaderRows: (snapshot.metrics || []).map((metric) => ({
        id: metric.key,
        label: METRIC_LABELS[metric.key] || metric.key,
        name: metric.leaderEntryName || metric.leaderPlayerName || "-",
        meta: [
          metric.leaderPlayerName || "",
          metric.averageValue !== null && metric.averageValue !== undefined
            ? `场均 ${metricValueText(metric.key, metric.averageValue)}`
            : ""
        ].filter(Boolean).join(" · "),
        value: metricValueText(metric.key, metric.leaderValue)
      }))
    });
    if (this.data.activeView === "season") {
      this.setData({ boardRows: this.seasonRows });
      this.syncBoard();
    }
    if (reloadPath) void this.loadSeasonPath(tournamentId, entryId, forceRefresh, trace);
  },

  async loadSeasonPath(
    tournamentId: number,
    entryId: number,
    forceRefresh: boolean,
    trace?: PageRequestTrace
  ) {
    const start = Math.max(1, Number(this.data.selectedTournament?.groupStartedEventId) || 1);
    const end = Math.max(start, this.data.event);
    const requestId = ++this.pathRequestId;
    this.setData({
      pathLoading: true,
      pathVisible: false,
      pathPoints: [],
      pathSeries: []
    });
    const publish = (pages: Array<{ gameweek: number; rows: TournamentEventResult[] }>) => {
      if (requestId !== this.pathRequestId) return false;
      const points = pages
        .map((page) => buildTournamentPathPoint(page.gameweek, entryId, page.rows))
        .filter((point): point is TournamentPathPoint => Boolean(point));
      this.setData({
        ...pathPageState(points, this.data.pathMode, this.data.pathSelectedGw),
        pathLoading: true
      });
      return true;
    };
    try {
      const pages = await loadTournamentSeasonPath(
        tournamentId,
        entryId,
        start,
        end,
        forceRefresh,
        trace,
        publish
      );
      if (requestId !== this.pathRequestId) return;
      publish(pages);
      this.setData({ pathLoading: false });
    } catch {
      if (requestId !== this.pathRequestId) return;
      this.setData({ pathLoading: false, pathVisible: this.data.pathPoints.length >= 2 });
    }
  },

  onPathMode(event: WechatMiniprogram.TouchEvent) {
    const mode = String(event.currentTarget.dataset.mode || "tournamentRank") as TournamentPathMode;
    this.setData(pathPageState(this.data.pathPoints, mode, this.data.pathSelectedGw));
  },

  onPathSelect(event: WechatMiniprogram.CustomEvent<{ x: number | null }>) {
    const gw = event.detail?.x == null ? null : Number(event.detail.x);
    if (gw == null || !Number.isFinite(gw)) {
      this.setData(pathPageState(this.data.pathPoints, this.data.pathMode, null));
      return;
    }
    this.setData(pathPageState(this.data.pathPoints, this.data.pathMode, gw));
  },

  async loadGameweekView(tournamentId: number, entryId: number, forceRefresh: boolean, trace?: PageRequestTrace) {
    let event = this.data.event;
    let payload = await getTournamentSummary(tournamentId, event, entryId, forceRefresh, trace);
    let notice = "";
    if (!payload.tournamentEventResults.length && event > 1) {
      // Web parity: fall back one GW when this round's results are not ready.
      const fallback = event - 1;
      const retried = await getTournamentSummary(tournamentId, fallback, entryId, forceRefresh, trace);
      if (retried.tournamentEventResults.length) {
        notice = `第 ${event} 轮赛事结果尚未就绪 · 当前显示第 ${fallback} 轮数据`;
        event = fallback;
        payload = retried;
      }
    }
    const results = payload.tournamentEventResults;
    if (!results.length) {
      this.gwRows = [];
      this.setData({
        hasGwData: false,
        gwNotice: "",
        boardRows: this.data.activeView === "gameweek" ? [] : this.data.boardRows,
        displayedRows: this.data.activeView === "gameweek" ? [] : this.data.displayedRows
      });
      if (this.data.activeView === "gameweek") this.syncBoard();
      return;
    }
    const previous = event > 1
      ? await getTournamentSummary(tournamentId, event - 1, entryId, forceRefresh, trace).catch(() => null)
      : null;
    const prevRankByEntry = new Map<number, number>();
    (previous?.tournamentEventResults || []).forEach((row) => {
      if (row.eventGroupRank) prevRankByEntry.set(row.entryId, row.eventGroupRank);
    });
    this.gwRows = results.map((row) => gameweekBoardRow(row, entryId, prevRankByEntry));
    this.setData({
      hasGwData: true,
      gwNotice: notice,
      gwTiles: gwPerformanceTiles(results, prevRankByEntry, entryId, event),
      topRows: gwTopRows(results),
      riserRows: gwMovementRows(results, prevRankByEntry, true),
      fallerRows: gwMovementRows(results, prevRankByEntry, false)
    });
    if (this.data.activeView === "gameweek") {
      this.setData({ boardRows: this.gwRows });
      this.syncBoard();
    }
  },

  onKeyword(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.setData({ keyword: event.detail.keyword, pageSize: PAGE_STEP });
    this.syncBoard();
  },

  onResetSearch() {
    this.setData({ keyword: "", pageSize: PAGE_STEP });
    this.syncBoard();
  },

  onSortTap(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key || "rank") as BoardSortKey;
    const option = this.data.sortOptions.find((item) => item.key === key);
    if (key === this.data.sortKey) {
      this.setData({ sortAsc: !this.data.sortAsc });
    } else {
      this.setData({ sortKey: key, sortAsc: option ? option.asc : true });
    }
    this.syncBoard();
  },

  onLoadMore() {
    this.setData({ pageSize: this.data.pageSize + PAGE_STEP });
    this.syncBoard();
  },

  /** Client-side filter + sort — the board set is one tournament, always small. */
  syncBoard() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const filtered = keyword
      ? this.data.boardRows.filter((row) =>
          row.name.toLowerCase().includes(keyword) || row.manager.toLowerCase().includes(keyword))
      : [...this.data.boardRows];
    const key = this.data.sortKey;
    const pick = (row: BoardRow) =>
      key === "rank" ? row.sortRank : key === "c1" ? row.sortC1 : key === "c2" ? row.sortC2 : row.sortC3;
    const asc = this.data.sortAsc;
    filtered.sort((a, b) => {
      const diff = pick(a) - pick(b);
      return (asc ? diff : -diff) || a.sortRank - b.sortRank;
    });
    this.setData({
      displayedRows: filtered.slice(0, this.data.pageSize),
      filteredCount: filtered.length,
      hasMore: filtered.length > this.data.pageSize
    });
  },

  async onCopyCompetitionLink() {
    // Competition creation and management live on the Website; web-view is
    // unavailable to this Mini Program, so the handoff is a copied link.
    await openWebsiteAction(canonicalAction("MANAGE_COMPETITION"));
  },

  async onOpenWebsite() {
    const action = canonicalAction("LEAGUE_PREPARE");
    if (await openWebsiteAction(action)) {
      recordMyFplVisit({ surface: "leagues", handoffActionType: action.actionType });
    }
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
    }
  },

  onRetry() {
    if (this.data.tournaments.length) {
      void this.loadView(this.data.activeView, true);
      return;
    }
    void this.loadLeagues(true);
  }
});

function heroSubText(me: TournamentEntryRankingSummary | undefined): string {
  if (!me) return "";
  const parts = [`总积分 ${formatPoints(me.overallPoints)}`];
  if (me.tournamentOverallRank === 1) {
    // Web: "Top of the table" plus the cushion over 2nd place.
    parts.push(me.pointsAheadOfPrev ? `领跑中 · 领先下一名 ${formatPoints(me.pointsAheadOfPrev)}` : "领跑中");
  } else {
    if (me.gapToLeader) {
      parts.push(`距榜首 ${formatPoints(me.gapToLeader)}`);
    }
    // Web gap-tile detail: points behind the team immediately above.
    if (me.pointsBehindNext) {
      parts.push(`距前一名 ${formatPoints(me.pointsBehindNext)}`);
    }
  }
  if (me.overallRank) {
    parts.push(`FPL 总排名 ${formatCompactNumber(me.overallRank)}`);
  }
  return parts.join(" · ");
}

function meSeasonTiles(
  me: TournamentEntryRankingSummary | undefined,
  metrics: TournamentSeasonMetric[] = [],
  gwCount = 0
): TileStat[] {
  if (!me) return [];
  const avgByKey = new Map(metrics.map((metric) => [metric.key, metric.averageValue]));
  // Web secondary tiles show both the in-tournament rank and the field average.
  const metaWithAvg = (key: TournamentSeasonMetricKey, rank?: number | null): string => {
    const parts: string[] = [];
    if (rank) parts.push(`赛事内第 ${formatCompactNumber(rank)} 名`);
    const avg = avgByKey.get(key);
    if (avg !== null && avg !== undefined) parts.push(`场均 ${metricValueText(key, avg)}`);
    return parts.join(" · ");
  };
  const tiles = [
    { label: "球队价值", value: formatMoney(me.teamValue), meta: metaWithAvg("TEAM_VALUE", me.tournamentTeamValueRank) },
    { label: "转会数", value: formatPoints(me.transfersNum), meta: metaWithAvg("TRANSFERS", me.tournamentTransfersRank) },
    { label: "总扣分", value: formatPoints(me.totalCosts), meta: metaWithAvg("TOTAL_COSTS", me.tournamentCostsRank) },
    { label: "替补积分", value: formatPoints(me.totalBenchPoints), meta: metaWithAvg("BENCH_POINTS", me.tournamentBenchPointsRank) },
    { label: "自动换人", value: formatPoints(me.autoSubPoints), meta: metaWithAvg("AUTO_SUB_POINTS", me.tournamentAutoSubRank) }
  ];
  // Sixth tile (fills the 2-col grid): scoring rate. The hero already carries
  // total points, so the tile shows points-per-GW against the field average.
  const overallPoints = num(me.overallPoints, NaN);
  if (Number.isFinite(overallPoints) && gwCount > 0) {
    const fieldAverage = avgByKey.get("OVERALL_POINTS");
    const metaParts: string[] = [];
    if (me.tournamentOverallRank) {
      metaParts.push(`赛事内第 ${formatCompactNumber(me.tournamentOverallRank)} 名`);
    }
    if (fieldAverage !== null && fieldAverage !== undefined) {
      metaParts.push(`场均 ${(fieldAverage / gwCount).toFixed(1)}`);
    }
    tiles.push({
      label: "每轮均分",
      value: (overallPoints / gwCount).toFixed(1),
      meta: metaParts.join(" · ")
    });
  }
  return tiles;
}

function overviewStatTiles(snapshot: TournamentSeasonSnapshot): TileStat[] {
  return [
    { label: "参赛", value: formatPoints(snapshot.entryCount) },
    { label: "榜首总分", value: formatPoints(snapshot.leaderOverallPoints) },
    { label: "平均总分", value: formatPoints(snapshot.averageOverallPoints) },
    { label: "冠亚分差", value: formatPoints(snapshot.gapFirstSecond) }
  ];
}

function seasonBoardRow(
  row: TournamentSeasonSnapshot["standings"][number],
  viewerEntryId: number
): BoardRow {
  return {
    entryId: row.entryId,
    rankText: formatCompactNumber(row.rank),
    moveText: "",
    moveTone: "",
    name: row.entryName || "-",
    manager: row.playerName || "",
    chip: "",
    me: row.entryId === viewerEntryId,
    c1: formatPoints(row.overallPoints),
    c1Tone: "good",
    c2: formatCompactNumber(row.overallRank),
    c3: formatMoney(row.teamValue),
    sortRank: num(row.rank, 999999),
    sortC1: num(row.overallPoints),
    sortC2: row.overallRank ? num(row.overallRank) : 999999999,
    sortC3: num(row.teamValue)
  };
}

function chipCode(chip?: string | null): string {
  if (!chip || chip === "NONE") return "";
  const codes: Record<string, string> = {
    BENCH_BOOST: "BB",
    FREE_HIT: "FH",
    TRIPLE_CAPTAIN: "TC",
    WILDCARD: "WC",
    MANAGER: "AM"
  };
  return codes[chip] || "";
}

function gameweekBoardRow(
  row: TournamentEventResult,
  viewerEntryId: number,
  prevRankByEntry?: Map<number, number>
): BoardRow {
  const gwPoints = row.eventNetPoints ?? row.eventPoints;
  const cost = num(row.eventCost);
  const prev = prevRankByEntry?.get(row.entryId);
  const delta = prev && row.eventGroupRank ? prev - row.eventGroupRank : 0;
  return {
    entryId: row.entryId,
    rankText: formatCompactNumber(row.eventGroupRank),
    // Web RankCell: green up / red down badge vs the previous gameweek.
    moveText: delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "",
    moveTone: delta > 0 ? "good" : delta < 0 ? "bad" : "",
    name: row.entryName || "-",
    manager: row.playerName || "",
    chip: chipCode(row.eventChip),
    me: row.entryId === viewerEntryId,
    c1: formatPoints(gwPoints),
    c1Tone: "good",
    c2: cost > 0 ? `-${cost}` : "0",
    c2Tone: cost > 0 ? "bad" : "",
    c3: formatPoints(row.overallPoints),
    sortRank: num(row.eventGroupRank, 999999),
    sortC1: num(gwPoints),
    sortC2: cost,
    sortC3: num(row.overallPoints)
  };
}

function movementText(currentRank: number | null | undefined, prevRank: number | undefined): Pick<TileStat, "meta" | "tone"> {
  if (!currentRank || !prevRank) return { meta: "", tone: "" };
  const delta = prevRank - currentRank;
  if (delta > 0) return { meta: `上升 ${formatCompactNumber(delta)}`, tone: "good" };
  if (delta < 0) return { meta: `下降 ${formatCompactNumber(-delta)}`, tone: "bad" };
  return { meta: "无变化", tone: "" };
}

function gwPerformanceTiles(
  results: TournamentEventResult[],
  prevRankByEntry: Map<number, number>,
  entryId: number,
  event: number
): TileStat[] {
  const mine = results.find((row) => row.entryId === entryId);
  const top = [...results].sort((a, b) => num(b.eventPoints) - num(a.eventPoints))[0];
  const movement = movementText(mine?.eventGroupRank, prevRankByEntry.get(entryId));
  const cost = num(mine?.eventCost);
  return [
    {
      label: "我的排名",
      value: formatCompactNumber(mine?.eventGroupRank),
      meta: movement.meta,
      tone: movement.tone
    },
    {
      label: `第 ${event} 轮积分`,
      value: formatPoints(mine?.eventNetPoints ?? mine?.eventPoints),
      meta: cost > 0 ? `本轮扣分：-${cost}` : ""
    },
    {
      label: "队长得分",
      value: formatPoints(mine?.captainPoints)
    },
    {
      label: "最高得分",
      value: formatPoints(top?.eventPoints),
      meta: top?.entryName || ""
    }
  ];
}

function gwTopRows(results: TournamentEventResult[]): HighlightRow[] {
  return [...results]
    .sort((a, b) => num(b.eventPoints) - num(a.eventPoints))
    .slice(0, 5)
    .map((row, index) => ({
      id: `top-${row.entryId}`,
      title: `${index + 1}. ${row.entryName || "-"}`,
      meta: [row.playerName, chipCode(row.eventChip)].filter(Boolean).join(" · "),
      value: formatPoints(row.eventPoints)
    }));
}

function gwMovementRows(
  results: TournamentEventResult[],
  prevRankByEntry: Map<number, number>,
  risers: boolean
): HighlightRow[] {
  if (!prevRankByEntry.size) return [];
  return results
    .map((row) => {
      const prev = prevRankByEntry.get(row.entryId);
      const current = row.eventGroupRank;
      const delta = prev && current ? prev - current : 0;
      return { row, prev, current, delta };
    })
    .filter((item) => (risers ? item.delta > 0 : item.delta < 0))
    .sort((a, b) => (risers ? b.delta - a.delta : a.delta - b.delta))
    .slice(0, 5)
    .map((item) => ({
      id: `${risers ? "up" : "down"}-${item.row.entryId}`,
      title: item.row.entryName || "-",
      meta: `#${item.prev} → #${item.current}`,
      value: `${item.delta > 0 ? "+" : ""}${formatCompactNumber(item.delta)}`,
      tone: item.delta > 0 ? "good" : "bad"
    }));
}
