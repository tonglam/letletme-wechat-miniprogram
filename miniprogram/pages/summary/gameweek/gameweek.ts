import { PerformancePage } from "../../../utils/performance-page";
import { setPageTitle } from "../../../utils/navigation";
import { getMiniGameweekSummary } from "../../../services/summary.service";
import type { GameweekOverallSummary } from "../../../models/summary";
import {
  capturePageRequestTrace,
  type PageRequestTrace
} from "../../../services/graphql.service";
import {
  asArray,
  asRecord,
  fieldText,
  firstValue,
  formatCompactNumber,
  formatPoints,
  numberValue,
  type DisplayMetric,
  type DisplayRow,
  type SummaryRecord
} from "../../../utils/summary-format";
import {
  buildDreamTeamPitchState,
  type SquadPitchHeader,
  type SquadPitchPlayer
} from "../../../utils/squad-pitch";
import { presentSquadPitchShareImage } from "../../../utils/squad-pitch-canvas";
import { buildPlayerLiveDetail, type PlayerLiveDetailView } from "../../live/entry/player-detail";
import type { LivePlayerRow } from "../../../models/live";
import { indexDreamTeamById, indexEventPlayersByRowId } from "./dream-detail";

type GameweekTab = "summary" | "dreamTeam" | "elite" | "transfers";
type GameweekResumeStage = "startup" | "data" | "refresh";

interface PitchPlayer {
  id: string;
  name: string;
  team: string;
  points: string;
}

interface PitchGroup {
  id: string;
  title: string;
  players: PitchPlayer[];
  emptyText: string;
}

interface GameweekSummaryData {
  loading: boolean;
  refreshing: boolean;
  error: string;
  summaryError: string;
  dreamTeamError: string;
  eliteError: string;
  transfersError: string;
  staleNotice: string;
  event: number;
  maxGw: number;
  activeTab: GameweekTab;
  showSummary: boolean;
  showDreamTeam: boolean;
  showElite: boolean;
  showTransfers: boolean;
  headlineStats: DisplayMetric[];
  mostRows: DisplayMetric[];
  chipRows: DisplayRow[];
  eliteRows: DisplayRow[];
  transfersInRows: DisplayRow[];
  transfersOutRows: DisplayRow[];
  hasSummary: boolean;
  hasDreamTeam: boolean;
  hasElite: boolean;
  hasTransfers: boolean;
  pitchPlayers: SquadPitchPlayer[];
  pitchBench: SquadPitchPlayer[];
  pitchHeader: SquadPitchHeader | null;
  pitchBenchBoost: boolean;
  shareBusy: boolean;
  playerDetailOpen: boolean;
  playerDetail: PlayerLiveDetailView | null;
}

