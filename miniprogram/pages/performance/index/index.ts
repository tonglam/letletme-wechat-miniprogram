import { getPerf, clearPerf } from "../../../utils/perf";
import type { StoredPerf, ApiRecord } from "../../../utils/perf";

type Rating = "good" | "avg" | "poor" | "none";

interface MetricRow {
  key: string;
  label: string;
  displayValue: string;
  rating: Rating;
  ratingLabel: string;
  barWidth: number;
}

interface ApiGroup {
  name: string;
  count: number;
  avgMs: number;
  failCount: number;
  rating: Rating;
}

interface PageData {
  score: number;
  scoreGrade: Rating;
  scoreLabel: string;
  metrics: MetricRow[];
  apiGroups: ApiGroup[];
  totalApiCalls: number;
  networkType: string;
  system: string;
  updatedAt: string;
  hasData: boolean;
}

interface WxPerfEntry {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
}

interface WxPerformance {
  getEntriesByType(type: string): WxPerfEntry[];
}

Page({
  data: {
    score: 0,
    scoreGrade: "none",
    scoreLabel: "",
    metrics: [],
    apiGroups: [],
    totalApiCalls: 0,
    networkType: "-",
    system: "-",
    updatedAt: "-",
    hasData: false
  } as PageData,

  onLoad() {
    this.loadMetrics();
    this.loadEnv();
  },

  onPullDownRefresh() {
    this.loadMetrics();
    this.loadEnv();
    wx.stopPullDownRefresh();
  },

  loadMetrics() {
    const stored = getPerf();

    let wxLaunchMs: number | undefined;
    let wxFirstRenderMs: number | undefined;
    try {
      const perf = (wx as unknown as { getPerformance?(): WxPerformance }).getPerformance?.();
      if (perf) {
        const navEntries = perf.getEntriesByType("navigation");
        const launchEntry = navEntries.find(e => e.name === "appLaunch");
        if (launchEntry) wxLaunchMs = Math.round(launchEntry.duration);

        const renderEntries = perf.getEntriesByType("render");
        const renderEntry = renderEntries.find(e =>
          e.name === "firstRender" || e.name === "firstPaint"
        );
        if (renderEntry) wxFirstRenderMs = Math.round(renderEntry.duration);
      }
    } catch { /* getPerformance not supported in this runtime */ }

    const launchMs = wxLaunchMs ?? stored.launchDuration;
    const metrics = buildMetrics(stored, launchMs, wxFirstRenderMs);
    const apiGroups = buildApiGroups(stored.apiRecords);
    const hasData = stored.apiRecords.length > 0 || launchMs !== undefined;
    const score = hasData ? calcScore(metrics) : 0;
    const scoreGrade: Rating = !hasData ? "none" : score >= 80 ? "good" : score >= 60 ? "avg" : "poor";
    const scoreLabel = !hasData ? "使用应用后显示" : score >= 80 ? "优秀" : score >= 60 ? "良好" : "需优化";

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const updatedAt = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    this.setData({
      score,
      scoreGrade,
      scoreLabel,
      metrics,
      apiGroups,
      totalApiCalls: stored.apiRecords.length,
      updatedAt,
      hasData
    });
  },

  loadEnv() {
    wx.getNetworkType({
      success: (res) => {
        this.setData({ networkType: formatNetworkType(res.networkType) });
      }
    });
    wx.getSystemInfo({
      success: (info) => {
        this.setData({ system: info.system || "-" });
      }
    });
  },

  onRefresh() {
    this.loadMetrics();
    this.loadEnv();
  },

  onClear() {
    wx.showModal({
      title: "清除数据",
      content: "确认清除所有性能记录？",
      success: (res) => {
        if (res.confirm) {
          clearPerf();
          this.loadMetrics();
        }
      }
    });
  }
});

function rateMs(ms: number, goodThreshold: number, avgThreshold: number): Rating {
  if (ms < goodThreshold) return "good";
  if (ms < avgThreshold) return "avg";
  return "poor";
}

const RATING_LABELS: Record<Rating, string> = {
  good: "优",
  avg: "中",
  poor: "差",
  none: "-"
};

const RATING_WIDTHS: Record<Rating, number> = {
  good: 92,
  avg: 58,
  poor: 22,
  none: 50
};

const RATING_SCORES: Record<Rating, number> = {
  good: 95,
  avg: 65,
  poor: 25,
  none: 70
};

function buildMetrics(
  stored: StoredPerf,
  launchMs: number | undefined,
  firstRenderMs: number | undefined
): MetricRow[] {
  const rows: MetricRow[] = [];

  if (launchMs !== undefined) {
    const r = rateMs(launchMs, 500, 1500);
    rows.push({
      key: "launch",
      label: "启动耗时",
      displayValue: `${launchMs}ms`,
      rating: r,
      ratingLabel: RATING_LABELS[r],
      barWidth: RATING_WIDTHS[r]
    });
  }

  if (firstRenderMs !== undefined) {
    const r = rateMs(firstRenderMs, 300, 600);
    rows.push({
      key: "firstRender",
      label: "首次渲染",
      displayValue: `${firstRenderMs}ms`,
      rating: r,
      ratingLabel: RATING_LABELS[r],
      barWidth: RATING_WIDTHS[r]
    });
  }

  const records = stored.apiRecords;
  if (records.length > 0) {
    const avgMs = Math.round(records.reduce((s, r) => s + r.duration, 0) / records.length);
    const r = rateMs(avgMs, 400, 1000);
    rows.push({
      key: "avgApi",
      label: "平均 API",
      displayValue: `${avgMs}ms`,
      rating: r,
      ratingLabel: RATING_LABELS[r],
      barWidth: RATING_WIDTHS[r]
    });

    const okCount = records.filter(rec => rec.ok).length;
    const successPct = Math.round((okCount / records.length) * 100);
    const sr: Rating = successPct >= 98 ? "good" : successPct >= 90 ? "avg" : "poor";
    rows.push({
      key: "successRate",
      label: "成功率",
      displayValue: `${successPct}%`,
      rating: sr,
      ratingLabel: RATING_LABELS[sr],
      barWidth: successPct
    });
  }

  return rows;
}

function buildApiGroups(records: ApiRecord[]): ApiGroup[] {
  const map: Record<string, { total: number; count: number; fails: number }> = {};
  for (const rec of records) {
    if (!map[rec.name]) {
      map[rec.name] = { total: 0, count: 0, fails: 0 };
    }
    map[rec.name].total += rec.duration;
    map[rec.name].count++;
    if (!rec.ok) map[rec.name].fails++;
  }

  return Object.entries(map)
    .map(([name, stats]) => {
      const avgMs = Math.round(stats.total / stats.count);
      return {
        name,
        count: stats.count,
        avgMs,
        failCount: stats.fails,
        rating: rateMs(avgMs, 400, 1000)
      };
    })
    .sort((a, b) => b.avgMs - a.avgMs);
}

function calcScore(metrics: MetricRow[]): number {
  if (metrics.length === 0) return 0;
  const total = metrics.reduce((sum, m) => sum + RATING_SCORES[m.rating], 0);
  return Math.round(total / metrics.length);
}

function formatNetworkType(type: string): string {
  const MAP: Record<string, string> = {
    wifi: "WiFi",
    "2g": "2G",
    "3g": "3G",
    "4g": "4G",
    "5g": "5G",
    none: "无网络",
    unknown: "未知"
  };
  return MAP[type] || type;
}
