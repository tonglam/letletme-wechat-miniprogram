/**
 * Canvas renderer for one live-match card.
 *
 * Mini Programs cannot snapshot arbitrary WXML into an image, so the visible
 * score card is redrawn from the same normalized match model. Branding is
 * always painted last, matching every other LetLetMe share-image surface.
 */
import type { LiveMatch } from "../models/live";
import { presentImage } from "./album-presenter";
import {
  SHARE_BRAND_VERSION,
  drawShareBranding,
} from "./share-image-brand";

export const LIVE_MATCH_SHARE_WIDTH = 750;

const BACKGROUND = "#f3f0f4";
const CARD = "#fffdf8";
const PLUM = "#38003c";
const DARK_PLUM = "#210025";
const ELECTRIC = "#00ff85";
const INK = "#241f25";
const MUTED = "#716b73";
const LINE = "#ded8df";

const COUNT_KINDS = new Set([
  "goals",
  "assists",
  "saves",
  "cleansheet",
  "pensaved",
  "yellow",
  "red",
  "penmissed",
  "owngoal",
]);

const KIND_COLORS: Record<string, string> = {
  goals: "#008545",
  assists: "#1769aa",
  defensive: "#1769aa",
  saves: "#1769aa",
  cleansheet: "#008545",
  pensaved: "#008545",
  yellow: "#a86f00",
  red: "#c62828",
  penmissed: "#c62828",
  owngoal: "#c62828",
  bonus: "#a86f00",
  bps: PLUM,
};

interface ShareCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): ShareCanvasContext | null;
}

