# 小程序性能 Run：2026-08-14 G3-G5 Section 深查、operation 收敛与最终回归

> 状态：四个 Section 的只读检查和 G4 operation 收敛已完成；G5 DevTools 到达/终态遍历为 25/25，但语义正确为 24/25。已确认 Players 无命中查询的 GraphQL 正确性缺陷，以及 Live Tournament 把合法季前空态显示为网络错误的 Mini 语义缺陷。

> 本轮没有业务代码优化授权，因此没有修改 Mini、Web、GraphQL、Data 或数据库。G3 的“检查”完成，不等于“优化并关闭”；后续已按用户决定跳过真机，并通过任务专用 SSH 完成生产 GraphQL 单请求分段。

---

## 1. 结论先行

顶层流程仍为 G0 到 G5 共六个 Gate，不因 G2-A/B/C 或本文件的章节数量而增加：

| Gate | 本次结论 | 状态 |
|---|---|---|
| G0 版本与环境冻结 | 已冻结精确 Mini 代码、DevTools、身份、season/revision 与生产 endpoint | 🟢 |
| G1 25 页面轻量基线 | 已在前序 Run 冻结 25×2 基线 | 🟢 |
| G2 全局共性问题 | DevTools、身份、韧性、包体完成；生产 Web/GraphQL 30/30 分段完成；真机由用户明确跳过 | 🟢（检查）/ 🔴（性能发现） |
| G3 按 Section 深查与优化 | 我的 FPL、实时、赛事、探索检查完成；发现 2 个正确性/语义缺陷；优化未授权 | 🟡 |
| G4 跨 Section operation 收敛 | 61 条 scoped API record 收敛为 17 个 operation，并完成共享面与失败根因归类 | 🟢（诊断） |
| G5 全页面最终回归 | 25/25 到达终态、console/exception/本轮 API failure 为 0；Live Tournament 语义不通过 | 🔴（24/25 语义） |

本轮最重要的判断：

1. 不应逐页立即优化，也不应等待所有页面深查完才一次性大改。当前证据继续支持“全页轻基线 -> 全局问题 -> 每个 Section 全查 -> 按共享根因包实现 -> Section/25 页回归”。
2. `miniprogram/config/mock-mode.ts` 与 mocks 不在本轮根因路径，未作为阻塞项或生产证据。
3. Market 当前无涨跌、My FPL Team 当前 GW 无球队数据、Live Entry 无 picks、赛事总结/趋势无 POINTS_RACES 数据，均已根据当前季前数据或页面契约分类为合法空态。
4. Players 的任意正常无命中搜索不是合法空态：生产 GraphQL 会报 `could not determine data type of parameter $9`，根因已定位到 count fallback 的非连续 SQL 参数。
5. Live Tournament 的“当前赛季暂无实时比赛周”是合法季前状态，但页面把它放进“加载未完成/检查网络”的 error 组件，属于 Mini 语义错误。
6. G5 的单轮 warm smoke 只证明当前终态和单次耗时，不生成 p95，也不替代 G2 已冻结的 n=10/n=20 分布。

## 2. Run 元数据与证据边界

| 字段 | 本次值 |
|---|---|
| Run | `2026-08-14-g3-g5` |
| Mini 提交 | `ca8fcac430411823f0c659de81f0938c089b824e` |
| Mini 分支 | `codex/miniprogram-performance-g2-observability`，tracked clean |
| 文档分支 | `codex/miniprogram-performance-audit-docs` |
| 主 worktree | 用户/并发任务工作区；本轮未修改、暂存或清理 |
| DevTools | Stable `2.01.2510290` |
| 基础库/模拟设备 | SDK `3.15.2`；iPhone 12/13 Pro profile；`390 x 753`；DPR `3`；Wi-Fi |
| 身份 | 已绑定 rich-state；不记录 token 或 entry 原值 |
| Web 生产请求部署 | `dpl_CzW2dzkzzPwXrhhKiM5YqbE8kVVb`；Git SHA `e3480e0dcdadb05b994f3f28335a6d609df271da`；region `sin1` |
| G2 生产闭环 Web | `dpl_5eDGHmMTrNppjj2A4LPi1MAMQSEJ`；Git `0e943401ac144d6f3c70a24c37a895aa09f40f3b`；proxy blob 与本 Run 相同 |
| GraphQL 生产 | `bb444163416b8500efb0b7c707c8a3ca54ecae25` |
| GraphQL 本地复现 | `HEAD=7c22f66098472324c968a42e5cf247c10a4c118f`；与生产 SHA 的 Git tree 完全一致 |
| Data 生产 | `2c25cbc5d751dd3fd976d2123cdf45a6b4a420af` |
| 数据上下文 | season `2627`；Core revision `4`；Market revision `5`；current event 为空，处于季前 |
| Mini endpoint | 运行时临时指向生产 Web `/api/graphql` 与 `/api/miniprogram`；只写 DevTools storage，不写代码 |

