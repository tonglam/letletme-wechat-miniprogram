import {
  getPlayersForPickerPage,
  type PlayerPickerFilter
} from "../../../services/player.service";
import { getTeamList } from "../../../services/common.service";
import { getPlayerValueByElement, readPlayerValueByDate } from "../../../services/price.service";
import type { PlayerOption, PlayerValueChange } from "../../../models/player";
import { ensureAppContext, getAppContextSnapshot } from "../../../services/app-context.service";
import { PagePerformanceTracker } from "../../../utils/page-performance";
import {
  nextRequestRevision,
  isCurrentRevision,
  observeSoftTimeout,
  setDataAsync
} from "../../../utils/page-request";

type PriceMode = "daily" | "player";

interface FilterOption {
  label: string;
  value: string;
}

interface TeamDirectoryItem {
  id: number;
  name: string;
  shortName?: string;
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
}

const ALL_VALUE = "ALL";

const POSITION_OPTIONS: FilterOption[] = [
  { label: "全部位置", value: ALL_VALUE },
  { label: "门将", value: "GOALKEEPER" },
  { label: "后卫", value: "DEFENDER" },
  { label: "中场", value: "MIDFIELDER" },
  { label: "前锋", value: "FORWARD" }
];

function formatPickerDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortByChangeDateDesc(left: PlayerValueChange, right: PlayerValueChange): number {
  return getTime(right.changeDate) - getTime(left.changeDate);
}

function getTime(value?: string): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function splitChanges(changes: PlayerValueChange[]): {
  riseChanges: PlayerValueChange[];
  fallChanges: PlayerValueChange[];
} {
  return {
    riseChanges: changes
      .filter((change) => (change.newValue ?? change.value ?? 0) > (change.oldValue ?? change.lastValue ?? 0))
      .sort((left, right) => (right.newValue ?? right.value ?? 0) - (left.newValue ?? left.value ?? 0)),
    fallChanges: changes
      .filter((change) => (change.newValue ?? change.value ?? 0) < (change.oldValue ?? change.lastValue ?? 0))
      .sort((left, right) => (left.newValue ?? left.value ?? 0) - (right.newValue ?? right.value ?? 0))
  };
}

