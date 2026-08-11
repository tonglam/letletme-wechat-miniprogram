# 小程序 UX 与性能严格验收报告

日期：2026-08-11  
范围：当前 `codex/data-fetch-cache-remediation` 实现，本地 WeChat DevTools 全页面验收  
链路：`WeChat DevTools -> http://localhost:3000/api/graphql -> http://127.0.0.1:4000/graphql`

## 1. 结论

**当前达到创建 PR 的功能 hard gate，仍保留两项明确的性能债。**

契约、成功率、网络调用数、缓存命中率、强刷语义和重复生命周期调用均已通过修复后的完整复测：

1. `Entry profile` 和 `Summary tournament` 下拉刷新已分别产生真实 `GetEntry`、`EntryTournaments` 网络请求。
2. Home 暖启动从 11 次逻辑调用降为 6 个唯一 operation；页面再次进入时只执行 5 个页面 operation。
3. 25 页面暖态复测为 0 错误、14 次网络 operation、67.4% 命中率。

仍需后续优化：

1. 冷启动 `appLaunch -> FCP` 三个有效样本为 `1.305s / 1.347s / 2.951s`，波动集中在 DevTools runtime 进入 route 之前。
2. 刷新“稳定确认”p95 为 `2.789s`，其中包含业务完成后额外 550ms 静默窗口；直接 loading 采样中 Home 为 `1.927s`，My FPL team 最后一条 API 为 `1.696s`。

干净复测结果没有契约错误、鉴权错误、GraphQL error、timeout 或 429。此前连续遍历出现的 5 个失败已由 Web 日志确认全部是本地限流 `HTTP 429`，该污染轮不进入最终指标。

## 2. 验收环境与方法

- WeChat DevTools Stable `v2.01.2510290`。
- develop endpoint override 为 `http://localhost:3000/api/graphql`。
- GraphQL main 在 `127.0.0.1:4000/graphql`，Web main 在 `localhost:3000`。
- 所有小程序请求只经过 `3000/api/graphql`，没有直连 4000。
- 使用 `wx.getPerformance()` 原生 timeline，不使用 `miniprogram-automator.reLaunch()` 内置的固定 3 秒等待。
- 首屏：`route -> firstContentfulPaint`，重定向页同时参考 LCP。
- 完全加载：页面 loading/refreshing 状态结束、最后一条 API 记录完成，并保持 550ms 无新活动。
- 刷新：调用页面真实 `onPullDownRefresh`，记录到页面与 API 稳定。
- 冷启动：清除 `gql:*` L2 cache 后，通过 DevTools 菜单执行真实“编译”。
- 暖启动：保留 L2 cache，通过 DevTools 菜单执行真实“编译”。
- 刷新测试按 5 页分组，组间等待 65 秒，避免自动遍历触发本地限流。

严格门槛：

| 指标 | 门槛 | 实测 | 结果 |
|---|---:|---:|---|
| 冷启动 FCP p95 | <= 2.0s | 2.951s | 未通过 |
| 冷启动完整 p95 | <= 4.0s | 5.049s | 未通过 |
| 暖启动 FCP p95 | <= 1.5s | 1.461s | 通过，接近上限 |
| 暖启动完整 p95 | <= 2.5s | 2.241s | 通过 |
| 暖态页面 FCP p95 | <= 500ms | 401ms | 通过 |
| 暖态页面稳定 p95 | <= 2.5s | 2.484s | 通过 |
| 下拉刷新稳定确认 p95 | <= 2.0s | 2.789s | 未通过，含额外 550ms 静默确认 |
| 干净遍历失败率 | 0% | 0% | 通过 |
| 暖态网络 operation | <= 18 | 11 | 通过 |
| 暖态逻辑缓存命中率 | >= 60% | 77.1% | 通过 |
| 本地 cache hit p95 | < 50ms | 0-1ms | 通过 |

## 3. 启动性能

### 3.1 冷启动，缓存清空

