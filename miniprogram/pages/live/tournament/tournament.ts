import { getEntryPointsRaceTournament } from "../../../services/tournament.service";
import { getLivePointsByTournament, searchLivePointsByTournament } from "../../../services/live.service";
import { getApiSessionToken } from "../../../services/auth.service";
import type { LiveTournamentRow } from "../../../models/live";
import type { TournamentOption } from "../../../models/tournament";
import { routes } from "../../../config/routes";
import { forceEntryBinding } from "../../../utils/navigation";
import {
  filterTournamentRowsByOwnership,
  filterTournamentRowsByTeamExposure,
  getTournamentTeamOptions,
  type TournamentCaptainMode,
  type TournamentOwnershipScope,
  type TournamentTeamOption
} from "../../../services/live-tournament";

type SortKey = "livePoints" | "liveNetPoints" | "transferCost" | "played" | "totalPoints" | "overallRank" | "entryName";
type LiveTournamentEmptyState = "" | "entry" | "tournaments";

const SELECTED_TOURNAMENT_ID_KEY = "live-tournamentId";
const SELECTED_TOURNAMENT_NAME_KEY = "live-tournamentName";

interface SortOption {
  key: SortKey;
  label: string;
}

interface DisplayTournamentRow extends LiveTournamentRow {
  visibleRank: number;
  displayLive: string;
  displayNet: string;
  displayTotal: string;
  metaText: string;
}

interface OwnershipPlayerOption {
  element: number;
  name: string;
  meta: string;
  teamShortName: string;
  teamName: string;
  position: string;
}

interface LiveTournamentData {
  loading: boolean;
  error: string;
  hasContent: boolean;
  emptyState: LiveTournamentEmptyState;
  emptyEyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionText: string;
  resultsEmptyTitle: string;
  resultsEmptyDescription: string;
  resultsEmptyActionText: string;
  resultsFiltered: boolean;
  event: number;
  maxGw: number;
  entryId?: number;
  keyword: string;
  tournaments: TournamentOption[];
  tournamentNames: string[];
  selectedTournamentIndex: number;
  selectedTournament?: TournamentOption;
  rows: DisplayTournamentRow[];
  displayedRows: DisplayTournamentRow[];
  sortOptions: SortOption[];
  sortKey: SortKey;
  sortDesc: boolean;
  filteredCount: number;
  ownershipExpanded: boolean;
  ownershipScope: TournamentOwnershipScope;
  ownershipCaptainMode: TournamentCaptainMode;
  ownershipPlayers: OwnershipPlayerOption[];
  ownershipTeamOptions: TournamentTeamOption[];
  ownershipTeamNames: string[];
  selectedOwnershipTeamIndex: number;
  selectedOwnershipTeam: TournamentTeamOption | null;
  ownershipPositionOptions: string[];
  selectedOwnershipPositionIndex: number;
  selectedOwnershipPosition: string;
  ownershipAvailablePlayers: OwnershipPlayerOption[];
  ownershipAvailablePlayerNames: string[];
  selectedOwnershipPlayers: OwnershipPlayerOption[];
  ownershipPlayerNames: string[];
  ownershipSummary: string;
  teamExposureExpanded: boolean;
  teamExposureScope: TournamentOwnershipScope;
  teamExposureTeams: TournamentTeamOption[];
  teamExposureTeamNames: string[];
  selectedTeamExposureIndex: number;
  selectedTeamExposure: TournamentTeamOption | null;
  teamExposureCount: number;
  teamExposureSummary: string;
  pageSize: number;
  hasMore: boolean;
  lastUpdated: string;
  columns: Array<{ key: string; label: string }>;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = "-"): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function normalizeRow(row: LiveTournamentRow): DisplayTournamentRow {
  const livePoints = numberValue(row.livePoints);
  const liveNetPoints = numberValue(row.liveNetPoints, livePoints);
  const totalPoints = numberValue(row.liveTotalPoints ?? row.totalPoints);
  const transferCost = numberValue(row.transferCost);
  const played = numberValue(row.played);
  const toPlay = numberValue(row.toPlay);
  const chip = textValue(row.chip, "无");
  const captain = textValue(row.captainName, "无队长");

  return {
    ...row,
    livePoints,
    liveNetPoints,
    totalPoints,
    transferCost,
    overallRank: row.overallRank ?? row.rank,
    visibleRank: 0,
    displayLive: `${livePoints}`,
    displayNet: `${liveNetPoints}`,
    displayTotal: `${totalPoints}`,
    metaText: `队长 ${captain} · 开卡 ${chip} · 剁手 ${transferCost} · ${played}/${played + toPlay}`
  };
}

