/**
 * Canvas renderer for the live player-detail sheet share image.
 *
 * Mini Programs cannot snapshot the bottom sheet into an image, so the sheet
 * content is redrawn from the same PlayerLiveDetailView the page shows.
 * Branding is always painted last, matching every other LetLetMe share-image
 * surface.
 */
import type { PlayerLiveDetailView } from "../pages/live/entry/player-detail";
import { presentImage } from "./album-presenter";
import { windowPixelRatio } from "./system-info";
import {
  SHARE_BRAND_VERSION,
  drawShareBranding,
} from "./share-image-brand";
import type { ShareCanvasContext } from "./live-match-share-image";

export const PLAYER_LIVE_SHARE_WIDTH = 750;

const BACKGROUND = "#f3f0f4";
const CARD = "#fffdf8";
const PLUM = "#38003c";
const DARK_PLUM = "#210025";
const ELECTRIC = "#00ff85";
const INK = "#241f25";
const MUTED = "#716b73";
const LINE = "#ded8df";
const GREEN = "#008545";
const DANGER = "#c62828";

const MAX_BREAKDOWN_ROWS = 8;
const MAX_STAT_ROWS = 8;

export interface PlayerLiveShareImageInput {
  detail: PlayerLiveDetailView;
  event: number;
  entryName?: string;
}

export interface PlayerLiveShareCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): ShareCanvasContext | null;
}

export interface PlayerLiveSharePlan {
  width: number;
  height: number;
  headerTitle: string;
  eyebrow: string;
  name: string;
  metaLine: string;
  pointsText: string;
  pills: Array<{ label: string; value: string }>;
  breakdownRows: Array<{ label: string; countText: string; pointsText: string; negative: boolean }>;
  breakdownSumText: string;
  breakdownHint: string;
  multiplierNote: string;
  statRows: Array<{ label: string; value: string; muted: boolean }>;
}

export function buildPlayerLiveSharePlan(
  input: PlayerLiveShareImageInput,
): PlayerLiveSharePlan {
  const { detail } = input;
  const metaParts = [detail.team, detail.position, detail.statusText].filter(
    (part) => part && part.length > 0,
  );
  const pills: Array<{ label: string; value: string }> = [];
  if (detail.roleBadge) pills.push({ label: "角色", value: detail.roleBadge });
  if (detail.bpsText) pills.push({ label: "BPS", value: detail.bpsText });
  if (detail.bonusText) pills.push({ label: "奖励", value: detail.bonusText });

  const breakdownRows = detail.breakdownRows
    .slice(0, MAX_BREAKDOWN_ROWS)
    .map((row) => ({
      label: row.label,
      countText: row.countText,
      pointsText: row.pointsText,
      negative: row.negative,
    }));
  const statRows = detail.statRows.slice(0, MAX_STAT_ROWS);

  // Header band + identity card + breakdown + stats grid + footer.
  const breakdownHeight =
    breakdownRows.length > 0 ? 64 + breakdownRows.length * 44 + 44 : 64;
  const statLines = Math.max(1, Math.ceil(statRows.length / 4));
  const statsHeight = statRows.length > 0 ? 64 + statLines * 84 : 0;
  const cardHeight = 170 + breakdownHeight + statsHeight + 24;
  const height = 118 + cardHeight + 76;

  return {
    width: PLAYER_LIVE_SHARE_WIDTH,
    height,
    headerTitle: "球员实时详情",
    eyebrow: `${input.event > 0 ? `GW${input.event}` : "LIVE"} · ${input.entryName || "LETLETME"}`,
    name: detail.name,
    metaLine: metaParts.join(" · "),
    pointsText: detail.pointsText,
    pills,
    breakdownRows,
    breakdownSumText: detail.breakdownSumText,
    breakdownHint: detail.breakdownHint,
    multiplierNote: detail.multiplierNote,
    statRows,
  };
}

