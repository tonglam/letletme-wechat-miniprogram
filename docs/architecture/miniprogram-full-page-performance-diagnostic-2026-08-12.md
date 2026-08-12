# 小程序全页面性能整改最终验收报告

## 执行摘要

**日期：** 2026-08-13  
**状态：** **已修复并验收**  
**范围：** 25/25 注册页面、AppContext、缓存与请求归因、P0/P1 页面生命周期、PlayerValues、Fixture、Live NO_PICKS、错误与离线恢复  
**拓扑：** WeChat DevTools → `127.0.0.1:3000/api/graphql` → `127.0.0.1:4000/graphql`

本轮不是通过延长 TTL 或提前关闭 loading 绕过性能问题。Data view 改为 bounded previous-row 访问，GraphQL 保持一个 read pool 连接，Mini 页面按 primary/secondary/lazy 分层，并使用真实 viewport intersection 作为首屏完成点。

- 25 页面两轮遍历为 **50/50 primary 可见**、0 timeout、0 console error、0 exception。
- 首轮页面窗口只有 **6** 个网络 GraphQL operation；包含启动期共 **9** 个，低于 40；第二轮为 **0**，命中率 **100%**。
- P0 暖进入最高 p95 **50ms**；P0 刷新最高 p95 **394ms**。
- 5 次冷启动 Home primary visible 为 **122, 123, 126, 128, 130ms**，最大 **130ms**。
- 价格修复后 20 次刷新 p95 **221ms**；修复前 1435ms 异常不再进入最终门槛统计。
- 真实上游卡死时，UI 在 **2909–2917ms** 进入可交互软失败，底层仍保留标准 15s transport timeout。

## 1. 精确版本与环境

| 组件 | 精确 SHA / 版本 |
| --- | --- |
| Data 已部署 | f23e634af76031a4eb76dbcda58706a899f62f9e |
| GraphQL 已部署 | 75de0566fb4f7cdfa4e94ede58dbcfbf79556415 |
| Web main | 72d2d740f0862c33776085a41070515ecb5db7df |
| Mini 功能分支 | bc5ec2e1f280b9845858f32fb0e7735a7c11cf43 |
| Mini acceptance 等价提交 | 99affbc0e86439ce0299fcd51dc378f2ca376327 |
| WeChat DevTools | 2.01.2510290 |
| 基础库 | 3.15.2 |
| 设备/视口 | iPhone 12/13 (Pro), 390×753 CSS px, DPR 3 |

- endpoint override 已清除；Network 只走 Web proxy，不直连 4000。
- Web 使用标准 `letletme_web_runtime` 数据库角色启动 production build。
- GraphQL 使用精确部署 SHA；`/health=200`，Redis/PostgreSQL/season 均为 ok。
- Redis 为标准远端实例，观测单阶段 RTT 约 50–55ms；GraphQL PostgreSQL 为标准远端 pooler。
- positive price benchmark 使用一次性 PostgreSQL 15 `_test` 数据库，完成后已删除；Redis DB 9/10 已清空。

## 2. 计时口径

- Primary visible：固定 `#perf-primary-content` 或 `#perf-primary-fixtures` 首次进入 viewport，由 `IntersectionObserver` 记录。
- Complete：存在 `secondaryCompleteAt` 时使用该点；无 deferred/secondary 网络工作的 terminal 页面，以 primary visible 作为 complete。
- `setData` callback 只用于 response-to-commit 分段，不替代 Native visible。
- p95 使用 nearest-rank，只有 n≥10 才计算。
- 550ms runner 静默窗口、Next dev compile、诊断查询 validation error、服务启动时间不计入用户可感知时间。

## 3. 硬门槛结果

| 门槛 | 要求 | 实测 | 结果 |
| --- | --- | --- | --- |
| 25 个注册页面语义终态 | 25/25 | 25/25 | 通过 |
| P0 暖进入 primary visible p95 | ≤550ms | 50ms | 通过 |
| P0 刷新 primary visible p95 | ≤600ms | 394ms | 通过 |
| 冷启动 Home primary visible 最大值 | ≤1.5s | 130ms | 通过 |
| P1 暖进入 primary visible p95 | ≤800ms | 56ms | 通过 |
| P1 complete p95 | ≤1.8s | 56ms | 通过 |
| response 到 setData callback p95 | ≤50ms | 16ms | 通过 |
| offline + last-good 可见 | ≤300ms | 40ms | 通过 |
| offline 无缓存错误态 | ≤300ms | 33ms | 通过 |
| 在线异常 UI soft failure | ≤3s | 2909–2917ms | 通过 |
| 全页遍历网络 operations | ≤40 | 9（页面窗口 6） | 通过 |
| 第二轮 cache hit | ≥70% | 100% | 通过 |
| 产品 GraphQL 网络 operation 成功率 | 100% | 100% | 通过 |
| fresh context 跨页 CurrentEventInfo 网络 | 0 | 0 | 通过 |
| preseason Live 请求 | 0 | 0 | 通过 |
| Fixture Live acquisition | 0 | 0 | 通过 |
| NO_PICKS Live acquisition | 0 | 0 | 通过 |
| season:unknown 请求 | 0 | 0 | 通过 |
| 无限 loading / console exception | 0 | 0 / 0 | 通过 |
| telemetry 敏感字段 | 0 | 0 | 通过 |

