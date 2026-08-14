# 小程序性能 Run：2026-08-14 G2-B/C 运行矩阵与生产纵向追踪

> 状态：G2-B 的 DevTools 运行矩阵已完成，G2-C 已沿 Mini -> Web GraphQL 代理 -> GraphQL resolver -> Redis/Data publication/PostgreSQL 追到当前可观测边界。
>
> Gate 2 尚未整体关闭：iOS、Android 真机样本需要真实设备；GraphQL 单请求内部 timing 已写日志但本机没有生产 VPS 日志读取权限。两项都明确保留，不能用模拟器或推断冒充。
>
> 本轮只读诊断，不修改业务代码，不清生产 Redis，不修改生产数据，不调整 TTL，不 push、不 merge。

## 1. 结论先行

- `miniprogram/config/mock-mode.ts` 与 `miniprogram/mocks/` 不属于本次根因路径，未作为 Gate 2 阻塞项，也没有读取为生产证据。
- 同一 Mini 提交完成了 DevTools 25/25 路由、P0 冷启动/暖进入/刷新/短后台、三种身份、离线/stale、错误/重试、快速切换、缺参和 401 single-flight/replay 验证。
- Home 在 DevTools 内结束并重新启动 5 个独立小程序 JS 进程，T6 为 `92 / 91 / 112 / 118 / 117ms`，p50 `112ms`、最大 `118ms`，通过 `<=1500ms` 目标；这组保留普通 storage，属于 `C-App`，不冒充 `C-Data` 或真机冷启动。
- 9 个 P0 页面自然 `W-Enter` 均通过 `p95 <=550ms`。Refresh 只有 3 个通过、5 个失败、1 个不适用：My FPL Overview、Live Entry、Competitions、Fixtures、Market 超过 `600ms`。
- 生产 request ID 证明 Web 代理自身通常约 `1–2ms`，慢样本主要落在 `upstreamFetch`；但“上游”仍包含 Vercel 到 GraphQL VPS 的连接和 GraphQL 内部执行，不能直接等同 SQL。
- Market 当前无涨跌是合法空态：生产 PostgreSQL 当天只有 3 条 season-baseline 行，实际 changed rows 为 0；不是接口坏了，也不应通过伪造 mock 数据“修复”。
- Market 冷负缓存复现实验中，第一次 Web `upstreamFetch=536.71ms`，随后四次为 `26.04–29.61ms`；生产 Redis 随后出现 5 分钟 negative-cache。数据库同口径只读计划约 `8.77ms`，说明周期性慢首个请求不是单纯 SQL 扫描。
- GraphQL 与 Data 的最新成功部署分别固定在 `bb444163...` 与 `2c25cbc5...`，部署日志的 contract、migration、publication、health 均通过。Web 在本轮中连续部署，最终生产为 `ecea1a3f...`；所用 `/api/graphql` 代理文件从最初冻结的 `bf9d481d...` 到最终提交 blob 完全相同，但不同 deployment 的冷启动样本仍不得混成一个服务端分布。
- 依赖裁剪后的 DevTools 构建仍为 25/25：`miniprogram_npm` 从约 `1968KB / 72` 个 Vant 目录降到约 `364KB / 13` 个目录；主包约 `1796KB`。风险是 `prune:vant` 仍是独立手工步骤，没有纳入 build/CI。
- 优化顺序应是：先修 Refresh 请求图和 Market revisioned negative path，再固化包裁剪和主包拆分，然后修 Live Tournament 季前语义，最后补齐跨层 timing。当前没有获得实现授权，因此只形成根因包，不改代码。

## 2. 阶段口径：总共六个 Gate，G2 内含三个子阶段

顶层流程仍是六个 Gate：

```text
G0 版本与环境冻结
  -> G1 25 页面轻量基线
  -> G2 全局共性问题
  -> G3 按 Section 深查与优化
  -> G4 跨 Section operation 收敛
  -> G5 全页面最终回归
```

G2 为避免变成一个无边界大包，固定拆成：

