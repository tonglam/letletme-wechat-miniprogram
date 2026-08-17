export const performanceMockData = {
  score: 82,
  scoreGrade: "good" as const,
  scoreLabel: "良好",
  metrics: [
    { key: "fcp", label: "首次内容绘制", displayValue: "1.2s", rating: "good" as const, ratingLabel: "良好", barWidth: 80 },
    { key: "lcp", label: "最大内容绘制", displayValue: "2.1s", rating: "good" as const, ratingLabel: "良好", barWidth: 70 },
    { key: "tbt", label: "总阻塞时间", displayValue: "150ms", rating: "good" as const, ratingLabel: "良好", barWidth: 85 },
    { key: "cls", label: "累积布局偏移", displayValue: "0.05", rating: "good" as const, ratingLabel: "良好", barWidth: 90 },
    { key: "tti", label: "可交互时间", displayValue: "2.8s", rating: "avg" as const, ratingLabel: "一般", barWidth: 60 }
  ],
  apiGroups: [
    { name: "graphql.service", count: 15, avgMs: 230, failCount: 0, rating: "good" as const },
    { name: "fixture.service", count: 8, avgMs: 180, failCount: 0, rating: "good" as const },
    { name: "live.service", count: 12, avgMs: 350, failCount: 1, rating: "avg" as const },
    { name: "entry.service", count: 5, avgMs: 150, failCount: 0, rating: "good" as const },
    { name: "player.service", count: 6, avgMs: 280, failCount: 0, rating: "good" as const }
  ],
  totalApiCalls: 46,
  networkApiCalls: 38,
  cacheHitRate: 17.4,
  networkP50: "180ms",
  networkP95: "520ms",
  failedOperations: "1 / 46",
  networkType: "WiFi",
  system: "iOS 18.0 · iPhone 15",
  updatedAt: "21:45",
  hasData: true
};
