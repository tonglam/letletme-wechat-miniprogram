import type { LiveMatch, LivePlayerRow, LiveTournamentRow } from "../models/live";
import {
  isClipboardApiBlocked,
  isPrivacyScopeUndeclared,
  markClipboardApiBlocked
} from "./privacy";
import { miniLogger } from "./logger";

const SITE = "https://letletme.top/zh-CN";

function textValue(value: unknown, fallback = ""): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Chip names stay English — that is the vocabulary FPL players actually use. */
export function chipShareLabel(raw: unknown): string {
  const value = String(raw || "").toUpperCase().replace(/[\s_-]/g, "");
  if (value === "TRIPLECAPTAIN" || value === "TC" || value === "3XC" || value === "3C") return "Triple Captain";
  if (value === "BENCHBOOST" || value === "BBOOST" || value === "BB") return "Bench Boost";
  if (value === "WILDCARD" || value === "WC") return "Wildcard";
  if (value === "FREEHIT" || value === "FH") return "Free Hit";
  if (!value || value === "无" || value === "NONE") return "无";
  return String(raw);
}

function playerRole(player: LivePlayerRow): string {
  if (player.captain || player.roleText === "C") return " (C)";
  if (player.viceCaptain || player.roleText === "VC") return " (V)";
  return "";
}

/** Share lines stay quiet once a player is done — only pending states get a tag. */
function shortStatus(status: string): string {
  if (status === "已完赛" || status === "未知" || status === "") return "";
  if (status === "未开始" || status === "未出场" || status === "无比赛") return "未赛";
  if (status === "部分完赛") return "未完";
  return status;
}

function playerLine(player: LivePlayerRow): string {
  const name = textValue(player.name || player.webName, "-");
  const team = textValue(player.teamShortName || player.team, "");
  const position = textValue(player.position || player.elementTypeName, "");
  const points = numberValue(player.points ?? player.livePoints ?? player.totalPoints);
  const status = shortStatus(textValue(player.statusText, ""));
  const parts = [
    `${name}${playerRole(player)}`,
    [team, position].filter(Boolean).join(" "),
    `${points}分`
  ];
  if (status) parts.push(status);
  return `- ${parts.filter(Boolean).join(" · ")}`;
}

export function formatLiveEntryShareText(input: {
  gameweek: number;
  entryId?: number;
  entryName?: string;
  playerName?: string;
  livePoints: number | string;
  netPoints: number;
  totalPoints: number | string;
  transferCost: number;
  chip?: string;
  captainName?: string;
  starters: LivePlayerRow[];
  bench: LivePlayerRow[];
}): string {
  const teamName = textValue(input.entryName, "我的球队");
  const hits = input.transferCost > 0 ? ` (−${input.transferCost})` : "";
  // Net points are derivable from 实时 + hits, so the meta line keeps only
  // identity and season context.
  const meta = [
    textValue(input.playerName),
    `队长 ${textValue(input.captainName, "—")}`,
    `赛季 ${textValue(input.totalPoints, "—")}`
  ];
  const chip = chipShareLabel(input.chip);
  if (chip !== "无") meta.push(`Chip ${chip}`);

  const starters = (input.starters || []).map(playerLine);
  const bench = (input.bench || []).map(playerLine);
  const lines = [
    `# ${teamName} · GW${input.gameweek} · 实时 ${textValue(input.livePoints, "—")}${hits}`,
    meta.filter(Boolean).join(" · "),
    "",
    ...starters
  ];

  if (bench.length > 0) {
    // Bench joins the same list, one divider line like the merged lineup card
    if (starters.length > 0) lines.push("— 替补 —");
    lines.push(...bench);
  }

  if (input.entryId) {
    lines.push("", `实时积分：${SITE}/live/points/${input.entryId}`);
  }

  return lines.join("\n");
}

