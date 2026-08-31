import { PerformancePage } from "../../../utils/performance-page";
import {
  getCompleteMyFplCompetitionBoard,
  getMyFplCompetitionSeasonPath,
  getMyFplCompetitionsDesk,
  getMyTournamentGameweekReview,
  getMyTournamentReviewCatalog,
  getMyTournamentSeasonReview,
  type MyFplCompetitionBoard,
  type MyFplCompetitionBoardRow,
  type MyFplCompetitionSeasonPath,
  type MyFplCompetitionsDesk,
  type MyFplCompetitionAggregate,
  type TournamentEntryRankingSummary,
  type TournamentEventResult,
  type TournamentSeasonMetricKey,
  type TournamentSeasonMetric,
  type TournamentSeasonSnapshot,
  type MyTournamentGameweekReview,
  type MyTournamentReviewPoints,
  type MyTournamentReviewPointsRow,
  type MyTournamentReviewCatalog,
  type MyTournamentReviewFormat,
  type MyTournamentReviewScope,
  type MyTournamentReviewState,
  type MyTournamentSeasonReview,
} from "../../../services/tournament.service";
import type { EntryTournamentRow } from "../../../models/competition";
import { goToEntrySearch } from "../../../utils/navigation";
import {
  canonicalAction,
  openWebsiteAction,
} from "../../../utils/canonical-action";
import {
  formatAverageMoney,
  formatAverageNumber,
  formatRank,
  formatMoney,
  formatPoints,
} from "../../../utils/summary-format";
import {
  TOURNAMENT_PATH_MODES,
  toTournamentChartPoints,
  tournamentPathHint,
  tournamentPathSummary,
  type TournamentPathMode,
  type TournamentPathPoint,
} from "../../../utils/season-chart";
import type { MiniChartPoint } from "../../../utils/mini-chart";
import { recordMyFplVisit } from "../../../utils/perf";
import {
  currentMyFplEntryId,
  refreshAuthoritativeFollow,
  waitForAuthoritativeFollow,
} from "../../../utils/follow";
import { getAppContextSnapshot } from "../../../services/app-context.service";
import {
  capturePageRequestTrace,
  isViewerEntryAuthorizationError,
  type PageRequestTrace,
} from "../../../services/graphql.service";
import { canReadEventReporting } from "../../../utils/event-context";

/** 我的赛事 — content mirrors the web my-fpl/competitions review page; the UI
 *  language mirrors the live tournament desk (toolbar, stat strip, board). */

type LeagueView = "season" | "gameweek";
type LeagueEmptyState = "" | "entry" | "tournaments" | "view";
type BoardSortKey = "rank" | "c1" | "c2" | "c3";
type V2RetryOperation = "catalog" | "review" | "loadMore";

interface TournamentReviewPointsDisplayRow extends MyTournamentReviewPointsRow {
  headlineValue: number | null;
}

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
  /** V2 is the active My FPL review surface; legacy fields remain below until
   * the cross-client acceptance gate permits physical removal. */
  v2Enabled: boolean;
  v2Scope: MyTournamentReviewScope;
  v2Catalog: MyTournamentReviewCatalog | null;
  v2TournamentNames: string[];
  v2SelectedTournamentIndex: number;
  v2SelectedTournament: MyTournamentReviewCatalog["tournaments"][number] | null;
  v2EventIds: number[];
  v2SelectedEventIndex: number;
  v2Event: number;
  v2Format: MyTournamentReviewFormat | null;
  v2State: MyTournamentReviewState;
  v2StatusText: string;
  v2TransferCostTotal: number;
  v2HeadlineLabel: string;
  v2GameweekRows: TournamentReviewPointsDisplayRow[];
  v2Gameweek: MyTournamentGameweekReview | null;
  v2Season: MyTournamentSeasonReview | null;
  v2Loading: boolean;
  v2LoadingMore: boolean;
  v2HasNextPage: boolean;
  v2Error: string;
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
  boardTotalRows: number;
  sortOptions: SortOption[];
  sortKey: BoardSortKey;
  sortAsc: boolean;
  boardPage: number;
  boardPageCount: number;
  boardFrom: number;
  boardTo: number;
  hasPreviousBoardPage: boolean;
  hasNextBoardPage: boolean;
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

function tournamentReviewStateText(state: MyTournamentReviewState): string {
  switch (state) {
    case "READY":
      return "已结算快照就绪";
    case "WAITING_SOURCE":
      return "等待数据源结算";
    case "DEGRADED":
      return "快照延迟，已安排补偿";
    case "PENDING":
      return "正在生成已结算快照";
    default:
      return "暂无已结算快照";
  }
}

function tournamentReviewNextCursor(
  review: MyTournamentGameweekReview | MyTournamentSeasonReview | null,
): string | null {
  return (
    review?.points?.nextCursor ??
    review?.h2h?.nextCursor ??
    review?.knockout?.nextCursor ??
    null
  );
}

export function mergeTournamentReviewEventIds(
  current: readonly number[],
  incoming: readonly number[],
): number[] {
  return Array.from(
    new Set(
      [...current, ...incoming].filter(
        (eventId) => Number.isSafeInteger(eventId) && eventId > 0,
      ),
    ),
  ).sort((left, right) => left - right);
}

export function tournamentReviewTransferCostTotal(
  points: MyTournamentReviewPoints | null | undefined,
): number {
  if (!points) return 0;
  return Math.max(0, points.grossPointsTotal - points.netPointsTotal);
}

export function tournamentReviewHeadlineLabel(metric: string): string {
  switch (metric.trim().toLowerCase()) {
    case "gross":
      return "Gross";
    case "net":
      return "Net";
    default:
      return "赛事分";
  }
}

export function tournamentReviewHeadlineValue(
  metric: string,
  row: MyTournamentReviewPointsRow,
): number | null {
  switch (metric.trim().toLowerCase()) {
    case "gross":
      return row.grossPoints;
    case "net":
      return row.netPoints;
    default:
      return row.tournamentScore;
  }
}

function tournamentReviewDisplayRows(
  points: MyTournamentReviewPoints | null | undefined,
): TournamentReviewPointsDisplayRow[] {
  if (!points) return [];
  return points.rows.map((row) => ({
    ...row,
    headlineValue: tournamentReviewHeadlineValue(points.headlineMetric, row),
  }));
}

function mergeTournamentReviewPage(
  previous: MyTournamentGameweekReview | MyTournamentSeasonReview,
  next: MyTournamentGameweekReview | MyTournamentSeasonReview,
): MyTournamentGameweekReview | MyTournamentSeasonReview {
  const points =
    previous.points && next.points
      ? { ...next.points, rows: [...previous.points.rows, ...next.points.rows] }
      : next.points;
  const h2h =
    previous.h2h && next.h2h
      ? {
          ...next.h2h,
          matches: [...previous.h2h.matches, ...next.h2h.matches],
          standings: next.h2h.standings.length
            ? next.h2h.standings
            : previous.h2h.standings,
        }
      : next.h2h;
  const knockout =
    previous.knockout && next.knockout
      ? {
          ...next.knockout,
          matches: [...previous.knockout.matches, ...next.knockout.matches],
        }
      : next.knockout;
  return { ...next, points, h2h, knockout };
}

const DIRECTORY_CACHE_KEY = "my-fpl:tournaments:v2";
const LAST_PICK_KEY = "my-fpl:tournament:last";
export const BOARD_PAGE_SIZE = 20;
/** Leagues warm-show skip window (aligned with home/live index at 60s; team is 5 min). */
export const LEAGUES_REVALIDATE_MS = 60 * 1000;
export const SEASON_PATH_RECENT_WINDOW = 8;