| 样本 | appLaunch -> route | route -> FCP | appLaunch -> FCP | appLaunch -> 数据完整 |
|---|---:|---:|---:|---:|
| Cold A | 1.132s | 173ms | 1.305s | 约 3.473s |
| Cold B | 1.164s | 183ms | 1.347s | 3.451s |
| Cold C | 2.786s | 165ms | 2.951s | 5.049s |

关键结论：

- `route -> FCP` 始终为 `165-183ms`，页面渲染本身稳定。
- 波动集中在 `appLaunch -> route`，即页面路由前的启动阶段，而不是 Home WXML 首屏渲染。
- 冷启动 Home 实际产生 6 个网络 operation：`CurrentEventInfo`、`EventOverallResult`、`EventFixtures`、`GetEntry`、`GetPlayerValues`、`MiniProgramNotice`。
- 一个伴随 automator 重连挂起的样本为 FCP `3.276s`、数据 `5.614s`。该样本存在测量扰动，已排除，但作为 DevTools 自动化稳定性风险保留记录。

### 3.2 暖启动，缓存保留

| 样本 | appLaunch -> FCP | appLaunch -> 数据完整 | 网络请求 |
|---|---:|---:|---:|
| Warm A | 1.461s | 2.241s | 0 |
| Warm B | 1.442s | 2.223s | 0 |
| Warm C | 1.273s | 1.956s | 0 |

暖启动数据全部来自 storage/memory。缓存有效，但 Home 仍记录 11 次逻辑调用，包含多组重复 operation；这是 CPU、storage 和生命周期噪声，不是网络问题。

## 4. 25 页面暖态遍历

总览：

- 页面：25/25。
- FCP：p50 `347ms`，p95 `398ms`。
- 完全稳定：p50 `1.432s`，p95 `2.484s`。
- 逻辑调用：43。
- 真实网络：14。
- memory/storage/in-flight：29，逻辑命中率 `67.4%`。
- 页面错误：0。
- 超时：0。
- 网络失败：0。

最慢页面：

| 页面 | FCP/LCP | 完全稳定 | 主要原因 |
|---|---:|---:|---|
| Live entry | FCP 365ms | 2.610s | `CalcLivePointsByEntry 1.603s`、transfer history 1.124s |
| Summary entry redirect -> My FPL team | LCP 520ms | 2.484s | 4 个 session operation |
| Summary gameweek | FCP 347ms | 1.795s | 单次聚合 operation 797ms |
| My FPL overview | FCP 362ms | 1.791s | event result 646ms、leagues 781ms |
| Home | FCP 398ms | 1.477s | 5 个唯一页面 operation，全部命中缓存 |

一次分组等待后的 Players 初次进入出现 `2.413s` FCP，编译后的首次进入也出现过 `2.310s`。针对未缓存关键词 `Haaland` 的独立复核为 first paint `306ms`、FCP `392ms`，同时网络查询为 `1.158s`，证明页面能先渲染再等数据。该 2.3 秒现象归为 DevTools 空闲/编译后的单点抖动，不归因于 Players 阻塞渲染，但应继续在真机观察。

## 5. 下拉刷新

16 个启用下拉刷新的页面全部完成，无错误、无超时。30 个网络 operation 全部成功。

| 页面 | 刷新完成 | 网络 operation | 结论 |
|---|---:|---:|---|
| Home | 2.789s | 5 | 稳定确认；直接 loading 为 1.927s |
| My FPL overview | 2.265s | 3 | 分区渐进更新，主 loading 先结束 |
| My FPL team | 2.231s | 5 | 最后一条 API 为 1.696s |
| Fixtures | 1.928s | 3 | 可接受，接近上限 |
| Players | 1.693s | 1 | 可接受 |
| Summary gameweek | 1.492s | 1 | 可接受 |
| Live entry | 1.473s | 2 | 可接受 |
| Competitions | 1.328s | 2 | 可接受 |
| My FPL leagues | 1.276s | 2 | 可接受 |
| Performance | 1.255s | 0 | 本地汇总页，无网络符合预期 |
| Summary tournament | 1.141s | 1 | 已修复，真实强刷 |
| Live tournament | 1.014s | 1 | 通过 |
| Entry profile | 1.007s | 1 | 已修复，真实强刷 |
| Selections | 1.001s | 1 | 通过 |
| Live match | 980ms | 1 | 通过 |
| Price | 894ms | 1 | 通过 |

