# 小程序全页面性能整改最终验收报告

## 执行摘要

> **2026-08-14 当前审查结论：** GraphQL 已部署、小程序 `main=3aff7b25` 已合并；标准本地验收链路为 `DevTools -> 127.0.0.1:3001/api/graphql -> 127.0.0.1:4000/graphql`，首页功能链路已通过，但严格性能证据尚未闭环，报告状态保持“代码已实施，尚未验收”。

**状态：代码已实施，尚未验收。**

- 25/25 注册页面达到可见终态，无页面 timeout、console error 或 exception。
- 首页 5 次冷启动 primary visible 最大 **188ms**；P0 暖进入 p95 最大 **84ms**；P0 刷新 p95 最大 **487ms**。
- 首轮全页标准窗口产生 **10** 次网络 GraphQL operation，低于 ≤40；第二轮网络为 **0**，12 次逻辑调用缓存命中率 **100%**。
- response 到 setData callback p95 为 **11ms**；preseason Live 请求、Fixture Live acquisition、NO_PICKS Live acquisition 均为 **0**。
- 价格刷新有一次 **669ms** 最大值长尾，首页 optional secondary complete 最大 **2311ms**；两项均在残余风险中保留。

## 1. 精确版本与环境

| 组件 | SHA/版本 |
|---|---|
| Data deployed | f23e634af76031a4eb76dbcda58706a899f62f9e |
| GraphQL under test | 75de0566fb4f7cdfa4e94ede58dbcfbf79556415 |
| Web under test | 72d2d740f0862c33776085a41070515ecb5db7df |
| Mini performance baseline | be6d2ae76d0fc56b50e91e46f20395c1dcb022f2 |
| Mini final behavior head | 0b3f441d08045389ffd9cc100f240f4b81867e59 |
| WeChat DevTools | 2.01.2510290 |
| 基础库 | 3.15.2 |
| 设备 | iPhone 12/13 (Pro), iOS 10.0.1 |
| Viewport | 390×753 CSS px, DPR 3 |

标准拓扑：

```text
WeChat DevTools -> 127.0.0.1:3000/api/graphql -> 127.0.0.1:4000/graphql
```

Endpoint override 为空；没有临时 proxy、service secret 或未合并后端 SHA。GraphQL 与 Web 为本地 exact-SHA 标准进程。

## 2. 范围与计时口径

- Primary：固定主内容节点首次进入 viewport，使用 `wx.createIntersectionObserver()`。
- Complete：存在 secondary 时取 `secondaryCompleteAt`；单 section 页面取 terminal primary。
- `setData` callback：仅作为 response 后渲染分段，不替代 Native visible。
- p95：nearest-rank，仅 n≥10 计算。5 次 cold 只报告全部样本与最大值。
- 排除：550ms 静默观察窗口、Next dev compile、服务启动时间、失效自动化 mock。
- 样本：Home cold 5；每个 P0 warm 20、refresh 20；每个 P1 warm 10；全页两轮 50；错误场景各 3。

## 3. 硬门槛结果

| 类别 | 门槛 | 要求 | 实测 | 结果 |
|---|---|---|---|---|
| 页面 | 页面语义终态 | 25/25 | 25/25 | 通过 |
| 体验 | P0 暖进入 primary visible p95 | <=550ms | 84ms | 通过 |
| 体验 | P0 刷新 primary visible p95 | <=600ms | 487ms | 通过 |
| 体验 | 5 次首页冷启动 primary 最大值 | <=1500ms | 188ms | 通过 |
| 体验 | P1 暖进入 primary visible p95 | <=800ms | 73ms | 通过 |
| 体验 | P1 complete p95 | <=1800ms | 73ms | 通过 |
| 渲染 | response 到 setData callback p95 | <=50ms | 11ms | 通过 |
| 调用 | 全页面脚本网络 operation | <=40 | 10 | 通过 |
| 缓存 | 第二轮缓存命中率 | >=70% | 100% | 通过 |
| 缓存 | 第二轮网络 operation | 0 | 0 | 通过 |
| Live | preseason Live 请求 | 0 | 0 | 通过 |
| Live | Fixture Live acquisition | 0 | 0 | 通过 |
| Live | NO_PICKS Live acquisition | 0 | 0 | 通过 |
| 后端 | 请求期 Current season DB query | 0 | 0 | 通过 |
| 后端 | GraphQL limiter EVAL | 1/operation | 1/operation | 通过 |
| 后端 | Web GraphQL DB limiter query | 0 | 0 | 通过 |
| 正确性 | season:unknown 请求/缓存 | 0 | 0 | 通过 |
| 正确性 | console error / exception | 0 | 0 / 0 | 通过 |
| 安全 | telemetry 敏感字段 | 0 | 0 | 通过 |

