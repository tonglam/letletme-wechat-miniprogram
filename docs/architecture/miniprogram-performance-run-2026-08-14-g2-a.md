# 小程序性能 Run：2026-08-14 G2-A 全局观测契约

> 状态：G2-A 已实现并通过本地门禁、受影响页面回归和 DevTools 25×2 smoke。
>
> 本记录是独立运行证据，不覆盖 G0-G1 原始基线，也不代表 G2-B、G2-C、Section 优化或真机验收已经开始。

## 1. 结论先行

- G2-A 已关闭 G1 的四个全局观测缺口：性能页 `NaNms`、自动化 `reLaunch` 冷热误归类、My FPL Team 合法空态缺 T6、`secondaryCompleteAt` 与最终可见完成语义混用。
- 代码分支为 `codex/miniprogram-performance-g2-observability`，基于 `origin/main@12acbb2e33d3ba94960443dc3a4d95315f5b67f0`；验收内容与提交 `ca8fcac430411823f0c659de81f0938c089b824e` 一致。
- 受影响页定向回归通过：Home、My FPL Team、Legacy Entry Summary、Performance 均有当前运行证据；My FPL Team 的 GW1 合法空态取得数值 T6。
- 同一 DevTools 会话的 25×2 遍历通过：两轮均为 25/25 主内容证据、timeout 0、run-scoped console error 0、exception 0、GraphQL 失败 0、429 0。
- 50 个注册入口样本因两个 legacy 入口各产生“兼容页 + 最终页”记录，共写入 54 条 page performance record；其中 `cold-launch=1`、`warm-enter=53`、T6 缺失 0、`completeAt < primaryViewportVisibleAt` 违反数 0。
- 性能页最终显示 `首屏主内容 778ms`，没有 `NaN`。分数仍为 `63/100`，但现在由有限数值参与计算；这不表示页面性能因本次观测修复而提升。
- 本轮没有修改业务查询、缓存 TTL、auth、AppContext、Web、GraphQL、resolver、Redis、Data 或数据库，也没有进入 G2-B/G2-C。

## 2. Run 元数据与边界

| 字段 | 本次值 |
|---|---|
| Run | `2026-08-14-g2-a` |
| Mini 基线 | `12acbb2e33d3ba94960443dc3a4d95315f5b67f0` |
| Mini 验收提交 | `ca8fcac430411823f0c659de81f0938c089b824e` |
| 代码分支 | `codex/miniprogram-performance-g2-observability` |
| 文档分支 | `codex/miniprogram-performance-audit-docs` |
| 小程序版本 | `develop` |
| DevTools | Stable `2.01.2510290` |
| 基础库 SDK | `3.15.2` |
| 模拟设备 | iPhone 12/13 Pro profile，`390 x 753`，DPR `3` |
| 网络 | DevTools `WiFi` |
| 身份 | 已绑定 profile；原始 entry ID、token、openid、email 不进入文档 |
| 客户端缓存动作 | 保留身份；正式遍历前只清 `gql:*` 与 `perf:v1` |
| 采集静默窗口 | 每次 route `reLaunch` 后等待 `2200ms` |
| 生产 GraphQL | `https://www.letletme.top/api/graphql` |
| 生产 Mini Web API | `https://www.letletme.top/api/miniprogram` |

G0-G1 已冻结的 Web、GraphQL 和 Data 部署版本没有因 G2-A 发生代码变更。本 Run 的目标是验证 Mini 观测契约，不把当前网络耗时扩大解释为服务端根因，也没有重新执行 RSC、Web proxy、resolver、Redis 或 SQL 分段。

临时生产 endpoint override 在采样结束后均已删除并验证为空；`perf:v1` 证据和绑定状态保留。隔离 worktree 使用 Git 忽略的本机 DevTools 私有配置完成编译，该文件未加入提交。

## 3. G2-A 契约

本次不是“调快一个页面”，而是先让后续数字可比较。契约如下：