刷新网络 duration 分布：

- p50：`504ms`。
- p95：`1.107s`。
- max：`1.306s`，`GetPlayerValues`。
- 其他慢 operation：`PlayersForPicker 1.107s`、`EventFixtures 1.035s`、`FixtureWindow 1.006s`。

Web 日志显示代理层通常只占 `2-24ms`，主要时间在 GraphQL `application-code`。因此继续压缩 proxy 不是当前刷新性能的首要方向。

## 6. 空页面诊断

以下页面没有业务行，但不是加载失败：

| 页面 | 状态 | 原因 |
|---|---|---|
| Account link | 预期 | 静态绑定入口，不应有数据列表 |
| Data index | 预期 | 设计上重定向 Explore |
| Entry search | 预期 | 用户输入 entry 前为空 |
| Player detail | 预期 | 验收路由未提供 player code，显示 empty state |
| Live match | 预期 | 当前为季前，所选 bucket 没有比赛 |
| Live entry | 预期 | summary tiles 有数据；季前没有 starters/bench/transfers |
| Live tournament | 预期 | 当前 entry 没有关注 tournament |
| Price | 预期但需产品确认 | 当前价格 publication 无 rows，仅保留筛选 UI |
| Selections | 预期 | 没有 tournament selection |
| Summary tournament | 预期 | 没有 tournament context |
| My FPL team | 预期 | 季前没有 event squad/result；接口均成功 |
| Competitions | 预期 | 当前 entry 没有关联 competition |
| Summary entry | 预期 | 设计上重定向 My FPL team |

有效内容页包括 Home、Live index、Entry profile、Players、Teams、Team detail、Summary gameweek、My FPL leagues、Explore、Fixtures 和 Performance。所有干净复测页面均无可见错误。

## 7. 本轮修复与后续优化

本轮已处理：

1. `miniprogram/pages/entry/profile/profile.ts` 已贯通 `forceRefresh`，复测产生 1 次真实 `GetEntry`。
2. `miniprogram/pages/summary/tournament/tournament.ts` 和 tournament service 已贯通目录与 summary 强刷，空目录复测产生 1 次真实 `EntryTournaments`。
3. `miniprogram/pages/home/index/index.ts` 已消除首次 `onLoad/onShow` 竞态，真实编译复测从 11 次逻辑调用降为 6 个唯一 operation。
4. `npm test` 为 133/133，`typecheck`、`lint` 均通过。

后续性能优化：

1. Home 刷新不应无差别强刷全部 5 个 domain operation；先强刷 current event/revision，仅在上下文变化或数据过期时刷新其余区块。
2. My FPL overview/team 仍是 3-5 个 operation 的页面编排，GraphQL 后续 read model 可进一步降低刷新尾延迟。
3. 优先诊断 `GetPlayerValues`、`PlayersForPicker`、`EventFixtures`、`FixtureWindow` 的 GraphQL resolver/DB/cache 分段耗时；这些 operation 决定当前 p95。
4. 在真机补做冷启动与长时间后台恢复。DevTools 编译启动包含工具链开销，本报告只代表本地 simulator gate，不代表真机发布性能。

## 8. PR Gate

功能与契约 hard gate 已满足：

- Entry profile 和 Summary tournament 强刷语义已修复并完成运行时复测。
- Home 暖启动重复逻辑调用已消除。
- 25 页面最终暖态遍历：0 错误、14 个网络 operation、67.4% 命中率。
- 16 页面最终刷新：0 错误、0 cache-only 假刷新、30/30 网络请求成功。
- 自动检查：133/133 tests、typecheck、lint 全部通过。

冷启动 DevTools 波动和 GraphQL 尾延迟作为非阻塞性能债进入 PR 描述；不得在 PR 中把最快冷启动样本表述为 p95。
