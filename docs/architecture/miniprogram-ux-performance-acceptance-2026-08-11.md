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

本段旧采样只记录了 proxy 局部处理，没有包含数据库 limiter，已被本报告末尾的 requestId 分段复测取代。当前 Web proxy p50 为 `777.87ms`，其中 PostgreSQL limiter p50 为 `200.48ms`，不能再表述为 `2-24ms`。

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

## EventFixtures 分段计时与修复后验收记录（2026-08-12）

> **状态：代码已实施，尚未验收。** Core Fixture 正向链路、请求级 snapshot pin 和分层计时已经实施；冷启动与暖页面已通过，但真实 full-selection 刷新、GraphQL 和 Web proxy 的 p95 仍未达到硬门槛。因此不得合并、部署或上传微信开发版。

### 代码与环境

| 项目 | 本轮基线 |
|---|---|
| GraphQL | `codex/fix-event-fixture-source` / `86d979bf4257b5c607dd068df5ebc9a5aa5fd0a0` |
| 小程序 | `codex/use-core-fixture-schedule` / `b9bc81bfd04b5bb1323aed683cd7045a1eccfc7b`，本节文档更新前代码 SHA |
| Web proxy trace | `codex/trace-graphql-request-stages` / `96649752f8ff0d917cd50fe8404ef4e2efd68deb`，仅本地诊断，未合并 |
| Web main 基线 | `35c8b7734d585c664cc5fc1d3bd8a0875bcda7c5` |
| DevTools | Stable `2.01.2510290`，基础库 `3.15.2` |
| 模拟设备 | iPhone 12/13 (Pro)，390 x 844，3x，微信 `8.0.5` |
| Data publication | season `2627`，dataset revision `2` |
| 冷启动口径 | 仅删除 `gql:v2:public:*`，点击 DevTools“编译”重启 App runtime；保留 session，不关闭 IDE，不计编译等待和 550ms 静默窗 |
| 样本 | 冷启动 3 次；暖页面预热 1 次后 10 次；连续刷新 10 次；长空闲刷新 1 次 |

自动检查结果：GraphQL `346 passed / 4 skipped / 0 failed`，typecheck、lint、format 全部通过；Web `331 passed / 5 skipped / 0 failed`，typecheck、lint 全部通过；小程序 `135/135` tests、typecheck、lint 全部通过。

### 正向链路与 request pin 修复

```text
Core Fixtures -> eventFixtures
Core Fixtures + Live Data -> liveSnapshot
```

- `CoreEventFixtureSchedule` 仍读取兼容字段 `eventFixtures(eventId)`；每次返回 10 条，`fixtureSource=redis`、`fixtureRevision=2`，页面触发的 `LiveSnapshot` 为 0。
- 原 request pin 使用 `WeakMap<GraphQLContext, ...>`。Apollo 在执行 operation 前会浅拷贝 context，publication 写入原对象，resolver 使用克隆对象，必然出现 `coreSnapshotMemoStatus=miss`。
- 修复后显式创建 `requestScope`，Apollo 浅拷贝仍共享同一 scope。运行时 trace 从 `miss` 变为 `hit`，resolver 的 Core acquisition 从约 `151ms` 降到 `0.01-0.07ms`，重复 publication `GET` 消失。
- 这是修复已有的请求级一致性 pin，不是新增跨请求缓存，不改变 TTL、数据来源或 fallback 规则。

### 用户体验性能结果

| 分层指标 | 样本 | p50 | p95 | 门槛 | 结果 |
|---|---:|---:|---:|---:|---|
| GraphQL full-selection 暖进程 | 10 | 573.43ms | 1080.38ms | <=500ms | **FAIL** |
| Web `3000` 完整代理 | 10 | 777.87ms | 1302.35ms | <=750ms | **FAIL** |
| 冷启动：App launch -> 10 条 Fixture 可见 | 3 | 835ms | 850ms | <=2000ms | PASS |
| 暖页面：route -> 10 条 Fixture 可见 | 10 | 324ms | 384ms | <=800ms | PASS |
| 刷新：Fixture network response | 10 | 804ms | 1337ms | 观察项 | **FAIL** |
| 刷新：操作开始 -> 新 Fixture 可见 | 10 | 825ms | 1353ms | <=800ms | **FAIL** |
| 刷新：response -> `setData` callback | 10 | 10ms | 26ms | <=50ms | PASS |
| 下拉刷新方法全部结束 | 10 | 3050ms | 3569ms | 观察项 | **FAIL** |
| 每次冷启动/刷新 Fixture network operation | 13 | 1 次 | 1 次 | 恰好 1 次 | PASS |
| 页面触发 Live snapshot | 全部样本 | 0 次 | 0 次 | 0 次 | PASS |