| 子阶段 | 内容 | 当前状态 |
|---|---|---|
| G2-A | 观测契约：T6、冷热归因、有限值、complete 语义 | 🟢 已完成，见独立 Run |
| G2-B | Mini 运行矩阵：启动、暖进、刷新、后台、身份、离线、错误、竞态、401、包体 | 🟡 DevTools 已完成；iOS/Android 真机待设备 |
| G2-C | 纵向归因：request ID、Web proxy、resolver、Redis/Data publication、PostgreSQL | 🟡 当前可观测边界已完成；GraphQL 单请求日志访问是已确认缺口 |

因此，下一步不是继续围绕 `mock-mode.ts`，也不是立刻逐页乱改。先把 G2 的两个黄色缺口按外部条件管理；可执行的优化应按第 10 节根因包进入实现授权。

## 3. Run 元数据与证据边界

| 字段 | 本次值 |
|---|---|
| Run | `2026-08-14-g2-b-c` |
| Mini 提交 | `ca8fcac430411823f0c659de81f0938c089b824e` |
| Mini 分支 | `codex/miniprogram-performance-g2-observability`，tracked clean |
| 文档分支 | `codex/miniprogram-performance-audit-docs` |
| 主 worktree | `main@12acbb2...`；存在用户/并发任务改动，本轮未触碰 |
| DevTools | Stable `2.01.2510290` |
| 基础库 | SDK `3.15.2` |
| 模拟设备 | iPhone 12/13 Pro profile，`390 x 753`，DPR `3` |
| 网络 | DevTools Wi-Fi；生产直连复现由 Perth 本机发起 |
| 身份 | 已绑定 rich-state；另在运行时验证游客+本地关注、登录未绑定 |
| Mini endpoint | 采样时临时指向生产；结束后两个 override 均删除并验证为空 |
| Web 生产 | 最初冻结 `bf9d481d...`；本轮滚动到最终 `ecea1a3f...` |
| GraphQL 生产 | `bb444163416b8500efb0b7c707c8a3ca54ecae25` |
| Data 生产 | `2c25cbc5d751dd3fd976d2123cdf45a6b4a420af` |
| Core publication | season `2627`，revision `4` |
| Market publication | season `2627`，revision `5` |
| Live publication | event 1 当前不存在；与季前期一致 |

证据边界：

- Web runtime log 通过只读 Vercel Observability 查询获得。
- GraphQL/Data 部署 SHA 与部署成功状态通过 GitHub Actions 只读日志确认。
- 本机没有 VPS SSH 私钥，`deploy@VPS` 返回 `Permission denied (publickey)`；没有尝试获取或绕过密钥。
- PostgreSQL 探针使用仓库现有本机连接，显式 `BEGIN READ ONLY` 和 `statement_timeout=3s`。该本机凭据不是生产 GraphQL runtime role 的证明；生产 deploy preflight 独立强制 `letletme_graphql_runtime`/reader contract。
- Redis 只读使用精确 key，未使用 `KEYS`、`SCAN`、`FLUSH*` 或删除。正常 GraphQL 读取按产品契约写入 query cache，不属于人工改缓存。
- Web 本轮发生多次部署。Mini 页面每个 n=10 批次在短窗口内完成，但跨批次的 Web proxy 样本不合并计算统一 p95。

## 4. G2-B 运行矩阵

