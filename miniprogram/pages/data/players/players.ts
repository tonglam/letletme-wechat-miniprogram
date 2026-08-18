import { PerformancePage } from "../../../utils/performance-page";
import {
  getPlayersForPickerPage,
  getPlayerStatsDesk,
  type PlayerPickerFilter,
  type PlayerPickerOwnershipBand,
  type PlayerPickerPageResult,
  type PlayerPickerSort,
  type PlayerStatsDeskEntry,
  type PlayerStatsDeskOverview
} from "../../../services/player.service";
import { getTeamList } from "../../../services/common.service";
import type { PlayerOption } from "../../../models/player";
import { goToPlayerDetail } from "../../../utils/navigation";
import { ensureAppContext } from "../../../services/app-context.service";
import { formatCompactNumber } from "../../../utils/summary-format";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";
import {
  ALL_VALUE,
  MAX_PRICE_OPTIONS,
  OWN_BAND_OPTIONS,
  POSITION_OPTIONS,
  SORT_FIELD_OPTIONS,
  defaultSortDir,
  resolvePlayerPickerSort,
  sortPlayerOptions,
  toggleSortDir,
  type PlayerFilterOption,
  type PlayerSortDir,
  type PlayerSortField
} from "./directory-filter";

export {
  defaultSortDir,
  resolvePlayerPickerSort,
  toggleSortDir
};

type FilterOption = PlayerFilterOption;

/** Directory row meta — web player-stats rows show 状态 / 持有率 next to the team. */
function withStatText(player: PlayerOption): PlayerOption {
  const parts: string[] = [];
  if (typeof player.form === "number") parts.push(`状态 ${player.form.toFixed(1)}`);
  if (typeof player.selectedByPercent === "number") parts.push(`持有 ${player.selectedByPercent.toFixed(1)}%`);
  return parts.length ? { ...player, statText: parts.join(" · ") } : player;
}

export function resolveKeywordAfterPlayerLoad(
  pendingKeyword: string,
  currentKeyword: string,
  searchEditedWhileLoading: boolean
): string {
  return searchEditedWhileLoading ? currentKeyword : pendingKeyword || currentKeyword;
}

export function mergePlayerPages(
  existing: PlayerOption[],
  incoming: PlayerOption[]
): PlayerOption[] {
  const seen = new Set(existing.map((player) => player.element));
  return existing.concat(incoming.filter((player) => {
    if (seen.has(player.element)) return false;
    seen.add(player.element);
    return true;
  }));
}

export function shouldApplyPlayerResponse(
  responseRevision: number,
  currentRevision: number
): boolean {
  return responseRevision === currentRevision;
}

/* ---------- 双球员对比 (web player-stats PlayerSelectionPanel, v1) ---------- */

export interface CompareSlot {
  id: number;
  name: string;
  team: string;
  position: string;
}

export interface CompareCardView {
  name: string;
  meta: string;
  priceText: string;
  ownText: string;
}

export interface CompareRowView {
  key: string;
  label: string;
  valueA: string;
  valueB: string;
  winA: boolean;
  winB: boolean;
}

export interface CompareGroupView {
  key: string;
  title: string;
  rows: CompareRowView[];
}

export interface CompareView {
  samePosition: boolean;
  cardA: CompareCardView;
  cardB: CompareCardView;
  groups: CompareGroupView[];
}

const ELEMENT_TYPE_SHORT: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

function pickerIndex(value: unknown): number | null {
  const index = Number(value);
  return Number.isFinite(index) ? index : null;
}

function compareNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatCompareInt(value: number | null): string {
  return value === null ? "-" : String(value);
}

function formatCompareFixed(value: number | null, digits: number): string {
  return value === null ? "-" : value.toFixed(digits);
}

function formatCompareCompact(value: number | null): string {
  return value === null ? "-" : formatCompactNumber(value);
}

function formatCompareSignedCompact(value: number | null): string {
  if (value === null) return "-";
  return value > 0 ? `+${formatCompactNumber(value)}` : formatCompactNumber(value);
}