长空闲刷新单独记录：Fixture request `1604ms`，10 条可见 `1630ms`，callback `17ms`。它包含 Web PostgreSQL 连接恢复和 GraphQL current-season 回源，不与连续暖刷新混算。

### Web proxy 分段

| Web 分段 | p50 | p95 | 判断 |
|---|---:|---:|---|
| PostgreSQL rate limit | 200.48ms | 214.82ms | 每个 operation 的固定成本 |
| Better Auth session lookup | 0.28ms | 1.66ms | 当前无 cookie public 请求不是主因 |
| GraphQL upstream | 575.76ms | 1084.59ms | 主要成本和尾延迟来源 |
| body/header/response 合计 | <2ms | <3ms | 可忽略 |
| Web total | 777.87ms | 1302.35ms | 未通过 750ms 门槛 |

Web rate-limit CTE 会在每个请求中同时删除过期行并执行计数 upsert。事务内 `EXPLAIN ANALYZE` 为 planning `1.982ms`、execution `20.385ms`，命中 shared buffers 且无 block read；没有证据表明索引或表扫描是当前 200ms 的主因。同一 Supabase 连接中，literal `SELECT 1` p50 为 `99.87ms`，带参数且 `prepare:false` 的 `SELECT` p50 为 `199.26ms`，说明主要成本是远程 PostgreSQL 参数化协议往返，不应按猜测增加索引。

### GraphQL 分段

| GraphQL 分段 | p50 | p95 | 判断 |
|---|---:|---:|---|
| global admission Redis `EVAL` | 142.66ms | 148.80ms | 第 1 个串行远程 RTT |
| ingress admission Redis `EVAL` | 142.95ms | 147.17ms | 第 2 个串行远程 RTT |
| current season | 0ms | 501.73ms | 30 秒 provider TTL 到期时回源 PostgreSQL |
| Core publication pointer | 142.87ms | 146.08ms | 第 3 个串行远程 RTT |
| weighted admission Redis `EVAL` | 142.35ms | 145.50ms | 完整小程序 selection 才触发的第 4 个 RTT |
| Apollo parse/validate/execute | 0.98ms | 7.37ms | 不是主要瓶颈 |
| GraphQL total | 573.43ms | 1080.38ms | 未通过 500ms 门槛 |

当前 Redis `PING` 和真实 limiter `EVAL` 均稳定在约 `142-144ms`。因此 full-selection 常态约等于 4 个串行 Redis RTT，Fixture transform 仅 `0.02-0.11ms`。此前用 `eventFixtures { id }` 最小查询得到的 437ms 会绕过 weighted admission，不能代表小程序真实 operation，现已从验收口径删除。

GraphQL 进程首次装载 Core publication 时还会 `MGET` 6 个数据块、约 `254262` bytes；实测随链路状态为 `240-675ms`。这是服务进程冷 snapshot，不等同于小程序 App 冷启动；暖 GraphQL 进程不会重复传输这些数据块。

### Home 刷新时间线

一条正常结构的刷新按客户端 `perf:v1` 时间戳分为：

1. `0ms -> Fixture response`：约 `0.80-1.36s`。
2. `Fixture response -> 10-row setData callback`：`8-26ms`。
3. Fixture commit 后并行执行 `EventOverallResult`、`GetEntry`、`GetPlayerValues`：约 `1.38-2.91s`。
4. `CurrentEventInfo` 又在约 `2.91-3.58s` 单独执行。
5. 下拉刷新方法全部结束约 `3.05s` p50、`3.57s` p95。

这证明“10 条 Fixture 渲染 1 至 2 秒”是错误结论。实际 renderer callback p95 为 26ms；慢的是前置 Web/GraphQL 固定路径，以及 Fixture 可见后的辅助刷新尾段。新冷启动记录中 Fixture 从 launch 后立即发起，不再存在旧报告所称的 `CurrentEventInfo -> CoreEventFixtureSchedule` 前置串行阻塞；旧结论属于过期样本，已撤销。

