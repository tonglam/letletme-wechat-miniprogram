import {
  getPlayersForPickerPage,
  PLAYER_PICKER_PAGE_LIMIT,
  type PlayerPickerFilter,
} from "../../../services/player.service";
import { getTeamList } from "../../../services/common.service";
import {
  getPlayerValueByElement,
  getMarketAvailability,
  getMarketOwnership,
  getMarketPulse,
  readPlayerValueByDate,
} from "../../../services/price.service";
import type {
  MarketAvailabilityItem,
  MarketPulse,
  MarketPulsePlayer,
  MarketOwnershipDay,
  MarketOwnershipOverview,
  MarketOwnershipPeriod,
} from "../../../services/price.service";
import type { PlayerOption, PlayerValueChange } from "../../../models/player";
import {
  ensureAppContext,
  getAppContextSnapshot,
} from "../../../services/app-context.service";
import { capturePageRequestTrace } from "../../../services/graphql.service";
import { PagePerformanceTracker } from "../../../utils/page-performance";
import { copyShareText } from "../../../utils/live-share";
import { formatPriceMovementShareText } from "../../../utils/explore-share";
import { formatCompactNumber } from "../../../utils/summary-format";
import { formatPrice } from "../../../utils/fpl";
import {
  nextRequestRevision,
  isCurrentRevision,
  observeSoftTimeout,
  setDataAsync,
} from "../../../utils/page-request";

type PriceMode = "daily" | "player";
type MarketPeriod = MarketOwnershipPeriod;
type PriceResumeStage = "daily" | "player" | "history" | "search";

interface FilterOption {
  label: string;
  value: string;
}

export interface TeamDirectoryItem {
  id: number;
  name: string;
  shortName?: string;
}

function pickerIndex(value: unknown): number | null {
  const index = Number(value);
  return Number.isFinite(index) ? index : null;
}

/**
 * The backend picker only matches player web names. A keyword that exactly
 * names a team (or its short code, case-insensitive) is converted to a
 * teamId filter so the whole squad comes back.
 */
export function resolveTeamSearchId(
  keyword: string,
  directory: TeamDirectoryItem[],
): number | null {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return null;
  const hit = directory.find(
    (team) =>
      team.name.toLowerCase() === needle ||
      (team.shortName || "").toLowerCase() === needle,
  );
  return hit ? hit.id : null;
}

interface PricePageData {
  activeMode: PriceMode;
  loading: boolean;
  refreshing: boolean;
  playerLoading: boolean;
  loadingMore: boolean;
  historyLoading: boolean;
  error: string;
  staleMessage: string;
  playersError: string;
  historyError: string;
  changeDate: string;
  players: PlayerOption[];
  filteredPlayers: PlayerOption[];
  filteredPlayerCount: number;
  playersLoaded: boolean;
  playerListReady: boolean;
  playerListVisible: boolean;
  selectedPlayer: PlayerOption | null;
  playerKeyword: string;
  teamFilter: string;
  positionFilter: string;
  teamOptions: FilterOption[];
  teamOptionNames: string[];
  selectedTeamIndex: number;
  positionOptions: FilterOption[];
  positionOptionNames: string[];
  selectedPositionIndex: number;
  nextCursor: number | null;
  hasMorePlayers: boolean;
  riseChanges: PlayerValueChange[];
  fallChanges: PlayerValueChange[];
  historyRows: PlayerValueChange[];
  pulseLoaded: boolean;
  pulseError: string;
  coverageText: string;
  pulseStale: boolean;
  marketPeriod: MarketPeriod;
  marketDate: string;
  ownershipLoaded: boolean;
  ownershipError: string;
  ownershipStatusText: string;
  ownershipCoverageText: string;
  ownershipMissingDatesText: string;
  ownershipGameweekText: string;
  ownershipDateOptions: string[];
  ownershipSelectedDate: string;
  glanceTiles: GlanceTile[];
  mostSelectedRows: PulseListRow[];
  ownershipRiserRows: PulseListRow[];
  ownershipFallerRows: PulseListRow[];
  transferRows: PulseListRow[];
  availabilityRows: PulseListRow[];
  availabilityUpdateCount: number;
  availabilityExpanded: boolean;
  availabilityLoading: boolean;
  newPlayerRows: PulseListRow[];
  shareCopied: boolean;
  shareSheetOpen: boolean;
  shareText: string;
}

const ALL_VALUE = "ALL";

const POSITION_SHORT: Record<string, string> = {
  GOALKEEPER: "GKP",
  DEFENDER: "DEF",
  MIDFIELDER: "MID",
  FORWARD: "FWD",
};

/** FPL availability status codes → web MarketStatusBadge labels. */
const AVAILABILITY_STATUS: Record<string, string> = {
  a: "可出战",
  d: "存疑",
  i: "受伤",
  s: "停赛",
  u: "不可用",
};

interface PulseListRow {
  id: number;
  name: string;
  meta: string;
  valueText: string;
  subText: string;
  tone: "" | "good" | "bad";
  barStyle: string;
}

interface GlanceTile {
  key: string;
  label: string;
  valueText: string;
  subText: string;
  tone: "" | "good" | "bad";
}

function pulsePlayerMeta(player: MarketPulsePlayer): string {
  return `${player.teamShortName} · ${POSITION_SHORT[player.position] || player.position}`;
}

function signedPercentagePoints(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)} 个百分点`;
}

function signedCompact(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCompactNumber(Math.abs(value))}`;
}

function toBasicRow(
  player: MarketPulsePlayer,
  valueText: string,
  subText = "",
  barWidth = 0,
): PulseListRow {
  return {
    id: player.playerId,
    name: player.webName,
    meta: pulsePlayerMeta(player),
    valueText,
    subText,
    tone: "",
    barStyle:
      barWidth > 0 ? `width: ${Math.min(100, Math.max(4, barWidth))}%` : "",
  };
}

