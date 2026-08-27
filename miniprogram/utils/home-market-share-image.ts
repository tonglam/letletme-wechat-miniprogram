/**
 * Canvas renderer for the home market cards' share images (web
 * HomeMarketCarousel / HomePriceChangeCarousel ShareActions parity — the web
 * card header shares as an image only). One module covers both cards and all
 * four views: mover rows in two columns (持有率 / 身价变化 / 涨跌趋势) and the
 * availability watch list. Branding is always painted last, matching every
 * other LetLetMe share-image surface.
 */
import { presentImage } from "./album-presenter";
import { windowPixelRatio } from "./system-info";
import {
  SHARE_BRAND_VERSION,
  drawShareBranding,
} from "./share-image-brand";
import type { ShareCanvasContext } from "./live-match-share-image";

export const HOME_MARKET_SHARE_WIDTH = 750;
/** Service already caps teasers at 5; the canvas defends the same bound. */
export const HOME_MARKET_SHARE_MAX_ROWS = 5;

const BACKGROUND = "#f3f0f4";
const CARD = "#fffdf8";
const DARK_PLUM = "#210025";
const ELECTRIC = "#00ff85";
const INK = "#241f25";
const MUTED = "#716b73";
const LINE = "#ded8df";
// home transfer-card tokens: --green-ink / --danger / --accent-tint / --track
const GREEN_INK = "#008545";
const DANGER = "#c9183f";
const ACCENT_TINT = "#dcf6ea";
const TRACK = "#f1efe9";

export interface HomeMarketMoversShareRow {
  name: string;
  team: string;
  position?: string;
  meta: string;
  changeText: string;
  rising: boolean;
}

export interface HomeMarketMoversShareInput {
  /** 持有率变化 / 身价变化 / 涨跌趋势 — matches the card header title. */
  title: string;
  /** The same 更新于 label shown on the card. */
  subtitle: string;
  upTitle: string;
  downTitle: string;
  upRows: HomeMarketMoversShareRow[];
  downRows: HomeMarketMoversShareRow[];
}

export interface HomeMarketWatchShareRow {
  name: string;
  team: string;
  owned: string;
  status: string;
  /** up = available again, down = injured/suspended/etc, "" = neutral. */
  tone: "up" | "down" | "";
  body: string;
}

export interface HomeMarketWatchShareInput {
  /** 出场状态观察 — matches the card header title. */
  title: string;
  subtitle: string;
  rows: HomeMarketWatchShareRow[];
}

export interface HomeMarketShareCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): ShareCanvasContext | null;
}

interface HomeMarketSharePlanBase {
  width: number;
  height: number;
  title: string;
  subtitle: string;
}

export interface HomeMarketMoversSharePlan extends HomeMarketSharePlanBase {
  kind: "movers";
  upTitle: string;
  downTitle: string;
  upRows: HomeMarketMoversShareRow[];
  downRows: HomeMarketMoversShareRow[];
}

export interface HomeMarketWatchSharePlan extends HomeMarketSharePlanBase {
  kind: "watch";
  rows: HomeMarketWatchShareRow[];
}

export type HomeMarketSharePlan =
  | HomeMarketMoversSharePlan
  | HomeMarketWatchSharePlan;

// Header band + stats strip + content + card padding, then the footer band.
const HEADER_H = 118;
const STRIP_H = 72;
const FOOTER_H = 76;
const CARD_PAD = 32;
const MOVER_ROW_H = 64;
const WATCH_ROW_H = 84;

export function buildHomeMarketMoversSharePlan(
  input: HomeMarketMoversShareInput,
): HomeMarketMoversSharePlan {
  const upRows = input.upRows.slice(0, HOME_MARKET_SHARE_MAX_ROWS);
  const downRows = input.downRows.slice(0, HOME_MARKET_SHARE_MAX_ROWS);
  const rowCount = Math.max(upRows.length, downRows.length, 1);
  return {
    kind: "movers",
    width: HOME_MARKET_SHARE_WIDTH,
    height: HEADER_H + STRIP_H + rowCount * MOVER_ROW_H + CARD_PAD + FOOTER_H,
    title: input.title,
    subtitle: input.subtitle,
    upTitle: input.upTitle,
    downTitle: input.downTitle,
    upRows,
    downRows,
  };
}