### 验收结论与流程闸门

本轮已完成 Core/Live 依赖方向、Apollo clone 下的 request pin、后端 requestId 分段和真实 DevTools 复测。冷启动、暖页面、单次 Fixture operation、零 Live 调用和 renderer callback 已通过；GraphQL full-selection、Web proxy、刷新可见时间和完整下拉刷新仍失败。

报告状态保持“代码已实施，尚未验收”。GraphQL、小程序和 Web tracing 分支均不得合并到 `main`，不得触发 GraphQL 部署，也不得上传微信开发版 `1.0.2`。后续优化必须优先处理串行远程 admission、Web PostgreSQL limiter 和 current-season 请求路径，不能通过增加 Fixture TTL 掩盖问题。

---

## 2026-08-12 当前分支最终验收记录

### 当前状态

**代码已实施，尚未验收。**

本节是本轮 optimize-* 三分支的最新验收结论，覆盖此前“正确口径后修改样本”。代码检查通过不等于性能门槛通过；以下任一硬门槛失败，都不得合并、部署或上传开发版。

### 版本与环境

| 项目 | 实际值 |
|---|---|
| GraphQL worktree/branch | /Users/tong/AgentProjects/.worktrees/letletme-graphql-read-path / codex/optimize-miniprogram-read-path |
| GraphQL SHA | 2337d1b23b2a819812a1ee30dd7c8278ac3cd883 |
| Web worktree/branch | /Users/tong/AgentProjects/.worktrees/letletme-web-proxy-read-path / codex/optimize-graphql-proxy-read-path |
| Web SHA | d73227689eeffe946e63083a9281d4234a15c310 |
| Mini worktree/branch | /Users/tong/AgentProjects/.worktrees/letletme-wechat-home-read-path / codex/optimize-home-read-path |
| Mini SHA | 481f68fea529bb1cd13800223c0eaaae859f4965 |
| DevTools | WeChat DevTools Stable 2.01.2510290，基础库 3.15.2 |
| 本地链路 | Mini -> 127.0.0.1:3000/api/graphql -> 127.0.0.1:4000/graphql |
| 数据结果 | 当前目标 worktree 页面显示 10 条 Fixture；HTTP 样本均为 200、Fixture 数量 10、GraphQL errors 为 0 |

本轮未使用未合并 GraphQL SHA、临时 trusted proxy 或一次性绕过。GraphQL/Web 仍为本地分支，未部署。

### 自动检查

| 仓库 | test | typecheck | lint | 其他 |
|---|---|---|---|---|
| GraphQL | 348 pass，4 skip，0 fail | pass | pass | format check pass |
| Web | 335 pass，5 skip，0 fail | pass | pass | production build pass |
| Mini | 139/139 pass | pass | pass | DevTools build-npm pass |

### 当前链路证据

- GraphQL 动态 admission 已合并为每个 operation 一次原子 Redis admission EVAL；旧报告中“三次串行动态限流”/“四次远程 EVAL”的表述不适用于当前代码。
- 请求仍有独立的 publication pointer Redis read；实测串行样本中 admission 与 publication 的远程 Redis 阶段约为 142--408ms，且 RTT 有明显抖动。这是当前 Fixture p95 未达标的主要外部开销，不是 10 条 Fixture 的 JSON 或小程序逐条渲染。
- Current season 已改为启动期加载的不可变值；请求路径没有 season DB query，health 只做数据库连通性检查。
- eventFixtures 保持 Core Fixtures 来源，不进入 Live snapshot；测试和当前 CoreEventFixtureSchedule 日志没有发现页面触发的 LiveSnapshot operation。
- GetPlayerValues 空结果 miss 的当前 trace 显示 databaseChanges 约 832ms，另有 cache read、cache write 远程阶段；negative hit 则不进入数据库和 enrichment。当前瓶颈仍在空结果 miss 的数据库路径以及远程 Redis RTT，不在 29B 返回体或渲染。

### 严格性能门槛

样本按 endpoint 串行采集；p95 仅对 n >= 10 的样本计算。冷启动、暖页面、刷新及 response-to-setData 的正式多样本计时在当前最终 SHA 上尚未完整取得，因此不能用单次 DevTools 观察替代。