1. 只有同一小程序 JS 进程中第一个请求 `cold-launch` 的页面可以保留该标签；后续页面即使由自动化 `reLaunch` 创建，也归为 `warm-enter`。
2. 所有展示、百分位和评分输入必须是有限、非负的毫秒值；`NaN`、`Infinity`、负数和缺失值显示为 `--`，且 `none` 指标不参加平均分。
3. 首屏指标优先使用 page tracker 的 `routeStartedAt -> primaryViewportVisibleAt`；仅在没有有效 tracker 样本时回退微信原生 first render。
4. `completeAt` 表示用户可见最终完成边界，必须满足：

   ```text
   completeAt = max(primaryViewportVisibleAt, secondaryCompleteAt ?? primaryViewportVisibleAt)
   completeAt >= primaryViewportVisibleAt
   ```

5. My FPL Team 的有数据、无 entry、当前 GW 合法空、错误和 context 错误都必须在所属 tracker 的 terminal `setData` callback 后记录主提交并观察主内容；旧异步请求不能写到新页面 tracker。

## 4. 实现范围

| 根因包 | 实现 |
|---|---|
| duration 有效性 | 新增纯函数统一过滤、取整、格式化和 nearest-rank；性能页不再直接格式化原生 `duration` |
| 首屏来源 | 性能页优先汇总第一个有效 cold page 的 T6，并明确标成“首屏主内容” |
| 评分 | 缺失指标生成 `rating=none` 的 `--` 行，并从分数分母排除 |
| 冷热语义 | page tracker 在进程内只允许一次 cold claim，其余请求 cold 的 tracker 改写为 warm |
| 完成语义 | page record 新增 `completeAt`，在 T6 或 secondary 更新时重新取最大值 |
| Team 空态 T6 | terminal commit 统一进入带 tracker 所有权校验的 `markPrimaryCommit` |
| 回归保护 | 覆盖 `NaN/Infinity/负数`、percentile 过滤、一次 cold、T6/secondary 顺序、Team 各 terminal 分支 |

明确未做：延长 TTL、减少 live 请求、改变 GraphQL operation、提前结束 loading、隐藏错误、修改页面文案、修改后端或数据库。

## 5. 受影响页面定向回归

| 页面/入口 | 当前证据 | 结论 |
|---|---|---|
| Home | 干净进程只有 1 条 cold record；T6 `761ms`，complete `2100ms`，顺序成立 | cold claim 与最终完成字段生效 |
| My FPL Team | GW1 合法 `event` 空态，selector 存在，T6 `364ms`，complete `364ms` | G1 的空态 T6 缺口已补齐 |
| Legacy Entry Summary | 最终进入 My FPL Team；兼容页 T6 `80ms`、目标页 T6 `61ms`，两条均为 warm | 重定向不再制造第二个 cold |
| Performance | 显示 `首屏主内容 761ms`；页面 data 与主内容 WXML 都不含 `NaN` | 展示来源和有限值过滤生效 |

定向回归完成后重新清 `gql:*`、清性能记录并重启 JS 进程，下面 25×2 是独立的干净样本，不与定向回归混算。

## 6. 25×2 总体结果

| 指标 | 第一轮 C-Data | 第二轮同会话 cache-warm | 判断 |
|---|---:|---:|---|
| 注册入口 | 25/25 | 25/25 | 完整 |
| 实际最终 route | 23 | 23 | 两个兼容入口按预期重定向 |
| selector + 数值 T6 | 25/25 | 25/25 | G1 的 2 个缺失已消除 |
| timeout | 0 | 0 | 通过 |
| run-scoped console error / exception | 0 / 0 | 0 / 0 | 通过 |
| GraphQL failed / 429 | 0 / 0 | 0 / 0 | 通过 |
| 逻辑 operation | 26 | 25 | 与 G1 首轮/二轮口径一致 |
| network operation | 18 | 4 | 第二轮仍受既有 freshness/TTL 影响 |
| memory/storage/in-flight | 8 | 21 | — |
| cache hit ratio | 31% | 84% | 超过默认 70% 目标 |
| 网络耗时 | p50 `300ms`；p95 `1174ms`，n=18 | `314 / 323 / 327 / 354ms`，n=4；不报告 p95 | 第二轮样本不足 10 |
| 渲染 hash | 基线 | 24/25 相同 | Performance 因累计指标变化而预期不同 |