function sortRows(rows: DisplayTournamentRow[], key: SortKey, desc: boolean): DisplayTournamentRow[] {
  const direction = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (key === "entryName") {
      return textValue(a.entryName, "").localeCompare(textValue(b.entryName, "")) * direction;
    }
    const fallback = key === "overallRank" ? Number.MAX_SAFE_INTEGER : 0;
    const left = numberValue(a[key], fallback);
    const right = numberValue(b[key], fallback);
    const compared = left === right ? numberValue(a.entry, Number.MAX_SAFE_INTEGER) - numberValue(b.entry, Number.MAX_SAFE_INTEGER) : left - right;
    return compared * direction;
  });
}

function formatTeamName(team: TournamentTeamOption): string {
  return `${team.name}${team.shortName === team.name ? "" : ` (${team.shortName})`}`;
}

function collectOwnershipPlayers(rows: DisplayTournamentRow[]): OwnershipPlayerOption[] {
  const players = new Map<number, OwnershipPlayerOption>();
  rows.forEach((row) => {
    (row.picks || []).forEach((pick) => {
      const element = numberValue(pick.element);
      if (!element || players.has(element)) {
        return;
      }
      const teamShortName = pick.teamShortName || "";
      const teamName = pick.team || teamShortName;
      const position = pick.elementTypeName || pick.position || "未知";
      players.set(element, {
        element,
        name: pick.webName || pick.name || `#${element}`,
        meta: `${teamShortName}${position ? ` · ${position}` : ""}`,
        teamShortName,
        teamName,
        position
      });
    });
  });
  return [...players.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function collectOwnershipPositions(players: OwnershipPlayerOption[], selectedTeam?: TournamentTeamOption | null): string[] {
  if (!selectedTeam) {
    return [];
  }
  return [...new Set(players
    .filter((player) => player.teamShortName === selectedTeam.shortName)
    .map((player) => player.position)
    .filter((position) => position))]
    .sort();
}

function filterOwnershipPlayers(
  players: OwnershipPlayerOption[],
  selectedTeam?: TournamentTeamOption | null,
  selectedPosition = ""
): OwnershipPlayerOption[] {
  if (!selectedTeam || !selectedPosition) {
    return [];
  }
  return players.filter((player) => (
    player.teamShortName === selectedTeam.shortName
    && player.position === selectedPosition
  ));
}

Page({
  data: {
    loading: false,
    error: "",
    hasContent: false,
    emptyState: "",
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
    resultsEmptyTitle: "本轮实时排名还没生成",
    resultsEmptyDescription: "比赛开始或联赛数据同步后会显示实时排名",
    resultsEmptyActionText: "重新加载",
    resultsFiltered: false,
    event: 0,
    maxGw: 1,
    entryId: undefined,
    keyword: "",
    tournaments: [],
    tournamentNames: [],
    selectedTournamentIndex: 0,
    selectedTournament: undefined,
    rows: [],
    displayedRows: [],
    sortOptions: [
      { key: "livePoints", label: "GW得分" },
      { key: "liveNetPoints", label: "GW净分" },
      { key: "transferCost", label: "扣分" },
      { key: "played", label: "已上场" },
      { key: "totalPoints", label: "总分" },
      { key: "overallRank", label: "总排名" },
      { key: "entryName", label: "球队" }
    ],
    sortKey: "livePoints",
    sortDesc: true,
    filteredCount: 0,
    ownershipExpanded: false,
    ownershipScope: "any",
    ownershipCaptainMode: "any",
    ownershipPlayers: [],
    ownershipTeamOptions: [],
    ownershipTeamNames: [],
    selectedOwnershipTeamIndex: 0,
    selectedOwnershipTeam: null,
    ownershipPositionOptions: [],
    selectedOwnershipPositionIndex: 0,
    selectedOwnershipPosition: "",
    ownershipAvailablePlayers: [],
    ownershipAvailablePlayerNames: [],
    selectedOwnershipPlayers: [],
    ownershipPlayerNames: [],
    ownershipSummary: "未筛选",
    teamExposureExpanded: false,
    teamExposureScope: "any",
    teamExposureTeams: [],
    teamExposureTeamNames: [],
    selectedTeamExposureIndex: 0,
    selectedTeamExposure: null,
    teamExposureCount: 1,
    teamExposureSummary: "未筛选",
    pageSize: 20,
    hasMore: false,
    lastUpdated: "",
    columns: [
      { key: "rank", label: "序" },
      { key: "entryName", label: "球队" },
      { key: "livePoints", label: "GW" },
      { key: "totalPoints", label: "总分" }
    ]
  } as LiveTournamentData,

  async onLoad() {
    const app = getApp<IAppOption>();
    // Show the loading state while waiting for shared launch data so a cold
    // open never renders placeholder content as if it were loaded.
    this.setData({ loading: true });
    await app.initAppData();
    if (!getApiSessionToken()) {
      // With no valid session the stored binding is only offline/display
      // fallback: the account may have been relinked to a different entry
      // since, so wait for the refreshed profile to re-assert it (the login
      // may not even have started while the privacy callback is pending).
      try { await app.authReady; } catch {}
    }
    const currentGw = Math.max(1, Number(app.globalData.gw) || 1);
    this.setData({ entryId: app.globalData.entryId, event: currentGw, maxGw: currentGw });
    this.loadTournaments(false);
  },

  onPullDownRefresh() {
    // Always re-pull the tournament list (it chains into loadRows): a cached
    // list must not hide a league the user just joined until the TTL expires.
    const task = this.loadTournaments(true);
    task.finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  async loadTournaments(forceRefresh = false) {
    const entryId = this.data.entryId;
    if (!entryId) {
      this.setData({
        loading: false,
        error: "",
        emptyState: "entry",
        emptyEyebrow: "需要账户",
        emptyTitle: "先关联你的 LetLetMe 账户",
        emptyDescription: "关联后会自动读取你在网站端已验证的 FPL 球队，并加载实时联赛。",
        emptyActionText: "去关联账户",
        tournaments: [],
        tournamentNames: [],
        selectedTournament: undefined,
        rows: [],
        displayedRows: []
      });
      return;
    }

    this.setData({
      loading: true,
      error: "",
      emptyState: "",
      emptyEyebrow: "",
      emptyTitle: "",
      emptyDescription: "",
      emptyActionText: ""
    });
    try {
      const tournaments = await getEntryPointsRaceTournament(entryId, forceRefresh);
      if (tournaments.length === 0) {
        this.setData({
          tournaments: [],
          tournamentNames: [],
          selectedTournament: undefined,
          rows: [],
          displayedRows: [],
          // The content context is gone: a later failed recheck must surface
          // the full-page error/empty state, not a toast over a blank view.
          hasContent: false,
          emptyState: "tournaments",
          emptyEyebrow: "联赛待就绪",
          emptyTitle: "当前球队还没有可查看的联赛",
          emptyDescription: "加入一个积分联赛后，或等待新赛季数据同步，再回到这里重新检查。",
          emptyActionText: "重新检查"
        });
        return;
      }
      const storedId = wx.getStorageSync(SELECTED_TOURNAMENT_ID_KEY);
      const storedIndex = tournaments.findIndex((tournament) => String(tournament.id) === String(storedId));
      const selectedTournamentIndex = storedIndex >= 0 ? storedIndex : 0;
      const selectedTournament = tournaments[selectedTournamentIndex];
      // A league switch — including the refreshed list dropping the current
      // one — is a new result context: never show the previous league's rows
      // under the newly selected league after a failed reload.
      const selectionChanged = !this.data.selectedTournament
        || String(this.data.selectedTournament.id) !== String(selectedTournament.id);
      this.setData({
        tournaments,
        tournamentNames: tournaments.map((tournament) => tournament.name),
        selectedTournamentIndex,
        selectedTournament,
        emptyState: "",
        ...(selectionChanged ? { hasContent: false, rows: [], displayedRows: [] } : {})
      });
      this.persistSelectedTournament(selectedTournament);
      await this.loadRows(forceRefresh);
    } catch (error) {
      const message = error instanceof Error ? error.message : "实时联赛加载失败";
      if (this.data.hasContent) {
        wx.showToast({ title: message, icon: "none" });
      } else {
        this.setData({ error: message });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  // The keyword that the in-flight/visible rows were actually requested with.
  // data.keyword is a per-keystroke draft (onKeyword fires no request), so
  // the request-context guard must track only submitted keywords — otherwise
  // a draft edit mid-flight would strand the load unsettled forever.
  _submittedKeyword: "",

  async loadRows(forceRefresh = false) {
    const selected = this.data.selectedTournament;
    if (!selected) {
      this.setData({ rows: [], displayedRows: [], hasMore: false });
      return;
    }

    const requestedContext = `${selected.id}|${this.data.event}|${this._submittedKeyword}`;
    const activeContext = () => `${this.data.selectedTournament?.id}|${this.data.event}|${this._submittedKeyword}`;
    this.setData({ loading: true, error: "" });
    try {
      const result = this._submittedKeyword
      ? await searchLivePointsByTournament(selected.id, this.data.event, this._submittedKeyword, forceRefresh)
      : await getLivePointsByTournament(selected.id, this.data.event, forceRefresh);
      if (requestedContext !== activeContext()) {
        // Superseded by a tournament/GW/keyword change while in flight: this
        // payload belongs to the old context; the new context's load owns
        // loading/error state.
        return;
      }
      // A cache serve keeps its original fetch time so the "updated" label
      // reflects the data's real age.
      const fetchedAt = result.servedStoredAt || Date.now();
      this.applyRows(result.rows.map(normalizeRow), true, fetchedAt);
      this.setData({ hasContent: true });
    } catch (error) {
      if (requestedContext !== activeContext()) {
        return;
      }
      const message = error instanceof Error ? error.message : "实时联赛加载失败";
      if (this.data.hasContent) {
        // Background refresh failure: keep the stale rows, surface a toast.
        wx.showToast({ title: message, icon: "none" });
      } else {
        this.setData({ error: message });
      }
    } finally {
      if (requestedContext === activeContext()) {
        this.setData({ loading: false });
      }
    }
  },

  applyRows(rows: DisplayTournamentRow[], resetPage: boolean, fetchedAt?: number) {
    const teamOptions = getTournamentTeamOptions(rows);
    const selectedTeamExposure = this.data.selectedTeamExposure
      ? teamOptions.find((team) => team.shortName === this.data.selectedTeamExposure?.shortName)
      : null;
    const ownershipPlayers = collectOwnershipPlayers(rows);
    const selectedOwnershipTeam = this.data.selectedOwnershipTeam
      ? teamOptions.find((team) => team.shortName === this.data.selectedOwnershipTeam?.shortName)
      : null;
    const ownershipPositionOptions = collectOwnershipPositions(ownershipPlayers, selectedOwnershipTeam);
    const selectedOwnershipPosition = ownershipPositionOptions.includes(this.data.selectedOwnershipPosition)
      ? this.data.selectedOwnershipPosition
      : "";
    const ownershipAvailablePlayers = filterOwnershipPlayers(ownershipPlayers, selectedOwnershipTeam, selectedOwnershipPosition);
    let filteredRows = filterTournamentRowsByOwnership(rows, {
      playerIds: this.data.selectedOwnershipPlayers.map((player) => player.element),
      scope: this.data.ownershipScope,
      captainMode: this.data.ownershipCaptainMode
    }) as DisplayTournamentRow[];
    filteredRows = filterTournamentRowsByTeamExposure(filteredRows, {
      teamShortName: selectedTeamExposure?.shortName || "",
      exactCount: this.data.teamExposureCount,
      scope: this.data.teamExposureScope
    }) as DisplayTournamentRow[];
    const sortedRows = sortRows(filteredRows, this.data.sortKey, this.data.sortDesc).map((row, index) => ({
      ...row,
      visibleRank: index + 1
    }));
    // The keyword filter is applied server-side at submit time, so classify
    // by the submitted keyword: an unsubmitted draft in the search box must
    // not make unfiltered rows claim "no teams match the current filters".
    const resultsFiltered = Boolean(
      this._submittedKeyword.trim()
      || this.data.selectedOwnershipPlayers.length
      || selectedTeamExposure
    );
    const nextSize = resetPage ? this.data.pageSize : this.data.displayedRows.length + this.data.pageSize;
    this.setData({
      rows,
      displayedRows: sortedRows.slice(0, nextSize),
      filteredCount: sortedRows.length,
      hasMore: sortedRows.length > nextSize,
      resultsFiltered,
      resultsEmptyTitle: resultsFiltered
        ? "没有符合当前筛选的球队"
        : `GW${this.data.event} 实时排名还没生成`,
      resultsEmptyDescription: resultsFiltered
        ? "清除搜索或球员持有、球队人数筛选后再看"
        : "比赛开始或联赛数据同步后会显示实时排名",
      resultsEmptyActionText: resultsFiltered ? "清除全部筛选" : "重新加载",
      ownershipPlayers,
      ownershipTeamOptions: teamOptions,
      ownershipTeamNames: teamOptions.map(formatTeamName),
      selectedOwnershipTeam,
      selectedOwnershipTeamIndex: selectedOwnershipTeam ? teamOptions.findIndex((team) => team.shortName === selectedOwnershipTeam.shortName) : 0,
      ownershipPositionOptions,
      selectedOwnershipPosition,
      selectedOwnershipPositionIndex: selectedOwnershipPosition ? ownershipPositionOptions.findIndex((position) => position === selectedOwnershipPosition) : 0,
      ownershipAvailablePlayers,
      ownershipAvailablePlayerNames: ownershipAvailablePlayers.map((player) => player.name),
      ownershipPlayerNames: this.data.selectedOwnershipPlayers.map((player) => `${player.name}${player.meta ? ` (${player.meta})` : ""}`),
      ownershipSummary: this.data.selectedOwnershipPlayers.length
        ? this.data.selectedOwnershipPlayers.map((player) => player.name).join("、")
        : "未筛选",
      teamExposureTeams: teamOptions,
      teamExposureTeamNames: teamOptions.map(formatTeamName),
      selectedTeamExposure,
      selectedTeamExposureIndex: selectedTeamExposure ? teamOptions.findIndex((team) => team.shortName === selectedTeamExposure.shortName) : 0,
      teamExposureSummary: selectedTeamExposure ? `${selectedTeamExposure.name} 等于 ${this.data.teamExposureCount} 人` : "未筛选",
      // Local re-sorts/filter tweaks reapply the same rows without a fetch:
      // keep the original fetch time rather than stamping "now" as if the
      // data had just been refreshed.
      ...(fetchedAt != null ? { lastUpdated: formatTime(new Date(fetchedAt)) } : {})
    });
  },

  persistSelectedTournament(selected?: TournamentOption) {
    if (!selected) {
      return;
    }
    wx.setStorageSync(SELECTED_TOURNAMENT_ID_KEY, selected.id);
    wx.setStorageSync(SELECTED_TOURNAMENT_NAME_KEY, selected.name);
  },

  onKeyword(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.setData({ keyword: event.detail.keyword });
  },

  onSearch(event?: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    // A new keyword = a new result context: drop the content flag so stale
    // rows cannot linger under the new keyword after a failed reload.
    this._submittedKeyword = event ? event.detail.keyword : this.data.keyword;
    if (event) {
      this.setData({ keyword: event.detail.keyword, hasContent: false });
    } else {
      this.setData({ hasContent: false });
    }
    this.loadRows(false);
  },

  onResetSearch() {
    this._submittedKeyword = "";
    this.setData({ keyword: "", hasContent: false });
    this.loadRows(false);
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.setData({ event: event.detail.value, hasContent: false });
    this.loadRows(false);
  },

  onTournamentChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const selectedTournamentIndex = Number(event.detail.value);
    const selectedTournament = this.data.tournaments[selectedTournamentIndex];
    this.setData({ selectedTournamentIndex, selectedTournament, rows: [], displayedRows: [], hasContent: false });
    this.persistSelectedTournament(selectedTournament);
    this.loadRows(false);
  },

  onSortTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { key: SortKey }>) {
    const sortKey = event.currentTarget.dataset.key;
    const sortDesc = this.data.sortKey === sortKey ? !this.data.sortDesc : sortKey !== "overallRank" && sortKey !== "entryName";
    this.setData({ sortKey, sortDesc });
    this.applyRows(this.data.rows, true);
  },

  onToggleOwnership() {
    this.setData({ ownershipExpanded: !this.data.ownershipExpanded });
  },

  onOwnershipScopeTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { scope: TournamentOwnershipScope }>) {
    this.setData({ ownershipScope: event.currentTarget.dataset.scope });
    this.applyRows(this.data.rows, true);
  },

  onOwnershipCaptainTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { mode: TournamentCaptainMode }>) {
    this.setData({ ownershipCaptainMode: event.currentTarget.dataset.mode });
    this.applyRows(this.data.rows, true);
  },

  onOwnershipTeamChange(event: WechatMiniprogram.PickerChange) {
    const selectedOwnershipTeamIndex = Number(event.detail.value);
    const selectedOwnershipTeam = this.data.ownershipTeamOptions[selectedOwnershipTeamIndex];
    const ownershipPositionOptions = collectOwnershipPositions(this.data.ownershipPlayers, selectedOwnershipTeam);
    this.setData({
      selectedOwnershipTeamIndex,
      selectedOwnershipTeam,
      ownershipPositionOptions,
      selectedOwnershipPositionIndex: 0,
      selectedOwnershipPosition: "",
      ownershipAvailablePlayers: [],
      ownershipAvailablePlayerNames: []
    });
  },

  onOwnershipPositionChange(event: WechatMiniprogram.PickerChange) {
    const selectedOwnershipPositionIndex = Number(event.detail.value);
    const selectedOwnershipPosition = this.data.ownershipPositionOptions[selectedOwnershipPositionIndex] || "";
    const ownershipAvailablePlayers = filterOwnershipPlayers(
      this.data.ownershipPlayers,
      this.data.selectedOwnershipTeam,
      selectedOwnershipPosition
    );
    this.setData({
      selectedOwnershipPositionIndex,
      selectedOwnershipPosition,
      ownershipAvailablePlayers,
      ownershipAvailablePlayerNames: ownershipAvailablePlayers.map((player) => player.name)
    });
  },

  onOwnershipPlayerChange(event: WechatMiniprogram.PickerChange) {
    const player = this.data.ownershipAvailablePlayers[Number(event.detail.value)];
    if (!player || this.data.selectedOwnershipPlayers.some((selected) => selected.element === player.element)) {
      return;
    }
    this.setData({ selectedOwnershipPlayers: [...this.data.selectedOwnershipPlayers, player] });
    this.applyRows(this.data.rows, true);
  },

  onRemoveOwnershipPlayer(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { element: string }>) {
    const element = Number(event.currentTarget.dataset.element);
    this.setData({ selectedOwnershipPlayers: this.data.selectedOwnershipPlayers.filter((player) => player.element !== element) });
    this.applyRows(this.data.rows, true);
  },

  onClearOwnershipFilter() {
    this.setData({
      selectedOwnershipPlayers: [],
      ownershipScope: "any",
      ownershipCaptainMode: "any",
      selectedOwnershipTeamIndex: 0,
      selectedOwnershipTeam: null,
      selectedOwnershipPositionIndex: 0,
      selectedOwnershipPosition: "",
      ownershipAvailablePlayers: [],
      ownershipAvailablePlayerNames: []
    });
    this.applyRows(this.data.rows, true);
  },

  onToggleTeamExposure() {
    this.setData({ teamExposureExpanded: !this.data.teamExposureExpanded });
  },

  onTeamExposureScopeTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { scope: TournamentOwnershipScope }>) {
    this.setData({ teamExposureScope: event.currentTarget.dataset.scope });
    this.applyRows(this.data.rows, true);
  },

  onTeamExposureTeamChange(event: WechatMiniprogram.PickerChange) {
    const selectedTeamExposureIndex = Number(event.detail.value);
    const selectedTeamExposure = this.data.teamExposureTeams[selectedTeamExposureIndex];
    this.setData({ selectedTeamExposureIndex, selectedTeamExposure });
    this.applyRows(this.data.rows, true);
  },

  onTeamExposureCountTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { count: string }>) {
    this.setData({ teamExposureCount: Number(event.currentTarget.dataset.count) });
    this.applyRows(this.data.rows, true);
  },

  onClearTeamExposureFilter() {
    this.setData({
      selectedTeamExposureIndex: 0,
      selectedTeamExposure: null,
      teamExposureCount: 1,
      teamExposureScope: "any"
    });
    this.applyRows(this.data.rows, true);
  },

  loadMore() {
    if (!this.data.hasMore) {
      return;
    }
    this.applyRows(this.data.rows, false);
  },

  onOpenEntry(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { entry: string }>) {
    const entry = Number(event.currentTarget.dataset.entry);
    if (!Number.isFinite(entry) || entry <= 0) {
      return;
    }
    wx.navigateTo({ url: `${routes.liveEntry}?entry=${entry}` });
  },

  onRetry() {
    if (this.data.tournaments.length === 0) {
      this.loadTournaments(true);
      return;
    }
    this.loadRows(true);
  },

  onChooseEntry() {
    forceEntryBinding();
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      forceEntryBinding();
      return;
    }
    this.loadTournaments(true);
  },

  onEmptyResultsAction() {
    if (!this.data.resultsFiltered) {
      this.loadRows(true);
      return;
    }

    this._submittedKeyword = "";
    this.setData({
      keyword: "",
      selectedOwnershipPlayers: [],
      ownershipScope: "any",
      ownershipCaptainMode: "any",
      selectedOwnershipTeamIndex: 0,
      selectedOwnershipTeam: null,
      selectedOwnershipPositionIndex: 0,
      selectedOwnershipPosition: "",
      ownershipAvailablePlayers: [],
      ownershipAvailablePlayerNames: [],
      selectedTeamExposureIndex: 0,
      selectedTeamExposure: null,
      teamExposureCount: 1,
      teamExposureScope: "any",
      // In-memory rows may be a keyword-filtered subset, so they cannot be
      // reapplied locally; treat the cleared-filter reload as a new result
      // context instead of letting the old empty filtered view linger.
      hasContent: false
    });
    this.loadRows(false);
  }
});