证据边界：

- G3/G5 来自微信 DevTools 模拟器，不冒充 iOS 或 Android 真机。
- G5 是一次干净 JS 进程中的串行 warm-enter smoke；所有 T6 都是 `n=1`，不报告 p95。
- Web 分段来自只读 Vercel Runtime Logs；后续生产闭环使用任务专用 SSH 按精确 request ID 只读 GraphQL container stdout。
- GraphQL 本地分段复现使用与生产完全相同的 Git tree 和仓库已有连接，但从 Perth 本机访问远端 Redis/PostgreSQL；它证明代码路径和 timing 机制，不代表 VPS 生产延迟。
- 所有数据库探针只读；没有删除 Redis key、修改数据库、写入生产配置、部署或发布。

## 3. G3：四个 Section 只读深查

### 3.1 我的 FPL

| 页面/状态 | 当前运行证据 | 结论 |
|---|---|---|
| 总览 | `READY / PRESEASON`；16 个联赛；T6 `187ms`；`EntryEventResult + EntryLeagues + GetEntry` 共 3 次 network | rich-state 可解释；Refresh p95 问题沿用 G2 根因包 |
| 球队 | 当前 event 1 合法 `event` 空态；support 可用；T6 `388ms`；`EntryEventResult + GetLiveSnapshot` | 🔵 季前合法空态 |
| 球队页签 | 转会页签首次触发 `EntryHistory + EntryTransferHistory`；chips/history/squad 复用已有 payload | 页签请求 ownership 可解释 |
| 联赛 | 16 项；T6 `73ms`；`EntryLeagues` memory hit | 🟢 |
| 联赛搜索 | 无命中与恢复 16 项均不发网络请求 | 客户端过滤正确 |

当前 season 尚无可用历史 GW，因此无法构造本赛季历史球队 rich-state。该状态标记为数据条件不可测，不伪造 mock 或旧赛季结果。

### 3.2 实时

| 页面/状态 | 当前运行证据 | 结论 |
|---|---|---|
| Live 首页 | 3 张入口卡；无业务请求 | 🟢 |
| Live 球队 | `NO_PICKS`；无错误；G3 T6 `553ms`；`CalcLivePointsByEntry` 1 次 network | 🔵 当前季前合法状态 |
| Live 比赛 | `not_start` 显示 10 场 scheduled；`playing/not_start/finished` 切换不发请求 | 状态筛选在客户端完成 |
| Live 竞赛 | `displayState=unavailable`，文案为“加载未完成/检查网络”，实际原因是 current event 不存在 | 🔴 合法季前状态被错误映射为网络错误 |

Live Tournament 的 T6 不是假阳性：automator 对 custom-component host 的 `offsetWidth/offsetHeight` 返回 `0 x 0`，但微信原生 `createSelectorQuery().boundingClientRect()` 得到 `366 x 233`，且组件文本完整可读。缺陷是状态语义，不是 viewport 埋点。

### 3.3 赛事

| 页面/状态 | 当前运行证据 | 结论 |
|---|---|---|
| 我的赛事 | 1 个赛事；format hint `KNOCKOUT`；lifecycle `ACTIVE`；11 个参与者；T6 `684ms` | 🟢 列表 rich-state |
| 赛事跳转 | 点击列表项进入 Live Tournament；已保存选择可恢复 | 🟢 |
| 赛事总结 | 当前页面只接收 `POINTS_RACES`；现有唯一 `KNOCKOUT` 被按契约排除 | 🔵 合法 scope 空态 |

