/**
 * Presentation math for the native mini-chart.
 * No WeChat APIs and no player/score invention — callers pass the series.
 */

export type MiniChartType = "line" | "bar" | "combo" | "radar";

export interface MiniChartPoint {
  x: number;
  value: number | null;
  value2?: number | null;
  bar?: number | null;
  fill?: string;
  marker?: boolean;
  label?: string;
}

export interface MiniChartPad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MiniChartPlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MiniChartDrawPlan {
  plot: MiniChartPlot;
  xInset: number;
  ticks: Array<{ y: number; label: string }>;
  xLabels: Array<{ x: number; label: string }>;
  bars: Array<{ x: number; y: number; w: number; h: number; fill: string }>;
  line: Array<{ x: number; y: number }>;
  line2: Array<{ x: number; y: number }>;
  markers: number[];
  radarRings: Array<Array<{ x: number; y: number }>>;
  radarSpokes: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  radarLabels: Array<{ x: number; y: number; text: string; align: "left" | "right" | "center" }>;
  radarPolygons: Array<{ points: Array<{ x: number; y: number }>; fill: string; stroke: string }>;
  selectedX?: number;
  baselineY?: number;
  referenceY?: number;
}

export const MINI_CHART_INK = "#301333";
export const MINI_CHART_MUTED = "#6e5a72";
export const MINI_CHART_PLUM = "#38003c";
export const MINI_CHART_LINE = "#ddd4de";
export const MINI_CHART_DANGER = "#c9183f";
export const MINI_CHART_BAR_FILL = "rgba(48, 19, 51, 0.16)";

const DEFAULT_PAD: MiniChartPad = { top: 12, right: 12, bottom: 26, left: 42 };

export function numericExtent(
  values: Array<number | null | undefined>,
  pad = 0.08
): { min: number; max: number } {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (nums.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    if (min === 0) return { min: -1, max: 1 };
    const span = Math.abs(min) * 0.12 || 1;
    return { min: min - span, max: max + span };
  }
  const extra = (max - min) * pad;
  return { min: min - extra, max: max + extra };
}

export function projectX(index: number, count: number, plot: MiniChartPlot, inset = 0): number {
  if (count <= 1) return plot.x + plot.width / 2;
  const usable = Math.max(0, plot.width - inset * 2);
  return plot.x + inset + (index / (count - 1)) * usable;
}

export function projectY(
  value: number,
  min: number,
  max: number,
  plot: MiniChartPlot,
  invertY = false
): number {
  const span = max - min || 1;
  const t = (value - min) / span;
  return invertY ? plot.y + t * plot.height : plot.y + (1 - t) * plot.height;
}

