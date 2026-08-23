import { PerformancePage } from "../../../utils/performance-page";
import { getEntryPointsRaceTournament } from "../../../services/tournament.service";
import {
  getLivePointsByTournamentSnapshot,
  getLiveSnapshot,
  searchLivePointsByTournamentSnapshot,
} from "../../../services/live.service";
import { getApiSessionToken } from "../../../services/auth.service";
import {
  boardRowsToLiveRows,
  clearOtherLiveBoardLastGood,
  getEntryLiveCompetitionBoardPage,
  getTournamentEntrySquads,
  getTournamentSelectionIndex,
  hasLiveBoardErrorCode,
  isLiveBoardSchemaUnavailableError,
  liveBoardLastGoodKey,
  liveBoardSessionKey,
  readLiveBoardLastGood,
  writeLiveBoardLastGood,
  type LiveBoardPage,
  type LiveBoardPickScope,
  type LiveBoardSelectionIndexRow,
  type LiveBoardSort,
  type LiveBoardVariables,
} from "../../../services/live-board.service";
import type {
  LiveSnapshotStatus,
  LiveTournamentRow,
} from "../../../models/live";
import type { TournamentOption } from "../../../models/tournament";
import { routes } from "../../../config/routes";
import { goToEntrySearch } from "../../../utils/navigation";
import { currentFollowEntryId } from "../../../utils/follow";
import {
  shouldRevalidateCachedLiveSnapshot,
  shouldPollLiveSnapshot,
} from "../../../utils/live-refresh";
import {
  createLiveRefreshController,
  type LiveRefreshController,
} from "../../../utils/live-refresh-controller";
import { subscribeNetworkStatus } from "../../../utils/live-network";
import {
  normalizeLiveDisplayState,
  type LiveDisplayState,
} from "../../../utils/live-status";
import { durationBucket, recordLiveTransition } from "../../../utils/perf";
import {
  canonicalAction,
  openWebsiteAction,
} from "../../../utils/canonical-action";
import {
  buildTournamentLineupComparison,
  copyShareText,
  formatLiveTournamentShareText,
  type TournamentCompareLineupRow,
} from "../../../utils/live-share";
import { miniLogger } from "../../../utils/logger";
import {
  filterTournamentRowsByOwnership,
  filterTournamentRowsByTeamExposure,
  getTournamentTeamOptions,
  mergeUnavailableTournamentEntryIds,
  officialTournamentTotalPoints,
  tournamentManagerScoreStatus,
  type TournamentCaptainMode,
  type TournamentOwnershipScope,
  type TournamentTeamOption,
} from "../../../services/live-tournament";
import {
  ensureAppContext,
  getAppContextSnapshot,
} from "../../../services/app-context.service";
import { capturePageRequestTrace } from "../../../services/graphql.service";
import type { PageRequestTrace } from "../../../services/graphql.service";
import { formatAverageNumber } from "../../../utils/summary-format";
type SortKey =
  | "livePoints"
  | "liveNetPoints"
  | "transferCost"
  | "played"
  | "totalPoints"
  | "overallRank"
  | "entryName";
type LiveTournamentEmptyState = "" | "entry" | "tournaments" | "preseason";

const SELECTED_TOURNAMENT_ID_KEY = "live-tournamentId";
const SELECTED_TOURNAMENT_NAME_KEY = "live-tournamentName";
const CHIP_VALUES = ["TC", "BB", "WC", "FH"];

export function partialTournamentErrorSuffix(retainedRowCount: number): string {
  return retainedRowCount > 0
    ? "部分球队显示上次成功结果"
    : "未成功加载的球队暂未显示";
}

export function shouldClearTournamentRowsError(
  failedEntryCount: number,
): boolean {
  return failedEntryCount === 0;
}

export function noLiveEventState() {
  return {
    loading: false,
    refreshing: false,
    hasData: false,
    error: "",
    errorSuffix: "",
    tournamentListError: "",
    tournamentListErrorSuffix: "",
    emptyState: "preseason" as const,
    emptyEyebrow: "赛季准备中",
    emptyTitle: "当前赛季暂无实时比赛周",
    emptyDescription: "比赛周开始后，这里会显示赛事实时得分和排名",
    emptyActionText: "",
    rowCount: 0,
    displayedRows: [] as DisplayTournamentRow[],
    filteredCount: 0,
    lastUpdated: "",
    scoreStatusText: "正在确认官方分数",
    scoreNextRefreshAt: "",
  };
}

interface SortOption {
  key: SortKey;
  label: string;
}

interface DisplayTournamentRow extends LiveTournamentRow {
  visibleRank: number;
  eventPointsKnown: boolean;
  totalPointsKnown: boolean;
  netPointsKnown: boolean;
  displayLive: string;
  displayNet: string;
  displayTotal: string;
  displayHit: string;
  metaText: string;
  chipCode: string;
  displayCaptain: string;
  playedText: string;
  isMe: boolean;
  pinned: boolean;
  compared: boolean;
  compareDisabled: boolean;
}

interface OwnershipPlayerOption {
  element: number;
  teamId?: number;
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
  rowCount: number;
  displayedRows: DisplayTournamentRow[];
  sortOptions: SortOption[];
  sortKey: SortKey;
  sortDesc: boolean;
  filteredCount: number;
  ownershipExpanded: boolean;
  ownershipScope: TournamentOwnershipScope;
  ownershipCaptainMode: TournamentCaptainMode;
  ownershipSearch: string;
  ownershipSearchResults: OwnershipPlayerOption[];
  ownershipMatchedText: string;
  teamExposureMatchedText: string;
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
  teamExposureRules: Array<{
    teamId?: number;
    teamShortName: string;
    name: string;
    count: number;
  }>;
  pendingExposureTeamIndex: number;
  pendingExposureTeam: TournamentTeamOption | null;
  teamExposureCountNames: string[];
  teamExposureSummary: string;
  pageSize: number;
  hasMore: boolean;
  lastUpdated: string;
  scoreStatusText: string;
  scoreNextRefreshAt: string;
  columns: Array<{ key: string; label: string }>;
  highestText: string;
  averageText: string;
  entriesText: string;
  chipFilters: string[];
  chipOptions: Array<{ value: string; label: string; on: boolean }>;
  captainFilters: number[];
  captainOptions: Array<{ element: number; name: string; on: boolean }>;
  captainValues: string[];
  captainFilterNames: string[];
  filterOptionsLoading: boolean;
  filterOptionsError: string;
  filterSheetOpen: boolean;
  activeFilterCount: number;
  compareMode: boolean;
  compareIds: number[];
  compareHint: string;
  compareOpen: boolean;
  compareLoading: boolean;
  compareError: string;
  compareLeft: DisplayTournamentRow | null;
  compareRight: DisplayTournamentRow | null;
  compareLineupRows: TournamentCompareLineupRow[];
  compareLeftPickCount: number;
  compareRightPickCount: number;
  shareLabel: string;
  shareCopied: boolean;
  shareSheetOpen: boolean;
  shareText: string;
}

interface LiveTournamentLoadOptions {
  background?: boolean;
  forceRefresh?: boolean;
  propagateError?: boolean;
  trace?: PageRequestTrace;
}

