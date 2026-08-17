import {
  MINI_CHART_INK,
  MINI_CHART_LINE,
  MINI_CHART_MUTED,
  MINI_CHART_PLUM,
  type MiniChartDrawPlan
} from "./mini-chart";

export interface MiniChartCanvas2D {
  width: number;
  height: number;
  getContext(type: "2d"): MiniChartContext2D | null;
}

export interface MiniChartContext2D {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  save(): void;
  restore(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  font: string;
  textAlign: "left" | "right" | "center" | "start" | "end";
  textBaseline: "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
  lineJoin: "round" | "bevel" | "miter";
  lineCap: "butt" | "round" | "square";
  globalAlpha: number;
}

export function drawMiniChartPlan(
  ctx: MiniChartContext2D,
  plan: MiniChartDrawPlan,
  cssWidth: number,
  cssHeight: number,
  dpr: number
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const isRadar = plan.radarRings.length > 0;

  ctx.strokeStyle = MINI_CHART_LINE;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  if (!isRadar) plan.ticks.forEach((tick) => {
    ctx.beginPath();
    ctx.moveTo(plan.plot.x, tick.y);
    ctx.lineTo(plan.plot.x + plan.plot.width, tick.y);
    ctx.stroke();
  });

  if (plan.referenceY != null) {
    ctx.strokeStyle = MINI_CHART_MUTED;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(plan.plot.x, plan.referenceY);
    ctx.lineTo(plan.plot.x + plan.plot.width, plan.referenceY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  plan.markers.forEach((x) => {
    ctx.strokeStyle = MINI_CHART_PLUM;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, plan.plot.y);
    ctx.lineTo(x, plan.plot.y + plan.plot.height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(plan.plot.x, plan.plot.y, plan.plot.width, plan.plot.height);
  ctx.clip();
  plan.bars.forEach((bar) => {
    ctx.fillStyle = bar.fill;
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  });
  ctx.restore();

  plan.radarRings.forEach((ring, index) => {
    if (!ring.length) return;
    ctx.strokeStyle = MINI_CHART_LINE;
    ctx.lineWidth = index === plan.radarRings.length - 1 ? 1.4 : 1;
    ctx.beginPath();
    ring.forEach((point, pointIndex) => {
      if (pointIndex === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
  });
  plan.radarSpokes.forEach((spoke) => {
    ctx.strokeStyle = MINI_CHART_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(spoke.x1, spoke.y1);
    ctx.lineTo(spoke.x2, spoke.y2);
    ctx.stroke();
  });
  plan.radarPolygons.forEach((polygon) => {
    if (!polygon.points.length) return;
    ctx.fillStyle = polygon.fill;
    ctx.strokeStyle = polygon.stroke;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    polygon.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  plan.radarLabels.forEach((label) => {
    ctx.fillStyle = MINI_CHART_MUTED;
    ctx.font = "10px sans-serif";
    ctx.textAlign = label.align;
    ctx.textBaseline = "middle";
    ctx.fillText(label.text, label.x, label.y);
  });

  if (plan.line2.length > 0) {
    ctx.strokeStyle = MINI_CHART_MUTED;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    plan.line2.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (plan.line.length > 0) {
    ctx.strokeStyle = MINI_CHART_INK;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    plan.line.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    plan.line.forEach((point) => {
      ctx.fillStyle = MINI_CHART_INK;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (plan.selectedX != null) {
    ctx.strokeStyle = MINI_CHART_PLUM;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(plan.selectedX, plan.plot.y);
    ctx.lineTo(plan.selectedX, plan.plot.y + plan.plot.height);
    ctx.stroke();
  }

  if (!isRadar) {
    ctx.fillStyle = MINI_CHART_MUTED;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    plan.ticks.forEach((tick) => {
      ctx.fillText(tick.label, plan.plot.x - 6, tick.y);
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    plan.xLabels.forEach((label) => {
      ctx.fillText(label.label, label.x, plan.plot.y + plan.plot.height + 6);
    });
  }
}