## 4. P0 页面

| 页面 | 暖 p50/p95/max | 刷新 p50/p95/max | response→setData p95 | 刷新网络/次 | 结果 |
|---|---|---|---|---|---|
| 首页 | 59/84/87ms | 398/442/682ms | 20ms | 3 | 通过 |
| 价格 | 60/74/81ms | 267/294/319ms | 29ms | 1 | 通过 |
| Live 阵容 | 61/72/77ms | 208/368/662ms | --ms | 1 | 通过 |
| My FPL 阵容 | 62/69/72ms | 196/209/209ms | --ms | 1 | 通过 |
| Live 比赛 | 61/69/69ms | 368/487/588ms | 34ms | 2 | 通过 |

首页 refresh 每次恰好 `CoreEventFixtureSchedule=1` 和 `MiniHomeSupplement=1`；价格页每次恰好 `GetPlayerValues=1`；Live Matches preseason 每次只请求 Core Fixture；无 entry 的 Live Entry 与 My FPL Team 不发网。

## 5. P1 页面

| 页面 | 暖 p50/p95/max | complete p95 | 网络总数 | 结果 |
|---|---|---|---|---|
| Live 赛事 | 25/36/36ms | 36ms | 0 | 通过 |
| 球员目录 | 26/39/39ms | 39ms | 0 | 通过 |
| GW 总结 | 25/28/28ms | 28ms | 0 | 通过 |
| 赛事入口 | 46/59/59ms | 59ms | 0 | 通过 |
| Entry 资料 | 25/44/44ms | 44ms | 0 | 通过 |
| 探索 | 46/67/67ms | 67ms | 0 | 通过 |
| 性能页 | 24/29/29ms | 29ms | 0 | 通过 |
| Fixture 浏览 | 65/73/73ms | 73ms | 0 | 通过 |
| 球队目录 | 26/32/32ms | 32ms | 0 | 通过 |
| 球员详情 | 25/30/30ms | 30ms | 0 | 通过 |
| 球队详情 | 25/32/32ms | 32ms | 0 | 通过 |

## 6. 25 页面逐页结果

| 页面 | 首轮 primary | 第二轮 primary | 首轮网络 | 第二轮网络 | 终态 |
|---|---|---|---|---|---|
| 首页 | 260ms | 102ms | 3 | 0 | 通过 |
| 账号绑定 | 61ms | 58ms | 0 | 0 | 通过 |
| Live 首页 | 70ms | 75ms | 0 | 0 | 通过 |
| 探索 | 63ms | 87ms | 0 | 0 | 通过 |
| 球队搜索 | 81ms | 63ms | 0 | 0 | 通过 |
| 球队资料 | 74ms | 75ms | 0 | 0 | 通过 |
| Live 阵容 | 91ms | 77ms | 0 | 0 | 通过 |
| Live 比赛 | 100ms | 110ms | 0 | 0 | 通过 |
| Live 赛事 | 93ms | 76ms | 0 | 0 | 通过 |
| 球员目录 | 480ms | 117ms | 1 | 0 | 通过 |
| 球员详情 | 174ms | 111ms | 1 | 0 | 通过 |
| 球队目录 | 160ms | 91ms | 1 | 0 | 通过 |
| 球队详情 | 150ms | 90ms | 1 | 0 | 通过 |
| 价格 | 207ms | 83ms | 1 | 0 | 通过 |
| 选择率 | 75ms | 102ms | 0 | 0 | 通过 |
| My FPL 阵容 | 82ms | 84ms | 0 | 0 | 通过 |
| 赛事总结 | 87ms | 76ms | 0 | 0 | 通过 |
| GW 总结 | 937ms | 79ms | 1 | 0 | 通过 |
| My FPL 首页 | 89ms | 87ms | 0 | 0 | 通过 |
| My FPL 阵容 | 104ms | 84ms | 0 | 0 | 通过 |
| 我的联赛 | 69ms | 70ms | 0 | 0 | 通过 |
| 赛事入口 | 69ms | 92ms | 0 | 0 | 通过 |
| 探索 | 106ms | 87ms | 0 | 0 | 通过 |
| Fixture 浏览 | 187ms | 92ms | 1 | 0 | 通过 |
| 性能页 | 70ms | 67ms | 0 | 0 | 通过 |

