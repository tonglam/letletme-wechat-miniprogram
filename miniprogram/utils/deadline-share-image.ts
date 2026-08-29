/**
 * Canvas renderer for the home deadline countdown card.
 *
 * Mini Programs cannot snapshot arbitrary WXML into an image, so the
 * scoreboard card is redrawn from the same countdown parts the page shows.
 * Branding is always painted last, matching every other LetLetMe share-image
 * surface.
 */
import type { CountdownParts } from "./date";
import { presentImage } from "./album-presenter";
import { windowPixelRatio } from "./system-info";
import {
  SHARE_BRAND_VERSION,
  drawShareBranding,
} from "./share-image-brand";
import type { ShareCanvasContext } from "./live-match-share-image";

export const DEADLINE_SHARE_WIDTH = 750;

const BACKGROUND = "#f3f0f4";
const CARD = "#fffdf8";
const PLUM = "#38003c";
const DARK_PLUM = "#210025";
const ELECTRIC = "#00ff85";
const MUTED = "#716b73";
const DANGER = "#c62828";

export interface DeadlineShareImageInput {
  event: number;
  deadlineText: string;
  countdown: CountdownParts;
  passed: boolean;
}

export interface DeadlineShareCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): ShareCanvasContext | null;
}

export interface DeadlineSharePlan {
  width: number;
  height: number;
  cardHeight: number;
  eventLabel: string;
  statusText: string;
  headline: string;
  passed: boolean;
  countdownTiles: Array<{ value: string; label: string }>;
  deadlineLine: string;
}

export function buildDeadlineSharePlan(
  input: DeadlineShareImageInput,
): DeadlineSharePlan {
  const eventLabel = input.event > 0 ? `GW${input.event}` : "下一轮";
  const tiles = input.passed
    ? []
    : [
        { value: input.countdown.days, label: "天" },
        { value: input.countdown.hours, label: "时" },
        { value: input.countdown.minutes, label: "分" },
        { value: input.countdown.seconds, label: "秒" },
      ];
  const headline = input.passed ? `${eventLabel} 进行中` : "截止倒计时";
  const statusText = input.passed ? "LIVE" : eventLabel;
  const deadlineLine = input.passed
    ? "等待官方数据更新"
    : input.deadlineText
      ? `截止时间：${input.deadlineText}`
      : "";
  const cardHeight = input.passed ? 240 : 320;
  const height = 118 + cardHeight + 76;
  return {
    width: DEADLINE_SHARE_WIDTH,
    height,
    cardHeight,
    eventLabel,
    statusText,
    headline,
    passed: input.passed,
    countdownTiles: tiles,
    deadlineLine,
  };
}

/** Paints the complete card; the brand call deliberately remains last. */
export function drawDeadlineSharePlan(
  ctx: ShareCanvasContext,
  plan: DeadlineSharePlan,
): void {
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
  ctx.fillText(plan.headline, 36, 23);
  ctx.fillStyle = "rgba(255, 253, 248, 0.68)";
  ctx.font = "600 18px sans-serif";
  ctx.fillText(`${plan.eventLabel} DEADLINE · LetLetMe`, 37, 70);

  ctx.fillStyle = CARD;
  ctx.fillRect(cardX, cardY, cardWidth, plan.cardHeight);
  ctx.fillStyle = ELECTRIC;
  ctx.fillRect(cardX, cardY, 7, plan.cardHeight);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const pillText = plan.statusText;
  const pillWidth = Math.max(92, pillText.length * 26 + 34);
  const edge = plan.passed ? DANGER : "#008545";
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = edge;
  ctx.fillRect(innerLeft, cardY + 28, pillWidth, 38);
  ctx.globalAlpha = 1;
  ctx.fillStyle = edge;
  ctx.font = "700 20px sans-serif";
  ctx.fillText(pillText, innerLeft + 16, cardY + 47);

  if (plan.passed) {
    ctx.textAlign = "center";
    ctx.fillStyle = DANGER;
    ctx.font = "700 54px sans-serif";
    ctx.fillText("LIVE", plan.width / 2, cardY + 140);
    if (plan.deadlineLine) {
      ctx.fillStyle = MUTED;
      ctx.font = "500 22px sans-serif";
      ctx.fillText(plan.deadlineLine, plan.width / 2, cardY + 190);
    }
  } else {
    const tiles = plan.countdownTiles;
    const gap = 18;
    const tileWidth = (innerRight - innerLeft - gap * (tiles.length - 1)) / 4;
    const tileTop = cardY + 96;
    const tileHeight = 120;
    tiles.forEach((tile, index) => {
      const x = innerLeft + index * (tileWidth + gap);
      ctx.fillStyle = PLUM;
      ctx.fillRect(x, tileTop, tileWidth, tileHeight);
      ctx.textAlign = "center";
      ctx.fillStyle = ELECTRIC;
      ctx.font = "700 48px sans-serif";
      ctx.fillText(tile.value, x + tileWidth / 2, tileTop + 52, tileWidth - 12);
      ctx.fillStyle = "rgba(255, 253, 248, 0.66)";
      ctx.font = "600 18px sans-serif";
      ctx.fillText(tile.label, x + tileWidth / 2, tileTop + 96);
    });
    if (plan.deadlineLine) {
      ctx.textAlign = "center";
      ctx.fillStyle = MUTED;
      ctx.font = "500 22px sans-serif";
      ctx.fillText(plan.deadlineLine, plan.width / 2, tileTop + tileHeight + 48, innerRight - innerLeft);
    }
  }

  ctx.fillStyle = MUTED;
  ctx.font = "500 16px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("letletme.top/zh-CN", 30, plan.height - 31, 420);

  drawShareBranding(ctx as Parameters<typeof drawShareBranding>[0], plan.width, plan.height);
}

export function deadlineSharePixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export function deadlineShareCacheKey(input: DeadlineShareImageInput): string {
  return JSON.stringify({
    brand: SHARE_BRAND_VERSION,
    event: input.event,
    deadlineText: input.deadlineText,
    countdown: input.countdown,
    passed: input.passed,
  });
}

interface RenderDeadlineShareOptions {
  canvas: DeadlineShareCanvas;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  input: DeadlineShareImageInput;
  toTempFilePath: (canvas: DeadlineShareCanvas) => Promise<string>;
}

export function renderDeadlineShareImage(
  options: RenderDeadlineShareOptions,
): Promise<string> {
  const plan = buildDeadlineSharePlan(options.input);
  const dpr = deadlineSharePixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(plan.width * dpr);
  options.canvas.height = Math.round(plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  drawDeadlineSharePlan(options.ctx, plan);
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
export function exportDeadlineShareImage(
  input: DeadlineShareImageInput,
): Promise<string> {
  const key = deadlineShareCacheKey(input);
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

  const plan = buildDeadlineSharePlan(input);
  const request = Promise.resolve().then(async () => {
    if (typeof createOffscreen !== "function") {
      throw new Error("share canvas unavailable");
    }
    const pixelRatio = deadlineSharePixelRatio(windowPixelRatio());
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(plan.width * pixelRatio),
      height: Math.round(plan.height * pixelRatio),
    }) as unknown as DeadlineShareCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share canvas context missing");
    return renderDeadlineShareImage({
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

export function presentDeadlineShareImage(path: string): Promise<void> {
  return presentImage(path);
}