当前数据不能覆盖 POINTS_RACES 的总结 rich-state。不能把 KNOCKOUT 强塞入该页面来制造“有数据”。

### 3.4 探索

真实卡片顺序已再次确认：

```text
本轮 -> 赛程 -> 市场 -> 趋势 -> 球员 -> 球队
```

| 页面/交互 | 当前运行证据 | 结论 |
|---|---|---|
| Explore 搜索 | 搜索 `Saka` 进入 Players，得到 2 项 | 🟢 |
| Gameweek | event 1；summary 有 2 个统计项；四个页签切换不发请求 | 🟢；部分季前集合为空 |
| Fixtures | 20 支球队；3 -> 5 horizon 时 `FixtureWindow` network `264ms`；回到 3 horizon 命中 memory | 🟢 |
| Market 日榜 | 当前日合法无涨跌；G3 T6 `648ms`；`GetPlayerValues` network | 🔵 Data/DB 已证明合法空态 |
| Market 球员模式 | 21 个球队筛选项；`Saka` 2 项；`GetPlayerValueHistory` network `458ms`；历史 0 项 | 🔵 季前无价格变化 |
| 趋势/Selections | 只接收 `POINTS_RACES`；当前没有可选赛事 | 🔵 合法 scope 空态 |
| Players | 首页 `50 / 584`，加载更多到 100；`Saka` 2 项 | 🟢 |
| Player Detail | 显式 `season=2627` 的有效球员请求成功；T6 可见；`Player` network `663ms` | 🟢 |
| Teams | 20 项；Team Detail 显式 season 请求成功并命中 cache | 🟢 |
| Player/Team 非法参数 | 快速进入安全空态，不发网络请求 | 🟢 |
| Players 正常无命中 | `qqqqqqqqqqqq` 触发 GraphQL internal error，页面显示“数据暂时无法加载” | 🔴 不是合法空态，见第 5 节 |

## 4. 测试工具与样本污染纠正

### 4.1 Home selector

G5 通用 helper 查找默认 `#perf-primary-content` 时在 Home 得到 absent，但 Home 的显式性能 selector 本来就是 `#perf-primary-fixtures`。重新用正确 selector 验证为 `366 x 617`、10 条 fixture、loading=false。

结论：这是通用采集 helper 没有读取页面专用 selector，不是 Home T6 或页面渲染缺陷。

### 4.2 custom-component host 尺寸

| 页面 | automator `size()` | 微信 selector rect | 文本/数据 |
|---|---:|---:|---|
| Entry Profile 的 `entry-card` | `0 x 0` | `366 x 116` | 已绑定球队资料可见 |
| Live Tournament 的 `app-error-state` | `0 x 0` | `366 x 233` | 错误组件完整可见 |

结论：`miniprogram-automator` 的 custom-element `offsetWidth/offsetHeight` 不能用来否定微信 IntersectionObserver；后续 harness 对 custom component 必须改用微信 `createSelectorQuery().boundingClientRect()`。

### 4.3 transport mock 的 in-flight 污染

一次 transport mock 留下永不 settle 的 Promise 后，有效 Player Detail 两次超过 15 秒仍 loading，logical 1、network 0。完整重启小程序 JS 进程、保留相同 endpoint/storage 后，同一有效球员以 network `663ms` 成功。

这组超时样本已作废，不计为产品失败。当前 `inFlightRequests` 只会在 Promise resolve/reject 后删除；永不 settle 的测试 mock 会污染该 JS 进程。后续规则：

1. mock 必须 settle；
2. 每个 transport fault 场景后完整重启 JS 进程；
3. 不能只恢复 `wx.request` descriptor 后继续采正常样本；
4. 污染前后样本不能合并。

## 5. 已确认生产缺陷：Players 无命中 count fallback

### 5.1 同 request-ID 生产复现

请求：public `PlayersForPicker`，search=`qqqqqqqqqqqq`，request ID `g4-players-zero-20260814-01`。

