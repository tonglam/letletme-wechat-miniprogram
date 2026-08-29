/**
 * Canvas renderer for the official H2H share image.
 *
 * One module covers the three H2H slides (standings / 本轮对阵 / 我的对阵),
 * mirroring tournament-board-share-image.ts: the visible rows are redrawn
 * from the same display texts the page renders, and the LetLetMe branding is
 * always painted last.
 */
import { presentImage } from "./album-presenter";
import { windowPixelRatio } from "./system-info";
import {
  SHARE_BRAND_VERSION,
  drawShareBranding,
} from "./share-image-brand";
import type { ShareCanvasContext } from "./live-match-share-image";

export const TOURNAMENT_H2H_SHARE_WIDTH = 750;
export const TOURNAMENT_H2H_SHARE_MAX_ROWS = 15;

const BACKGROUND = "#f3f0f4";
const CARD = "#fffdf8";
const PLUM = "#38003c";
const DARK_PLUM = "#210025";
const ELECTRIC = "#00ff85";
const INK = "#241f25";
const MUTED = "#716b73";
const LINE = "#ded8df";
const ME_TINT = "rgba(0, 255, 133, 0.10)";

export type TournamentH2HShareKind = "standings" | "matches" | "matchups";

export interface TournamentH2HShareStandingRow {
  rankText: string;
  entryName: string;
  recordText: string;
  pointsForText: string;
  matchPointsText: string;
  isMe: boolean;
}

export interface TournamentH2HShareMatchRow {
  /** #01 for fixtures, GW3 for matchup history. */
  labelText: string;
  /** 常规赛/半决赛 for fixtures, 进行中/已结束/待开始 for matchup history. */
  statusText: string;
  homeName: string;
  awayName: string;
  /** "60 — 55" or 对阵 when the score is not traceable yet. */
  scoreText: string;
  involvesViewer: boolean;
}

export interface TournamentH2HShareInput {
  kind: TournamentH2HShareKind;
  event: number;
  tournamentName: string;
  /** Optional stats strip under the header (viewer H2H snapshot). */
  statsLine?: string;
  standingRows: TournamentH2HShareStandingRow[];
  matchRows: TournamentH2HShareMatchRow[];
}

export interface TournamentH2HShareCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): ShareCanvasContext | null;
}

export interface TournamentH2HSharePlan {
  width: number;
  height: number;
  kind: TournamentH2HShareKind;
  headerTitle: string;
  eyebrow: string;
  statsLine: string;
  standingRows: TournamentH2HShareStandingRow[];
  matchRows: TournamentH2HShareMatchRow[];
  truncated: number;
}

export function buildTournamentH2HSharePlan(
  input: TournamentH2HShareInput,
): TournamentH2HSharePlan {
  const isStandings = input.kind === "standings";
  const rows = isStandings
    ? input.standingRows.slice(0, TOURNAMENT_H2H_SHARE_MAX_ROWS)
    : input.matchRows.slice(0, TOURNAMENT_H2H_SHARE_MAX_ROWS);
  const truncated = Math.max(
    0,
    (isStandings ? input.standingRows.length : input.matchRows.length) -
      rows.length,
  );
  const statsLine = (input.statsLine || "").trim();
  const statsHeight = statsLine ? 72 : 0;
  const tableHead = isStandings ? 56 : 0;
  const rowHeight = isStandings ? 64 : 76;
  // Header band + optional stats strip + optional table header + rows +
  // truncation note + card padding, then the footer band.
  const height =
    118 +
    statsHeight +
    tableHead +
    rows.length * rowHeight +
    (truncated > 0 ? 44 : 0) +
    32 +
    76;
  const headerTitle =
    input.kind === "standings"
      ? "H2H 积分榜"
      : input.kind === "matches"
        ? "H2H 本轮对阵"
        : "我的对阵";
  const eyebrow =
    input.kind === "matchups"
      ? input.tournamentName || "LETLETME"
      : `${input.event > 0 ? `GW${input.event}` : "LIVE"} · ${input.tournamentName || "LETLETME"}`;
  return {
    width: TOURNAMENT_H2H_SHARE_WIDTH,
    height,
    kind: input.kind,
    headerTitle,
    eyebrow,
    statsLine,
    standingRows: isStandings
      ? (rows as TournamentH2HShareStandingRow[])
      : [],
    matchRows: isStandings ? [] : (rows as TournamentH2HShareMatchRow[]),
    truncated,
  };
}

