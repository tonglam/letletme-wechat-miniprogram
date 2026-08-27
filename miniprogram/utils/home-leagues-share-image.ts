/**
 * Canvas renderer for the home personal-league share image (web
 * PersonalLeagueCarousel ShareActions parity — the web card shares as an
 * image only). One module covers both panels: 经典联赛 rank rows and H2H 联赛
 * matchup rows. Branding is always painted last, matching every other
 * LetLetMe share-image surface.
 */
import { presentImage } from "./album-presenter";
import { windowPixelRatio } from "./system-info";
import {
  SHARE_BRAND_VERSION,
  drawShareBranding,
} from "./share-image-brand";
import type { ShareCanvasContext } from "./live-match-share-image";

export const HOME_LEAGUES_SHARE_WIDTH = 750;
export const HOME_LEAGUES_SHARE_MAX_ROWS = 15;

const BACKGROUND = "#f3f0f4";
const CARD = "#fffdf8";
const PLUM = "#38003c";
const DARK_PLUM = "#210025";
const ELECTRIC = "#00ff85";
const INK = "#241f25";
const MUTED = "#716b73";
const LINE = "#ded8df";
// entry-card tokens: --green-ink / --danger / --accent-tint / --track
const GREEN_INK = "#008545";
const DANGER = "#c9183f";
const ACCENT_TINT = "#dcf6ea";
const TRACK = "#f1efe9";

export type HomeLeaguesShareKind = "classic" | "h2h";

export interface HomeLeaguesShareClassicRow {
  name: string;
  /** 公开 / 私人 visibility pill (web LeagueVisibilityBadge). */
  badgeText: string;
  badgePublic: boolean;
  rankText: string;
  /** ↑2 / ↓1 movement next to the rank. */
  movementText: string;
  movementTone: "up" | "down" | "";
}

export interface HomeLeaguesShareH2HRow {
  name: string;
  /** GW3 · 进行中 · #2 */
  metaText: string;
  hasMatchup: boolean;
  viewerName: string;
  opponentName: string;
  /** 66 - 55 or VS. */
  centerText: string;
}

export interface HomeLeaguesShareInput {
  kind: HomeLeaguesShareKind;
  entryName: string;
  playerName?: string;
  total: number;
  classicRows: HomeLeaguesShareClassicRow[];
  h2hRows: HomeLeaguesShareH2HRow[];
}

export interface HomeLeaguesShareCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): ShareCanvasContext | null;
}

export interface HomeLeaguesSharePlan {
  width: number;
  height: number;
  kind: HomeLeaguesShareKind;
  headerTitle: string;
  eyebrow: string;
  statsLine: string;
  classicRows: HomeLeaguesShareClassicRow[];
  h2hRows: HomeLeaguesShareH2HRow[];
  truncated: number;
}

export function buildHomeLeaguesSharePlan(
  input: HomeLeaguesShareInput,
): HomeLeaguesSharePlan {
  const isClassic = input.kind === "classic";
  const rows = isClassic
    ? input.classicRows.slice(0, HOME_LEAGUES_SHARE_MAX_ROWS)
    : input.h2hRows.slice(0, HOME_LEAGUES_SHARE_MAX_ROWS);
  const truncated = Math.max(
    0,
    (isClassic ? input.classicRows.length : input.h2hRows.length) -
      rows.length,
  );
  const rowHeight = isClassic ? 56 : 84;
  // Header band + stats strip + rows + truncation note + card padding, then
  // the footer band.
  const height =
    118 + 72 + rows.length * rowHeight + (truncated > 0 ? 44 : 0) + 32 + 76;
  return {
    width: HOME_LEAGUES_SHARE_WIDTH,
    height,
    kind: input.kind,
    headerTitle: isClassic ? "经典联赛" : "H2H 联赛",
    eyebrow: [input.entryName, input.playerName]
      .filter((part) => part && part.trim().length > 0)
      .join(" · ") || "LETLETME",
    statsLine: `共 ${input.total} 个联赛`,
    classicRows: isClassic ? (rows as HomeLeaguesShareClassicRow[]) : [],
    h2hRows: isClassic ? [] : (rows as HomeLeaguesShareH2HRow[]),
    truncated,
  };
}