| 验证项 | 当前证据 | 结果 |
|---|---|---|
| 25 页面 post-prune smoke | 25/25 注册路由到达；2 个 legacy 按预期重定向；console error 0、exception 0 | 🟢 |
| Home C-App | n=5，T6 最大 `118ms`；complete 有一个 `2307ms` 次要请求尾延迟 | 🟢 首屏；🟡 次要尾延迟 |
| P0 W-Enter | 9 页均 n>=10 且 p95 `<=550ms` | 🟢 |
| P0 Refresh | 3 pass / 5 fail / 1 N/A | 🔴 性能门槛 |
| BG-Short | 9/9 route 保持，hide/show 状态正确；Live Entry 因 freshness 发 1 个请求 | 🟢 语义；🟡 现有 TTL |
| 游客+本地关注 | Overview、Team、Live Entry、Competitions 均到达非 loading/error 终态 | 🟢 |
| 登录未绑定 | Overview `NO_FOLLOW`，其余页无 entry 引导态；session 保持 | 🟢 |
| 登录已绑定 | 全基线与 P0 矩阵覆盖 | 🟢 |
| Offline 有 last-good | 强制 refresh 返回 `stale`，没有 transport attempt | 🟢 |
| Offline 无缓存 | 4ms 内进入离线错误，`networkAttempted=false` | 🟢 |
| Error -> retry | Player Detail 注入请求失败后显示 error；恢复 request 后重试成功 | 🟢 |
| 快速切换/迟到响应 | Fixtures、Live Match、Market、My FPL Team 最终状态均归最新选择 | 🟢 |
| 缺参 | Player Detail、Team Detail 均进入 empty 引导态且 operation=0 | 🟢 |
| 401 single-flight | 3 个并发 operation：3 次初始 401、login 1、Web login 1、replay 3、最终 3/3 成功 | 🟢 |
| iOS 真机 | 无当前物理设备证据 | 🟡 外部设备缺口 |
| Android 真机 | 无当前物理设备证据 | 🟡 外部设备缺口 |

所有运行时 mock、网络状态、request descriptor、身份 token 与 entry binding 均在测试后恢复；只保留脱敏布尔验证，不记录 token 或原始 entry ID。

## 5. P0 性能结果

### 5.1 Home C-App

| 样本 | T6 | complete | network operation |
|---:|---:|---:|---:|
| 1 | 92ms | 774ms | 0 |
| 2 | 91ms | 702ms | 0 |
| 3 | 112ms | 802ms | 0 |
| 4 | 118ms | 2307ms | 1 |
| 5 | 117ms | 672ms | 0 |

T6 p50 `112ms`、max `118ms`。第 4 次的 `2307ms` 不影响主内容可见，但暴露 optional/secondary 网络尾延迟，后续优化不能把它混进 T6，也不能直接忽略。

### 5.2 W-Enter 与 Refresh

nearest-rank p95，所有行 n=10；Home W-Enter 为 n=11。

| P0 页面 | W-Enter p95/max | W 结果 | Refresh p95/max | 10 次网络数 | `>600ms` | Refresh 结果 |
|---|---:|---|---:|---:|---:|---|
| Home | `358 / 358ms` | 🟢 | `412 / 412ms` | 29 | 0 | 🟢 |
| My FPL Overview | `76 / 76ms` | 🟢 | `751 / 751ms` | 30 | 3 | 🔴 |
| My FPL Team | `30 / 30ms` | 🟢 | `371 / 371ms` | 20 | 0 | 🟢 |
| Live Entry | `34 / 34ms` | 🟢 | `671 / 671ms` | 10 | 1 | 🔴 |
| Live Match | `35 / 35ms` | 🟢 | `401 / 401ms` | 10 | 0 | 🟢 |
| Competitions | `54 / 54ms` | 🟢 | `903 / 903ms` | 30 | 10 | 🔴 |
| Explore | `62 / 62ms` | 🟢 | N/A：页面无刷新 handler | 0 | 0 | ⚪ |
| Fixtures | `74 / 74ms` | 🟢 | `790 / 790ms` | 30 | 6 | 🔴 |
| Market | `28 / 28ms` | 🟢 | `1129 / 1129ms` | 10 | 8 | 🔴 |

关键判断：暖进入不是问题主体，失败集中在“用户明确刷新后强制绕过客户端 cache”的请求图和上游尾延迟。

## 6. 包体与构建验证

执行 `npm run prune:vant` 后重新编译并完整 smoke：

| 项目 | 裁剪前 | 裁剪后 |
|---|---:|---:|
| Vant 目录 | 72 | 13 |
| `miniprogram_npm` | 约 1968KB | 约 364KB |
| 主包 `miniprogram` | — | 约 1796KB |