首轮网络 operation 合计 10。首页首个原始 operation 列表受 DevTools 二次 auto 启动污染，已排除该列表并以独立冷样本重算首页标准预算；页面可见时间不受影响。第二轮网络为 0。

## 7. 首页冷启动原始样本\n\n最终 head 的冷启动 Fixture 可见样本为 n=5，p50 161ms，最大 188ms，满足 ≤1.5s。Cold complete 仍可能受 optional auth/supplement 尾部影响；该尾部不阻塞 Fixture 首屏，也不改变 primary visible 口径。\n\n## 8. PlayerValues、Fixture、Live 与 admission

| 区域 | 指标 | 实测 | 要求 | 证据 | 结果 |
|---|---|---|---|---|---|
| PlayerValues negative hit | 经 Web p95 | 203ms | <=500ms | GraphQL | 通过 |
| PlayerValues empty miss | 经 Web max | 349ms | <=1s | GraphQL | 通过 |
| PlayerValues positive DB | DB stage p95 | 1.129ms | <=350ms | Data | 通过 |
| Fixture | Core/Live acquisition | 1 / 0 | 1 / 0 | GraphQL | 通过 |
| NO_PICKS | Live acquisition | 0 | 0 | GraphQL | 通过 |
| Admission | Redis EVAL/operation | 1 | 1 | GraphQL | 通过 |
| Current season | 请求期 DB query | 0 | 0 | GraphQL | 通过 |
| Web proxy | DB limiter query | 0 | 0 | Web | 通过 |

Data positive path 保持 view 契约与权限不变，使用 bounded previous-snapshot lookup。运行 season 2627 当时没有真实 rise/fall，因此 positive DB 路径使用一次性 PostgreSQL 15 test fixture；未修改运行数据库。

## 9. 错误、stale 与竞态

| 场景 | 样本 | 最大可见/完成 | stale | 网络行为 | 结果 |
|---|---|---|---|---|---|
| 离线 + last-good | 3 | 63ms | 是 | 不发网/允许回退 | 通过 |
| 离线 + 无缓存 | 3 | 38ms | 否 | 不发网 | 通过 |
| 在线 3 秒 soft failure | 3 | 2922ms | 否 | 请求继续 | 通过 |
| 迟到成功提交 | 3 | 3227ms | 否 | revision 匹配后提交 | 通过 |
| 非法路由参数 | 3 | 101ms | 否 | 0 | 通过 |
| 真实 HTTP 404 | 3 | 24ms | 否 | 真实 Web route | 通过 |
| 真实 GraphQL AST validation | 3 | 90ms | 否 | 标准 3000 -> 4000 | 通过 |

- 已知 offline + last-good 在 63ms 内显示持续 stale 提示；无缓存在 38ms 内显示可重试错误。
- 3 秒 soft failure 在 2914–2922ms 触发，迟到成功在 revision 仍匹配时提交并清除错误。
- 真实 404 与 GraphQL AST validation 均各 3 次，明确 `stale=false`。
- 401 单次 refresh/replay、其他 4xx/validation 不 stale、partial 不写缓存由 181 项自动测试覆盖。当前 DevTools 无真实 session token，不伪装成登录态 UI 实测。

### Final review exact-head 竞态验收

| 场景 | 实测 | 结果 |
|---|---|---|
| Price hidden settle | hidden 期间成功响应仍提交，回页保留 sentinel | 通过 |
| Live Match tab race | 在途 Core 响应后保持 `finished / 已完赛` | 通过 |
| CurrentEventInfo partial | 抛错并保持 season/event/contextRevision last-good | 通过 |

最终 SHA `0b3f441d08045389ffd9cc100f240f4b81867e59` 再次完成 25 页面 smoke：23 个物理路由一致，2 个为锁定兼容重定向（data→explore、summary/entry→my-fpl/team），语义终态 25/25，console/exception 0。

## 10. 自动检查与后端守卫

- Mini：198/198 tests；typecheck 通过；lint 通过。
- GraphQL：376 passed、4 skipped；typecheck、lint、format check 通过。
- Data：单元、集成、typecheck、lint、build 通过；migration apply/rollback 与 view contract 已验证。
- Web：production build 标准代理通过；public、requestId、429 透传通过；GraphQL route DB limiter 为 0。
- Storage：`season:unknown`、legacy GraphQL key、原始 token、Bearer、email、openid、entryId/variables telemetry 均为 0。

