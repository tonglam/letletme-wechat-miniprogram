# 小程序全页面性能整改最终验收报告

## 执行摘要

**状态：已修复并验收。**

- 25/25 注册页面达到可见终态，无页面 timeout、console error 或 exception。
- 首页 5 次冷启动 primary visible 最大 **265ms**；P0 暖进入 p95 最大 **40ms**；P0 刷新 p95 最大 **230ms**。
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
| Mini final behavior head | 6dbb96602fd3f860337dbd97bf3c363db9484cd5 |
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
| 体验 | P0 暖进入 primary visible p95 | <=550ms | 40ms | 通过 |
| 体验 | P0 刷新 primary visible p95 | <=600ms | 230ms | 通过 |
| 体验 | 5 次首页冷启动 primary 最大值 | <=1500ms | 265ms | 通过 |
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
| 首页 | 32/40/43ms | 186/193/194ms | 8ms | 2 | 通过 |
| 价格 | 28/34/37ms | 219/230/669ms | 6ms | 1 | 通过 |
| Live 阵容 | 28/33/36ms | 29/46/46ms | --ms | 0 | 通过 |
| My FPL 阵容 | 28/34/35ms | 34/44/51ms | --ms | 0 | 通过 |
| Live 比赛 | 28/30/32ms | 178/186/201ms | 13ms | 1 | 通过 |

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

## 7. 首页冷启动原始样本

| 样本 | context ready | primary visible | complete | response→setData |
|---|---|---|---|---|
| 1 | 18ms | 260ms | 1589ms | 10ms |
| 2 | 20ms | 265ms | 2311ms | 9ms |
| 3 | 18ms | 239ms | 1887ms | 9ms |
| 4 | 17ms | 240ms | 1770ms | 9ms |
| 5 | 18ms | 241ms | 1700ms | 10ms |

Cold primary 最大 265ms，满足 ≤1.5s。Cold complete 最大 2311ms，由 optional auth/supplement 尾部决定，不属于 Fixture 首屏阻塞。

## 8. PlayerValues、Fixture、Live 与 admission

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

最终 SHA `6dbb96602fd3f860337dbd97bf3c363db9484cd5` 再次完成 25 页面 smoke：23 个物理路由一致，2 个为锁定兼容重定向（data→explore、summary/entry→my-fpl/team），语义终态 25/25，console/exception 0。

## 10. 自动检查与后端守卫

- Mini：187/187 tests；typecheck 通过；lint 通过。
- GraphQL：376 passed、4 skipped；typecheck、lint、format check 通过。
- Data：单元、集成、typecheck、lint、build 通过；migration apply/rollback 与 view contract 已验证。
- Web：production build 标准代理通过；public、requestId、429 透传通过；GraphQL route DB limiter 为 0。
- Storage：`season:unknown`、legacy GraphQL key、原始 token、Bearer、email、openid、entryId/variables telemetry 均为 0。

## 11. 限制与残余风险

1. 价格刷新 p95 230ms 通过，但有一次 669ms 长尾。它不改变 p95 结论，仍应继续按 requestId 分段观察。
2. 首页 cold complete 最大 2311ms，由 optional session/supplement 决定；primary 最大 265ms。后续优化 secondary 不得阻塞或改写 primary 口径。
3. 当前 DevTools 未绑定真实用户，登录 rich-state 依靠自动测试和后端 NO_PICKS/READY 契约覆盖。
4. 首个真实调价日仍需补 positive PlayerValues 完整 GraphQL enrichment p95。
5. 5/20/20 性能分布采自功能代码 SHA `be6d2ae`；最终 3 个 review 修复不改变 primary 请求路径。最终行为 smoke 与竞态注入基于 `6dbb96602fd3f860337dbd97bf3c363db9484cd5`。
6. 失效的 `wx.request` mock 9 个样本没有 request/page telemetry，全部丢弃，未计作通过或失败。

## 12. 下一步监控

1. 首个真实调价日复测 positive PlayerValues 端到端分段。
2. 有测试账号时补 Entry、My FPL 和 Live READY 登录 rich-state UI 样本。
3. 对价格 669ms 最大值和首页 secondary complete 建趋势观察；禁止通过延长 TTL、隐藏请求或提前关闭 loading 改写口径。

## 当前 Head Review 闭环（2026-08-13）

当前小程序行为验收 head：6dbb96602fd3f860337dbd97bf3c363db9484cd5。既有固定设备性能样本及其原始采样 SHA 保持不变，本节只记录最终 review 修复后的精确 head 回归，禁止用 DevTools 固定等待时间替换产品 p50/p95。

| 检查项 | 结果 |
|---|---|
| Codex review 发现 | 7 项：Fixture/Price/Tournament partial error、Tournament context retry、Live Entry GW transfer 隔离、My FPL season lazy cache、Live Match kickoff transition |
| 自动检查 | 187/187 tests、typecheck、lint 全部通过 |
| 定向 DevTools | 5/5：两个 partial last-good、GW 隔离、season 隔离、kickoff transition；失败 0 |
| 25 页语义遍历 | 25/25；23 个物理路由 + 2 个预期 redirect |
| 网络拓扑 | GraphQL 实际 URL 仅 http://localhost:3000/api/graphql；直连 4000 为 0；override 为空 |
| 运行时异常 | console error 0；exception 0 |

说明：初版全页重跑脚本额外要求所有页面必须拥有统一的 hasData/emptyState 字段，误报 17/25。原始逐页样本保留；按既定语义口径（预期路由、primary 节点存在、loading/refreshing 均结束）重算为 25/25。该修正只纠正临时验收器，不删除页面、不删除样本，也不改变性能门槛。
