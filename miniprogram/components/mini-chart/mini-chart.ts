import {
  buildMiniChartDrawPlan,
  nearestPointIndex,
  type MiniChartPlot,
  type MiniChartPoint,
  type MiniChartType
} from "../../utils/mini-chart";
import { drawMiniChartPlan, type MiniChartCanvas2D, type MiniChartContext2D } from "../../utils/mini-chart-canvas";

interface MiniChartHost {
  chartCanvas?: MiniChartCanvas2D | null;
  chartCtx?: MiniChartContext2D | null;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  drawTimer?: ReturnType<typeof setTimeout>;
  lastPlot?: MiniChartPlot;
  lastInset?: number;
  sizeRetries?: number;
  scheduleDraw(): void;
  ensureCanvas(): Promise<boolean>;
  draw(): Promise<void>;
}

function host(component: WechatMiniprogram.Component.TrivialInstance): MiniChartHost {
  return component as unknown as MiniChartHost;
}

Component({
  properties: {
    type: { type: String, value: "bar" },
    points: { type: Array, value: [] },
    invertY: { type: Boolean, value: false },
    referenceY: { type: Number, value: 0 },
    hasReference: { type: Boolean, value: false },
    selectedX: { type: Number, value: 0 },
    hasSelected: { type: Boolean, value: false },
    height: { type: Number, value: 240 }
  },

  lifetimes: {
    ready() {
      host(this).scheduleDraw();
    },
    detached() {
      const state = host(this);
      if (state.drawTimer) {
        clearTimeout(state.drawTimer);
        state.drawTimer = undefined;
      }
      state.chartCanvas = null;
      state.chartCtx = null;
    }
  },

  observers: {
    "type, points, invertY, referenceY, hasReference, selectedX, hasSelected, height"() {
      host(this).scheduleDraw();
    }
  },

  methods: {
    scheduleDraw() {
      const state = host(this);
      if (state.drawTimer) return;
      state.drawTimer = setTimeout(() => {
        state.drawTimer = undefined;
        void state.draw();
      }, 16);
    },

    async ensureCanvas(): Promise<boolean> {
      const state = host(this);
      const rect = await new Promise<(WechatMiniprogram.BoundingClientRectCallbackResult & { node?: MiniChartCanvas2D }) | null>((resolve) => {
        this.createSelectorQuery().select("#mini-chart-node").fields({ node: true, size: true }).exec((result) => {
          resolve((result && result[0]) || null);
        });
      });
      const canvas = rect?.node;
      if (!canvas || !rect) return false;
      // pixelRatio 应取 wx.getWindowInfo(getSystemInfoSync 已废弃),但项目锁定的
      // miniprogram-api-typings 2.x 还没有它的声明 —— 窄断言 + 旧基础库回退。
      const windowInfo = (wx as unknown as { getWindowInfo?: () => { pixelRatio?: number } }).getWindowInfo?.();
      const dpr = Number((windowInfo || wx.getSystemInfoSync()).pixelRatio) || 1;
      const width = Number(rect.width) || 0;
      const height = Number(rect.height) || 0;
      if (width <= 0 || height <= 0) return false;
      if (
        state.chartCanvas !== canvas
        || state.cssWidth !== width
        || state.cssHeight !== height
        || state.dpr !== dpr
      ) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      state.chartCanvas = canvas;
      state.chartCtx = ctx;
      state.cssWidth = width;
      state.cssHeight = height;
      state.dpr = dpr;
      return true;
    },

    async draw() {
      const state = host(this);
      if (!(await state.ensureCanvas()) || !state.chartCtx) {
        state.sizeRetries = (state.sizeRetries || 0) + 1;
        if (state.sizeRetries <= 8 && !state.drawTimer) {
          state.drawTimer = setTimeout(() => {
            state.drawTimer = undefined;
            void state.draw();
          }, 50);
        }
        return;
      }
      state.sizeRetries = 0;
      const plan = buildMiniChartDrawPlan({
        width: state.cssWidth,
        height: state.cssHeight,
        type: (this.properties.type || "bar") as MiniChartType,
        points: (this.properties.points || []) as MiniChartPoint[],
        invertY: Boolean(this.properties.invertY),
        referenceY: this.properties.hasReference ? Number(this.properties.referenceY) : null,
        selectedX: this.properties.hasSelected ? Number(this.properties.selectedX) : null
      });
      state.lastPlot = plan.plot;
      state.lastInset = plan.xInset;
      drawMiniChartPlan(state.chartCtx, plan, state.cssWidth, state.cssHeight, state.dpr);
    },

    onTap(event: WechatMiniprogram.TouchEvent) {
      if (this.properties.type === "radar") return;
      const state = host(this);
      const points = (this.properties.points || []) as MiniChartPoint[];
      if (!points.length || !state.lastPlot) return;
      this.createSelectorQuery().select(".mini-chart-hit").boundingClientRect((rect) => {
        if (!rect) return;
        const tap = event.changedTouches?.[0] || event.touches?.[0];
        const clientX = tap ? Number(tap.clientX) : Number(event.detail?.x);
        if (!Number.isFinite(clientX)) return;
        const index = nearestPointIndex(
          clientX - rect.left,
          points.length,
          state.lastPlot as MiniChartPlot,
          state.lastInset || 0
        );
        if (index < 0) return;
        const point = points[index];
        const same = this.properties.hasSelected && point.x === Number(this.properties.selectedX);
        this.triggerEvent("select", same ? { x: null, point: null } : { x: point.x, point });
      }).exec();
    }
  }
});

