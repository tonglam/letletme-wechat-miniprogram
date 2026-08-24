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

export interface TournamentComparePickView {
  key: string;
  name: string;
  meta: string;
  role: "" | "C" | "V";
  pointsText: string;
}

export interface TournamentCompareLineupRow {
  slot: number;
  slotLabel: string;
  sectionLabel: "" | "首发" | "替补";
  bench: boolean;
  left: TournamentComparePickView | null;
  right: TournamentComparePickView | null;
}

export interface TournamentCompareLineup {
  rows: TournamentCompareLineupRow[];
  leftCount: number;
  rightCount: number;
}

function tournamentPickSlot(pick: LivePlayerRow): number | undefined {
  for (const value of [pick.squadPosition, pick.position]) {
    const slot = Number(value);
    if (Number.isInteger(slot) && slot >= 1 && slot <= 15) return slot;
  }
  return undefined;
}

function tournamentComparePickView(
  pick: LivePlayerRow,
  slot: number,
): TournamentComparePickView {
  const name = String(pick.webName || pick.name || "").trim()
    || (pick.element ? `#${pick.element}` : "未知球员");
  const team = String(pick.teamShortName || pick.team || "").trim();
  const position = String(pick.elementTypeName || pick.position || "").trim();
  const points = pick.points ?? pick.livePoints ?? pick.totalPoints;
  return {
    key: `${slot}:${pick.element || name}`,
    name,
    meta: [team, position].filter(Boolean).join(" · "),
    role: pick.captain ? "C" : pick.viceCaptain ? "V" : "",
    pointsText:
      typeof points === "number" && Number.isFinite(points)
        ? `${points}分`
        : "—",
  };
}

function tournamentLineupBySlot(
  picks: readonly LivePlayerRow[] = [],
): Map<number, TournamentComparePickView> {
  const bySlot = new Map<number, TournamentComparePickView>();
  picks.slice(0, 15).forEach((pick, index) => {
    let slot = tournamentPickSlot(pick) ?? index + 1;
    while (bySlot.has(slot) && slot <= 15) slot += 1;
    if (slot <= 15) {
      bySlot.set(slot, tournamentComparePickView(pick, slot));
    }
  });
  return bySlot;
}

/** Pair two official 15-player tournament squads by FPL lineup slot. */
export function buildTournamentLineupComparison(
  leftPicks: readonly LivePlayerRow[] = [],
  rightPicks: readonly LivePlayerRow[] = [],
): TournamentCompareLineup {
  const left = tournamentLineupBySlot(leftPicks);
  const right = tournamentLineupBySlot(rightPicks);
  const slots = [...new Set([...left.keys(), ...right.keys()])].sort(
    (a, b) => a - b,
  );
  let starterLabelShown = false;
  let benchLabelShown = false;
  const rows = slots.map((slot): TournamentCompareLineupRow => {
    const bench = slot > 11;
    let sectionLabel: TournamentCompareLineupRow["sectionLabel"] = "";
    if (bench && !benchLabelShown) {
      benchLabelShown = true;
      sectionLabel = "替补";
    } else if (!bench && !starterLabelShown) {
      starterLabelShown = true;
      sectionLabel = "首发";
    }
    return {
      slot,
      slotLabel: bench ? `替${slot - 11}` : String(slot),
      sectionLabel,
      bench,
      left: left.get(slot) || null,
      right: right.get(slot) || null,
    };
  });
  return {
    rows,
    leftCount: left.size,
    rightCount: right.size,
  };
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
  transferCostKnown: boolean;
  chip?: string;
  captainName?: string;
  starters: LivePlayerRow[];
  bench: LivePlayerRow[];
}): string {
  const teamName = textValue(input.entryName, "我的球队");
  const hits = !input.transferCostKnown
    ? " (转会扣分待确认)"
    : input.transferCost > 0
      ? ` (−${input.transferCost})`
      : "";
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
    transferCostKnown?: boolean;
    eventPointsKnown?: boolean;
    playedText?: string;
  }>;
}): string {
  const title = textValue(input.tournamentName, "赛事");
  const lines = [
    `# ${title} · GW${input.gameweek}`,
    `最高 ${input.highestText || "—"} · 平均 ${input.averageText || "—"} · 参赛 ${input.entriesText || input.rows.length}`,
    ""
  ];

  input.rows.forEach((row) => {
    const eventPointsKnown =
      typeof row.eventPointsKnown === "boolean"
        ? row.eventPointsKnown
        : row.displayLive !== undefined
          ? row.displayLive !== "—"
          : typeof row.livePoints === "number" && Number.isFinite(row.livePoints);
    const rank =
      eventPointsKnown &&
      typeof row.visibleRank === "number" &&
      Number.isSafeInteger(row.visibleRank) &&
      row.visibleRank > 0
        ? String(row.visibleRank)
        : "—";
    const team = textValue(row.entryName, "-");
    const gw = textValue(row.displayLive, String(numberValue(row.livePoints)));
    const displayHit = String(row.displayHit || "").trim();
    const transferCostKnown =
      typeof row.transferCostKnown === "boolean"
        ? row.transferCostKnown
        : (typeof row.transferCost === "number" && Number.isFinite(row.transferCost)) ||
          /^-?\d+$/.test(displayHit);
    const hit = transferCostKnown
      ? numberValue(row.transferCost, Math.abs(numberValue(displayHit)))
      : 0;
    const total = textValue(row.displayTotal, String(numberValue(row.liveTotalPoints ?? row.totalPoints)));
    const hitText = !transferCostKnown
      ? " (转会扣分待确认)"
      : hit > 0
        ? ` (−${hit})`
        : "";
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
  const rawStatus = textValue(match.statusText, "");
  const status = (playing ? textValue(match.minuteText, "") : "")
    || (rawStatus === "等待官方结算" ? "已完赛" : rawStatus);
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