## 11. 限制与残余风险

1. 价格刷新 p95 294ms、最大 319ms，满足门槛。它不改变 p95 结论，仍应继续按 requestId 分段观察。
2. 首页 cold complete 仍由 optional session/supplement 决定；最终 head primary visible p50 161ms、最大 188ms。后续优化 secondary 不得阻塞或改写 primary 口径。
3. 当前 DevTools 未绑定真实用户，登录 rich-state 依靠自动测试和后端 NO_PICKS/READY 契约覆盖。
4. 首个真实调价日仍需补 positive PlayerValues 完整 GraphQL enrichment p95。
5. 5/20/20 性能分布采自功能代码 SHA `be6d2ae`；最终 review 修复不改变 primary 请求路径。最终行为 smoke、刷新生命周期和网络拓扑基于 `0b3f441d08045389ffd9cc100f240f4b81867e59`。
6. 失效的 `wx.request` mock 9 个样本没有 request/page telemetry，全部丢弃，未计作通过或失败。

## 12. 下一步监控

1. 首个真实调价日复测 positive PlayerValues 端到端分段。
2. 有测试账号时补 Entry、My FPL 和 Live READY 登录 rich-state UI 样本。
3. 对价格 669ms 最大值和首页 secondary complete 建趋势观察；禁止通过延长 TTL、隐藏请求或提前关闭 loading 改写口径。

## 当前 Head Review 闭环（2026-08-13）

当前小程序行为验收 head：`0b3f441d08045389ffd9cc100f240f4b81867e59`。既有固定设备性能样本及其原始采样 SHA 保持不变；本节只记录最终 review 修复后的精确代码 head 回归。

| 检查项 | 结果 |
|---|---|
| Codex review 发现 | 共 18 项，分六轮逐项修复并以当前 head 回归 |
| 自动检查 | 198/198 tests、typecheck、lint 全部通过 |
| 定向 DevTools | 累计 15/15；partial last-good、GW/season 隔离、kickoff transition、context recovery、tracker ownership、Live Match 刷新失败保留已有数据、异步刷新 Promise 完整结算 |
| 25 页语义遍历 | 25/25；23 个物理路由 + 2 个预期 redirect |
| 网络拓扑 | Home 强刷仅产生 CoreEventFixtureSchedule + MiniHomeSupplement；URL 仅 `http://localhost:3000/api/graphql`；直连 `4000` 为 0；override 为空 |
| 运行时异常 | console error 0；exception 0 |

初版全页重跑脚本误将统一 `hasData/emptyState` 字段作为所有页面的必备终态，原始判定为 17/25。原始逐页样本保留；按既定语义口径（预期路由、primary 节点存在、loading/refreshing 均结束）重算为 25/25。最终代码 head 的再次遍历从一开始使用页面域终态，结果同样为 25/25。该修正只纠正临时验收器，不删除页面或样本，也不改变性能门槛。

最新一轮精确 SHA 验收补充：Live Match 在瞬时 `503` 下保留已有数据、退出 loading/refreshing 并进入 delayed 错误态；冷启动离线首次探测、迟到调用链 trace 绑定原始页面、stale metadata 持续提示由隔离自动测试覆盖。25 页中 23 个页面原路由稳定；`pages/data/index/index` 兼容跳转 Explore，`pages/summary/entry/entry` 缺参快速跳转 My FPL Team，两者均不发起网络请求。Home 强制刷新恰好发起 `CoreEventFixtureSchedule` 与 `MiniHomeSupplement`，均访问 `http://localhost:3000/api/graphql`，直连 `4000` 为 0。

Player Detail 显式 season 深链在清空 `globalData.season` 后重试，仍保留 `season=2526` 并成功显示 Raya；error、console error、exception 均为 0，证明 route season 被 service cache variant 正确消费。

赛事目录冷恢复在 Data Selections 与 Tournament Summary 上重同步真实 GW，同时不覆盖用户已选历史 GW；Live Match 下拉刷新 context 失败时保留已有赛程、显示 delayed 错误并恰好停止一次 spinner；offline stale fast path 零新增网络请求且触发一次统一 stale 通知。