/** Paints the complete card; the brand call deliberately remains last. */
export function drawTournamentH2HSharePlan(
  ctx: ShareCanvasContext,
  plan: TournamentH2HSharePlan,
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

  let cursor = cardY + 32;

  // Stats strip (standings viewer snapshot)
  if (plan.statsLine) {
    ctx.textBaseline = "middle";
    ctx.fillStyle = MUTED;
    ctx.font = "700 22px sans-serif";
    ctx.fillText(plan.statsLine, innerLeft, cardY + 38);
    cursor = cardY + 72;
  } else {
    ctx.textBaseline = "middle";
  }

  if (plan.kind === "standings") {
    drawStandingsRows(ctx, plan, innerLeft, innerRight, cursor);
  } else {
    drawMatchRows(ctx, plan, innerLeft, innerRight, cursor);
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

function drawStandingsRows(
  ctx: ShareCanvasContext,
  plan: TournamentH2HSharePlan,
  innerLeft: number,
  innerRight: number,
  cursor: number,
): void {
  const cardX = 28;
  const cardWidth = plan.width - cardX * 2;
  const colRankX = innerLeft;
  const colRecordX = innerRight - 260;
  const colPfX = innerRight - 140;
  const colMpX = innerRight;
  const nameMaxWidth = colRecordX - colRankX - 84;

  // Table header
  ctx.fillStyle = MUTED;
  ctx.font = "700 19px sans-serif";
  ctx.fillText("#", colRankX, cursor + 20);
  ctx.fillText("球队", colRankX + 84, cursor + 20);
  ctx.textAlign = "right";
  ctx.fillText("战绩", colRecordX, cursor + 20);
  ctx.fillText("总得分", colPfX, cursor + 20);
  ctx.fillText("积分", colMpX, cursor + 20);
  ctx.textAlign = "left";
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(innerLeft, cursor + 43.5, innerRight - innerLeft, 0);
  cursor += 56;

  for (const row of plan.standingRows) {
    if (row.isMe) {
      ctx.fillStyle = ME_TINT;
      ctx.fillRect(cardX + 7, cursor, cardWidth - 7, 64);
    }
    ctx.fillStyle = row.isMe ? PLUM : MUTED;
    ctx.font = "800 22px sans-serif";
    ctx.fillText(row.rankText, colRankX, cursor + 32);
    ctx.fillStyle = INK;
    ctx.font = "700 23px sans-serif";
    ctx.fillText(row.entryName, colRankX + 84, cursor + 32, nameMaxWidth);
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = "600 21px sans-serif";
    ctx.fillText(row.recordText, colRecordX, cursor + 32);
    ctx.fillText(row.pointsForText, colPfX, cursor + 32);
    ctx.fillStyle = PLUM;
    ctx.font = "800 24px sans-serif";
    ctx.fillText(row.matchPointsText, colMpX, cursor + 32);
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
}

function drawMatchRows(
  ctx: ShareCanvasContext,
  plan: TournamentH2HSharePlan,
  innerLeft: number,
  innerRight: number,
  cursor: number,
): void {
  const cardX = 28;
  const cardWidth = plan.width - cardX * 2;
  const centerX = plan.width / 2;
  const sideMaxWidth = centerX - 90 - innerLeft;

  for (const row of plan.matchRows) {
    if (row.involvesViewer) {
      ctx.fillStyle = ME_TINT;
      ctx.fillRect(cardX + 7, cursor, cardWidth - 7, 76);
    }
    // Meta line: #01 · 半决赛 or GW3 · 已结束
    ctx.fillStyle = PLUM;
    ctx.font = "800 20px sans-serif";
    const labelWidth = row.labelText
      ? (ctx.measureText?.(row.labelText).width ?? row.labelText.length * 22)
      : 0;
    if (row.labelText) {
      ctx.fillText(row.labelText, innerLeft, cursor + 26);
    }
    if (row.statusText) {
      ctx.fillStyle = MUTED;
      ctx.font = "600 18px sans-serif";
      ctx.fillText(
        row.statusText,
        innerLeft + (labelWidth > 0 ? labelWidth + 16 : 0),
        cursor + 28,
        innerRight - innerLeft - labelWidth - 16,
      );
    }
    // Main line: home right-aligned, score centered, away left-aligned.
    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.font = "700 22px sans-serif";
    ctx.fillText(row.homeName, centerX - 90, cursor + 58, sideMaxWidth);
    ctx.textAlign = "center";
    ctx.fillStyle = PLUM;
    ctx.font = "800 24px sans-serif";
    ctx.fillText(row.scoreText, centerX, cursor + 58, 170);
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = "700 22px sans-serif";
    ctx.fillText(row.awayName, centerX + 90, cursor + 58, sideMaxWidth);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(innerLeft, cursor + 75.5, innerRight - innerLeft, 0);
    cursor += 76;
  }

  if (plan.truncated > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 18px sans-serif";
    ctx.fillText(
      `其余 ${plan.truncated} 场见 letletme.top`,
      innerLeft,
      cursor + 24,
    );
  }
}

export function tournamentH2HSharePixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export function tournamentH2HShareCacheKey(
  input: TournamentH2HShareInput,
): string {
  return JSON.stringify({
    brand: SHARE_BRAND_VERSION,
    kind: input.kind,
    event: input.event,
    tournamentName: input.tournamentName,
    statsLine: input.statsLine || "",
    standingRows: input.standingRows.map((row) => [
      row.rankText,
      row.entryName,
      row.recordText,
      row.pointsForText,
      row.matchPointsText,
      row.isMe ? 1 : 0,
    ]),
    matchRows: input.matchRows.map((row) => [
      row.labelText,
      row.statusText,
      row.homeName,
      row.awayName,
      row.scoreText,
      row.involvesViewer ? 1 : 0,
    ]),
  });
}

interface RenderTournamentH2HShareOptions {
  canvas: TournamentH2HShareCanvas;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  input: TournamentH2HShareInput;
  toTempFilePath: (canvas: TournamentH2HShareCanvas) => Promise<string>;
}

export function renderTournamentH2HShareImage(
  options: RenderTournamentH2HShareOptions,
): Promise<string> {
  const plan = buildTournamentH2HSharePlan(options.input);
  const dpr = tournamentH2HSharePixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(plan.width * dpr);
  options.canvas.height = Math.round(plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  drawTournamentH2HSharePlan(options.ctx, plan);
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
export function exportTournamentH2HShareImage(
  input: TournamentH2HShareInput,
): Promise<string> {
  const key = tournamentH2HShareCacheKey(input);
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
    const pixelRatio = tournamentH2HSharePixelRatio(windowPixelRatio());
    const plan = buildTournamentH2HSharePlan(input);
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(plan.width * pixelRatio),
      height: Math.round(plan.height * pixelRatio),
    }) as unknown as TournamentH2HShareCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share canvas context missing");
    return renderTournamentH2HShareImage({
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

export function presentTournamentH2HShareImage(path: string): Promise<void> {
  return presentImage(path);
}
