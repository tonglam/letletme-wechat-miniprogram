/**
 * Canvas renderer for the home fixtures card's share image. The web
 * MatchesSection has no share action, so this follows the mini's own market
 * share-image language: plum header band, off-white card, branding painted
 * last. The image always covers the whole selected gameweek (day tabs are
 * in-card pagination, not separate views), grouped by day exactly like the
 * card's tab strip.
 */
import { presentImage } from "./album-presenter";
import { windowPixelRatio } from "./system-info";
import {
  SHARE_BRAND_VERSION,
  drawShareBranding,
} from "./share-image-brand";
import type { ShareCanvasContext } from "./live-match-share-image";

export const HOME_FIXTURE_SHARE_WIDTH = 750;
/** A normal gameweek is 10 matches; the cap only defends double-week blowups. */
export const HOME_FIXTURE_SHARE_MAX_MATCHES = 14;

const BACKGROUND = "#f3f0f4";
const CARD = "#fffdf8";
const DARK_PLUM = "#210025";
const ELECTRIC = "#00ff85";
const INK = "#241f25";
const MUTED = "#716b73";
const LINE = "#ded8df";
// home fixture-card tokens: --plum / --electric / --danger
const DANGER = "#c9183f";

export interface HomeFixtureShareRow {
  homeName: string;
  awayName: string;
  /** Score ("2-1") while live/finished, kickoff time ("22:00"), or 待定. */
  centerLabel: string;
  finished: boolean;
  live: boolean;
}

export interface HomeFixtureShareDay {
  /** Same label as the card's day tab ("30/08 周六", 待定 for unscheduled). */
  tabLabel: string;
  rows: HomeFixtureShareRow[];
}

export interface HomeFixtureShareInput {
  /** 近期赛程 — matches the card header title. */
  title: string;
  /** GW label, e.g. "GW2" or "GW2 · 直播中". */
  subtitle: string;
  days: HomeFixtureShareDay[];
}

export interface HomeFixtureSharePlan {
  width: number;
  height: number;
  title: string;
  subtitle: string;
  days: HomeFixtureShareDay[];
  /** Untruncated match count, so the stats line never hides dropped rows. */
  totalMatches: number;
  shownMatches: number;
}

export interface HomeFixtureShareCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): ShareCanvasContext | null;
}

// Header band + stats strip + day groups + card padding, then the footer band.
const HEADER_H = 118;
const STRIP_H = 72;
const FOOTER_H = 76;
const CARD_PAD = 32;
const DAY_HEAD_H = 44;
const ROW_H = 60;

export function buildHomeFixtureSharePlan(
  input: HomeFixtureShareInput,
): HomeFixtureSharePlan {
  let remaining = HOME_FIXTURE_SHARE_MAX_MATCHES;
  let totalMatches = 0;
  let shownMatches = 0;
  const days: HomeFixtureShareDay[] = [];
  for (const day of input.days) {
    totalMatches += day.rows.length;
    if (remaining <= 0 || day.rows.length === 0) continue;
    const rows = day.rows.slice(0, remaining);
    remaining -= rows.length;
    shownMatches += rows.length;
    days.push({ tabLabel: day.tabLabel, rows });
  }
  const bodyHeight = days.length === 0
    ? ROW_H
    : days.reduce(
        (sum, day) => sum + DAY_HEAD_H + day.rows.length * ROW_H,
        0,
      );
  return {
    width: HOME_FIXTURE_SHARE_WIDTH,
    height: HEADER_H + STRIP_H + bodyHeight + CARD_PAD + FOOTER_H,
    title: input.title,
    subtitle: input.subtitle,
    days,
    totalMatches,
    shownMatches,
  };
}