PerformancePage({
  data: {
    loading: false,
    refreshing: false,
    error: "",
    summaryError: "",
    dreamTeamError: "",
    eliteError: "",
    transfersError: "",
    staleNotice: "",
    event: 0,
    maxGw: 1,
    activeTab: "summary",
    showSummary: true,
    showDreamTeam: false,
    showElite: false,
    showTransfers: false,
    headlineStats: [],
    mostRows: [],
    chipRows: [],
    eliteRows: [],
    transfersInRows: [],
    transfersOutRows: [],
    hasSummary: false,
    hasDreamTeam: false,
    hasElite: false,
    hasTransfers: false,
    pitchPlayers: [],
    pitchBench: [],
    pitchHeader: null,
    pitchBenchBoost: false,
    shareBusy: false,
    playerDetailOpen: false,
    playerDetail: null
  } as GameweekSummaryData,

  pageVisible: false,
  hasShown: false,
  lifecycleRevision: 0,
  requestId: 0,
  startupPending: false,
  resumeStage: null as GameweekResumeStage | null,
  activeLoadForceRefresh: false,
  resumeForceRefresh: false,
  dreamTeamById: {} as Record<string, LivePlayerRow>,
  eliteById: {} as Record<string, LivePlayerRow>,

  async onLoad() {
    this.pageVisible = true;
    return this.startPageLoad("load");
  },

  onShow() {
    this.pageVisible = true;
    const resumed = this.hasShown;
    this.hasShown = true;
    if (!resumed || !this.resumeStage) return undefined;
    const resumeStage = this.resumeStage;
    const resumeForceRefresh = this.resumeForceRefresh || resumeStage === "refresh";
    if (resumeStage === "startup") {
      const task = this.startPageLoad("show");
      return task.finally(() => {
        if (this.pageVisible && !this.startupPending) {
          this.resumeStage = null;
          this.resumeForceRefresh = false;
        }
      });
    }
    this.setData({ loading: false, refreshing: false });
    const trace = capturePageRequestTrace({ callerSurface: "gameweek-summary", trigger: "show" });
    const task = this.loadData(resumeForceRefresh, trace, this.lifecycleRevision);
    return task.finally(() => {
      if (this.pageVisible && !this.activeLoadForceRefresh) {
        this.resumeStage = null;
        this.resumeForceRefresh = false;
      }
    });
  },

  onHide() {
    this.pageVisible = false;
    this.resumeForceRefresh = this.resumeForceRefresh || this.activeLoadForceRefresh;
    this.resumeStage = this.startupPending
      ? "startup"
      : this.data.refreshing || this.activeLoadForceRefresh
        ? "refresh"
        : this.data.loading
          ? "data"
          : null;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  onUnload() {
    this.pageVisible = false;
    this.resumeStage = null;
    this.activeLoadForceRefresh = false;
    this.resumeForceRefresh = false;
    this.lifecycleRevision += 1;
    this.requestId += 1;
  },

  async startPageLoad(trigger: "load" | "show") {
    const lifecycleRevision = this.lifecycleRevision;
    const trace = capturePageRequestTrace({ callerSurface: "gameweek-summary", trigger });
    this.startupPending = true;
    await this.ensureAppDataReady();
    if (!this.pageVisible || lifecycleRevision !== this.lifecycleRevision) return;
    this.startupPending = false;
    const currentGw = Math.max(1, Number(getApp<IAppOption>().globalData.gw) || 1);
    this.setData({ event: currentGw, maxGw: currentGw });
    setPageTitle(`GW${currentGw} 总结`);
    await this.loadData(false, trace, lifecycleRevision);
  },

  onPullDownRefresh() {
    return this.refreshData().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    if (!app.globalData.gw) {
      await app.initAppData();
    }
  },

  async loadData(
    forceRefresh = false,
    trace?: PageRequestTrace,
    lifecycleRevision?: number
  ) {
    const requestTrace = trace ?? capturePageRequestTrace({
      callerSurface: "gameweek-summary",
      trigger: forceRefresh ? "refresh" : "load"
    });
    const ownerRevision = lifecycleRevision ?? this.lifecycleRevision;
    const requestId = ++this.requestId;
    this.activeLoadForceRefresh = forceRefresh;
    const isActiveRequest = () => this.pageVisible
      && ownerRevision === this.lifecycleRevision
      && requestId === this.requestId;
    this.setData({
      loading: true,
      error: "",
      summaryError: "",
      dreamTeamError: "",
      eliteError: "",
      transfersError: "",
      staleNotice: ""
    });
    try {
      const result = await getMiniGameweekSummary(this.data.event, forceRefresh, requestTrace);
      if (!isActiveRequest()) return;
      const sectionErrors = Object.values(result.errors);
      if (sectionErrors.every(Boolean)) {
        this.dreamTeamById = {};
        this.eliteById = {};
        this.setData({
          error: sectionErrors[0] || "GW 总结加载失败",
          playerDetailOpen: false,
          playerDetail: null
        });
        return;
      }

      const mapped = mapGameweekData(
        result.summary,
        result.dreamTeam,
        result.elite,
        result.transfers,
        this.data.event
      );
      this.dreamTeamById = mapped.dreamTeamById;
      this.eliteById = mapped.eliteById;
      this.setData({
        ...mapped.pageData,
        summaryError: result.errors.summary,
        dreamTeamError: result.errors.dreamTeam,
        eliteError: result.errors.elite,
        transfersError: result.errors.transfers,
        staleNotice: result.meta.stale ? "当前为上次成功数据" : ""
      });
    } catch (error) {
      if (!isActiveRequest()) return;
      this.dreamTeamById = {};
      this.eliteById = {};
      this.setData({
        error: error instanceof Error ? error.message : "GW 总结加载失败",
        playerDetailOpen: false,
        playerDetail: null
      });
    } finally {
      if (isActiveRequest()) {
        this.setData({ loading: false });
        this.activeLoadForceRefresh = false;
      }
    }
  },

  async refreshData() {
    this.setData({ refreshing: true, error: "" });
    try {
      await this.loadData(true);
      if (
        !this.data.error
        && !this.data.summaryError
        && !this.data.dreamTeamError
        && !this.data.eliteError
        && !this.data.transfersError
      ) {
        wx.showToast({ title: "刷新成功", icon: "success", duration: 1000 });
      }
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "GW 总结刷新失败" });
    } finally {
      this.setData({ refreshing: false });
    }
  },

  onGwChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const next = Number(event.detail.value);
    if (!Number.isFinite(next) || next <= 0) return;
    this.setData({
      event: next,
      playerDetailOpen: false,
      playerDetail: null
    });
    setPageTitle(`GW${next} 总结`);
    this.loadData();
  },

  onTabTap(event: WechatMiniprogram.TouchEvent) {
    const tab = String(event.currentTarget.dataset.tab || "summary") as GameweekTab;
    this.setActiveTab(tab);
  },

  setActiveTab(tab: GameweekTab) {
    this.setData({
      activeTab: tab,
      showSummary: tab === "summary",
      showDreamTeam: tab === "dreamTeam",
      showElite: tab === "elite",
      showTransfers: tab === "transfers"
    });
  },

  onRefreshTap() {
    this.refreshData();
  },

  onRetry() {
    this.loadData();
  },

  onDreamPlayerTap(event: WechatMiniprogram.CustomEvent<{ playerId: string }>) {
    this.openPlayerDetail(this.dreamTeamById[String(event.detail?.playerId || "")]);
  },

  onElitePlayerTap(event: WechatMiniprogram.TouchEvent) {
    this.openPlayerDetail(this.eliteById[String(event.currentTarget.dataset.id || "")]);
  },

  openPlayerDetail(player?: LivePlayerRow) {
    if (!player) return;
    this.setData({
      playerDetailOpen: true,
      playerDetail: buildPlayerLiveDetail(player)
    });
  },

  onCloseDreamPlayer() {
    this.setData({
      playerDetailOpen: false
    });
  },

  async onShareDreamPitch() {
    if (this.data.shareBusy) return;
    const pitch = this.selectComponent("#dream-squad-pitch") as WechatMiniprogram.Component.TrivialInstance & {
      exportShareImage?: () => Promise<string>;
    } | null;
    if (!pitch?.exportShareImage) {
      wx.showToast({ title: "阵容图还没准备好", icon: "none" });
      return;
    }
    this.setData({ shareBusy: true });
    try {
      await presentSquadPitchShareImage(await pitch.exportShareImage());
    } catch {
      wx.showToast({ title: "阵容图生成失败", icon: "none" });
    } finally {
      this.setData({ shareBusy: false });
    }
  }
});

