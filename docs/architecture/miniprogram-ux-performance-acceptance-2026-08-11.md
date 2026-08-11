# 小程序 UX 与性能严格验收报告

日期：2026-08-11  
范围：当前 `codex/data-fetch-cache-remediation` 实现，本地 WeChat DevTools 全页面验收  
链路：`WeChat DevTools -> http://localhost:3000/api/graphql -> http://127.0.0.1:4000/graphql`

> **EventFixtures 整改状态：代码已实施，尚未验收。** 旧数据只能说明修复前链路；其中 550ms 静默观察窗口不是用户可感知渲染时间。只有完成 GraphQL `4000`、Web `3000`、WeChat DevTools 冷暖样本和无 Live snapshot trace 验证后，才能将状态更新为“已修复并验收”。

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

### 4.1 全部 25 个注册页面逐页结果

下表来自修复后的最终暖态遍历。`完全稳定` 包含页面 loading 结束、最后一条 API 完成以及 550ms 无新活动确认；`memory/storage` 耗时是本地读取时间，不是网络请求。

| # | 请求页面 -> 实际页面 | FCP / LCP | 完全稳定 | 页面内容与判定 | 本轮 API 证据 |
|---:|---|---:|---:|---|---|
| 1 | Home -> Home | 398 / 398ms | 1.477s | **正常**：10 条 fixture、1 组 GW stats；价格涨跌为 0，符合当前 publication 无价格行 | `EventFixtures 1ms memory`；`GetEntry 0ms memory`；`GetPlayerValues 0ms memory`；`EventOverallResult 0ms memory`；`MiniProgramNotice 0ms memory`；0 network |
| 2 | Account link -> Account link | 341ms / - | 1.314s | **正常静态页**：账户绑定入口，不应请求业务列表 | 无 GraphQL operation |
| 3 | Live index -> Live index | 341ms / - | 1.317s | **正常**：3 张 Live 入口卡片 | 无 GraphQL operation |
| 4 | Data index -> Explore | 329ms / - | 1.397s | **预期重定向**：旧 Data shell 跳转 Explore；实际展示 2 个分组 | `CurrentEventInfo 0ms memory`；0 network |
| 5 | Entry search -> Entry search | 339ms / - | 1.305s | **预期初始态**：输入 Entry ID 前不展示结果 | 无 GraphQL operation |
| 6 | Entry profile -> Entry profile | 336 / 359ms | 1.424s | **正常**：entry 对象存在，`emptyState=false` | `GetEntry 0ms memory`；0 network。强刷另测为 `GetEntry 345ms network` |
| 7 | Live entry -> Live entry | 365 / 365ms | 2.610s | **正常季前态**：4 个 summary tiles；starters、bench、managers、transfers 为 0，当前季前无阵容数据 | `CurrentEventInfo 1ms memory`；`GetEntryTransferHistory 1.124s network`；`CalcLivePointsByEntry 1.603s network` |
| 8 | Live match -> Live match | 374ms / - | 1.476s | **预期空态**：3 个 schema-backed 状态选项；当前季前 bucket 无比赛 | `CurrentEventInfo 0ms memory`；`LiveMatches 291ms network` |
| 9 | Live tournament -> Live tournament | 354 / 390ms | 1.447s | **预期空态**：当前 entry 没有关注 tournament；筛选和列配置正常 | `CurrentEventInfo 0ms memory`；`EntryTournaments 0ms memory`；0 network |
| 10 | Players?keyword=Saka -> Players | 357 / 357ms | 1.450s | **正常**：服务端搜索返回 2 名球员，`hasMore=false` | `PlayersForPicker 0ms storage`；0 network |
| 11 | Player detail，无 code -> Player detail | 339ms / - | 1.284s | **预期空态**：验收路由未传 player code，`emptyState=true` | 无 GraphQL operation |
| 12 | Teams -> Teams | 335 / 335ms | 1.432s | **正常**：20 支球队 | `Teams 240ms network` |
| 13 | Team detail?teamId=1 -> Team detail | 350 / 350ms | 1.425s | **正常**：teamId=1 成功展示，`emptyState=false` | `Team 240ms network` |
| 14 | Price -> Price | 622 / 622ms | 1.685s | **预期空态，需持续关注 publication**：当前价格行、涨跌和历史均为 0；位置筛选存在，球队仅“全部” | `GetPlayerValues 0ms memory`；0 network |
| 15 | Selections -> Selections | 367 / 399ms | 1.456s | **预期空态**：4 个 tab 正常；当前没有 tournament selection | `EntryTournaments 0ms memory`；0 network |
| 16 | Summary entry -> My FPL team | 51 / 520ms | 2.484s | **预期重定向**：兼容路由跳转 My FPL team；51ms 是中间页 FCP，520ms LCP 才是有效首屏 | `CurrentEventInfo 0ms memory`；`EntryHistory 395ms network`；`EntryTransferHistory 591ms network`；`EntryEventResult 655ms network`；`GetLiveSnapshot 336ms network` |
| 17 | Summary tournament -> Summary tournament | 334 / 334ms | 1.396s | **预期空态**：当前 entry 没有 tournament context | `EntryTournaments 0ms memory`；0 network。强刷另测为 `EntryTournaments 551ms network` |
| 18 | Summary gameweek -> Summary gameweek | 347 / 347ms | 1.795s | **正常**：2 个 summary stats、4 个 dream-team groups；当前无 chip/elite/transfer rows | `MiniGameweekSummary 797ms network`，仅 1 个聚合 operation |
| 19 | My FPL overview -> My FPL overview | 362 / 362ms | 1.791s | **正常季前态**：entry 可用，无错误；当前 event 的次级模块按数据可用性渐进展示 | `CurrentEventInfo 0ms memory`；`GetEntry 0ms memory`；`EntryEventResult 646ms network`；`EntryLeagues 781ms network` |
| 20 | My FPL team -> My FPL team | 354 / 395ms | 1.433s | **预期季前态**：当前没有 event squad/result，历史、阵容、转会显示为 0；无错误 | `CurrentEventInfo 0ms memory`；`EntryHistory 0ms memory`；`EntryEventResult 0ms memory`；`EntryTransferHistory 0ms memory`；`GetLiveSnapshot 334ms network` |
| 21 | My FPL leagues -> My FPL leagues | 341 / 341ms | 1.431s | **正常**：13 个 league rows | `CurrentEventInfo 0ms memory`；`EntryLeagues 0ms memory`；0 network |
| 22 | Competitions -> Competitions | 347 / 387ms | 1.425s | **预期空态**：当前 entry 没有关联 competition | `CurrentEventInfo 0ms memory`；`EntryTournaments 0ms memory`；0 network |
| 23 | Explore -> Explore | 352 / 352ms | 1.445s | **正常**：2 个探索分组 | `CurrentEventInfo 0ms memory`；0 network |
| 24 | Fixtures -> Fixtures | 345 / 345ms | 1.425s | **正常**：20 个 fixture runs | `CurrentEventInfo 0ms memory`；`Teams 0ms memory`；`FixtureWindow 413ms network` |
| 25 | Performance -> Performance | 353ms / - | 1.333s | **正常本地诊断页**：4 个 metrics、20 个 API groups | 无新增 GraphQL operation |