interface BoardControlState {
  submittedKeyword: string;
  keyword: string;
  sortKey: SortKey;
  sortDesc: boolean;
  chipFilters: string[];
  captainFilters: number[];
  ownershipScope: TournamentOwnershipScope;
  ownershipCaptainMode: TournamentCaptainMode;
  selectedOwnershipPlayers: OwnershipPlayerOption[];
  teamExposureScope: TournamentOwnershipScope;
  teamExposureRules: LiveTournamentData["teamExposureRules"];
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

function exactUpdatedTime(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function formatBoardAveragePoints(
  value: number | null | undefined,
): string {
  return value == null ? "—" : formatAverageNumber(value);
}

function boardSortOf(key: SortKey): LiveBoardSort {
  switch (key) {
    case "liveNetPoints":
      return "NET_EVENT_POINTS";
    case "transferCost":
      return "TRANSFER_COST";
    case "played":
      return "PLAYED";
    case "totalPoints":
      return "TOTAL_POINTS";
    case "overallRank":
      return "OVERALL_RANK";
    case "entryName":
      return "ENTRY_NAME";
    case "livePoints":
    default:
      return "EVENT_POINTS";
  }
}

function boardScopeOf(scope: TournamentOwnershipScope): LiveBoardPickScope {
  return scope === "starter" ? "STARTER" : scope === "bench" ? "BENCH" : "ANY";
}

function boardChipOf(code: string): string {
  if (code === "TC") return "TRIPLE_CAPTAIN";
  if (code === "BB") return "BENCH_BOOST";
  if (code === "WC") return "WILDCARD";
  if (code === "FH") return "FREE_HIT";
  return code;
}

function managerStatusFromBoard(page: LiveBoardPage, lastGood: boolean): string {
  if (lastGood || page.managerDataAvailability === "LAST_GOOD") {
    return "官方数据延迟";
  }
  if (
    page.managerDataAvailability === "PARTIAL" ||
    (page.officialCoverage > 0 && page.officialCoverage < 1)
  ) {
    const available = Math.round(page.officialCoverage * page.totalEntries);
    return available > 0
      ? `部分可用：${available}/${page.totalEntries} 支球队已有官方分数`
      : "部分可用";
  }
  if (
    page.managerDataAvailability === "UNAVAILABLE" ||
    page.officialCoverage === 0
  ) {
    return "官方分数不可用";
  }
  return "官方实时";
}

function playerOptionsFromSelectionIndex(
  rows: LiveBoardSelectionIndexRow[],
): OwnershipPlayerOption[] {
  return rows
    .map((row) => ({
      element: row.playerId,
      teamId: row.teamId,
      name: row.playerName,
      meta: `${row.teamShortName}${row.position ? ` · ${row.position}` : ""}`,
      teamShortName: row.teamShortName,
      teamName: row.teamName,
      position: row.position,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function teamOptionsFromSelectionIndex(
  rows: LiveBoardSelectionIndexRow[],
): TournamentTeamOption[] {
  const teams = new Map<number, TournamentTeamOption>();
  rows.forEach((row) => {
    teams.set(row.teamId, {
      id: row.teamId,
      shortName: row.teamShortName,
      name: row.teamName,
    });
  });
  return [...teams.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function chipCodeOf(raw: unknown): string {
  const value = String(raw || "")
    .toUpperCase()
    .replace(/[\s_-]/g, "");
  if (!value || value === "无" || value === "NONE" || value === "NULL")
    return "";
  if (
    value === "TRIPLECAPTAIN" ||
    value === "TC" ||
    value === "3XC" ||
    value === "3C"
  )
    return "TC";
  if (value === "BENCHBOOST" || value === "BB") return "BB";
  if (value === "WILDCARD" || value === "WC") return "WC";
  if (value === "FREEHIT" || value === "FH") return "FH";
  return "";
}

function normalizeRow(row: LiveTournamentRow): DisplayTournamentRow {
  const officialEventPoints = row.score?.eventPoints;
  const eventPointsKnown = typeof officialEventPoints === "number";
  const livePoints = numberValue(officialEventPoints);
  const netPointsKnown = row.score?.netEventPoints != null;
  const liveNetPoints = netPointsKnown
    ? numberValue(row.score?.netEventPoints)
    : 0;
  const officialTotalPoints = officialTournamentTotalPoints(row.score);
  const totalPoints = numberValue(officialTotalPoints);
  const totalPointsKnown = officialTotalPoints !== undefined;
  const transferCost = numberValue(row.transferCost);
  const played = numberValue(row.played);
  const toPlay = numberValue(row.toPlay);
  const chip = textValue(row.chip, "无");
  const captain = textValue(row.captainName, "无队长");
  const chipCode = chipCodeOf(row.chip);

  return {
    ...row,
    netPointsKnown,
    eventPointsKnown,
    totalPointsKnown,
    livePoints,
    liveNetPoints,
    totalPoints,
    transferCost,
    overallRank: row.overallRank ?? row.rank,
    visibleRank: 0,
    displayLive: eventPointsKnown ? `${livePoints}` : "—",
    displayNet: netPointsKnown ? `${liveNetPoints}` : "—",
    displayTotal: totalPointsKnown ? `${totalPoints}` : "—",
    displayHit: transferCost > 0 ? `-${transferCost}` : "0",
    metaText: `队长 ${captain} · 开卡 ${chip} · 转会扣分 ${transferCost} · ${played}/${played + toPlay}`,
    chipCode,
    displayCaptain: captain && captain !== "无队长" ? `${captain} (C)` : "",
    playedText: `${played}/${played + toPlay}`,
    isMe: false,
    pinned: false,
    compared: false,
    compareDisabled: false,
  };
}

function compareHintText(count: number): string {
  if (count >= 2) return "已选 2 支";
  if (count === 1) return "再选 1 支";
  return "勾选 2 支队伍";
}

function emptyCompareState() {
  return {
    compareMode: false,
    compareIds: [] as number[],
    compareHint: compareHintText(0),
    compareOpen: false,
    compareLoading: false,
    compareError: "",
    compareLeft: null as DisplayTournamentRow | null,
    compareRight: null as DisplayTournamentRow | null,
    compareLineupRows: [] as TournamentCompareLineupRow[],
    compareLeftPickCount: 0,
    compareRightPickCount: 0,
    filterSheetOpen: false,
    shareSheetOpen: false,
    shareText: "",
  };
}

function compareSelectionState(
  rows: readonly DisplayTournamentRow[],
  compareIds: readonly number[],
) {
  const compareLeft = compareIds[0]
    ? rows.find((row) => row.entry === compareIds[0]) || null
    : null;
  const compareRight = compareIds[1]
    ? rows.find((row) => row.entry === compareIds[1]) || null
    : null;
  const lineup = buildTournamentLineupComparison(
    compareLeft?.picks,
    compareRight?.picks,
  );
  return {
    compareLeft,
    compareRight,
    compareLineupRows: lineup.rows,
    compareLeftPickCount: lineup.leftCount,
    compareRightPickCount: lineup.rightCount,
  };
}

export function buildTournamentStats(rows: DisplayTournamentRow[]) {
  if (rows.length === 0) {
    return { highestText: "—", averageText: "—", entriesText: "0" };
  }
  const points = rows
    .filter((row) => row.eventPointsKnown)
    .map((row) => numberValue(row.livePoints));
  if (points.length === 0) {
    return {
      highestText: "—",
      averageText: "—",
      entriesText: String(rows.length),
    };
  }
  const highest = Math.max(...points);
  const average = points.reduce((sum, value) => sum + value, 0) / points.length;
  return {
    highestText: String(highest),
    averageText: formatAverageNumber(average),
    entriesText: String(rows.length),
  };
}

function takeVisibleWithPinMe(
  rows: DisplayTournamentRow[],
  size: number,
  entryId?: number,
): DisplayTournamentRow[] {
  const top = rows.slice(0, size);
  if (!entryId) return top;
  const me = rows.find((row) => row.entry === entryId);
  if (!me || top.some((row) => row.entry === me.entry)) return top;
  return [...top, { ...me, pinned: true, isMe: true }];
}

function sortRows(
  rows: DisplayTournamentRow[],
  key: SortKey,
  desc: boolean,
): DisplayTournamentRow[] {
  const direction = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (key === "entryName") {
      return (
        textValue(a.entryName, "").localeCompare(textValue(b.entryName, "")) *
        direction
      );
    }
    const fallback = key === "overallRank" ? Number.MAX_SAFE_INTEGER : 0;
    const left = numberValue(a[key], fallback);
    const right = numberValue(b[key], fallback);
    const compared =
      left === right
        ? numberValue(a.entry, Number.MAX_SAFE_INTEGER) -
          numberValue(b.entry, Number.MAX_SAFE_INTEGER)
        : left - right;
    return compared * direction;
  });
}

function formatTeamName(team: TournamentTeamOption): string {
  return `${team.name}${team.shortName === team.name ? "" : ` (${team.shortName})`}`;
}

function collectOwnershipPlayers(
  rows: DisplayTournamentRow[],
): OwnershipPlayerOption[] {
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
        position,
      });
    });
  });
  return [...players.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function collectOwnershipPositions(
  players: OwnershipPlayerOption[],
  selectedTeam?: TournamentTeamOption | null,
): string[] {
  if (!selectedTeam) {
    return [];
  }
  return [
    ...new Set(
      players
        .filter((player) => player.teamShortName === selectedTeam.shortName)
        .map((player) => player.position)
        .filter((position) => position),
    ),
  ].sort();
}

/** Name-first player lookup (web PlayerDirectoryPicker): instant substring match over the tournament pool. */
function computeOwnershipSearchResults(
  players: OwnershipPlayerOption[],
  query: string,
  selected: OwnershipPlayerOption[],
): OwnershipPlayerOption[] {
  const term = String(query || "")
    .trim()
    .toLowerCase();
  if (!term) {
    return [];
  }
  const chosen = new Set(selected.map((player) => player.element));
  return players.filter(
    (player) =>
      !chosen.has(player.element) && player.name.toLowerCase().includes(term),
  );
}

function filterOwnershipPlayers(
  players: OwnershipPlayerOption[],
  selectedTeam?: TournamentTeamOption | null,
  selectedPosition = "",
): OwnershipPlayerOption[] {
  if (!selectedTeam || !selectedPosition) {
    return [];
  }
  return players.filter(
    (player) =>
      player.teamShortName === selectedTeam.shortName &&
      player.position === selectedPosition,
  );
}

function clearTournamentBoard(page: object): void {
  const board = page as {
    rows?: DisplayTournamentRow[];
    ownershipPlayers?: OwnershipPlayerOption[];
    shareRows?: DisplayTournamentRow[];
    officialCoverage?: number;
    officialTotalEntries?: number;
    unavailableEntryIds?: number[];
    boardPage?: LiveBoardPage | null;
    usingLegacyBoard?: boolean;
    selectionIndexKey?: string;
    selectionIndexRequestId?: number;
    compareRequestId?: number;
    boardControlRequestId?: number;
  };
  board.rows = [];
  board.ownershipPlayers = [];
  board.shareRows = [];
  board.officialCoverage = undefined;
  board.officialTotalEntries = undefined;
  board.unavailableEntryIds = [];
  board.boardPage = null;
  board.usingLegacyBoard = false;
  board.selectionIndexKey = "";
  board.selectionIndexRequestId = (board.selectionIndexRequestId || 0) + 1;
  board.compareRequestId = (board.compareRequestId || 0) + 1;
  board.boardControlRequestId = (board.boardControlRequestId || 0) + 1;
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
    resultsEmptyDescription: "比赛开始或赛事数据同步后会显示实时排名",
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
    rowCount: 0,
    displayedRows: [],
    sortOptions: [
      { key: "livePoints", label: "GW" },
      { key: "liveNetPoints", label: "净分" },
      { key: "transferCost", label: "扣分" },
      { key: "played", label: "出场" },
      { key: "totalPoints", label: "总分" },
    ],
    sortKey: "livePoints",
    sortDesc: true,
    filteredCount: 0,
    ownershipExpanded: false,
    ownershipScope: "any",
    ownershipCaptainMode: "any",
    ownershipSearch: "",
    ownershipSearchResults: [],
    ownershipMatchedText: "",
    teamExposureMatchedText: "",
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
    teamExposureRules: [],
    pendingExposureTeamIndex: 0,
    pendingExposureTeam: null,
    teamExposureCountNames: Array.from({ length: 15 }, (_, index) => `${index + 1} 人`),
    teamExposureSummary: "未筛选",
    pageSize: 20,
    hasMore: false,
    lastUpdated: "",
    scoreStatusText: "正在确认官方分数",
    scoreNextRefreshAt: "",
    columns: [
      { key: "rank", label: "序" },
      { key: "entryName", label: "球队" },
      { key: "livePoints", label: "GW" },
      { key: "totalPoints", label: "总分" },
    ],
    highestText: "—",
    averageText: "—",
    entriesText: "0",
    chipFilters: [],
    chipOptions: CHIP_VALUES.map((value) => ({
      value,
      label: value,
      on: false,
    })),
    captainFilters: [],
    captainOptions: [],
    captainValues: [],
    captainFilterNames: [],
    filterOptionsLoading: false,
    filterOptionsError: "",
    filterSheetOpen: false,
    activeFilterCount: 0,
    compareMode: false,
    compareIds: [],
    compareHint: compareHintText(0),
    compareOpen: false,
    compareLoading: false,
    compareError: "",
    compareLeft: null,
    compareRight: null,
    compareLineupRows: [],
    compareLeftPickCount: 0,
    compareRightPickCount: 0,
    shareLabel: "分享文字",
    shareCopied: false,
    shareSheetOpen: false,
    shareText: "",
  } as LiveTournamentData,

  rowsRequest: null as Promise<void> | null,
  rowsRequestKey: "",
  rowsRequestId: 0,
  rows: [] as DisplayTournamentRow[],
  ownershipPlayers: [] as OwnershipPlayerOption[],
  shareRows: [] as DisplayTournamentRow[],
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
  officialCoverage: undefined as number | undefined,
  officialTotalEntries: undefined as number | undefined,
  unavailableEntryIds: [] as number[],
  boardPage: null as LiveBoardPage | null,
  usingLegacyBoard: false,
  selectionIndexKey: "",
  selectionIndexRequestId: 0,
  compareRequestId: 0,
  boardControlRequestId: 0,
  committedBoardControls: null as BoardControlState | null,
  resumeDirectoryAfterShow: false,
  resumeDirectoryForceRefresh: false,
  resumeStartupAfterShow: false,
  resumeStartupForceRefresh: false,
  resumeRowsAfterShow: false,
  directoryRequestPending: false,
  directoryRequestForceRefresh: false,
  startupPending: false,
  startupForceRefresh: false,
  startupGeneration: 0,
  shareCopiedTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  shareRequest: null as Promise<void> | null,

  ensureContext(
    reason: "page-load" | "page-show" | "pull-refresh",
    forceRefresh = false,
  ) {
    return ensureAppContext({ reason, forceRefresh });
  },

  async onLoad() {
    this.pageVisible = true;
    const trace = capturePageRequestTrace({
      callerSurface: "live-tournament-directory",
      trigger: "load",
    });
    await this.initializeFromContext("page-load", trace);
  },

  async initializeFromContext(
    reason: "page-load" | "page-show",
    trace?: PageRequestTrace,
    forceRefresh = false,
  ) {
    const app = getApp<IAppOption>();
    const startupGeneration = ++this.startupGeneration;
    this.startupPending = true;
    this.startupForceRefresh = forceRefresh;
    // Show the loading state while waiting for shared launch data so a cold
    // open never renders placeholder content as if it were loaded.
    this.setData({ loading: true });
    let context = getAppContextSnapshot();
    try {
      context = await this.ensureContext(reason, forceRefresh);
    } catch (error) {
      if (!context) {
        if (!this.pageVisible || this.startupGeneration !== startupGeneration)
          return;
        this.startupPending = false;
        this.showContextError(error);
        return;
      }
    }
    if (
      !context ||
      !this.pageVisible ||
      this.startupGeneration !== startupGeneration
    )
      return;
    this.loadedSeason = context.season || undefined;
    if (!getApiSessionToken()) {
      // With no valid session the stored follow is only offline/display
      // fallback: the account may have been linked to a different entry
      // since, so wait for the refreshed profile to re-assert it (the login
      // may not even have started while the privacy callback is pending).
      try {
        await app.authReady;
      } catch {}
    }
    if (!this.pageVisible || this.startupGeneration !== startupGeneration)
      return;
    const liveWindow = await getLiveSnapshot().catch(() => null);
    this.liveSnapshot = liveWindow;
    const currentGw =
      liveWindow &&
      (liveWindow.windowState !== "PRESEASON" || context.currentEvent)
        ? liveWindow.eventId
        : context.currentEvent || 0;
    this.startupPending = false;
    this.resumeStartupAfterShow = false;
    this.setData({
      entryId: app.globalData.entryId ?? 0,
      event: currentGw,
      maxGw: currentGw,
    });
    this.initLiveRefresh();
    if (!this.data.entryId || currentGw > 0) {
      await this.loadTournaments(forceRefresh, trace);
    } else {
      this.liveRefresh?.stop();
      clearTournamentBoard(this);
      this.setData(noLiveEventState());
    }
    this.syncDisplayState();
  },

  initLiveRefresh() {
    if (this.liveRefresh) return;
    this.liveRefresh = createLiveRefreshController({
      isEligible: () => this.shouldAutoRefresh(),
      getAcceptedSnapshot: () => this.liveSnapshot,
      probe: () => getLiveSnapshot(),
      shouldReloadOnUnchangedProbe: () =>
        Boolean(
          this.data.scoreStatusText === "结算中" ||
          (this.data.scoreNextRefreshAt &&
            Date.parse(this.data.scoreNextRefreshAt) <= Date.now()),
        ),
      getNextRefreshAt: () =>
        this.data.scoreNextRefreshAt ||
        this.liveSnapshot?.nextRefreshAt ||
        null,
      reload: () => this.loadRows({ background: true, forceRefresh: true }),
      acceptSnapshot: (snapshot) => {
        this.liveSnapshot = snapshot;
        // Per-entry partial errors survive an unchanged revision; only a fully
        // fresh rows payload clears them.
        if (shouldClearTournamentRowsError(this.failedEntryCount)) {
          this.setData({
            error: "",
            errorSuffix: "",
            ...(this.usingLegacyBoard && snapshot?.checkedAt
              ? { lastUpdated: formatTime(new Date(snapshot.checkedAt)) }
              : {}),
          });
        } else if (this.usingLegacyBoard && snapshot?.checkedAt) {
          this.setData({
            lastUpdated: formatTime(new Date(snapshot.checkedAt)),
          });
        }
        this.syncDisplayState();
      },
      onProbeError: (message) => {
        this.setData({
          error: message,
          errorSuffix: this.data.hasData ? "当前显示上次成功结果" : "",
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
          isCurrentEvent:
            this.data.event === Number(getApp<IAppOption>().globalData.gw),
          snapshotState: info.snapshotState,
          revisionChanged: info.revisionChanged,
          coverageFailed: this.liveSnapshot?.coverageFailed,
          retainedRowCount: this.retainedRowCount,
          probeDurationBucket: durationBucket(info.probeDurationMs),
          fullFetchDurationBucket:
            info.reloadDurationMs === undefined
              ? undefined
              : durationBucket(info.reloadDurationMs),
        });
      },
      subscribeNetwork: subscribeNetworkStatus,
    });
  },

  showContextError(error: unknown) {
    const message =
      error instanceof Error ? error.message : "赛季和比赛轮信息加载失败";
    this.setData({
      loading: false,
      refreshing: false,
      error: message,
      errorSuffix: this.data.hasData ? "当前显示上次成功结果" : "",
      ...(this.data.emptyState === "preseason"
        ? {
            emptyState: "",
            emptyEyebrow: "",
            emptyTitle: "",
            emptyDescription: "",
            emptyActionText: "",
          }
        : {}),
    });
    this.syncDisplayState();
  },

  async onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (resumed && this.resumeStartupAfterShow) {
      const forceRefresh = this.resumeStartupForceRefresh;
      this.resumeStartupAfterShow = false;
      this.resumeStartupForceRefresh = false;
      const trace = capturePageRequestTrace({
        callerSurface: "live-tournament-directory",
        trigger: "show",
      });
      await this.initializeFromContext("page-show", trace, forceRefresh);
      return;
    }
    if (resumed) {
      const app = getApp<IAppOption>();
      let context;
      try {
        context = await this.ensureContext("page-show");
      } catch {
        /* keep the last known event */
      }
      if (!this.pageVisible) return;
      const nextSeason = context?.season || app.globalData.season || undefined;
      const seasonChanged = Boolean(
        this.loadedSeason && nextSeason && this.loadedSeason !== nextSeason,
      );
      if (nextSeason) this.loadedSeason = nextSeason;
      const nextEventId = context?.currentEvent || 0;
      const wasCurrentEvent = this.data.event === this.data.maxGw;
      const leavingPreseason =
        nextEventId > 0 && this.data.emptyState === "preseason";
      const eventContextChanged =
        seasonChanged || (nextEventId > 0 && nextEventId !== this.data.maxGw);
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
        clearTournamentBoard(this);
        const eventState =
          nextEventId === 0
            ? noLiveEventState()
            : {
                rowCount: 0,
                displayedRows: [] as DisplayTournamentRow[],
                hasData: false,
                lastUpdated: "",
                ...(leavingPreseason
                  ? {
                      error: "",
                      errorSuffix: "",
                      tournamentListError: "",
                      tournamentListErrorSuffix: "",
                      emptyState: "" as const,
                      emptyEyebrow: "",
                      emptyTitle: "",
                      emptyDescription: "",
                      emptyActionText: "",
                    }
                  : {}),
              };
        this.setData({
          event: nextEventId,
          maxGw: nextEventId,
          ...emptyCompareState(),
          ...(seasonChanged
            ? {
                tournaments: [],
                tournamentNames: [],
                selectedTournament: null,
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
                ownershipSearch: "",
                ownershipSearchResults: [],
                ownershipMatchedText: "",
                teamExposureMatchedText: "",
                teamExposureRules: [],
                pendingExposureTeamIndex: 0,
                pendingExposureTeam: null,
                teamExposureScope: "any",
                activeFilterCount: 0,
              }
            : {}),
          ...eventState,
        });
        this.liveRefresh?.sync();
        if (nextEventId === 0) {
          this.syncDisplayState();
          return;
        }
        if (
          seasonChanged ||
          leavingPreseason ||
          !this.data.selectedTournament
        ) {
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
    if (resumed && this.resumeDirectoryAfterShow) {
      const forceRefresh = this.resumeDirectoryForceRefresh;
      this.resumeDirectoryAfterShow = false;
      this.resumeDirectoryForceRefresh = false;
      this.resumeRowsAfterShow = false;
      await this.loadTournaments(forceRefresh);
      return;
    }
    if (resumed && this.resumeRowsAfterShow && this.data.selectedTournament) {
      this.resumeRowsAfterShow = false;
      await this.loadRows({
        background: this.data.hasData,
        forceRefresh: true,
      });
      return;
    }
    this.liveRefresh?.sync();
    if (
      !this.revalidateCachedSnapshot() &&
      resumed &&
      this.shouldAutoRefresh()
    ) {
      void this.liveRefresh?.probeNow();
    }
  },

  onHide() {
    this.pageVisible = false;
    if (this.directoryRequestPending) {
      this.resumeDirectoryAfterShow = true;
      this.resumeDirectoryForceRefresh = this.directoryRequestForceRefresh;
    }
    this.resumeRowsAfterShow =
      this.resumeRowsAfterShow ||
      (!this.resumeDirectoryAfterShow &&
        Boolean(this.rowsRequest && this.data.selectedTournament));
    if (this.startupPending) {
      this.resumeStartupAfterShow = true;
      this.resumeStartupForceRefresh = this.startupForceRefresh;
    }
    this.startupGeneration += 1;
    this.tournamentListRequestId += 1;
    this.directoryRequestPending = false;
    this.directoryRequestForceRefresh = false;
    this.rowsRequestId += 1;
    this.rowsRequest = null;
    this.rowsRequestKey = "";
    this.liveRefresh?.stop();
    this.clearShareCopiedTimer();
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeDirectoryAfterShow = false;
    this.resumeDirectoryForceRefresh = false;
    this.resumeStartupAfterShow = false;
    this.resumeRowsAfterShow = false;
    this.directoryRequestPending = false;
    this.directoryRequestForceRefresh = false;
    this.startupPending = false;
    this.startupGeneration += 1;
    this.tournamentListRequestId += 1;
    this.rowsRequestId += 1;
    this.rowsRequest = null;
    this.rowsRequestKey = "";
    this.liveRefresh?.dispose();
    this.clearShareCopiedTimer();
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
      this.startupForceRefresh = true;
      let context;
      try {
        context = await this.ensureContext("pull-refresh", true);
      } catch (error) {
        if (!this.pageVisible || this.startupGeneration !== recoveryGeneration)
          return;
        this.startupPending = false;
        this.showContextError(error);
        return;
      }
      if (!this.pageVisible || this.startupGeneration !== recoveryGeneration)
        return;
      const nextEventId = context.currentEvent || 0;
      this.startupPending = false;
      if (nextEventId > 0) {
        this.loadedSeason =
          context.season || app.globalData.season || this.loadedSeason;
        this.setData({ event: nextEventId, maxGw: nextEventId, error: "" });
        this.initLiveRefresh();
        return this.loadTournaments(true);
      }
      this.liveRefresh?.stop();
      clearTournamentBoard(this);
      this.setData(noLiveEventState());
      return;
    }
    return this.loadTournaments(true);
  },

  onReachBottom() {
    this.loadMore();
  },

  resetBoardRows() {
    clearTournamentBoard(this);
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
    clearTournamentBoard(this);
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
      rowCount: 0,
      displayedRows: [],
      lastUpdated: "",
      scoreStatusText: "正在确认官方分数",
      scoreNextRefreshAt: "",
      ...emptyCompareState(),
    });
    void this.loadTournaments(true);
    return true;
  },

  async loadTournaments(
    forceRefresh = false,
    originatingTrace?: PageRequestTrace,
  ) {
    const trace =
      originatingTrace ||
      capturePageRequestTrace({
        callerSurface: "live-tournament-directory",
        trigger: forceRefresh ? "refresh" : "load",
      });
    const entryId = this.data.entryId;
    if (!entryId) {
      this.liveRefresh?.stop();
      this.liveSnapshot = null;
      this.failedEntryCount = 0;
      this.cachedLiveStoredAt = undefined;
      clearTournamentBoard(this);
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
        emptyDescription: "查找球队并设为我的球队后，即可加载实时赛事。",
        emptyActionText: "去选择球队",
        tournaments: [],
        tournamentNames: [],
        selectedTournament: null,
        rowCount: 0,
        displayedRows: [],
      });
      return;
    }
    if (this.restartForPrincipalChange(entryId)) return;

    const requestId = ++this.tournamentListRequestId;
    this.directoryRequestPending = true;
    this.directoryRequestForceRefresh = forceRefresh;

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
      emptyActionText: "",
    });
    try {
      const tournaments = await getEntryPointsRaceTournament(
        entryId,
        forceRefresh,
        trace,
      );
      if (!this.pageVisible || requestId !== this.tournamentListRequestId)
        return;
      if (this.restartForPrincipalChange(entryId)) return;
      if (tournaments.length === 0) {
        this.liveRefresh?.stop();
        this.liveSnapshot = null;
        this.failedEntryCount = 0;
        this.cachedLiveStoredAt = undefined;
        clearTournamentBoard(this);
        this.setData({
          tournaments: [],
          tournamentNames: [],
          selectedTournament: null,
          rowCount: 0,
          displayedRows: [],
          hasData: false,
          emptyState: "tournaments",
          emptyEyebrow: "赛事待就绪",
          emptyTitle: "当前球队还没有可查看的赛事",
          emptyDescription:
            "加入一个赛事后，或等待新赛季数据同步，再回到这里重新检查。",
          emptyActionText: "重新检查",
        });
        return;
      }
      const storedId = wx.getStorageSync(SELECTED_TOURNAMENT_ID_KEY);
      const storedIndex = tournaments.findIndex(
        (tournament) => String(tournament.id) === String(storedId),
      );
      const selectedTournamentIndex = storedIndex >= 0 ? storedIndex : 0;
      const selectedTournament = tournaments[selectedTournamentIndex];
      // A league switch — including the refreshed list dropping the current
      // one — is a new result context: never show the previous league's rows
      // under the newly selected league after a failed reload.
      const selectionChanged =
        !this.data.selectedTournament ||
        String(this.data.selectedTournament.id) !==
          String(selectedTournament.id);
      if (selectionChanged) {
        this.liveRefresh?.stop();
        this.liveSnapshot = null;
        this.failedEntryCount = 0;
        this.cachedLiveStoredAt = undefined;
        clearTournamentBoard(this);
      }
      this.setData({
        tournaments,
        tournamentNames: tournaments.map((tournament) => tournament.name),
        selectedTournamentIndex,
        selectedTournament,
        emptyState: "",
        ...(selectionChanged
          ? { hasData: false, rowCount: 0, displayedRows: [], lastUpdated: "" }
          : {}),
      });
      this.persistSelectedTournament(selectedTournament);
      if (selectedTournament.participantCount === 0 || this.data.event <= 0) {
        this.liveRefresh?.stop();
        this.liveSnapshot = null;
        this.failedEntryCount = 0;
        this.cachedLiveStoredAt = undefined;
        clearTournamentBoard(this);
        this.setData({
          rowCount: 0,
          displayedRows: [],
          hasData: true,
          loading: false,
          refreshing: false,
          resultsEmptyTitle:
            selectedTournament.participantCount === 0
              ? "当前赛事还没有参赛球队"
              : "当前暂无进行中的比赛周",
          resultsEmptyDescription:
            selectedTournament.participantCount === 0
              ? "有球队加入后再显示实时排名"
              : "比赛周开始后再显示实时排名",
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
        trace,
      });
    } catch (error) {
      if (!this.pageVisible || requestId !== this.tournamentListRequestId)
        return;
      if (this.restartForPrincipalChange(entryId)) return;
      this.setData({
        tournamentListError:
          error instanceof Error ? error.message : "实时赛事加载失败",
        tournamentListErrorSuffix: this.data.hasData
          ? "当前显示上次成功结果"
          : "",
      });
    } finally {
      if (this.pageVisible && requestId === this.tournamentListRequestId) {
        this.directoryRequestPending = false;
        this.directoryRequestForceRefresh = false;
        this.setData({ loading: false });
      }
    }
  },

  // The keyword that the in-flight/visible rows were actually requested with.
  // data.keyword is a per-keystroke draft (onKeyword fires no request), so
  // the request-context guard must track only submitted keywords — otherwise
  // a draft edit mid-flight would strand the load unsettled forever.
  _submittedKeyword: "",

  captureBoardControls(): BoardControlState {
    return {
      submittedKeyword: this._submittedKeyword,
      keyword: this.data.keyword,
      sortKey: this.data.sortKey,
      sortDesc: this.data.sortDesc,
      chipFilters: [...this.data.chipFilters],
      captainFilters: [...this.data.captainFilters],
      ownershipScope: this.data.ownershipScope,
      ownershipCaptainMode: this.data.ownershipCaptainMode,
      selectedOwnershipPlayers: this.data.selectedOwnershipPlayers.map(
        (player) => ({ ...player }),
      ),
      teamExposureScope: this.data.teamExposureScope,
      teamExposureRules: this.data.teamExposureRules.map((rule) => ({ ...rule })),
    };
  },

  commitBoardControls() {
    this.committedBoardControls = this.captureBoardControls();
  },

  restoreCommittedBoardControls() {
    const committed = this.committedBoardControls as BoardControlState | null;
    if (!committed) return;
    this._submittedKeyword = committed.submittedKeyword;
    this.setData({
      keyword: committed.keyword,
      sortKey: committed.sortKey,
      sortDesc: committed.sortDesc,
      chipFilters: [...committed.chipFilters],
      captainFilters: [...committed.captainFilters],
      ownershipScope: committed.ownershipScope,
      ownershipCaptainMode: committed.ownershipCaptainMode,
      selectedOwnershipPlayers: committed.selectedOwnershipPlayers.map(
        (player) => ({ ...player }),
      ),
      teamExposureScope: committed.teamExposureScope,
      teamExposureRules: committed.teamExposureRules.map((rule) => ({ ...rule })),
    });
  },

  currentBoardScope() {
    const entryId = Number(this.data.entryId);
    const tournamentId = Number(this.data.selectedTournament?.id);
    const season = String(
      this.loadedSeason || getApp<IAppOption>().globalData.season || "",
    );
    const sessionKey = liveBoardSessionKey(getApiSessionToken());
    if (
      !Number.isSafeInteger(entryId) ||
      entryId <= 0 ||
      !Number.isSafeInteger(tournamentId) ||
      tournamentId <= 0 ||
      !Number.isSafeInteger(this.data.event) ||
      this.data.event <= 0 ||
      !season ||
      !sessionKey
    ) {
      return null;
    }
    return {
      sessionKey,
      season,
      eventId: this.data.event,
      entryId,
      tournamentId,
    };
  },

  hasDefaultBoardQuery(): boolean {
    return !this._submittedKeyword.trim() &&
      this.data.sortKey === "livePoints" &&
      this.data.sortDesc &&
      this.data.chipFilters.length === 0 &&
      this.data.captainFilters.length === 0 &&
      this.data.selectedOwnershipPlayers.length === 0 &&
      this.data.teamExposureRules.length === 0;
  },

  buildBoardVariables(
    page = 1,
    expectedBoardRevision: string | null = null,
  ): LiveBoardVariables | null {
    const scope = this.currentBoardScope();
    if (!scope) return null;
    const ownerIds = this.data.selectedOwnershipPlayers
      .map((player) => Number(player.element))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
      .slice(0, 5);
    const teamCountRules = this.data.teamExposureRules
      .map((rule) => ({
        teamId: Number(rule.teamId),
        exactCount: Number(rule.count),
        scope: boardScopeOf(this.data.teamExposureScope),
      }))
      .filter(
        (rule) =>
          Number.isSafeInteger(rule.teamId) &&
          rule.teamId > 0 &&
          Number.isSafeInteger(rule.exactCount) &&
          rule.exactCount >= 1 &&
          rule.exactCount <= 15,
      )
      .slice(0, 4);
    return {
      entryId: scope.entryId,
      tournamentId: scope.tournamentId,
      eventId: scope.eventId,
      ref: null,
      page,
      pageSize: this.data.pageSize,
      sort: boardSortOf(this.data.sortKey),
      direction: this.data.sortDesc ? "DESC" : "ASC",
      search: this._submittedKeyword.trim().slice(0, 100) || null,
      chips: this.data.chipFilters.map(boardChipOf),
      captainPlayerIds: this.data.captainFilters.slice(0, 15),
      ownership: ownerIds.length
        ? {
            playerIds: ownerIds,
            scope: boardScopeOf(this.data.ownershipScope),
            captainMode:
              this.data.ownershipCaptainMode === "captain"
                ? "CAPTAIN"
                : this.data.ownershipCaptainMode === "vice"
                  ? "VICE"
                  : "ANY",
          }
        : null,
      teamCountRules,
      expectedBoardRevision,
    };
  },

  applyBoardPage(
    page: LiveBoardPage,
    reset: boolean,
    options: { lastGood?: boolean } = {},
  ) {
    const playerRevisionChanged = Boolean(
      this.boardPage && this.boardPage.playerRevision !== page.playerRevision,
    );
    const incoming = boardRowsToLiveRows(page).map(normalizeRow);
    const byEntry = new Map<number, DisplayTournamentRow>();
    if (!reset) {
      this.rows.forEach((row: DisplayTournamentRow) => {
        byEntry.set(numberValue(row.entry), row);
      });
    }
    incoming.forEach((row) => byEntry.set(numberValue(row.entry), row));
    const viewerId = numberValue(this.data.entryId);
    const compareIds = this.data.compareIds || [];
    const rows = [...byEntry.values()].map((row, index) => {
      const compared = compareIds.includes(numberValue(row.entry));
      return {
        ...row,
        visibleRank: numberValue(row.rank, index + 1),
        isMe: numberValue(row.entry) === viewerId,
        pinned: false,
        compared,
        compareDisabled:
          this.data.compareMode && compareIds.length >= 2 && !compared,
      };
    });
    const resultsFiltered = !this.hasDefaultBoardQuery();
    const captainNames = this.data.captainFilters
      .map((element) =>
        this.ownershipPlayers.find(
          (player: OwnershipPlayerOption) => player.element === element,
        )?.name,
      )
      .filter((name): name is string => Boolean(name));
    this.boardPage = page;
    this.usingLegacyBoard = false;
    this.rows = rows;
    this.shareRows = rows;
    this.officialCoverage = page.officialCoverage;
    this.officialTotalEntries = page.totalEntries;
    this.unavailableEntryIds = mergeUnavailableTournamentEntryIds(
      page.failedEntryIds,
      page.unavailableEntryIds,
    );
    this.failedEntryCount = page.partial
      ? Math.max(1, this.unavailableEntryIds.length)
      : 0;
    this.retainedRowCount = options.lastGood ? rows.length : 0;
    if (playerRevisionChanged) this.compareRequestId += 1;
    this.setData({
      hasData: true,
      rowCount: page.totalEntries,
      displayedRows: rows,
      filteredCount: page.filteredEntries,
      hasMore: page.hasMore,
      highestText:
        page.highestEventPoints == null ? "—" : String(page.highestEventPoints),
      averageText: formatBoardAveragePoints(page.averageEventPoints),
      entriesText: String(page.totalEntries),
      scoreStatusText: managerStatusFromBoard(page, options.lastGood === true),
      scoreNextRefreshAt: page.managerNextRefreshAt || "",
      lastUpdated: exactUpdatedTime(page.managerCheckedAt),
      captainValues: this.ownershipPlayers.map(
        (player: OwnershipPlayerOption) => player.name,
      ),
      captainFilterNames: captainNames,
      captainOptions: this.ownershipPlayers.map((player: OwnershipPlayerOption) => ({
        element: player.element,
        name: player.name,
        on: this.data.captainFilters.includes(player.element),
      })),
      chipOptions: CHIP_VALUES.map((value) => ({
        value,
        label: value,
        on: this.data.chipFilters.includes(value),
      })),
      resultsFiltered,
      resultsEmptyTitle: resultsFiltered
        ? "没有符合当前筛选的球队"
        : `GW${this.data.event} 实时排名还没生成`,
      resultsEmptyDescription: resultsFiltered
        ? "保留当前筛选，调整条件后再试"
        : "比赛开始或赛事数据同步后会显示实时排名",
      resultsEmptyActionText: resultsFiltered ? "清除全部筛选" : "重新加载",
      ownershipPlayerNames: this.data.selectedOwnershipPlayers.map(
        (player) => `${player.name}${player.meta ? ` (${player.meta})` : ""}`,
      ),
      ownershipSummary: this.data.selectedOwnershipPlayers.length
        ? this.data.selectedOwnershipPlayers.map((player) => player.name).join("、")
        : "未筛选",
      ownershipMatchedText: this.data.selectedOwnershipPlayers.length
        ? ` · 匹配 ${page.filteredEntries}/${page.totalEntries}`
        : "",
      teamExposureMatchedText: this.data.teamExposureRules.length
        ? ` · 匹配 ${page.filteredEntries}/${page.totalEntries}`
        : "",
      teamExposureSummary: this.data.teamExposureRules.length
        ? this.data.teamExposureRules
            .map((rule) => `${rule.name}恰好${rule.count}人`)
            .join("、")
        : "未筛选",
      activeFilterCount:
        this.data.chipFilters.length +
        this.data.captainFilters.length +
        this.data.selectedOwnershipPlayers.length +
        this.data.teamExposureRules.length,
      error: page.partial
        ? `部分结果不可用：${Math.max(1, this.unavailableEntryIds.length)}/${page.totalEntries} 支参赛球队暂不可用`
        : "",
      errorSuffix: page.partial ? "其余榜单仍可查看" : "",
      ...(playerRevisionChanged
        ? {
            compareOpen: false,
            compareLoading: false,
            compareError: "",
            compareLeft: null,
            compareRight: null,
            compareLineupRows: [],
            compareLeftPickCount: 0,
            compareRightPickCount: 0,
          }
        : {}),
    });
    this.commitBoardControls();
  },

  async loadSelectionIndex() {
    const page = this.boardPage;
    const scope = this.currentBoardScope();
    if (!page || !scope || this.usingLegacyBoard) return;
    const key = `${scope.tournamentId}:${scope.eventId}:${page.playerRevision}`;
    if (this.selectionIndexKey === key && this.ownershipPlayers.length > 0) {
      return;
    }
    const requestId = this.selectionIndexRequestId + 1;
    this.selectionIndexRequestId = requestId;
    this.setData({ filterOptionsLoading: true, filterOptionsError: "" });
    try {
      const index = await getTournamentSelectionIndex({
        entryId: scope.entryId,
        tournamentId: scope.tournamentId,
        ref: {
          season: page.season,
          eventId: page.eventId,
          revision: page.playerRevision,
        },
        trace: capturePageRequestTrace({
          callerSurface: "live-tournament-filter-index",
          trigger: "load",
        }),
      });
      if (
        requestId !== this.selectionIndexRequestId ||
        this.boardPage?.playerRevision !== page.playerRevision
      ) {
        return;
      }
      const players = playerOptionsFromSelectionIndex(index.rows);
      const teams = teamOptionsFromSelectionIndex(index.rows);
      const playerIds = new Set(players.map((player) => player.element));
      const selectedOwnershipPlayers = this.data.selectedOwnershipPlayers;
      const captainFilters = this.data.captainFilters;
      const missingActivePlayerIds = [
        ...selectedOwnershipPlayers.map((player) => player.element),
        ...captainFilters,
      ].filter((element) => !playerIds.has(element));
      if (missingActivePlayerIds.length > 0) {
        throw new Error("筛选索引与当前榜单版本不一致");
      }
      this.ownershipPlayers = players;
      this.selectionIndexKey = key;
      this.setData({
        selectedOwnershipPlayers,
        captainFilters,
        ownershipTeamOptions: teams,
        ownershipTeamNames: teams.map(formatTeamName),
        teamExposureTeams: teams,
        teamExposureTeamNames: teams.map(formatTeamName),
        captainValues: players.map((player) => player.name),
        captainFilterNames: captainFilters
          .map((element) => players.find((player) => player.element === element)?.name)
          .filter((name): name is string => Boolean(name)),
        captainOptions: players.map((player) => ({
          element: player.element,
          name: player.name,
          on: captainFilters.includes(player.element),
        })),
        ownershipSearchResults: computeOwnershipSearchResults(
          players,
          this.data.ownershipSearch,
          selectedOwnershipPlayers,
        ),
      });
    } catch (error) {
      if (requestId !== this.selectionIndexRequestId) return;
      if (
        hasLiveBoardErrorCode(error, "LIVE_REVISION_GONE") ||
        hasLiveBoardErrorCode(error, "LIVE_BOARD_REVISION_GONE")
      ) {
        void this.loadRows({ background: this.data.hasData, forceRefresh: true });
      }
      this.setData({
        filterOptionsError: "筛选选项暂时加载失败，当前榜单和筛选已保留",
      });
    } finally {
      if (requestId === this.selectionIndexRequestId) {
        this.setData({ filterOptionsLoading: false });
      }
    }
  },

  async loadCompareSquads() {
    const page = this.boardPage;
    const scope = this.currentBoardScope();
    const comparedEntryIds = [...new Set(this.data.compareIds)].slice(0, 2);
    if (comparedEntryIds.length !== 2) return;
    if (!page || !scope || this.usingLegacyBoard) {
      const compareSelection = compareSelectionState(this.rows, comparedEntryIds);
      this.setData({
        ...compareSelection,
        compareOpen: Boolean(
          compareSelection.compareLeft && compareSelection.compareRight,
        ),
      });
      return;
    }
    const requestId = this.compareRequestId + 1;
    this.compareRequestId = requestId;
    this.setData({ compareLoading: true, compareError: "", compareOpen: false });
    try {
      const rows = await getTournamentEntrySquads({
        entryId: scope.entryId,
        tournamentId: scope.tournamentId,
        comparedEntryIds,
        ref: {
          season: page.season,
          eventId: page.eventId,
          revision: page.playerRevision,
        },
        trace: capturePageRequestTrace({
          callerSurface: "live-tournament-compare",
          trigger: "load",
        }),
      });
      if (
        requestId !== this.compareRequestId ||
        this.boardPage?.playerRevision !== page.playerRevision ||
        this.data.compareIds.length !== 2 ||
        this.data.compareIds[0] !== comparedEntryIds[0] ||
        this.data.compareIds[1] !== comparedEntryIds[1]
      ) {
        return;
      }
      const normalized = rows.map(normalizeRow);
      const compareSelection = compareSelectionState(
        normalized,
        comparedEntryIds,
      );
      if (!compareSelection.compareLeft || !compareSelection.compareRight) {
        throw new Error("阵容对比响应不完整，请稍后重试");
      }
      this.setData({ ...compareSelection, compareOpen: true });
    } catch (error) {
      if (requestId !== this.compareRequestId) return;
      const message = error instanceof Error ? error.message : "阵容对比加载失败";
      this.setData({ compareError: message, compareOpen: false });
      wx.showToast({ title: "阵容对比加载失败，已保留选择", icon: "none" });
      if (hasLiveBoardErrorCode(error, "LIVE_REVISION_GONE")) {
        void this.loadRows({ background: this.data.hasData, forceRefresh: true });
      }
    } finally {
      if (requestId === this.compareRequestId) {
        this.setData({ compareLoading: false });
      }
    }
  },

  loadRows(options: LiveTournamentLoadOptions = {}): Promise<void> {
    const eventId = this.data.event;
    const hasNoParticipants =
      this.data.selectedTournament?.participantCount === 0;
    if (hasNoParticipants || !Number.isSafeInteger(eventId) || eventId <= 0) {
      clearTournamentBoard(this);
      this.setData({
        rowCount: 0,
        displayedRows: [],
        hasMore: false,
        loading: false,
        refreshing: false,
        error: "",
        errorSuffix: "",
        resultsEmptyTitle: hasNoParticipants
          ? "当前赛事还没有参赛球队"
          : "当前暂无进行中的比赛周",
        resultsEmptyDescription: hasNoParticipants
          ? "有球队加入后再显示实时排名"
          : "比赛周开始后再显示实时排名",
      });
      this.syncDisplayState();
      return Promise.resolve();
    }
    const variables = this.buildBoardVariables();
    if (!variables) {
      const error = new Error("当前会话或赛事信息不完整，请重新进入页面");
      this.setData({
        loading: false,
        refreshing: false,
        error: error.message,
        errorSuffix: this.data.hasData ? "当前显示上次成功结果" : "",
      });
      return options.propagateError
        ? Promise.reject(error)
        : Promise.resolve();
    }
    const trace =
      options.trace ||
      capturePageRequestTrace({
        callerSurface: "live-tournament-board",
        trigger: options.forceRefresh ? "refresh" : "load",
      });
    const requestKey = `board:${JSON.stringify(variables)}:${options.forceRefresh === true}`;
    if (this.rowsRequest && this.rowsRequestKey === requestKey) {
      return this.rowsRequest;
    }

    const requestId = this.rowsRequestId + 1;
    this.rowsRequestId = requestId;
    const scope = this.currentBoardScope();
    let cached = null as ReturnType<typeof readLiveBoardLastGood>;
    if (scope) {
      const key = liveBoardLastGoodKey(scope);
      clearOtherLiveBoardLastGood(key);
      if (
        !this.data.hasData &&
        this.hasDefaultBoardQuery() &&
        this.data.event === this.data.maxGw
      ) {
        cached = readLiveBoardLastGood(scope);
        if (cached) this.applyBoardPage(cached.page, true, { lastGood: true });
      }
    }
    const preserveData = this.data.hasData || options.background === true || Boolean(cached);
    this.setData(
      preserveData
        ? { refreshing: true, error: "", errorSuffix: "" }
        : {
            loading: true,
            error: "",
            errorSuffix: "",
            scoreStatusText: "正在确认官方分数",
          },
    );

    const request = (async () => {
      try {
        const result = await getEntryLiveCompetitionBoardPage(variables, {
          expectedSeason: scope?.season,
          trace,
        });
        if (!this.pageVisible || requestId !== this.rowsRequestId) return;
        if (this.restartForPrincipalChange(variables.entryId)) return;
        this.applyBoardPage(result.page, true);
        const writeScope = this.currentBoardScope();
        if (
          writeScope &&
          writeScope.entryId === variables.entryId &&
          writeScope.tournamentId === variables.tournamentId &&
          writeScope.eventId === variables.eventId &&
          this.hasDefaultBoardQuery() &&
          this.data.event === this.data.maxGw
        ) {
          const writeKey = liveBoardLastGoodKey(writeScope);
          clearOtherLiveBoardLastGood(writeKey);
          writeLiveBoardLastGood(writeScope, result.page);
        }
        if (this.data.filterSheetOpen) void this.loadSelectionIndex();
        this.liveRefresh?.sync();
        this.syncDisplayState();
      } catch (error) {
        if (!this.pageVisible || requestId !== this.rowsRequestId) return;
        if (isLiveBoardSchemaUnavailableError(error)) {
          this.usingLegacyBoard = true;
          await this.loadLegacyRows({ ...options, trace });
          return;
        }
        if (this.restartForPrincipalChange(variables.entryId)) return;
        this.setData({
          error: error instanceof Error ? error.message : "实时赛事加载失败",
          errorSuffix: this.data.hasData ? "当前显示上次成功结果" : "",
        });
        this.syncDisplayState();
        if (options.propagateError) throw error;
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
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  },

  loadLegacyRows(options: LiveTournamentLoadOptions = {}): Promise<void> {
    const trace =
      options.trace ||
      capturePageRequestTrace({
        callerSurface: "live-tournament-rows",
        trigger: options.forceRefresh ? "refresh" : "load",
      });
    const entryId = this.data.entryId;
    if (!entryId) {
      clearTournamentBoard(this);
      this.setData({ rowCount: 0, displayedRows: [], hasMore: false });
      return Promise.resolve();
    }
    const selected = this.data.selectedTournament;
    if (!selected) {
      clearTournamentBoard(this);
      this.setData({ rowCount: 0, displayedRows: [], hasMore: false });
      return Promise.resolve();
    }

    // initializeFromContext/onShow resolves the shared live anchor before a
    // row request starts. Do not await a second probe here: request coalescing
    // relies on the loader returning the exact in-flight promise.
    const eventId = this.data.event;
    const hasNoParticipants = selected.participantCount === 0;
    if (hasNoParticipants || !Number.isSafeInteger(eventId) || eventId <= 0) {
      clearTournamentBoard(this);
      this.setData({
        rowCount: 0,
        displayedRows: [],
        hasMore: false,
        loading: false,
        refreshing: false,
        error: "",
        errorSuffix: "",
        resultsEmptyTitle: hasNoParticipants
          ? "当前赛事还没有参赛球队"
          : "当前暂无进行中的比赛周",
        resultsEmptyDescription: hasNoParticipants
          ? "有球队加入后再显示实时排名"
          : "比赛周开始后再显示实时排名",
      });
      this.syncDisplayState();
      return Promise.resolve();
    }
    const keyword = this._submittedKeyword;
    const requestKey = `${entryId}:${selected.id}:${eventId}:${keyword}:${options.forceRefresh === true}`;
    if (this.rowsRequest && this.rowsRequestKey === requestKey) {
      return this.rowsRequest;
    }

    const requestId = this.rowsRequestId + 1;
    this.rowsRequestId = requestId;
    const preserveData = options.background === true && this.data.hasData;
    if (!preserveData) {
      this.retainedRowCount = 0;
    }
    this.setData(
      preserveData
        ? { refreshing: true, error: "", errorSuffix: "" }
        : { loading: true, error: "", errorSuffix: "" },
    );

    const request = (async () => {
      try {
        const liveResult = keyword
          ? await searchLivePointsByTournamentSnapshot(
              selected.id,
              eventId,
              keyword,
              options.forceRefresh === true,
              trace,
              entryId,
            )
          : await getLivePointsByTournamentSnapshot(
              selected.id,
              eventId,
              options.forceRefresh === true,
              trace,
              entryId,
            );
        if (!this.pageVisible || requestId !== this.rowsRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;
        const refreshedRows = liveResult.data.map(normalizeRow);
        const scoreNextRefreshAt =
          refreshedRows
            .map((row) => row.score?.nextRefreshAt)
            .filter((value): value is string => Boolean(value))
            .sort()[0] || "";
        this.setData({ scoreNextRefreshAt });
        const unavailableEntryIds = mergeUnavailableTournamentEntryIds(
          liveResult.failedEntryIds,
          liveResult.unavailableEntryIds,
        );
        const failedEntryIds = new Set(unavailableEntryIds);
        this.officialCoverage = liveResult.officialCoverage;
        this.officialTotalEntries = liveResult.totalEntries;
        this.unavailableEntryIds = unavailableEntryIds;
        this.failedEntryCount = Math.max(
          failedEntryIds.size,
          liveResult.partialError ? 1 : 0,
        );
        // Per-entry failures do not invalidate producer metadata. Retaining a
        // SETTLED snapshot stops expensive batch polling while the partial
        // row error remains visible and manually retryable.
        this.liveSnapshot = liveResult.snapshot ?? this.liveSnapshot;
        this.cachedLiveStoredAt = liveResult.servedStoredAt;
        const refreshedEntryIds = new Set(
          refreshedRows.map((row) => numberValue(row.entry)),
        );
        const retainedRows = preserveData
          ? this.rows.filter(
              (row: DisplayTournamentRow) =>
                failedEntryIds.has(numberValue(row.entry)) &&
                !refreshedEntryIds.has(numberValue(row.entry)),
            )
          : [];
        this.retainedRowCount = retainedRows.length;
        this.applyRows(
          [...refreshedRows, ...retainedRows],
          true,
          liveResult.servedStoredAt || Date.now(),
        );
        if (liveResult.partialError) {
          this.setData({
            error: liveResult.partialError,
            errorSuffix: partialTournamentErrorSuffix(retainedRows.length),
          });
        }
        this.liveRefresh?.sync();
        this.syncDisplayState();
      } catch (error) {
        if (!this.pageVisible || requestId !== this.rowsRequestId) return;
        if (this.restartForPrincipalChange(entryId)) return;
        this.setData({
          error: error instanceof Error ? error.message : "实时赛事加载失败",
          errorSuffix: this.data.hasData ? "当前显示上次成功结果" : "",
        });
        this.syncDisplayState();
        if (options.propagateError) throw error;
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
    const currentEventId =
      this.liveSnapshot?.eventId ??
      (Number(getApp<IAppOption>().globalData.gw) || 0);
    return shouldPollLiveSnapshot({
      pageVisible: this.pageVisible,
      currentEventId,
      selectedEventId: this.data.event,
      snapshot: this.liveSnapshot,
      windowState: this.liveSnapshot?.windowState,
      nextRefreshAt: this.liveSnapshot?.nextRefreshAt,
      managerNextRefreshAt: this.data.scoreNextRefreshAt,
    });
  },

  revalidateCachedSnapshot(): boolean {
    const currentEventId = Number(getApp<IAppOption>().globalData.gw) || 0;
    if (
      !shouldRevalidateCachedLiveSnapshot({
        servedStoredAt: this.cachedLiveStoredAt,
        pageVisible: this.pageVisible,
        currentEventId,
        selectedEventId: this.data.event,
        snapshot: this.liveSnapshot,
      })
    ) {
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
      partialFailedCount: this.failedEntryCount,
    });
    if (next !== this.data.displayState) {
      recordLiveTransition({
        surface: "tournament",
        season: this.liveSnapshot?.season,
        eventId: this.data.event,
        isCurrentEvent:
          this.data.event === Number(getApp<IAppOption>().globalData.gw),
        displayState: next,
        retainedRowCount: this.retainedRowCount,
      });
    }
    this.setData({
      displayState: next,
      retainedRowCount: this.retainedRowCount,
    });
  },

  reloadBoardControls(options: { fetchLegacy?: boolean } = {}) {
    const controlRequestId = this.boardControlRequestId + 1;
    this.boardControlRequestId = controlRequestId;
    if (this.usingLegacyBoard && !options.fetchLegacy) {
      this.applyRows(this.rows, true);
      return;
    }
    return this.loadRows({
      background: this.data.hasData,
      propagateError: true,
    }).catch(() => {
      if (controlRequestId !== this.boardControlRequestId) return;
      this.restoreCommittedBoardControls();
      this.setData({
        error: "筛选结果刷新失败",
        errorSuffix: "当前筛选和榜单保持不变",
      });
    });
  },

  syncBoardCompareMarkers() {
    const viewerId = numberValue(this.data.entryId);
    const compareIds = this.data.compareIds || [];
    this.rows = this.rows.map((row: DisplayTournamentRow) => {
      const compared = compareIds.includes(numberValue(row.entry));
      return {
        ...row,
        isMe: numberValue(row.entry) === viewerId,
        compared,
        compareDisabled:
          this.data.compareMode && compareIds.length >= 2 && !compared,
      };
    });
    this.shareRows = this.rows;
    this.setData({ displayedRows: this.rows });
  },

  applyRows(
    rows: DisplayTournamentRow[],
    resetPage: boolean,
    fetchedAt?: number,
  ) {
    if (!this.usingLegacyBoard && this.boardPage) {
      this.syncBoardCompareMarkers();
      return;
    }
    const teamOptions = getTournamentTeamOptions(rows);
    const teamExposureRules = this.data.teamExposureRules || [];
    const ownershipPlayers = collectOwnershipPlayers(rows);
    const selectedOwnershipTeam = this.data.selectedOwnershipTeam
      ? teamOptions.find(
          (team) =>
            team.shortName === this.data.selectedOwnershipTeam?.shortName,
        )
      : null;
    const ownershipPositionOptions = collectOwnershipPositions(
      ownershipPlayers,
      selectedOwnershipTeam,
    );
    const selectedOwnershipPosition = ownershipPositionOptions.includes(
      this.data.selectedOwnershipPosition,
    )
      ? this.data.selectedOwnershipPosition
      : "";
    const ownershipAvailablePlayers = filterOwnershipPlayers(
      ownershipPlayers,
      selectedOwnershipTeam,
      selectedOwnershipPosition,
    );
    let filteredRows = filterTournamentRowsByOwnership(rows, {
      playerIds: this.data.selectedOwnershipPlayers.map(
        (player) => player.element,
      ),
      scope: this.data.ownershipScope,
      captainMode: this.data.ownershipCaptainMode,
    }) as DisplayTournamentRow[];
    filteredRows = filterTournamentRowsByTeamExposure(filteredRows, {
      rules: teamExposureRules.map((rule) => ({
        teamShortName: rule.teamShortName,
        exactCount: rule.count,
      })),
      scope: this.data.teamExposureScope,
    }) as DisplayTournamentRow[];
    const keyword = String(this.data.keyword || this._submittedKeyword || "")
      .trim()
      .toLowerCase();
    if (keyword) {
      filteredRows = filteredRows.filter((row) => {
        const haystack =
          `${row.entryName || ""} ${row.playerName || ""} ${row.searchText || ""}`.toLowerCase();
        return haystack.includes(keyword);
      });
    }
    const chipFilters = this.data.chipFilters || [];
    if (chipFilters.length) {
      filteredRows = filteredRows.filter((row) =>
        chipFilters.includes(textValue(row.chipCode)),
      );
    }
    const captainFilters = this.data.captainFilters || [];
    if (captainFilters.length) {
      filteredRows = filteredRows.filter((row) =>
        captainFilters.includes(
          numberValue(
            row.picks?.find((pick) => pick.captain)?.element,
          ),
        ),
      );
    }
    const viewerId = numberValue(this.data.entryId);
    const compareIds = this.data.compareIds || [];
    const compareSelection = compareSelectionState(rows, compareIds);
    const sortedRows = sortRows(
      filteredRows,
      this.data.sortKey,
      this.data.sortDesc,
    ).map((row, index) => {
      const compared = compareIds.includes(numberValue(row.entry));
      return {
        ...row,
        visibleRank: index + 1,
        isMe: row.entry === viewerId,
        pinned: false,
        compared,
        compareDisabled:
          this.data.compareMode && compareIds.length >= 2 && !compared,
      };
    });
    const resultsFiltered = Boolean(
      keyword ||
      this.data.selectedOwnershipPlayers.length ||
      teamExposureRules.length ||
      chipFilters.length ||
      captainFilters.length,
    );
    const nextSize = resetPage
      ? this.data.pageSize
      : this.data.displayedRows.length + this.data.pageSize;
    const stats = buildTournamentStats(rows);
    const scoreStatusText = tournamentManagerScoreStatus(rows, {
      officialCoverage: this.officialCoverage,
      unavailableEntryIds: this.unavailableEntryIds,
      totalEntries: this.officialTotalEntries,
    });
    const captainValues = Array.from(
      new Set(
        rows
          .map((row) => textValue(row.captainName))
          .filter((name) => name && name !== "-" && name !== "无队长"),
      ),
    ).sort((left, right) => left.localeCompare(right));
    this.rows = rows;
    this.ownershipPlayers = ownershipPlayers;
    this.shareRows = sortedRows;
    this.setData({
      hasData: true,
      rowCount: rows.length,
      displayedRows: takeVisibleWithPinMe(sortedRows, nextSize, viewerId),
      ...compareSelection,
      filteredCount: sortedRows.length,
      hasMore: sortedRows.length > nextSize,
      highestText: stats.highestText,
      averageText: stats.averageText,
      entriesText:
        typeof this.officialTotalEntries === "number" &&
        this.officialTotalEntries > 0
          ? String(this.officialTotalEntries)
          : stats.entriesText,
      scoreStatusText,
      captainValues,
      captainFilterNames: captainFilters
        .map(
          (element) =>
            ownershipPlayers.find((player) => player.element === element)?.name,
        )
        .filter((name): name is string => Boolean(name)),
      captainOptions: captainValues.map((name) => ({
        element:
          ownershipPlayers.find((player) => player.name === name)?.element || 0,
        name,
        on: captainFilters.includes(
          ownershipPlayers.find((player) => player.name === name)?.element || 0,
        ),
      })),
      chipOptions: CHIP_VALUES.map((value) => ({
        value,
        label: value,
        on: chipFilters.includes(value),
      })),
      resultsFiltered,
      resultsEmptyTitle: resultsFiltered
        ? "没有符合当前筛选的球队"
        : `GW${this.data.event} 实时排名还没生成`,
      resultsEmptyDescription: resultsFiltered
        ? "清除搜索或球员持有、球队人数筛选后再看"
        : "比赛开始或赛事数据同步后会显示实时排名",
      resultsEmptyActionText: resultsFiltered ? "清除全部筛选" : "重新加载",
      ownershipTeamOptions: teamOptions,
      ownershipTeamNames: teamOptions.map(formatTeamName),
      selectedOwnershipTeam,
      selectedOwnershipTeamIndex: selectedOwnershipTeam
        ? teamOptions.findIndex(
            (team) => team.shortName === selectedOwnershipTeam.shortName,
          )
        : 0,
      ownershipPositionOptions,
      selectedOwnershipPosition,
      selectedOwnershipPositionIndex: selectedOwnershipPosition
        ? ownershipPositionOptions.findIndex(
            (position) => position === selectedOwnershipPosition,
          )
        : 0,
      ownershipAvailablePlayers,
      ownershipAvailablePlayerNames: ownershipAvailablePlayers.map(
        (player) => player.name,
      ),
      ownershipPlayerNames: this.data.selectedOwnershipPlayers.map(
        (player) => `${player.name}${player.meta ? ` (${player.meta})` : ""}`,
      ),
      ownershipSummary: this.data.selectedOwnershipPlayers.length
        ? this.data.selectedOwnershipPlayers
            .map((player) => player.name)
            .join("、")
        : "未筛选",
      ownershipSearchResults: computeOwnershipSearchResults(
        ownershipPlayers,
        this.data.ownershipSearch,
        this.data.selectedOwnershipPlayers,
      ),
      ownershipMatchedText: this.data.selectedOwnershipPlayers.length
        ? ` · 匹配 ${
            filterTournamentRowsByOwnership(rows, {
              playerIds: this.data.selectedOwnershipPlayers.map(
                (player) => player.element,
              ),
              scope: this.data.ownershipScope,
              captainMode: this.data.ownershipCaptainMode,
            }).length
          }/${rows.length}`
        : "",
      teamExposureMatchedText: teamExposureRules.length
        ? ` · 匹配 ${
            filterTournamentRowsByTeamExposure(rows, {
              rules: teamExposureRules.map((rule) => ({
                teamShortName: rule.teamShortName,
                exactCount: rule.count,
              })),
              scope: this.data.teamExposureScope,
            }).length
          }/${rows.length}`
        : "",
      teamExposureTeams: teamOptions,
      teamExposureTeamNames: teamOptions.map(formatTeamName),
      teamExposureSummary: teamExposureRules.length
        ? teamExposureRules
            .map((rule) => `${rule.name}恰好${rule.count}人`)
            .join("、")
        : "未筛选",
      activeFilterCount:
        (chipFilters.length ? 1 : 0) +
        (captainFilters.length ? 1 : 0) +
        (this.data.selectedOwnershipPlayers.length ? 1 : 0) +
        (teamExposureRules.length ? 1 : 0),
      // Local re-sorts/filter tweaks reapply the same rows without a fetch:
      // keep the original fetch time rather than stamping "now" as if the
      // data had just been refreshed.
      ...(fetchedAt != null
        ? { lastUpdated: formatTime(new Date(fetchedAt)) }
        : {}),
    });
    this.commitBoardControls();
  },

  clearShareCopiedTimer() {
    if (this.shareCopiedTimer) {
      clearTimeout(this.shareCopiedTimer);
      this.shareCopiedTimer = undefined;
    }
  },

  persistSelectedTournament(selected?: TournamentOption) {
    if (!selected) {
      return;
    }
    wx.setStorageSync(SELECTED_TOURNAMENT_ID_KEY, selected.id);
    wx.setStorageSync(SELECTED_TOURNAMENT_NAME_KEY, selected.name);
  },

  onKeyword(event: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this.setData({ keyword: event.detail.keyword.slice(0, 100) });
  },

  onSearch(event?: WechatMiniprogram.CustomEvent<{ keyword: string }>) {
    this._submittedKeyword = (event ? event.detail.keyword : this.data.keyword)
      .trim()
      .slice(0, 100);
    if (event) {
      this.setData({ keyword: this._submittedKeyword });
    }
    this.reloadBoardControls({ fetchLegacy: true });
  },

  onResetSearch() {
    this._submittedKeyword = "";
    this.setData({ keyword: "" });
    this.reloadBoardControls({ fetchLegacy: true });
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const next = Number(event.detail.value);
    if (!Number.isFinite(next) || next <= 0) return;
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.failedEntryCount = 0;
    this.cachedLiveStoredAt = undefined;
    clearTournamentBoard(this);
    this.setData({
      event: next,
      hasData: false,
      rowCount: 0,
      displayedRows: [],
      lastUpdated: "",
      ...emptyCompareState(),
    });
    this.liveRefresh?.sync();
    this.loadRows();
  },

  onTournamentChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const selectedTournamentIndex = Number(event.detail.value);
    if (!Number.isFinite(selectedTournamentIndex)) return;
    const selectedTournament = this.data.tournaments[selectedTournamentIndex];
    if (!selectedTournament) return;
    this.liveRefresh?.stop();
    this.liveSnapshot = null;
    this.failedEntryCount = 0;
    this.cachedLiveStoredAt = undefined;
    clearTournamentBoard(this);
    this.setData({
      selectedTournamentIndex,
      selectedTournament,
      rowCount: 0,
      displayedRows: [],
      hasData: false,
      lastUpdated: "",
      ...emptyCompareState(),
    });
    this.persistSelectedTournament(selectedTournament);
    this.liveRefresh?.sync();
    this.loadRows();
  },

  onSortTap(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { key: SortKey }
    >,
  ) {
    const sortKey = event.currentTarget.dataset.key;
    const sortDesc =
      this.data.sortKey === sortKey
        ? !this.data.sortDesc
        : sortKey !== "overallRank" && sortKey !== "entryName";
    this.setData({ sortKey, sortDesc });
    this.reloadBoardControls();
  },

  onToggleChip(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { value: string }
    >,
  ) {
    const value = String(event.currentTarget.dataset.value || "");
    if (!value) {
      return;
    }
    const chipFilters = this.data.chipFilters.includes(value)
      ? this.data.chipFilters.filter((item) => item !== value)
      : [...this.data.chipFilters, value];
    this.setData({ chipFilters });
    this.reloadBoardControls();
  },

  onToggleCaptain(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { element: string }
    >,
  ) {
    const element = Number(event.currentTarget.dataset.element);
    if (!Number.isSafeInteger(element) || element <= 0) {
      return;
    }
    const captainFilters = this.data.captainFilters.includes(element)
      ? this.data.captainFilters.filter((item) => item !== element)
      : [...this.data.captainFilters, element].slice(0, 15);
    this.setData({ captainFilters });
    this.reloadBoardControls();
  },

  onToggleAdvanced() {
    const filterSheetOpen = !this.data.filterSheetOpen;
    this.setData({ filterSheetOpen });
    if (filterSheetOpen) void this.loadSelectionIndex();
  },

  onCloseFilterSheet() {
    this.setData({ filterSheetOpen: false });
  },

  onClearAllFilters() {
    // Same semantics as the empty-state clear: in-memory rows may be a
    // keyword-filtered subset, so the cleared-filter reload refetches.
    this.onEmptyResultsAction();
  },

  onToggleCompare() {
    this.compareRequestId += 1;
    if (this.data.compareMode) {
      this.setData({
        compareMode: false,
        compareIds: [],
        compareHint: compareHintText(0),
        compareOpen: false,
        compareLoading: false,
        compareError: "",
        compareLeft: null,
        compareRight: null,
        compareLineupRows: [],
        compareLeftPickCount: 0,
        compareRightPickCount: 0,
      });
      this.syncBoardCompareMarkers();
      return;
    }
    this.setData({
      compareMode: true,
      compareIds: [],
      compareHint: compareHintText(0),
      compareOpen: false,
      compareLoading: false,
      compareError: "",
      compareLeft: null,
      compareRight: null,
      compareLineupRows: [],
      compareLeftPickCount: 0,
      compareRightPickCount: 0,
    });
    this.syncBoardCompareMarkers();
  },

  onCloseCompare() {
    this.compareRequestId += 1;
    this.setData({ compareOpen: false, compareLoading: false });
  },

  onOpenCompareSheet() {
    if (this.data.compareIds.length !== 2) return;
    if (this.usingLegacyBoard) {
      const compareSelection = compareSelectionState(
        this.rows,
        this.data.compareIds,
      );
      if (!compareSelection.compareLeft || !compareSelection.compareRight) return;
      this.setData({ ...compareSelection, compareOpen: true });
      return;
    }
    void this.loadCompareSquads();
  },

  toggleCompareEntry(entry: number) {
    const current = this.data.compareIds.slice();
    const index = current.indexOf(entry);
    if (index >= 0) {
      current.splice(index, 1);
    } else if (current.length >= 2) {
      return;
    } else {
      current.push(entry);
    }
    this.compareRequestId += 1;
    const left = current[0]
      ? this.rows.find(
          (row: DisplayTournamentRow) => row.entry === current[0],
        ) || null
      : null;
    const right = current[1]
      ? this.rows.find(
          (row: DisplayTournamentRow) => row.entry === current[1],
        ) || null
      : null;
    this.setData({
      compareIds: current,
      compareHint: compareHintText(current.length),
      compareLeft: left,
      compareRight: right,
      compareOpen: this.usingLegacyBoard && current.length === 2,
      compareLoading: false,
      compareError: "",
      compareLineupRows: [],
      compareLeftPickCount: 0,
      compareRightPickCount: 0,
    });
    this.syncBoardCompareMarkers();
    if (current.length === 2 && !this.usingLegacyBoard) {
      void this.loadCompareSquads();
    }
  },

  onToggleOwnership() {
    this.setData({ ownershipExpanded: !this.data.ownershipExpanded });
  },

  onOwnershipScopeTap(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { scope: TournamentOwnershipScope }
    >,
  ) {
    this.setData({ ownershipScope: event.currentTarget.dataset.scope });
    this.reloadBoardControls();
  },

  onOwnershipCaptainTap(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { mode: TournamentCaptainMode }
    >,
  ) {
    this.setData({ ownershipCaptainMode: event.currentTarget.dataset.mode });
    this.reloadBoardControls();
  },

  onOwnershipTeamChange(event: WechatMiniprogram.PickerChange) {
    const selectedOwnershipTeamIndex = Number(event.detail.value);
    if (!Number.isFinite(selectedOwnershipTeamIndex)) return;
    const selectedOwnershipTeam =
      this.data.ownershipTeamOptions[selectedOwnershipTeamIndex];
    const ownershipPositionOptions = collectOwnershipPositions(
      this.ownershipPlayers,
      selectedOwnershipTeam,
    );
    this.setData({
      selectedOwnershipTeamIndex,
      selectedOwnershipTeam,
      ownershipPositionOptions,
      selectedOwnershipPositionIndex: 0,
      selectedOwnershipPosition: "",
      ownershipAvailablePlayers: [],
      ownershipAvailablePlayerNames: [],
    });
  },

  onOwnershipPositionChange(event: WechatMiniprogram.PickerChange) {
    const selectedOwnershipPositionIndex = Number(event.detail.value);
    if (!Number.isFinite(selectedOwnershipPositionIndex)) return;
    const selectedOwnershipPosition =
      this.data.ownershipPositionOptions[selectedOwnershipPositionIndex] || "";
    const ownershipAvailablePlayers = filterOwnershipPlayers(
      this.ownershipPlayers,
      this.data.selectedOwnershipTeam,
      selectedOwnershipPosition,
    );
    this.setData({
      selectedOwnershipPositionIndex,
      selectedOwnershipPosition,
      ownershipAvailablePlayers,
      ownershipAvailablePlayerNames: ownershipAvailablePlayers.map(
        (player) => player.name,
      ),
    });
  },

  onOwnershipPlayerChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value);
    if (!Number.isFinite(index)) return;
    const player = this.data.ownershipAvailablePlayers[index];
    if (
      !player ||
      this.data.selectedOwnershipPlayers.some(
        (selected) => selected.element === player.element,
      )
    ) {
      return;
    }
    if (this.data.selectedOwnershipPlayers.length >= 5) return;
    this.setData({
      selectedOwnershipPlayers: [...this.data.selectedOwnershipPlayers, player],
    });
    this.reloadBoardControls();
  },

  onOwnershipSearchInput(event: WechatMiniprogram.Input) {
    const ownershipSearch = textValue(event.detail.value, "");
    this.setData({
      ownershipSearch,
      ownershipSearchResults: computeOwnershipSearchResults(
        this.ownershipPlayers,
        ownershipSearch,
        this.data.selectedOwnershipPlayers,
      ),
    });
  },

  onOwnershipSearchPick(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { element: string }
    >,
  ) {
    const element = Number(event.currentTarget.dataset.element);
    const player = this.ownershipPlayers.find(
      (option: OwnershipPlayerOption) => option.element === element,
    );
    if (
      !player ||
      this.data.selectedOwnershipPlayers.length >= 5 ||
      this.data.selectedOwnershipPlayers.some(
        (selected) => selected.element === element,
      )
    ) {
      return;
    }
    this.setData({
      selectedOwnershipPlayers: [...this.data.selectedOwnershipPlayers, player],
      ownershipSearch: "",
      ownershipSearchResults: [],
    });
    this.reloadBoardControls();
  },

  onRemoveOwnershipPlayer(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { element: string }
    >,
  ) {
    const element = Number(event.currentTarget.dataset.element);
    this.setData({
      selectedOwnershipPlayers: this.data.selectedOwnershipPlayers.filter(
        (player) => player.element !== element,
      ),
    });
    this.reloadBoardControls();
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
      ownershipAvailablePlayerNames: [],
      ownershipSearch: "",
      ownershipSearchResults: [],
    });
    this.reloadBoardControls();
  },

  onToggleTeamExposure() {
    this.setData({ teamExposureExpanded: !this.data.teamExposureExpanded });
  },

  onTeamExposureScopeTap(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { scope: TournamentOwnershipScope }
    >,
  ) {
    this.setData({ teamExposureScope: event.currentTarget.dataset.scope });
    this.reloadBoardControls();
  },

  onTeamExposureTeamChange(event: WechatMiniprogram.PickerChange) {
    const pendingExposureTeamIndex = Number(event.detail.value);
    if (!Number.isFinite(pendingExposureTeamIndex)) return;
    const pendingExposureTeam =
      this.data.teamExposureTeams[pendingExposureTeamIndex] || null;
    this.setData({ pendingExposureTeamIndex, pendingExposureTeam });
  },

  /** Second step of the cascade — picking a count commits the rule, like ownership's player picker. */
  onTeamExposureCountChange(event: WechatMiniprogram.PickerChange) {
    const pendingExposureTeam = this.data.pendingExposureTeam;
    if (!pendingExposureTeam) {
      return;
    }
    const countIndex = Number(event.detail.value);
    if (!Number.isFinite(countIndex)) return;
    const count = countIndex + 1;
    const rules = this.data.teamExposureRules.filter(
      (rule) => rule.teamShortName !== pendingExposureTeam.shortName,
    );
    if (rules.length >= 4) return;
    rules.push({
      teamId: pendingExposureTeam.id,
      teamShortName: pendingExposureTeam.shortName,
      name: pendingExposureTeam.name,
      count,
    });
    this.setData({
      teamExposureRules: rules,
      pendingExposureTeam: null,
      pendingExposureTeamIndex: 0,
    });
    this.reloadBoardControls();
  },

  onRemoveTeamExposureRule(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { shortname?: string }
    >,
  ) {
    const shortName = event.currentTarget.dataset.shortname;
    this.setData({
      teamExposureRules: this.data.teamExposureRules.filter(
        (rule) => rule.teamShortName !== shortName,
      ),
    });
    this.reloadBoardControls();
  },

  onClearTeamExposureFilter() {
    this.setData({
      teamExposureRules: [],
      pendingExposureTeam: null,
      pendingExposureTeamIndex: 0,
      teamExposureScope: "any",
    });
    this.reloadBoardControls();
  },

  loadMore(): Promise<void> | void {
    if (!this.data.hasMore) {
      return;
    }
    if (this.usingLegacyBoard || !this.boardPage) {
      this.applyRows(this.rows, false);
      return;
    }
    const currentPage = this.boardPage;
    const variables = this.buildBoardVariables(
      currentPage.page + 1,
      currentPage.boardRevision,
    );
    if (!variables) return;
    const requestKey = `board-more:${JSON.stringify(variables)}`;
    if (this.rowsRequest && this.rowsRequestKey === requestKey) {
      return this.rowsRequest;
    }
    const requestId = this.rowsRequestId + 1;
    this.rowsRequestId = requestId;
    this.setData({ refreshing: true, error: "", errorSuffix: "" });
    const request = (async () => {
      try {
        const result = await getEntryLiveCompetitionBoardPage(variables, {
          expectedSeason: this.currentBoardScope()?.season,
          trace: capturePageRequestTrace({
            callerSurface: "live-tournament-board",
            trigger: "pagination",
          }),
        });
        if (!this.pageVisible || requestId !== this.rowsRequestId) return;
        this.applyBoardPage(result.page, false);
      } catch (error) {
        if (!this.pageVisible || requestId !== this.rowsRequestId) return;
        if (hasLiveBoardErrorCode(error, "LIVE_BOARD_REVISION_GONE")) {
          await this.loadRows({ background: true, forceRefresh: true });
          return;
        }
        this.setData({
          error: error instanceof Error ? error.message : "下一页加载失败",
          errorSuffix: "已加载榜单保持不变",
        });
      } finally {
        if (requestId === this.rowsRequestId) {
          this.setData({ refreshing: false });
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
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  },

  onOpenEntry(
    event: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { entryId?: string; entry?: string }
    >,
  ) {
    const entry = Number(
      event.currentTarget.dataset.entryId || event.currentTarget.dataset.entry,
    );
    if (!Number.isFinite(entry) || entry <= 0) {
      return;
    }
    if (this.data.compareMode) {
      this.toggleCompareEntry(entry);
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

  async collectBoardShareRows(): Promise<DisplayTournamentRow[]> {
    const currentRows =
      this.shareRows && this.shareRows.length > 0
        ? this.shareRows
        : this.data.displayedRows || [];
    const board = this.boardPage;
    const scope = this.currentBoardScope();
    if (
      this.usingLegacyBoard ||
      !board ||
      !scope ||
      currentRows.length >= board.filteredEntries
    ) {
      return currentRows;
    }

    const variables = this.buildBoardVariables(1, board.boardRevision);
    if (!variables) throw new Error("当前赛事范围已变化");
    const scopeKey = liveBoardLastGoodKey(scope);
    const maximumPages = Math.min(10, Math.ceil(board.filteredEntries / 50));
    const allRows: DisplayTournamentRow[] = [];
    let hasMore = true;
    for (let pageNumber = 1; pageNumber <= maximumPages && hasMore; pageNumber += 1) {
      const result = await getEntryLiveCompetitionBoardPage(
        { ...variables, page: pageNumber, pageSize: 50 },
        {
          expectedSeason: scope.season,
          trace: capturePageRequestTrace({
            callerSurface: "live-tournament-share",
            trigger: "load",
          }),
        },
      );
      const activeScope = this.currentBoardScope();
      if (
        !this.pageVisible ||
        !activeScope ||
        liveBoardLastGoodKey(activeScope) !== scopeKey ||
        this.boardPage?.boardRevision !== board.boardRevision ||
        result.page.filteredEntries !== board.filteredEntries
      ) {
        throw new Error("榜单已更新，请重新分享");
      }
      allRows.push(...boardRowsToLiveRows(result.page).map(normalizeRow));
      hasMore = result.page.hasMore;
    }
    if (hasMore || allRows.length !== board.filteredEntries) {
      throw new Error("完整榜单尚未加载完成");
    }
    return allRows.map((row, index) => ({
      ...row,
      visibleRank: index + 1,
    }));
  },

  onCopyShare(): Promise<void> {
    if (this.shareRequest) return this.shareRequest;
    const request = (async () => {
      let complete = true;
      let rows: DisplayTournamentRow[] = [];
      try {
        rows = await this.collectBoardShareRows();
      } catch (error) {
        complete = false;
        rows =
          this.shareRows && this.shareRows.length > 0
            ? this.shareRows
            : this.data.displayedRows || [];
        miniLogger.warn(
          "copy-share.tournament-partial",
          error instanceof Error ? error.message : "failed",
        );
        if (rows.length > 0) {
          wx.showToast({
            title: "完整榜单暂未取齐，将分享已加载内容",
            icon: "none",
            duration: 2500,
          });
        }
      }
      try {
        if (rows.length === 0) {
          wx.showToast({ title: "还没有可分享的榜单", icon: "none" });
          return;
        }
        const expectedRows = this.boardPage?.filteredEntries || this.data.filteredCount;
        const entriesText =
          complete || this.usingLegacyBoard
            ? this.data.entriesText
            : `${rows.length}/${expectedRows}（当前已加载）`;
        const text = formatLiveTournamentShareText({
          gameweek: this.data.event,
          tournamentName: this.data.selectedTournament?.name,
          tournamentId: this.data.selectedTournament?.id,
          highestText: this.data.highestText,
          averageText: this.data.averageText,
          entriesText,
          rows,
        });
        const ok = await copyShareText(text);
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
      } catch (error) {
        miniLogger.error(
          "copy-share.tournament",
          error instanceof Error ? error.message : "failed",
        );
        wx.showToast({ title: "复制失败", icon: "none" });
      }
    })();
    this.shareRequest = request;
    const clearRequest = () => {
      if (this.shareRequest === request) {
        this.shareRequest = null;
      }
    };
    void request.then(clearRequest, clearRequest);
    return request;
  },

  onCloseShareSheet() {
    this.setData({ shareSheetOpen: false });
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
    if (this.data.emptyState === "preseason") {
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
      chipFilters: [],
      captainFilters: [],
      selectedOwnershipPlayers: [],
      ownershipScope: "any",
      ownershipCaptainMode: "any",
      selectedOwnershipTeamIndex: 0,
      selectedOwnershipTeam: null,
      selectedOwnershipPositionIndex: 0,
      selectedOwnershipPosition: "",
      ownershipAvailablePlayers: [],
      ownershipAvailablePlayerNames: [],
      ownershipSearch: "",
      ownershipSearchResults: [],
      ownershipMatchedText: "",
      teamExposureMatchedText: "",
      teamExposureRules: [],
      pendingExposureTeamIndex: 0,
      pendingExposureTeam: null,
      teamExposureScope: "any",
      activeFilterCount: 0,
    });
    // Legacy keyword reads may contain only a subset, so clearing still needs
    // a server read. Keep the previous controls and rows transactionally until
    // that replacement succeeds.
    this.reloadBoardControls({ fetchLegacy: true });
  },
});