/** Winner highlight follows the web: only for same-position comparisons. */
function compareRow(
  key: string,
  label: string,
  a: number | null,
  b: number | null,
  format: (value: number | null) => string,
  emphasize: boolean
): CompareRowView {
  const decided = emphasize && a !== null && b !== null && a !== b;
  return {
    key,
    label,
    valueA: format(a),
    valueB: format(b),
    winA: decided && (a as number) > (b as number),
    winB: decided && (b as number) > (a as number)
  };
}

function compareCard(overview: PlayerStatsDeskOverview): CompareCardView {
  const own = compareNumber(overview.selectedByPercent);
  return {
    name: overview.webName,
    meta: `${overview.teamShortName} · ${ELEMENT_TYPE_SHORT[overview.elementType] || overview.elementTypeName}`,
    priceText: `£${overview.price.toFixed(1)}m`,
    ownText: own === null ? "-" : `${own.toFixed(1)}%`
  };
}

/** Two-player compare view-model — null when either overview is missing. */
export function buildCompareView(
  entryA: PlayerStatsDeskEntry,
  entryB: PlayerStatsDeskEntry
): CompareView | null {
  const a = entryA.overview;
  const b = entryB.overview;
  if (!a || !b) return null;
  const samePosition = a.elementType === b.elementType;
  const ppm = (overview: PlayerStatsDeskOverview): number | null => {
    const totalPoints = compareNumber(overview.totalPoints);
    return totalPoints === null || !overview.price ? null : totalPoints / overview.price;
  };
  const fixed1 = (value: number | null): string => formatCompareFixed(value, 1);
  const fixed2 = (value: number | null): string => formatCompareFixed(value, 2);
  const net = (overview: PlayerStatsDeskOverview): number | null => {
    const transfersIn = compareNumber(overview.transfersInEvent);
    const transfersOut = compareNumber(overview.transfersOutEvent);
    return transfersIn === null || transfersOut === null ? null : transfersIn - transfersOut;
  };

  return {
    samePosition,
    cardA: compareCard(a),
    cardB: compareCard(b),
    groups: [
      {
        key: "overview",
        title: "赛季总览",
        rows: [
          compareRow("totalPoints", "总分", compareNumber(a.totalPoints), compareNumber(b.totalPoints), formatCompareInt, samePosition),
          compareRow("form", "状态", compareNumber(a.form), compareNumber(b.form), fixed1, samePosition),
          compareRow("ppm", "性价比", ppm(a), ppm(b), fixed1, samePosition)
        ]
      },
      {
        key: "production",
        title: "赛季产出",
        rows: [
          compareRow("minutes", "出场时间", compareNumber(a.minutes), compareNumber(b.minutes), formatCompareInt, samePosition),
          compareRow("starts", "首发", compareNumber(a.starts), compareNumber(b.starts), formatCompareInt, samePosition),
          compareRow("goalsScored", "进球", compareNumber(a.goalsScored), compareNumber(b.goalsScored), formatCompareInt, samePosition),
          compareRow("assists", "助攻", compareNumber(a.assists), compareNumber(b.assists), formatCompareInt, samePosition),
          compareRow("cleanSheets", "零封", compareNumber(a.cleanSheets), compareNumber(b.cleanSheets), formatCompareInt, samePosition),
          compareRow("bonus", "加分", compareNumber(a.bonus), compareNumber(b.bonus), formatCompareInt, samePosition),
          compareRow("bps", "BPS", compareNumber(a.bps), compareNumber(b.bps), formatCompareInt, samePosition)
        ]
      },
      {
        key: "process",
        title: "过程数据",
        rows: samePosition
          ? [
              compareRow("xG", "xG", compareNumber(a.expectedGoals), compareNumber(b.expectedGoals), fixed2, true),
              compareRow("xA", "xA", compareNumber(a.expectedAssists), compareNumber(b.expectedAssists), fixed2, true),
              compareRow("xGI", "xGI", compareNumber(a.expectedGoalInvolvements), compareNumber(b.expectedGoalInvolvements), fixed2, true),
              compareRow("ict", "ICT 指数", compareNumber(entryA.ictIndex), compareNumber(entryB.ictIndex), fixed1, true)
            ]
          // Web rule: cross-position process compares ICT only, with no winner.
          : [compareRow("ict", "ICT 指数", compareNumber(entryA.ictIndex), compareNumber(entryB.ictIndex), fixed1, false)]
      },
      {
        key: "market",
        title: "市场",
        // Web rule: transfer rows never crown a winner.
        rows: [
          compareRow("transfersIn", "本轮转入", compareNumber(a.transfersInEvent), compareNumber(b.transfersInEvent), formatCompareCompact, false),
          compareRow("transfersOut", "本轮转出", compareNumber(a.transfersOutEvent), compareNumber(b.transfersOutEvent), formatCompareCompact, false),
          compareRow("net", "净转入", net(a), net(b), formatCompareSignedCompact, false)
        ]
      }
    ]
  };
}