逐页汇总结论：

- 正常业务或工具页面：13。
- 预期空态、初始态或季前态：9。
- 设计重定向：2。
- 正常静态页：1。
- 非预期空白、可见错误、timeout、契约错误：0。
- 25 页本轮合计：43 次逻辑调用、14 次真实网络请求、14/14 网络成功。

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

---

## EventFixtures 修复后验收记录（2026-08-12）

> **状态：代码已实施，尚未验收。** 本轮真实验收未达到全部硬门槛，因此不得合并、部署或上传微信开发版。

### 代码与环境

| 项目 | 本轮基线 |
|---|---|
| GraphQL | `codex/fix-event-fixture-source` / `7c5d719`（基于 `db5eaecc05e5c52924ea6f58360094963befd28c`） |
| 小程序 | `codex/use-core-fixture-schedule` / `7b70de9`（基于 `90d822371273115af34043c5be72b83f35627e44`） |
| Web proxy | `main` / `35c8b7734d585c664cc5fc1d3bd8a0875bcda7c5`，未修改 |
| DevTools | Stable `2.01.2510290`，基础库 `3.15.2` |
| 模拟设备 | iPhone 12/13 (Pro)，390 x 844，3x，微信 `8.0.5` |
| Data publication | season `2627`，dataset revision `2` |
| 冷启动口径 | 清理 `gql:v2:*` 后使用 `wx.restartMiniProgram` 重启 App runtime；不关闭或重开 DevTools IDE |
| 样本 | 冷启动 3 次、暖页面 10 次、手动刷新 10 次 |

自动检查结果：GraphQL 343 passed / 4 skipped / 0 failed，typecheck、lint、format 全部通过；小程序 135/135 tests、typecheck、lint 全部通过。