/** Paints the complete card; the brand call deliberately remains last. */
export function drawHomeLeaguesSharePlan(
  ctx: ShareCanvasContext,
  plan: HomeLeaguesSharePlan,
): void {
  const cardX = 28;
  const cardY = 118;
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

  let cursor = cardY + 72;
  if (plan.kind === "classic") {
    cursor = drawClassicRows(ctx, plan, innerLeft, innerRight, cursor);
  } else {
    cursor = drawH2HRows(ctx, plan, innerLeft, innerRight, cursor);
  }

  if (plan.truncated > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 18px sans-serif";
    ctx.fillText(
      `其余 ${plan.truncated} 个联赛见 letletme.top`,
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

function drawClassicRows(
  ctx: ShareCanvasContext,
  plan: HomeLeaguesSharePlan,
  innerLeft: number,
  innerRight: number,
  cursor: number,
): number {
  const colMovementX = innerRight - 120;
  const colRankX = innerRight;
  for (const row of plan.classicRows) {
    let nameX = innerLeft;
    if (row.badgeText) {
      // Flat visibility pill (canvas idiom stays square-edged).
      const badgeWidth =
        (ctx.measureText?.(row.badgeText).width ?? row.badgeText.length * 18) +
        20;
      ctx.fillStyle = row.badgePublic ? ACCENT_TINT : TRACK;
      ctx.fillRect(innerLeft, cursor + 15, badgeWidth, 26);
      ctx.fillStyle = row.badgePublic ? GREEN_INK : MUTED;
      ctx.font = "700 17px sans-serif";
      ctx.fillText(row.badgeText, innerLeft + 10, cursor + 28);
      nameX = innerLeft + badgeWidth + 14;
    }
    ctx.fillStyle = INK;
    ctx.font = "700 23px sans-serif";
    ctx.fillText(row.name, nameX, cursor + 28, colMovementX - nameX - 24);
    if (row.movementText) {
      ctx.textAlign = "right";
      ctx.fillStyle = row.movementTone === "down" ? DANGER : GREEN_INK;
      ctx.font = "800 21px sans-serif";
      ctx.fillText(row.movementText, colMovementX, cursor + 28);
    }
    if (row.rankText) {
      ctx.textAlign = "right";
      ctx.fillStyle = GREEN_INK;
      ctx.font = "800 23px sans-serif";
      ctx.fillText(row.rankText, colRankX, cursor + 28);
    }
    ctx.textAlign = "left";
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(innerLeft, cursor + 55.5, innerRight - innerLeft, 0);
    cursor += 56;
  }
  return cursor;
}

function drawH2HRows(
  ctx: ShareCanvasContext,
  plan: HomeLeaguesSharePlan,
  innerLeft: number,
  innerRight: number,
  cursor: number,
): number {
  const centerX = plan.width / 2;
  const sideMaxWidth = centerX - 90 - innerLeft;
  for (const row of plan.h2hRows) {
    // Line 1: league name + GW/status/rank meta.
    ctx.fillStyle = INK;
    ctx.font = "700 22px sans-serif";
    ctx.fillText(row.name, innerLeft, cursor + 24, innerRight - innerLeft - 220);
    if (row.metaText) {
      ctx.textAlign = "right";
      ctx.fillStyle = MUTED;
      ctx.font = "600 18px sans-serif";
      ctx.fillText(row.metaText, innerRight, cursor + 26, 210);
      ctx.textAlign = "left";
    }
    // Line 2: viewer vs opponent (or the no-matchup note).
    if (row.hasMatchup) {
      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.font = "700 22px sans-serif";
      ctx.fillText(row.viewerName, centerX - 90, cursor + 62, sideMaxWidth);
      ctx.textAlign = "center";
      ctx.fillStyle = PLUM;
      ctx.font = "800 24px sans-serif";
      ctx.fillText(row.centerText, centerX, cursor + 62, 170);
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = "700 22px sans-serif";
      ctx.fillText(row.opponentName, centerX + 90, cursor + 62, sideMaxWidth);
    } else {
      ctx.fillStyle = MUTED;
      ctx.font = "500 19px sans-serif";
      ctx.fillText("暂无当前对阵", innerLeft, cursor + 60);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(innerLeft, cursor + 83.5, innerRight - innerLeft, 0);
    cursor += 84;
  }
  return cursor;
}

export function homeLeaguesSharePixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export function homeLeaguesShareCacheKey(
  input: HomeLeaguesShareInput,
): string {
  return JSON.stringify({
    brand: SHARE_BRAND_VERSION,
    kind: input.kind,
    entryName: input.entryName,
    playerName: input.playerName || "",
    total: input.total,
    classicRows: input.classicRows.map((row) => [
      row.name,
      row.badgeText,
      row.rankText,
      row.movementText,
    ]),
    h2hRows: input.h2hRows.map((row) => [
      row.name,
      row.metaText,
      row.viewerName,
      row.opponentName,
      row.centerText,
      row.hasMatchup ? 1 : 0,
    ]),
  });
}

interface RenderHomeLeaguesShareOptions {
  canvas: HomeLeaguesShareCanvas;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  input: HomeLeaguesShareInput;
  toTempFilePath: (canvas: HomeLeaguesShareCanvas) => Promise<string>;
}

export function renderHomeLeaguesShareImage(
  options: RenderHomeLeaguesShareOptions,
): Promise<string> {
  const plan = buildHomeLeaguesSharePlan(options.input);
  const dpr = homeLeaguesSharePixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(plan.width * dpr);
  options.canvas.height = Math.round(plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  drawHomeLeaguesSharePlan(options.ctx, plan);
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
export function exportHomeLeaguesShareImage(
  input: HomeLeaguesShareInput,
): Promise<string> {
  const key = homeLeaguesShareCacheKey(input);
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
    const pixelRatio = homeLeaguesSharePixelRatio(windowPixelRatio());
    const plan = buildHomeLeaguesSharePlan(input);
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(plan.width * pixelRatio),
      height: Math.round(plan.height * pixelRatio),
    }) as unknown as HomeLeaguesShareCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share canvas context missing");
    return renderHomeLeaguesShareImage({
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

export function presentHomeLeaguesShareImage(path: string): Promise<void> {
  return presentImage(path);
}
