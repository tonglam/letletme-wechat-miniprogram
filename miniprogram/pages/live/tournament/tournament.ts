import { PerformancePage } from "../../../utils/performance-page";
import { getEntryPointsRaceTournament } from "../../../services/tournament.service";
import {
  getLivePointsByTournamentSnapshot,
  getLiveSnapshot,
  searchLivePointsByTournamentSnapshot
} from "../../../services/live.service";
import { getApiSessionToken } from "../../../services/auth.service";
import type { LiveSnapshotStatus, LiveTournamentRow } from "../../../models/live";
import type { TournamentOption } from "../../../models/tournament";
import { routes } from "../../../config/routes";
import { goToEntrySearch } from "../../../utils/navigation";
import { currentFollowEntryId } from "../../../utils/follow";
import {
  shouldRevalidateCachedLiveSnapshot,
  shouldPollLiveSnapshot
} from "../../../utils/live-refresh";
import {
  createLiveRefreshController,
  type LiveRefreshController
} from "../../../utils/live-refresh-controller";
import { subscribeNetworkStatus } from "../../../utils/live-network";
import {
  normalizeLiveDisplayState,
  type LiveDisplayState
} from "../../../utils/live-status";
import { durationBucket, recordLiveTransition } from "../../../utils/perf";
import { canonicalAction, openWebsiteAction } from "../../../utils/canonical-action";
import {
  filterTournamentRowsByOwnership,
  filterTournamentRowsByTeamExposure,
  getTournamentTeamOptions,
  type TournamentCaptainMode,
  type TournamentOwnershipScope,
  type TournamentTeamOption
} from "../../../services/live-tournament";
import { ensureAppContext, getAppContextSnapshot } from "../../../services/app-context.service";
import { capturePageRequestTrace } from "../../../services/graphql.service";
import type { PageRequestTrace } from "../../../services/graphql.service";

type SortKey = "livePoints" | "liveNetPoints" | "transferCost" | "played" | "totalPoints" | "overallRank" | "entryName";
type LiveTournamentEmptyState = "" | "entry" | "tournaments";

const SELECTED_TOURNAMENT_ID_KEY = "live-tournamentId";
const SELECTED_TOURNAMENT_NAME_KEY = "live-tournamentName";

export function partialTournamentErrorSuffix(retainedRowCount: number): string {
  return retainedRowCount > 0
    ? "部分球队显示上次成功结果"
    : "未成功加载的球队暂未显示";
}

export function shouldClearTournamentRowsError(failedEntryCount: number): boolean {
  return failedEntryCount === 0;
}

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
  refreshing: boolean;
  hasData: boolean;
  displayState: LiveDisplayState;
  retainedRowCount: number;
  error: string;
  errorSuffix: string;
  tournamentListError: string;
  tournamentListErrorSuffix: string;
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
  selectedTournament: TournamentOption | null;
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