保留目录为 `action-sheet`、`common`、`definitions`、`icon`、`info`、`loading`、`mixins`、`overlay`、`popup`、`tabbar`、`tabbar-item`、`transition`、`wxs`。第二次运行 removed=0，证明裁剪脚本幂等。

门禁：

| 门禁 | 结果 |
|---|---|
| ESLint | 通过 |
| TypeScript `--noEmit` | 通过 |
| tests | 354/354 通过 |
| style drift | clean |
| package dry-run | packed `918.1kB`，unpacked `3.3MB`，362 files |
| npm audit moderate | 0 vulnerabilities |
| DevTools Problems | 0 |
| post-prune route smoke | 25/25 |

风险不是脚本正确性，而是流程：`prune:vant` 尚未进入 build/prepack/CI，开发者忘记手工运行时仍会重新带入无用组件。

## 7. G2-C 生产纵向链路

### 7.1 这个项目的真实在线读链路

```text
Mini page lifecycle
  -> page service / graphql.service.ts
  -> wx.request
  -> letletme-web /api/graphql
  -> GraphQL resolver/service/repository
  -> GraphQL query cache / Data publication in Redis
  -> PostgreSQL coherent read model fallback or direct reporting read

letletme_data（异步生产者）
  -> provider ingestion / jobs
  -> canonical PostgreSQL fpl.* / competition.*
  -> reporting.*
  -> llm:data:* atomic publication
```

`letletme_data` 对这些页面读请求不是同步 HTTP hop。它拥有数据写入、reporting 与 publication；GraphQL 在请求中直接读取 Data-owned Redis/PostgreSQL。后续排查不能虚构一个“GraphQL -> Data API -> DB”的在线阶段。

### 7.2 operation 去重映射

| 页面/operation | Resolver/read path | 正常 source | fallback/source of truth |
|---|---|---|---|
| Home `MiniHomeSupplement` | Mini resolver 聚合 | GraphQL cache / core context | PostgreSQL |
| `CurrentEventInfo` | core event snapshot | Core publication `events + currentEventId` | coherent PostgreSQL core snapshot |
| Fixtures `FixtureWindow` | `eventFixtures` -> fixture service -> core fixture snapshot | Core publication `teams + fixtures` | coherent PostgreSQL core snapshot |
| Fixtures `Teams` | core team snapshot | Core publication `teams` | coherent PostgreSQL core snapshot |
| Market `GetPlayerValues` | playerValues resolver -> positive/negative query cache | `llm:gql:core-<rev>:...` | `reporting.player_value_changes`；有变化时并行补 core/stats/fixture-team |
| Competitions `EntryTournaments` | cache -> memberships -> tournament info | 5 分钟 GraphQL cache；setup 未完成时最多 15 秒 | `competition.tournament_entries` + `competition.tournaments` |
| Live `GetLiveSnapshot` | live snapshot resolver | `llm:data:fpl:live:*` + query cache | coherent PostgreSQL live snapshot |
| My FPL/Live `GetEntry`、`EntryLeagues`、`CalcLivePointsByEntry` | entry/read-model 与 live calculation | query cache/publication | `competition.*` 与 reporting read models |

### 7.3 Web proxy request-ID 证据

代表性样本：

| operation | request ID | Web total | upstreamFetch | Web 非上游部分 | 判断 |
|---|---|---:|---:|---:|---|
| `MiniHomeSupplement` | `c6fd46e8-1a47-4c22-a2f6-aecc5e23afff` | 33.85ms | 31.99ms | 1.86ms | Web 本身轻 |
| `CurrentEventInfo` | `44e29408-c74e-4d5f-9051-3b86572985b7` | 27.86ms | 25.95ms | 1.91ms | 暖上游稳定 |
| `Teams` | `b66007e0-d9e3-40cc-9b21-afb62621bebf` | 33.86ms | 32.30ms | 1.56ms | 不应在每次 Refresh 强制重取 |
| `FixtureWindow` | `6b146ee7-8dc6-489d-80ec-b53f612fe78d` | 1001.34ms | 998.42ms | 2.92ms | 明确上游尾延迟 |
| `EntryTournaments` | `0c86f6ea-1161-462e-93b0-8b6c79fc4c17` | 37.36ms | 35.17ms | 2.19ms | DB 不是 Competitions 903ms 的唯一解释 |
| `GetEntry` | `18f0a001-4689-42fb-8ba6-2235620f47b7` | 73.31ms | 71.74ms | 1.57ms | 上游占主导 |
| `EntryLeagues` | `a72cc4ef-2641-49c5-92bb-5794843f0064` | 57.67ms | 52.23ms | 5.44ms | 上游占主导 |
| `GetPlayerValues` | `dd1a1487-b927-49f2-92a6-d41ef639cb2f` | 145.16ms | 143.57ms | 1.59ms | Web 代理不是 Market 根因 |