| 层 | 结果 |
|---|---|
| Perth client -> Web | HTTP `200`；总计 `639ms`；响应 echo 相同 request ID |
| GraphQL body | `playersForPicker=null`；`INTERNAL_SERVER_ERROR`；`could not determine data type of parameter $9` |
| Vercel Web runtime | `totalMs=313.12`；`upstreamFetch=311.24`；`responseBodyOk=false` |
| 单样本未归属 client/edge/connection 段 | 约 `326ms`；仅为差值，不扩展为分布结论 |

### 5.2 根因

生产 GraphQL tree 的 `src/domains/players/repository.ts`：

1. 正常分页 SQL 使用 `$9 LIMIT`、`$10 OFFSET`、`$11 pinnedCoreRevision`；
2. 返回 0 行时 window count 取不到，进入独立 count fallback；
3. fallback 截掉最终分页 SELECT，但仍传入 11 个参数；CTE 继续引用 `$11`，而 `$9/$10` 不再出现在 SQL；
4. PostgreSQL 无法推断未使用的 `$9` 类型，因此合法 0 行查询变成 resolver error。

现有 repository tests 覆盖正向分页、排序与 ownership bands，但没有 DB-backed 的正常无命中回归。

待授权修复应采用独立、连续编号的 count SQL/参数表，并新增断言：

```text
items=[]
totalCount=0
nextCursor=null
GraphQL errors=[]
```

本轮未修改 GraphQL 代码。

## 6. G4：跨 Section operation 收敛

从 G3 后半段、交互复验和 G5 同一 perf buffer 中取得 61 条 API record：20 次 network、33 次 memory、8 次 storage、2 次失败；共 18 个 request ID，收敛为 17 个 operation。该 buffer 包含第 5 节故意触发的两次 Players 无命中失败。

| Operation | 页面面 | 总调用 | network | cache | failure | 判断 |
|---|---:|---:|---:|---:|---:|---|
| `EntryTournaments` | 3 | 7 | 2 | 5 | 0 | Competitions、Summary、Selections 共享，禁止逐页重复深挖 |
| `GetEntry` | 3 | 6 | 3 | 3 | 0 | Home、Profile、My FPL 共用；刷新 ownership 仍需收敛 |
| `Teams` | 3 | 8 | 0 | 8 | 0 | 本窗口完全复用；G2 强刷静态 Core 的问题仍在 refresh 场景 |
| `CoreEventFixtureSchedule` | 2 | 4 | 0 | 4 | 0 | Home 与 Live Match 共享 |
| `EntryEventResult` | 2 | 3 | 2 | 1 | 0 | Overview 与 Team 共享 |
| `EntryLeagues` | 2 | 2 | 1 | 1 | 0 | Overview 与 Leagues 共享 |
| `FixtureWindow` | 2 | 5 | 2 | 3 | 0 | horizon 改变才需要新 window |
| `PlayersForPicker` | 2 | 10 | 3 | 7 | 2 | 共享 picker；两次失败均为无命中 count 缺陷 |
| `GetPlayerValues` | 1 | 3 | 1 | 2 | 0 | Market 当前空结果可缓存，但 G2 revisioned negative path 尚待设计 |
| 其他 8 个 operation | 1/项 | 13 | 6 | 7 | 0 | 单页面业务 operation，无证据支持合并 |

operation 层结论：

- 页面数量不能等同于后端根因数量；17 个 operation 中已有 8 个具备跨 surface 复用证据。
- `EntryTournaments`、`Teams`、Fixture/Core、Entry 系列应按 operation ownership 优化一次，再回归所有消费者。
- 当前唯一真实 API failure 是 `PlayersForPicker` 无命中缺陷；Market/Live/赛事多个空集合不能算失败。
- G5 单轮另计 21 次 logical operation、8 条实际 network API record、13 个 operation name；tracker network count 为 7，是 redirect/终态归属边界差异，不能把两者强行改成相同数字。

## 7. GraphQL 当前可观测边界补强

### 7.1 生产可见层

Vercel Web 已能按自定义 request ID 输出 `bodyRead -> headerBuild -> upstreamFetch -> responseBuild`。第 5 节样本说明 313.12ms 中 311.24ms 在 Web -> GraphQL upstream，不在 Web body/response 处理。