第六轮 review 指出 `PerformancePage` 包装器无法等待未返回 Promise 的异步下拉刷新。最终修复覆盖 9 个页面：每个 handler 都返回其真实 context/load task。当前 head 在 Explore Fixtures 注入受控任务后，返回值为 thenable，context 完成前和 load 进行中均未结算，context 与 load 依次完成后约 248ms 才结算；随后 25/25 页面和 Home 强刷拓扑均重新通过。

## 2026-08-13 最终审查闭环补充

### 状态

**代码已实施，尚未验收**。

该状态基于真实 DevTools P0 样本、最终代码 head 的自动门禁、精确 Codex review 和完整 review thread 审计。报告不把一次卡住的自动化重跑当作成功样本，也不把采样脚本中的过期 SHA 常量当作代码版本。

### 版本与本地链路

| 项目 | 证据 |
|---|---|
| 完整 P0 性能样本代码 | `565687c5a0984e5f92c82528080a6d9a9b38d969` |
| 最终小程序代码 head | `67faafdf9dd20a9e71ba691420c0f7404f8b23a0` |
| GraphQL | `75de0566fb4f7cdfa4e94ede58dbcfbf79556415` |
| Web | `1ffaf9801c3e679cce4b530ef3a57c0dfd8a147c` |
| Web 监听 | `127.0.0.1:3000`，PID `86218` |
| GraphQL 监听 | `127.0.0.1:4000`，PID `69039` |
| GraphQL health | HTTP `200`；Redis、Postgres、season 均 `ok` |
| DevTools | `ws://127.0.0.1:19426` 可连接 |

### P0 DevTools 样本

条件：5 次冷启动、每个页面 20 次暖进入和 20 次用户刷新；使用真实 viewport-visible，不以 `setData` callback 代替首屏可见。

| 页面 | 暖进入 p50/p95/max | 刷新 p50/p95/max | response -> setData p95 | 网络 operation | 失败 |
|---|---:|---:|---:|---:|---:|
| Home | 59/84/87 ms | 398/442/682 ms | 20 ms | 60 | 0 |
| Price | 60/74/81 ms | 267/294/319 ms | 29 ms | 20 | 0 |
| Live Entry | 61/72/77 ms | 208/368/662 ms | 无样本 | 20 | 0 |
| Live Matches | 61/69/69 ms | 368/487/588 ms | 34 ms | 40 | 0 |
| My FPL Team | 62/69/72 ms | 196/209/209 ms | 无样本 | 20 | 0 |

冷启动 Fixture 首屏可见：`n=5`，p50 `161ms`，最大 `188ms`。全部样本 console、exception、tool failure 均为 `0`。

### 最终 head 增量验收

`880373d` 在完整样本之后增加的是 My FPL Team 页签 Retry 在连续 hide/show、primary revalidation 期间保留 force ownership 的竞态修复，不改变上述 P0 数据读取路径。最终 head 证据如下：

- `npm test`：`340/340` 通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- My FPL tab 生命周期定向测试：`6/6` 通过。
- PR #19 CI：两项 `verify` 通过。
- Codex review：精确 head `67faafdf9dd20a9e71ba691420c0f7404f8b23a0` 明确 `Didn't find any major issues`。
- GitHub review threads：当前 head 新增后待重新分页审计并 resolve。

### 口径限制

完整 P0 性能样本的实际 checkout 是 `565687c`；采样脚本内残留的 `27c1105c` 仅为过期常量，artifact 已显式记录并排除该常量作为版本证据。最终 head 的自动化完整重跑尚未重新完成；新增行为已通过定向测试、本地门禁，Codex review 和 GitHub thread resolve 待完成。



## 2026-08-14 DevTools 与线上部署复核

**当前状态：代码已实施，尚未验收。**

### 已确认

- GraphQL PR #45 已合并并部署，生产精确目标为 `bf5bb0a60fa8c0e660525302893dbd19ebed8290`，运行镜像为 `sha256:930aa877e20cf2fcf0a5962a78928b6118c4b579db5a1462c33c1668fb661e2a`。健康检查、数据库 contract、smoke 和容器健康均通过。
- 小程序 PR #20 已合并，`main` 当前为 `3a6269a2a45ab1c483513f1a6c55d5771f570073`。首页请求使用 `eventOverallResult(eventId)`，避免读取全量 event summary。
- WeChat DevTools Stable `2.01.2510290`、基础库 `3.15.2`、iPhone 12/13 Pro 模拟器验收：页面为 `pages/home/index/index`，显示 `GW1 DEADLINE`、`GW1 赛程` 和 10 条 Fixture；DevTools 错误 `0`、警告 `0`。Endpoint override 为空，链路为 `127.0.0.1:3000/api/graphql -> 127.0.0.1:4000/graphql`，未直连 `4000`。
- 生产 GraphQL 的 `MiniHomeSupplement` resolver 阶段约 `10–18ms`；生产容器内 PlayerValues SQL execution 约 `9.8ms`，当前证据不支持继续修改 Data SQL 或增加缓存。