export function buildHomeMarketWatchSharePlan(
  input: HomeMarketWatchShareInput,
): HomeMarketWatchSharePlan {
  const rows = input.rows.slice(0, HOME_MARKET_SHARE_MAX_ROWS);
  const rowCount = Math.max(rows.length, 1);
  return {
    kind: "watch",
    width: HOME_MARKET_SHARE_WIDTH,
    height: HEADER_H + STRIP_H + rowCount * WATCH_ROW_H + CARD_PAD + FOOTER_H,
    title: input.title,
    subtitle: input.subtitle,
    rows,
  };
}

/** Paints the complete card; the brand call deliberately remains last. */
export function drawHomeMarketSharePlan(
  ctx: ShareCanvasContext,
  plan: HomeMarketSharePlan,
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

  // Stats strip
  ctx.textBaseline = "middle";
  ctx.fillStyle = MUTED;
  ctx.font = "700 22px sans-serif";
  const statsLine = plan.kind === "movers"
    ? `${plan.upTitle} ${plan.upRows.length} · ${plan.downTitle} ${plan.downRows.length}`
    : `共 ${plan.rows.length} 条出场状态更新`;
  ctx.fillText(statsLine, innerLeft, cardY + 38);

  const cursor = cardY + STRIP_H;
  if (plan.kind === "movers") {
    drawMoversColumns(ctx, plan, innerLeft, innerRight, cursor);
  } else {
    drawWatchRows(ctx, plan, innerLeft, innerRight, cursor);
  }

  ctx.fillStyle = MUTED;
  ctx.font = "500 16px sans-serif";
  ctx.fillText("letletme.top/zh-CN", 30, plan.height - 31, 420);

  drawShareBranding(
    ctx as Parameters<typeof drawShareBranding>[0],
    plan.width,
    plan.height,
  );
}

function drawMoversColumns(
  ctx: ShareCanvasContext,
  plan: HomeMarketMoversSharePlan,
  innerLeft: number,
  innerRight: number,
  cursor: number,
): void {
  const gutter = 28;
  const colWidth = (innerRight - innerLeft - gutter) / 2;
  const columns: Array<{
    title: string;
    rows: HomeMarketMoversShareRow[];
    x: number;
    up: boolean;
  }> = [
    { title: plan.upTitle, rows: plan.upRows, x: innerLeft, up: true },
    { title: plan.downTitle, rows: plan.downRows, x: innerLeft + colWidth + gutter, up: false },
  ];
  for (const column of columns) {
    ctx.textAlign = "left";
    ctx.fillStyle = column.up ? GREEN_INK : DANGER;
    ctx.font = "800 21px sans-serif";
    ctx.fillText(column.title, column.x, cursor + 20, colWidth);
    if (column.rows.length === 0) {
      ctx.fillStyle = MUTED;
      ctx.font = "500 19px sans-serif";
      ctx.fillText("暂无", column.x, cursor + 52, colWidth);
      continue;
    }
    let rowY = cursor + 44;
    for (const row of column.rows) {
      ctx.fillStyle = INK;
      ctx.font = "700 22px sans-serif";
      const name = row.position ? `${row.position} ${row.name}` : row.name;
      ctx.fillText(name, column.x, rowY + 16, colWidth - 96);
      ctx.textAlign = "right";
      ctx.fillStyle = row.rising ? GREEN_INK : DANGER;
      ctx.font = "800 22px sans-serif";
      ctx.fillText(row.changeText, column.x + colWidth, rowY + 16, 92);
      ctx.textAlign = "left";
      ctx.fillStyle = MUTED;
      ctx.font = "500 17px sans-serif";
      ctx.fillText(`${row.team} · ${row.meta}`, column.x, rowY + 44, colWidth);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.strokeRect(column.x, rowY + 63.5, colWidth, 0);
      rowY += MOVER_ROW_H;
    }
  }
}