interface ShareCanvasContext {
  scale(x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  strokeText?(text: string, x: number, y: number, maxWidth?: number): void;
  measureText?(text: string): { width: number };
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: "left" | "right" | "center" | "start" | "end";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic" | "hanging";
  globalAlpha: number;
}

export interface LiveMatchShareRow {
  kind: string;
  label: string;
  lines: string[];
  height: number;
}

export interface LiveMatchSharePlan {
  width: number;
  height: number;
  cardHeight: number;
  statusText: string;
  statusClass: string;
  kickoffText: string;
  homeTeam: string;
  awayTeam: string;
  scoreText: string;
  minuteText: string;
  rows: LiveMatchShareRow[];
}

type MatchShareItem = {
  name: string;
  team: string;
  text: string;
  display?: string;
};

function textValue(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function matchStatus(match: LiveMatch): string {
  return textValue(match.status || match.playStatus).toLowerCase();
}

/** Finished cards stay concise; provisional state remains in the data model. */
export function liveMatchShareStatusText(match: LiveMatch): string {
  const status = matchStatus(match);
  const raw = textValue(match.statusText);
  if (
    status === "finished" ||
    status === "ft" ||
    raw === "等待官方结算"
  ) {
    return "已完赛";
  }
  if (status === "playing" || status === "live") return "比赛中";
  if (status === "not_start" || status === "not_started") return "未开始";
  return raw || "比赛";
}

function glyphUnits(text: string): number {
  return Array.from(text).reduce(
    (total, character) => total + (/^[\x00-\xff]$/.test(character) ? 0.55 : 1),
    0,
  );
}

function wrapSegments(segments: string[], maxUnits = 29): string[] {
  const lines: string[] = [];
  let current = "";
  for (const segment of segments) {
    const candidate = current ? `${current} · ${segment}` : segment;
    if (current && glyphUnits(candidate) > maxUnits) {
      lines.push(current);
      current = segment;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ["—"];
}

function itemText(kind: string, item: MatchShareItem): string {
  const who = `${textValue(item.name, "-")}${item.team ? ` (${item.team})` : ""}`;
  const rawDisplay = textValue(item.display ?? item.text);
  if (!rawDisplay || (COUNT_KINDS.has(kind) && rawDisplay === "1")) return who;
  const display =
    COUNT_KINDS.has(kind) && !rawDisplay.startsWith("×")
      ? `×${rawDisplay}`
      : rawDisplay;
  return `${who} ${display}`;
}

export function buildLiveMatchSharePlan(match: LiveMatch): LiveMatchSharePlan {
  const rows = (match.eventSummary || [])
    .filter((group) => group.items.length > 0)
    .map((group) => {
      const lines = wrapSegments(
        group.items.map((item) =>
          itemText(group.kind, item as MatchShareItem),
        ),
      );
      return {
        kind: group.kind,
        label: textValue(group.label, group.kind),
        lines,
        height: Math.max(56, lines.length * 34 + 20),
      };
    });
  const eventHeight =
    rows.length > 0
      ? rows.reduce((total, row) => total + row.height, 0)
      : 72;
  const cardHeight = 260 + eventHeight;
  const height = Math.max(560, 118 + cardHeight + 76);

  return {
    width: LIVE_MATCH_SHARE_WIDTH,
    height,
    cardHeight,
    statusText: liveMatchShareStatusText(match),
    statusClass: textValue(match.statusClass, "status-waiting"),
    kickoffText: textValue(match.kickoffText),
    homeTeam: textValue(
      match.homeTeamDisplay || match.homeTeamShortName || match.homeTeamName,
      "主队",
    ),
    awayTeam: textValue(
      match.awayTeamDisplay || match.awayTeamShortName || match.awayTeamName,
      "客队",
    ),
    scoreText: textValue(match.scoreText, "VS"),
    minuteText: textValue(match.minuteText),
    rows,
  };
}

function statusColor(statusClass: string): string {
  if (statusClass === "status-playing") return "#008545";
  if (statusClass === "status-finished") return "#716b73";
  return "#1769aa";
}

function truncateText(
  ctx: ShareCanvasContext,
  text: string,
  maxWidth: number,
): string {
  if (!ctx.measureText || ctx.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1) {
    value = value.slice(0, -1);
    const candidate = `${value}…`;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
  }
  return text.slice(0, 1);
}

/** Paints the complete card; the brand call deliberately remains last. */
export function drawLiveMatchSharePlan(
  ctx: ShareCanvasContext,
  plan: LiveMatchSharePlan,
): void {
  const edge = statusColor(plan.statusClass);
  const cardX = 28;
  const cardY = 118;
  const cardWidth = plan.width - cardX * 2;
  const innerLeft = cardX + 34;
  const innerRight = cardX + cardWidth - 34;

  ctx.globalAlpha = 1;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, plan.width, plan.height);

  ctx.fillStyle = DARK_PLUM;
  ctx.fillRect(0, 0, plan.width, 104);
  ctx.fillStyle = ELECTRIC;
  ctx.fillRect(0, 0, 8, 104);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fffdf8";
  ctx.font = "700 38px sans-serif";
  ctx.fillText("实时比赛", 36, 23);
  ctx.fillStyle = "rgba(255, 253, 248, 0.68)";
  ctx.font = "600 18px sans-serif";
  ctx.fillText("LIVE MATCH · LetLetMe", 37, 70);

  ctx.fillStyle = CARD;
  ctx.fillRect(cardX, cardY, cardWidth, plan.cardHeight);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(cardX, cardY, cardWidth, plan.cardHeight);
  ctx.fillStyle = edge;
  ctx.fillRect(cardX, cardY, 7, plan.cardHeight);

  const pillWidth = Math.max(92, plan.statusText.length * 28 + 34);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = edge;
  ctx.fillRect(innerLeft, cardY + 28, pillWidth, 38);
  ctx.globalAlpha = 1;
  ctx.fillStyle = edge;
  ctx.font = "700 20px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(plan.statusText, innerLeft + 16, cardY + 47);
  if (plan.kickoffText) {
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = "500 18px sans-serif";
    ctx.fillText(plan.kickoffText, innerRight, cardY + 47);
  }

  const scoreY = cardY + 104;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = "700 38px sans-serif";
  ctx.fillText(
    truncateText(ctx, plan.homeTeam, 202),
    plan.width / 2 - 92,
    scoreY + 47,
    202,
  );
  ctx.fillStyle = PLUM;
  ctx.fillRect(plan.width / 2 - 78, scoreY, 156, 94);
  ctx.textAlign = "center";
  ctx.fillStyle = ELECTRIC;
  ctx.font = "700 40px sans-serif";
  ctx.fillText(plan.scoreText, plan.width / 2, scoreY + 37, 136);
  if (plan.minuteText) {
    ctx.fillStyle = "rgba(255, 253, 248, 0.78)";
    ctx.font = "600 17px sans-serif";
    ctx.fillText(plan.minuteText, plan.width / 2, scoreY + 72, 136);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "700 38px sans-serif";
  ctx.fillText(
    truncateText(ctx, plan.awayTeam, 202),
    plan.width / 2 + 92,
    scoreY + 47,
    202,
  );

  const eventTop = scoreY + 126;
  ctx.fillStyle = LINE;
  ctx.fillRect(innerLeft, eventTop - 18, innerRight - innerLeft, 1);
  ctx.fillStyle = MUTED;
  ctx.font = "700 18px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("比赛事件", innerLeft, eventTop);

  let rowY = eventTop + 36;
  if (plan.rows.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 21px sans-serif";
    ctx.fillText("暂无比赛事件", innerLeft, rowY + 12);
  } else {
    plan.rows.forEach((row, index) => {
      if (index > 0) {
        ctx.fillStyle = LINE;
        ctx.fillRect(innerLeft, rowY, innerRight - innerLeft, 1);
      }
      const color = KIND_COLORS[row.kind] || PLUM;
      ctx.fillStyle = color;
      ctx.fillRect(innerLeft, rowY + 17, 8, 22);
      ctx.fillStyle = color;
      ctx.font = "700 20px sans-serif";
      ctx.fillText(row.label, innerLeft + 20, rowY + 17, 116);
      ctx.fillStyle = INK;
      ctx.font = "600 20px sans-serif";
      row.lines.forEach((line, lineIndex) => {
        ctx.fillText(line, innerLeft + 148, rowY + 17 + lineIndex * 34, 474);
      });
      rowY += row.height;
    });
  }

  ctx.fillStyle = MUTED;
  ctx.font = "500 16px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "letletme.top/zh-CN/live/matches",
    30,
    plan.height - 31,
    420,
  );

  drawShareBranding(ctx, plan.width, plan.height);
}

export function liveMatchSharePixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export function liveMatchShareCacheKey(match: LiveMatch): string {
  return JSON.stringify({
    brand: SHARE_BRAND_VERSION,
    matchId: match.matchId || match.id,
    status: match.status,
    statusText: liveMatchShareStatusText(match),
    scoreText: match.scoreText,
    minuteText: match.minuteText,
    homeTeam: match.homeTeamDisplay || match.homeTeamShortName || match.homeTeamName,
    awayTeam: match.awayTeamDisplay || match.awayTeamShortName || match.awayTeamName,
    eventSummary: match.eventSummary,
  });
}

interface RenderLiveMatchShareOptions {
  canvas: ShareCanvas;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  match: LiveMatch;
  toTempFilePath: (canvas: ShareCanvas) => Promise<string>;
}

export function renderLiveMatchShareImage(
  options: RenderLiveMatchShareOptions,
): Promise<string> {
  const plan = buildLiveMatchSharePlan(options.match);
  const dpr = liveMatchSharePixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(plan.width * dpr);
  options.canvas.height = Math.round(plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  drawLiveMatchSharePlan(options.ctx, plan);
  return options.toTempFilePath(options.canvas);
}

const cachedPaths = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function rememberPath(key: string, path: string): void {
  cachedPaths.set(key, path);
  if (cachedPaths.size <= 8) return;
  const oldest = cachedPaths.keys().next().value as string | undefined;
  if (oldest) cachedPaths.delete(oldest);
}

/** Generates a local PNG for the native WeChat image-share menu. */
export function exportLiveMatchShareImage(match: LiveMatch): Promise<string> {
  const key = liveMatchShareCacheKey(match);
  const cached = cachedPaths.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const createOffscreen = (wx as WechatMiniprogram.Wx & {
    createOffscreenCanvas?: (options: {
      type: "2d";
      width: number;
      height: number;
    }) => WechatMiniprogram.OffscreenCanvas;
  }).createOffscreenCanvas;
  if (typeof createOffscreen !== "function") {
    return Promise.reject(new Error("offscreen canvas unavailable"));
  }

  const plan = buildLiveMatchSharePlan(match);
  const pixelRatio = liveMatchSharePixelRatio(
    Number(wx.getSystemInfoSync().pixelRatio),
  );
  const request = Promise.resolve().then(() => {
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(plan.width * pixelRatio),
      height: Math.round(plan.height * pixelRatio),
    }) as unknown as ShareCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share canvas context missing");
    return renderLiveMatchShareImage({
      canvas,
      ctx,
      pixelRatio,
      match,
      toTempFilePath: (node) =>
        new Promise((resolve, reject) => {
          wx.canvasToTempFilePath({
            canvas: node as unknown as WechatMiniprogram.Canvas,
            fileType: "png",
            quality: 1,
            success: (result) => resolve(result.tempFilePath),
            fail: reject,
          });
        }),
    });
  }).then((path) => {
    rememberPath(key, path);
    return path;
  }).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

export function presentLiveMatchShareImage(path: string): Promise<void> {
  return presentImage(path);
}