GraphQL 生产 VPS 的结构化 `GraphQL request timing` 只进 stdout。初次只检查空 `ssh-agent`，因此错误地把它记为不可达；后续识别本机已有的任务专用 identity 后，已合法连接生产 VPS，并且只筛选本 Run request-ID 前缀对应的 container logs。文档不记录私钥内容、query variables、token、SQL 或内部地址。

生产闭环共取得 30/30 成功关联：`GetPlayerValues`、`FixtureWindow`、`PlayersForPicker` 各 10 条。完整原始序列、Web/GraphQL 分位数、冷/热 stage 和 10 条 `principalAdmission` 429 边界样本见 [G2 生产分段闭环](./miniprogram-performance-run-2026-08-14-g2-production-closure.md)。

### 7.2 同生产 tree 的本地只读复现

使用与生产 SHA tree 完全一致的 GraphQL 代码、仓库已有合法连接和只读 query 启动 `127.0.0.1:14000`。服务识别 season `2627`、dataset revision `4`；结束后 SIGINT，端口释放，仓库 tracked clean。

| Operation | client totals | 结构化 timing 观察 |
|---|---|---|
| `GetPlayerValues` ×5 | `2863, 1005, 605, 1079, 1035ms` | cold total `2844ms`；pre-auth `311ms`、principal `243ms`、publication `1460ms`、cache read `221ms`、DB changes `301ms`、cache write `283ms`、Apollo `820ms` |
| `FixtureWindow` ×5 | `710, 1194, 805, 801, 804ms` | Apollo `209-314ms`；5 个并行 alias 的 core-acquisition stage 相加为 `1041-1568ms`，不能当 wall-clock |

这组结果证明 Perth 到远端 Redis/PostgreSQL 的每次 round trip 可增加约 140-300ms，也证明当前 stage timing 可解释。生产 Web 暖 upstream 曾为约 28-30ms，说明 VPS locality 明显不同；不得拿本地总时长替代生产 GraphQL latency。

## 8. G5：25 页面最终 DevTools smoke

### 8.1 汇总

| 指标 | 结果 |
|---|---:|
| 请求的注册路由 | 25/25 |
| 最终物理路由 | 23；另有 2 个预期兼容重定向 |
| 到达稳定终态 | 25/25 |
| 语义正确 | 24/25；Live Tournament 不通过 |
| console error / automation exception | `0 / 0` |
| 当前 G5 API failure | `0` |
| timeout | `0` |
| 单样本 T6 范围 | `60-466ms`；不计算 p95 |
| 单轮 logical / actual network records | `21 / 8` |

### 8.2 逐页结果

| # | 页面/最终路由 | T6 | logical/network | 当前终态 |
|---:|---|---:|---:|---|
| 1 | Home | 163ms | 3/0 | 🟢 10 条 fixture；专用 primary selector 已复验 |
| 2 | Account Link | 65ms | 0/0 | 🟢 |
| 3 | Entry Search | 60ms | 0/0 | 🟢 |
| 4 | Entry Profile | 94ms | 1/0 | 🟢 缺 query 时按契约使用当前绑定 entry |
| 5 | My FPL Overview | 163ms | 3/3 | 🟢 READY/PRESEASON、16 联赛 |
| 6 | My FPL Team | 355ms | 2/2 | 🔵 当前 event 合法空态 |
| 7 | My FPL Leagues | 124ms | 1/0 | 🟢 16 项 |
| 8 | Live Home | 72ms | 0/0 | 🟢 3 个入口 |
| 9 | Live Entry | 339ms | 1/1 | 🔵 NO_PICKS |
| 10 | Live Tournament | 92ms | 0/0 | 🔴 季前合法状态被映射为网络错误 |
| 11 | Live Match | 91ms | 1/0 | 🔵 当前保存的 playing tab 为空；not_start 已验证 10 场 |
| 12 | Competitions | 466ms | 1/1 | 🟢 1 项 |
| 13 | Tournament Summary | 101ms | 1/0 | 🔵 当前无 POINTS_RACES |
| 14 | Explore | 73ms | 0/0 | 🟢 卡片顺序正确 |
| 15 | Gameweek | 104ms | 1/0 | 🟢 |
| 16 | Fixtures | 126ms | 2/0 | 🟢 20 队 |
| 17 | Market | 71ms | 1/0 | 🔵 当前日合法无涨跌 |
| 18 | Selections | 97ms | 1/0 | 🔵 当前无 POINTS_RACES |
| 19 | Players | 188ms | 1/0 | 🟢 默认目录 50/584；无命中交互缺陷另列 |
| 20 | Player Detail（缺参） | 95ms | 0/0 | 🔵 安全空态 |
| 21 | Teams | 98ms | 1/0 | 🟢 20 项 |
| 22 | Team Detail（缺参） | 75ms | 0/0 | 🔵 安全空态 |
| 23 | Legacy Data -> Explore | 74ms | 0/0 | 🟢 预期重定向 |
| 24 | Legacy Entry Summary -> Team | 73ms | 0/0 | 🟢 预期重定向 |
| 25 | Performance | 66ms | 0/0 | 🟢 有数据、4 个指标、26 个 API group |