### 尚未通过的严格门槛

- 线上 Web/Cloudflare 到 `/api/graphql` 的端到端样本为 `0.255–3.603s`，存在明显边缘长尾；这不是 GraphQL resolver 慢，但当前证据不足以宣称完整链路满足性能门槛。
- 本轮 DevTools 是功能验收和链路确认，不等于已完成计划要求的 5 次冷启动、20 次暖进入、20 次刷新、25 页面全量同一精确 head 的重新采样。
- 因此不上传微信开发版 `1.0.2`，不把报告状态改为“已修复并验收”。后续必须补齐同一部署版本的严格样本，并单独定位 Web/边缘长尾。

### 结论

代码合并、GraphQL 部署和 DevTools 首页功能链路已经通过；当前阻塞点是严格性能证据闭环，不是 4000 GraphQL 未启动，也不是 Fixture 渲染契约错误。
## 2026-08-14 严格验收复核

**状态：代码已实施，尚未验收。**

### 当前证据

- 小程序 `main` 与 `origin/main` 均为 `3aff7b25d8009a9387526724eba8b6cf677ca68d`；PR #22 已通过 CI 与精确 Codex review gate。
- 小程序自动测试：`347 pass / 0 fail`；`typecheck`、`lint` 通过。GraphQL `origin/main=66f4948f6380159621ed2dbb1c1fe68edd4922f` 测试：`394 pass / 5 skip / 0 fail`。
- GraphQL 本地标准进程监听 `127.0.0.1:4000`，`/health` 返回 `200`，Redis/Postgres/season 均为 `ok`。未签 ingress 的直接 GraphQL 请求返回预期 `401 UNTRUSTED_INGRESS`。
- 本地 Web 使用隔离的 `letletme_web_runtime` 数据库角色启动于 `127.0.0.1:3001`；`/en=200`，经 `/api/graphql` 的 fixture 与首页 supplement 均可达 `4000`，未使用 `SKIP_WEB_DATABASE_CONTRACT=1` 或临时 trusted bypass。
- 生产 Web `https://letletme.top/api/graphql` 的 `MiniHomeSupplement` 20 次样本全部 `200`：p50 `237.957ms`、p95 `385.450ms`、max `736.956ms`。生产 `CoreEventFixtureSchedule` 单次样本 `345.776ms`，返回正确 Fixture 数据。
- WeChat DevTools Stable `2.01.2510290` / 基础库 `3.15.2` / iPhone 12/13 Pro：通过 `http://localhost:3001/api/graphql` 清除缓存后启动，显示 10 条 Fixture，`MiniHomeSupplement` ready，错误 `0`，异常 `0`，且无 Live operation；该单次样本证明链路正确，但不替代完整 p95 采样。

### 尚未通过或缺失的证据

- 本地标准链路 `DevTools -> 3001 -> 4000` 已完成无缓存单次真实请求，但尚未完成同一最终 head 的完整 5 次冷启动、20 次暖进入、20 次刷新、25 页面和错误态样本；历史报告中的旧样本不升级为当前最终 head 证据。
- 批量采样器在当前 DevTools runtime 中无法稳定关联新增 navigation/performance 记录，超时等待已丢弃，未计入通过或失败。
- 生产 Web 的 `MiniHomeSupplement` p95 已低于 `650ms`，但 max `736.956ms` 表明仍有边缘/冷请求长尾；完整页面 visible/complete 仍需 DevTools 真实 Network 或 production endpoint override 成功后重采样。
- 因此不上传微信开发版 `1.0.2`，不把报告改为“已修复并验收”。下一阻塞是完整同 head DevTools 性能样本，不是 GraphQL 未启动、Web runtime role 缺失或 Fixture/MiniHomeSupplement 契约错误。

## 2026-08-14 post-merge 复核

**状态：代码已实施，尚未验收。**