interface LiveTournamentLoadOptions {
  background?: boolean;
  forceRefresh?: boolean;
  trace?: PageRequestTrace;
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

PerformancePage({
  data: {
    loading: false,
    refreshing: false,
    hasData: false,
    displayState: "fresh",
    retainedRowCount: 0,
    error: "",
    errorSuffix: "",
    tournamentListError: "",
    tournamentListErrorSuffix: "",
    emptyState: "",
    emptyEyebrow: "",
    emptyTitle: "",
    emptyDescription: "",
    emptyActionText: "",
    resultsEmptyTitle: "本轮实时排名还没生成",
    resultsEmptyDescription: "比赛开始或竞赛数据同步后会显示实时排名",
    resultsEmptyActionText: "重新加载",
    resultsFiltered: false,
    event: 0,
    maxGw: 1,
    entryId: 0,
    keyword: "",
    tournaments: [],
    tournamentNames: [],
    selectedTournamentIndex: 0,
    selectedTournament: null,
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

  rowsRequest: null as Promise<void> | null,
  rowsRequestKey: "",
  rowsRequestId: 0,
  tournamentListRequestId: 0,
  liveSnapshot: null as LiveSnapshotStatus | null,
  cachedLiveStoredAt: undefined as number | undefined,
  liveRefresh: null as LiveRefreshController | null,
  probing: false,
  networkOnline: true,
  pageVisible: false,
  hasShown: false,
  loadedSeason: undefined as string | undefined,
  failedEntryCount: 0,
  retainedRowCount: 0,
  resumeDirectoryAfterShow: false,
  resumeStartupAfterShow: false,
  startupPending: false,
  startupGeneration: 0,

  ensureContext(reason: "page-load" | "page-show" | "pull-refresh", forceRefresh = false) {
    return ensureAppContext({ reason, forceRefresh });
  },

  async onLoad() {
    this.pageVisible = true;
    const trace = capturePageRequestTrace({
      callerSurface: "live-tournament-directory",
      trigger: "load"
    });
    await this.initializeFromContext("page-load", trace);
  },

  async initializeFromContext(
    reason: "page-load" | "page-show",
    trace?: PageRequestTrace
  ) {
    const app = getApp<IAppOption>();
    const startupGeneration = ++this.startupGeneration;
    this.startupPending = true;
    // Show the loading state while waiting for shared launch data so a cold
    // open never renders placeholder content as if it were loaded.
    this.setData({ loading: true });
    let context = getAppContextSnapshot();
    try {
      context = await this.ensureContext(reason);
    } catch (error) {
      if (!context) {
        if (!this.pageVisible || this.startupGeneration !== startupGeneration) return;
        this.startupPending = false;
        this.showContextError(error);
        return;
      }
    }
    if (!context || !this.pageVisible || this.startupGeneration !== startupGeneration) return;
    this.loadedSeason = context.season || undefined;
    if (!getApiSessionToken()) {
      // With no valid session the stored follow is only offline/display
      // fallback: the account may have been linked to a different entry
      // since, so wait for the refreshed profile to re-assert it (the login
      // may not even have started while the privacy callback is pending).
      try { await app.authReady; } catch {}
    }
    if (!this.pageVisible || this.startupGeneration !== startupGeneration) return;
    const currentGw = context.currentEvent || 0;
    this.startupPending = false;
    this.resumeStartupAfterShow = false;
    this.setData({ entryId: app.globalData.entryId ?? 0, event: currentGw, maxGw: currentGw });
    this.initLiveRefresh();
    if (!this.data.entryId || currentGw > 0) {
      await this.loadTournaments(false, trace);
    } else {
      this.setData({ loading: false, error: "当前赛季暂无实时比赛周" });
    }
    this.syncDisplayState();
  },

  initLiveRefresh() {
    if (this.liveRefresh) return;
    this.liveRefresh = createLiveRefreshController({
      isEligible: () => this.shouldAutoRefresh(),
      getAcceptedSnapshot: () => this.liveSnapshot,
      probe: () => getLiveSnapshot(this.data.event),
      reload: () => this.loadRows({ background: true, forceRefresh: true }),
      acceptSnapshot: (snapshot) => {
        this.liveSnapshot = snapshot;
        // Per-entry partial errors survive an unchanged revision; only a fully
        // fresh rows payload clears them.
        if (shouldClearTournamentRowsError(this.failedEntryCount)) {
          this.setData({
            error: "",
            errorSuffix: "",
            ...(snapshot?.checkedAt ? { lastUpdated: formatTime(new Date(snapshot.checkedAt)) } : {})
          });
        } else if (snapshot?.checkedAt) {
          this.setData({ lastUpdated: formatTime(new Date(snapshot.checkedAt)) });
        }
        this.syncDisplayState();
      },
      onProbeError: (message) => {
        this.setData({
          error: message,
          errorSuffix: this.data.hasData ? "当前显示上次成功结果" : ""
        });
        this.syncDisplayState();
      },
      onProbeChange: (probing) => {
        this.probing = probing;
        this.syncDisplayState();
      },
      onOnlineChange: (online) => {
        this.networkOnline = online;
        this.syncDisplayState();
      },
      onProbeSettled: (info) => {
        recordLiveTransition({
          surface: "tournament",
          season: this.liveSnapshot?.season,
          eventId: this.data.event,
          isCurrentEvent: this.data.event === Number(getApp<IAppOption>().globalData.gw),
          snapshotState: info.snapshotState,
          revisionChanged: info.revisionChanged,
          coverageFailed: this.liveSnapshot?.coverageFailed,
          retainedRowCount: this.retainedRowCount,
          probeDurationBucket: durationBucket(info.probeDurationMs),
          fullFetchDurationBucket: info.reloadDurationMs === undefined ? undefined : durationBucket(info.reloadDurationMs)
        });
      },
      subscribeNetwork: subscribeNetworkStatus
    });
  },

  showContextError(error: unknown) {
    const message = error instanceof Error ? error.message : "赛季和比赛轮信息加载失败";
    this.setData({
      loading: false,
      refreshing: false,
      error: message,
      errorSuffix: this.data.hasData ? "当前显示上次成功结果" : ""
    });
    this.syncDisplayState();
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed && this.resumeStartupAfterShow) {
      this.resumeStartupAfterShow = false;
      const trace = capturePageRequestTrace({
        callerSurface: "live-tournament-directory",
        trigger: "show"
      });
      await this.initializeFromContext("page-show", trace);
      return;
    }
    if (resumed) {
      const app = getApp<IAppOption>();
      let context;
      try { context = await this.ensureContext("page-show"); } catch { /* keep the last known event */ }
      if (!this.pageVisible) return;
      const nextSeason = context?.season || app.globalData.season || undefined;
      const seasonChanged = Boolean(this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason);
      if (nextSeason) this.loadedSeason = nextSeason;
      const nextEventId = context?.currentEvent || 0;
      const wasCurrentEvent = this.data.event === this.data.maxGw;
      const eventContextChanged = seasonChanged || (nextEventId > 0 && nextEventId !== this.data.maxGw);
      if (eventContextChanged && (seasonChanged || wasCurrentEvent)) {
        this.liveRefresh?.stop();
        this.rowsRequestId += 1;
        this.tournamentListRequestId += 1;
        this.rowsRequest = null;
        this.rowsRequestKey = "";
        this.liveSnapshot = null;
        this.cachedLiveStoredAt = undefined;
        this.failedEntryCount = 0;
        this.retainedRowCount = 0;
        this.setData({
          event: nextEventId,
          maxGw: nextEventId,
          ...(seasonChanged ? {
              tournaments: [],
              tournamentNames: [],
              selectedTournament: null,
              ownershipPlayers: [],
              ownershipTeamOptions: [],
              ownershipTeamNames: [],
              ownershipPositionOptions: [],
              selectedOwnershipPlayers: [],
              ownershipPlayerNames: [],
              ownershipSummary: "未筛选",
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
              teamExposureScope: "any"
          } : {}),
          rows: [],
          displayedRows: [],
          hasData: false,
          lastUpdated: "",
          ...(nextEventId === 0 ? {
            error: "当前赛季暂无实时比赛周",
            tournamentListError: "",
            tournamentListErrorSuffix: "",
            emptyState: "",
            emptyEyebrow: "",
            emptyTitle: "",
            emptyDescription: "",
            emptyActionText: ""
          } : {})
        });
        this.liveRefresh?.sync();
        if (nextEventId === 0) {
          this.syncDisplayState();
          return;
        }
        if (seasonChanged) {
          await this.loadTournaments(true);
        } else {
          await this.loadRows({ forceRefresh: true });
        }
        this.syncDisplayState();
        return;
      }
      if (nextEventId > 0 && nextEventId !== this.data.maxGw) {
        this.setData({ maxGw: nextEventId });
      }
    }
    if (resumed && this.resumeDirectoryAfterShow && !this.data.selectedTournament) {
      this.resumeDirectoryAfterShow = false;
      await this.loadTournaments(false);
      return;
    }
    this.liveRefresh?.sync();
    if (!this.revalidateCachedSnapshot() && resumed && this.shouldAutoRefresh()) {
      void this.liveRefresh?.probeNow();
    }
  },

  onHide() {
    this.pageVisible = false;
    this.resumeDirectoryAfterShow = this.data.loading && !this.data.selectedTournament;
    if (this.startupPending) {
      this.resumeStartupAfterShow = true;
      this.resumeDirectoryAfterShow = false;
    }
    this.startupGeneration += 1;
    this.tournamentListRequestId += 1;
    this.liveRefresh?.stop();
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeDirectoryAfterShow = false;
    this.resumeStartupAfterShow = false;
    this.startupPending = false;
    this.startupGeneration += 1;
    this.tournamentListRequestId += 1;
    this.liveRefresh?.dispose();
  },

  onPullDownRefresh() {
    // Always re-pull the tournament list (it chains into loadRows): a cached
    // list must not hide a league the user just joined until the TTL expires.
    const task = this.retryWithContext();
    return task.finally(() => wx.stopPullDownRefresh());
  },

  async retryWithContext() {
    if (this.data.event === 0) {
      const app = getApp<IAppOption>();
      const recoveryGeneration = ++this.startupGeneration;
      this.startupPending = true;
      let context;
      try {
        context = await this.ensureContext("pull-refresh", true);
      } catch (error) {
        if (!this.pageVisible || this.startupGeneration !== recoveryGeneration) return;
        this.startupPending = false;
        this.showContextError(error);
        return;
      }
      if (!this.pageVisible || this.startupGeneration !== recoveryGeneration) return;
      const nextEventId = context.currentEvent || 0;
      this.startupPending = false;
      if (nextEventId > 0) {
        this.loadedSeason = context.season || app.globalData.season || this.loadedSeason;
        this.setData({ event: nextEventId, maxGw: nextEventId, error: "" });
        this.initLiveRefresh();
        return this.loadTournaments(true);
      }
      this.setData({ loading: false, error: "当前赛季暂无实时比赛周" });
      return;
    }
    return this.loadTournaments(true);
  },

  onReachBottom() {
    this.loadMore();
  },

  restartForPrincipalChange(entryId: number): boolean {
    const nextEntryId = currentFollowEntryId() ?? 0;
    if (nextEntryId === entryId) return false;

    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.cachedLiveStoredAt = undefined;
    this.failedEntryCount = 0;
    this.retainedRowCount = 0;
    this.rowsRequestId += 1;
    this.rowsRequest = null;
    this.rowsRequestKey = "";
    this.setData({
      entryId: nextEntryId,
      loading: false,
      refreshing: false,
      hasData: false,
      error: "",
      errorSuffix: "",
      tournamentListError: "",
      tournamentListErrorSuffix: "",
      tournaments: [],
      tournamentNames: [],
      selectedTournament: null,
      rows: [],
      displayedRows: [],
      lastUpdated: ""
    });
    void this.loadTournaments(true);
    return true;
  },

  async loadTournaments(forceRefresh = false, originatingTrace?: PageRequestTrace) {
    const trace = originatingTrace || capturePageRequestTrace({
      callerSurface: "live-tournament-directory",
      trigger: forceRefresh ? "refresh" : "load"
    });
    const entryId = this.data.entryId;
    if (!entryId) {
      this.liveRefresh?.stop();
      this.liveSnapshot = null;
      this.failedEntryCount = 0;
      this.cachedLiveStoredAt = undefined;
      this.setData({
        loading: false,
        hasData: false,
        error: "",
        errorSuffix: "",
        tournamentListError: "",
        tournamentListErrorSuffix: "",
        emptyState: "entry",
        emptyEyebrow: "需要球队",
        emptyTitle: "先选择我的球队",
        emptyDescription: "查找球队并设为我的球队后，即可加载实时竞赛。",
        emptyActionText: "去选择球队",
        tournaments: [],
        tournamentNames: [],
        selectedTournament: null,
        rows: [],
        displayedRows: []
      });
      return;
    }
    if (this.restartForPrincipalChange(entryId)) return;

    const requestId = ++this.tournamentListRequestId;

    this.setData({
      loading: true,
      error: "",
      errorSuffix: "",
      tournamentListError: "",
      tournamentListErrorSuffix: "",
      emptyState: "",
      emptyEyebrow: "",
      emptyTitle: "",
      emptyDescription: "",
      emptyActionText: ""
    });
    try {
      const tournaments = await getEntryPointsRaceTournament(entryId, forceRefresh, trace);
      if (!this.pageVisible || requestId !== this.tournamentListRequestId) return;
      if (this.restartForPrincipalChange(entryId)) return;
      if (tournaments.length === 0) {
        this.liveRefresh?.stop();
        this.liveSnapshot = null;
        this.failedEntryCount = 0;
        this.cachedLiveStoredAt = undefined;
        this.setData({
          tournaments: [],
          tournamentNames: [],
          selectedTournament: null,
          rows: [],
          displayedRows: [],
          hasData: false,
          emptyState: "tournaments",
          emptyEyebrow: "竞赛待就绪",
          emptyTitle: "当前球队还没有可查看的竞赛",
          emptyDescription: "加入一个竞赛后，或等待新赛季数据同步，再回到这里重新检查。",
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
      if (selectionChanged) {
        this.liveRefresh?.stop();
        this.liveSnapshot = null;
        this.failedEntryCount = 0;
        this.cachedLiveStoredAt = undefined;
      }
      this.setData({
        tournaments,
        tournamentNames: tournaments.map((tournament) => tournament.name),
        selectedTournamentIndex,
        selectedTournament,
        emptyState: "",
        ...(selectionChanged ? { hasData: false, rows: [], displayedRows: [], lastUpdated: "" } : {})
      });
      this.persistSelectedTournament(selectedTournament);
      if (selectedTournament.participantCount === 0 || this.data.event <= 0) {
        this.liveRefresh?.stop();
        this.liveSnapshot = null;
        this.failedEntryCount = 0;
        this.cachedLiveStoredAt = undefined;
        this.setData({
          rows: [],
          displayedRows: [],
          hasData: true,
          loading: false,
          refreshing: false,
          resultsEmptyTitle: selectedTournament.participantCount === 0
            ? "当前竞赛还没有参赛球队"
            : "当前暂无进行中的比赛周",
          resultsEmptyDescription: selectedTournament.participantCount === 0
            ? "有球队加入后再显示实时排名"
            : "比赛周开始后再显示实时排名"
        });
        return;
      }
      if (selectionChanged) {
        // Re-arm recovery before the rows request: if that request fails, a
        // visible current-event page must still retry on the next revision tick.
        this.liveRefresh?.sync();
      }
      await this.loadRows({
        background: !selectionChanged && this.data.hasData,
        forceRefresh,
        trace
      });
    } catch (error) {
      if (!this.pageVisible || requestId !== this.tournamentListRequestId) return;
      if (this.restartForPrincipalChange(entryId)) return;
      this.setData({
        tournamentListError: error instanceof Error ? error.message : "实时竞赛加载失败",
        tournamentListErrorSuffix: this.data.hasData ? "当前显示上次成功结果" : ""
      });
    } finally {
      if (this.pageVisible && requestId === this.tournamentListRequestId) {
        this.setData({ loading: false });
      }
    }
  },

  // The keyword that the in-flight/visible rows were actually requested with.
  // data.keyword is a per-keystroke draft (onKeyword fires no request), so
  // the request-context guard must track only submitted keywords — otherwise
  // a draft edit mid-flight would strand the load unsettled forever.
  _submittedKeyword: "",

  loadRows(options: LiveTournamentLoadOptions = {}): Promise<void> {
    const trace = options.trace || capturePageRequestTrace({
      callerSurface: "live-tournament-rows",
      trigger: options.forceRefresh ? "refresh" : "load"
    });
    const entryId = this.data.entryId;
    if (!entryId) {
      this.setData({ rows: [], displayedRows: [], hasMore: false });
      return Promise.resolve();
    }
    const selected = this.data.selectedTournament;
    if (!selected) {
      this.setData({ rows: [], displayedRows: [], hasMore: false });
      return Promise.resolve();
    }

    const eventId = this.data.event;
    const hasNoParticipants = selected.participantCount === 0;
    if (hasNoParticipants || !Number.isSafeInteger(eventId) || eventId <= 0) {
      this.setData({
        rows: [],
        displayedRows: [],
        hasMore: false,
        loading: false,
        refreshing: false,
        error: "",
        errorSuffix: "",
        resultsEmptyTitle: hasNoParticipants
          ? "当前竞赛还没有参赛球队"
          : "当前暂无进行中的比赛周",
        resultsEmptyDescription: hasNoParticipants
          ? "有球队加入后再显示实时排名"
          : "比赛周开始后再显示实时排名"
      });
      this.syncDisplayState();
      return Promise.resolve();
    }
    const keyword = this._submittedKeyword;
    const requestKey = `${entryId}:${selected.id}:${eventId}:${keyword}`;
    if (this.rowsRequest && this.rowsRequestKey === requestKey) {
      return this.rowsRequest;
    }

    const requestId = this.rowsRequestId + 1;
    this.rowsRequestId = requestId;
    const preserveData = options.background === true && this.data.hasData;
    if (!preserveData) {
      this.retainedRowCount = 0;
    }
    this.setData(preserveData
      ? { refreshing: true, error: "", errorSuffix: "" }
      : { loading: true, error: "", errorSuffix: "" });

    const request = (async () => {
      try {
        const liveResult = keyword
          ? await searchLivePointsByTournamentSnapshot(
              selected.id,
              eventId,
              keyword,
              options.forceRefresh === true,
              trace
            )
          : await getLivePointsByTournamentSnapshot(
              selected.id,
              eventId,
              options.forceRefresh === true,
              trace
            );
        if (requestId !== this.rowsRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;
        const refreshedRows = liveResult.data.map(normalizeRow);
        const failedEntryIds = new Set(liveResult.failedEntryIds || []);
        this.failedEntryCount = Math.max(
          failedEntryIds.size,
          liveResult.partialError ? 1 : 0
        );
        // Per-entry failures do not invalidate producer metadata. Retaining a
        // SETTLED snapshot stops expensive batch polling while the partial
        // row error remains visible and manually retryable.
        this.liveSnapshot = liveResult.snapshot;
        this.cachedLiveStoredAt = liveResult.servedStoredAt;
        const refreshedEntryIds = new Set(refreshedRows.map((row) => numberValue(row.entry)));
        const retainedRows = preserveData
          ? this.data.rows.filter((row) => (
              failedEntryIds.has(numberValue(row.entry))
              && !refreshedEntryIds.has(numberValue(row.entry))
            ))
          : [];
        this.retainedRowCount = retainedRows.length;
        this.applyRows(
          [...refreshedRows, ...retainedRows],
          true,
          liveResult.servedStoredAt || Date.now()
        );
        if (liveResult.partialError) {
          this.setData({
            error: liveResult.partialError,
            errorSuffix: partialTournamentErrorSuffix(retainedRows.length)
          });
        }
        this.liveRefresh?.sync();
        this.syncDisplayState();
      } catch (error) {
        if (requestId !== this.rowsRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;
        this.setData({
          error: error instanceof Error ? error.message : "实时竞赛加载失败",
          errorSuffix: this.data.hasData ? "当前显示上次成功结果" : ""
        });
        this.syncDisplayState();
      } finally {
        if (requestId === this.rowsRequestId) {
          this.setData({ loading: false, refreshing: false });
          this.syncDisplayState();
        }
      }
    })();

    this.rowsRequest = request;
    this.rowsRequestKey = requestKey;
    const clearRequest = () => {
      if (this.rowsRequest === request) {
        this.rowsRequest = null;
        this.rowsRequestKey = "";
        this.revalidateCachedSnapshot();
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  },

  shouldAutoRefresh(): boolean {
    if (!this.data.selectedTournament) return false;
    const currentEventId = Number(getApp<IAppOption>().globalData.gw) || 0;
    return shouldPollLiveSnapshot({
      pageVisible: this.pageVisible,
      currentEventId,
      selectedEventId: this.data.event,
      snapshot: this.liveSnapshot
    });
  },

  revalidateCachedSnapshot(): boolean {
    const currentEventId = Number(getApp<IAppOption>().globalData.gw) || 0;
    if (!shouldRevalidateCachedLiveSnapshot({
      servedStoredAt: this.cachedLiveStoredAt,
      pageVisible: this.pageVisible,
      currentEventId,
      selectedEventId: this.data.event,
      snapshot: this.liveSnapshot
    })) {
      return false;
    }
    this.cachedLiveStoredAt = undefined;
    void this.liveRefresh?.probeNow();
    return true;
  },

  syncDisplayState() {
    const next = normalizeLiveDisplayState({
      snapshot: this.liveSnapshot,
      hasData: this.data.hasData,
      loading: this.data.loading || this.data.refreshing,
      probing: this.probing,
      lastError: this.data.error,
      online: this.networkOnline,
      partialFailedCount: this.failedEntryCount
    });
    if (next !== this.data.displayState) {
      recordLiveTransition({
        surface: "tournament",
        season: this.liveSnapshot?.season,
        eventId: this.data.event,
        isCurrentEvent: this.data.event === Number(getApp<IAppOption>().globalData.gw),
        displayState: next,
        retainedRowCount: this.retainedRowCount
      });
    }
    this.setData({
      displayState: next,
      retainedRowCount: this.retainedRowCount
    });
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
      hasData: true,
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
        : "比赛开始或竞赛数据同步后会显示实时排名",
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
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.failedEntryCount = 0;
    this.cachedLiveStoredAt = undefined;
    this._submittedKeyword = event ? event.detail.keyword : this.data.keyword;
    if (event) {
      this.setData({ keyword: event.detail.keyword, hasData: false, lastUpdated: "" });
    } else {
      this.setData({ hasData: false, lastUpdated: "" });
    }
    this.liveRefresh?.sync();
    this.loadRows();
  },

  onResetSearch() {
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.failedEntryCount = 0;
    this.cachedLiveStoredAt = undefined;
    this._submittedKeyword = "";
    this.setData({ keyword: "", hasData: false, lastUpdated: "" });
    this.liveRefresh?.sync();
    this.loadRows();
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.failedEntryCount = 0;
    this.cachedLiveStoredAt = undefined;
    this.setData({
      event: event.detail.value,
      hasData: false,
      rows: [],
      displayedRows: [],
      lastUpdated: ""
    });
    this.liveRefresh?.sync();
    this.loadRows();
  },

  onTournamentChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const selectedTournamentIndex = Number(event.detail.value);
    const selectedTournament = this.data.tournaments[selectedTournamentIndex];
    if (!selectedTournament) return;
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.failedEntryCount = 0;
    this.cachedLiveStoredAt = undefined;
    this.setData({
      selectedTournamentIndex,
      selectedTournament,
      rows: [],
      displayedRows: [],
      hasData: false,
      lastUpdated: ""
    });
    this.persistSelectedTournament(selectedTournament);
    this.liveRefresh?.sync();
    this.loadRows();
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
    if (this.data.event === 0) {
      if (this.retryWithContext) {
        this.retryWithContext();
      } else {
        this.loadTournaments(true);
      }
      return;
    }
    if (this.data.tournamentListError || this.data.tournaments.length === 0) {
      this.loadTournaments(true);
      return;
    }
    this.loadRows({ forceRefresh: true });
  },

  onChooseEntry() {
    goToEntrySearch();
  },

  async onCopyCompetitionLink() {
    // Competition creation and management live on the Website; web-view is
    // unavailable to this Mini Program, so the handoff is a copied link.
    await openWebsiteAction(canonicalAction("MANAGE_COMPETITION"));
  },

  onEmptyAction() {
    if (this.data.emptyState === "entry") {
      goToEntrySearch();
      return;
    }
    this.loadTournaments(true);
  },

  onEmptyResultsAction() {
    if (!this.data.resultsFiltered) {
      this.loadRows({ forceRefresh: true });
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
      hasData: false,
      lastUpdated: ""
    });
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.failedEntryCount = 0;
    this.cachedLiveStoredAt = undefined;
    this.liveRefresh?.sync();
    this.loadRows();
  }
});
