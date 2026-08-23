/**
 * Off-screen canvas renderer for the squad-pitch share image.
 *
 * This is intentionally separate from the page layout component. WeChat
 * snapshot / viewport capture will miss the bench or clip the pitch; the
 * share image is always redrawn onto a full canvas.
 */
import {
  buildBenchViews,
  buildPitchRows,
  defaultKitAsset,
  formatSquadPitchHeaderView,
  kitAsset,
  squadPitchBackgroundSrc,
  type SquadPitchHeader,
  type SquadPitchLocale,
  type SquadPitchPlayer
} from "./squad-pitch";
import { presentImage } from "./album-presenter";
import {
  SHARE_BRAND_NAME,
  SHARE_BRAND_URL,
  SHARE_BRAND_VERSION,
  drawShareBranding
} from "./share-image-brand";

export const SHARE_LOGICAL_WIDTH = 750;
export const SHARE_ASPECT_PLAIN = 1304 / 1244;
export const SHARE_ASPECT_BENCH = 4 / 5;

const PITCH_CREAM = "#f8f6ef";
const PITCH_PLUM = "#38003c";
const PITCH_DARK = "#210025";
const PITCH_GREEN = "#00ff85";
const MARKER_BG = "#111315";
const MARKER_INK = "#f5f1e8";
const BENCH_PANEL = "rgba(184, 217, 185, 0.92)";

export type ShareDrawLayer =
  | { type: "background"; src: string }
  | { type: "header"; teamName: string; managerName: string; gwPoints: string }
  | { type: "watermark"; title: string; url: string }
  | {
      type: "starter";
      id: string;
      kitSrc: string;
      webName: string;
      score: number;
      marker: "" | "C" | "V";
      x: number;
      y: number;
      width: number;
    }
  | {
      type: "bench";
      id: string;
      kitSrc: string;
      label: string;
      webName: string;
      fixtureText: string;
      scoreText: string;
      x: number;
      y: number;
      width: number;
    };

export interface ShareDrawPlan {
  width: number;
  height: number;
  backgroundSrc: string;
  kitSrcs: string[];
  layers: ShareDrawLayer[];
}

export interface SharePitchInput {
  players: readonly SquadPitchPlayer[];
  benchPlayers?: readonly SquadPitchPlayer[];
  header: SquadPitchHeader;
  benchBoost?: boolean;
  locale?: SquadPitchLocale;
}

export function shareCanvasSize(hasBench: boolean): { width: number; height: number } {
  const width = SHARE_LOGICAL_WIDTH;
  const aspect = hasBench ? SHARE_ASPECT_BENCH : SHARE_ASPECT_PLAIN;
  return { width, height: Math.round(width / aspect) };
}

export function buildShareDrawPlan(input: SharePitchInput): ShareDrawPlan {
  const benchPlayers = input.benchPlayers || [];
  const hasBench = benchPlayers.length > 0;
  const { width, height } = shareCanvasSize(hasBench);
  const locale = input.locale || "zh-CN";
  const header = formatSquadPitchHeaderView(input.header, locale);
  const rows = buildPitchRows(input.players, hasBench);
  const bench = buildBenchViews(benchPlayers, locale);
  const backgroundSrc = squadPitchBackgroundSrc();
  const placeholderKit = defaultKitAsset();
  const kitSrcs = new Set<string>([backgroundSrc, placeholderKit]);

  const layers: ShareDrawLayer[] = [
    { type: "background", src: backgroundSrc },
    {
      type: "header",
      teamName: header.teamName,
      managerName: header.managerName,
      gwPoints: header.gwPoints
    },
    { type: "watermark", title: SHARE_BRAND_NAME, url: SHARE_BRAND_URL }
  ];

  rows.forEach((row) => {
    const count = row.players.length;
    const cardWidth = (parseFloat(row.cardWidth) / 100) * width;
    const usable = width * 0.916;
    row.players.forEach((player, index) => {
      const slotWidth = usable / count;
      const x = width * 0.042 + slotWidth * index + (slotWidth - cardWidth) / 2;
      const y = (parseFloat(row.top) / 100) * height;
      kitSrcs.add(player.kitSrc);
      layers.push({
        type: "starter",
        id: player.id,
        kitSrc: player.kitSrc,
        webName: player.webName,
        score: player.score,
        marker: player.marker,
        x,
        y,
        width: cardWidth
      });
    });
  });

  if (hasBench) {
    const panelTop = height * 0.805;
    const cardWidth = width * 0.21;
    const gap = width * 0.018;
    const startX = width * 0.064;
    bench.forEach((player, index) => {
      kitSrcs.add(player.kitSrc);
      layers.push({
        type: "bench",
        id: player.id,
        kitSrc: player.kitSrc,
        label: player.label,
        webName: player.webName,
        fixtureText: player.fixtureText,
        scoreText: player.scoreText,
        x: startX + index * (cardWidth + gap),
        y: panelTop + height * 0.038,
        width: cardWidth
      });
    });
  }

  return {
    width,
    height,
    backgroundSrc,
    kitSrcs: Array.from(kitSrcs),
    layers
  };
}