export function paginateBoardRows<T>(
  rows: T[],
  requestedPage: number,
  pageSize = BOARD_PAGE_SIZE,
): {
  rows: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
  hasPrevious: boolean;
  hasNext: boolean;
} {
  const size = Math.max(1, Math.floor(pageSize) || BOARD_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * size;
  return {
    rows: rows.slice(start, start + size),
    page,
    pageCount,
    from: rows.length > 0 ? start + 1 : 0,
    to: Math.min(start + size, rows.length),
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}

export function shouldReloadLeagues(
  lastLoadAt: number,
  loadedEntryId: number,
  currentEntryId: number,
  loadedSeason: string | undefined,
  currentSeason: string | undefined,
  loadedEvent: number,
  currentEvent: number,
  loadedContextRevision: number,
  currentContextRevision: number,
  now = Date.now(),
): boolean {
  return (
    !lastLoadAt ||
    loadedEntryId !== currentEntryId ||
    Boolean(loadedSeason && currentSeason && loadedSeason !== currentSeason) ||
    loadedEvent !== currentEvent ||
    loadedContextRevision !== currentContextRevision ||
    now - lastLoadAt >= LEAGUES_REVALIDATE_MS
  );
}

export function seasonPathWindow(
  start: number,
  end: number,
  windowSize = SEASON_PATH_RECENT_WINDOW,
): {
  recentStart: number;
  recentEnd: number;
  hasOlder: boolean;
  olderEnd: number;
} {
  const recentEnd = Math.max(start, end);
  const recentStart = Math.max(start, recentEnd - windowSize + 1);
  return {
    recentStart,
    recentEnd,
    hasOlder: recentStart > start,
    olderEnd: recentStart - 1,
  };
}

export function seasonPathCacheKey(
  tournamentId: number,
  entryId: number,
  throughEventId: number,
): string {
  return `${tournamentId}:${entryId}:${throughEventId}`;
}

const SEASON_SORT_OPTIONS: SortOption[] = [
  { key: "rank", label: "排名", asc: true },
  { key: "c1", label: "总积分", asc: false },
  { key: "c2", label: "总排名", asc: true },
  { key: "c3", label: "价值", asc: false },
];

const GW_SORT_OPTIONS: SortOption[] = [
  { key: "rank", label: "排名", asc: true },
  { key: "c1", label: "本轮", asc: false },
  { key: "c2", label: "扣分", asc: false },
  { key: "c3", label: "总分", asc: false },
];

const METRIC_LABELS: Record<TournamentSeasonMetricKey, string> = {
  OVERALL_POINTS: "总分",
  TEAM_VALUE: "球队价值",
  TRANSFERS: "转会次数",
  TOTAL_COSTS: "转会扣分",
  BENCH_POINTS: "板凳分",
  AUTO_SUB_POINTS: "自动换人分",
};

export function readTournamentsCache(
  entryId: number | undefined,
  season: string | undefined,
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
    const cached = wx.getStorageSync(DIRECTORY_CACHE_KEY) as
      LeaguesCache | undefined;
    return cached &&
      cached.entryId &&
      cached.season &&
      Array.isArray(cached.tournaments)
      ? cached
      : null;
  } catch {
    return null;
  }
}

function readLastPick(entryId: number): number {
  try {
    const all = wx.getStorageSync(LAST_PICK_KEY) as
      Record<string, number> | undefined;
    return Number(all?.[String(entryId)]) || 0;
  } catch {
    return 0;
  }
}

function writeLastPick(entryId: number, tournamentId: number): void {
  try {
    const all = (wx.getStorageSync(LAST_PICK_KEY) || {}) as Record<
      string,
      number
    >;
    all[String(entryId)] = tournamentId;
    wx.setStorageSync(LAST_PICK_KEY, all);
  } catch {
    /* best effort */
  }
}

function metricValueText(
  key: TournamentSeasonMetricKey,
  value?: number | null,
): string {
  if (value === undefined || value === null) return "-";
  return key === "TEAM_VALUE" ? formatMoney(value) : formatPoints(value);
}

export function metricAverageValueText(
  key: TournamentSeasonMetricKey,
  value?: number | null,
): string {
  if (value === undefined || value === null) return "-";
  return key === "TEAM_VALUE"
    ? formatAverageMoney(value)
    : formatAverageNumber(value);
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
  selectedGw: number | null,
) {
  const selected =
    selectedGw == null
      ? null
      : points.find((point) => point.gameweek === selectedGw) || null;
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
    pathHasSelected: Boolean(selected),
  };
}