`/api/graphql` 会回传相同 `X-Request-Id`，但不会回传 GraphQL 内部 stage timing 或 `Server-Timing`。GraphQL 已在 VPS stdout 记录 `GraphQL request timing` 与 resolver-specific stage；没有生产日志读取通道时，Web 的 `upstreamFetch` 不能继续无损拆成网络、admission、Redis、SQL、transform。

## 8. Market 合法空态与冷/热复现

### 8.1 Data 与数据库事实

- Data 的 09:25–09:35 job 从 FPL bootstrap 捕获完整 `fpl.player_market_snapshots`。
- `reporting.player_value_changes` 是基于 daily snapshots 派生的只读 view；没有第二套可写 player-values store。
- 当前 season `2627`，2026-08-14 共 3 条 baseline 行，changed rows 为 0；2026-08-13 的 8 条也全部为 baseline。
- 当前 Core publication revision 4：38 events、20 teams、584 players、11 phases、380 fixtures，`currentEventId=null`。
- 当前 Market publication revision 5，source checked at `2026-08-14T01:25:00.715Z`，context 已发布。
- `reporting.player_value_changes` 的同口径只读计划：planning `8.598ms`、execution `8.771ms`、3 rows、shared hit blocks 3148、shared read blocks 0。

因此 Market 空列表应标 `🔵 合法空态`，性能失败仍是 `🔴`；二者不能互相覆盖。

### 8.2 当前生产五次复现

测试前，精确 positive/negative query-cache key 都不存在。通过公开 Web GraphQL 代理连续读取同一天：

| 次数 | Perth client total | Web total | Web upstreamFetch | 结果 |
|---:|---:|---:|---:|---|
| 1 | 1153.95ms | 537.78ms | 536.71ms | 0 rows；cold negative miss |
| 2 | 290.76ms | 30.19ms | 28.92ms | 0 rows；negative hit |
| 3 | 246.15ms | 30.67ms | 29.61ms | 0 rows；negative hit |
| 4 | 234.87ms | 27.54ms | 26.04ms | 0 rows；negative hit |
| 5 | 222.11ms | 28.62ms | 27.47ms | 0 rows；negative hit |

随后精确 negative key 为 string、1 byte、TTL 约 237 秒，positive key 不存在，符合 5 分钟 negative-cache 契约。

这组证据支持两个独立结论：

1. 冷 miss 后的 DB/read-model/cache-write 路径会放大首次刷新；
2. 即使 Web+GraphQL 暖至约 28–30ms，Perth client 到 Web 的端到端仍约 222–291ms，必须把公网/edge 段和应用段分开看。

第一次 `536.71ms` 不能仅凭现有证据归因于 SQL：SQL 约 9ms，剩余可能包括 Vercel 到 VPS 建连、GraphQL admission/publication、Redis 与运行时抖动。缺 GraphQL 同 request-ID 日志时保持为待分段，不猜。

## 9. 已确认的根因与观测缺口