function drawWatchRows(
  ctx: ShareCanvasContext,
  plan: HomeMarketWatchSharePlan,
  innerLeft: number,
  innerRight: number,
  cursor: number,
): void {
  if (plan.rows.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 19px sans-serif";
    ctx.fillText("暂无出场状态更新", innerLeft, cursor + 32);
    return;
  }
  let rowY = cursor;
  for (const row of plan.rows) {
    // Line 1: status pill + name.
    let nameX = innerLeft;
    if (row.status) {
      const badgeWidth =
        (ctx.measureText?.(row.status).width ?? row.status.length * 19) + 20;
      ctx.fillStyle = row.tone === "up"
        ? ACCENT_TINT
        : row.tone === "down"
          ? "#fbe3e9"
          : TRACK;
      ctx.fillRect(innerLeft, rowY + 8, badgeWidth, 26);
      ctx.fillStyle = row.tone === "up"
        ? GREEN_INK
        : row.tone === "down"
          ? DANGER
          : MUTED;
      ctx.font = "700 17px sans-serif";
      ctx.fillText(row.status, innerLeft + 10, rowY + 21);
      nameX = innerLeft + badgeWidth + 14;
    }
    ctx.fillStyle = INK;
    ctx.font = "700 23px sans-serif";
    ctx.fillText(row.name, nameX, rowY + 21, innerRight - nameX - 140);
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = "600 18px sans-serif";
    ctx.fillText(`${row.team} · ${row.owned}`, innerRight, rowY + 22, 130);
    ctx.textAlign = "left";
    // Line 2: the news body.
    ctx.fillStyle = MUTED;
    ctx.font = "500 18px sans-serif";
    ctx.fillText(row.body, innerLeft, rowY + 58, innerRight - innerLeft);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(innerLeft, rowY + 83.5, innerRight - innerLeft, 0);
    rowY += WATCH_ROW_H;
  }
}

export function homeMarketSharePixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export function homeMarketShareCacheKey(plan: HomeMarketSharePlan): string {
  if (plan.kind === "movers") {
    return JSON.stringify({
      brand: SHARE_BRAND_VERSION,
      kind: plan.kind,
      title: plan.title,
      subtitle: plan.subtitle,
      up: plan.upRows.map((row) => [row.name, row.meta, row.changeText]),
      down: plan.downRows.map((row) => [row.name, row.meta, row.changeText]),
    });
  }
  return JSON.stringify({
    brand: SHARE_BRAND_VERSION,
    kind: plan.kind,
    title: plan.title,
    subtitle: plan.subtitle,
    rows: plan.rows.map((row) => [row.name, row.status, row.body]),
  });
}

interface RenderHomeMarketShareOptions {
  canvas: HomeMarketShareCanvas;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  plan: HomeMarketSharePlan;
  toTempFilePath: (canvas: HomeMarketShareCanvas) => Promise<string>;
}

export function renderHomeMarketShareImage(
  options: RenderHomeMarketShareOptions,
): Promise<string> {
  const dpr = homeMarketSharePixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(options.plan.width * dpr);
  options.canvas.height = Math.round(options.plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  drawHomeMarketSharePlan(options.ctx, options.plan);
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
function exportSharePlan(plan: HomeMarketSharePlan): Promise<string> {
  const key = homeMarketShareCacheKey(plan);
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
    const pixelRatio = homeMarketSharePixelRatio(windowPixelRatio());
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(plan.width * pixelRatio),
      height: Math.round(plan.height * pixelRatio),
    }) as unknown as HomeMarketShareCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share canvas context missing");
    return renderHomeMarketShareImage({
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

export function exportHomeMarketMoversShareImage(
  input: HomeMarketMoversShareInput,
): Promise<string> {
  return exportSharePlan(buildHomeMarketMoversSharePlan(input));
}

export function exportHomeMarketWatchShareImage(
  input: HomeMarketWatchShareInput,
): Promise<string> {
  return exportSharePlan(buildHomeMarketWatchSharePlan(input));
}

export function presentHomeMarketShareImage(path: string): Promise<void> {
  return presentImage(path);
}