export function formatLiveTournamentShareText(input: {
  gameweek: number;
  tournamentName?: string;
  tournamentId?: number | string;
  highestText?: string;
  averageText?: string;
  entriesText?: string;
  rows: Array<LiveTournamentRow & {
    visibleRank?: number;
    displayLive?: string;
    displayNet?: string;
    displayTotal?: string;
    displayHit?: string;
    playedText?: string;
  }>;
}): string {
  const title = textValue(input.tournamentName, "赛事");
  const lines = [
    `# ${title} · GW${input.gameweek}`,
    `最高 ${input.highestText || "—"} · 平均 ${input.averageText || "—"} · 参赛 ${input.entriesText || input.rows.length}`,
    ""
  ];

  input.rows.forEach((row, index) => {
    const rank = row.visibleRank || index + 1;
    const team = textValue(row.entryName, "-");
    const gw = textValue(row.displayLive, String(numberValue(row.livePoints)));
    const hit = numberValue(row.transferCost, Math.abs(numberValue(row.displayHit)));
    const total = textValue(row.displayTotal, String(numberValue(row.liveTotalPoints ?? row.totalPoints)));
    const hitText = hit > 0 ? ` (−${hit})` : "";
    lines.push(`${rank}. ${team} · GW ${gw}${hitText} · 总 ${total}`);
  });

  if (input.tournamentId !== undefined && input.tournamentId !== "") {
    lines.push("", `实时赛事：${SITE}/live/competitions?tournamentId=${input.tournamentId}`);
  }

  return lines.join("\n");
}

/**
 * Plain-text match summary for social paste — same compact recipe as the web
 * match card: one header line, then one inline line per highlight group
 * (BPS capped at 3, single counts omitted).
 */
const MATCH_SHARE_KIND_ORDER = [
  "goals", "assists", "saves", "cleansheet", "pensaved",
  "defensive", "yellow", "red", "penmissed", "owngoal", "bonus", "bps"
];

function matchShareItem(kind: string, item: { name: string; team: string; text: string }): string {
  const who = `${item.name}${item.team ? ` (${item.team})` : ""}`;
  if (kind === "bonus" || kind === "bps" || kind === "defensive") return `${who} ${item.text}`;
  if (item.text === "1") return who;
  return `${who} ×${item.text}`;
}

function includeBpsWithTies<T extends { text: string }>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const sorted = [...items].sort((a, b) => Number(b.text) - Number(a.text));
  const cutoffBps = Number(sorted[limit - 1].text);
  return sorted.filter((item) => Number(item.text) >= cutoffBps);
}

export function formatLiveMatchShareText(match: LiveMatch): string {
  const home = textValue(match.homeTeamDisplay || match.homeTeamShortName || match.homeTeamName, "-");
  const away = textValue(match.awayTeamDisplay || match.awayTeamShortName || match.awayTeamName, "-");
  const score = textValue(match.scoreText, "VS");
  const playing = match.statusClass === "status-playing"
    || String(match.status || match.playStatus) === "playing";
  const status = (playing ? textValue(match.minuteText, "") : "") || textValue(match.statusText, "");
  const lines = [`${home} ${score} ${away}${status ? ` · ${status}` : ""}`];

  const groups = match.eventSummary || [];
  MATCH_SHARE_KIND_ORDER.forEach((kind) => {
    const group = groups.find((item) => item.kind === kind);
    if (!group || group.items.length === 0) return;
    const items = kind === "bps" ? includeBpsWithTies(group.items, 3) : group.items;
    lines.push(`${group.label}: ${items.map((item) => matchShareItem(kind, item)).join("、")}`);
  });

  lines.push("", `实时比赛：${SITE}/live/matches`);
  return lines.join("\n");
}

export function copyShareText(text: string): Promise<boolean> {
  const data = String(text || "");
  if (!data.trim()) {
    miniLogger.warn("copy-share.empty");
    wx.showToast({ title: "暂无可复制内容", icon: "none" });
    return Promise.resolve(false);
  }
  if (isClipboardApiBlocked()) {
    miniLogger.warn("copy-share.privacy-blocked");
    wx.showToast({ title: "无法自动复制，请长按文本", icon: "none", duration: 2500 });
    return Promise.resolve(false);
  }
  miniLogger.info("copy-share.write", data.length);
  return new Promise((resolve) => {
    const fail = (err?: { errno?: number; errMsg?: string }) => {
      miniLogger.error("copy-share.fail", err?.errMsg || err?.errno);
      if (isPrivacyScopeUndeclared(err)) {
        markClipboardApiBlocked();
        miniLogger.error("copy-share.privacy-scope");
        wx.showToast({ title: "无法自动复制，请长按文本", icon: "none", duration: 2500 });
      } else {
        wx.showToast({ title: "复制失败，请长按文本复制", icon: "none", duration: 2500 });
      }
      resolve(false);
    };
    try {
      wx.setClipboardData({
        data,
        success: () => {
          miniLogger.info("copy-share.ok");
          resolve(true);
        },
        fail
      });
    } catch (error) {
      fail({ errMsg: error instanceof Error ? error.message : String(error) });
    }
  });
}
