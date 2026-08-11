import {
  getPlayersForPickerPage,
  type PlayerPickerFilter
} from "../../../services/player.service";
import { getTeamList } from "../../../services/common.service";
import { getPlayerValueByDate, getPlayerValueByElement } from "../../../services/price.service";
import type { PlayerOption, PlayerValueChange } from "../../../models/player";

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
  playerLoading: boolean;
  loadingMore: boolean;
  historyLoading: boolean;
  error: string;
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
    playerLoading: false,
    loadingMore: false,
    historyLoading: false,
    error: "",
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

  onLoad() {
    this.loadDailyChanges();
  },

  onUnload() {
    if (this.playerSearchTimer !== undefined) {
      clearTimeout(this.playerSearchTimer);
    }
  },

  onPullDownRefresh() {
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
    this.setData({ changeDate: String(event.detail.value) });
    this.loadDailyChanges();
  },

  async loadDailyChanges(forceRefresh = false): Promise<void> {
    this.setData({ loading: true, error: "" });
    try {
      const changes = await getPlayerValueByDate(this.data.changeDate, forceRefresh);
      this.setData(splitChanges(changes));
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "身价变化加载失败" });
    } finally {
      this.setData({ loading: false });
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
      const season = String(getApp<IAppOption>().globalData.season || "unknown");
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