## 4. P0 页面

| 页面 | 暖进入 p50/p95/max | 刷新 p50/p95/max | response→setData p95 | 刷新网络 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 首页 | 27/30/31ms | 378/394/400ms | 8ms | 40 | 通过 |
| 价格 | 45/48/49ms | 212/221/691ms | 6ms | 20 | 通过 |
| Live 阵容 | 45/50/52ms | 30/31/32ms | --ms | 0 | 通过 |
| Live 比赛 | 45/47/47ms | 370/382/387ms | 16ms | 20 | 通过 |
| My FPL 阵容 | 46/48/49ms | 30/39/44ms | --ms | 0 | 通过 |

首页刷新 primary p95 为 394ms；secondary complete p95 为 823ms。首次样本 complete 最大 1849ms 不阻塞 Fixture primary。价格页修复后 operation p95 为 188ms，response-to-setData p95 为 6ms。

## 5. P1 页面

| 页面 | n | 暖进入 p50/p95/max | complete p95 | 网络 | 结果 |
| --- | --- | --- | --- | --- | --- |
| Live 赛事 | 10 | 46/53/53ms | 53ms | 0 | 通过 |
| 球员目录 | 10 | 46/47/47ms | 47ms | 0 | 通过 |
| GW 总结 | 10 | 45/51/51ms | 51ms | 0 | 通过 |
| 赛事入口 | 10 | 35/54/54ms | 54ms | 0 | 通过 |
| 球队资料 | 10 | 46/52/52ms | 52ms | 0 | 通过 |
| 探索 | 10 | 50/56/56ms | 56ms | 0 | 通过 |
| 性能页 | 10 | 45/51/51ms | 51ms | 0 | 通过 |
| 球员详情 | 10 | 44/50/50ms | 50ms | 0 | 通过 |
| 球队详情 | 10 | 45/52/52ms | 52ms | 0 | 通过 |

这些样本均为 fresh-cache 暖进入。各页在本次环境中没有 deferred 网络工作，因此 terminal primary 同时是 complete；没有用缺失的 `secondaryCompleteAt` 伪造另一个时间点。

## 6. 25 页面逐页结果

| 页面 | 首轮 primary | 第二轮 primary | 首轮网络 | 第二轮网络 | 终态 |
| --- | --- | --- | --- | --- | --- |
| 首页 | 104ms | 106ms | 0 | 0 | 通过 |
| 账号绑定 | 59ms | 58ms | 0 | 0 | 通过 |
| Live 首页 | 68ms | 69ms | 0 | 0 | 通过 |
| 数据兼容入口 | 60ms | 64ms | 0 | 0 | 通过 |
| 球队搜索 | 59ms | 61ms | 0 | 0 | 通过 |
| 球队资料 | 87ms | 96ms | 0 | 0 | 通过 |
| Live 阵容 | 87ms | 109ms | 0 | 0 | 通过 |
| Live 比赛 | 96ms | 93ms | 0 | 0 | 通过 |
| Live 赛事 | 89ms | 79ms | 0 | 0 | 通过 |
| 球员目录 | 544ms | 123ms | 1 | 0 | 通过 |
| 球员详情 | 168ms | 90ms | 1 | 0 | 通过 |
| 球队目录 | 151ms | 73ms | 1 | 0 | 通过 |
| 球队详情 | 68ms | 68ms | 0 | 0 | 通过 |
| 价格 | 212ms | 71ms | 1 | 0 | 通过 |
| 选择率 | 77ms | 108ms | 0 | 0 | 通过 |
| Entry 总结兼容入口 | 84ms | 91ms | 0 | 0 | 通过 |
| 赛事总结 | 73ms | 105ms | 0 | 0 | 通过 |
| GW 总结 | 810ms | 78ms | 1 | 0 | 通过 |
| My FPL 首页 | 67ms | 101ms | 0 | 0 | 通过 |
| My FPL 阵容 | 113ms | 124ms | 0 | 0 | 通过 |
| 我的联赛 | 69ms | 70ms | 0 | 0 | 通过 |
| 赛事入口 | 66ms | 71ms | 0 | 0 | 通过 |
| 探索 | 76ms | 84ms | 0 | 0 | 通过 |
| Fixture 浏览 | 186ms | 114ms | 1 | 0 | 通过 |
| 性能页 | 85ms | 93ms | 0 | 0 | 通过 |