PerformancePage({
  data: {
    loading: false,
    loadingMore: false,
    error: "",
    loadMoreError: "",
    keyword: "",
    players: [] as PlayerOption[],
    nextCursor: null as number | null,
    totalCount: 0,
    hasMore: false,
    teamOptions: [{ label: "全部球队", value: ALL_VALUE }] as FilterOption[],
    teamOptionNames: ["全部球队"],
    selectedTeamIndex: 0,
    teamFilter: ALL_VALUE,
    positionOptions: POSITION_OPTIONS,
    positionOptionNames: POSITION_OPTIONS.map((option) => option.label),
    selectedPositionIndex: 0,
    positionFilter: ALL_VALUE,
    sortOptions: SORT_FIELD_OPTIONS,
    sortOptionNames: SORT_FIELD_OPTIONS.map((option) => option.label),
    selectedSortIndex: 0,
    sortField: "TOTAL_POINTS" as PlayerSortField,
    sortDir: "DESC" as PlayerSortDir,
    sortBy: "TOTAL_POINTS_DESC" as PlayerPickerSort,
    activeKeyword: "",
    filtersLocked: false,
    maxPriceOptions: MAX_PRICE_OPTIONS,
    maxPriceOptionNames: MAX_PRICE_OPTIONS.map((option) => option.label),
    selectedMaxPriceIndex: 0,
    maxPrice: null as number | null,
    ownBandOptions: OWN_BAND_OPTIONS,
    ownBandOptionNames: OWN_BAND_OPTIONS.map((option) => option.label),
    selectedOwnBandIndex: 0,
    ownBand: ALL_VALUE,
    teamsLoaded: false,
    comparePlayers: [null, null] as Array<CompareSlot | null>,
    compareArmedSlot: 0 as 0 | 1 | 2,
    compareOpen: false,
    compareLoading: false,
    compareError: "",
    compareView: null as CompareView | null
  },

  compareRevision: 0,

  requestRevision: 0,
  pageVisible: false,
  hasShown: false,
  paginationPending: false,
  paginationCursor: null as number | null,
  resumePaginationAfterShow: false,
  resumePaginationCursor: null as number | null,
  searchPending: false,
  searchPendingForceRefresh: false,
  resumeSearchAfterShow: false,
  resumeSearchForceRefresh: false,
  searchEditedWhileLoading: false,

  async onLoad(options: Record<string, string | undefined>) {
    this.pageVisible = true;
    const keyword = String(options?.keyword || "").trim();
    this.setData({ keyword });
    void this.loadTeamOptions();
    await this.startSearch(keyword);
  },

  /** Team directory for the browse filter — failure keeps 全部球队 only. */
  async loadTeamOptions(): Promise<void> {
    if (this.data.teamsLoaded) return;
    try {
      const teams = await getTeamList((await ensureAppContext({ reason: "page-load" })).season);
      if (!this.pageVisible) return;
      const teamOptions: FilterOption[] = [
        { label: "全部球队", value: ALL_VALUE },
        ...teams
          .map((team) => ({ label: team.shortName ? `${team.name} (${team.shortName})` : team.name, value: String(team.id) }))
          .sort((left, right) => left.label.localeCompare(right.label))
      ];
      this.setData({
        teamOptions,
        teamOptionNames: teamOptions.map((option) => option.label),
        teamsLoaded: true
      });
    } catch { /* the player list itself is unaffected */ }
  },

  onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    const resumePagination = resumed && this.resumePaginationAfterShow;
    const resumeCursor = this.resumePaginationCursor;
    const resumeSearch = resumed && this.resumeSearchAfterShow;
    const resumeSearchForceRefresh = this.resumeSearchForceRefresh;
    if (this.data.loadingMore) {
      this.setData({ loadingMore: false });
    }
    if (resumePagination && resumeCursor !== null) {
      const task = this.loadMoreFromCursor(resumeCursor);
      if (this.paginationPending && this.paginationCursor === resumeCursor) {
        this.resumePaginationAfterShow = false;
        this.resumePaginationCursor = null;
      }
      return task.finally(() => {
        if (this.pageVisible && !this.paginationPending && this.resumePaginationCursor === resumeCursor) {
          this.resumePaginationAfterShow = false;
          this.resumePaginationCursor = null;
        }
      });
    }
    if (resumeSearch) {
      const task = this.startSearch(this.data.keyword, resumeSearchForceRefresh);
      if (this.searchPending && this.searchPendingForceRefresh === resumeSearchForceRefresh) {
        this.resumeSearchAfterShow = false;
        this.resumeSearchForceRefresh = false;
      }
      return task.finally(() => {
        if (this.pageVisible && !this.searchPending && this.resumeSearchAfterShow) {
          this.resumeSearchAfterShow = false;
          this.resumeSearchForceRefresh = false;
        }
      });
    }
    if (resumed && this.data.loading) {
      return this.startSearch(this.data.keyword);
    }
    return undefined;
  },

  onHide() {
    this.resumeSearchAfterShow = this.searchPending;
    this.resumeSearchForceRefresh = this.searchPendingForceRefresh;
    this.resumePaginationAfterShow = this.paginationPending;
    this.resumePaginationCursor = this.paginationCursor;
    this.paginationPending = false;
    this.paginationCursor = null;
    this.pageVisible = false;
    this.requestRevision += 1;
    this.searchEditedWhileLoading = false;
  },

  onUnload() {
    this.pageVisible = false;
    this.paginationPending = false;
    this.paginationCursor = null;
    this.resumePaginationAfterShow = false;
    this.resumePaginationCursor = null;
    this.searchPending = false;
    this.searchPendingForceRefresh = false;
    this.resumeSearchAfterShow = false;
    this.resumeSearchForceRefresh = false;
    this.searchEditedWhileLoading = false;
    this.requestRevision += 1;
  },

  onPullDownRefresh() {
    return this.startSearch(this.data.keyword, true)
      .finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  async startSearch(keyword: string, forceRefresh = false): Promise<void> {
    this.searchPending = true;
    this.searchPendingForceRefresh = forceRefresh;
    this.searchEditedWhileLoading = false;
    this.paginationPending = false;
    this.paginationCursor = null;
    this.resumePaginationAfterShow = false;
    this.resumePaginationCursor = null;
    this.requestRevision += 1;
    const revision = this.requestRevision;
    const trace = capturePageRequestTrace({
      callerSurface: "players-directory",
      trigger: forceRefresh ? "refresh" : keyword ? "search" : "load",
      forceReason: forceRefresh ? "user-refresh" : undefined
    });
    const activeKeyword = keyword.trim();
    this.setData({
      keyword,
      activeKeyword,
      filtersLocked: Boolean(activeKeyword),
      loading: true,
      loadingMore: false,
      error: "",
      loadMoreError: "",
      players: [],
      nextCursor: null,
      totalCount: 0,
      hasMore: false
    });
    try {
      await ensureAppContext({
        reason: forceRefresh ? "pull-refresh" : "page-load",
        forceRefresh
      });
      if (!this.pageVisible || !shouldApplyPlayerResponse(revision, this.requestRevision)) return;
      await this.fetchPage(revision, null, false, forceRefresh, trace);
      if (this.pageVisible && shouldApplyPlayerResponse(revision, this.requestRevision)) {
        this.searchPending = false;
        this.searchPendingForceRefresh = false;
      }
    } catch (error) {
      if (!this.pageVisible || !shouldApplyPlayerResponse(revision, this.requestRevision)) return;
      this.searchPending = false;
      this.searchPendingForceRefresh = false;
      this.setData({
        loading: false,
        loadingMore: false,
        error: error instanceof Error ? error.message : "赛季信息暂时不可用，请稍后重试"
      });
    }
  },

  /** Web: a name search suspends the browse filters (they stay set but inert). */
  browseFilter(): PlayerPickerFilter | undefined {
    if (this.data.activeKeyword.trim()) return undefined;
    const filter: PlayerPickerFilter = {};
    if (this.data.teamFilter !== ALL_VALUE) {
      filter.teamId = Number(this.data.teamFilter);
    }
    if (this.data.positionFilter !== ALL_VALUE) {
      filter.position = this.data.positionFilter as PlayerPickerFilter["position"];
    }
    if (this.data.maxPrice !== null) {
      filter.maxPrice = this.data.maxPrice;
    }
    return Object.keys(filter).length ? filter : undefined;
  },

  browseOwnershipBand(): PlayerPickerOwnershipBand | undefined {
    if (this.data.activeKeyword.trim() || this.data.ownBand === ALL_VALUE) return undefined;
    return this.data.ownBand as PlayerPickerOwnershipBand;
  },

  onFilterPickerTap() {
    if (this.data.filtersLocked) {
      wx.showToast({ title: "姓名搜索中，筛选暂不生效", icon: "none" });
    }
  },

  onTeamFilterChange(event: WechatMiniprogram.PickerChange) {
    if (this.data.filtersLocked) return;
    const selectedTeamIndex = pickerIndex(event.detail.value);
    if (selectedTeamIndex === null) return;
    const option = this.data.teamOptions[selectedTeamIndex] || this.data.teamOptions[0];
    this.setData({ selectedTeamIndex, teamFilter: option.value });
    this.startSearch("");
  },

  onPositionFilterChange(event: WechatMiniprogram.PickerChange) {
    if (this.data.filtersLocked) return;
    const selectedPositionIndex = pickerIndex(event.detail.value);
    if (selectedPositionIndex === null) return;
    const option = this.data.positionOptions[selectedPositionIndex] || this.data.positionOptions[0];
    this.setData({ selectedPositionIndex, positionFilter: option.value });
    this.startSearch("");
  },

  onSortChange(event: WechatMiniprogram.PickerChange) {
    const selectedSortIndex = pickerIndex(event.detail.value);
    if (selectedSortIndex === null) return;
    const option = this.data.sortOptions[selectedSortIndex] || this.data.sortOptions[0];
    const sortField = option.value as PlayerSortField;
    const sortDir = defaultSortDir(sortField);
    this.setData({
      selectedSortIndex,
      sortField,
      sortDir,
      sortBy: resolvePlayerPickerSort(sortField, sortDir)
    });
    this.startSearch(this.data.activeKeyword);
  },

  onToggleSortDir() {
    const sortDir = toggleSortDir(this.data.sortDir);
    this.setData({
      sortDir,
      sortBy: resolvePlayerPickerSort(this.data.sortField, sortDir)
    });
    this.startSearch(this.data.activeKeyword);
  },

  onMaxPriceChange(event: WechatMiniprogram.PickerChange) {
    if (this.data.filtersLocked) return;
    const selectedMaxPriceIndex = pickerIndex(event.detail.value);
    if (selectedMaxPriceIndex === null) return;
    const option = this.data.maxPriceOptions[selectedMaxPriceIndex] || this.data.maxPriceOptions[0];
    this.setData({
      selectedMaxPriceIndex,
      maxPrice: option.value === ALL_VALUE ? null : Number(option.value)
    });
    this.startSearch("");
  },

  onOwnBandChange(event: WechatMiniprogram.PickerChange) {
    if (this.data.filtersLocked) return;
    const selectedOwnBandIndex = pickerIndex(event.detail.value);
    if (selectedOwnBandIndex === null) return;
    const option = this.data.ownBandOptions[selectedOwnBandIndex] || this.data.ownBandOptions[0];
    this.setData({ selectedOwnBandIndex, ownBand: option.value });
    this.startSearch("");
  },

  onResetFilters() {
    this.setData({
      keyword: "",
      activeKeyword: "",
      filtersLocked: false,
      selectedTeamIndex: 0,
      teamFilter: ALL_VALUE,
      selectedPositionIndex: 0,
      positionFilter: ALL_VALUE,
      selectedSortIndex: 0,
      sortField: "TOTAL_POINTS",
      sortDir: "DESC",
      sortBy: "TOTAL_POINTS_DESC",
      selectedMaxPriceIndex: 0,
      maxPrice: null,
      selectedOwnBandIndex: 0,
      ownBand: ALL_VALUE
    });
    this.startSearch("");
  },

  async fetchPage(
    revision: number,
    cursor: number | null,
    append: boolean,
    forceRefresh: boolean,
    originatingTrace?: PageRequestTrace
  ): Promise<void> {
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "players-directory",
      trigger: append ? "pagination" : forceRefresh ? "refresh" : "load",
      forceReason: forceRefresh ? "user-refresh" : undefined
    });
    try {
      const page: PlayerPickerPageResult = await getPlayersForPickerPage({
        search: this.data.activeKeyword,
        filter: this.browseFilter(),
        sort: this.data.sortBy,
        ownershipBand: this.browseOwnershipBand(),
        limit: 50,
        cursor,
        forceRefresh,
        trace
      });
      if (!this.pageVisible || !shouldApplyPlayerResponse(revision, this.requestRevision)) return;
      if (!append) {
        const keyword = resolveKeywordAfterPlayerLoad(
          this.data.activeKeyword,
          this.data.keyword,
          this.searchEditedWhileLoading
        );
        if (keyword.trim() !== this.data.activeKeyword.trim()) {
          this.searchEditedWhileLoading = false;
          void this.startSearch(keyword, forceRefresh);
          return;
        }
        this.searchEditedWhileLoading = false;
      }

      const items = page.items.map(withStatText);
      const merged = append ? mergePlayerPages(this.data.players, items) : items;
      const players = sortPlayerOptions(merged, this.data.sortField, this.data.sortDir);
      this.setData({
        players,
        nextCursor: page.nextCursor,
        totalCount: page.totalCount,
        hasMore: page.nextCursor !== null,
        error: "",
        loadMoreError: ""
      });
    } catch (error) {
      if (!this.pageVisible || !shouldApplyPlayerResponse(revision, this.requestRevision)) return;
      const message = error instanceof Error ? error.message : "球员数据加载失败";
      if (append) {
        this.setData({ loadMoreError: message });
      } else {
        this.setData({ error: message });
      }
    } finally {
      if (this.pageVisible && shouldApplyPlayerResponse(revision, this.requestRevision)) {
        this.setData({ loading: false, loadingMore: false });
      }
    }
  },

  loadMore(): Promise<void> {
    const cursor = this.data.nextCursor;
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) {
      return Promise.resolve();
    }
    if (cursor === null) return Promise.resolve();
    return this.loadMoreFromCursor(cursor);
  },

  loadMoreFromCursor(cursor: number): Promise<void> {
    const revision = this.requestRevision;
    this.paginationPending = true;
    this.paginationCursor = cursor;
    this.setData({ loadingMore: true, loadMoreError: "" });
    return this.fetchPage(revision, cursor, true, false).finally(() => {
      if (this.pageVisible && revision === this.requestRevision) {
        this.paginationPending = false;
        this.paginationCursor = null;
      }
    });
  },

  onKeywordDraft(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    if (this.data.loading) this.searchEditedWhileLoading = true;
    this.setData({ keyword: String(event.detail.keyword || "") });
  },

  onSearch(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    const keyword = String(event.detail.keyword || this.data.keyword || "").trim();
    this.startSearch(keyword);
  },

  onResetSearch() {
    this.startSearch("");
  },

  onOpenPlayer(event: WechatMiniprogram.CustomEvent<{ player: PlayerOption }>) {
    const player = event.detail.player;
    if (this.data.compareArmedSlot > 0) {
      this.fillCompareSlot(player);
      return;
    }
    if (player?.code) {
      goToPlayerDetail(player.code);
    }
  },

  /** Arm a slot so the next directory tap fills it (web: slot picker expands). */
  onCompareArm(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { slot: number }>) {
    const slot = Number(event.currentTarget.dataset.slot) === 2 ? 2 : 1;
    if (slot === 2 && !this.data.comparePlayers[0]) return;
    this.setData({
      compareArmedSlot: slot,
      ...(slot === 2 ? { compareOpen: true } : {})
    });
  },

  onCompareClear(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { slot: number }>) {
    const slot = Number(event.currentTarget.dataset.slot) === 2 ? 2 : 1;
    const comparePlayers = this.data.comparePlayers.slice() as Array<CompareSlot | null>;
    comparePlayers[slot - 1] = null;
    this.compareRevision += 1;
    this.setData({
      comparePlayers,
      compareArmedSlot: slot,
      compareLoading: false,
      compareError: "",
      compareView: null
    });
  },

  fillCompareSlot(player: PlayerOption) {
    const id = Number(player?.element);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const slot = this.data.compareArmedSlot;
    if (this.data.comparePlayers.some((filled) => filled && filled.id === id)) {
      wx.showToast({ title: "这名球员已在对比中", icon: "none" });
      this.setData({ compareArmedSlot: 0 });
      return;
    }
    const comparePlayers = this.data.comparePlayers.slice() as Array<CompareSlot | null>;
    comparePlayers[slot - 1] = {
      id,
      name: player.name,
      team: player.team || "",
      position: player.position || ""
    };
    this.setData({ comparePlayers, compareArmedSlot: 0 });
    if (comparePlayers[0] && comparePlayers[1]) {
      void this.loadCompare();
    }
  },

  onCompareRetry() {
    void this.loadCompare(true);
  },

  async loadCompare(forceRefresh = false): Promise<void> {
    const [slotA, slotB] = this.data.comparePlayers;
    if (!slotA || !slotB) return;
    const revision = ++this.compareRevision;
    this.setData({ compareLoading: true, compareError: "", compareView: null });
    try {
      const context = await ensureAppContext({ reason: "page-load", forceRefresh });
      const eventId = Math.max(1, Number(context.displayEvent || context.currentEvent) || 1);
      const entries = await getPlayerStatsDesk(
        [slotA.id, slotB.id],
        eventId,
        5,
        forceRefresh,
        capturePageRequestTrace({ callerSurface: "players-compare", trigger: "tab" })
      );
      if (!this.pageVisible || revision !== this.compareRevision) return;
      const entryA = entries.find((entry) => entry.playerId === slotA.id) || null;
      const entryB = entries.find((entry) => entry.playerId === slotB.id) || null;
      const compareView = entryA && entryB ? buildCompareView(entryA, entryB) : null;
      this.setData({
        compareLoading: false,
        compareView,
        compareError: compareView ? "" : "对比数据暂时不可用，请稍后重试"
      });
    } catch (error) {
      if (!this.pageVisible || revision !== this.compareRevision) return;
      this.setData({
        compareLoading: false,
        compareError: error instanceof Error ? error.message : "对比数据加载失败"
      });
    }
  },

  onRetry() {
    this.startSearch(this.data.keyword, true);
  },

  onRetryLoadMore() {
    this.loadMore();
  }
});