function mapOwnershipRows(
  moves: MarketOwnershipDay["risers"] | MarketOwnershipOverview["risers"],
  direction: "rise" | "fall",
): PulseListRow[] {
  const maxAbs = Math.max(
    ...moves.map((move) => Math.abs(move.changePercentagePoints)),
    0,
  );
  return moves.slice(0, 8).map((move) => ({
    ...toBasicRow(
      move.player,
      signedPercentagePoints(move.changePercentagePoints),
      `${move.fromSelectedByPercent.toFixed(1)}% → ${move.toSelectedByPercent.toFixed(1)}%`,
      maxAbs > 0 ? (Math.abs(move.changePercentagePoints) / maxAbs) * 100 : 0,
    ),
    tone: direction === "rise" ? "good" : "bad",
  }));
}

function mapAvailabilityRow(item: MarketAvailabilityItem): PulseListRow {
  const chance = item.chanceOfPlayingThisRound;
  const detail = [
    item.news,
    chance === null || chance === undefined ? "" : `本轮出场 ${chance}%`,
  ]
    .filter(Boolean)
    .join(" · ");
  return toBasicRow(
    item.player,
    AVAILABILITY_STATUS[item.status] || item.status,
    detail,
  );
}

/** Pulse section view-model, mirroring the web market dashboard sections. */
export function buildPulseView(pulse: MarketPulse): {
  coverageText: string;
  pulseStale: boolean;
  mostSelectedRows: PulseListRow[];
  transferRows: PulseListRow[];
  availabilityRows: PulseListRow[];
  newPlayerRows: PulseListRow[];
} {
  const coverage = pulse.coverage;
  const snapshotDate =
    coverage?.latestDate || pulse.snapshot?.snapshotDate || "";
  const coverageText = coverage
    ? `快照 ${snapshotDate || "-"} · 观察 ${coverage.observedDays}/${coverage.requestedDays} 天${coverage.complete ? "" : " · 覆盖不完整"}`
    : "";
  return {
    coverageText,
    pulseStale: coverage?.stale === true,
    mostSelectedRows: pulse.mostSelected
      .slice(0, 8)
      .map((player) =>
        toBasicRow(
          player,
          `${player.selectedByPercent.toFixed(1)}%`,
          formatPrice(player.price),
          player.selectedByPercent,
        ),
      ),
    transferRows: pulse.transferMovers.slice(0, 8).map((move) => ({
      ...toBasicRow(
        move.player,
        signedCompact(move.netTransfers),
        `转入 ${formatCompactNumber(move.transfersIn)} · 转出 ${formatCompactNumber(move.transfersOut)}`,
      ),
      tone: move.netTransfers > 0 ? "good" : move.netTransfers < 0 ? "bad" : "",
    })),
    availabilityRows: pulse.availabilityHighlights.map(mapAvailabilityRow),
    newPlayerRows: pulse.newPlayers
      .slice(0, 6)
      .map((item) =>
        toBasicRow(
          item.player,
          formatPrice(item.player.price),
          `首次观察 ${item.firstObservedDate || "-"}`,
        ),
      ),
  };
}

const POSITION_OPTIONS: FilterOption[] = [
  { label: "全部位置", value: ALL_VALUE },
  { label: "GKP", value: "GOALKEEPER" },
  { label: "DEF", value: "DEFENDER" },
  { label: "MID", value: "MIDFIELDER" },
  { label: "FWD", value: "FORWARD" },
];

function formatPickerDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortByChangeDateDesc(
  left: PlayerValueChange,
  right: PlayerValueChange,
): number {
  return getTime(right.changeDate) - getTime(left.changeDate);
}

function getTime(value?: string): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function priceChangeRowKey(
  row: PlayerValueChange,
  direction: string,
  index: number,
): string {
  return [
    row.element || row.playerId || 0,
    row.changeDate || "",
    direction,
    row.lastValue ?? row.oldValue ?? index,
  ].join(":");
}

function splitChanges(changes: PlayerValueChange[]): {
  riseChanges: PlayerValueChange[];
  fallChanges: PlayerValueChange[];
} {
  return {
    riseChanges: changes
      .filter(
        (change) =>
          (change.newValue ?? change.value ?? 0) >
          (change.oldValue ?? change.lastValue ?? 0),
      )
      .sort(
        (left, right) =>
          (right.newValue ?? right.value ?? 0) -
          (left.newValue ?? left.value ?? 0),
      )
      .map((change, index) => ({
        ...change,
        rowKey: priceChangeRowKey(change, "rise", index),
      })),
    fallChanges: changes
      .filter(
        (change) =>
          (change.newValue ?? change.value ?? 0) <
          (change.oldValue ?? change.lastValue ?? 0),
      )
      .sort(
        (left, right) =>
          (left.newValue ?? left.value ?? 0) -
          (right.newValue ?? right.value ?? 0),
      )
      .map((change, index) => ({
        ...change,
        rowKey: priceChangeRowKey(change, "fall", index),
      })),
  };
}

function mergePlayers(
  existing: PlayerOption[],
  incoming: PlayerOption[],
): PlayerOption[] {
  const seen = new Set(existing.map((player) => player.element));
  return existing.concat(
    incoming.filter((player) => {
      if (seen.has(player.element)) return false;
      seen.add(player.element);
      return true;
    }),
  );
}

function ownershipStatusText(status: string): string {
  switch (status) {
    case "READY":
      return "数据完整";
    case "PARTIAL":
      return "部分覆盖";
    case "NO_DATA":
      return "当日无快照";
    case "BASELINE_MISSING":
      return "缺少基准快照，不计算变化";
    case "NO_PREVIOUS_GAMEWEEK":
      return "首个 GW，没有上一轮基准";
    case "NO_UPCOMING_GAMEWEEK":
      return "暂无下一轮截止时间";
    default:
      return "市场动态暂不可用";
  }
}