function mapGameweekData(
  summary: GameweekOverallSummary | undefined,
  dreamTeam: unknown[],
  elite: unknown[],
  transfers: unknown,
  eventId?: number
): {
  pageData: Partial<GameweekSummaryData>;
  dreamTeamById: Record<string, LivePlayerRow>;
  eliteById: Record<string, LivePlayerRow>;
} {
  const summaryRecord = asRecord(summary);
  const transfersRecord = asRecord(transfers);
  const transfersIn = firstValue(transfersRecord, ["transfers_in", "transfersIn", "in"]) || [];
  const transfersOut = firstValue(transfersRecord, ["transfers_out", "transfersOut", "out"]) || [];
  const chipRows = mapChipRows(firstValue(summaryRecord, ["chipPlays", "chips"]));
  const pitchGroups = mapPitchGroups(dreamTeam);
  const dreamPitch = buildDreamTeamPitchState(dreamTeam, eventId);
  const eliteSource = asArray(elite).filter((player) => playerPoints(asRecord(player), "points") >= 10);
  const eliteRows = mapPlayerRows(eliteSource, "elite", "points");
  const transfersInRows = mapPlayerRows(transfersIn, "transfers-in", "transfersInEvent");
  const transfersOutRows = mapPlayerRows(transfersOut, "transfers-out", "transfersOutEvent");
  const summaryStats = mapOverallStats(summaryRecord, transfersInRows, transfersOutRows);
  const headlineStats = summaryStats.filter((stat) => HEADLINE_LABELS.indexOf(stat.label) >= 0);
  const mostRows = summaryStats.filter((stat) => HEADLINE_LABELS.indexOf(stat.label) < 0);

  return {
    pageData: {
      headlineStats,
      mostRows,
      chipRows,
      pitchPlayers: dreamPitch.pitchPlayers,
      pitchBench: dreamPitch.pitchBench,
      pitchHeader: dreamPitch.pitchHeader,
      pitchBenchBoost: false,
      eliteRows,
      transfersInRows,
      transfersOutRows,
      hasSummary: summaryStats.length > 0 || chipRows.length > 0,
      hasDreamTeam: dreamPitch.pitchPlayers.length > 0 || pitchGroups.some((group) => group.players.length > 0),
      hasElite: eliteRows.length > 0,
      hasTransfers: transfersInRows.length > 0 || transfersOutRows.length > 0
    },
    dreamTeamById: indexDreamTeamById(dreamPitch.pitchPlayers, dreamTeam),
    eliteById: indexEventPlayersByRowId(eliteRows, eliteSource, "高分球员")
  };
}