### 修复后的正向链路证据

```text
Core Fixtures -> eventFixtures
Core Fixtures + Live Data -> liveSnapshot
```

- `CoreEventFixtureSchedule` 的 GraphQL 字段仍为兼容的 `eventFixtures(eventId)`。
- 每次网络 Fixture 请求的后端 trace 均为一次 `Core fixture schedule loaded`，`fixtureSource=redis`、`fixtureRevision=2`、`fixtureCount=10`。
- 3 次冷启动、10 次暖页面和 10 次刷新共记录 23 次 Fixture 逻辑调用，其中 13 次网络调用、10 次本地缓存调用。
- 23 个样本的 Fixture 行数全部为 10；页面触发的 `LiveSnapshot` operation 总数为 0。
- 未新增缓存，未延长现有 Fixture TTL，未修改 Data 或 Web 代码。

### 分层性能结果

| 分层指标 | 样本 | p50 | p95 | 门槛 | 结果 |
|---|---:|---:|---:|---:|---|
| GraphQL `4000` 暖进程直连 | 10 | 581.7ms | 1278.9ms | <=500ms | **FAIL** |
| Web `3000` 完整代理请求 | 10 | 801.7ms | 2205.3ms | <=750ms | **FAIL** |
| 冷启动：App launch -> FCP | 3 | 693ms | 768ms | 观察项 | PASS |
| 冷启动：App launch -> 10 条 Fixture 可见 | 3 | 2334ms | 2961ms | <=2000ms | **FAIL** |
| 暖页面：route -> FCP | 10 | 325ms | 334ms | 观察项 | PASS |
| 暖页面：route -> 10 条 Fixture 可见 | 10 | 299ms | 308ms | <=800ms | PASS |
| 手动刷新 -> 新 Fixture 可见 | 10 | 971ms | 1499ms | <=800ms | **FAIL** |
| response -> `setData` callback | 10 | 19ms | 22ms | <=50ms | PASS |
| `setData` callback 自身 | 10 | 16ms | 18ms | <=50ms | PASS |
| 每次冷启动/刷新 Fixture 网络 operation | 13 | 1 次 | 1 次 | 恰好 1 次 | PASS |
| 页面触发 Live snapshot | 23 | 0 次 | 0 次 | 0 次 | PASS |

补充基线：同一 GraphQL ingress 下，`MiniProgramNotice` p50 为 577.3ms、p95 为 1185.4ms；Redis active manifest 热 GET p50 为 0.1ms、p95 为 0.2ms。Fixture 本身不是 1 至 2 秒的前端渲染工作，主要延迟来自 GraphQL 公共请求固定路径、Web 上游等待，以及冷启动时 `CurrentEventInfo -> CoreEventFixtureSchedule` 的串行依赖。

### 首屏与刷新诊断

- 冷启动原生 FCP p95 为 768ms，说明路由、模块执行和初始视图能够在 1 秒内出现。
- 10 条 Fixture 从网络响应到原生 `setData` callback 的 p95 仅 22ms；渲染层不是秒级瓶颈。
- 冷启动仍先取得 current event，再请求该 event 的 Fixture，因此 Fixture 可见 p95 为 2961ms。
- 小程序已把 entry、价格、总结和公告请求的**发起时点**移到 Fixture commit 之后，避免这些辅助请求争抢首屏代理和 GraphQL 容量。
- 调整前同口径刷新 Fixture 可见 p95 为 3002ms；调整后为 1499ms，改善约 50%，但仍高于 800ms 门槛。
- 刷新剩余时间主要落在单次 `3000 -> 4000` 网络路径；renderer callback p95 只有 18ms。
- 先前通过关闭并重开整个 DevTools IDE 得到的 7 至 9 秒数据包含 IDE 编译与 automation 建连，不属于用户冷启动，本表已排除。
- 550ms 静默观察窗口未计入任何用户可感知指标。

### 验收结论与流程闸门

本轮完成了 EventFixtures 依赖方向修复、单一 operation 收敛、辅助请求解除首屏竞争，并证明普通 Fixture 页面不再进入 Live snapshot。以下三项硬门槛仍失败：GraphQL 直连、Web 代理、冷启动/刷新 Fixture 可见时间。因此报告不能标记为“已修复并验收”，GraphQL 和小程序分支均不得合并到 `main`，不得触发 GraphQL 部署，也不得上传微信开发版 `1.0.2`。