function ownershipCoverageText(
  data: MarketOwnershipOverview | MarketOwnershipDay,
): string {
  const coverage = data.coverage;
  const range =
    coverage.fromDate && coverage.toDate
      ? `比较 ${coverage.fromDate} → ${coverage.toDate}`
      : ownershipStatusText(coverage.status);
  return `${range} · 观测 ${coverage.observedDays}/${coverage.requestedDays} 个日期`;
}

function ownershipMissingDatesText(
  data: MarketOwnershipOverview | MarketOwnershipDay,
): string {
  return data.coverage.missingDates.length
    ? `缺失日期：${data.coverage.missingDates.join("、")}`
    : "";
}

function ownershipGameweekText(
  data: MarketOwnershipOverview | MarketOwnershipDay,
): string {
  if (!("gameweek" in data) || !data.gameweek) return "";
  return `${data.gameweek.name} · 截止 ${data.gameweek.deadlineTime}`;
}

function ownershipDateOptions(latestDate: string | null | undefined): string[] {
  if (!latestDate) return [];
  const parsed = new Date(`${latestDate}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(parsed);
    date.setUTCDate(parsed.getUTCDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
}

Page({
  data: {
    activeMode: "daily",
    loading: false,
    refreshing: false,
    playerLoading: false,
    loadingMore: false,
    historyLoading: false,
    error: "",
    staleMessage: "",
    playersError: "",
    historyError: "",
    changeDate: formatPickerDate(),
    players: [],
    filteredPlayers: [],
    filteredPlayerCount: 0,
    playersLoaded: false,
    playerListReady: false,
    playerListVisible: false,
    selectedPlayer: null,
    playerKeyword: "",
    teamFilter: ALL_VALUE,
    positionFilter: ALL_VALUE,
    teamOptions: [{ label: "全部球队", value: ALL_VALUE }],
    teamOptionNames: ["全部球队"],
    selectedTeamIndex: 0,
    positionOptions: POSITION_OPTIONS,
    positionOptionNames: POSITION_OPTIONS.map((option) => option.label),
    selectedPositionIndex: 0,
    nextCursor: null,
    hasMorePlayers: false,
    riseChanges: [],
    fallChanges: [],
    historyRows: [],
    pulseLoaded: false,
    pulseError: "",
    coverageText: "",
    pulseStale: false,
    marketPeriod: "DAILY",
    marketDate: "",
    ownershipLoaded: false,
    ownershipError: "",
    ownershipStatusText: "",
    ownershipCoverageText: "",
    ownershipMissingDatesText: "",
    ownershipGameweekText: "",
    ownershipDateOptions: [],
    ownershipSelectedDate: "",
    glanceTiles: [],
    mostSelectedRows: [],
    ownershipRiserRows: [],
    ownershipFallerRows: [],
    transferRows: [],
    availabilityRows: [],
    availabilityUpdateCount: 0,
    availabilityExpanded: false,
    availabilityLoading: false,
    newPlayerRows: [],
    shareCopied: false,
    shareSheetOpen: false,
    shareText: "",
  } as PricePageData,

  shareCopiedTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  pulseData: null as MarketPulse | null,
  ownershipData: null as MarketOwnershipOverview | MarketOwnershipDay | null,
  pulseRevision: 0,
  ownershipRevision: 0,

  playerRequestRevision: 0,
  playerSearchTimer: undefined as number | undefined,
  teamDirectory: [] as TeamDirectoryItem[],
  dailyRequestOwner: {} as object,
  perfTracker: undefined as PagePerformanceTracker | undefined,
  pageActive: false,
  hasShown: false,
  startupPending: false,
  resumeStage: null as PriceResumeStage | null,
  resumeStageForceRefresh: false,
  ownershipPending: false,
  resumeOwnershipAfterShow: false,
  historyRequestRevision: 0,
  dailyRequestForceRefresh: false,
  paginationPending: false,
  paginationCursor: null as number | null,
  resumePaginationAfterShow: false,
  resumePaginationCursor: null as number | null,
  playerRefreshPending: false,
  resumePlayerRefreshAfterShow: false,

  async onLoad() {
    this.pageActive = true;
    this.startupPending = true;
    this.perfTracker = new PagePerformanceTracker(
      this,
      "pages/data/price/price",
      "cold-launch",
    );
    const tracker = this.perfTracker;
    // Today's public price read is not season-scoped. Context improves trace
    // attribution but must not prevent an L1/L2 PlayerValues hit from
    // rendering when CurrentEventInfo is temporarily unavailable.
    try {
      await ensureAppContext({ reason: "page-load" });
    } catch {}
    this.startupPending = false;
    if (!this.pageActive || this.perfTracker !== tracker) return;
    tracker.mark("contextReadyAt");
    void this.loadDailyChanges();
  },

  onShow() {
    this.pageActive = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return;
    const resumePlayerRefresh = this.resumePlayerRefreshAfterShow;
    this.resumePlayerRefreshAfterShow = false;
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(
      this,
      "pages/data/price/price",
      resumePlayerRefresh ? "refresh" : "warm-enter",
    );
    const tracker = this.perfTracker;
    const selector = this.primarySelector();
    tracker.mark("contextReadyAt");
    const resumeStage = this.resumeStage;
    const resumeStageForceRefresh = this.resumeStageForceRefresh;
    const resumeOwnership = this.resumeOwnershipAfterShow;
    const resumePagination = this.resumePaginationAfterShow;
    const resumePaginationCursor = this.resumePaginationCursor;
    this.resumeStage = null;
    this.resumeStageForceRefresh = false;
    const resumeOwnershipIfNeeded = () => {
      if (!resumeOwnership) return;
      this.resumeOwnershipAfterShow = false;
      void this.loadMarketOwnership(resumeStageForceRefresh);
    };
    if (resumePlayerRefresh) {
      this.setData({
        playerLoading: false,
        loadingMore: false,
        historyLoading: false,
      });
      void this.runPlayerRefresh(tracker);
      resumeOwnershipIfNeeded();
      return;
    }
    if (resumePagination && resumePaginationCursor !== null) {
      this.setData({ loadingMore: false });
      this.paginationPending = false;
      this.paginationCursor = null;
      const task = this.loadMorePlayers(resumePaginationCursor);
      resumeOwnershipIfNeeded();
      if (this.paginationPending && this.paginationCursor === resumePaginationCursor) {
        this.resumePaginationAfterShow = false;
        this.resumePaginationCursor = null;
      }
      return task.finally(() => {
        if (
          this.pageActive &&
          !this.paginationPending &&
          this.resumePaginationCursor === resumePaginationCursor
        ) {
          this.resumePaginationAfterShow = false;
          this.resumePaginationCursor = null;
        }
      });
    }
    if (resumeStage === "daily") {
      this.setData({ loading: false, refreshing: false });
      this.resumeOwnershipAfterShow = false;
      void this.loadDailyChanges(resumeStageForceRefresh);
      return;
    }
    if (resumeStage === "player") {
      this.setData({ playerLoading: false, loadingMore: false });
      void this.ensurePlayerModeReady();
      resumeOwnershipIfNeeded();
      return;
    }
    if (resumeStage === "search") {
      this.setData({ playerLoading: false, loadingMore: false });
      void this.startPlayerSearch(false);
      resumeOwnershipIfNeeded();
      return;
    }
    if (resumeStage === "history" && this.data.selectedPlayer?.element) {
      this.setData({ historyLoading: false });
      void this.loadSelectedPlayerHistory(this.data.selectedPlayer.element);
      resumeOwnershipIfNeeded();
      return;
    }
    if (resumeOwnership) {
      resumeOwnershipIfNeeded();
      return;
    }
    wx.nextTick(() => tracker.observePrimary(selector));
  },

  onHide() {
    const pendingSearch = this.playerSearchTimer !== undefined;
    if (pendingSearch) {
      clearTimeout(this.playerSearchTimer);
      this.playerSearchTimer = undefined;
    }
    this.resumePlayerRefreshAfterShow = this.playerRefreshPending;
    this.resumeOwnershipAfterShow =
      this.resumeOwnershipAfterShow || this.ownershipPending;
    this.resumePaginationAfterShow =
      this.resumePaginationAfterShow || this.paginationPending;
    if (this.paginationPending && this.paginationCursor !== null) {
      this.resumePaginationCursor = this.paginationCursor;
    }
    this.resumeStageForceRefresh = this.resumeStageForceRefresh || this.dailyRequestForceRefresh;
    this.resumeStage = this.resumePlayerRefreshAfterShow
      ? null
      : this.data.activeMode === "player"
        ? this.data.historyLoading
          ? "history"
          : pendingSearch
            ? "search"
            : this.startupPending || this.data.playerLoading || this.data.loadingMore
              ? "player"
              : null
        : this.startupPending || this.data.loading || this.data.refreshing
          ? "daily"
          : null;
    this.pageActive = false;
    this.playerRefreshPending = false;
    nextRequestRevision(this.dailyRequestOwner, "daily");
    this.invalidatePlayerRequest();
    this.historyRequestRevision += 1;
    this.perfTracker?.disconnect();
    this.clearShareCopiedTimer();
  },

  onUnload() {
    this.pageActive = false;
    this.resumeStage = null;
    this.resumeStageForceRefresh = false;
    this.resumeOwnershipAfterShow = false;
    this.dailyRequestForceRefresh = false;
    this.paginationPending = false;
    this.paginationCursor = null;
    this.resumePaginationAfterShow = false;
    this.resumePaginationCursor = null;
    this.playerRefreshPending = false;
    this.resumePlayerRefreshAfterShow = false;
    nextRequestRevision(this.dailyRequestOwner, "daily");
    this.invalidatePlayerRequest();
    this.historyRequestRevision += 1;
    this.perfTracker?.disconnect();
    if (this.playerSearchTimer !== undefined) {
      clearTimeout(this.playerSearchTimer);
    }
    this.clearShareCopiedTimer();
  },

  onPullDownRefresh() {
    this.startDailyRefreshTrace();
    const tracker = this.perfTracker;
    if (this.data.activeMode === "player") {
      tracker?.mark("primaryRequestStartAt");
      const task = this.runPlayerRefresh(tracker).then(() => {
        tracker?.mark("primaryResponseAt");
        tracker?.mark("primarySetDataAt");
        wx.nextTick(() => tracker?.observePrimary("#perf-primary-player"));
      });
      return task.finally(() => wx.stopPullDownRefresh());
    }
    const task = this.loadDailyChanges(true);
    return task.finally(() => wx.stopPullDownRefresh());
  },

  onRetry() {
    if (this.data.activeMode === "player") {
      this.startDailyRefreshTrace();
      void this.runPlayerRefresh(this.perfTracker);
      return;
    }
    this.startDailyRefreshTrace();
    this.loadDailyChanges();
  },

  onModeChange(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { mode: PriceMode }
    >,
  ) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.activeMode) return;

    this.clearShareCopiedTimer();
    this.setData({
      activeMode: mode,
      shareCopied: false,
      shareSheetOpen: false,
      shareText: "",
    });
    if (mode === "player") {
      this.ensurePlayerModeReady();
    }
  },

  onMarketPeriodChange(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { period: MarketPeriod }
    >,
  ) {
    const period = event.currentTarget.dataset.period;
    if (!period || period === this.data.marketPeriod) return;
    this.setData({
      marketPeriod: period,
      marketDate: period === "DAILY" ? this.data.ownershipSelectedDate : "",
      ownershipLoaded: false,
      ownershipError: "",
      ownershipStatusText: "",
      ownershipCoverageText: "",
      ownershipMissingDatesText: "",
      ownershipGameweekText: "",
      ownershipRiserRows: [],
      ownershipFallerRows: [],
      glanceTiles: [],
    });
    void this.loadMarketOwnership();
  },

  onMarketDateSelect(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { date: string }
    >,
  ) {
    const date = String(event.currentTarget.dataset.date || "");
    if (!date) return;
    this.setData({
      marketDate: date,
      ownershipSelectedDate: date,
      ownershipLoaded: false,
      ownershipError: "",
      ownershipStatusText: "",
      ownershipCoverageText: "",
      ownershipMissingDatesText: "",
      ownershipGameweekText: "",
      ownershipRiserRows: [],
      ownershipFallerRows: [],
      glanceTiles: [],
    });
    void this.loadMarketOwnership();
  },

  onDateChange(event: WechatMiniprogram.PickerChange) {
    this.startDailyRefreshTrace();
    this.clearShareCopiedTimer();
    this.setData({
      changeDate: String(event.detail.value),
      riseChanges: [],
      fallChanges: [],
      staleMessage: "",
      error: "",
      shareCopied: false,
      shareSheetOpen: false,
      shareText: "",
    });
    this.loadDailyChanges();
  },

  startDailyRefreshTrace() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/data/price/price", "refresh");
    this.perfTracker.mark("contextReadyAt");
  },

  primarySelector(): string {
    return this.data.activeMode === "player"
      ? "#perf-primary-player"
      : "#perf-primary-content";
  },

  async loadDailyChanges(forceRefresh = false): Promise<void> {
    void this.loadMarketPulse(forceRefresh);
    const revision = nextRequestRevision(this.dailyRequestOwner, "daily");
    this.dailyRequestForceRefresh = forceRefresh;
    const changeDate = this.data.changeDate;
    const hasRows =
      this.data.riseChanges.length > 0 || this.data.fallChanges.length > 0;
    const tracker = this.perfTracker;
    this.setData({
      loading: !hasRows,
      refreshing: hasRows,
      error: "",
      staleMessage: "",
    });
    tracker?.mark("primaryRequestStartAt");
    const context = getAppContextSnapshot();
    const readTask = readPlayerValueByDate(changeDate, {
      forceRefresh,
      trace:
        tracker && context
          ? {
              navigationId: tracker.navigationId,
              callerSurface: "price-daily",
              trigger: forceRefresh ? "refresh" : "load",
              forceReason: forceRefresh ? "user-refresh" : undefined,
              contextRevision: context.contextRevision,
            }
          : undefined,
    });
    observeSoftTimeout(readTask, 2900, () => {
      if (!this.pageActive || !isCurrentRevision(this.dailyRequestOwner, "daily", revision)) return;
      tracker?.mark("softFailureAt");
      this.setData(
        {
          loading: false,
          refreshing: false,
          error: hasRows
            ? "刷新时间较长，请稍后重试；当前继续显示已有数据"
            : "加载时间较长，请稍后重试；当前请求仍在后台继续",
        },
        () => {
          if (hasRows) {
            wx.nextTick(() => tracker?.observePrimary("#perf-primary-content"));
          }
        },
      );
    });
    try {
      const read = await readTask;
      if (!this.pageActive || !isCurrentRevision(this.dailyRequestOwner, "daily", revision)) return;
      tracker?.mark("primaryResponseAt");
      await setDataAsync(this, {
        ...splitChanges(read.data),
        error: "",
        staleMessage:
          read.meta.stale && read.meta.storedAt
            ? `当前为上次成功数据 · ${new Date(read.meta.storedAt).toLocaleString()}`
            : "",
      });
      tracker?.mark("primarySetDataAt");
      this.rebuildGlanceTiles();
      wx.nextTick(() => tracker?.observePrimary("#perf-primary-content"));
    } catch (error) {
      if (!this.pageActive || !isCurrentRevision(this.dailyRequestOwner, "daily", revision)) return;
      this.setData({
        error: error instanceof Error ? error.message : "市场动态加载失败",
      });
      wx.nextTick(() =>
        this.perfTracker?.observePrimary("#perf-primary-content"),
      );
    } finally {
      if (
        this.pageActive &&
        isCurrentRevision(this.dailyRequestOwner, "daily", revision)
      ) {
        this.setData({ loading: false, refreshing: false });
        this.dailyRequestForceRefresh = false;
      }
    }
  },

  /** Latest market snapshot sections (web /explore/market) — date-picker independent. */
  async loadMarketPulse(forceRefresh = false): Promise<void> {
    const revision = ++this.pulseRevision;
    void this.loadMarketOwnership(forceRefresh);
    try {
      const pulse = await getMarketPulse(forceRefresh);
      if (!this.pageActive || revision !== this.pulseRevision) return;
      this.pulseData = pulse;
      this.setData({
        ...buildPulseView(pulse),
        pulseLoaded: true,
        pulseError: "",
        availabilityUpdateCount: pulse.availabilityUpdateCount,
        availabilityExpanded: false,
        ownershipDateOptions:
          this.data.marketPeriod === "DAILY"
            ? ownershipDateOptions(
                pulse.snapshot?.snapshotDate || this.data.ownershipSelectedDate,
              )
            : this.data.ownershipDateOptions,
      });
      this.rebuildGlanceTiles();
    } catch (error) {
      if (!this.pageActive || revision !== this.pulseRevision) return;
      this.setData({
        pulseError: error instanceof Error ? error.message : "市场动态加载失败",
      });
    }
  },

  /** Explicit ownership period read; no period fallback is performed here. */
  async loadMarketOwnership(forceRefresh = false): Promise<void> {
    const revision = ++this.ownershipRevision;
    const period = this.data.marketPeriod;
    const date = period === "DAILY" ? this.data.marketDate || null : null;
    this.ownershipPending = true;
    this.ownershipData = null;
    this.setData({
      ownershipLoaded: false,
      ownershipError: "",
      ownershipRiserRows: [],
      ownershipFallerRows: [],
      glanceTiles: [],
    });
    try {
      const ownership = await getMarketOwnership(period, date, forceRefresh);
      if (!this.pageActive || revision !== this.ownershipRevision) return;
      this.ownershipData = ownership;
      const selectedDate =
        "date" in ownership
          ? ownership.date || ownership.coverage.toDate || ""
          : ownership.coverage.toDate || "";
      const latestDate =
        ownership.coverage.latestDate ||
        selectedDate ||
        this.pulseData?.snapshot?.snapshotDate;
      this.setData({
        ownershipLoaded: true,
        ownershipError: "",
        ownershipStatusText: ownershipStatusText(ownership.coverage.status),
        ownershipCoverageText: ownershipCoverageText(ownership),
        ownershipMissingDatesText: ownershipMissingDatesText(ownership),
        ownershipGameweekText: ownershipGameweekText(ownership),
        ownershipDateOptions: ownershipDateOptions(latestDate),
        ...(period === "DAILY"
          ? {
              marketDate: selectedDate,
              ownershipSelectedDate: selectedDate,
            }
          : {}),
        ownershipRiserRows: mapOwnershipRows(ownership.risers, "rise"),
        ownershipFallerRows: mapOwnershipRows(ownership.fallers, "fall"),
      });
      this.rebuildGlanceTiles();
    } catch (error) {
      if (!this.pageActive || revision !== this.ownershipRevision) return;
      this.setData({
        ownershipLoaded: false,
        ownershipError:
          error instanceof Error ? error.message : "市场持有率加载失败",
        ownershipRiserRows: [],
        ownershipFallerRows: [],
        glanceTiles: [],
      });
      this.ownershipData = null;
    } finally {
      if (revision === this.ownershipRevision) {
        this.ownershipPending = false;
      }
    }
  },

  /** Glance strip: price-board counts plus the selected ownership period. */
  rebuildGlanceTiles() {
    const tiles: GlanceTile[] = [
      {
        key: "rise",
        label: "上涨",
        valueText: String(this.data.riseChanges.length),
        subText: this.data.changeDate,
        tone: "good",
      },
      {
        key: "fall",
        label: "下跌",
        valueText: String(this.data.fallChanges.length),
        subText: this.data.changeDate,
        tone: "bad",
      },
    ];
    const topRise = this.ownershipData?.risers[0];
    const topFall = this.ownershipData?.fallers[0];
    if (topRise) {
      tiles.push({
        key: "hot",
        label: "持有最热",
        valueText: topRise.player.webName,
        subText: `${signedPercentagePoints(topRise.changePercentagePoints)} · ${topRise.toSelectedByPercent.toFixed(1)}%`,
        tone: "good",
      });
    }
    if (topFall) {
      tiles.push({
        key: "cold",
        label: "持有最冷",
        valueText: topFall.player.webName,
        subText: `${signedPercentagePoints(topFall.changePercentagePoints)} · ${topFall.toSelectedByPercent.toFixed(1)}%`,
        tone: "bad",
      });
    }
    this.setData({ glanceTiles: tiles });
  },

  /** Web: clicking a price-change row opens that player's history panel. */
  onPriceRowTap(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { direction: string; index: number }
    >,
  ) {
    const { direction, index } = event.currentTarget.dataset;
    const list =
      direction === "rise" ? this.data.riseChanges : this.data.fallChanges;
    const change = list[Number(index)];
    if (!change?.element) return;
    const player: PlayerOption = {
      element: change.element,
      name: change.name || change.playerName || "-",
      team: change.team,
      teamName: change.teamName,
      position: change.position,
      priceText: change.newPriceText || "",
    };
    this.setData({
      activeMode: "player",
      selectedPlayer: player,
      playerListVisible: false,
      historyRows: [],
      historyError: "",
    });
    this.loadSelectedPlayerHistory(player.element);
    void this.ensurePlayerModeReady();
  },

  /** 伤情动态 disclosure — highlights first, full availabilityUpdates on demand (web pattern). */
  async onAvailabilityExpand() {
    if (this.data.availabilityLoading) return;
    if (this.data.availabilityExpanded) {
      const highlights = (this.pulseData?.availabilityHighlights ?? []).map(
        mapAvailabilityRow,
      );
      this.setData({
        availabilityExpanded: false,
        availabilityRows: highlights,
      });
      return;
    }
    this.setData({ availabilityLoading: true });
    try {
      const items = await getMarketAvailability();
      if (!this.pageActive) return;
      this.setData({
        availabilityRows: items.map(mapAvailabilityRow),
        availabilityExpanded: true,
      });
    } catch {
      if (!this.pageActive) return;
      wx.showToast({ title: "伤情列表加载失败", icon: "none" });
    } finally {
      if (this.pageActive) {
        this.setData({ availabilityLoading: false });
      }
    }
  },

  async ensurePlayerModeReady(): Promise<void> {
    if (this.data.teamOptions.length === 1) {
      await this.loadTeamOptions();
    }
    if (this.isPlayerListReady() && !this.data.playersLoaded) {
      await this.startPlayerSearch(false);
    }
  },

  async loadTeamOptions(forceRefresh = false): Promise<void> {
    const tracker = this.perfTracker;
    const trace = capturePageRequestTrace({
      callerSurface: "price-team-directory",
      trigger: "load",
    });
    this.setData({ playerLoading: true, playersError: "" });
    try {
      const context = await ensureAppContext({ reason: "page-load", forceRefresh });
      if (!this.pageActive || this.perfTracker !== tracker) return;
      const season = context.season;
      const teams = await getTeamList(season, forceRefresh, trace) as TeamDirectoryItem[];
      if (!this.pageActive || this.perfTracker !== tracker) return;
      this.teamDirectory = teams;
      const teamOptions: FilterOption[] = [
        { label: "全部球队", value: ALL_VALUE },
        ...teams
          .map((team) => ({
            label: team.shortName
              ? `${team.name} (${team.shortName})`
              : team.name,
            value: String(team.id),
          }))
          .sort((left, right) => left.label.localeCompare(right.label)),
      ];
      this.setData({
        teamOptions,
        teamOptionNames: teamOptions.map((option) => option.label),
      });
    } catch (error) {
      if (!this.pageActive || this.perfTracker !== tracker) return;
      this.setData({
        playersError:
          error instanceof Error ? error.message : "球队列表加载失败",
      });
    } finally {
      if (this.pageActive && this.perfTracker === tracker) {
        this.setData({ playerLoading: false });
      }
    }
  },

  isPlayerListReady(): boolean {
    const hasKeyword = this.data.playerKeyword.trim().length > 0;
    const hasTeamAndPosition =
      this.data.teamFilter !== ALL_VALUE &&
      this.data.positionFilter !== ALL_VALUE;
    return hasKeyword || hasTeamAndPosition;
  },

  pickerFilter(): PlayerPickerFilter | undefined {
    const filter: PlayerPickerFilter = {};
    if (this.data.teamFilter !== ALL_VALUE) {
      filter.teamId = Number(this.data.teamFilter);
    }
    if (this.data.positionFilter !== ALL_VALUE) {
      filter.position = this.data
        .positionFilter as PlayerPickerFilter["position"];
    }
    return Object.keys(filter).length ? filter : undefined;
  },

  invalidatePlayerRequest(): number {
    this.playerRequestRevision += 1;
    return this.playerRequestRevision;
  },

  clearPaginationOwnership() {
    this.paginationPending = false;
    this.paginationCursor = null;
    this.resumePaginationAfterShow = false;
    this.resumePaginationCursor = null;
  },

  startPlayerSearch(forceRefresh = false): Promise<void> {
    const revision = this.invalidatePlayerRequest();
    this.paginationPending = false;
    this.paginationCursor = null;
    this.resumePaginationAfterShow = false;
    this.resumePaginationCursor = null;
    const ready = this.isPlayerListReady();
    this.setData({
      players: [],
      filteredPlayers: [],
      filteredPlayerCount: 0,
      playersLoaded: false,
      playerListReady: ready,
      playerListVisible: ready && !this.data.selectedPlayer,
      nextCursor: null,
      hasMorePlayers: false,
      playersError: "",
    });
    if (!ready) return Promise.resolve();
    return this.loadPlayerPage(revision, null, false, forceRefresh);
  },

  async loadPlayerPage(
    revision: number,
    cursor: number | null,
    append: boolean,
    forceRefresh: boolean,
  ): Promise<void> {
    this.setData(
      append
        ? { loadingMore: true, playersError: "" }
        : { playerLoading: true, playersError: "" },
    );

    try {
      // Team keyword → squad listing. An explicit team picker choice wins.
      const keyword = this.data.playerKeyword.trim();
      const teamSearchId =
        keyword && this.data.teamFilter === ALL_VALUE
          ? resolveTeamSearchId(keyword, this.teamDirectory)
          : null;
      const filter: PlayerPickerFilter = this.pickerFilter() || {};
      if (teamSearchId !== null) filter.teamId = teamSearchId;
      const page = await getPlayersForPickerPage({
        search: teamSearchId !== null ? "" : this.data.playerKeyword,
        filter: Object.keys(filter).length ? filter : undefined,
        limit: PLAYER_PICKER_PAGE_LIMIT,
        cursor,
        forceRefresh,
      });
      if (!this.pageActive || revision !== this.playerRequestRevision) return;

      const players = append
        ? mergePlayers(this.data.players, page.items)
        : page.items;
      this.setData({
        players,
        filteredPlayers: players,
        filteredPlayerCount: page.totalCount,
        playersLoaded: true,
        playerListReady: true,
        playerListVisible: !this.data.selectedPlayer,
        nextCursor: page.nextCursor,
        hasMorePlayers: page.nextCursor !== null,
        playersError: "",
      });
    } catch (error) {
      if (!this.pageActive || revision !== this.playerRequestRevision) return;
      this.setData({
        playersError:
          error instanceof Error ? error.message : "球员列表加载失败",
        ...(append ? {} : { playersLoaded: false }),
      });
    } finally {
      if (this.pageActive && revision === this.playerRequestRevision) {
        this.setData({ playerLoading: false, loadingMore: false });
      }
    }
  },

  loadMorePlayers(cursorOverride?: number | null): Promise<void> {
    const cursor =
      cursorOverride === undefined ? this.data.nextCursor : cursorOverride;
    if (
      this.data.playerLoading ||
      this.data.loadingMore ||
      cursor === null ||
      (cursorOverride === undefined && !this.data.hasMorePlayers)
    ) {
      return Promise.resolve();
    }
    this.paginationPending = true;
    this.paginationCursor = cursor;
    const task = this.loadPlayerPage(
      this.playerRequestRevision,
      cursor,
      true,
      false,
    );
    return task.finally(() => {
      if (
        this.pageActive &&
        this.paginationPending &&
        this.paginationCursor === cursor
      ) {
        this.paginationPending = false;
        this.paginationCursor = null;
      }
    });
  },

  onPlayerKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ playerKeyword: event.detail.value });
    const revision = this.invalidatePlayerRequest();
    this.clearPaginationOwnership();
    if (this.playerSearchTimer !== undefined) {
      clearTimeout(this.playerSearchTimer);
    }
    this.playerSearchTimer = setTimeout(() => {
      this.playerSearchTimer = undefined;
      const ready = this.isPlayerListReady();
      this.setData({
        players: [],
        filteredPlayers: [],
        filteredPlayerCount: 0,
        playersLoaded: false,
        playerListReady: ready,
        playerListVisible: ready && !this.data.selectedPlayer,
        nextCursor: null,
        hasMorePlayers: false,
      });
      if (ready && revision === this.playerRequestRevision) {
        this.loadPlayerPage(revision, null, false, false);
      }
    }, 300) as unknown as number;
  },

  onClearPlayerKeyword() {
    if (this.playerSearchTimer !== undefined) {
      clearTimeout(this.playerSearchTimer);
      this.playerSearchTimer = undefined;
    }
    this.setData({ playerKeyword: "" });
    this.startPlayerSearch();
  },

  onRetryPlayers() {
    void this.runPlayerRefresh(this.perfTracker);
  },

  onClearPlayerFilters() {
    if (this.playerSearchTimer !== undefined) {
      clearTimeout(this.playerSearchTimer);
      this.playerSearchTimer = undefined;
    }
    this.invalidatePlayerRequest();
    this.clearPaginationOwnership();
    this.setData({
      playerKeyword: "",
      teamFilter: ALL_VALUE,
      positionFilter: ALL_VALUE,
      selectedTeamIndex: 0,
      selectedPositionIndex: 0,
      players: [],
      filteredPlayers: [],
      filteredPlayerCount: 0,
      playersLoaded: false,
      playerListReady: false,
      playerListVisible: false,
      nextCursor: null,
      hasMorePlayers: false,
      playersError: "",
    });
  },

  onRetryHistory() {
    if (this.data.selectedPlayer?.element) {
      this.loadSelectedPlayerHistory(this.data.selectedPlayer.element);
    }
  },

  onTeamFilterChange(event: WechatMiniprogram.PickerChange) {
    const selectedTeamIndex = pickerIndex(event.detail.value);
    if (selectedTeamIndex === null) return;
    const option =
      this.data.teamOptions[selectedTeamIndex] || this.data.teamOptions[0];
    this.setData({
      selectedTeamIndex,
      teamFilter: option.value,
    });
    this.startPlayerSearch();
  },

  onPositionFilterChange(event: WechatMiniprogram.PickerChange) {
    const selectedPositionIndex = pickerIndex(event.detail.value);
    if (selectedPositionIndex === null) return;
    const option =
      this.data.positionOptions[selectedPositionIndex] ||
      this.data.positionOptions[0];
    this.setData({
      selectedPositionIndex,
      positionFilter: option.value,
    });
    this.startPlayerSearch();
  },

  onSelectPlayer(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { index: string }
    >,
  ) {
    const player =
      this.data.filteredPlayers[Number(event.currentTarget.dataset.index)];
    if (!player?.element) return;

    this.setData({
      selectedPlayer: player,
      playerListVisible: false,
      historyRows: [],
      historyError: "",
    });
    this.loadSelectedPlayerHistory(player.element);
  },

  async loadSelectedPlayerHistory(
    playerId: number,
    forceRefresh = false,
  ): Promise<void> {
    const revision = ++this.historyRequestRevision;
    this.setData({ historyLoading: true, historyError: "" });
    try {
      const historyRows = await getPlayerValueByElement(playerId, forceRefresh);
      if (!this.pageActive || revision !== this.historyRequestRevision) return;
      this.setData({
        historyRows: historyRows
          .sort(sortByChangeDateDesc)
          .map((row, index) => ({
            ...row,
            rowKey: priceChangeRowKey(row, row.changeType || "history", index),
          })),
      });
    } catch (error) {
      if (!this.pageActive || revision !== this.historyRequestRevision) return;
      this.setData({
        historyError:
          error instanceof Error ? error.message : "球员身价历史加载失败",
      });
    } finally {
      if (this.pageActive && revision === this.historyRequestRevision) {
        this.setData({ historyLoading: false });
      }
    }
  },

  onClearSelectedPlayer() {
    this.setData({
      selectedPlayer: null,
      playerListVisible: this.data.playerListReady,
      historyRows: [],
      historyError: "",
    });
  },

  async refreshPlayerMode(): Promise<void> {
    if (this.data.teamOptions.length === 1) {
      await this.loadTeamOptions(true);
    }
    if (!this.pageActive) return;
    if (this.isPlayerListReady()) {
      await this.startPlayerSearch(true);
    }
    if (!this.pageActive) return;
    if (this.data.selectedPlayer?.element) {
      await this.loadSelectedPlayerHistory(this.data.selectedPlayer.element, true);
    }
  },

  async runPlayerRefresh(tracker?: PagePerformanceTracker): Promise<void> {
    this.playerRefreshPending = true;
    try {
      await this.refreshPlayerMode();
    } finally {
      if (this.pageActive && (!tracker || this.perfTracker === tracker)) {
        this.playerRefreshPending = false;
      }
    }
  },

  clearShareCopiedTimer() {
    if (this.shareCopiedTimer) {
      clearTimeout(this.shareCopiedTimer);
      this.shareCopiedTimer = undefined;
    }
  },

  onCopyShare() {
    try {
      if (
        this.data.riseChanges.length === 0 &&
        this.data.fallChanges.length === 0
      ) {
        wx.showToast({ title: "当日还没有可分享的调价", icon: "none" });
        return;
      }
      const text = formatPriceMovementShareText({
        changeDate: this.data.changeDate,
        rises: this.data.riseChanges,
        falls: this.data.fallChanges,
      });
      void copyShareText(text).then((ok) => {
        if (ok) {
          this.setData({ shareCopied: true, shareSheetOpen: false });
          this.clearShareCopiedTimer();
          this.shareCopiedTimer = setTimeout(
            () => this.setData({ shareCopied: false }),
            2000,
          );
          return;
        }
        this.setData({ shareSheetOpen: true, shareText: text });
      });
    } catch (error) {
      console.error("[copy-share] price", error);
      wx.showToast({ title: "复制失败", icon: "none" });
    }
  },

  onCloseShareSheet() {
    this.setData({ shareSheetOpen: false });
  },
});