function mergePlayers(existing: PlayerOption[], incoming: PlayerOption[]): PlayerOption[] {
  const seen = new Set(existing.map((player) => player.element));
  return existing.concat(incoming.filter((player) => {
    if (seen.has(player.element)) return false;
    seen.add(player.element);
    return true;
  }));
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
    historyRows: []
  } as PricePageData,

  playerRequestRevision: 0,
  playerSearchTimer: undefined as number | undefined,
  dailyRequestOwner: {} as object,
  perfTracker: undefined as PagePerformanceTracker | undefined,
  pageActive: false,
  hasShown: false,

  async onLoad() {
    this.pageActive = true;
    this.perfTracker = new PagePerformanceTracker(this, "pages/data/price/price", "cold-launch");
    await ensureAppContext({ reason: "page-load" });
    this.perfTracker.mark("contextReadyAt");
    void this.loadDailyChanges();
  },

  onShow() {
    this.pageActive = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed) return;
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/data/price/price", "warm-enter");
    this.perfTracker.mark("contextReadyAt");
    wx.nextTick(() => this.perfTracker?.observePrimary("#perf-primary-content"));
  },

  onHide() {
    this.pageActive = false;
    this.perfTracker?.disconnect();
  },

  onUnload() {
    this.pageActive = false;
    this.perfTracker?.disconnect();
    if (this.playerSearchTimer !== undefined) {
      clearTimeout(this.playerSearchTimer);
    }
  },

  onPullDownRefresh() {
    this.startDailyRefreshTrace();
    const task = this.data.activeMode === "player"
      ? this.refreshPlayerMode()
      : this.loadDailyChanges(true);
    task.finally(() => wx.stopPullDownRefresh());
  },

  onRetry() {
    if (this.data.activeMode === "player") {
      this.refreshPlayerMode();
      return;
    }
    this.startDailyRefreshTrace();
    this.loadDailyChanges();
  },

  onModeChange(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { mode: PriceMode }>) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.activeMode) return;

    this.setData({ activeMode: mode });
    if (mode === "player") {
      this.ensurePlayerModeReady();
    }
  },

  onDateChange(event: WechatMiniprogram.PickerChange) {
    this.startDailyRefreshTrace();
    this.setData({
      changeDate: String(event.detail.value),
      riseChanges: [],
      fallChanges: [],
      staleMessage: "",
      error: ""
    });
    this.loadDailyChanges();
  },

  startDailyRefreshTrace() {
    this.perfTracker?.disconnect();
    this.perfTracker = new PagePerformanceTracker(this, "pages/data/price/price", "refresh");
    this.perfTracker.mark("contextReadyAt");
  },

  async loadDailyChanges(forceRefresh = false): Promise<void> {
    const revision = nextRequestRevision(this.dailyRequestOwner, "daily");
    const changeDate = this.data.changeDate;
    const hasRows = this.data.riseChanges.length > 0 || this.data.fallChanges.length > 0;
    this.setData({
      loading: !hasRows,
      refreshing: hasRows,
      error: "",
      staleMessage: ""
    });
    this.perfTracker?.mark("primaryRequestStartAt");
    const context = getAppContextSnapshot();
    const readTask = readPlayerValueByDate(changeDate, {
      forceRefresh,
      trace: this.perfTracker && context
        ? {
            navigationId: this.perfTracker.navigationId,
            callerSurface: "price-daily",
            trigger: forceRefresh ? "refresh" : "load",
            forceReason: forceRefresh ? "user-refresh" : undefined,
            contextRevision: context.contextRevision
          }
        : undefined
    });
    observeSoftTimeout(readTask, 2900, () => {
      if (!this.pageActive || !isCurrentRevision(this.dailyRequestOwner, "daily", revision)) return;
      this.perfTracker?.mark("softFailureAt");
      this.setData({
        loading: false,
        refreshing: false,
        error: hasRows
          ? "刷新时间较长，请稍后重试；当前继续显示已有数据"
          : "加载时间较长，请稍后重试；当前请求仍在后台继续"
      }, () => wx.nextTick(() => this.perfTracker?.observePrimary("#perf-primary-content")));
    });
    try {
      const read = await readTask;
      if (!this.pageActive || !isCurrentRevision(this.dailyRequestOwner, "daily", revision)) return;
      this.perfTracker?.mark("primaryResponseAt");
      await setDataAsync(this, {
        ...splitChanges(read.data),
        error: "",
        staleMessage: read.meta.stale && read.meta.storedAt
          ? `当前为上次成功数据 · ${new Date(read.meta.storedAt).toLocaleString()}`
          : ""
      });
      this.perfTracker?.mark("primarySetDataAt");
      wx.nextTick(() => this.perfTracker?.observePrimary("#perf-primary-content"));
    } catch (error) {
      if (!this.pageActive || !isCurrentRevision(this.dailyRequestOwner, "daily", revision)) return;
      this.setData({ error: error instanceof Error ? error.message : "身价变化加载失败" });
      wx.nextTick(() => this.perfTracker?.observePrimary("#perf-primary-content"));
    } finally {
      if (isCurrentRevision(this.dailyRequestOwner, "daily", revision)) {
        this.setData({ loading: false, refreshing: false });
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

  async loadTeamOptions(): Promise<void> {
    this.setData({ playerLoading: true, playersError: "" });
    try {
      const context = await ensureAppContext({ reason: "page-load" });
      const season = context.season;
      const teams = await getTeamList(season) as TeamDirectoryItem[];
      const teamOptions: FilterOption[] = [
        { label: "全部球队", value: ALL_VALUE },
        ...teams
          .map((team) => ({
            label: team.shortName ? `${team.name} (${team.shortName})` : team.name,
            value: String(team.id)
          }))
          .sort((left, right) => left.label.localeCompare(right.label))
      ];
      this.setData({
        teamOptions,
        teamOptionNames: teamOptions.map((option) => option.label)
      });
    } catch (error) {
      this.setData({ playersError: error instanceof Error ? error.message : "球队列表加载失败" });
    } finally {
      this.setData({ playerLoading: false });
    }
  },

  isPlayerListReady(): boolean {
    const hasKeyword = this.data.playerKeyword.trim().length > 0;
    const hasTeamAndPosition =
      this.data.teamFilter !== ALL_VALUE
      && this.data.positionFilter !== ALL_VALUE;
    return hasKeyword || hasTeamAndPosition;
  },

  pickerFilter(): PlayerPickerFilter | undefined {
    const filter: PlayerPickerFilter = {};
    if (this.data.teamFilter !== ALL_VALUE) {
      filter.teamId = Number(this.data.teamFilter);
    }
    if (this.data.positionFilter !== ALL_VALUE) {
      filter.position = this.data.positionFilter as PlayerPickerFilter["position"];
    }
    return Object.keys(filter).length ? filter : undefined;
  },

  invalidatePlayerRequest(): number {
    this.playerRequestRevision += 1;
    return this.playerRequestRevision;
  },

  startPlayerSearch(forceRefresh = false): Promise<void> {
    const revision = this.invalidatePlayerRequest();
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
      playersError: ""
    });
    if (!ready) return Promise.resolve();
    return this.loadPlayerPage(revision, null, false, forceRefresh);
  },

  async loadPlayerPage(
    revision: number,
    cursor: number | null,
    append: boolean,
    forceRefresh: boolean
  ): Promise<void> {
    this.setData(append
      ? { loadingMore: true, playersError: "" }
      : { playerLoading: true, playersError: "" });

    try {
      const page = await getPlayersForPickerPage({
        search: this.data.playerKeyword,
        filter: this.pickerFilter(),
        limit: 50,
        cursor,
        forceRefresh
      });
      if (revision !== this.playerRequestRevision) return;

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
        playersError: ""
      });
    } catch (error) {
      if (revision !== this.playerRequestRevision) return;
      this.setData({
        playersError: error instanceof Error ? error.message : "球员列表加载失败",
        ...(append ? {} : { playersLoaded: false })
      });
    } finally {
      if (revision === this.playerRequestRevision) {
        this.setData({ playerLoading: false, loadingMore: false });
      }
    }
  },

  loadMorePlayers(): Promise<void> {
    if (
      this.data.playerLoading
      || this.data.loadingMore
      || !this.data.hasMorePlayers
      || this.data.nextCursor === null
    ) {
      return Promise.resolve();
    }
    return this.loadPlayerPage(
      this.playerRequestRevision,
      this.data.nextCursor,
      true,
      false
    );
  },

  onPlayerKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ playerKeyword: event.detail.value });
    const revision = this.invalidatePlayerRequest();
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
        hasMorePlayers: false
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
    if (this.data.teamOptions.length === 1) {
      this.loadTeamOptions().then(() => this.startPlayerSearch(true));
      return;
    }
    this.startPlayerSearch(true);
  },

  onClearPlayerFilters() {
    if (this.playerSearchTimer !== undefined) {
      clearTimeout(this.playerSearchTimer);
      this.playerSearchTimer = undefined;
    }
    this.invalidatePlayerRequest();
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
      playersError: ""
    });
  },

  onRetryHistory() {
    if (this.data.selectedPlayer?.element) {
      this.loadSelectedPlayerHistory(this.data.selectedPlayer.element);
    }
  },

  onTeamFilterChange(event: WechatMiniprogram.PickerChange) {
    const selectedTeamIndex = Number(event.detail.value);
    const option = this.data.teamOptions[selectedTeamIndex] || this.data.teamOptions[0];
    this.setData({
      selectedTeamIndex,
      teamFilter: option.value
    });
    this.startPlayerSearch();
  },

  onPositionFilterChange(event: WechatMiniprogram.PickerChange) {
    const selectedPositionIndex = Number(event.detail.value);
    const option = this.data.positionOptions[selectedPositionIndex] || this.data.positionOptions[0];
    this.setData({
      selectedPositionIndex,
      positionFilter: option.value
    });
    this.startPlayerSearch();
  },

  onSelectPlayer(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { index: string }>) {
    const player = this.data.filteredPlayers[Number(event.currentTarget.dataset.index)];
    if (!player?.element) return;

    this.setData({
      selectedPlayer: player,
      playerListVisible: false,
      historyRows: [],
      historyError: ""
    });
    this.loadSelectedPlayerHistory(player.element);
  },

  async loadSelectedPlayerHistory(playerId: number, forceRefresh = false): Promise<void> {
    this.setData({ historyLoading: true, historyError: "" });
    try {
      const historyRows = await getPlayerValueByElement(playerId, forceRefresh);
      this.setData({ historyRows: historyRows.sort(sortByChangeDateDesc) });
    } catch (error) {
      this.setData({ historyError: error instanceof Error ? error.message : "球员身价历史加载失败" });
    } finally {
      this.setData({ historyLoading: false });
    }
  },

  onClearSelectedPlayer() {
    this.setData({
      selectedPlayer: null,
      playerListVisible: this.data.playerListReady,
      historyRows: [],
      historyError: ""
    });
  },

  async refreshPlayerMode(): Promise<void> {
    if (this.data.teamOptions.length === 1) {
      await this.loadTeamOptions();
    }
    if (this.isPlayerListReady()) {
      await this.startPlayerSearch(true);
    }
    if (this.data.selectedPlayer?.element) {
      await this.loadSelectedPlayerHistory(this.data.selectedPlayer.element, true);
    }
  }
});
