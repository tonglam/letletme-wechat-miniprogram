import { PerformancePage } from "../../../utils/performance-page";
import { getPerf, clearPerf } from "../../../utils/perf";
import type { StoredPerf, ApiRecord } from "../../../utils/perf";
import {
  finiteDuration,
  firstContentVisibleDuration,
  formatDuration,
  nearestRankDuration
} from "../../../utils/performance-summary";

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
  networkApiCalls: number;
  cacheHitRate: number;
  networkP50: string;
  networkP95: string;
  failedOperations: string;
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

PerformancePage({
  data: {
    score: 0,
    scoreGrade: "none",
    scoreLabel: "",
    metrics: [],
    apiGroups: [],
    totalApiCalls: 0,
    networkApiCalls: 0,
    cacheHitRate: 0,
    networkP50: "--",
    networkP95: "--",
    failedOperations: "",
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
        const launchEntry = perf.getEntriesByType("navigation").find((entry) => entry.name === "appLaunch");
        if (launchEntry) wxLaunchMs = finiteDuration(launchEntry.duration) ?? undefined;
        const renderEntry = perf.getEntriesByType("render").find((entry) =>
          entry.name === "firstRender" || entry.name === "firstPaint"
        );
        if (renderEntry) wxFirstRenderMs = finiteDuration(renderEntry.duration) ?? undefined;
      }
    } catch {}

    const records = stored.apiRecords;
    const networkRecords = records.filter(isNetworkRecord);
    const cacheHits = records.filter((record) =>
      record.source === "memory"
      || record.source === "storage"
      || record.source === "in-flight"
    ).length;
    const launchMs = wxLaunchMs ?? finiteDuration(stored.launchDuration) ?? undefined;
    const trackedFirstContentMs = firstContentVisibleDuration(
      stored.pagePerformance ?? []
    );
    const firstContentMs = trackedFirstContentMs ?? wxFirstRenderMs;
    const firstContentLabel = trackedFirstContentMs === null
      ? "微信首次渲染"
      : "首屏主内容";
    const metrics = buildMetrics(
      stored,
      launchMs,
      firstContentMs,
      firstContentLabel
    );
    const apiGroups = buildApiGroups(records);
    const hasData = records.length > 0
      || launchMs !== undefined
      || firstContentMs !== undefined;
    const score = hasData ? calcScore(metrics) : 0;
    const scoreGrade: Rating = !hasData ? "none" : score >= 80 ? "good" : score >= 60 ? "avg" : "poor";
    const scoreLabel = !hasData ? "使用应用后显示" : score >= 80 ? "优秀" : score >= 60 ? "良好" : "需优化";
    const failures = Array.from(new Set(
      records
        .filter((record) => !record.ok)
        .map((record) => record.operationName || record.name)
    ));
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");

    this.setData({
      score,
      scoreGrade,
      scoreLabel,
      metrics,
      apiGroups,
      totalApiCalls: records.length,
      networkApiCalls: networkRecords.length,
      cacheHitRate: records.length ? Math.round((cacheHits / records.length) * 100) : 0,
      networkP50: formatDuration(nearestRankDuration(
        networkRecords.map((record) => record.duration),
        0.5
      )),
      networkP95: formatDuration(nearestRankDuration(
        networkRecords.map((record) => record.duration),
        0.95,
        10
      )),
      failedOperations: failures.join("、"),
      updatedAt: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      hasData
    });
  },

  loadEnv() {
    wx.getNetworkType({
      success: (res) => this.setData({ networkType: formatNetworkType(res.networkType) })
    });
    wx.getSystemInfo({
      success: (info) => this.setData({ system: info.system || "-" })
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

function isNetworkRecord(record: ApiRecord): boolean {
  return record.networkAttempted === true || (!record.source && record.networkAttempted !== false) || record.source === "network";
}

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
  firstRenderMs: number | undefined,
  firstRenderLabel: string
): MetricRow[] {
  const rows: MetricRow[] = [];

  if (launchMs !== undefined) {
    const rating = rateMs(launchMs, 500, 1500);
    rows.push({
      key: "launch",
      label: "启动耗时",
      displayValue: `${launchMs}ms`,
      rating,
      ratingLabel: RATING_LABELS[rating],
      barWidth: RATING_WIDTHS[rating]
    });
  }

  if (firstRenderMs !== undefined) {
    const rating = rateMs(firstRenderMs, 300, 600);
    rows.push({
      key: "firstRender",
      label: firstRenderLabel,
      displayValue: `${firstRenderMs}ms`,
      rating,
      ratingLabel: RATING_LABELS[rating],
      barWidth: RATING_WIDTHS[rating]
    });
  } else {
    rows.push({
      key: "firstRender",
      label: "首屏主内容",
      displayValue: "--",
      rating: "none",
      ratingLabel: RATING_LABELS.none,
      barWidth: RATING_WIDTHS.none
    });
  }

  const networkRecords = stored.apiRecords.filter(isNetworkRecord);
  if (networkRecords.length >= 10) {
    const p95 = nearestRankDuration(
      networkRecords.map((record) => record.duration),
      0.95,
      10
    );
    if (p95 !== null) {
      const rating = rateMs(p95, 500, 1500);
      rows.push({
        key: "networkP95",
        label: "网络 API p95",
        displayValue: `${p95}ms`,
        rating,
        ratingLabel: RATING_LABELS[rating],
        barWidth: RATING_WIDTHS[rating]
      });
    }
  }

  if (stored.apiRecords.length > 0) {
    const okCount = stored.apiRecords.filter((record) => record.ok).length;
    const successPct = Math.round((okCount / stored.apiRecords.length) * 100);
    const rating: Rating = successPct >= 98 ? "good" : successPct >= 90 ? "avg" : "poor";
    rows.push({
      key: "successRate",
      label: "逻辑调用成功率",
      displayValue: `${successPct}%`,
      rating,
      ratingLabel: RATING_LABELS[rating],
      barWidth: successPct
    });
  }

  return rows;
}

function buildApiGroups(records: ApiRecord[]): ApiGroup[] {
  const groups: Record<string, { total: number; count: number; fails: number }> = {};
  records.forEach((record) => {
    const name = record.operationName || record.name;
    if (!groups[name]) groups[name] = { total: 0, count: 0, fails: 0 };
    groups[name].total += record.duration;
    groups[name].count += 1;
    if (!record.ok) groups[name].fails += 1;
  });

  return Object.entries(groups)
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
    .sort((left, right) => right.avgMs - left.avgMs);
}

function calcScore(metrics: MetricRow[]): number {
  const ratedMetrics = metrics.filter((metric) => metric.rating !== "none");
  if (ratedMetrics.length === 0) return 0;
  return Math.round(
    ratedMetrics.reduce(
      (sum, metric) => sum + RATING_SCORES[metric.rating],
      0
    ) / ratedMetrics.length
  );
}

function formatNetworkType(type: string): string {
  const labels: Record<string, string> = {
    wifi: "WiFi",
    "2g": "2G",
    "3g": "3G",
    "4g": "4G",
    "5g": "5G",
    none: "无网络",
    unknown: "未知"
  };
  return labels[type] || type;
}