const HEADLINE_LABELS = ["最高分", "平均分"];

function mapOverallStats(
  summary: SummaryRecord,
  transfersInRows: DisplayRow[],
  transfersOutRows: DisplayRow[]
): DisplayMetric[] {
  if (Object.keys(summary).length === 0) {
    return [];
  }

  const mostSelected = asRecord(firstValue(summary, ["mostSelectedPlayer"]));
  const mostTransferIn = asRecord(firstValue(summary, ["mostTransferInPlayer"]));
  const mostCaptained = asRecord(firstValue(summary, ["mostCaptainedPlayer"]));
  const mostVice = asRecord(firstValue(summary, ["mostViceCaptainedPlayer"]));
  const topElement = asRecord(firstValue(summary, ["topElementInfo"]));
  const topElementPlayer = asRecord(firstValue(topElement, ["player"]));
  const topElementTeam = asRecord(firstValue(topElementPlayer, ["team"]));
  const topElementTeamShortName = fieldText(topElementPlayer, ["teamShortName"], fieldText(topElement, ["teamShortName"], fieldText(topElementTeam, ["shortName", "name"], "")));

  return [
    {
      label: "最高分",
      value: fieldText(summary, ["highestScore"]),
      meta: fieldText(summary, ["highestScoringEntry", "highestEntry"], "")
    },
    {
      label: "平均分",
      value: fieldText(summary, ["averageEntryScore", "averageScore"])
    },
    {
      label: "最多选择球员",
      value: formatPlayerTeam(fieldText(summary, ["mostSelectedWebName"], fieldText(mostSelected, ["webName", "name"])), fieldText(mostSelected, ["teamShortName"], ""))
    },
    {
      label: "本轮最佳球员",
      value: formatPlayerTeam(fieldText(topElementPlayer, ["webName", "name"]), topElementTeamShortName),
      meta: `${formatPoints(firstValue(topElement, ["points"]))}分`
    },
    {
      label: "最多选择队长",
      value: formatPlayerTeam(fieldText(summary, ["mostCaptainedWebName"], fieldText(mostCaptained, ["webName", "name"])), fieldText(mostCaptained, ["teamShortName"], ""))
    },
    {
      label: "最多选择副队长",
      value: formatPlayerTeam(fieldText(summary, ["mostViceCaptainedWebName"], fieldText(mostVice, ["webName", "name"])), fieldText(mostVice, ["teamShortName"], ""))
    },
    {
      label: "最多转入",
      value: formatPlayerTeam(
        fieldText(summary, ["mostTransferredInWebName", "mostTransferInWebName"], fieldText(mostTransferIn, ["webName", "name"], transfersInRows[0]?.title || "-")),
        fieldText(mostTransferIn, ["teamShortName"], getTeamFromPlayerTitle(transfersInRows[0]?.title || ""))
      )
    },
    {
      label: "最多转出",
      value: transfersOutRows[0]?.title || fieldText(summary, ["mostTransferredOutWebName", "mostTransferOutWebName"])
    }
  ].filter((row) => row.value !== "-");
}