第二轮 4 个网络 operation 为：Home `GetEntry 327ms`、My FPL Team `GetLiveSnapshot 323ms`、Live Entry `CalcLivePointsByEntry 354ms`、Legacy Entry 目标页 `GetLiveSnapshot 314ms`。G2-A 没有改缓存策略；相对 G1 多出的 Home `GetEntry` 是本次时间窗内的现有 freshness/TTL 行为，不能从单次模拟器样本判断为观测修复导致的回归。

## 7. 25 页面逐页证据

`T6` 为 `routeStartedAt -> primaryViewportVisibleAt`；`complete` 为新增的最终完成字段。所有值单位为毫秒。

| # | 页面 | T6 首次 / 二次 | complete 首次 / 二次 | network 首次 -> 二次 | 当前终态 |
|---:|---|---:|---:|---:|---|
| 1 | Home | `778 / 108` | `1021 / 395` | `4 -> 1` | 主赛程与绑定入口显示 |
| 2 | 账号关联 | `57 / 55` | `57 / 55` | `0 -> 0` | 静态入口稳定 |
| 3 | Entry 搜索 | `84 / 57` | `84 / 57` | `0 -> 0` | 搜索初始态稳定 |
| 4 | Entry 资料 | `111 / 70` | `111 / 70` | `0 -> 0` | 已绑定资料显示 |
| 5 | My FPL 总览 | `69 / 67` | `69 / 67` | `2 -> 0` | 当前 phase/league 上下文显示 |
| 6 | My FPL Team | `271 / 106` | `271 / 106` | `2 -> 1` | GW1 合法待就绪空态；T6 已补齐 |
| 7 | My FPL Leagues | `139 / 130` | `139 / 130` | `0 -> 0` | league 列表显示 |
| 8 | Live 首页 | `88 / 62` | `88 / 62` | `0 -> 0` | 三个实时入口显示 |
| 9 | Live Entry | `319 / 395` | `319 / 395` | `1 -> 1` | 当前季前语义终态 |
| 10 | Live Tournament | `114 / 102` | `114 / 102` | `0 -> 0` | 既有季前空态仍映射为 error 文案；不属于 G2-A |
| 11 | Live Match | `101 / 83` | `101 / 83` | `0 -> 0` | 当前无实时比赛的合法空态 |
| 12 | Competitions | `1229 / 336` | `1229 / 336` | `1 -> 0` | 赛事列表显示 |
| 13 | Tournament Summary | `97 / 82` | `97 / 82` | `0 -> 0` | 无当前赛事上下文的引导态 |
| 14 | Explore 首页 | `90 / 106` | `90 / 106` | `0 -> 0` | 菜单顺序稳定 |
| 15 | Gameweek | `535 / 91` | `535 / 91` | `1 -> 0` | 摘要内容显示 |
| 16 | Fixtures | `524 / 94` | `524 / 94` | `2 -> 0` | 20 队赛程窗口显示 |
| 17 | Market | `499 / 122` | `499 / 122` | `1 -> 0` | 当前无变价的合法空态 |
| 18 | Selections | `73 / 91` | `73 / 91` | `0 -> 0` | 当前无赛事的合法空态 |
| 19 | Players | `457 / 82` | `457 / 82` | `1 -> 0` | `Saka` 搜索结果显示 |
| 20 | Player Detail | `257 / 84` | `257 / 84` | `1 -> 0` | 有效 code 与显式 season 详情显示 |
| 21 | Teams | `84 / 69` | `84 / 69` | `0 -> 0` | 20 队显示 |
| 22 | Team Detail | `283 / 66` | `283 / 66` | `1 -> 0` | 有效 teamId 与显式 season 详情显示 |
| 23 | Legacy Data | `83 / 85` | `83 / 85` | `0 -> 0` | 正确重定向 Explore |
| 24 | Legacy Entry | `82 / 73` | `82 / 73` | `1 -> 1` | 正确重定向 My FPL Team；目标空态有 T6 |
| 25 | Performance | `100 / 84` | `100 / 84` | `0 -> 0` | 有限值汇总，不新增业务请求 |