兼容入口 `pages/data/index/index` 正常重定向到 Explore；`pages/summary/entry/entry` 正常重定向到 My FPL Team。它们仍按注册页面计入 25/25。

## 7. PlayerValues

| 场景 | 样本 | 结果 | 门槛 | 判定 |
| --- | --- | --- | --- | --- |
| negative hit 经 Web | 10 | p50 191ms / p95 203ms / max 203ms | p95 ≤500ms | 通过 |
| empty miss 经 Web | 3 | p50 347ms / max 349ms | ≤1.0s | 通过 |
| positive DB path | 10 | p50 0.232ms / p95 1.129ms / max 1.129ms | DB p95 ≤350ms | 通过 |

- empty miss trace：GraphQL 总时长 310–338ms，`databaseChanges` 103–116ms，enrichment 0，合法空结果才写 negative marker。
- negative hit：DB 查询 0，只有 admission、publication 和 cache read。
- 当前生产 season `2627` 只有 start snapshots，没有 rise/fall。本轮没有向运行数据库造数；positive path 使用 Data 仓库现有 fixture 在一次性 `_test` 数据库生成 10 个日期，10/10 返回 rise 且上一条价格正确。
- Data 标准集成契约：migration 0000/0001 应用成功，1 个 integration test、43 个断言通过。

## 8. Fixture、Live 与 admission

- Fixture Web warm p95：115.97ms，低于 450ms；一次 operation 只有一次 Core acquisition。
- `eventFixtures` trace 中 Live acquisition 为 0，不读取 Live publication。
- 标准代理 `NO_PICKS` 返回 200、`availability=NO_PICKS`、`snapshot=null`；trace 只有 `entryLive.picks=166ms`，没有 `entryLive.liveSnapshot`、aggregate 或 enrichment。
- 每个 operation 只有一个 `admission` 阶段，对应一次 Redis EVAL。
- Current season 启动读取一次，请求期 season DB 查询 0；health 不重新查询 season。
- Web GraphQL route 数据库 limiter 查询 0；无 Cookie public/Mini 路径不做 Better Auth lookup。

## 9. 错误、stale 与竞态

| 场景 | 样本 | 实测 | 结果 |
| --- | --- | --- | --- |
| 真实断网 + last-good | 3 | 最大 40ms，持续 stale 时间提示 | 通过 |
| 真实断网 + 无缓存 | 3 | 最大 33ms，内联错误 + retry | 通过 |
| 在线上游卡死 | 3 | 2909–2917ms soft failure | 通过 |
| 迟到响应 | 自动测试 | 仅 page active 且 revision 匹配时提交 | 通过 |
| partial data | 自动测试 | 分区渲染且不写缓存 | 通过 |
| contract/validation stale | 自动测试 | 禁止 fallback | 通过 |

卡死测试通过 `SIGSTOP` 暂停精确 SHA 的 GraphQL 进程，Web 仍保留标准 15s upstream timeout。首次实测暴露价格页没有接入 soft timeout；修复后复测原始 route 指标为 2909、2917、2917ms。GraphQL 恢复后 health 和 proxy 均回到 200。

## 10. 自动检查

| 仓库 | 检查 | 结果 |
| --- | --- | --- |
| Mini | npm test | 169/169 通过 |
| Mini | typecheck / lint | 通过 / 通过 |
| GraphQL | PR #36 exact-head CI + tests | 376 通过，4 skip；typecheck/lint/format 通过 |
| Data | disposable PG15 migration + integration | 0000/0001；43 assertions 通过 |
| Web | production build + runtime startup | 通过；root/proxy 200 |

## 11. 残余风险与后续观察

1. 首个真实调价日需要补一组线上 positive GraphQL enrichment p95；当前只能证明 Data view 正向路径和 GraphQL empty/negative 路径。
2. DevTools 当前未绑定真实用户；已登录 rich-state 由自动测试及只读 NO_PICKS 后端链路覆盖，本轮没有保存或上传 token。
3. 首页 primary 已稳定在 130ms 内，但冷启动 secondary complete 最大 1798ms；后续 secondary 优化不得回退 Fixture primary。

上述风险均不违反本轮硬门槛，也没有通过修改 TTL、删样本、改变计时口径或隐藏请求处理。