| 指标 | 门槛 | 当前样本 | 结论 |
|---|---:|---|---|
| GraphQL Fixture 暖进程直连 | p95 <= 350ms | n=20，p50 775.18ms，p95 925.79ms，max 944.48ms | **失败** |
| 经 Web Fixture | p95 <= 450ms | n=20，p50 755.35ms，p95 929.77ms，max 953.69ms | **失败** |
| 暖页面到 Fixture 可见 | p95 <= 550ms | 当前仅有 DevTools spot sample 583ms，n=1 | 未完成正式验收 |
| 冷启动到 Fixture 可见 | max <= 1.2s | DevTools launch spot 3014ms，n=1，非正式完整样本 | 未达标/需重测 |
| 刷新到 Fixture 可见 | p95 <= 600ms | 当前仅有 DevTools spot sample 583ms，n=1 | 未完成正式验收 |
| MiniHomeSupplement warm | p95 <= 650ms | n=20，p50 445.44ms，p95 452.25ms，max 1427.11ms | p95 通过，存在 outlier |
| GetPlayerValues negative hit 经 Web | p95 <= 500ms | n=10，p50 441.64ms，p95 445.88ms，max 445.88ms | 通过 |
| GetPlayerValues empty miss 经 Web | <= 1.0s | 首次 miss 1110.48ms；随后 negative hit 441.09ms | **失败**（首个 miss） |
| response -> setData callback | p95 <= 50ms | 当前最终 SHA 未取得正式 n>=10 样本 | 未完成正式验收 |
| GraphQL limiter admission | 每 operation 1 次 EVAL | 代码、单测、运行链路一致 | 通过 |
| 请求期 season DB query | 0 | 启动加载；连续请求与 health 无 season 查询 | 通过 |
| Web GraphQL limiter DB query | 0 | route 源码/测试确认未调用 DB limiter | 通过 |
| Fixture Live snapshot | 0 | Core fixture 单测、trace 和当前 operation 日志 | 通过 |

### 结论与后续阻断

当前不能标记为“已修复并验收”，原因是：

1. GraphQL 直连 Fixture p95 为 925.79ms，超过 350ms。
2. Web Fixture p95 为 929.77ms，超过 450ms。
3. GetPlayerValues empty miss 为 1110.48ms，超过 1.0s。
4. 冷启动、暖页面、刷新和 response-to-setData 的正式多样本尚未完成，不能将单次 DevTools 583ms 或 3014ms 当成 p95/最大值验收。
5. 因此不执行 GraphQL fast-forward、Web fast-forward、小程序 fast-forward、线上部署或微信开发版 1.0.2 上传。

需要继续处理的不是加 TTL 或隐藏请求，而是先在当前分段 trace 下确认并修复：

- GraphQL admission Redis 与 publication pointer Redis 的 RTT/连接池/串行等待。
- empty miss 的 databaseChanges 查询路径，尤其是约 832ms 的数据库阶段。
- 完整冷启动和刷新阶段的 app context、网络响应、setData callback、Native visible 分段计时。

## 2026-08-12 执行结果：代码已实施，尚未验收

本轮按分支 `codex/optimize-miniprogram-read-path`、`codex/optimize-graphql-proxy-read-path`、`codex/optimize-home-read-path` 执行。GraphQL 优化提交为 `e90bee1`；Web 验证基线为 `d732276`；小程序功能实现为 `481f68f`，此前报告文档提交为 `5aef00f`。没有创建 PR、没有合并、没有部署、没有上传开发版。

### 环境与链路

- 测试日期：2026-08-12，WeChat DevTools Stable `2.01.2510290`，基础库 `3.15.2`，模拟器 iPhone 12/13 Pro 100%，在线网络，无网络限速。
- GraphQL：`127.0.0.1:4000/graphql`，启动日志接受 season `2627`、dataset revision `2`。
- Web：`127.0.0.1:3000/api/graphql`，upstream 为 `127.0.0.1:4000/graphql`；4000 `/health` 返回 `200`，Redis、PostgreSQL、season 均为 `ok`。
- 小程序 Network 目标仍为 Web `3000`，没有直连 `4000`。

### 分段证据