## 8. G1 -> G2-A 同口径对照

| G1 缺口 | G1 证据 | G2-A 证据 | 状态 |
|---|---|---|---|
| 原生 first render 非有限值 | 性能页显示 `首次渲染 NaNms`，`63/100` 不可信 | 显示 `首屏主内容 778ms`；无 `NaN`；`none` 不参与评分 | 已关闭 |
| reLaunch 冷热误归类 | 第一轮和第二轮都被标成 cold | 54 records 中 cold `1`、warm `53` | 已关闭 |
| My FPL Team 合法空态缺 T6 | Team 与 legacy 入口两轮均为 `—` | Team `271 / 106ms`；legacy 目标 `82 / 73ms` | 已关闭 |
| complete 语义不成立 | Home 暖态 secondary `70ms` 早于 T6 `173ms`，没有最终完成字段 | 54/54 records 满足 `completeAt >= T6`；单测覆盖 secondary 先于 T6 和后于 T6 两种顺序 | 已关闭 |

G2-A 后的性能页仍为 `63/100` 是数值巧合：G1 分数包含无效输入，G2-A 分数使用有限的 T6。本文只宣布“评分输入可解释”，不宣布业务体验变快。

## 9. 验证门禁

| 门禁 | 结果 |
|---|---|
| ESLint | 通过 |
| TypeScript `--noEmit` | 通过 |
| 全量测试 | 354/354 通过 |
| style drift | clean |
| package dry-run | 通过 |
| `npm audit --audit-level=moderate` | 0 vulnerabilities |
| `git diff --check` | 通过 |
| DevTools 编译 / Problems | SDK `3.15.2`；0 problems |
| 受影响页定向回归 | 4/4 通过 |
| 25×2 smoke | 50/50 注册入口样本通过 |

## 10. 未执行范围与下一步

本 Run 只关闭 G2-A。以下状态保持未开始：

- G2-B、G2-C 的全局启动/auth/AppContext、GraphQL transport/cache、request ID/server timing 等根因包；
- iOS/Android 真机 C-App n=5、真机 W-Enter、p50/max；
- Refresh、BG-Short、offline、stale、401 replay、快速导航和筛选竞态；
- Live Tournament 季前合法空态的页面状态映射/文案修复；
- Home、Live Entry、Competitions 等页面的数值优化；
- RSC -> Web GraphQL proxy -> resolver -> Redis/Data/PostgreSQL 的同 request ID 纵向分段；
- 任何 Section 的实现、回归、push 或 merge。

进入下一根因包前，先 review G2-A 提交并明确是否合入目标分支。未合入前，不应在 G2-A 分支上叠加 G2-B/C 或业务 Section 优化。

## 11. 收尾状态

- 代码提交只在 `codex/miniprogram-performance-g2-observability`；没有 push、merge 或改动 `main`。
- 本记录只在 `codex/miniprogram-performance-audit-docs`；不挂在 `main`，不会覆盖 G0-G1 原始基线。
- 主 worktree 的 HEAD 仍为 `12acbb2e33d3ba94960443dc3a4d95315f5b67f0`。最终复核时存在与本轮隔离分支无关的 account/home/live tracked 修改及未跟踪 mock 配置/目录；这些内容没有读取为性能依据、没有修改、没有暂存，也不纳入 G2-A 提交。
- 临时生产 endpoint override 已删除；绑定状态与本地 `perf:v1` 原始证据保留。