export function formatAxisNum(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trimDecimal(value / 1_000_000)}m`;
  if (abs >= 1000) return `${trimDecimal(value / 1000)}k`;
  return String(Math.round(value));
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function axisTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min];
  }
  const step = (max - min) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

export function nearestPointIndex(
  tapX: number,
  count: number,
  plot: MiniChartPlot,
  inset = 0
): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  const usable = Math.max(1, plot.width - inset * 2);
  const t = (tapX - plot.x - inset) / usable;
  return Math.max(0, Math.min(count - 1, Math.round(t * (count - 1))));
}

export function slotWidth(count: number, plot: MiniChartPlot): number {
  if (count <= 0) return 0;
  return plot.width / Math.max(count, 1);
}

function radarVertex(index: number, count: number, radius: number, cx: number, cy: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(count, 1);
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function emptyPlan(plot: MiniChartPlot): MiniChartDrawPlan {
  return {
    plot,
    xInset: 0,
    ticks: [],
    xLabels: [],
    bars: [],
    line: [],
    line2: [],
    markers: [],
    radarRings: [],
    radarSpokes: [],
    radarLabels: [],
    radarPolygons: []
  };
}

function buildRadarPlan(options: {
  plot: MiniChartPlot;
  points: MiniChartPoint[];
}): MiniChartDrawPlan {
  const plan = emptyPlan(options.plot);
  const count = options.points.length;
  if (count < 3) return plan;
  const cx = options.plot.x + options.plot.width / 2;
  const cy = options.plot.y + options.plot.height / 2;
  const radius = Math.min(options.plot.width, options.plot.height) * 0.34;
  const labelRadius = radius + 22;
  plan.radarRings = [0.25, 0.5, 0.75, 1].map((level) =>
    Array.from({ length: count }, (_, index) => radarVertex(index, count, radius * level, cx, cy))
  );
  plan.radarSpokes = Array.from({ length: count }, (_, index) => {
    const outer = radarVertex(index, count, radius, cx, cy);
    return { x1: cx, y1: cy, x2: outer.x, y2: outer.y };
  });
  plan.radarLabels = options.points.map((point, index) => {
    const label = radarVertex(index, count, labelRadius, cx, cy);
    return {
      x: label.x,
      y: label.y,
      text: point.label || String(point.x),
      align: label.x < cx - 8 ? "right" : label.x > cx + 8 ? "left" : "center"
    };
  });
  const polygon = (key: "value" | "value2", fill: string, stroke: string) => ({
    points: options.points.map((point, index) => {
      const raw = key === "value2" ? point.value2 : point.value;
      const value = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
      return radarVertex(index, count, (radius * value) / 100, cx, cy);
    }),
    fill,
    stroke
  });
  plan.radarPolygons = [polygon("value", "rgba(56, 0, 60, 0.14)", MINI_CHART_PLUM)];
  if (options.points.some((point) => point.value2 != null)) {
    plan.radarPolygons.push(polygon("value2", "rgba(48, 19, 51, 0.08)", MINI_CHART_INK));
  }
  return plan;
}

export function buildMiniChartDrawPlan(options: {
  width: number;
  height: number;
  type: MiniChartType;
  points: MiniChartPoint[];
  invertY?: boolean;
  referenceY?: number | null;
  selectedX?: number | null;
  pad?: Partial<MiniChartPad>;
}): MiniChartDrawPlan {
  const isRadar = options.type === "radar";
  const pad = {
    ...DEFAULT_PAD,
    ...(isRadar ? { top: 28, right: 36, bottom: 28, left: 36 } : {}),
    ...options.pad
  };
  const plot: MiniChartPlot = {
    x: pad.left,
    y: pad.top,
    width: Math.max(0, options.width - pad.left - pad.right),
    height: Math.max(0, options.height - pad.top - pad.bottom)
  };
  const points = options.points || [];
  if (isRadar) return buildRadarPlan({ plot, points });

  const lineValues = points.flatMap((point) => {
    const collected: number[] = [];
    if (point.value != null) collected.push(point.value);
    if (point.value2 != null) collected.push(point.value2);
    return collected;
  });
  if (options.referenceY != null) lineValues.push(options.referenceY);
  if (options.type === "bar") lineValues.push(0);
  const extent = numericExtent(lineValues);
  const ticks = axisTicks(extent.min, extent.max).map((value) => ({
    y: projectY(value, extent.min, extent.max, plot, options.invertY),
    label: formatAxisNum(value)
  }));
  const count = points.length;
  const barSlot = slotWidth(count, plot);
  const barW = Math.max(2, Math.min(18, barSlot * (options.type === "combo" ? 0.28 : 0.38)));
  const xInset = Math.max(barW / 2 + 2, Math.min(14, barSlot * 0.35));
  const zeroY = projectY(0, extent.min, extent.max, plot, options.invertY);
  const comboBars = options.type === "combo"
    ? numericExtent(points.map((point) => point.bar), 0.02)
    : null;
  const comboBand = plot.height * 0.4;
  const xLabels: MiniChartDrawPlan["xLabels"] = [];
  const labelEvery = count > 12 ? Math.ceil(count / 6) : 1;
  const bars: MiniChartDrawPlan["bars"] = [];
  const line: MiniChartDrawPlan["line"] = [];
  const line2: MiniChartDrawPlan["line"] = [];
  const markers: number[] = [];

  points.forEach((point, index) => {
    const cx = projectX(index, count, plot, xInset);
    if (index === 0 || index === count - 1 || index % labelEvery === 0) {
      xLabels.push({ x: cx, label: point.label || String(point.x) });
    }
    if (point.marker) markers.push(cx);
    if (options.type === "combo" && comboBars && point.bar != null) {
      const span = comboBars.max - comboBars.min || 1;
      const t = (point.bar - comboBars.min) / span;
      const h = Math.max(2, t * comboBand);
      bars.push({
        x: cx - barW / 2,
        y: plot.y + plot.height - h,
        w: barW,
        h,
        fill: point.fill || MINI_CHART_BAR_FILL
      });
    } else if (options.type === "bar" && point.value != null) {
      const by = projectY(point.value, extent.min, extent.max, plot, options.invertY);
      bars.push({
        x: cx - barW / 2,
        y: Math.min(by, zeroY),
        w: barW,
        h: Math.max(1, Math.abs(zeroY - by)),
        fill: point.fill || MINI_CHART_INK
      });
    }
    if ((options.type === "line" || options.type === "combo") && point.value != null) {
      line.push({
        x: cx,
        y: projectY(point.value, extent.min, extent.max, plot, options.invertY)
      });
    }
    if (options.type === "line" && point.value2 != null) {
      line2.push({
        x: cx,
        y: projectY(point.value2, extent.min, extent.max, plot, options.invertY)
      });
    }
  });

  const selectedIndex = options.selectedX == null
    ? -1
    : points.findIndex((point) => point.x === options.selectedX);

  return {
    plot,
    xInset,
    ticks,
    xLabels,
    bars,
    line,
    line2,
    markers,
    radarRings: [],
    radarSpokes: [],
    radarLabels: [],
    radarPolygons: [],
    selectedX: selectedIndex >= 0 ? projectX(selectedIndex, count, plot, xInset) : undefined,
    baselineY: options.type === "bar" ? zeroY : undefined,
    referenceY: options.referenceY == null
      ? undefined
      : projectY(options.referenceY, extent.min, extent.max, plot, options.invertY)
  };
}