| 优先级 | 根因包 | 证据 | 当前判断 |
|---|---|---|---|
| P0 | Refresh 请求图重复/过度强刷 | Competitions、Fixtures、Overview 每次 3 network ops；两个 `CurrentEventInfo` 可在同一 Competitions 刷新窗口出现 | 先做 Mini 层 ownership/dedupe 设计 |
| P0 | Market 负结果只按 Core revision 缓存 5 分钟 | Market publication revision 已存在；每 5 分钟仍可重新走 reporting view | 评估按 Market revision 的稳定 negative cache |
| P0 | Web -> GraphQL 上游尾延迟 | FixtureWindow 998ms、GetPlayerValues 多个 280–780ms；Web 自身多为 1–3ms | 先补分段，再决定网络/运行时优化 |
| P1 | 强刷静态 Core 数据 | Fixtures 的 `Teams` 在 10 次 refresh 发 10 次网络；Core revision 未变 | revision 不变时复用 Teams |
| P1 | 主包裁剪依赖手工命令 | prune 后 25/25 通过且幂等，但 build/CI 未调用 | 固化流水线并检查闭包 |
| P1 | 主包余量有限 | 主包约 1796KB，25 页且无 subpackage | 规划非 tab 详情/数据工具分包 |
| P1 | Live Tournament 季前语义错误 | 页面可见但把合法季前空态映射成 error 文案 | 独立语义根因包，不混性能包 |
| P1 | GraphQL timing 不可由客户端/Web读取 | stage 只进 VPS stdout；无本机 SSH/log drain | 建立只读日志或安全 timing header |

## 10. 分阶段优化方案

本轮不实施。获得授权后按以下顺序，每个根因包独立提交、独立回归：

### Phase 1：P0 Refresh 请求图

1. 为 Competitions、Fixtures、My FPL Overview 画出一次 refresh 的 operation ownership。
2. 同一个 refresh navigation 内只允许一个 forced AppContext flight；页面业务请求复用它。
3. Fixtures 在 Core revision 未变时不强制重拉 Teams，只强刷用户真正要求的新 fixture window。
4. 保持真实 refresh 语义，不通过提前结束 spinner 或继续展示旧数据伪造 T6。
5. 回归目标：五个失败页各 n=10，`p95<=600ms`；同时跑 Section 和 25-page smoke。

### Phase 2：Market revisioned empty-result path

1. `GetPlayerValues` 读取 Market publication context，确认 requested date 与已完成 snapshot 的关系。
2. 对已由 Market revision 封口的正/负结果使用 revisioned key；revision 变化天然失效。
3. 未封口日期仍保留短 TTL，避免尚未完成的 daily capture 被长时间负缓存。
4. 对比 cold miss、negative hit、publication rollover 和 Redis unavailable fallback。
5. 不删除生产 key，不人工制造涨跌数据。

### Phase 3：生产上游分段

1. GraphQL 的现有 `RequestTiming` 继续写结构化日志，并提供按 request ID 的只读查询入口。
2. 对允许暴露的低基数字段考虑 `Server-Timing`，至少区分 admission、publication、apollo/resolver、response build；不得泄漏变量、身份或 SQL。
3. Web 继续记录 `upstreamFetch`，再将 GraphQL total/stages关联；client 另外记录 DNS/TLS/TTFB/response。
4. 有至少 30 个同 deployment 样本后，才评估 Vercel/VPS 地域、keep-alive 或部署架构。

### Phase 4：包体与语义

1. 将 Vant prune/closure check 固化进 build 或 CI；忘记运行必须失败，而不是悄悄膨胀。
2. 评估把非 tab 的 Explore 详情页、数据工具与 performance 页拆入 subpackage，保留 tab/root 依赖在主包。
3. 单独修复 Live Tournament 季前合法空态文案和状态，不与请求性能 PR 混合。

### Phase 5：真机与 Section 执行

1. iOS、Android 各完成 P0 C-App、W-Enter、Refresh、BG-Short。
2. 真机结果不得与 DevTools 合并；分别报告机型、OS、WeChat、网络和 p95。
3. Gate 2 关闭后，进入 G3：我的 FPL -> 实时 -> 赛事 -> 探索；每个 Section 完成检查、根因包优化、Section 回归和 25-page smoke。

## 11. Gate 2 退出检查