PerformancePage({
  data: {
    v2Enabled: true,
    v2Scope: "ACCESSIBLE" as MyTournamentReviewScope,
    v2Catalog: null,
    v2TournamentNames: [] as string[],
    v2SelectedTournamentIndex: 0,
    v2SelectedTournament: null,
    v2EventIds: [] as number[],
    v2SelectedEventIndex: 0,
    v2Event: 0,
    v2Format: null,
    v2State: "UNAVAILABLE" as MyTournamentReviewState,
    v2StatusText: "暂无已结算快照",
    v2TransferCostTotal: 0,
    v2HeadlineLabel: "Gross",
    v2GameweekRows: [] as TournamentReviewPointsDisplayRow[],
    v2Gameweek: null,
    v2Season: null,
    v2Loading: true,
    v2LoadingMore: false,
    v2HasNextPage: false,
    v2Error: "",
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
    boardTotalRows: 0,
    sortOptions: SEASON_SORT_OPTIONS,
    sortKey: "rank" as BoardSortKey,
    sortAsc: true,
    boardPage: 1,
    boardPageCount: 1,
    boardFrom: 0,
    boardTo: 0,
    hasPreviousBoardPage: false,
    hasNextBoardPage: false,
    hasSeasonData: false,
    hasGwData: false,
    fromCache: false,
    ...emptyPathState(),
  } as LeaguesData,

  requestId: 0,
  viewRequestId: 0,
  pathRequestId: 0,
  hasShown: false,
  loadedSeason: undefined as string | undefined,
  lastLoadAt: 0,
  loadedEntryId: 0,
  loadedEvent: 0,
  loadedContextRevision: 0,
  pathLoadedKey: "",
  pageVisible: false,
  lifecycleRevision: 0,
  startupPending: false,
  resumeOnShow: false,
  loadPending: false,
  loadForceRefresh: false,
  resumeForceRefresh: false,
  v2RetryOperation: null as V2RetryOperation | null,
  seasonRows: [] as BoardRow[],
  gwRows: [] as BoardRow[],

  async onLoad() {
    this.pageVisible = true;
    const lifecycleRevision = this.lifecycleRevision;
    this.startupPending = true;
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-leagues",
      trigger: "load",
    });
    await waitForAuthoritativeFollow();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision)
      return;
    try {
      await getApp<IAppOption>().initAppData(false);
    } catch {
      /* load without cache identity */
    }
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision)
      return;
    const currentGw = Math.max(
      0,
      Number(getApp<IAppOption>().globalData.gw) || 0,
    );
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
      const resumeIncomplete = this.resumeOnShow;
      const lifecycleRevision = this.lifecycleRevision;
      const trace = capturePageRequestTrace({
        callerSurface: "my-fpl-leagues",
        trigger: "show",
      });
      await waitForAuthoritativeFollow();
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision)
        return;
      try {
        await getApp<IAppOption>().initAppData(false);
      } catch {
        /* retain the last context */
      }
      if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision)
        return;
      const nextGw = Math.max(
        0,
        Number(getApp<IAppOption>().globalData.gw) || 0,
      );
      if (nextGw > 0 && nextGw !== this.data.maxGw) {
        this.setData({ maxGw: nextGw, event: this.data.event || nextGw });
      }
      this.resumeOnShow = false;
      this.resumeForceRefresh = false;
      const app = getApp<IAppOption>();
      const snapshot = getAppContextSnapshot();
      if (
        resumeIncomplete &&
        this.data.v2Enabled &&
        this.v2RetryOperation !== null &&
        this.v2RetryOperation !== "catalog" &&
        currentMyFplEntryId() === this.loadedEntryId &&
        (snapshot?.contextRevision ?? 0) === this.loadedContextRevision
      ) {
        // The interrupted catalog request may have been awaiting its nested
        // review when onHide invalidated it. That request can no longer own
        // the load flags; the review retry below owns only view state.
        this.loadPending = false;
        this.loadForceRefresh = false;
        await this.retryV2Operation(forceRefresh);
        return;
      }
      // Compare against the picker GW, not current/next GW: browsing a
      // historical round must not force a directory reload on every show.
      if (
        forceRefresh ||
        resumeIncomplete ||
        shouldReloadLeagues(
          this.lastLoadAt,
          this.loadedEntryId,
          currentMyFplEntryId() || 0,
          this.loadedSeason,
          app.globalData.season || undefined,
          this.loadedEvent,
          this.data.event,
          this.loadedContextRevision,
          snapshot?.contextRevision ?? 0,
        )
      ) {
        await this.loadLeagues(forceRefresh, trace, lifecycleRevision);
      }
    }
  },

  onHide() {
    this.pageVisible = false;
    this.resumeOnShow =
      this.resumeOnShow ||
      this.startupPending ||
      this.data.loading ||
      this.loadPending ||
      this.data.viewLoading ||
      this.data.pathLoading ||
      this.data.v2Loading ||
      this.data.v2LoadingMore;
    if (this.loadPending) {
      this.resumeForceRefresh =
        this.resumeForceRefresh || this.loadForceRefresh;
    }
    if (
      this.data.viewLoading ||
      this.data.pathLoading ||
      this.data.v2Loading ||
      this.data.v2LoadingMore
    ) {
      this.setData({
        viewLoading: false,
        pathLoading: false,
        v2Loading: false,
        v2LoadingMore: false,
      });
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
    this.v2RetryOperation = null;
    this.lifecycleRevision += 1;
    this.requestId += 1;
    this.viewRequestId += 1;
    this.pathRequestId += 1;
  },

  async onPullDownRefresh() {
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-leagues",
      trigger: "refresh",
    });
    this.loadPending = true;
    this.loadForceRefresh = true;
    try {
      try {
        await getApp<IAppOption>().initAppData(true);
      } catch {
        /* retain the last context */
      }
      if (!this.pageVisible) return;
      await this.loadLeagues(true, trace);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  /** V2 catalog + finalized snapshot loader. The legacy loader below remains
   * source-visible only until the cross-client removal gate; v2Enabled keeps
   * this route on the new contract in production. */
  async loadV2Leagues(
    forceRefresh = false,
    trace: PageRequestTrace | null | undefined = capturePageRequestTrace({
      callerSurface: "my-fpl-leagues-v2",
      trigger: forceRefresh ? "refresh" : "load",
    }),
    scopeOverride?: MyTournamentReviewScope,
  ) {
    const requestId = ++this.requestId;
    const localEntryId = currentMyFplEntryId() || 0;
    let entryId = localEntryId;
    const scope = scopeOverride ?? this.data.v2Scope;
    if (entryId !== this.loadedEntryId) {
      // Do not keep a prior viewer's catalog or review visible while the new
      // catalog is in flight. This also covers an entry switch whose catalog
      // request fails: no old authorized payload remains on screen.
      this.clearV2EntryScopedViewState(true);
    }
    const isActiveRequest = () =>
      this.pageVisible && requestId === this.requestId;
    this.loadPending = true;
    this.loadForceRefresh = forceRefresh;
    this.viewRequestId += 1;
    this.v2RetryOperation = "catalog";
    this.setData({
      loading: true,
      error: "",
      v2Error: "",
      v2Loading: true,
      v2Scope: scope,
      entryId,
      emptyState: "",
    });
    try {
      // A local follow pointer is display state only. Refresh the standalone
      // account before selecting a cache variant so an external rebind cannot
      // admit another entry's catalog into this entry's persisted cache.
      try {
        entryId = (await refreshAuthoritativeFollow()) || 0;
      } catch {
        if (isActiveRequest()) {
          this.clearV2EntryScopedViewState(true);
          this.v2RetryOperation = "catalog";
          this.setData({
            loading: false,
            v2Loading: false,
            v2State: "UNAVAILABLE",
            v2Error: "球队状态尚未同步，请稍后重试",
            error: "球队状态尚未同步，请稍后重试",
          });
        }
        return;
      }
      if (entryId !== localEntryId) {
        this.clearV2EntryScopedViewState(true);
        if (isActiveRequest()) this.setData({ entryId });
      }
      let catalog: MyTournamentReviewCatalog;
      try {
        catalog = await getMyTournamentReviewCatalog(
          scope,
          forceRefresh,
          trace ?? undefined,
          entryId,
        );
      } catch (error) {
        if (!isViewerEntryAuthorizationError(error)) throw error;
        let refreshedEntryId: number | null;
        try {
          refreshedEntryId = await refreshAuthoritativeFollow();
        } catch {
          if (isActiveRequest()) {
            this.setData({
              loading: false,
              v2Loading: false,
              v2Error: "球队状态尚未同步，请稍后重试",
            });
          }
          return;
        }
        if (!isActiveRequest()) return;
        if (!refreshedEntryId) {
          this.showEntryEmptyState();
          this.v2RetryOperation = null;
          return;
        }
        if (refreshedEntryId === entryId) {
          this.setData({
            loading: false,
            v2Loading: false,
            v2Error: "球队状态尚未同步，请稍后重试",
          });
          return;
        }
        entryId = refreshedEntryId;
        this.clearV2EntryScopedViewState(true);
        this.setData({ entryId });
        catalog = await getMyTournamentReviewCatalog(
          scope,
          true,
          trace ?? undefined,
          entryId,
        );
      }
      if (!isActiveRequest()) return;
      const catalogViewerEntryId = Number(catalog.viewerEntryId) || 0;
      if (entryId > 0 && catalogViewerEntryId !== entryId) {
        // The binding may have changed between the profile read and the
        // catalog response. Reconcile once; never render or cache the
        // mismatched response.
        this.clearV2EntryScopedViewState(true);
        const refreshedEntryId = await refreshAuthoritativeFollow().catch(
          () => null,
        );
        if (
          refreshedEntryId &&
          refreshedEntryId !== entryId &&
          isActiveRequest()
        ) {
          void this.loadV2Leagues(true, trace, scope);
          return;
        }
        throw new Error("球队绑定已变更，请稍后重试");
      }
      if (!entryId && !catalog.adminReadAll) {
        this.showEntryEmptyState();
        this.v2RetryOperation = null;
        return;
      }
      const currentEntryId = currentMyFplEntryId() || 0;
      if (currentEntryId !== entryId) {
        void this.loadV2Leagues(true, trace, scope);
        return;
      }
      const previousTournamentId =
        this.data.v2SelectedTournament?.tournamentId ?? 0;
      const retainedId =
        previousTournamentId || (entryId ? readLastPick(entryId) : 0);
      const selected =
        catalog.tournaments.find((item) => item.tournamentId === retainedId) ||
        catalog.tournaments[0] ||
        null;
      const selectedIndex = selected
        ? Math.max(
            0,
            catalog.tournaments.findIndex(
              (item) => item.tournamentId === selected.tournamentId,
            ),
          )
        : 0;
      const latestEventId =
        selected?.latestAvailableEventId ??
        selected?.latestFinalizedEventId ??
        0;
      const sameTournament =
        Boolean(selected) && selected?.tournamentId === previousTournamentId;
      const retainedEventIds = sameTournament ? this.data.v2EventIds : [];
      const retainedEventId =
        sameTournament && retainedEventIds.includes(this.data.v2Event)
          ? this.data.v2Event
          : 0;
      const eventId = retainedEventId || latestEventId;
      const eventIds = mergeTournamentReviewEventIds(
        retainedEventIds,
        [latestEventId, eventId].filter(
          (candidate): candidate is number => candidate > 0,
        ),
      );
      this.setData({
        loading: false,
        v2Loading: Boolean(selected && eventId),
        v2LoadingMore: false,
        v2HasNextPage: false,
        v2Catalog: catalog,
        v2TournamentNames: catalog.tournaments.map((item) => item.name),
        v2SelectedTournamentIndex: selectedIndex,
        v2SelectedTournament: selected,
        v2EventIds: eventIds,
        v2SelectedEventIndex: Math.max(0, eventIds.indexOf(eventId)),
        v2Event: eventId,
        event: eventId,
        v2Format: selected?.latestFormat ?? null,
        v2State: selected?.state ?? "UNAVAILABLE",
        v2StatusText: tournamentReviewStateText(
          selected?.state ?? "UNAVAILABLE",
        ),
        v2TransferCostTotal: sameTournament ? this.data.v2TransferCostTotal : 0,
        v2HeadlineLabel: sameTournament ? this.data.v2HeadlineLabel : "Gross",
        v2GameweekRows: sameTournament ? this.data.v2GameweekRows : [],
        v2Gameweek: sameTournament ? this.data.v2Gameweek : null,
        v2Season: sameTournament ? this.data.v2Season : null,
        tournaments: [],
        tournamentNames: [],
        selectedTournament: null,
      });
      this.loadedEntryId = entryId;
      this.loadedSeason =
        getApp<IAppOption>().globalData.season || this.loadedSeason;
      this.loadedContextRevision =
        getAppContextSnapshot()?.contextRevision ?? 0;
      // A stale-while-revalidate catalog is useful as a degraded view but it
      // must not reset the warm-refresh deadline. Keep retrying the failed
      // refresh instead of treating the cache fallback as a fresh load.
      if (catalog.state !== "DEGRADED") {
        this.lastLoadAt = Date.now();
      }
      if (selected && eventId) {
        await this.loadV2Review(
          selected.tournamentId,
          eventId,
          forceRefresh,
          trace ?? undefined,
        );
      } else if (isActiveRequest()) {
        const catalogUnavailable =
          catalog.tournaments.length === 0 && catalog.state !== "READY";
        if (catalogUnavailable) {
          this.v2RetryOperation = "catalog";
          this.setData({
            v2Loading: false,
            v2State: catalog.state,
            v2StatusText: tournamentReviewStateText(catalog.state),
            v2Error: "赛事复盘目录暂时不可用，请稍后重试",
            emptyState: "",
          });
        } else {
          this.v2RetryOperation = null;
          this.setData({
            v2Loading: false,
            emptyState: catalog.tournaments.length ? "view" : "tournaments",
          });
        }
      }
    } catch (error) {
      if (!isActiveRequest()) return;
      this.v2RetryOperation = "catalog";
      this.setData({
        loading: false,
        v2Loading: false,
        v2State: "UNAVAILABLE",
        v2Error: error instanceof Error ? error.message : "赛事复盘加载失败",
        error: error instanceof Error ? error.message : "赛事复盘加载失败",
      });
    } finally {
      if (requestId === this.requestId) {
        this.loadPending = false;
        this.loadForceRefresh = false;
      }
    }
  },

  async loadV2Review(
    tournamentId: number,
    eventId: number,
    forceRefresh = false,
    trace?: PageRequestTrace,
  ) {
    const requestId = ++this.viewRequestId;
    const isActiveRequest = () =>
      this.pageVisible && requestId === this.viewRequestId;
    this.v2RetryOperation = "review";
    this.setData({
      v2Loading: true,
      v2LoadingMore: false,
      v2HasNextPage: false,
      v2Error: "",
      v2Event: eventId,
    });
    try {
      const [gameweek, season] = await Promise.all([
        getMyTournamentGameweekReview(
          tournamentId,
          eventId,
          forceRefresh,
          trace,
          null,
          null,
          this.data.entryId,
        ),
        getMyTournamentSeasonReview(
          tournamentId,
          eventId,
          forceRefresh,
          trace,
          null,
          this.data.entryId,
        ),
      ]);
      if (!isActiveRequest()) return;
      const selected =
        this.data.v2Catalog?.tournaments.find(
          (item) => item.tournamentId === tournamentId,
        ) || null;
      const eventIds = mergeTournamentReviewEventIds(
        this.data.v2EventIds,
        season.finalizedEventIds?.length
          ? season.finalizedEventIds
          : eventId > 0
            ? [eventId]
            : [],
      );
      this.v2RetryOperation = null;
      this.loadedEvent = eventId;
      this.setData({
        v2Loading: false,
        v2Gameweek: gameweek,
        v2Season: season,
        v2TransferCostTotal: tournamentReviewTransferCostTotal(gameweek.points),
        v2HeadlineLabel: tournamentReviewHeadlineLabel(
          gameweek.points?.headlineMetric ?? "gross",
        ),
        v2GameweekRows: tournamentReviewDisplayRows(gameweek.points),
        v2EventIds: eventIds,
        v2SelectedEventIndex: Math.max(0, eventIds.indexOf(eventId)),
        v2SelectedTournament: selected,
        event: eventId,
        v2Format:
          gameweek.scope?.format ??
          season.format ??
          selected?.latestFormat ??
          null,
        v2State:
          (this.data.activeView === "season" ? season.state : gameweek.state) ||
          "UNAVAILABLE",
        v2StatusText: tournamentReviewStateText(
          ((this.data.activeView === "season"
            ? season.state
            : gameweek.state) || "UNAVAILABLE") as MyTournamentReviewState,
        ),
        hasGwData: gameweek.state === "READY",
        hasSeasonData: season.state === "READY",
        v2HasNextPage:
          this.data.activeView === "season"
            ? Boolean(tournamentReviewNextCursor(season))
            : Boolean(tournamentReviewNextCursor(gameweek)),
      });
    } catch (error) {
      if (!isActiveRequest()) return;
      this.setData({
        v2Loading: false,
        v2State: "UNAVAILABLE",
        v2Error: error instanceof Error ? error.message : "赛事复盘加载失败",
      });
    }
  },

  async onV2LoadMore() {
    if (this.data.v2Loading || this.data.v2LoadingMore) return;
    const tournamentId = this.data.v2SelectedTournament?.tournamentId;
    const eventId = this.data.v2Event;
    const requestView = this.data.activeView;
    const current =
      requestView === "season" ? this.data.v2Season : this.data.v2Gameweek;
    const after = tournamentReviewNextCursor(current);
    if (!tournamentId || !eventId || !after) return;
    const gameweekRevision = this.data.v2Gameweek?.scope?.revision ?? null;
    const seasonRevision = this.data.v2Season?.latestRevision ?? null;
    if (requestView === "gameweek" && !gameweekRevision) {
      this.v2RetryOperation = "review";
      this.setData({ v2Error: "赛事复盘快照版本缺失，请重试" });
      return;
    }
    if (requestView === "season" && !seasonRevision) {
      this.v2RetryOperation = "review";
      this.setData({ v2Error: "赛事复盘快照版本缺失，请重试" });
      return;
    }
    const requestId = this.viewRequestId;
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-leagues-v2",
      trigger: "pagination",
    });
    this.v2RetryOperation = "loadMore";
    this.setData({ v2LoadingMore: true, v2Error: "" });
    try {
      if (requestView === "season") {
        const next = await getMyTournamentSeasonReview(
          tournamentId,
          eventId,
          true,
          trace,
          after,
          this.data.entryId,
        );
        if (
          !this.pageVisible ||
          requestId !== this.viewRequestId ||
          this.data.activeView !== requestView
        )
          return;
        if (next.latestRevision !== seasonRevision) {
          throw new Error("赛事复盘快照已更新，请刷新后重试");
        }
        const merged = this.data.v2Season
          ? (mergeTournamentReviewPage(
              this.data.v2Season,
              next,
            ) as MyTournamentSeasonReview)
          : next;
        this.setData({
          v2Season: merged,
          v2State: merged.state,
          v2StatusText: tournamentReviewStateText(merged.state),
          v2HasNextPage: Boolean(tournamentReviewNextCursor(merged)),
        });
        this.v2RetryOperation = null;
      } else {
        const next = await getMyTournamentGameweekReview(
          tournamentId,
          eventId,
          true,
          trace,
          after,
          gameweekRevision,
          this.data.entryId,
        );
        if (
          !this.pageVisible ||
          requestId !== this.viewRequestId ||
          this.data.activeView !== requestView
        )
          return;
        if (next.scope?.revision !== gameweekRevision) {
          throw new Error("赛事复盘快照已更新，请刷新后重试");
        }
        const merged = this.data.v2Gameweek
          ? (mergeTournamentReviewPage(
              this.data.v2Gameweek,
              next,
            ) as MyTournamentGameweekReview)
          : next;
        this.setData({
          v2Gameweek: merged,
          v2State: merged.state,
          v2StatusText: tournamentReviewStateText(merged.state),
          v2TransferCostTotal: tournamentReviewTransferCostTotal(merged.points),
          v2HeadlineLabel: tournamentReviewHeadlineLabel(
            merged.points?.headlineMetric ?? "gross",
          ),
          v2GameweekRows: tournamentReviewDisplayRows(merged.points),
          v2HasNextPage: Boolean(tournamentReviewNextCursor(merged)),
        });
        this.v2RetryOperation = null;
      }
    } catch (error) {
      if (
        !this.pageVisible ||
        requestId !== this.viewRequestId ||
        this.data.activeView !== requestView
      )
        return;
      this.v2RetryOperation =
        error instanceof Error &&
        error.message === "赛事复盘快照已更新，请刷新后重试"
          ? "review"
          : "loadMore";
      this.setData({
        v2Error: error instanceof Error ? error.message : "赛事复盘加载失败",
      });
    } finally {
      if (this.pageVisible && requestId === this.viewRequestId) {
        this.setData({ v2LoadingMore: false });
      }
    }
  },

  clearV2EntryScopedViewState(loading = false) {
    this.viewRequestId += 1;
    this.setData({
      v2Catalog: null,
      v2TournamentNames: [],
      v2SelectedTournamentIndex: 0,
      v2SelectedTournament: null,
      v2EventIds: [],
      v2SelectedEventIndex: 0,
      v2Event: 0,
      v2Format: null,
      v2State: "UNAVAILABLE",
      v2StatusText: tournamentReviewStateText("UNAVAILABLE"),
      v2TransferCostTotal: 0,
      v2HeadlineLabel: "Gross",
      v2GameweekRows: [],
      v2Gameweek: null,
      v2Season: null,
      v2Loading: loading,
      v2LoadingMore: false,
      v2HasNextPage: false,
      v2Error: "",
    });
  },

  selectV2Tournament(index: number) {
    const catalog = this.data.v2Catalog;
    const selected = catalog?.tournaments[index];
    if (!selected) return;
    this.viewRequestId += 1;
    this.v2RetryOperation = null;
    const eventId =
      selected.latestAvailableEventId ?? selected.latestFinalizedEventId ?? 0;
    this.setData({
      v2SelectedTournamentIndex: index,
      v2SelectedTournament: selected,
      v2Event: eventId,
      event: eventId,
      v2EventIds: eventId ? [eventId] : [],
      v2SelectedEventIndex: 0,
      v2Format: selected.latestFormat,
      v2State: selected.state,
      v2StatusText: tournamentReviewStateText(selected.state),
      v2TransferCostTotal: 0,
      v2HeadlineLabel: "Gross",
      v2GameweekRows: [],
      v2Gameweek: null,
      v2Season: null,
      v2Loading: false,
      v2LoadingMore: false,
      v2HasNextPage: false,
    });
    if (this.data.entryId > 0) {
      writeLastPick(this.data.entryId, selected.tournamentId);
    }
    if (eventId) {
      void this.loadV2Review(
        selected.tournamentId,
        eventId,
        false,
        capturePageRequestTrace({
          callerSurface: "my-fpl-leagues-v2",
          trigger: "show",
        }),
      );
    }
  },

  onV2ScopeTap() {
    if (!this.data.v2Catalog?.adminReadAll) return;
    const nextScope: MyTournamentReviewScope =
      this.data.v2Scope === "ALL" ? "ACCESSIBLE" : "ALL";
    void this.loadV2Leagues(
      true,
      capturePageRequestTrace({
        callerSurface: "my-fpl-leagues-v2",
        trigger: "refresh",
      }),
      nextScope,
    );
  },

  showEntryEmptyState() {
    this.v2RetryOperation = null;
    this.clearEntryScopedViewState();
    this.loadedSeason = undefined;
    this.pathLoadedKey = "";
    this.loadedEntryId = 0;
    this.loadedEvent = 0;
    this.loadedContextRevision = 0;
    this.setData({
      loading: false,
      error: "",
      v2Loading: false,
      v2Error: "",
      v2Catalog: null,
      v2TournamentNames: [],
      v2SelectedTournament: null,
      v2EventIds: [],
      v2SelectedEventIndex: 0,
      v2Event: 0,
      v2Format: null,
      v2State: "UNAVAILABLE",
      v2StatusText: tournamentReviewStateText("UNAVAILABLE"),
      v2TransferCostTotal: 0,
      v2HeadlineLabel: "Gross",
      v2GameweekRows: [],
      v2Gameweek: null,
      v2Season: null,
      v2LoadingMore: false,
      v2HasNextPage: false,
      entryId: 0,
      tournaments: [],
      tournamentNames: [],
      selectedTournament: null,
      emptyState: "entry",
      emptyEyebrow: "需要球队",
      emptyTitle: "先选择我的球队",
      emptyDescription: "查找球队并设为我的球队后，即可查看你参与的赛事。",
      emptyActionText: "去选择球队",
      fromCache: false,
    });
  },

  clearEntryScopedViewState() {
    this.viewRequestId += 1;
    this.pathRequestId += 1;
    this.seasonRows = [];
    this.gwRows = [];
    this.pathLoadedKey = "";
    this.setData({
      viewLoading: false,
      viewError: "",
      hasSeasonData: false,
      hasGwData: false,
      boardRows: [],
      displayedRows: [],
      boardTotalRows: 0,
      boardPage: 1,
      boardPageCount: 1,
      boardFrom: 0,
      boardTo: 0,
      hasPreviousBoardPage: false,
      hasNextBoardPage: false,
      ...emptyPathState(),
    });
  },

  async loadLeagues(
    forceRefresh = false,
    trace: PageRequestTrace | null | undefined = capturePageRequestTrace({
      callerSurface: "my-fpl-leagues",
      trigger: forceRefresh ? "refresh" : "load",
    }),
    lifecycleRevision?: number,
  ) {
    if (this.data.v2Enabled) {
      await this.loadV2Leagues(forceRefresh, trace);
      return;
    }
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    const requestId = ++this.requestId;
    const isActiveRequest = () =>
      this.pageVisible &&
      ownerRevision === this.lifecycleRevision &&
      requestId === this.requestId;
    let entryId = currentMyFplEntryId();
    const season = getApp<IAppOption>().globalData.season || undefined;

    if (!entryId) {
      this.showEntryEmptyState();
      return;
    }

    const principalChanged =
      this.data.entryId > 0 && this.data.entryId !== entryId;
    const seasonChanged = Boolean(
      this.loadedSeason && season && this.loadedSeason !== season,
    );
    if (principalChanged || seasonChanged) {
      this.clearEntryScopedViewState();
      this.loadedSeason = undefined;
      this.pathLoadedKey = "";
      this.setData({
        tournaments: [],
        tournamentNames: [],
        selectedTournament: null,
        fromCache: false,
      });
    }
    // On a cold offline launch the persisted cache season is the only known
    // identity; keep that last-good view until authoritative context returns.
    const offlineCached = season ? null : readStoredDirectoryCache();
    const cacheSeason = season || offlineCached?.season;
    const cached =
      readTournamentsCache(entryId, cacheSeason) ||
      (offlineCached?.entryId === entryId ? offlineCached : null);
    if (
      cached &&
      (principalChanged || seasonChanged || !this.data.tournaments.length)
    ) {
      this.setData({
        tournaments: cached.tournaments,
        tournamentNames: cached.tournaments.map((t) => t.name),
        fromCache: true,
      });
      this.loadedSeason = cached.season;
      this.afterDirectoryReady();
    }
    this.setData({ loading: !cached, error: "", entryId, emptyState: "" });
    this.loadPending = true;
    this.loadForceRefresh = forceRefresh;
    let authorizationRecoveryAttempted = false;

    try {
      // The web and GraphQL backends now expose one authenticated desk for
      // My FPL competitions. It owns membership, setup state, finalized-event
      // gating, and the tournament directory; no separate legacy projection
      // is consulted for the selected viewer.
      let desk: MyFplCompetitionsDesk;
      try {
        desk = await getMyFplCompetitionsDesk(
          null,
          this.data.event > 0 ? this.data.event : null,
          forceRefresh,
          trace ?? undefined,
        );
      } catch (error) {
        if (
          authorizationRecoveryAttempted ||
          !isViewerEntryAuthorizationError(error)
        ) {
          throw error;
        }
        authorizationRecoveryAttempted = true;
        let refreshedEntryId: number | null;
        try {
          refreshedEntryId = await refreshAuthoritativeFollow();
        } catch {
          if (isActiveRequest()) {
            this.setData({
              loading: false,
              error: "球队状态尚未同步，请稍后重试",
            });
          }
          return;
        }
        if (!isActiveRequest()) return;
        if (!refreshedEntryId) {
          this.showEntryEmptyState();
          return;
        }
        if (refreshedEntryId === entryId) {
          this.setData({
            loading: false,
            error: "球队状态尚未同步，请稍后重试",
          });
          return;
        }
        this.clearEntryScopedViewState();
        this.loadedSeason = undefined;
        this.loadedEntryId = 0;
        entryId = refreshedEntryId;
        this.setData({
          loading: true,
          error: "",
          entryId,
          tournaments: [],
          tournamentNames: [],
          selectedTournament: null,
          emptyState: "",
          fromCache: false,
        });
        desk = await getMyFplCompetitionsDesk(
          null,
          this.data.event > 0 ? this.data.event : null,
          forceRefresh,
          trace ?? undefined,
        );
      }
      const tournaments = desk.tournaments || [];
      if (!isActiveRequest()) return;
      const currentSeason = getApp<IAppOption>().globalData.season || undefined;
      const currentEntryId = currentMyFplEntryId();
      if (
        (season && currentSeason && season !== currentSeason) ||
        currentEntryId !== entryId
      ) {
        void this.loadLeagues(true, trace);
        return;
      }
      const deskViewerEntryId = Number(desk.aggregate?.viewer?.entryId) || 0;
      const effectiveEntryId = deskViewerEntryId || entryId;
      this.setData({
        loading: false,
        entryId: effectiveEntryId,
        tournaments,
        tournamentNames: tournaments.map((t) => t.name),
        fromCache: false,
      });
      this.loadedSeason = currentSeason || cached?.season;
      this.lastLoadAt = Date.now();
      this.loadedEntryId = effectiveEntryId;
      this.loadedEvent = this.data.event;
      this.loadedContextRevision =
        getAppContextSnapshot()?.contextRevision ?? 0;
      try {
        if (currentSeason) {
          wx.setStorageSync(DIRECTORY_CACHE_KEY, {
            entryId: effectiveEntryId,
            season: currentSeason,
            tournaments,
            storedAt: Date.now(),
          } satisfies LeaguesCache);
        }
      } catch {
        /* cache is best effort */
      }
      if (desk.state === "UNAVAILABLE" && tournaments.length === 0) {
        this.setData({ error: "赛事数据暂时不可用，请稍后重试" });
        return;
      }
      this.afterDirectoryReady();
    } catch (error) {
      if (!isActiveRequest()) return;
      this.setData({
        loading: false,
        error: cached
          ? "刷新失败，当前显示上次成功结果"
          : error instanceof Error
            ? error.message
            : "赛事加载失败",
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
        emptyDescription: "赛事由经理在网页版创建并关联联赛后，会显示在这里。",
        emptyActionText: "",
      });
      return;
    }
    this.setData({ emptyState: "" });
    const lastId = readLastPick(this.data.entryId);
    const index = Math.max(
      0,
      tournaments.findIndex((t) => Number(t.id) === lastId),
    );
    this.pickTournament(index, false);
    void this.loadView(this.data.activeView, false);
  },

  pickTournament(index: number, reload = true) {
    const tournaments = this.data.tournaments;
    const selected = tournaments[index] || tournaments[0];
    if (!selected) return;
    // A finished tournament pins the review window to its final gameweek.
    const endGw = Number(selected.groupEndedEventId) || 0;
    const maxGw =
      endGw > 0 && (this.data.maxGw <= 0 || endGw < this.data.maxGw)
        ? endGw
        : this.data.maxGw;
    const event =
      this.data.event > 0 && this.data.event <= maxGw ? this.data.event : maxGw;
    this.setData({
      selectedTournamentIndex: tournaments.indexOf(selected),
      selectedTournament: selected,
      maxGw,
      event,
    });
    if (this.data.entryId) {
      writeLastPick(this.data.entryId, Number(selected.id));
    }
    if (reload) {
      this.seasonRows = [];
      this.gwRows = [];
      this.pathRequestId += 1;
      this.pathLoadedKey = "";
      this.setData({
        hasSeasonData: false,
        hasGwData: false,
        boardRows: [],
        displayedRows: [],
        boardTotalRows: 0,
        boardPage: 1,
        boardPageCount: 1,
        boardFrom: 0,
        boardTo: 0,
        hasPreviousBoardPage: false,
        hasNextBoardPage: false,
        viewError: "",
        ...emptyPathState(),
        pathLoading: true,
      });
      void this.loadView(this.data.activeView, false);
    }
  },

  onTournamentChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value);
    if (!Number.isFinite(index) || index < 0) return;
    if (this.data.v2Enabled) {
      this.selectV2Tournament(index);
      return;
    }
    this.pickTournament(index);
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const rawValue = Number(event.detail.value);
    if (!Number.isSafeInteger(rawValue) || rawValue < 0) return;
    const value = this.data.v2Enabled
      ? Number(this.data.v2EventIds[rawValue])
      : rawValue;
    const currentEvent = this.data.v2Enabled
      ? this.data.v2Event
      : this.data.event;
    if (!Number.isFinite(value) || value <= 0 || value === currentEvent) return;
    if (this.data.v2Enabled) {
      const tournamentId = this.data.v2SelectedTournament?.tournamentId;
      if (!tournamentId) return;
      this.setData({
        v2SelectedEventIndex: rawValue,
        v2Event: value,
        event: value,
        v2TransferCostTotal: 0,
        v2HeadlineLabel: "Gross",
        v2GameweekRows: [],
        v2Gameweek: null,
        v2Season: null,
        v2LoadingMore: false,
        v2HasNextPage: false,
        v2Error: "",
      });
      void this.loadV2Review(
        tournamentId,
        value,
        false,
        capturePageRequestTrace({
          callerSurface: "my-fpl-leagues-v2",
          trigger: "tab",
        }),
      );
      return;
    }
    this.setData({ event: value, gwNotice: "" });
    this.gwRows = [];
    this.setData({ hasGwData: false });
    void this.loadView(
      this.data.activeView === "gameweek" ? "gameweek" : "season",
      false,
      undefined,
      { reloadPath: false },
    );
  },

  clearViewData(viewError = "") {
    this.seasonRows = [];
    this.gwRows = [];
    this.setData({
      viewLoading: false,
      viewError,
      hasSeasonData: false,
      hasGwData: false,
      pathLoading: false,
      boardRows: [],
      displayedRows: [],
      boardTotalRows: 0,
      boardPage: 1,
      boardPageCount: 1,
      boardFrom: 0,
      boardTo: 0,
      hasPreviousBoardPage: false,
      hasNextBoardPage: false,
    });
  },

  onViewTap(event: WechatMiniprogram.TouchEvent) {
    const view = String(
      event.currentTarget.dataset.view || "season",
    ) as LeagueView;
    if (view === this.data.activeView) return;
    if (this.data.v2Enabled) {
      if (this.data.v2Loading) return;
      this.viewRequestId += 1;
      this.v2RetryOperation = null;
      const nextState =
        (view === "season"
          ? this.data.v2Season?.state
          : this.data.v2Gameweek?.state) || "UNAVAILABLE";
      this.setData({
        activeView: view,
        showSeason: view === "season",
        showGameweek: view === "gameweek",
        v2State: nextState,
        v2StatusText: tournamentReviewStateText(
          nextState as MyTournamentReviewState,
        ),
        v2LoadingMore: false,
        v2HasNextPage: Boolean(
          tournamentReviewNextCursor(
            view === "season" ? this.data.v2Season : this.data.v2Gameweek,
          ),
        ),
      });
      return;
    }
    this.setData({
      activeView: view,
      showSeason: view === "season",
      showGameweek: view === "gameweek",
      sortOptions: view === "season" ? SEASON_SORT_OPTIONS : GW_SORT_OPTIONS,
      sortKey: "rank",
      sortAsc: true,
      boardPage: 1,
      keyword: "",
    });
    const cachedRows = view === "season" ? this.seasonRows : this.gwRows;
    if (cachedRows.length) {
      this.setData({
        boardRows: cachedRows,
        boardCol1: view === "season" ? "总积分" : "本轮",
        boardCol2: view === "season" ? "总排名" : "扣分",
        boardCol3: view === "season" ? "价值" : "总分",
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
    options?: { reloadPath?: boolean },
  ) {
    if (this.data.v2Enabled) {
      const tournamentId = this.data.v2SelectedTournament?.tournamentId;
      if (tournamentId && this.data.v2Event > 0) {
        await this.loadV2Review(
          tournamentId,
          this.data.v2Event,
          forceRefresh,
          originatingTrace,
        );
      }
      return;
    }
    const tournament = this.data.selectedTournament;
    const entryId = this.data.entryId;
    if (!tournament || !entryId || this.data.event <= 0) return;
    const requestId = ++this.viewRequestId;
    const trace = originatingTrace
      ? {
          ...originatingTrace,
          callerSurface: "my-fpl-leagues-view",
          trigger: forceRefresh ? ("refresh" as const) : ("tab" as const),
        }
      : capturePageRequestTrace({
          callerSurface: "my-fpl-leagues-view",
          trigger: forceRefresh ? "refresh" : "tab",
        });
    this.setData({ viewLoading: true, viewError: "" });
    let viewerEntryRecoveryAttempted = false;
    try {
      // The desk owns finalized-event gating. Keep the shared event helper in
      // the reporting surface so legacy context remains classified consistently
      // while PRESEASON/PENDING states are still rendered by the desk.
      const requestedEvent = canReadEventReporting(
        this.data.event,
        getAppContextSnapshot()?.currentEvent,
      )
        ? this.data.event
        : this.data.event > 0
          ? this.data.event
          : null;
      const desk = await getMyFplCompetitionsDesk(
        Number(tournament.id),
        requestedEvent,
        forceRefresh,
        trace,
      );
      if (!this.isActiveViewRequest(requestId)) return;
      const eventId = Number(desk.eventId) || 0;
      const viewerEntryId = Number(desk.aggregate?.viewer?.entryId) || 0;
      const viewEntryId = viewerEntryId || entryId;
      const board =
        desk.state === "READY" && eventId > 0 && desk.aggregate
          ? await getCompleteMyFplCompetitionBoard(
              Number(tournament.id),
              eventId,
              forceRefresh,
              trace,
            )
          : null;
      if (!this.isActiveViewRequest(requestId)) return;
      if (desk.state === "UNAVAILABLE") {
        this.clearViewData("赛事数据暂时不可用，请稍后重试");
        return;
      }
      if (view === "season") {
        await this.loadSeasonView(
          Number(tournament.id),
          viewEntryId,
          forceRefresh,
          requestId,
          trace,
          options?.reloadPath !== false,
          desk,
          board,
        );
      } else {
        await this.loadGameweekView(
          Number(tournament.id),
          viewEntryId,
          forceRefresh,
          requestId,
          trace,
          desk,
          board,
        );
      }
      if (!this.isActiveViewRequest(requestId)) return;
    } catch (error) {
      if (!this.isActiveViewRequest(requestId)) return;
      if (
        !viewerEntryRecoveryAttempted &&
        isViewerEntryAuthorizationError(error)
      ) {
        viewerEntryRecoveryAttempted = true;
        try {
          const refreshedEntryId = await refreshAuthoritativeFollow();
          if (!this.isActiveViewRequest(requestId)) return;
          if (!refreshedEntryId) {
            this.showEntryEmptyState();
            return;
          }
          if (refreshedEntryId !== entryId) {
            this.clearEntryScopedViewState();
            this.loadedSeason = undefined;
            this.loadedEntryId = 0;
            this.pathLoadedKey = "";
            this.setData({
              entryId: refreshedEntryId,
              tournaments: [],
              tournamentNames: [],
              selectedTournament: null,
              emptyState: "",
              fromCache: false,
              viewError: "",
            });
            void this.loadLeagues(true, trace);
            return;
          }
          this.setData({ viewError: "球队状态尚未同步，请稍后重试" });
          return;
        } catch {
          this.setData({ viewError: "球队状态尚未同步，请稍后重试" });
          return;
        }
      }
      this.setData({
        viewError: error instanceof Error ? error.message : "赛事数据加载失败",
      });
    } finally {
      if (this.isActiveViewRequest(requestId)) {
        this.setData({ viewLoading: false });
      }
    }
  },

  isActiveViewRequest(requestId: number): boolean {
    return this.pageVisible && requestId === this.viewRequestId;
  },

  async loadSeasonView(
    tournamentId: number,
    entryId: number,
    forceRefresh: boolean,
    requestId: number,
    trace?: PageRequestTrace,
    reloadPath = true,
    desk?: MyFplCompetitionsDesk,
    board?: MyFplCompetitionBoard | null,
  ) {
    const aggregate = desk?.aggregate;
    const snapshot =
      aggregate && board ? seasonSnapshotFromDesk(aggregate, board) : null;
    const summary = aggregate ? rankingSummaryFromDesk(aggregate) : undefined;
    if (!this.isActiveViewRequest(requestId)) return;
    if (!snapshot || !snapshot.standings.length) {
      this.seasonRows = [];
      this.setData({
        hasSeasonData: false,
        boardTotalRows: board?.totalRows || board?.fieldSize || 0,
        boardRows: this.data.activeView === "season" ? [] : this.data.boardRows,
        displayedRows:
          this.data.activeView === "season" ? [] : this.data.displayedRows,
      });
      if (this.data.activeView === "season") this.syncBoard();
      return;
    }
    const me = summary;
    this.seasonRows = snapshot.standings.map((row) =>
      seasonBoardRow(row, entryId),
    );
    this.setData({
      hasSeasonData: true,
      boardTotalRows: Math.max(
        board?.totalRows || 0,
        board?.fieldSize || 0,
        snapshot.entryCount || 0,
      ),
      heroRank: formatRank(me?.tournamentOverallRank),
      heroRankSub: heroSubText(me),
      heroKicker: `截至第 ${snapshot.asOfEventId || this.data.event} 轮的积分榜`,
      meTiles: meSeasonTiles(
        me,
        snapshot.metrics || [],
        Math.max(1, Number(snapshot.asOfEventId || this.data.event) || 1),
      ),
      overviewStats: overviewStatTiles(snapshot),
      leaderRows: (snapshot.metrics || []).map((metric) => ({
        id: metric.key,
        label: METRIC_LABELS[metric.key] || metric.key,
        name: metric.leaderEntryName || metric.leaderPlayerName || "-",
        meta: [
          metric.leaderPlayerName || "",
          metric.averageValue !== null && metric.averageValue !== undefined
            ? `场均 ${metricAverageValueText(metric.key, metric.averageValue)}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        value: metricValueText(metric.key, metric.leaderValue),
      })),
    });
    if (this.data.activeView === "season") {
      this.setData({ boardRows: this.seasonRows });
      this.syncBoard();
    }
    const pathKey = seasonPathCacheKey(tournamentId, entryId, this.data.event);
    const needsPath =
      forceRefresh ||
      this.pathLoadedKey !== pathKey ||
      this.data.pathPoints.length < 2;
    if (reloadPath && needsPath)
      void this.loadSeasonPath(tournamentId, entryId, forceRefresh, trace);
  },

  async loadSeasonPath(
    tournamentId: number,
    entryId: number,
    forceRefresh: boolean,
    trace?: PageRequestTrace,
  ) {
    const start = Math.max(
      1,
      Number(this.data.selectedTournament?.groupStartedEventId) || 1,
    );
    const end = Math.max(start, this.data.event);
    const pathKey = seasonPathCacheKey(tournamentId, entryId, end);
    const keepExisting =
      !forceRefresh &&
      this.pathLoadedKey === pathKey &&
      this.data.pathPoints.length > 0;
    if (forceRefresh) this.pathLoadedKey = "";
    const requestId = ++this.pathRequestId;
    this.setData(
      keepExisting
        ? { pathLoading: true }
        : {
            pathLoading: true,
            pathVisible: false,
            pathPoints: [],
            pathSeries: [],
          },
    );
    try {
      const payload = await getMyFplCompetitionSeasonPath(
        tournamentId,
        end,
        forceRefresh,
        trace,
      );
      if (requestId !== this.pathRequestId || !this.pageVisible) return;
      const points = pathPointsFromDesk(payload);
      this.setData({
        ...pathPageState(points, this.data.pathMode, this.data.pathSelectedGw),
      });
      this.pathLoadedKey = pathKey;
      this.setData({ pathLoading: false });
    } catch {
      if (requestId !== this.pathRequestId || !this.pageVisible) return;
      if (!(keepExisting && this.data.pathPoints.length >= 2)) {
        this.pathLoadedKey = "";
      }
      this.setData({
        pathLoading: false,
        pathVisible: this.data.pathPoints.length >= 2,
      });
    }
  },

  onPathMode(event: WechatMiniprogram.TouchEvent) {
    const mode = String(
      event.currentTarget.dataset.mode || "tournamentRank",
    ) as TournamentPathMode;
    this.setData(
      pathPageState(this.data.pathPoints, mode, this.data.pathSelectedGw),
    );
  },

  onPathSelect(event: WechatMiniprogram.CustomEvent<{ x: number | null }>) {
    const gw = event.detail?.x == null ? null : Number(event.detail.x);
    if (gw == null || !Number.isFinite(gw)) {
      this.setData(
        pathPageState(this.data.pathPoints, this.data.pathMode, null),
      );
      return;
    }
    this.setData(pathPageState(this.data.pathPoints, this.data.pathMode, gw));
  },

  async loadGameweekView(
    tournamentId: number,
    entryId: number,
    forceRefresh: boolean,
    requestId: number,
    trace?: PageRequestTrace,
    desk?: MyFplCompetitionsDesk,
    board?: MyFplCompetitionBoard | null,
  ) {
    let activeDesk = desk;
    let activeBoard = board;
    let activeEntryId =
      Number(activeDesk?.aggregate?.viewer?.entryId) || entryId;
    let event = Number(activeDesk?.eventId) || this.data.event;
    let notice = "";
    const ready = (
      candidateDesk?: MyFplCompetitionsDesk,
      candidateBoard?: MyFplCompetitionBoard | null,
    ) =>
      candidateDesk?.state === "READY" &&
      Boolean(candidateDesk.aggregate) &&
      candidateBoard?.state === "READY";
    if (!ready(activeDesk, activeBoard) && event > 1) {
      // Web parity: fall back one finalized GW when the requested round is
      // still pending. The desk remains the source of truth for this state.
      const fallback = event - 1;
      const retriedDesk = await getMyFplCompetitionsDesk(
        tournamentId,
        fallback,
        forceRefresh,
        trace,
      );
      if (!this.isActiveViewRequest(requestId)) return;
      const retriedEvent = Number(retriedDesk.eventId) || fallback;
      const retriedViewerEntryId =
        Number(retriedDesk.aggregate?.viewer?.entryId) || 0;
      const retriedBoard =
        retriedDesk.state === "READY" && retriedDesk.aggregate
          ? await getCompleteMyFplCompetitionBoard(
              tournamentId,
              retriedEvent,
              forceRefresh,
              trace,
            )
          : null;
      if (!this.isActiveViewRequest(requestId)) return;
      if (ready(retriedDesk, retriedBoard)) {
        notice = `第 ${event} 轮赛事结果尚未就绪 · 当前显示第 ${fallback} 轮数据`;
        event = retriedEvent;
        activeDesk = retriedDesk;
        activeBoard = retriedBoard;
        activeEntryId = retriedViewerEntryId || entryId;
      }
    }
    if (!ready(activeDesk, activeBoard)) {
      this.gwRows = [];
      this.setData({
        hasGwData: false,
        boardTotalRows: activeBoard?.totalRows || activeBoard?.fieldSize || 0,
        gwNotice: notice,
        boardRows:
          this.data.activeView === "gameweek" ? [] : this.data.boardRows,
        displayedRows:
          this.data.activeView === "gameweek" ? [] : this.data.displayedRows,
      });
      if (this.data.activeView === "gameweek") this.syncBoard();
      return;
    }
    if (!activeBoard) return;
    const results = boardResultsFromDesk(activeBoard);
    if (!results.length) {
      this.gwRows = [];
      this.setData({
        hasGwData: false,
        boardTotalRows: activeBoard.totalRows || activeBoard.fieldSize || 0,
        gwNotice: notice,
        boardRows:
          this.data.activeView === "gameweek" ? [] : this.data.boardRows,
        displayedRows:
          this.data.activeView === "gameweek" ? [] : this.data.displayedRows,
      });
      if (this.data.activeView === "gameweek") this.syncBoard();
      return;
    }
    const prevRankByEntry = previousRanksFromDesk(activeBoard);
    this.gwRows = results.map((row) =>
      gameweekBoardRow(row, activeEntryId, prevRankByEntry),
    );
    this.setData({
      hasGwData: true,
      boardTotalRows: Math.max(
        activeBoard.totalRows || 0,
        activeBoard.fieldSize || 0,
        results.length,
      ),
      gwNotice: notice,
      gwTiles: gwPerformanceTiles(
        results,
        prevRankByEntry,
        activeEntryId,
        event,
      ),
      topRows: gwTopRows(results),
      riserRows: gwMovementRows(results, prevRankByEntry, true),
      fallerRows: gwMovementRows(results, prevRankByEntry, false),
    });
    if (this.data.activeView === "gameweek") {
      this.setData({ boardRows: this.gwRows });
      this.syncBoard();
    }
  },

  onKeyword(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.setData({ keyword: event.detail.keyword, boardPage: 1 });
    this.syncBoard();
  },

  onResetSearch() {
    this.setData({ keyword: "", boardPage: 1 });
    this.syncBoard();
  },

  onSortTap(event: WechatMiniprogram.TouchEvent) {
    const key = String(
      event.currentTarget.dataset.key || "rank",
    ) as BoardSortKey;
    const option = this.data.sortOptions.find((item) => item.key === key);
    if (key === this.data.sortKey) {
      this.setData({ sortAsc: !this.data.sortAsc, boardPage: 1 });
    } else {
      this.setData({
        sortKey: key,
        sortAsc: option ? option.asc : true,
        boardPage: 1,
      });
    }
    this.syncBoard();
  },

  onPreviousBoardPage() {
    if (!this.data.hasPreviousBoardPage) return;
    this.setData({ boardPage: this.data.boardPage - 1 });
    this.syncBoard();
  },

  onNextBoardPage() {
    if (!this.data.hasNextBoardPage) return;
    this.setData({ boardPage: this.data.boardPage + 1 });
    this.syncBoard();
  },

  /** Client-side filter + sort over the complete server-paginated board. */
  syncBoard() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const filtered = keyword
      ? this.data.boardRows.filter(
          (row) =>
            row.name.toLowerCase().includes(keyword) ||
            row.manager.toLowerCase().includes(keyword),
        )
      : [...this.data.boardRows];
    const key = this.data.sortKey;
    const pick = (row: BoardRow) =>
      key === "rank"
        ? row.sortRank
        : key === "c1"
          ? row.sortC1
          : key === "c2"
            ? row.sortC2
            : row.sortC3;
    const asc = this.data.sortAsc;
    filtered.sort((a, b) => {
      const diff = pick(a) - pick(b);
      return (asc ? diff : -diff) || a.sortRank - b.sortRank;
    });
    const page = paginateBoardRows(filtered, this.data.boardPage);
    this.setData({
      displayedRows: page.rows,
      filteredCount: filtered.length,
      boardPage: page.page,
      boardPageCount: page.pageCount,
      boardFrom: page.from,
      boardTo: page.to,
      hasPreviousBoardPage: page.hasPrevious,
      hasNextBoardPage: page.hasNext,
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
      recordMyFplVisit({
        surface: "leagues",
        handoffActionType: action.actionType,
      });
    }
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
    }
  },

  async retryV2Operation(forceRefresh = true) {
    const operation = this.v2RetryOperation;
    if (operation === "loadMore") {
      await this.onV2LoadMore();
      return;
    }
    const trace = capturePageRequestTrace({
      callerSurface: "my-fpl-leagues-v2",
      trigger: "refresh",
    });
    if (operation === "review") {
      const tournamentId = this.data.v2SelectedTournament?.tournamentId;
      const eventId = this.data.v2Event;
      if (tournamentId && eventId > 0) {
        await this.loadV2Review(tournamentId, eventId, forceRefresh, trace);
        return;
      }
    }
    await this.loadV2Leagues(forceRefresh, trace);
  },

  onRetry() {
    if (this.data.v2Enabled) {
      void this.retryV2Operation(true);
      return;
    }
    if (this.data.tournaments.length) {
      void this.loadView(this.data.activeView, true);
      return;
    }
    void this.loadLeagues(true);
  },
});

function rankingSummaryFromDesk(
  aggregate: MyFplCompetitionAggregate,
): TournamentEntryRankingSummary | undefined {
  const viewer = aggregate.viewer;
  if (!viewer) return undefined;
  return {
    entryId: viewer.entryId,
    overallRank: viewer.overallRank,
    tournamentOverallRank: viewer.tournamentOverallRank,
    teamValue: viewer.teamValue,
    tournamentTeamValueRank: viewer.tournamentTeamValueRank,
    transfersNum: viewer.transfersNum,
    tournamentTransfersRank: viewer.tournamentTransfersRank,
    totalCosts: viewer.totalCosts,
    tournamentCostsRank: viewer.tournamentCostsRank,
    totalBenchPoints: viewer.totalBenchPoints,
    tournamentBenchPointsRank: viewer.tournamentBenchPointsRank,
    autoSubPoints: viewer.autoSubPoints,
    tournamentAutoSubRank: viewer.tournamentAutoSubRank,
    overallPoints: viewer.overallPoints,
    leaderOverallPoints: viewer.leaderOverallPoints,
    gapToLeader: viewer.gapToLeader,
    pointsBehindNext: viewer.pointsBehindNext,
    pointsAheadOfPrev: viewer.pointsAheadOfPrev,
  };
}

function boardRowsFromDesk(
  board: MyFplCompetitionBoard,
): MyFplCompetitionBoardRow[] {
  const rows = [...(board.rows || [])];
  if (
    board.viewerRow &&
    !rows.some((row) => row.entryId === board.viewerRow?.entryId)
  ) {
    rows.push(board.viewerRow);
  }
  return rows;
}

function seasonSnapshotFromDesk(
  aggregate: MyFplCompetitionAggregate,
  board: MyFplCompetitionBoard,
): TournamentSeasonSnapshot {
  return {
    asOfEventId: aggregate.eventId,
    entryCount: aggregate.entryCount,
    leaderOverallPoints: aggregate.leaderOverallPoints,
    secondOverallPoints: aggregate.secondOverallPoints,
    gapFirstSecond: aggregate.gapFirstSecond,
    averageOverallPoints: aggregate.averageOverallPoints,
    metrics: aggregate.metrics || [],
    standings: boardRowsFromDesk(board).map((row) => ({
      entryId: row.entryId,
      rank: row.fieldRank ?? row.rank,
      entryName: row.entryName,
      playerName: row.playerName,
      overallPoints: row.overallPoints,
      overallRank: row.overallRank,
      teamValue: row.teamValue,
    })),
  };
}

function boardResultsFromDesk(
  board: MyFplCompetitionBoard,
): TournamentEventResult[] {
  return boardRowsFromDesk(board).map((row) => ({
    entryId: row.entryId,
    entryName: row.entryName,
    playerName: row.playerName,
    groupId: row.groupId ?? 0,
    eventGroupRank: row.rank,
    eventPoints: row.eventPoints,
    eventCost: row.eventCost,
    eventNetPoints: row.eventNetPoints,
    eventRank: row.eventRank,
    overallPoints: row.overallPoints,
    overallRank: row.overallRank,
    eventChip: row.eventChip,
    captainPoints: row.captainPoints,
    teamValue: row.teamValue,
    bank: row.bank,
  }));
}

function previousRanksFromDesk(
  board: MyFplCompetitionBoard,
): Map<number, number> {
  const previous = new Map<number, number>();
  for (const row of boardRowsFromDesk(board)) {
    if (
      row.previousRank !== null &&
      row.previousRank !== undefined &&
      row.previousRank > 0
    ) {
      previous.set(row.entryId, row.previousRank);
    }
  }
  return previous;
}

function pathPointsFromDesk(
  payload: MyFplCompetitionSeasonPath,
): TournamentPathPoint[] {
  return (payload.points || [])
    .filter((point) => point.gameweek > 0)
    .map((point) => ({
      gameweek: point.gameweek,
      tournamentRank: point.tournamentRank ?? null,
      overallPoints: point.overallPoints ?? null,
      leaderOverallPoints: point.leaderOverallPoints ?? null,
      averageOverallPoints: point.averageOverallPoints ?? null,
    }));
}

function heroSubText(me: TournamentEntryRankingSummary | undefined): string {
  if (!me) return "";
  const parts = [`总积分 ${formatPoints(me.overallPoints)}`];
  if (me.tournamentOverallRank === 1) {
    // Web: "Top of the table" plus the cushion over 2nd place.
    parts.push(
      me.pointsAheadOfPrev
        ? `领跑中 · 领先下一名 ${formatPoints(me.pointsAheadOfPrev)}`
        : "领跑中",
    );
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
    parts.push(`FPL 总排名 ${formatRank(me.overallRank)}`);
  }
  return parts.join(" · ");
}

function meSeasonTiles(
  me: TournamentEntryRankingSummary | undefined,
  metrics: TournamentSeasonMetric[] = [],
  gwCount = 0,
): TileStat[] {
  if (!me) return [];
  const avgByKey = new Map(
    metrics.map((metric) => [metric.key, metric.averageValue]),
  );
  // Web secondary tiles show both the in-tournament rank and the field average.
  const metaWithAvg = (
    key: TournamentSeasonMetricKey,
    rank?: number | null,
  ): string => {
    const parts: string[] = [];
    if (rank) parts.push(`赛事内第 ${formatRank(rank)} 名`);
    const avg = avgByKey.get(key);
    if (avg !== null && avg !== undefined) {
      parts.push(`场均 ${metricAverageValueText(key, avg)}`);
    }
    return parts.join(" · ");
  };
  const tiles = [
    {
      label: "球队价值",
      value: formatMoney(me.teamValue),
      meta: metaWithAvg("TEAM_VALUE", me.tournamentTeamValueRank),
    },
    {
      label: "转会数",
      value: formatPoints(me.transfersNum),
      meta: metaWithAvg("TRANSFERS", me.tournamentTransfersRank),
    },
    {
      label: "总扣分",
      value: formatPoints(me.totalCosts),
      meta: metaWithAvg("TOTAL_COSTS", me.tournamentCostsRank),
    },
    {
      label: "替补积分",
      value: formatPoints(me.totalBenchPoints),
      meta: metaWithAvg("BENCH_POINTS", me.tournamentBenchPointsRank),
    },
    {
      label: "自动换人",
      value: formatPoints(me.autoSubPoints),
      meta: metaWithAvg("AUTO_SUB_POINTS", me.tournamentAutoSubRank),
    },
  ];
  // Sixth tile (fills the 2-col grid): scoring rate. The hero already carries
  // total points, so the tile shows points-per-GW against the field average.
  const overallPoints = num(me.overallPoints, NaN);
  if (Number.isFinite(overallPoints) && gwCount > 0) {
    const fieldAverage = avgByKey.get("OVERALL_POINTS");
    const metaParts: string[] = [];
    if (me.tournamentOverallRank) {
      metaParts.push(`赛事内第 ${formatRank(me.tournamentOverallRank)} 名`);
    }
    if (fieldAverage !== null && fieldAverage !== undefined) {
      metaParts.push(`场均 ${formatAverageNumber(fieldAverage / gwCount)}`);
    }
    tiles.push({
      label: "每轮均分",
      value: formatAverageNumber(overallPoints / gwCount),
      meta: metaParts.join(" · "),
    });
  }
  return tiles;
}

export function overviewStatTiles(
  snapshot: TournamentSeasonSnapshot,
): TileStat[] {
  return [
    { label: "参赛", value: formatPoints(snapshot.entryCount) },
    { label: "榜首总分", value: formatPoints(snapshot.leaderOverallPoints) },
    {
      label: "平均总分",
      value: formatAverageNumber(snapshot.averageOverallPoints),
    },
    { label: "冠亚分差", value: formatPoints(snapshot.gapFirstSecond) },
  ];
}

function seasonBoardRow(
  row: TournamentSeasonSnapshot["standings"][number],
  viewerEntryId: number,
): BoardRow {
  return {
    entryId: row.entryId,
    rankText: formatRank(row.rank),
    moveText: "",
    moveTone: "",
    name: row.entryName || "-",
    manager: row.playerName || "",
    chip: "",
    me: row.entryId === viewerEntryId,
    c1: formatPoints(row.overallPoints),
    c1Tone: "good",
    c2: formatRank(row.overallRank),
    c3: formatMoney(row.teamValue),
    sortRank: num(row.rank, 999999),
    sortC1: num(row.overallPoints),
    sortC2: row.overallRank ? num(row.overallRank) : 999999999,
    sortC3: num(row.teamValue),
  };
}

function chipCode(chip?: string | null): string {
  if (!chip || chip === "NONE") return "";
  const codes: Record<string, string> = {
    BENCH_BOOST: "BB",
    FREE_HIT: "FH",
    TRIPLE_CAPTAIN: "TC",
    WILDCARD: "WC",
    MANAGER: "AM",
  };
  return codes[chip] || "";
}

function gameweekBoardRow(
  row: TournamentEventResult,
  viewerEntryId: number,
  prevRankByEntry?: Map<number, number>,
): BoardRow {
  const gwPoints = row.eventNetPoints ?? row.eventPoints;
  const cost = num(row.eventCost);
  const prev = prevRankByEntry?.get(row.entryId);
  const delta = prev && row.eventGroupRank ? prev - row.eventGroupRank : 0;
  return {
    entryId: row.entryId,
    rankText: formatRank(row.eventGroupRank),
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
    sortC3: num(row.overallPoints),
  };
}

function movementText(
  currentRank: number | null | undefined,
  prevRank: number | undefined,
): Pick<TileStat, "meta" | "tone"> {
  if (!currentRank || !prevRank) return { meta: "", tone: "" };
  const delta = prevRank - currentRank;
  if (delta > 0) return { meta: `上升 ${formatRank(delta)}`, tone: "good" };
  if (delta < 0) return { meta: `下降 ${formatRank(-delta)}`, tone: "bad" };
  return { meta: "无变化", tone: "" };
}

function gwPerformanceTiles(
  results: TournamentEventResult[],
  prevRankByEntry: Map<number, number>,
  entryId: number,
  event: number,
): TileStat[] {
  const mine = results.find((row) => row.entryId === entryId);
  const top = [...results].sort(
    (a, b) => num(b.eventPoints) - num(a.eventPoints),
  )[0];
  const movement = movementText(
    mine?.eventGroupRank,
    prevRankByEntry.get(entryId),
  );
  const cost = num(mine?.eventCost);
  return [
    {
      label: "我的排名",
      value: formatRank(mine?.eventGroupRank),
      meta: movement.meta,
      tone: movement.tone,
    },
    {
      label: `第 ${event} 轮积分`,
      value: formatPoints(mine?.eventNetPoints ?? mine?.eventPoints),
      meta: cost > 0 ? `本轮扣分：-${cost}` : "",
    },
    {
      label: "队长得分",
      value: formatPoints(mine?.captainPoints),
    },
    {
      label: "最高得分",
      value: formatPoints(top?.eventPoints),
      meta: top?.entryName || "",
    },
  ];
}

function gwTopRows(results: TournamentEventResult[]): HighlightRow[] {
  return [...results]
    .sort((a, b) => num(b.eventPoints) - num(a.eventPoints))
    .slice(0, 5)
    .map((row, index) => ({
      id: `top-${row.entryId}`,
      title: `${index + 1}. ${row.entryName || "-"}`,
      meta: [row.playerName, chipCode(row.eventChip)]
        .filter(Boolean)
        .join(" · "),
      value: formatPoints(row.eventPoints),
    }));
}

function gwMovementRows(
  results: TournamentEventResult[],
  prevRankByEntry: Map<number, number>,
  risers: boolean,
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
      value: `${item.delta > 0 ? "+" : ""}${formatRank(item.delta)}`,
      tone: item.delta > 0 ? "good" : "bad",
    }));
}
