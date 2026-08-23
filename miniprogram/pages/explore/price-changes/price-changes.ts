import { PerformancePage } from "../../../utils/performance-page";
import {
  getPriceChangeBoard,
  getPriceChangePersonalContext,
  EMPTY_PRICE_CHANGE_BOARD,
} from "../../../services/price-change.service";
import {
  ensureAppContext,
} from "../../../services/app-context.service";
import {
  capturePageRequestTrace,
  type PageRequestTrace,
} from "../../../services/graphql.service";
import type {
  PriceChangeBoard,
  PriceChangePersonalContext,
  PriceChangePlayer,
} from "../../../models/price-change";
import {
  buildPriceChangeViewRow,
  DEFAULT_PRICE_CHANGE_SORT,
  filterPriceChangePlayers,
  formatPriceChangeShareText,
  PRICE_CHANGE_PAGE_SIZE,
  sortPriceChangePlayers,
  type PriceChangeMovementFilter,
  type PriceChangeScopeFilter,
  type PriceChangeSortColumn,
  type PriceChangeSortDirection,
} from "../../../utils/price-change";
import { formatDeadline, formatCountdown, getDeadlineDiffMs } from "../../../utils/date";
import { copyShareText } from "../../../utils/live-share";
import { goToPlayerDetail } from "../../../utils/navigation";
import { routes } from "../../../config/routes";
import {
  currentMyFplEntryId,
  waitForAuthoritativeFollow,
} from "../../../utils/follow";

const AUTO_REFRESH_MS = 5 * 60 * 1000;

interface FilterOption {
  label: string;
  value: string;
}

const MOVEMENT_OPTIONS: Array<{ label: string; value: PriceChangeMovementFilter }> = [
  { label: "全部", value: "all" },
  { label: "上涨", value: "rise" },
  { label: "下跌", value: "fall" },
  { label: "锁定", value: "locked" },
];

const BASE_SORT_OPTIONS: Array<{ label: string; value: PriceChangeSortColumn }> = [
  { label: "预测进度", value: "progress" },
  { label: "当前身价", value: "price" },
  { label: "信号强度", value: "signal" },
  { label: "净转会", value: "movement" },
];

const PERSONAL_SORT_OPTIONS: Array<{ label: string; value: PriceChangeSortColumn }> = [
  { label: "购买价", value: "purchasePrice" },
  { label: "卖出价", value: "sellingPrice" },
];

const EMPTY_PERSONAL_CONTEXT: PriceChangePersonalContext = {
  squadState: "unbound",
  squadElementIds: [],
  purchasePrices: {},
  personalPriceState: "UNAVAILABLE",
};