export function shareCacheKey(input: SharePitchInput): string {
  const bench = input.benchPlayers || [];
  return JSON.stringify({
    locale: input.locale || "zh-CN",
    benchBoost: Boolean(input.benchBoost),
    shareBrandVersion: SHARE_BRAND_VERSION,
    header: input.header,
    players: input.players.map((player) => [
      player.id,
      player.webName,
      player.score,
      player.teamCode,
      player.position,
      player.isCaptain,
      player.isViceCaptain
    ]),
    bench: bench.map((player) => [
      player.id,
      player.webName,
      player.score,
      player.teamCode,
      player.position,
      player.fixture
    ])
  });
}

interface CanvasImage {
  width: number;
  height: number;
}

interface ShareCanvas2D {
  width: number;
  height: number;
  createImage(): WechatMiniprogram.Image;
}

interface ShareCanvasContext {
  scale(x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  strokeText?(text: string, x: number, y: number, maxWidth?: number): void;
  measureText?(text: string): { width: number };
  drawImage(image: CanvasImage, dx: number, dy: number, dw: number, dh: number): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo?(x: number, y: number): void;
  lineTo?(x: number, y: number): void;
  closePath?(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
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

function loadCanvasImage(canvas: ShareCanvas2D, src: string): Promise<CanvasImage> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load ${src}`));
    image.src = src;
  });
}

async function loadImageMap(
  canvas: ShareCanvas2D,
  srcs: readonly string[]
): Promise<Map<string, CanvasImage>> {
  const images = new Map<string, CanvasImage>();
  await Promise.all(srcs.map(async (src) => {
    try {
      images.set(src, await loadCanvasImage(canvas, src));
    } catch {
      const placeholder = defaultKitAsset();
      if (src !== placeholder && !images.has(placeholder)) {
        try {
          images.set(placeholder, await loadCanvasImage(canvas, placeholder));
        } catch {
          // Placeholder is optional; the player card still renders name + score.
        }
      }
    }
  }));
  return images;
}

function truncateText(
  ctx: ShareCanvasContext,
  text: string,
  maxWidth: number
): string {
  if (!text) return "";
  if (ctx.measureText && ctx.measureText(text).width <= maxWidth) return text;
  let next = text;
  while (next.length > 1) {
    next = next.slice(0, -1);
    const candidate = `${next}…`;
    if (!ctx.measureText || ctx.measureText(candidate).width <= maxWidth) return candidate;
  }
  return text.slice(0, 1);
}

function drawStarter(
  ctx: ShareCanvasContext,
  layer: Extract<ShareDrawLayer, { type: "starter" }>,
  images: Map<string, CanvasImage>
) {
  const placeholder = defaultKitAsset();
  const kit = images.get(layer.kitSrc) || images.get(placeholder) || images.get(kitAsset(""));
  const kitWidth = layer.width * 0.9;
  const kitHeight = kitWidth * (220 / 240);
  const kitX = layer.x + (layer.width - kitWidth) / 2;
  if (kit) {
    ctx.drawImage(kit, kitX, layer.y, kitWidth, kitHeight);
  }
  if (layer.marker) {
    const radius = Math.max(8, layer.width * 0.13);
    const cx = kitX + radius * 0.35;
    const cy = layer.y + radius * 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = MARKER_BG;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = layer.marker === "C" ? PITCH_GREEN : MARKER_INK;
    ctx.stroke();
    ctx.fillStyle = MARKER_INK;
    ctx.font = `bold ${Math.max(9, radius)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(layer.marker, cx, cy + 0.5);
  }

  const plateY = layer.y + kitHeight * 0.78;
  const plateW = layer.width;
  const nameH = Math.max(16, layer.width * 0.28);
  const scoreH = Math.max(15, layer.width * 0.26);
  ctx.fillStyle = PITCH_CREAM;
  ctx.fillRect(layer.x, plateY, plateW, nameH);
  ctx.fillStyle = PITCH_PLUM;
  ctx.fillRect(layer.x, plateY + nameH, plateW, scoreH);
  ctx.fillStyle = PITCH_PLUM;
  ctx.font = `bold ${Math.max(10, layer.width * 0.18)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(truncateText(ctx, layer.webName, plateW - 6), layer.x + plateW / 2, plateY + nameH / 2, plateW - 4);
  ctx.fillStyle = PITCH_CREAM;
  ctx.font = `bold ${Math.max(11, layer.width * 0.2)}px sans-serif`;
  ctx.fillText(String(layer.score), layer.x + plateW / 2, plateY + nameH + scoreH / 2);
}

function drawBench(
  ctx: ShareCanvasContext,
  layer: Extract<ShareDrawLayer, { type: "bench" }>,
  images: Map<string, CanvasImage>
) {
  ctx.fillStyle = PITCH_CREAM;
  ctx.fillRect(layer.x, layer.y, layer.width, layer.width * 0.62);
  const kit = images.get(layer.kitSrc) || images.get(defaultKitAsset());
  const kitH = layer.width * 0.42;
  if (kit) {
    ctx.drawImage(kit, layer.x + 4, layer.y + 8, kitH * (240 / 220) * 0.72, kitH);
  }
  const textX = layer.x + layer.width * 0.42;
  const maxW = layer.width * 0.54;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(56, 0, 60, 0.55)";
  ctx.font = `bold ${Math.max(8, layer.width * 0.09)}px sans-serif`;
  ctx.fillText(truncateText(ctx, layer.label, maxW), textX, layer.y + 6, maxW);
  ctx.fillStyle = PITCH_PLUM;
  ctx.font = `bold ${Math.max(10, layer.width * 0.12)}px sans-serif`;
  ctx.fillText(truncateText(ctx, layer.webName, maxW), textX, layer.y + 20, maxW);
  ctx.fillStyle = "rgba(56, 0, 60, 0.75)";
  ctx.font = `${Math.max(9, layer.width * 0.1)}px sans-serif`;
  ctx.fillText(
    truncateText(ctx, [layer.fixtureText, layer.scoreText].filter(Boolean).join(" · "), maxW),
    textX,
    layer.y + 38,
    maxW
  );
}

export function drawSharePlan(
  ctx: ShareCanvasContext,
  plan: ShareDrawPlan,
  images: Map<string, CanvasImage>
) {
  ctx.fillStyle = PITCH_DARK;
  ctx.fillRect(0, 0, plan.width, plan.height);

  const background = images.get(plan.backgroundSrc);
  if (background) {
    ctx.drawImage(background, 0, 0, plan.width, plan.height);
  }

  const header = plan.layers.find((layer) => layer.type === "header");
  if (header && header.type === "header") {
    const top = plan.height * 0.0193;
    const height = plan.height * 0.1013;
    const left = plan.width * 0.052;
    const right = plan.width * 0.948;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = PITCH_CREAM;
    ctx.font = `bold ${Math.max(18, plan.width * 0.034)}px sans-serif`;
    ctx.fillText(truncateText(ctx, header.teamName, plan.width * 0.62), left, top + height * 0.38, plan.width * 0.62);
    ctx.fillStyle = "rgba(248, 246, 239, 0.7)";
    ctx.font = `${Math.max(12, plan.width * 0.022)}px sans-serif`;
    ctx.fillText(truncateText(ctx, header.managerName, plan.width * 0.62), left, top + height * 0.72, plan.width * 0.62);

    ctx.textAlign = "right";
    ctx.fillStyle = PITCH_GREEN;
    ctx.font = `bold ${Math.max(28, plan.width * 0.056)}px sans-serif`;
    ctx.fillText(header.gwPoints, right, top + height * 0.55);
  }

  if (plan.layers.some((layer) => layer.type === "bench")) {
    const x = plan.width * 0.052;
    const y = plan.height * 0.79;
    const w = plan.width * 0.896;
    const h = plan.height * 0.195;
    ctx.fillStyle = BENCH_PANEL;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PITCH_PLUM;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `bold ${Math.max(11, plan.width * 0.018)}px sans-serif`;
    ctx.fillText("替补", x + 12, y + 8);
  }

  plan.layers.forEach((layer) => {
    if (layer.type === "starter") drawStarter(ctx, layer, images);
    if (layer.type === "bench") drawBench(ctx, layer, images);
  });

  const watermark = plan.layers.find((layer) => layer.type === "watermark");
  if (watermark && watermark.type === "watermark") {
    drawShareBranding(ctx, plan.width, plan.height, {
      title: watermark.title,
      url: watermark.url
    });
  }
}

export function shareExportPixelRatio(pixelRatio: number): number {
  return Math.min(2, Math.max(1, Number(pixelRatio) || 1));
}

export interface RenderShareImageOptions {
  canvas: ShareCanvas2D;
  ctx: ShareCanvasContext;
  pixelRatio: number;
  input: SharePitchInput;
  toTempFilePath: (canvas: ShareCanvas2D) => Promise<string>;
}

export async function renderSquadPitchShareImage(options: RenderShareImageOptions): Promise<string> {
  const plan = buildShareDrawPlan(options.input);
  const dpr = shareExportPixelRatio(options.pixelRatio);
  options.canvas.width = Math.round(plan.width * dpr);
  options.canvas.height = Math.round(plan.height * dpr);
  options.ctx.scale(dpr, dpr);
  const images = await loadImageMap(options.canvas, plan.kitSrcs);
  drawSharePlan(options.ctx, plan, images);
  return options.toTempFilePath(options.canvas);
}

let inFlight: Promise<string> | null = null;
let inFlightKey = "";
let shareGeneration = 0;
let exportSeq = 0;
let cachedKey = "";
let cachedPath = "";
let exportTail: Promise<void> = Promise.resolve();

export function resetShareImageCache(): void {
  shareGeneration += 1;
  exportSeq += 1;
  inFlight = null;
  inFlightKey = "";
  cachedKey = "";
  cachedPath = "";
}

export function exportSquadPitchShareImage(options: RenderShareImageOptions): Promise<string> {
  const key = shareCacheKey(options.input);
  if (cachedPath && cachedKey === key) return Promise.resolve(cachedPath);
  if (inFlight && inFlightKey === key) return inFlight;
  const generation = shareGeneration;
  const seq = ++exportSeq;
  const request = exportTail
    .catch(() => undefined)
    .then(() => {
      if (cachedPath && cachedKey === key && generation === shareGeneration) {
        return cachedPath;
      }
      return renderSquadPitchShareImage(options).then((path) => {
        if (generation === shareGeneration && seq === exportSeq) {
          cachedKey = key;
          cachedPath = path;
        }
        return path;
      });
    })
    .finally(() => {
      if (inFlight === request) {
        inFlight = null;
        inFlightKey = "";
      }
    });
  inFlight = request;
  inFlightKey = key;
  exportTail = request.then(() => undefined, () => undefined);
  return request;
}

export function presentSquadPitchShareImage(path: string): Promise<void> {
  return presentImage(path);
}