G5 的最大单次 T6 为 Competitions `466ms`。这不是 p95 通过声明；Refresh 是否通过仍以 G2-B/C 的 n=10 结果为准，其中 Overview、Live Entry、Competitions、Fixtures、Market 仍失败。

## 9. 根因排序

| 优先级 | 根因包 | 证据 | 责任仓库 |
|---|---|---|---|
| P0 | Players 无命中 count SQL 参数断层 | 生产 request ID、Web log、GraphQL exact tree；所有正常无命中搜索报 internal error | GraphQL |
| P0 | P0 Refresh 请求 ownership/重复强刷 | G2 的五个失败页；Competitions/Fixtures/Overview 多 operation 与重复 context flight | Mini |
| P1 观测 | `PlayersForPicker` 缺 repository/SQL 子 stage | 生产首样本 GraphQL `325.33ms`、Apollo `320.28ms`；30/30 VPS log 可读但不能继续拆 picker execute | GraphQL |
| P1 | Live Tournament 季前语义 | current event 不存在时直接写 `error`，WXML 显示网络型 error state | Mini |
| P1 | Market revisioned negative result | 合法空结果仍受短 TTL 驱动重复 reporting 查询 | GraphQL/Data |
| P1 | 主包裁剪未进入 build/CI、无 subpackage | prune 后门禁通过；主包仍约 1796KB、25 页同包 | Mini |
| P1 测试 | transport mock 可留下永不 settle 的 in-flight Promise | 污染样本经完整 JS restart 消失 | Mini test harness |

## 10. 分阶段优化方案（待授权）

以下是实现 Wave，不是新增 Gate。每个根因包独立提交、独立回滚，不能合成“全站性能优化”大 PR。

### Wave A：先恢复正确性

1. GraphQL 为 Players count fallback 建独立连续参数 SQL；补 0 行、分页边界与 filter 组合测试。
2. Mini 将 Live Tournament 的 `currentEvent=0` 映射为明确的 season/event 合法空态，而不是 network error。
3. 定向回归 Players 正常/无命中/分页/筛选，以及 Live Tournament 季前/有 event/真实错误三类状态。
4. 跑两个 Section 和 25 页 smoke；目标是语义 25/25、console/exception/API failure 0。

### Wave B：收敛 Refresh 请求图

1. 每个 refresh navigation 只拥有一个 forced AppContext flight。
2. `EntryTournaments`、Entry 系列、Fixture/Core 分别定义 owner/consumer，避免页面各自强刷共享依赖。
3. Core revision 未变化时不强拉 `Teams`；horizon 变化只拉新的 `FixtureWindow`。
4. 五个失败页同环境各 n=10，目标 Refresh T6 p95 `<=600ms`；不能通过提前结束 spinner 伪造。

### Wave C：Market revisioned empty path

1. 以 Market publication revision 和 snapshot 完成状态区分稳定空结果与尚未封口日期。
2. 已封口正/负结果使用 revisioned key；未封口日期保留短 TTL。
3. 回归 cold miss、negative hit、revision rollover、Redis unavailable，不写假价格数据。

### Wave D：生产上游可观测性

