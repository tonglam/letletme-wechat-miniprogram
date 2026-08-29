/**
 * Canvas renderer for the tournament live board share image.
 *
 * Mini Programs cannot snapshot the board, so the visible rows are redrawn
 * from the same display texts the page renders. Branding is always painted
 * last, matching every other LetLetMe share-image surface.
 */
import { presentImage } from "./album-presenter";
import { windowPixelRatio } from "./system-info";
import {
  SHARE_BRAND_VERSION,
  drawShareBranding,
} from "./share-image-brand";
import type { ShareCanvasContext } from "./live-match-share-image";

export const TOURNAMENT_BOARD_SHARE_WIDTH = 750;
export const TOURNAMENT_BOARD_SHARE_MAX_ROWS = 15;

const BACKGROUND = "#f3f0f4";
const CARD = "#fffdf8";
const PLUM = "#38003c";
const DARK_PLUM = "#210025";
const ELECTRIC = "#00ff85";
const INK = "#241f25";
const MUTED = "#716b73";
const LINE = "#ded8df";
const ME_TINT = "rgba(0, 255, 133, 0.10)";

export interface TournamentBoardShareRow {
  rankText: string;
  entryName: string;
  metaLine: string;
  gwText: string;
  netText: string;
  totalText: string;
  isMe: boolean;
}

export interface TournamentBoardShareInput {
  event: number;
  tournamentName: string;
  highestText: string;
  averageText: string;
  entriesText: string;
  rows: TournamentBoardShareRow[];
}

export interface TournamentBoardShareCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): ShareCanvasContext | null;
}

export interface TournamentBoardSharePlan {
  width: number;
  height: number;
  headerTitle: string;
  eyebrow: string;
  statsLine: string;
  rows: TournamentBoardShareRow[];
  truncated: number;
}

export function buildTournamentBoardSharePlan(
  input: TournamentBoardShareInput,
): TournamentBoardSharePlan {
  const rows = input.rows.slice(0, TOURNAMENT_BOARD_SHARE_MAX_ROWS);
  const truncated = Math.max(0, input.rows.length - rows.length);
  // Header band + stats strip + table header + rows + truncation note + card
  // padding, then the footer band.
  const tableHeight = 56 + rows.length * 64 + (truncated > 0 ? 44 : 0);
  const height = 118 + 72 + tableHeight + 32 + 76;
  return {
    width: TOURNAMENT_BOARD_SHARE_WIDTH,
    height,
    headerTitle: "赛事实时榜",
    eyebrow: `${input.event > 0 ? `GW${input.event}` : "LIVE"} · ${input.tournamentName || "LETLETME"}`,
    statsLine: `最高 ${input.highestText} · 平均 ${input.averageText} · 参赛 ${input.entriesText}`,
    rows,
    truncated,
  };
}

