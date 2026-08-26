import {
  squadPitchBackgroundSrc,
  buildBenchViews,
  buildPitchRows,
  formatSquadPitchHeaderView,
  normalizeSquadPitchLists,
  type SquadPitchHeader,
  type SquadPitchHeaderView,
  type SquadPitchLocale,
  type SquadPitchPlayer
} from "../../utils/squad-pitch";
import {
  exportSquadPitchShareImage,
  resetShareImageCache,
  shareCanvasSize,
  shareExportPixelRatio,
  shareUsesPortraitLayout
} from "../../utils/squad-pitch-canvas";
import { windowPixelRatio } from "../../utils/system-info";

interface SquadPitchData {
  pitchBg: string;
  hasBench: boolean;
  benchTitle: string;
  rows: ReturnType<typeof buildPitchRows>;
  bench: ReturnType<typeof buildBenchViews>;
  headerView: SquadPitchHeaderView;
  shareWidth: number;
  shareHeight: number;
}

function emptyHeaderView(): SquadPitchHeaderView {
  return {
    eyebrow: "",
    teamName: "",
    managerName: "",
    gwLabel: "",
    gwPoints: "",
    chipLabel: "",
    chip: ""
  };
}

Component({
  properties: {
    players: {
      type: Array,
      value: [] as SquadPitchPlayer[]
    },
    benchPlayers: {
      type: Array,
      value: [] as SquadPitchPlayer[]
    },
    header: {
      type: Object,
      value: {} as SquadPitchHeader
    },
    benchBoost: {
      type: Boolean,
      value: false
    },
    locale: {
      type: String,
      value: "zh-CN"
    }
  },

  data: {
    pitchBg: squadPitchBackgroundSrc(),
    hasBench: false,
    benchTitle: "替补",
    rows: [],
    bench: [],
    headerView: emptyHeaderView(),
    shareWidth: 750,
    shareHeight: 938
  } as SquadPitchData,

  observers: {
    "players, benchPlayers, header, benchBoost, locale": function () {
      this.scheduleRebuild();
    }
  },

  lifetimes: {
    ready() {
      const host = this as WechatMiniprogram.Component.TrivialInstance & { viewReady?: boolean };
      host.viewReady = true;
      this.scheduleRebuild();
    },
    detached() {
      const host = this as WechatMiniprogram.Component.TrivialInstance & { viewReady?: boolean };
      host.viewReady = false;
      resetShareImageCache();
    }
  },

  methods: {
    scheduleRebuild() {
      const host = this as WechatMiniprogram.Component.TrivialInstance & {
        viewReady?: boolean;
        rebuildPending?: boolean;
      };
      if (host.rebuildPending) return;
      host.rebuildPending = true;
      wx.nextTick(() => {
        host.rebuildPending = false;
        if (host.viewReady) host.rebuildView();
      });
    },

    rebuildView() {
      const locale = (this.properties.locale === "en" ? "en" : "zh-CN") as SquadPitchLocale;
      const players = (this.properties.players || []) as SquadPitchPlayer[];
      const benchPlayers = (this.properties.benchPlayers || []) as SquadPitchPlayer[];
      const lists = normalizeSquadPitchLists(players, benchPlayers);
      const header = (this.properties.header || {}) as SquadPitchHeader;
      const hasBench = lists.benchPlayers.length > 0;
      const size = shareCanvasSize(shareUsesPortraitLayout(
        lists.players,
        lists.benchPlayers
      ));
      this.setData({
        pitchBg: squadPitchBackgroundSrc(),
        hasBench,
        benchTitle: locale === "en" ? "Substitutes" : "替补",
        rows: buildPitchRows(lists.players, hasBench),
        bench: buildBenchViews(lists.benchPlayers, locale),
        headerView: formatSquadPitchHeaderView(header, locale),
        shareWidth: size.width,
        shareHeight: size.height
      });
    },

    onPlayerTap(event: WechatMiniprogram.TouchEvent) {
      const playerId = String(event.currentTarget.dataset.id || "");
      if (!playerId) return;
      this.triggerEvent("playertap", { playerId });
    },

    exportShareImage(): Promise<string> {
      return this.exportShareImageForLayout(false);
    },

    exportPortraitShareImage(): Promise<string> {
      return this.exportShareImageForLayout(true);
    },

    exportShareImageForLayout(forcePortrait = false): Promise<string> {
      const locale = (this.properties.locale === "en" ? "en" : "zh-CN") as SquadPitchLocale;
      const lists = normalizeSquadPitchLists(
        (this.properties.players || []) as SquadPitchPlayer[],
        (this.properties.benchPlayers || []) as SquadPitchPlayer[]
      );
      const input = {
        players: lists.players,
        benchPlayers: lists.benchPlayers,
        header: (this.properties.header || {}) as SquadPitchHeader,
        benchBoost: Boolean(this.properties.benchBoost),
        forcePortrait,
        locale
      };
      const offscreen = exportViaOffscreenCanvas(input);
      if (offscreen) return offscreen;
      return queryShareCanvas(this).then(({ canvas, ctx, pixelRatio }) =>
        exportSquadPitchShareImage({
          canvas,
          ctx: ctx as never,
          pixelRatio,
          input,
          toTempFilePath: (node) => canvasToTempFile(this, node)
        })
      );
    }
  }
});

function exportViaOffscreenCanvas(input: {
  players: SquadPitchPlayer[];
  benchPlayers: SquadPitchPlayer[];
  header: SquadPitchHeader;
  benchBoost: boolean;
  forcePortrait: boolean;
  locale: SquadPitchLocale;
}): Promise<string> | null {
  const createOffscreen = (wx as WechatMiniprogram.Wx & {
    createOffscreenCanvas?: (options: { type: string; width: number; height: number }) => WechatMiniprogram.OffscreenCanvas;
  }).createOffscreenCanvas;
  if (typeof createOffscreen !== "function") return null;
  const pixelRatio = shareExportPixelRatio(windowPixelRatio());
  const size = shareCanvasSize(shareUsesPortraitLayout(
    input.players,
    input.benchPlayers,
    input.forcePortrait
  ));
  try {
    const canvas = createOffscreen({
      type: "2d",
      width: Math.round(size.width * pixelRatio),
      height: Math.round(size.height * pixelRatio)
    });
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return exportSquadPitchShareImage({
      canvas: canvas as unknown as WechatMiniprogram.Canvas,
      ctx: ctx as never,
      pixelRatio,
      input,
      toTempFilePath: (node) => new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: node as WechatMiniprogram.Canvas,
          destWidth: node.width,
          destHeight: node.height,
          fileType: "png",
          quality: 1,
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        });
      })
    });
  } catch {
    return null;
  }
}

function queryShareCanvas(component: WechatMiniprogram.Component.TrivialInstance): Promise<{
  canvas: WechatMiniprogram.Canvas;
  ctx: WechatMiniprogram.CanvasContext;
  pixelRatio: number;
}> {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(component)
      .select("#squad-pitch-share-canvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res?.[0]?.node as WechatMiniprogram.Canvas | undefined;
        if (!canvas) {
          reject(new Error("share canvas missing"));
          return;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("share canvas context missing"));
          return;
        }
        resolve({
          canvas,
          ctx: ctx as unknown as WechatMiniprogram.CanvasContext,
          pixelRatio: shareExportPixelRatio(windowPixelRatio())
        });
      });
  });
}

function canvasToTempFile(
  component: WechatMiniprogram.Component.TrivialInstance,
  canvas: { width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas: canvas as WechatMiniprogram.Canvas,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: "png",
      quality: 1,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => reject(err)
    }, component);
  });
}