1. 30 个同 deployment 的 client、Vercel Web、GraphQL request ID 已完成对齐；该基线直接复用于后续修改前后对照。
2. 为 `PlayersForPicker` 增加 repository/SQL 低基数 stage；继续不记录变量、身份、SQL 或 token。
3. 跨时段扩大样本后再讨论 region、keep-alive 或部署架构；继续分开报告公网/edge、Web proxy、GraphQL 与 DB。

### Wave E：包体与测试门禁

1. 把 Vant prune/closure check 固化进 build/CI。
2. 评估非 tab 的详情/数据工具/performance 页面进入 subpackage；tab/root 依赖保留主包。
3. transport fault runner 强制 mock settle 或重启 JS process，阻止 in-flight 污染进入正常样本。

### Wave F：Section 与真机最终验收

1. 每个 Wave 按 L1 定向 -> L2 Section -> L3 25 页 smoke 回归。
2. iOS、Android 分别补 P0 C-App、W-Enter、Refresh、BG-Short；记录机型、OS、WeChat、网络和独立 p95。
3. 真实设备结果不得与 DevTools 合并；GraphQL 生产 stage 不得由本地 Perth 复现冒充。

## 11. 当前退出状态

| 条件 | 状态 |
|---|---|
| 四个 Section 页面与主要状态完成检查 | 🟢 |
| 合法空态有当前数据/契约依据 | 🟢 |
| 页面 -> operation 映射去重 | 🟢 |
| G4 根因排序和待授权方案 | 🟢 |
| 25/25 路由到达稳定终态 | 🟢 |
| 25/25 语义正确 | 🔴 24/25；Live Tournament |
| Players 正常无命中交互 | 🔴 GraphQL count fallback |
| iOS P0 真机 | ⚪ 用户明确本轮跳过；无通过声明 |
| Android P0 真机 | ⚪ 用户明确本轮跳过；无通过声明 |
| GraphQL 生产同 request-ID 内部分段 | 🟢 30/30；见 G2 生产闭环 Run |
| 任何优化实现 | ⚪ 本轮未授权 |

当前结论为 `🟢 检查闭环 / 🔴 产品未全绿`。真机由用户明确排除，生产日志缺口已关闭；Players 无命中、Live Tournament 语义和五个 Refresh 失败仍需单独实现授权。

运行现场已恢复：页面回到赛事列表，Live Match 筛选恢复为 `not_start`，两个临时生产 endpoint override 均验证为空；session、entry binding 与原赛事选择仍存在且未记录原值。DevTools 保持打开，没有上传、预览、发布或生产数据操作。

## 12. 外部门禁闭环记录

本节最初是外部门禁续跑卡。2026-08-14 后续已使用现有 SSH 能力完成生产日志矩阵；真实设备则由用户明确选择本轮跳过。以下保留原执行口径，避免将跳过改写成“推断通过”。

### 12.1 最后一次可达通道复核

| 通道 | 当前事实 | 结论 |
|---|---|---|
| 生产 GraphQL HTTP 响应 | 当前 public query 为 HTTP 200，只返回 `x-request-id`、`x-vercel-id` 和 cache header；`Server-Timing` 为空 | 不能从客户端取得 GraphQL 内部分段 |
| GraphQL metrics | `/metrics` 由 token 保护；仓库现有本地 token 对生产地址返回 404 | 本机不能证明当前生产 token 或 scrape route |
| VPS | 空 `ssh-agent` 不是完整能力判断；本机任务专用 identity 可合法连接 | 已只读查询当前 GraphQL container logs；未触发部署、未绕过访问控制 |
| iOS | USB/mobile 匹配 0；`xctrace` 无 iPhone/iPad；`devicectl` 与 `idevice_id` 不可用 | 当前无可运行真机 |
| Android | USB/mobile 匹配 0；`adb` 不可用 | 当前无可运行真机 |

### 12.2 iOS/Android 真机矩阵（本轮用户跳过）

本轮不执行，也不声明通过。如果未来恢复该门禁，每个平台单独建立 Run ID，不合并 iOS、Android 或 DevTools 分布。开始前记录：