/** Paints the complete card; the brand call deliberately remains last. */
export function drawTournamentBoardSharePlan(
  ctx: ShareCanvasContext,
  plan: TournamentBoardSharePlan,
): void {
  const cardX = 28;
  const cardY = 118;
  const cardWidth = plan.width - cardX * 2;
  const innerLeft = cardX + 34;
  const innerRight = cardX + cardWidth - 34;
  const colRankX = innerLeft;
  const colGwX = innerRight - 240;
  const colNetX = innerRight - 130;
  const colTotalX = innerRight;
  const nameMaxWidth = colGwX - colRankX - 84;

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
  ctx.fillText(plan.headerTitle, 36, 23);
  ctx.fillStyle = "rgba(255, 253, 248, 0.68)";
  ctx.font = "600 18px sans-serif";
  ctx.fillText(plan.eyebrow, 37, 70, cardWidth);

  // Card
  const cardHeight = plan.height - 76 - cardY;
  ctx.fillStyle = CARD;
  ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
  ctx.fillStyle = ELECTRIC;
  ctx.fillRect(cardX, cardY, 7, cardHeight);

  // Stats strip
  ctx.textBaseline = "middle";
  ctx.fillStyle = MUTED;
  ctx.font = "700 22px sans-serif";
  ctx.fillText(plan.statsLine, innerLeft, cardY + 38);

  // Table header
  let cursor = cardY + 72;
  ctx.fillStyle = MUTED;
  ctx.font = "700 19px sans-serif";
  ctx.fillText("#", colRankX, cursor + 20);
  ctx.fillText("球队", colRankX + 84, cursor + 20);
  ctx.textAlign = "right";
  ctx.fillText("GW", colGwX, cursor + 20);
  ctx.fillText("净", colNetX, cursor + 20);
  ctx.fillText("总分", colTotalX, cursor + 20);
  ctx.textAlign = "left";
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(innerLeft, cursor + 43.5, innerRight - innerLeft, 0);
  cursor += 56;

  // Rows
  for (const row of plan.rows) {
    if (row.isMe) {
      ctx.fillStyle = ME_TINT;
      ctx.fillRect(cardX + 7, cursor, cardWidth - 7, 64);
    }
    ctx.fillStyle = row.isMe ? PLUM : MUTED;
    ctx.font = "800 22px sans-serif";
    ctx.fillText(row.rankText, colRankX, cursor + 32);
    ctx.fillStyle = INK;
    ctx.font = "700 23px sans-serif";
    ctx.fillText(row.entryName, colRankX + 84, cursor + 24, nameMaxWidth);
    if (row.metaLine) {
      ctx.fillStyle = MUTED;
      ctx.font = "500 18px sans-serif";
      ctx.fillText(row.metaLine, colRankX + 84, cursor + 50, nameMaxWidth);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.font = "800 24px sans-serif";
    ctx.fillText(row.gwText, colGwX, cursor + 32);
    ctx.fillStyle = MUTED;
    ctx.font = "600 21px sans-serif";
    ctx.fillText(row.netText, colNetX, cursor + 32);
    ctx.fillStyle = PLUM;
    ctx.font = "800 24px sans-serif";
    ctx.fillText(row.totalText, colTotalX, cursor + 32);
    ctx.textAlign = "left";
    ctx.strokeStyle = LINE;
    ctx.strokeRect(innerLeft, cursor + 63.5, innerRight - innerLeft, 0);
    cursor += 64;
  }

  if (plan.truncated > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 18px sans-serif";
    ctx.fillText(
      `其余 ${plan.truncated} 支见 letletme.top`,
      innerLeft,
      cursor + 24,
    );
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

export function tournamentBoardSharePixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export function tournamentBoardShareCacheKey(
  input: TournamentBoardShareInput,
): string {
  return JSON.stringify({
    brand: SHARE_BRAND_VERSION,
    event: input.event,
    tournamentName: input.tournamentName,
    rows: input.rows.map((row) => [
      row.rankText,
      row.entryName,
      row.gwText,
      row.netText,
      row.totalText,
      row.isMe ? 1 : 0,
    ]),
  });
}

interface RenderTournamentBoardShareOptions {
  canvas: TournamentBoardShareCanvas;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  input: TournamentBoardShareInput;
  toTempFilePath: (canvas: TournamentBoardShareCanvas) => Promise<string>;
}

export function renderTournamentBoardShareImage(
  options: RenderTournamentBoardShareOptions,
): Promise<string> {
  const plan = buildTournamentBoardSharePlan(options.input);
  const dpr = tournamentBoardSharePixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(plan.width * dpr);
  options.canvas.height = Math.round(plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  drawTournamentBoardSharePlan(options.ctx, plan);
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
export function exportTournamentBoardShareImage(
  input: TournamentBoardShareInput,
): Promise<string> {
  const key = tournamentBoardShareCacheKey(input);
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
    const pixelRatio = tournamentBoardSharePixelRatio(windowPixelRatio());
    const plan = buildTournamentBoardSharePlan(input);
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(plan.width * pixelRatio),
      height: Math.round(plan.height * pixelRatio),
    }) as unknown as TournamentBoardShareCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share canvas context missing");
    return renderTournamentBoardShareImage({
      canvas,
      ctx,
      pixelRatio,
      input,
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

export function presentTournamentBoardShareImage(path: string): Promise<void> {
  return presentImage(path);
}