| 阶段 | 实测证据 | 结论 |
|---|---:|---|
| CoreEventFixtureSchedule 直连 GraphQL | n=20，p50 `291.8ms`，p95 `297.2ms`，max `299.9ms`，20/20 为 200 | 通过 `<=350ms` |
| CoreEventFixtureSchedule 经 Web | n=20，p50 `297.4ms`，p95 `302.1ms`，max `303.4ms`，20/20 为 200 | 通过 `<=450ms` |
| GraphQL admission | 每个请求只有一个 `admission` stage；单个串行样本约 `142-146ms` | 单 EVAL 语义已生效 |
| CurrentEventInfo | 冷链路样本约 `290.8ms`；没有请求期 season stage | 启动期 season 方案生效，仍需正式计数验证 |
| MiniHomeSupplement | `441.2ms`，包含 notice、eventOverallResult、playerValues 三个 root | 作为 secondary，不阻塞 Fixture |
| GetEntry | `933.5ms`，发生在 Fixture 之后 | 后置个人数据，不应计入 Fixture 首屏 |
| GetPlayerValues 暖命中 | 隔离 n=10，p50 `443.2ms`，p95 `450.1ms`，max `450.1ms` | 通过 `<=500ms` |
| GetPlayerValues 空结果 miss | 新日期单次 `694.9ms`；trace 的 databaseChanges 约 `111ms` | 本样本通过 `<=1.0s` |
| GetPlayerValues 混合批次 miss | 一次重新 miss `1.337s`；trace databaseChanges `740.5ms` | 剩余波动，不能忽略 |
| response 到 setData callback | 现有埋点保留 render commit，但本轮尚未取得正式 n>=10 独立样本 | 未验收 |

### DevTools 冷启动事实

清除模拟器数据缓存后普通编译，页面实际显示十条 Fixture；GraphQL trace 顺序为 `CurrentEventInfo 290.8ms -> CoreEventFixtureSchedule 292.8ms -> MiniHomeSupplement 441.2ms`，`GetEntry 933.5ms` 在其后。DevTools 控制台报告 `[system] Launch Time: 1192 ms`。CUA 从点击编译到观察页面的约 `4.96s` 包含编译、工具等待和后置请求，不能作为产品首屏时间。

因此当前仍不能证明“冷启动到首批 Fixture 可见最大值 `<=1.2s`”：只有单次 DevTools Launch Time，缺少从 app context start 到 Fixture visible 的独立时间戳。页面刷新按钮还命中了 Fixture cache，没有产生 force-refresh operation；下拉刷新 n=20 尚未取得。

追加的 20 次真实下拉手势观察上界为 `1172-1205ms`。这包含 DevTools 手势、状态观察和工具等待，不作为产品 p95。对应后端 trace 中 Fixture 单请求约 `289-365ms`；连续手势使 secondary admission 排队到约 `280-296ms`，`MiniHomeSupplement` 约 `860-870ms`，但 secondary 不阻塞 Fixture 提交。当前仍缺每次从 `forceRefresh` 开始到 `setData` callback/Native visible 的一对一时间戳。

### 分段埋点已补齐

小程序提交 `252c5b1` 在 `perf:v1` 中新增 `homeFixtureTimings`，每次首页 Fixture 记录 `cold/warm/refresh`、请求耗时、response 到 `setData`、`setData callback` 和 load 到 visible；原有 API 与 render commit 记录不变。该提交之后需要重新编译 DevTools 并重新采样，旧样本不与新埋点混合。

### 自动检查

- GraphQL：`352 pass / 4 skip / 0 fail`；`tsc --noEmit`、lint、format check 通过。
- Web：`335 pass / 5 skip / 0 fail`；`npx tsc --noEmit`、lint、production build 通过。仓库没有 `npm run typecheck` script，不能把不存在的脚本记为通过。
- 小程序：`139 pass / 0 fail`；typecheck、lint 通过。
- 正价格变更 miss：当前 publication 在可查询日期返回空结果，尚未有真实正结果样本；只能由现有集成测试覆盖，不能冒充线上性能样本。

### 门槛结论

代码链路已实施，核心 Fixture 和 Web/GraphQL 接口门槛已通过；冷启动 Fixture visible、下拉刷新 n=20、response-to-setData 正式样本、正价格变更 miss 仍未闭环。因此报告状态保持 **代码已实施，尚未验收**，不得进入 GraphQL/Web/小程序合并、线上部署或微信开发版 `1.0.2` 上传。