- Mini 精确 SHA、trial/release 版本；
- 机型、OS、WeChat 版本、电量/低电量模式；
- Wi-Fi/蜂窝与网络位置；
- 登录/entry binding 状态；
- season、GW、Core/Market/Live revision；
- 测试开始/结束时间与是否发生 context/revision 变化。

两个平台各执行：

| Profile | 页面与样本 | 通过条件 |
|---|---|---|
| C-App | Home 5 次完全结束后启动，保留普通 storage | 报告全部 T6、p50、max；默认 max `<=1500ms` |
| W-Enter | 9 个 P0 页面各 `n>=10` | 每页 T6 p95 `<=550ms`；runtime error/timeout/429 为 0 |
| Refresh | 除 Explore N/A 外的 8 个 P0 页面各 `n>=10` | 每页 T6 p95 `<=600ms`；真实刷新语义完整 |
| BG-Short | 9 个 P0 页面进入后台后短时间返回 | route/选择/已有数据保持；无重复风暴；必要 freshness 请求可解释 |
| 身份/韧性 | 游客+本地关注、登录未绑定、登录已绑定；offline last-good/no-cache | 终态与 DevTools 契约一致；不泄漏 token/entry 原值 |

9 个 P0 页面为：Home、My FPL Overview、My FPL Team、Live Entry、Live Match、Competitions、Explore、Fixtures、Market。采样结束后分别报告逻辑 operation、实际 network、cache source、request ID 与 T6/complete；不能把 DevTools 或另一个平台的数据补进不足的 `n`。

### 12.3 生产 GraphQL 同 request-ID 矩阵

原续跑卡已执行完成：

1. 冻结 Web `0e943401...` / `dpl_5eDGHmMTrNppjj2A4LPi1MAMQSEJ`、GraphQL `bb444163...` / image `sha256:958da088...`、season `2627`、Core revision 4、Market revision 5。
2. `GetPlayerValues`、`FixtureWindow`、正常有结果的 `PlayersForPicker` 各取得 10 条成功样本。
3. client、Web `graphql_proxy_timing`、GraphQL `GraphQL request timing` 按 request ID `30/30` 一一匹配，敏感字段为 0。
4. 各层 p50、nearest-rank p95、max、冷/热 cache path 和 GraphQL stage 已独立呈现；并行 alias stage sum 未当 wall-clock。
5. 额外 10 条 429 已定位为 GraphQL complexity-weighted `principalAdmission`，单列且未混入成功分布。

完整证据见 [G2 生产分段闭环](./miniprogram-performance-run-2026-08-14-g2-production-closure.md)。剩余观测缺口只收窄到 `PlayersForPicker` repository/SQL 子 stage，不阻塞本次纵向检查闭环。

### 12.4 完成判定

“检查闭环”和“产品验收全绿”是两个不同状态。当前任务是只读排查，不能把修代码扩进完成条件。

只有以下同时成立，才能把本次**检查**标记为完整：

- iOS 与 Android 的完整矩阵分别执行，或由用户明确记录本轮排除；本轮采用后者，不能写成真机通过；
- 生产 GraphQL 30/30 同 request-ID 分段完成，或新增同等强度的只读证据；
- 最终 25/25 页面和关键交互按当时精确版本重新记录终态；
- 所有通过、失败、合法空态和观测缺口均有当前证据，没有用 DevTools/本地复现冒充真机/VPS；
- 文档记录精确版本、设备、数据 revision、原始样本和根因排序。

上述检查条件现已在用户明确范围内满足：设备为显式跳过，生产分段为 30/30，最终页面/交互、版本和红色发现均已记录。因此本次检查可以关闭；下面的产品全绿条件仍未满足。

只有以下同时成立，才能进一步把**产品验收**从 `🔴/🟡` 改为全绿：

- Players 无命中和 Live Tournament 两个正确性/语义缺陷已在独立授权变更中修复并完成 L1-L3 回归；
- 五个 Refresh 失败页在目标真机上达到门槛，或由事先批准的新 SLO 明确替代；
- iOS 与 Android 的完整矩阵分别通过；
- 最终 25/25 语义、console/exception/timeout/429 与敏感 telemetry 门禁通过；
- 文档记录精确部署版本，并保留所有未通过项，不通过改阈值或隐藏状态收口。