### 合并与当前链路

| 项目 | 证据 |
|---|---|
| 小程序 PR | #22，Codex 精确 head clean，两个 CI `verify` 通过 |
| 小程序合并 commit | `3aff7b25d8009a9387526724eba8b6cf677ca68d` |
| 当前小程序 `main` | 与 `origin/main` 一致，`3aff7b25d8009a9387526724eba8b6cf677ca68d` |
| GraphQL | `127.0.0.1:4000`，`/health=200` |
| Web proxy | `127.0.0.1:3001/api/graphql`，当前使用隔离 `letletme_web_runtime` 数据库 |
| DevTools | Stable `2.01.2510290`，基础库 `3.15.2`，iPhone 12/13 Pro 模拟器 |
| 小程序 endpoint override | 临时设置为 `http://localhost:3001/api/graphql`，未写入代码 |

### 本次发现与修复

首页 `MiniHomeSupplement` 原 query 使用了 `eventOverallResult(eventId: $eventId)`，而当前 GraphQL schema 的 `eventOverallResult` 无参数，导致 `GRAPHQL_VALIDATION_FAILED/400`。该错误已在小程序 PR #22 修复：query 删除 `$eventId` 和字段参数；`eventId` 仍用于本地 summary 归一化和 cache variant。修复后经 `3001 -> 4000` 重放返回 `200`。

### post-merge 真实证据

| 检查项 | 结果 |
|---|---|
| GraphQL health | `200`，耗时约 `206ms` |
| `MiniHomeSupplement` 经 `3001` | `200`，耗时约 `629ms`；之后连续样本 `213–231ms` |
| DevTools 页面 | `pages/home/index/index` |
| Fixture | `10` 条，`loading=false` |
| Supplement | `supplementLoading=false`，summary/price error 为空 |
| Live operation | `0` |
| DevTools exception | `0` |
| 小程序自动检查 | `347/347`，typecheck、lint 通过 |

单次 post-merge DevTools trace：`CurrentEventInfo=217ms`、`CoreEventFixtureSchedule=171ms`、`MiniHomeSupplement=748ms`；primary viewport visible 约 `309ms`，secondary complete 约 `1033ms`。该样本证明当前链路和页面功能正确，但不满足 n≥10 的 p95 统计要求。

### 未通过的严格门槛

- 本次自动化冷/暖/刷新批量采样器未能稳定产生与当前 navigation 对应的完整记录，已停止；无效等待未计入样本。
- 尚未取得当前 `main=3aff7b25` 的完整 `5` 次冷启动、`20` 次暖进入、`20` 次刷新、`25` 页面及错误态证据。
- 旧报告中 `3000` 链路和旧 SHA 的样本仍只作为历史记录，不得升级为当前 `3001`/`3aff7b25` 的验收证据。
- 因此不上传微信开发版 `1.0.2`，不把报告状态改为“已修复并验收”。

当前阻塞是严格性能样本采集器与 DevTools runtime 的关联不稳定，不是 GraphQL `4000` 未启动，也不是 `MiniHomeSupplement` 契约错误。

## 2026-08-14 post-merge local-chain update

- Mini Program `main` is `835899447c2b5ead72340b57f50bf1108b2d33ac`, merged through PR #24.
- `develop` defaults now use `http://localhost:3001/api/graphql` and `http://localhost:3001/api/miniprogram`; the develop storage override remains available for temporary local endpoints.
- The accepted local topology is `WeChat DevTools -> 127.0.0.1:3001/api/graphql -> 127.0.0.1:4000/graphql`. Port `3000` is not part of the current local acceptance chain.
- At the time of this update, `4000/health` returned `200` with Redis, PostgreSQL, and season checks healthy; Web `3001/en` returned `200`.
- A real DevTools run through the `3001` override produced successful `CurrentEventInfo`, `CoreEventFixtureSchedule`, and `MiniHomeSupplement` network operations; the home page rendered 10 Fixture rows and recorded native viewport visibility. The measured sample was not promoted to the final p95 gate because it was not the complete required cold/warm/refresh sample set.
- Clearing persistent storage alone is insufficient to prove a network request when the DevTools page process retains L1 memory. Memory-hit runs are therefore excluded from the network-chain evidence.
- The report status remains **代码已实施，尚未验收**. It must not be changed to **已修复并验收** until the required cold, warm, refresh, error-state, and full-page sample gates are complete.