| 条件 | 状态 |
|---|---|
| G2-A 观测契约 | 🟢 |
| DevTools 25/25 与 P0 运行矩阵 | 🟢 |
| 身份/离线/错误/竞态/401 | 🟢 |
| 包裁剪后功能与门禁 | 🟢 |
| 生产 request-ID 到 Web proxy | 🟢 |
| resolver -> Redis/Data/PostgreSQL 静态路径 | 🟢 |
| Market 当前生产 DB/cache 实证 | 🟢 |
| GraphQL 同 request-ID 内部分段 | 🟡 日志访问缺口 |
| iOS P0 真机 | 🟡 待设备 |
| Android P0 真机 | 🟡 待设备 |
| 任何优化实现 | ⚪ 本轮未授权 |

Gate 2 当前结论为 `🟡`，不是失败，也不是“全部通过”。所有在现有权限和设备范围内能完成的验证已经执行；剩余项需要真实设备或生产日志读取通道。

## 12. 收尾状态

- Mini 代码分支 tracked clean，提交仍为 `ca8fcac...`；本轮没有新代码 diff。
- 文档只写在 `codex/miniprogram-performance-audit-docs`，不挂 `main`。
- 主 worktree 的并发页面改动、`mock-mode.ts` 和 mocks 均未修改、未暂存、未纳入证据。
- 两个生产 endpoint override 已删除并验证为空。
- 会话 token 仍存在且未过期，entry binding 仍存在；文档未记录原值。
- 离线 mock、401 mock 和 request descriptor 均已恢复。
- 无 push、merge、PR 或生产数据操作。

## 13. 后续 completion audit 补充

本节记录 G3-G5 执行前对两个黄色缺口的再次核验，不改变第 11 节结论。

### 13.1 真实设备

- `system_profiler SPUSBDataType -json` 的 iPhone/iPad/Android 常见设备名匹配数为 `0`。
- `xcrun xctrace list devices` 没有 iPhone/iPad。
- 本机没有 `adb`。
- DevTools 有“真机调试”入口，但没有已连接手机可生成 iOS/Android 样本。

因此真实设备缺口是已验证的外部条件，不是遗漏执行；不能用 iPhone 12/13 Pro 模拟 profile 代替。

### 13.2 GraphQL 生产日志与 metrics 边界

- GraphQL 仓库已有结构化 `GraphQL request timing` 和 request-ID stage log。
- 仓库本地 `.env`/`.env.deploy` 中现有 metrics token 对生产 `/metrics` 均返回 404；未输出 token，也不推断其仍是生产值。
- GitHub repository variables 能确认 VPS host/user/workdir，但 SSH agent identity 为 0，连接返回 `Permission denied (publickey)`。
- GitHub Actions secrets 只在 workflow 内可用，部署日志不能读取当前容器 stdout。

没有枚举本机私钥、提取 CI secret 或绕过访问控制。GraphQL 生产同 request-ID 内部分段继续保持 `🟡`。

### 13.3 同生产 tree 的本地只读复现

GraphQL 本地 `HEAD=7c22f66098472324c968a42e5cf247c10a4c118f`，Git tree 与生产 `bb444163416b8500efb0b7c707c8a3ca54ecae25` 完全一致。使用仓库已有合法连接启动隔离端口 `14000`，只执行 5 次 `GetPlayerValues` 和 5 次 `FixtureWindow`：

- `GetPlayerValues` client total：`2863, 1005, 605, 1079, 1035ms`；cold timing 可见 admission、publication、cache、DB 与 Apollo 分段。
- `FixtureWindow` client total：`710, 1194, 805, 801, 804ms`；并行 alias 的 stage sum 不能当 wall-clock。
- Perth 本地到远端 Redis/PostgreSQL 的 round trip 明显放大 stage；生产 Web 暖 upstream 约 28-30ms，不能用本地结果替代 VPS latency。
- 进程已 SIGINT，端口释放；GraphQL 仓库 tracked clean。

完整 Section、生产缺陷、operation 收敛和 G5 结果见 [G3-G5 Run](./miniprogram-performance-run-2026-08-14-g3-g5.md)。