/** Paints the complete card; the brand call deliberately remains last. */
export function drawHomeFixtureSharePlan(
  ctx: ShareCanvasContext,
  plan: HomeFixtureSharePlan,
): void {
  const cardX = 28;
  const cardY = HEADER_H;
  const cardWidth = plan.width - cardX * 2;
  const innerLeft = cardX + 34;
  const innerRight = cardX + cardWidth - 34;

  ctx.globalAlpha = 1;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, plan.width, plan.height);

  // Header band
  ctx.fillStyle = DARK_PLUM;
  ctx.fillRect(0, 0, plan.width, 104);
  ctx.fillStyle = ELECTRIC;
  ctx.fillRect(0, 0, 8, 104);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fffdf8";
  ctx.font = "700 38px sans-serif";
  ctx.fillText(plan.title, 36, 23);
  ctx.fillStyle = "rgba(255, 253, 248, 0.68)";
  ctx.font = "600 18px sans-serif";
  ctx.fillText(plan.subtitle, 37, 70, cardWidth);

  // Card
  const cardHeight = plan.height - FOOTER_H - cardY;
  ctx.fillStyle = CARD;
  ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
  ctx.fillStyle = ELECTRIC;
  ctx.fillRect(cardX, cardY, 7, cardHeight);

  // Stats strip — the total always reflects the full gameweek, even when the
  // defensive cap trimmed the painted rows.
  ctx.textBaseline = "middle";
  ctx.fillStyle = MUTED;
  ctx.font = "700 22px sans-serif";
  const statsLine = plan.shownMatches < plan.totalMatches
    ? `共 ${plan.totalMatches} 场 · 展示前 ${plan.shownMatches} 场`
    : `共 ${plan.totalMatches} 场 · ${plan.days.length} 个比赛日`;
  ctx.fillText(statsLine, innerLeft, cardY + 38);

  let cursor = cardY + STRIP_H;
  if (plan.days.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 19px sans-serif";
    ctx.fillText("赛程还没公布", innerLeft, cursor + 28);
  }
  for (const day of plan.days) {
    ctx.fillStyle = MUTED;
    ctx.font = "800 20px sans-serif";
    ctx.fillText(day.tabLabel, innerLeft, cursor + 20);
    cursor += DAY_HEAD_H;
    for (const row of day.rows) {
      drawFixtureRow(ctx, row, innerLeft, innerRight, cursor);
      cursor += ROW_H;
    }
  }

  ctx.fillStyle = MUTED;
  ctx.font = "500 16px sans-serif";
  ctx.fillText("时间按本机时区", innerLeft, plan.height - 31);
  ctx.textAlign = "right";
  ctx.fillText("letletme.top/zh-CN", plan.width - 30, plan.height - 31, 420);
  ctx.textAlign = "left";

  drawShareBranding(
    ctx as Parameters<typeof drawShareBranding>[0],
    plan.width,
    plan.height,
  );
}

function drawFixtureRow(
  ctx: ShareCanvasContext,
  row: HomeFixtureShareRow,
  innerLeft: number,
  innerRight: number,
  rowY: number,
): void {
  const boardWidth = 128;
  const boardHeight = 40;
  const boardX = (innerLeft + innerRight - boardWidth) / 2;
  const boardY = rowY + 10;

  // Center board — the card's plum score tile; live scores go danger-red.
  ctx.fillStyle = DARK_PLUM;
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
  ctx.fillStyle = row.live ? DANGER : ELECTRIC;
  ctx.font = "800 21px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(row.centerLabel, boardX + boardWidth / 2, boardY + boardHeight / 2, boardWidth - 12);

  ctx.font = "700 22px sans-serif";
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText(row.homeName, boardX - 20, rowY + 30, boardX - 20 - innerLeft);
  ctx.textAlign = "left";
  ctx.fillText(row.awayName, boardX + boardWidth + 20, rowY + 30, innerRight - boardX - boardWidth - 20);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(innerLeft, rowY + 59.5, innerRight - innerLeft, 0);
}

export function homeFixtureSharePixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export function homeFixtureShareCacheKey(plan: HomeFixtureSharePlan): string {
  return JSON.stringify({
    brand: SHARE_BRAND_VERSION,
    title: plan.title,
    subtitle: plan.subtitle,
    days: plan.days.map((day) => [
      day.tabLabel,
      day.rows.map((row) => [row.homeName, row.awayName, row.centerLabel, row.live]),
    ]),
  });
}

interface RenderHomeFixtureShareOptions {
  canvas: HomeFixtureShareCanvas;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  plan: HomeFixtureSharePlan;
  toTempFilePath: (canvas: HomeFixtureShareCanvas) => Promise<string>;
}

export function renderHomeFixtureShareImage(
  options: RenderHomeFixtureShareOptions,
): Promise<string> {
  const dpr = homeFixtureSharePixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(options.plan.width * dpr);
  options.canvas.height = Math.round(options.plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  drawHomeFixtureSharePlan(options.ctx, options.plan);
  return options.toTempFilePath(options.canvas);
}

const cachedPaths = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function rememberPath(key: string, path: string): void {
  cachedPaths.set(key, path);
  if (cachedPaths.size <= 4) return;
  const oldest = cachedPaths.keys().next().value as string | undefined;
  if (oldest) cachedPaths.delete(oldest);
}

/** Generates a local PNG for the native WeChat image-share menu. */
export function exportHomeFixtureShareImage(
  input: HomeFixtureShareInput,
): Promise<string> {
  const plan = buildHomeFixtureSharePlan(input);
  const key = homeFixtureShareCacheKey(plan);
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

  const request = Promise.resolve().then(async () => {
    if (typeof createOffscreen !== "function") {
      throw new Error("share canvas unavailable");
    }
    const pixelRatio = homeFixtureSharePixelRatio(windowPixelRatio());
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(plan.width * pixelRatio),
      height: Math.round(plan.height * pixelRatio),
    }) as unknown as HomeFixtureShareCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share canvas context missing");
    return renderHomeFixtureShareImage({
      canvas,
      ctx,
      pixelRatio,
      plan,
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

export function presentHomeFixtureShareImage(path: string): Promise<void> {
  return presentImage(path);
}