function formatPlayerTeam(playerName: string, teamShortName: string): string {
  if (!playerName || playerName === "-") {
    return "-";
  }

  return teamShortName && teamShortName !== "-" ? `${playerName} (${teamShortName})` : playerName;
}

function getTeamFromPlayerTitle(title: string): string {
  const match = title.match(/\s*\(([^)]+)\)$/);
  return match ? match[1] : "";
}

function mapChipRows(chips: unknown): DisplayRow[] {
  const rows = asArray(chips).map((item, index) => {
    const row = asRecord(item);
    const count = numberValue(firstValue(row, ["numberPlayed", "times", "count"])) ?? 0;
    return {
      id: `chip-${index}`,
      title: fieldText(row, ["chipName", "name"], "Chip"),
      value: formatCompactNumber(count),
      meta: "开卡数量",
      count
    };
  });
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    value: row.value,
    meta: row.meta,
    barStyle: `width: ${Math.max(6, Math.round((row.count / maxCount) * 100))}%;`
  }));
}

function mapPitchGroups(players: unknown[]): PitchGroup[] {
  const groups = [
    { id: "gkp", title: "GKP", types: ["1", "GKP", "GK"] },
    { id: "def", title: "DEF", types: ["2", "DEF"] },
    { id: "mid", title: "MID", types: ["3", "MID"] },
    { id: "fwd", title: "FWD", types: ["4", "FWD"] }
  ];

  return groups.map((group) => ({
    id: group.id,
    title: group.title,
    players: players
      .map(asRecord)
      .filter((player) => group.types.indexOf(fieldText(player, ["elementType", "position", "singularNameShort"], "")) >= 0)
      .map((player, index) => ({
        id: `${group.id}-${index}`,
        name: fieldText(player, ["webName", "name", "playerName"], "-"),
        team: fieldText(player, ["teamShortName", "teamName", "team"], ""),
        points: String(playerPoints(player, "points"))
      })),
    emptyText: "该位置还没有梦之队球员"
  }));
}

function mapPlayerRows(players: unknown, prefix: string, valueKey: string): DisplayRow[] {
  return asArray(players).map((item, index) => mapPlayerRow(asRecord(item), `${prefix}-${index}`, valueKey));
}

function playerPoints(player: SummaryRecord, valueKey: string): number {
  const rawValue = firstValue(player, [valueKey, "points", "totalPoints"]);
  if (typeof rawValue === "number") {
    return rawValue;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapPlayerRow(player: SummaryRecord, id: string, valueKey: string): DisplayRow {
  const team = fieldText(player, ["teamShortName", "teamName", "team"], "");
  const rawValue = firstValue(player, [valueKey, "points", "totalPoints"]);
  const points = fieldText(player, [valueKey, "points", "totalPoints"]);
  const totalPoints = fieldText(player, ["totalPoints"], "");
  const isTransfers = valueKey.indexOf("transfers") >= 0;

  return {
    id,
    title: formatPlayerTeam(fieldText(player, ["webName", "name", "playerName"]), team),
    value: isTransfers ? formatCompactNumber(rawValue) : `${points}分`,
    meta: totalPoints && totalPoints !== points ? `总分 ${totalPoints}` : "",
    description: formatRowDescription(player)
  };
}

function formatRowDescription(player: SummaryRecord): string {
  const selectedBy = fieldText(player, ["selectedByPercent"], "");
  if (selectedBy) {
    return `选择率 ${selectedBy}%`;
  }
  return fieldText(player, ["nowCost"], "");
}