function pickerIndex(value: unknown): number | null {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function formatCountdownText(deadline: string | null): string {
  if (!deadline) return "暂无下一次截止时间";
  const diff = getDeadlineDiffMs(deadline);
  if (diff <= 0) return "本次截止时间已过";
  const parts = formatCountdown(diff);
  return Number(parts.days) > 0
    ? `${parts.days}天 ${parts.hours}:${parts.minutes}:${parts.seconds}`
    : `${parts.hours}:${parts.minutes}:${parts.seconds}`;
}

function formatStoredAt(value?: number): string {
  if (!value || !Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${minutes}`;
}

function boardStatusView(board: PriceChangeBoard): {
  label: string;
  className: string;
  noticeStatus: string;
  noticeMessage: string;
} {
  if (board.status === "READY") {
    return { label: "最新", className: "board-ready", noticeStatus: "", noticeMessage: "" };
  }
  if (board.status === "PARTIAL") {
    return {
      label: "部分数据",
      className: "board-partial",
      noticeStatus: "partial",
      noticeMessage: "当前预测板只覆盖部分球员，筛选结果可能不完整。",
    };
  }
  if (board.status === "STALE") {
    return {
      label: "上次有效",
      className: "board-stale",
      noticeStatus: "stale",
      noticeMessage: "预测源暂时不可用，当前显示 24 小时内最后有效结果。",
    };
  }
  return {
    label: "暂不可用",
    className: "board-unavailable",
    noticeStatus: "error",
    noticeMessage: "身价预测暂时不可用，请稍后重试。",
  };
}

function teamOptions(players: readonly PriceChangePlayer[]): FilterOption[] {
  const byId = new Map<number, FilterOption>();
  players.forEach((player) => {
    if (!byId.has(player.teamId)) {
      byId.set(player.teamId, {
        label: `${player.teamShortName} · ${player.teamName}`,
        value: String(player.teamId),
      });
    }
  });
  return [
    { label: "全部球队", value: "all" },
    ...Array.from(byId.values()).sort((left, right) => left.label.localeCompare(right.label)),
  ];
}

function mineStateMessage(context: PriceChangePersonalContext): string {
  if (context.squadState === "unbound") return "关联 LetLetMe 账号并绑定 FPL 后可查看我的阵容";
  if (context.squadState === "not-published") return "当前比赛周阵容尚未发布";
  if (context.squadState === "unavailable") return "我的阵容暂时无法加载";
  if (context.personalPriceState === "PARTIAL") return "部分购买价暂不可用，已显示可确认的价格";
  if (context.personalPriceState === "UNAVAILABLE") return "购买价与卖出价暂不可用";
  return "";
}

PerformancePage({
  data: {
    loading: true,
    refreshing: false,
    error: "",
    hasBoard: false,
    boardStatusLabel: "加载中",
    boardStatusClass: "board-loading",
    noticeStatus: "",
    noticeMessage: "",
    storedAtText: "",
    deadlineText: "—",
    countdownText: "",
    observedPlayerCount: 0,
    expectedPlayerCount: 0,
    search: "",
    scope: "all" as PriceChangeScopeFilter,
    movement: "all" as PriceChangeMovementFilter,
    movementOptions: MOVEMENT_OPTIONS,
    teamOptions: [{ label: "全部球队", value: "all" }] as FilterOption[],
    teamOptionNames: ["全部球队"],
    selectedTeamIndex: 0,
    teamId: "all",
    sortOptions: BASE_SORT_OPTIONS,
    sortOptionNames: BASE_SORT_OPTIONS.map((option) => option.label),
    selectedSortIndex: 0,
    sortColumn: DEFAULT_PRICE_CHANGE_SORT.column as PriceChangeSortColumn,
    sortDirection: DEFAULT_PRICE_CHANGE_SORT.direction as PriceChangeSortDirection,
    sortDirectionText: "降序",
    rows: [] as ReturnType<typeof buildPriceChangeViewRow>[],
    resultCount: 0,
    from: 0,
    to: 0,
    page: 1,
    pageCount: 1,
    hasPreviousPage: false,
    hasNextPage: false,
    mineMessage: "",
    hasFilters: false,
    shareSheetOpen: false,
    shareText: "",
  },

  board: null as unknown as PriceChangeBoard,
  personalContext: null as unknown as PriceChangePersonalContext,
  filteredPlayers: null as unknown as PriceChangePlayer[],
  defaultScope: "all" as PriceChangeScopeFilter,
  requestId: 0,
  lifecycleRevision: 0,
  pageVisible: false,
  hasShown: false,
  loadPending: false,
  refreshPending: false,
  resumeForceRefresh: false,
  lastSuccessfulLoadAt: 0,
  refreshTimer: 0 as unknown as ReturnType<typeof setInterval>,
  countdownTimer: 0 as unknown as ReturnType<typeof setInterval>,

  async onLoad() {
    // Free Page fields are shared by the DevTools definition clone. Initialise
    // collection state per page instance before any lifecycle work reads it.
    this.board = EMPTY_PRICE_CHANGE_BOARD;
    this.personalContext = EMPTY_PERSONAL_CONTEXT;
    this.filteredPlayers = [];
    this.pageVisible = true;
    this.loadPending = false;
    this.lastSuccessfulLoadAt = 0;
    await this.loadData("load");
  },

  async onShow() {
    this.pageVisible = true;
    this.startTimers();
    const resumed = this.hasShown;
    this.hasShown = true;
    const refreshExpired = this.lastSuccessfulLoadAt > 0
      && Date.now() - this.lastSuccessfulLoadAt >= AUTO_REFRESH_MS;
    if (resumed && (this.resumeForceRefresh || refreshExpired)) {
      await this.loadData("show", true);
      if (this.pageVisible && !this.refreshPending) this.resumeForceRefresh = false;
    }
  },

  onHide() {
    this.pageVisible = false;
    this.stopTimers();
    // onHide invalidates every in-flight request below. Preserve both an
    // explicit refresh and the first board load so onShow cannot strand the
    // page in its loading shell after the ignored request settles.
    this.resumeForceRefresh = this.resumeForceRefresh
      || this.refreshPending
      || this.loadPending;
    this.loadPending = false;
    this.refreshPending = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.stopTimers();
    this.loadPending = false;
    this.refreshPending = false;
    this.resumeForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onPullDownRefresh() {
    return this.loadData("refresh", true).finally(() => wx.stopPullDownRefresh());
  },

  async loadData(trigger: PageRequestTrace["trigger"] = "load", forceRefresh = false) {
    const ownerRevision = this.lifecycleRevision;
    const requestId = ++this.requestId;
    const isActive = () => this.pageVisible
      && ownerRevision === this.lifecycleRevision
      && requestId === this.requestId;
    const hadBoard = this.board.players.length > 0;
    this.loadPending = true;
    this.refreshPending = forceRefresh;
    this.setData({
      loading: !hadBoard,
      refreshing: forceRefresh && hadBoard,
      error: "",
      ...(forceRefresh ? { noticeMessage: "" } : {}),
    });
    const trace = capturePageRequestTrace({
      callerSurface: "explore-price-changes",
      trigger,
      forceReason: forceRefresh ? "user-refresh" : undefined,
    });

    try {
      // The public board can load in parallel, but the personal context must
      // not snapshot the local follow before encrypted account restoration.
      const authorityPromise = waitForAuthoritativeFollow();
      const contextPromise = authorityPromise.then(() => ensureAppContext({
        reason: forceRefresh ? "pull-refresh" : "page-load",
      })).then((value) => ({ value, error: null as unknown }))
        .catch((error: unknown) => ({ value: null, error }));
      const boardPromise = getPriceChangeBoard(forceRefresh, trace);
      const [contextResult, boardRead] = await Promise.all([contextPromise, boardPromise]);
      if (!isActive()) return;

      const board = boardRead.board;
      let personal = EMPTY_PERSONAL_CONTEXT;
      const context = contextResult.value;
      if (context?.season && context.displayEvent) {
        personal = await getPriceChangePersonalContext({
          eventId: context.displayEvent,
          season: context.season,
          entryId: currentMyFplEntryId() ?? null,
          players: board.players,
          forceRefresh,
          trace,
        });
      }
      if (!isActive()) return;

      this.board = board;
      this.personalContext = personal;
      this.lastSuccessfulLoadAt = Date.now();
      if (!this.data.hasBoard) {
        this.defaultScope = personal.squadElementIds.length > 0 ? "mine" : "all";
      }
      const scope = this.data.hasBoard ? this.data.scope : this.defaultScope;
      const options = teamOptions(board.players);
      const selectedTeamIndex = Math.max(
        0,
        options.findIndex((option) => option.value === this.data.teamId),
      );
      const selectedTeam = options[selectedTeamIndex] || options[0];
      const status = boardStatusView(board);
      this.setData({
        loading: false,
        refreshing: false,
        hasBoard: board.players.length > 0,
        boardStatusLabel: status.label,
        boardStatusClass: status.className,
        noticeStatus: status.noticeStatus,
        noticeMessage: status.noticeMessage,
        storedAtText: status.noticeStatus === "stale" ? formatStoredAt(boardRead.storedAt) : "",
        deadlineText: board.deadline ? formatDeadline(board.deadline) : "—",
        countdownText: formatCountdownText(board.deadline),
        observedPlayerCount: board.observedPlayerCount,
        expectedPlayerCount: board.expectedPlayerCount,
        scope,
        teamOptions: options,
        teamOptionNames: options.map((option) => option.label),
        selectedTeamIndex,
        teamId: selectedTeam.value,
      });
      this.syncSortOptions();
      this.applyView(true);
      this.startTimers();
    } catch (error) {
      if (!isActive()) return;
      if (hadBoard) {
        this.setData({
          loading: false,
          refreshing: false,
          noticeStatus: "stale",
          noticeMessage: "刷新失败，当前继续显示上次成功结果。",
        });
      } else {
        this.setData({
          loading: false,
          refreshing: false,
          error: error instanceof Error ? error.message : "身价预测加载失败",
        });
      }
    } finally {
      if (isActive()) {
        this.loadPending = false;
        this.refreshPending = false;
        this.setData({ loading: false, refreshing: false });
      }
    }
  },

  applyView(resetPage = false) {
    const personal = this.personalContext as PriceChangePersonalContext;
    const squad = new Set<number>(personal.squadElementIds);
    const filtered = filterPriceChangePlayers(this.board.players, {
      search: this.data.search,
      movement: this.data.movement,
      scope: this.data.scope,
      teamId: this.data.teamId,
      squadElementIds: squad,
    });
    const sorted = sortPriceChangePlayers(filtered, {
      sort: { column: this.data.sortColumn, direction: this.data.sortDirection },
      squadElementIds: squad,
      purchasePrices: personal.purchasePrices,
    });
    this.filteredPlayers = sorted;
    const pageCount = Math.max(1, Math.ceil(sorted.length / PRICE_CHANGE_PAGE_SIZE));
    const page = resetPage ? 1 : Math.min(Math.max(1, this.data.page), pageCount);
    const start = (page - 1) * PRICE_CHANGE_PAGE_SIZE;
    const visible = sorted.slice(start, start + PRICE_CHANGE_PAGE_SIZE);
    const showPersonalPrices = this.data.scope === "mine";
    const shareText = formatPriceChangeShareText({
      players: visible,
      scopeLabel: showPersonalPrices ? "我的阵容" : "全部球员",
      deadlineLabel: this.board.deadline ? formatDeadline(this.board.deadline) : "",
    });
    this.setData({
      rows: visible.map((player) => buildPriceChangeViewRow(player, {
        showPersonalPrices,
        purchasePrices: personal.purchasePrices,
      })),
      resultCount: sorted.length,
      from: sorted.length > 0 ? start + 1 : 0,
      to: Math.min(start + PRICE_CHANGE_PAGE_SIZE, sorted.length),
      page,
      pageCount,
      hasPreviousPage: page > 1,
      hasNextPage: page < pageCount,
      mineMessage: showPersonalPrices ? mineStateMessage(personal) : "",
      hasFilters: this.data.search.length > 0
        || this.data.movement !== "all"
        || this.data.scope !== this.defaultScope
        || this.data.teamId !== "all"
        || this.data.sortColumn !== DEFAULT_PRICE_CHANGE_SORT.column
        || this.data.sortDirection !== DEFAULT_PRICE_CHANGE_SORT.direction,
      shareText,
    });
  },

  syncSortOptions() {
    const options = this.data.scope === "mine"
      ? BASE_SORT_OPTIONS.concat(PERSONAL_SORT_OPTIONS)
      : BASE_SORT_OPTIONS;
    let sortColumn = this.data.sortColumn;
    if (
      this.data.scope !== "mine"
      && (sortColumn === "purchasePrice" || sortColumn === "sellingPrice")
    ) sortColumn = DEFAULT_PRICE_CHANGE_SORT.column;
    const selectedSortIndex = Math.max(
      0,
      options.findIndex((option) => option.value === sortColumn),
    );
    this.setData({
      sortOptions: options,
      sortOptionNames: options.map((option) => option.label),
      selectedSortIndex,
      sortColumn,
    });
  },

  onSearchDraft(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.setData({ search: String(event.detail.keyword || "") });
    this.applyView(true);
  },

  onSearchSubmit(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.onSearchDraft(event);
  },

  onResetSearch() {
    this.setData({ search: "" });
    this.applyView(true);
  },

  onScopeTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { scope: string }>) {
    const scope: PriceChangeScopeFilter = event.currentTarget.dataset.scope === "mine" ? "mine" : "all";
    if (scope === this.data.scope) return;
    this.setData({ scope });
    this.syncSortOptions();
    this.applyView(true);
  },

  onMovementTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { movement: string }>) {
    const value = String(event.currentTarget.dataset.movement || "all") as PriceChangeMovementFilter;
    if (!MOVEMENT_OPTIONS.some((option) => option.value === value) || value === this.data.movement) return;
    this.setData({ movement: value });
    this.applyView(true);
  },

  onTeamChange(event: WechatMiniprogram.PickerChange) {
    const selectedTeamIndex = pickerIndex(event.detail.value);
    if (selectedTeamIndex === null) return;
    const option = this.data.teamOptions[selectedTeamIndex] || this.data.teamOptions[0];
    this.setData({ selectedTeamIndex, teamId: option.value });
    this.applyView(true);
  },

  onSortChange(event: WechatMiniprogram.PickerChange) {
    const selectedSortIndex = pickerIndex(event.detail.value);
    if (selectedSortIndex === null) return;
    const option = this.data.sortOptions[selectedSortIndex] || this.data.sortOptions[0];
    this.setData({ selectedSortIndex, sortColumn: option.value });
    this.applyView(true);
  },

  onToggleSortDirection() {
    const sortDirection: PriceChangeSortDirection = this.data.sortDirection === "desc" ? "asc" : "desc";
    this.setData({
      sortDirection,
      sortDirectionText: sortDirection === "desc" ? "降序" : "升序",
    });
    this.applyView(true);
  },

  onResetFilters() {
    this.setData({
      search: "",
      scope: this.defaultScope,
      movement: "all",
      selectedTeamIndex: 0,
      teamId: "all",
      sortColumn: DEFAULT_PRICE_CHANGE_SORT.column,
      sortDirection: DEFAULT_PRICE_CHANGE_SORT.direction,
      sortDirectionText: "降序",
    });
    this.syncSortOptions();
    this.applyView(true);
  },

  onPreviousPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 });
    this.applyView();
    this.scrollToList();
  },

  onNextPage() {
    if (this.data.page >= this.data.pageCount) return;
    this.setData({ page: this.data.page + 1 });
    this.applyView();
    this.scrollToList();
  },

  scrollToList() {
    try { wx.pageScrollTo({ selector: "#price-change-list", duration: 180 }); } catch {}
  },

  onOpenPlayer(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { code: number }>) {
    const code = Number(event.currentTarget.dataset.code);
    if (Number.isSafeInteger(code) && code > 0) goToPlayerDetail(code);
  },

  onExplain() {
    wx.showModal({
      title: "怎么看身价预测",
      content: "进度接近 +100% 或 -100% 表示当前信号更强；上涨、下跌和锁定是模型状态。截止时间使用你设备的本地时间。预测只反映当前 FPL 官方数据与转会节奏，不保证实际涨跌。",
      showCancel: false,
      confirmText: "知道了",
    });
  },

  async onCopyShare() {
    const copied = await copyShareText(this.data.shareText);
    if (!copied && this.pageVisible) this.setData({ shareSheetOpen: true });
  },

  onCloseShareSheet() {
    this.setData({ shareSheetOpen: false });
  },

  onRetry() {
    void this.loadData("refresh", true);
  },

  onShareAppMessage() {
    return {
      title: `身价预测 · ${this.data.scope === "mine" ? "我的阵容" : "全部球员"}`,
      path: routes.explorePriceChanges,
    };
  },

  onShareTimeline() {
    return { title: "LetLetMe 身价预测" };
  },

  startTimers() {
    this.stopTimers();
    this.updateCountdown();
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000);
    this.refreshTimer = setInterval(() => {
      if (this.pageVisible && !this.refreshPending && !this.data.loading && !this.data.refreshing) {
        void this.loadData("refresh", true);
      }
    }, AUTO_REFRESH_MS);
  },

  stopTimers() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.countdownTimer = 0 as unknown as ReturnType<typeof setInterval>;
    this.refreshTimer = 0 as unknown as ReturnType<typeof setInterval>;
  },

  updateCountdown() {
    if (!this.pageVisible) return;
    const countdownText = formatCountdownText(this.board.deadline);
    if (countdownText !== this.data.countdownText) this.setData({ countdownText });
  },
});
