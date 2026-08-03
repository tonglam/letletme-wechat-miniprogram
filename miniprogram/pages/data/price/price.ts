import { getPlayersByElementType } from "../../../services/player.service";
import { getPlayerValueByDate, getPlayerValueByElement } from "../../../services/price.service";
import type { PlayerOption, PlayerValueChange } from "../../../models/player";

type PriceMode = "daily" | "player";

interface FilterOption {
  label: string;
  value: string;
}

interface PricePageData {
  activeMode: PriceMode;
  loading: boolean;
  playerLoading: boolean;
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
  riseChanges: PlayerValueChange[];
  fallChanges: PlayerValueChange[];
  historyRows: PlayerValueChange[];
}

const ALL_VALUE = "ALL";
const FILTERED_PLAYER_LIMIT = 80;

const POSITION_OPTIONS: FilterOption[] = [
  { label: "全部位置", value: ALL_VALUE },
  { label: "门将", value: "GKP" },
  { label: "后卫", value: "DEF" },
  { label: "中场", value: "MID" },
  { label: "前锋", value: "FWD" }
];

function formatPickerDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortByName(left: PlayerOption, right: PlayerOption): number {
  return left.name.localeCompare(right.name);
}

function sortByChangeDateDesc(left: PlayerValueChange, right: PlayerValueChange): number {
  return getTime(right.changeDate) - getTime(left.changeDate);
}

function getTime(value?: string): number {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function buildTeamOptions(players: PlayerOption[]): FilterOption[] {
  const teams = new Map<string, string>();
  players.forEach((player) => {
    const value = player.team || player.teamName || "";
    if (!value) {
      return;
    }

    teams.set(value, player.teamName ? `${player.teamName} (${value})` : value);
  });

  return [
    { label: "全部球队", value: ALL_VALUE },
    ...Array.from(teams.entries())
      .map(([value, label]) => ({ label, value }))
      .sort((left, right) => left.label.localeCompare(right.label))
  ];
}

function filterPlayers(
  players: PlayerOption[],
  keyword: string,
  teamFilter: string,
  positionFilter: string
): PlayerOption[] {
  const lowerKeyword = keyword.trim().toLowerCase();
  const hasKeyword = lowerKeyword.length > 0;

  return players
    .filter((player) => {
      const matchesKeyword = !hasKeyword ||
        [player.name, player.team, player.teamName, player.position]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(lowerKeyword);
      const matchesTeam = teamFilter === ALL_VALUE || player.team === teamFilter || player.teamName === teamFilter;
      const matchesPosition = positionFilter === ALL_VALUE || player.position === positionFilter;
      return matchesKeyword && matchesTeam && matchesPosition;
    })
    .sort(sortByName);
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

Page({
  data: {
    activeMode: "daily",
    loading: false,
    playerLoading: false,
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
    riseChanges: [],
    fallChanges: [],
    historyRows: []
  } as PricePageData,

  onLoad() {
    this.loadDailyChanges();
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
    if (!mode || mode === this.data.activeMode) {
      return;
    }

    this.setData({ activeMode: mode });
    if (mode === "player") {
      this.ensurePlayersLoaded();
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

  async refreshPlayerMode(): Promise<void> {
    await this.ensurePlayersLoaded();
    if (this.data.selectedPlayer?.element) {
      await this.loadSelectedPlayerHistory(this.data.selectedPlayer.element, true);
    }
  },

  async ensurePlayersLoaded(forceRefresh = false): Promise<void> {
    if (this.data.playersLoaded || this.data.playerLoading) {
      return;
    }

    this.setData({ playerLoading: true, playersError: "" });
    try {
      const players = await getPlayersByElementType("all", forceRefresh);
      const sortedPlayers = players.sort(sortByName);
      const teamOptions = buildTeamOptions(sortedPlayers);
      this.setData({
        players: sortedPlayers,
        // An empty directory is a transient backend state, not "loaded":
        // keep the door open for the next ensure/retry to refetch.
        playersLoaded: sortedPlayers.length > 0,
        teamOptions,
        teamOptionNames: teamOptions.map((option) => option.label)
      });
      this.syncFilteredPlayers();
    } catch (error) {
      this.setData({ playersError: error instanceof Error ? error.message : "球员列表加载失败" });
    } finally {
      this.setData({ playerLoading: false });
    }
  },

  syncFilteredPlayers() {
    const playerListReady = this.data.teamFilter !== ALL_VALUE && this.data.positionFilter !== ALL_VALUE;
    if (!playerListReady) {
      this.setData({
        filteredPlayers: [],
        filteredPlayerCount: 0,
        playerListReady,
        playerListVisible: false
      });
      return;
    }

    const filteredPlayers = filterPlayers(
      this.data.players,
      this.data.playerKeyword,
      this.data.teamFilter,
      this.data.positionFilter
    );

    this.setData({
      filteredPlayers: filteredPlayers.slice(0, FILTERED_PLAYER_LIMIT),
      filteredPlayerCount: filteredPlayers.length,
      playerListReady,
      playerListVisible: true
    });
  },

  onPlayerKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ playerKeyword: event.detail.value });
    this.syncFilteredPlayers();
  },

  onClearPlayerKeyword() {
    this.setData({ playerKeyword: "" });
    this.syncFilteredPlayers();
  },

  onRetryPlayers() {
    this.setData({ players: [], playersLoaded: false });
    this.ensurePlayersLoaded(true);
  },

  onClearPlayerFilters() {
    this.setData({
      playerKeyword: "",
      teamFilter: ALL_VALUE,
      positionFilter: ALL_VALUE,
      selectedTeamIndex: 0,
      selectedPositionIndex: 0,
      filteredPlayers: [],
      filteredPlayerCount: 0,
      playerListReady: false,
      playerListVisible: false
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
    this.syncFilteredPlayers();
  },

  onPositionFilterChange(event: WechatMiniprogram.PickerChange) {
    const selectedPositionIndex = Number(event.detail.value);
    const option = this.data.positionOptions[selectedPositionIndex] || this.data.positionOptions[0];
    this.setData({
      selectedPositionIndex,
      positionFilter: option.value
    });
    this.syncFilteredPlayers();
  },

  onSelectPlayer(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { index: string }>) {
    const player = this.data.filteredPlayers[Number(event.currentTarget.dataset.index)];
    if (!player || !player.element) {
      return;
    }

    this.setData({
      activeMode: "player",
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
  }
});
