import { getLiveMatchByStatus } from "../../../services/live.service";
import type { LiveMatch, LivePlayerRow } from "../../../models/live";

interface StatusOption {
  key: string;
  label: string;
}

interface MatchGroup {
  title: string;
  matches: LiveMatch[];
}

const STATUS_OPTIONS: StatusOption[] = [
  { key: "playing", label: "比赛中" },
  { key: "not_start", label: "未开始" },
  { key: "finished", label: "已完赛" },
  { key: "next_event", label: "下轮" }
];

const STORAGE_STATUS_KEY = "letletme_live_match_status";
const DEFAULT_STATUS = "playing";

function isValidStatus(value: unknown): value is string {
  return typeof value === "string" && STATUS_OPTIONS.some((item) => item.key === value);
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

function statusLabel(match: LiveMatch, fallbackStatus: string): string {
  const status = match.status || match.playStatus || fallbackStatus;
  if (status === "finished") {
    return "已完赛";
  }
  if (status === "playing") {
    return "比赛中";
  }
  if (status === "next_event") {
    return "下轮";
  }
  if (status === "not_start" || status === "not_started") {
    return "未开始";
  }
  if (numberValue(match.minutes) > 0) {
    return "比赛中";
  }
  return "比赛";
}

function statusClass(match: LiveMatch, fallbackStatus: string): string {
  const status = match.status || match.playStatus || fallbackStatus;
  if (status === "finished") {
    return "status-finished";
  }
  if (status === "playing") {
    return "status-playing";
  }
  if (status === "next_event") {
    return "status-next";
  }
  if (numberValue(match.minutes) > 0) {
    return "status-playing";
  }
  return "status-waiting";
}

function kickoffText(match: LiveMatch): string {
  const raw = textValue(match.kickoffTime, "");
  if (!raw) {
    return "开球时间待定";
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hours}:${minutes}`;
  }
  return raw;
}

function minuteText(match: LiveMatch): string {
  const minutes = numberValue(match.minutes);
  return minutes > 0 ? `${minutes}'` : "";
}

function scoreText(match: LiveMatch, fallbackStatus: string): string {
  const status = match.status || match.playStatus || fallbackStatus;
  if (status === "not_start" || status === "not_started" || status === "next_event") {
    return "VS";
  }
  return `${numberValue(match.homeScore)}-${numberValue(match.awayScore)}`;
}

function playerName(player: LivePlayerRow): string {
  const team = player.teamShortName || player.team || "";
  const name = player.webName || player.name || "-";
  return team ? `${name} (${team})` : name;
}

function collectMetric(players: LivePlayerRow[], key: keyof LivePlayerRow, label: string): { label: string; value: string } | undefined {
  const names = players
    .filter((player) => numberValue(player[key]) > 0)
    .map((player) => {
      const count = numberValue(player[key]);
      return count > 1 ? `${playerName(player)} x${count}` : playerName(player);
    });

  if (names.length === 0) {
    return undefined;
  }

  return { label, value: names.slice(0, 3).join("、") + (names.length > 3 ? "..." : "") };
}

function collectBonus(players: LivePlayerRow[]): { label: string; value: string } | undefined {
  const names = players
    .filter((player) => numberValue(player.bonus) > 0)
    .sort((a, b) => numberValue(b.bonus) - numberValue(a.bonus))
    .map((player) => `${playerName(player)} +${numberValue(player.bonus)}`);

  if (names.length === 0) {
    return undefined;
  }

  return { label: "Bonus", value: names.slice(0, 3).join("、") };
}

function buildEventSummary(match: LiveMatch): Array<{ label: string; value: string }> {
  const players = [...(match.homeTeamDataList || []), ...(match.awayTeamDataList || [])];
  return [
    collectBonus(players),
    collectMetric(players, "goalsScored", "进球"),
    collectMetric(players, "assists", "助攻"),
    collectMetric(players, "redCards", "红牌"),
    collectMetric(players, "yellowCards", "黄牌"),
    collectMetric(players, "penaltiesSaved", "扑点"),
    collectMetric(players, "penaltiesMissed", "丢点"),
    collectMetric(players, "saves", "扑救")
  ].filter((item): item is { label: string; value: string } => Boolean(item));
}

function normalizeMatch(match: LiveMatch, fallbackStatus: string): LiveMatch {
  return {
    ...match,
    matchId: match.matchId || match.id,
    homeTeamDisplay: match.homeTeamShortName || match.homeTeamName || match.homeTeam,
    awayTeamDisplay: match.awayTeamShortName || match.awayTeamName || match.awayTeam,
    statusText: statusLabel(match, fallbackStatus),
    statusClass: statusClass(match, fallbackStatus),
    scoreText: scoreText(match, fallbackStatus),
    kickoffText: kickoffText(match),
    minuteText: minuteText(match),
    eventSummary: buildEventSummary(match)
  };
}

function groupMatches(matches: LiveMatch[], status: string): MatchGroup[] {
  const groups: Record<string, LiveMatch[]> = {};

  matches.forEach((match) => {
    const title = status === "playing" ? "正在进行" : match.kickoffText || "比赛";
    groups[title] = groups[title] || [];
    groups[title].push(match);
  });

  return Object.keys(groups).map((title) => ({ title, matches: groups[title] }));
}

function emptyDescription(status: string): string {
  if (status === "playing") {
    return "目前没有正在进行的比赛，可以切换到未开始或下轮";
  }
  if (status === "not_start") {
    return "本轮暂时没有待开球比赛，赛程更新后会自动出现";
  }
  if (status === "finished") {
    return "本轮还没有完赛记录，比赛结束后会显示比分";
  }
  return "下一轮赛程还没公布，稍后回来重新加载";
}

Page({
  data: {
    loading: false,
    error: "",
    status: DEFAULT_STATUS,
    activeStatusLabel: "比赛中",
    emptyDescription: emptyDescription(DEFAULT_STATUS),
    statusOptions: STATUS_OPTIONS,
    matches: [] as LiveMatch[],
    groups: [] as MatchGroup[]
  },

  onLoad() {
    const storedStatus = wx.getStorageSync(STORAGE_STATUS_KEY);
    if (isValidStatus(storedStatus)) {
      this.setData({
        status: storedStatus,
        activeStatusLabel: STATUS_OPTIONS.find((item) => item.key === storedStatus)?.label || "比赛中",
        emptyDescription: emptyDescription(storedStatus)
      });
    }
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  async loadData() {
    this.setData({ loading: true, error: "" });
    try {
      const matches = (await getLiveMatchByStatus(this.data.status)).map((match) => normalizeMatch(match, this.data.status));
      const activeStatusLabel = STATUS_OPTIONS.find((item) => item.key === this.data.status)?.label || "比赛";
      this.setData({
        activeStatusLabel,
        emptyDescription: emptyDescription(this.data.status),
        matches,
        groups: groupMatches(matches, this.data.status)
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "实时比赛加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onStatusTap(event: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { status: string }>) {
    const status = event.currentTarget.dataset.status || "playing";
    if (status === this.data.status) {
      return;
    }
    const activeStatusLabel = STATUS_OPTIONS.find((item) => item.key === status)?.label || "比赛";
    wx.setStorageSync(STORAGE_STATUS_KEY, status);
    this.setData({
      status,
      activeStatusLabel,
      emptyDescription: emptyDescription(status),
      matches: [],
      groups: []
    });
    this.loadData();
  },

  onRetry() {
    this.loadData();
  }
});
