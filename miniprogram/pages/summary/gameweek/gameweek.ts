import {
  getEventDreamTeam,
  getEventEliteElements,
  getEventOverallTransfers,
  getGameweekOverallSummary,
  refreshEventOverallSummary
} from "../../../services/summary.service";
import type { GameweekOverallSummary } from "../../../models/summary";
import {
  asArray,
  asRecord,
  fieldText,
  firstValue,
  formatCompactNumber,
  formatPoints,
  type DisplayGroup,
  type DisplayMetric,
  type DisplayRow,
  type SummaryRecord
} from "../../../utils/summary-format";

type GameweekTab = "summary" | "dreamTeam" | "elite" | "transfers";

interface GameweekSummaryData {
  loading: boolean;
  refreshing: boolean;
  error: string;
  summaryError: string;
  dreamTeamError: string;
  eliteError: string;
  transfersError: string;
  event: number;
  maxGw: number;
  activeTab: GameweekTab;
  showSummary: boolean;
  showDreamTeam: boolean;
  showElite: boolean;
  showTransfers: boolean;
  summaryStats: DisplayMetric[];
  chipRows: DisplayRow[];
  dreamTeamGroups: DisplayGroup[];
  eliteRows: DisplayRow[];
  transfersInRows: DisplayRow[];
  transfersOutRows: DisplayRow[];
  hasSummary: boolean;
  hasDreamTeam: boolean;
  hasElite: boolean;
  hasTransfers: boolean;
}

Page({
  data: {
    loading: false,
    refreshing: false,
    error: "",
    summaryError: "",
    dreamTeamError: "",
    eliteError: "",
    transfersError: "",
    event: 0,
    maxGw: 1,
    activeTab: "summary",
    showSummary: true,
    showDreamTeam: false,
    showElite: false,
    showTransfers: false,
    summaryStats: [],
    chipRows: [],
    dreamTeamGroups: [],
    eliteRows: [],
    transfersInRows: [],
    transfersOutRows: [],
    hasSummary: false,
    hasDreamTeam: false,
    hasElite: false,
    hasTransfers: false
  } as GameweekSummaryData,

  async onLoad() {
    await this.ensureAppDataReady();
    const currentGw = Math.max(1, Number(getApp<IAppOption>().globalData.gw) || 1);
    this.setData({ event: currentGw, maxGw: currentGw });
    this.loadData();
  },

  onPullDownRefresh() {
    this.refreshData().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAppDataReady(): Promise<void> {
    const app = getApp<IAppOption>();
    if (!app.globalData.gw) {
      await app.initAppData();
    }
  },

  async loadData() {
    this.setData({
      loading: true,
      error: "",
      summaryError: "",
      dreamTeamError: "",
      eliteError: "",
      transfersError: ""
    });
    try {
      const [summaryResult, dreamTeamResult, eliteResult, transfersResult] = await Promise.all([
        settle(getGameweekOverallSummary(this.data.event), undefined, "GW 总览加载失败"),
        settle(getEventDreamTeam(this.data.event), [], "梦之队加载失败"),
        settle(getEventEliteElements(this.data.event), [], "高分球员加载失败"),
        settle(getEventOverallTransfers(this.data.event), undefined, "转会趋势加载失败")
      ]);

      const results = [summaryResult, dreamTeamResult, eliteResult, transfersResult];
      if (results.every((result) => Boolean(result.error))) {
        this.setData({ error: results[0].error || "GW 总结加载失败" });
        return;
      }

      this.setData({
        ...mapGameweekData(
          summaryResult.value,
          dreamTeamResult.value,
          eliteResult.value,
          transfersResult.value
        ),
        summaryError: summaryResult.error,
        dreamTeamError: dreamTeamResult.error,
        eliteError: eliteResult.error,
        transfersError: transfersResult.error
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "GW 总结加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async refreshData() {
    this.setData({ refreshing: true, error: "" });
    try {
      await refreshEventOverallSummary(this.data.event);
      await this.loadData();
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
    this.setData({ event: event.detail.value });
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
  }
});

interface LoadResult<T> {
  value: T;
  error: string;
}

async function settle<T>(request: Promise<T>, fallback: T, fallbackMessage: string): Promise<LoadResult<T>> {
  try {
    return { value: await request, error: "" };
  } catch (error) {
    return {
      value: fallback,
      error: error instanceof Error ? error.message : fallbackMessage
    };
  }
}

function mapGameweekData(
  summary: GameweekOverallSummary | undefined,
  dreamTeam: unknown[],
  elite: unknown[],
  transfers: unknown
): Partial<GameweekSummaryData> {
  const summaryRecord = asRecord(summary);
  const transfersRecord = asRecord(transfers);
  const transfersIn = firstValue(transfersRecord, ["transfers_in", "transfersIn", "in"]) || [];
  const transfersOut = firstValue(transfersRecord, ["transfers_out", "transfersOut", "out"]) || [];
  const chipRows = mapChipRows(firstValue(summaryRecord, ["chipPlays", "chips"]));
  const dreamTeamGroups = mapDreamTeamGroups(dreamTeam);
  const eliteRows = mapPlayerRows(
    asArray(elite).filter((player) => playerPoints(asRecord(player), "points") >= 10),
    "elite",
    "points"
  );
  const transfersInRows = mapPlayerRows(transfersIn, "transfers-in", "transfersInEvent");
  const transfersOutRows = mapPlayerRows(transfersOut, "transfers-out", "transfersOutEvent");
  const summaryStats = mapOverallStats(summaryRecord, transfersInRows, transfersOutRows);

  return {
    summaryStats,
    chipRows,
    dreamTeamGroups,
    eliteRows,
    transfersInRows,
    transfersOutRows,
    hasSummary: summaryStats.length > 0 || chipRows.length > 0,
    hasDreamTeam: dreamTeamGroups.some((group) => group.rows.length > 0),
    hasElite: eliteRows.length > 0,
    hasTransfers: transfersInRows.length > 0 || transfersOutRows.length > 0
  };
}

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
  return asArray(chips).map((item, index) => {
    const row = asRecord(item);
    return {
      id: `chip-${index}`,
      title: fieldText(row, ["chipName", "name"], "Chip"),
      value: formatCompactNumber(firstValue(row, ["numberPlayed", "times", "count"])),
      meta: "开卡数量"
    };
  });
}

function mapDreamTeamGroups(players: unknown[]): DisplayGroup[] {
  const groups = [
    { id: "gkp", title: "门将", types: ["1", "GKP", "GK"] },
    { id: "def", title: "后卫", types: ["2", "DEF"] },
    { id: "mid", title: "中场", types: ["3", "MID"] },
    { id: "fwd", title: "前锋", types: ["4", "FWD"] }
  ];

  return groups.map((group) => ({
    id: group.id,
    title: group.title,
    rows: players
      .map(asRecord)
      .filter((player) => group.types.indexOf(fieldText(player, ["elementType", "position", "singularNameShort"], "")) >= 0)
      .map((player, index) => mapPlayerRow(player, `${group.id}-${index}`, "points")),
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
    description: fieldText(player, ["selectedByPercent", "nowCost"], "")
  };
}