/** Paints the complete card; the brand call deliberately remains last. */
export function drawPlayerLiveSharePlan(
  ctx: ShareCanvasContext,
  plan: PlayerLiveSharePlan,
): void {
  const cardX = 28;
  const cardY = 118;
  const cardWidth = plan.width - cardX * 2;
  const innerLeft = cardX + 34;
  const innerRight = cardX + cardWidth - 34;
  const contentWidth = innerRight - innerLeft;

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
  ctx.fillText(plan.eyebrow, 37, 70, contentWidth);

  // Card
  const cardHeight = plan.height - 76 - cardY;
  ctx.fillStyle = CARD;
  ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
  ctx.fillStyle = ELECTRIC;
  ctx.fillRect(cardX, cardY, 7, cardHeight);

  // Identity row: name/meta left, hero points right
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = "800 44px sans-serif";
  ctx.fillText(plan.name, innerLeft, cardY + 74, contentWidth - 220);
  if (plan.metaLine) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 22px sans-serif";
    ctx.fillText(plan.metaLine, innerLeft, cardY + 116, contentWidth - 220);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = PLUM;
  ctx.font = "800 76px sans-serif";
  ctx.fillText(plan.pointsText, innerRight, cardY + 96);
  ctx.fillStyle = MUTED;
  ctx.font = "600 18px sans-serif";
  ctx.fillText("得分 PTS", innerRight, cardY + 126);
  ctx.textAlign = "left";

  let cursor = cardY + 150;

  // Pills (role / BPS / bonus)
  if (plan.pills.length > 0) {
    let pillX = innerLeft;
    for (const pill of plan.pills) {
      const text = `${pill.label} ${pill.value}`;
      ctx.font = "700 20px sans-serif";
      const width = Math.max(88, ctx.measureText
        ? ctx.measureText(text).width + 32
        : text.length * 22 + 32);
      ctx.fillStyle = "rgba(56, 0, 60, 0.08)";
      ctx.fillRect(pillX, cursor, width, 40);
      ctx.fillStyle = PLUM;
      ctx.textBaseline = "middle";
      ctx.fillText(text, pillX + 16, cursor + 21);
      pillX += width + 14;
    }
    ctx.textBaseline = "alphabetic";
    cursor += 58;
  }

  // Breakdown
  ctx.fillStyle = MUTED;
  ctx.font = "700 20px sans-serif";
  ctx.fillText(
    plan.multiplierNote ? `得分明细 · ${plan.multiplierNote}` : "得分明细",
    innerLeft,
    cursor + 22,
  );
  cursor += 44;
  if (plan.breakdownRows.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 20px sans-serif";
    ctx.fillText(plan.breakdownHint || "暂无得分明细", innerLeft, cursor + 20);
    cursor += 40;
  } else {
    if (plan.breakdownHint) {
      ctx.fillStyle = MUTED;
      ctx.font = "500 18px sans-serif";
      ctx.fillText(plan.breakdownHint, innerLeft, cursor + 14, contentWidth);
      cursor += 34;
    }
    ctx.textBaseline = "middle";
    for (const row of plan.breakdownRows) {
      ctx.fillStyle = INK;
      ctx.font = "600 22px sans-serif";
      const label = row.countText ? `${row.label} ×${row.countText}` : row.label;
      ctx.fillText(label, innerLeft, cursor + 18);
      ctx.textAlign = "right";
      ctx.fillStyle = row.negative ? DANGER : GREEN;
      ctx.font = "700 22px sans-serif";
      ctx.fillText(row.pointsText, innerRight, cursor + 18);
      ctx.textAlign = "left";
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.strokeRect(innerLeft, cursor + 38.5, contentWidth, 0);
      cursor += 44;
    }
    ctx.fillStyle = PLUM;
    ctx.font = "800 22px sans-serif";
    ctx.fillText("合计", innerLeft, cursor + 18);
    ctx.textAlign = "right";
    ctx.fillText(plan.breakdownSumText, innerRight, cursor + 18);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    cursor += 44;
  }

  // Match stats grid (4 columns)
  if (plan.statRows.length > 0) {
    cursor += 20;
    ctx.fillStyle = MUTED;
    ctx.font = "700 20px sans-serif";
    ctx.fillText("本场数据", innerLeft, cursor + 20);
    cursor += 40;
    const columns = 4;
    const cellWidth = contentWidth / columns;
    plan.statRows.forEach((stat, index) => {
      const col = index % columns;
      const rowIndex = Math.floor(index / columns);
      const x = innerLeft + col * cellWidth;
      const y = cursor + rowIndex * 84;
      ctx.textAlign = "center";
      ctx.fillStyle = MUTED;
      ctx.font = "500 17px sans-serif";
      ctx.fillText(stat.label, x + cellWidth / 2, y + 14, cellWidth - 8);
      ctx.fillStyle = stat.muted ? MUTED : INK;
      ctx.font = "800 30px sans-serif";
      ctx.fillText(stat.value, x + cellWidth / 2, y + 52, cellWidth - 8);
      ctx.textAlign = "left";
    });
  }

  ctx.fillStyle = MUTED;
  ctx.font = "500 16px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("letletme.top/zh-CN", 30, plan.height - 31, 420);

  drawShareBranding(ctx as Parameters<typeof drawShareBranding>[0], plan.width, plan.height);
}

export function playerLiveSharePixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export function playerLiveShareCacheKey(
  input: PlayerLiveShareImageInput,
): string {
  return JSON.stringify({
    brand: SHARE_BRAND_VERSION,
    event: input.event,
    entryName: input.entryName || "",
    detail: input.detail,
  });
}

interface RenderPlayerLiveShareOptions {
  canvas: PlayerLiveShareCanvas;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  input: PlayerLiveShareImageInput;
  toTempFilePath: (canvas: PlayerLiveShareCanvas) => Promise<string>;
}

export function renderPlayerLiveShareImage(
  options: RenderPlayerLiveShareOptions,
): Promise<string> {
  const plan = buildPlayerLiveSharePlan(options.input);
  const dpr = playerLiveSharePixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(plan.width * dpr);
  options.canvas.height = Math.round(plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  drawPlayerLiveSharePlan(options.ctx, plan);
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
export function exportPlayerLiveShareImage(
  input: PlayerLiveShareImageInput,
): Promise<string> {
  const key = playerLiveShareCacheKey(input);
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
    const pixelRatio = playerLiveSharePixelRatio(windowPixelRatio());
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(PLAYER_LIVE_SHARE_WIDTH * pixelRatio),
      height: Math.round(buildPlayerLiveSharePlan(input).height * pixelRatio),
    }) as unknown as PlayerLiveShareCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share canvas context missing");
    return renderPlayerLiveShareImage({
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

export function presentPlayerLiveShareImage(path: string): Promise<void> {
  return presentImage(path);
}
