# 小程序性能 Run：2026-08-14 G0-G1

> Run ID：`2026-08-14-G0-G1-01`
>
> 状态：G0 与 G1 已冻结；G2 未开始。
>
> 执行边界：只读诊断。没有修改 Mini、Web、GraphQL、Data 业务代码，没有清理生产 Redis 或修改生产数据。
>
> 文档分支：`codex/miniprogram-performance-audit-docs`。本记录不合并到 `main`，除非后续得到明确授权。

## 1. 结论先行

- G0 已完成：Mini、Web、GraphQL、Data 的代码与部署版本均已冻结；有效 G1 样本统一落在 Web 生产部署 `bf9d481d1f13954d6126c4cd06356df6c04f1804` 之后。
- G1 已完成：25/25 注册路由完成首次 C-Data/进程冷缓存遍历和同一 DevTools 会话第二次缓存态遍历，共 50 个页面样本。
- 两轮均为：timeout `0`、run-scoped console error `0`、exception `0`、GraphQL 失败 `0`、429 `0`、主内容证据 `25/25`。
- 第一轮：逻辑 operation `26`，网络 operation `18`，memory `8`，命中率 `31%`；网络样本 `n=18`，p50 `323ms`，p95 `1335ms`。
- 第二轮：逻辑 operation `25`，网络 operation `3`，memory `22`，命中率 `88%`；网络样本只有 `n=3`，因此不报告 p95，三个样本为 `290ms / 323ms / 1460ms`。
- 首页首次样本主内容可见 `2188ms`，同会话第二次为 `173ms`。首次最慢段是上下文/网络等待，不是 response 后的 setData：`response -> setData = 15ms`，`setData -> visible = 35ms`。
- 当前没有需要中断排查并立即修复的红灯；有 5 个黄灯：Home 单样本与真机证据不足、My FPL Team 空态缺 T6 数值、Live Entry 暖态仍有 `1460ms` live 请求、Live Tournament 把合法季前空态包装成网络错误、性能页出现 `NaNms` 导致 `63/100` 分数不可作为验收依据。

这份结果只代表 Gate 1 横截面，不代表真机、Refresh、BG-Short、离线、错误重试或全部身份/数据状态已经验收。

## 2. G0：冻结版本与环境

### 2.1 版本与部署

| 层 | 本次有效基线 | 当前运行证据 | 本地工作树处理 |
|---|---|---|---|
| Mini | `12acbb2e33d3ba94960443dc3a4d95315f5b67f0` | [`CI 31766948422`](https://github.com/tonglam/letletme-wechat-miniprogram/actions/runs/31766948422) 成功；本地 `main == origin/main`，工作树干净 | 作为小程序运行代码 |
| Web | `bf9d481d1f13954d6126c4cd06356df6c04f1804` | [`CI 31778972978`](https://github.com/tonglam/letletme-web/actions/runs/31778972978) 成功；Vercel `dpl_36uG6EbpsDC1B5cwJBb68XY8ubbH`，READY，生产别名包含 `www.letletme.top` | 用户现有 Web 工作树有未提交改动且分支落后；完全排除，不读取其 HEAD 作为生产基线 |
| GraphQL | `bb444163416b8500efb0b7c707c8a3ca54ecae25` | [`CI 31777471905`](https://github.com/tonglam/letletme-graphql/actions/runs/31777471905) 与 [`Deploy 31777549843`](https://github.com/tonglam/letletme-graphql/actions/runs/31777549843) 成功 | 本地其他分支只读，不修改 |
| Data | `2c25cbc5d751dd3fd976d2123cdf45a6b4a420af` | [`CI 31777017405`](https://github.com/tonglam/letletme_data/actions/runs/31777017405) 与 [`Deploy 31777139128`](https://github.com/tonglam/letletme_data/actions/runs/31777139128) 成功 | 本地其他分支只读，不修改 |

Data 部署 SHA 已冻结，但当前公开响应没有提供独立 dataset/publication revision；因此不能把 Data SHA 等同于精确的数据集 revision。这是后续纵向追踪的观测缺口。

### 2.2 生产切换边界

G0 初始预检时，生产 Web 仍为 `a82bc5584997e4ef1c578fd7f119237fd73c2e3d`，Vercel deployment 为 `dpl_C4XqKKv8fqaPBCCmfPmgdZgRhpfZ`。检查期间 `main` 前进，生产别名切换到新部署：

| 事件 | 时间（AWST） | SHA / deployment | 处理 |
|---|---|---|---|
| 初始 G0 预检开始 | `2026-08-14 15:07:07` | Web `a82bc558...` | 只作预检，不纳入有效样本 |
| 新部署 READY | `2026-08-14 15:12:48.065` | Web `bf9d481d...` / `dpl_36uG6...` | 重新冻结 G0 |
| 第一轮有效样本 | `15:19:42.201` 至 `15:21:22.650` | Web `bf9d481d...` | 纳入 G1 |
| 第二轮有效样本 | `15:23:26.241` 至 `15:24:26.927` | Web `bf9d481d...` | 纳入 G1 |
| 收尾公开链路探针 | `15:29:24` | Web `bf9d481d...` | HTTP 200，链路闭合 |

因此两轮有效样本没有跨部署混合。旧部署上的预检、仅设置 GraphQL override 的样本，以及使用 `700ms` 静默窗口的校准样本全部丢弃。

### 2.3 运行环境

| 字段 | 本次值 |
|---|---|
| 小程序版本 | `develop` |
| DevTools | Stable `2.01.2510290` |
| 基础库 SDK | `3.15.2` |
| 模拟设备 | iPhone 12/13 Pro profile，`390 x 753`，DPR `3` |
| 系统 / WeChat profile | iOS `10.0.1` / WeChat `8.0.5` |
| 网络 | DevTools `WiFi` |
| Season / GW | season `2627`；current event `null`；next/selected GW `1`，处于季前 |
| 身份 | 已绑定 profile，全部标识脱敏；不记录 entry 原始 ID、token、openid、email |
| 客户端缓存动作 | 保留登录/绑定 storage；第一轮前只清 `gql:*` 与 `perf:v1`；不清生产缓存 |
| 有效 GraphQL endpoint | `https://www.letletme.top/api/graphql` |
| 有效小程序 Web API | `https://www.letletme.top/api/miniprogram` |
| 采集静默窗口 | 页面 operation 数量稳定后再等待 `2200ms`，避免漏掉 secondary operation |
| 原始证据 | 本文逐页表、时间线与 request ID 附录；DevTools 本地 `perf:v1` 运行记录 |

develop 的两个 endpoint override 在采样前临时指向生产 Web 入口；采样结束后已同时删除，绑定状态保持不变。没有把临时 override 留在本地 storage。

### 2.4 Web -> GraphQL -> Data 公开链路探针

收尾对 `https://www.letletme.top/api/graphql` 发起 `CurrentEventInfo`：

- HTTP `200`，`x-matched-path: /api/graphql`，`x-vercel-cache: MISS`；
- season `2627`，current event `null`，next event `1`，deadline `2026-08-21T17:30:00.000Z`；
- TTFB `410ms`，total `410ms`；
- request ID：`078a811a-74ca-4d07-b485-6dd397bd806f`。

这证明公开请求经过生产 Web GraphQL 代理并取得 GraphQL/Data 结果；它没有提供 resolver、Redis 或 SQL 分段，因此不能从这个 `410ms` 推断数据库耗时。

## 3. G1：采样口径

第一轮为固定 DevTools profile 下的 C-Data 横截面：保留身份，只清客户端 GraphQL 与性能记录，并重新编译/启动 Home。随后按 Checklist 的 25 个注册入口顺序用同一个 automation session 重放路由。

第二轮不清缓存、不重启 DevTools、不改变 season/GW/身份/endpoint，以相同顺序再次重放 25 个入口。它是“同一进程、同一会话、cache-warm route reLaunch”，不是用户手势自然返回，也不等同于真机 W-Enter。

注意现有 tracker 将 automation `reLaunch` 均标记为 `cold-launch`，包括第二轮；本文根据实际缓存动作把第二轮归类为 cache-warm，而不沿用这个错误标签。

## 4. 两轮总体结果

| 指标 | 第一轮 | 第二轮 | 判断 |
|---|---:|---:|---|
| 注册入口 | 25/25 | 25/25 | 完整 |
| 实际目标 route | 23 | 23 | 两个兼容入口按预期重定向 |
| 主内容证据 | 25/25 | 25/25 | 其中 23 页有 T6 数值，My FPL Team 及其 legacy 入口使用 selector 终态证据 |
| timeout | 0 | 0 | 通过 |
| run-scoped console error / exception | 0 / 0 | 0 / 0 | 通过；不采用 DevTools 旧 badge 的历史计数 |
| GraphQL failed / 429 | 0 / 0 | 0 / 0 | 通过 |
| 逻辑 operation | 26 | 25 | — |
| network operation | 18 | 3 | 降低 83% |
| memory operation | 8 | 22 | — |
| cache hit ratio | 31% | 88% | 第二轮超过默认 70% 目标 |
| network latency | p50 `323ms`；p95 `1335ms`，n=18 | `290 / 323 / 1460ms`，n=3 | 第二轮样本不足，禁止报告 p95 |
| 渲染 hash | 基线 | 24/25 相同 | 性能页因累计指标更新而预期变化 |

第二轮仍发生 3 个网络 operation：

1. My FPL Team 的 `GetLiveSnapshot`：cache policy 为 `network-only`，`323ms`；
2. Live Entry 的 `CalcLivePointsByEntry`：cache policy 为 process-local `live`、fresh TTL `10s`；两轮间隔超过 TTL，本轮 `1460ms`；
3. Legacy Entry Summary 重定向后的 `GetLiveSnapshot`：同一 `network-only` policy，`290ms`。

所以“第二轮 88% 命中”成立，但 Checklist 的“第二轮网络 operation = 0”没有通过。这里首先是验收口径与 live/network-only 策略的冲突，不能在没有产品 freshness 决策时通过延长 TTL 或隐藏请求来消除数字。

## 5. 25 页面逐页证据

`首次/二次 T6` 为 `routeStartedAt -> primaryViewportVisibleAt`。`—` 表示 tracker 没有写入 T6，但 collector 找到稳定的主终态 selector；不能填成 `0ms`。

| # | 页面 | 首次 / 二次 T6 | network ops 首次 -> 二次 | 当前终态 | G1 状态 |
|---:|---|---:|---:|---|---|
| 1 | Home | `2188 / 173ms` | `4 -> 0` | 10 场赛程、GW1 上下文与绑定入口均显示；两轮 hash 相同 | 🟡 单个 DevTools 冷样本慢，未有真机 n=5 |
| 2 | 账号关联 | `57 / 58ms` | `0 -> 0` | 静态页稳定，无意外业务请求 | 🟢 |
| 3 | Entry 搜索 | `61 / 62ms` | `0 -> 0` | 初始搜索态稳定 | 🟢 |
| 4 | Entry 资料 | `71 / 107ms` | `0 -> 0` | 已绑定资料从 memory 命中，无错误 | 🟢 |
| 5 | My FPL 总览 | `83 / 66ms` | `2 -> 0` | PRESEASON；16 个 league；上下文可用 | 🟢 |
| 6 | My FPL Team | `— / —` | `2 -> 1` | GW1 尚未生成，明确显示“本轮待就绪” | 🟡 合法空态，但 T6 埋点缺失 |
| 7 | My FPL Leagues | `109 / 114ms` | `0 -> 0` | 16 行，memory 命中 | 🟢 |
| 8 | Live 首页 | `68 / 67ms` | `0 -> 0` | 3 个入口卡片 | 🟢 |
| 9 | Live Entry | `501 / 1511ms` | `1 -> 1` | 明确说明“未提交不是 0 分”，无错误 | 🟡 二次 live 请求 `1460ms` |
| 10 | Live Tournament | `85 / 80ms` | `0 -> 0` | 当前确实没有实时比赛周 | 🟡 合法季前空态被包装成“加载未完成/请检查网络” |
| 11 | Live Match | `123 / 84ms` | `0 -> 0` | 10 场未开始比赛、7 个日期组 | 🟢 |
| 12 | Competitions | `354 / 85ms` | `1 -> 0` | 1 个可显示项目 | 🟢 |
| 13 | Tournament Summary | `139 / 112ms` | `0 -> 0` | 当前 app tournament context 为空，提供明确引导 | 🔵 |
| 14 | Explore 首页 | `96 / 99ms` | `0 -> 0` | 2 组卡片；顺序为本轮、赛程、市场、趋势、球员、球队 | 🟢 |
| 15 | Gameweek | `682 / 78ms` | `1 -> 0` | 2 个摘要指标、4 个梦之队分组 | 🟢 |
| 16 | Fixtures | `531 / 126ms` | `2 -> 0` | 20 队 run，GW1-38 范围可用 | 🟢 |
| 17 | Market | `284 / 78ms` | `1 -> 0` | `2026-08-14` 没有球员调价，页面明确说明这是正常情况 | 🔵 |
| 18 | Selections | `74 / 92ms` | `0 -> 0` | 当前无适用赛事，明确 tournament 空态 | 🔵 |
| 19 | Players 搜索 | `444 / 81ms` | `1 -> 0` | `Saka` 返回 2 个结果 | 🟢 |
| 20 | Player Detail | `359 / 97ms` | `1 -> 0` | 有效 code、显式 season `2627`，详情非空 | 🟢 |
| 21 | Teams | `84 / 86ms` | `0 -> 0` | 20 队 | 🟢 |
| 22 | Team Detail | `269 / 100ms` | `1 -> 0` | teamId `1`、显式 season `2627`，详情非空 | 🟢 |
| 23 | Legacy Data shell | `66 / 60ms` | `0 -> 0` | 正确重定向 `pages/explore/index/index`，无循环/业务 payload | 🟢 |
| 24 | Legacy Entry Summary | `— / —` | `1 -> 1` | 正确重定向 `pages/my-fpl/team/team`；终态与第 6 页相同 | 🟢 重定向契约通过，目标页 T6 缺口见第 6 页 |
| 25 | 性能监控 | `70 / 99ms` | `0 -> 0` | 本地累计指标显示，未新增业务请求 | 🟡 “首次渲染 NaNms”，总分不可验收 |

状态汇总：`🟢 17`、`🔵 3`、`🟡 5`、`🔴 0`。底层业务数据为空且可以解释的页面/终态共 6 个：My FPL Team、Live Entry、Live Tournament、Tournament Summary、Market、Selections；前三个因性能、埋点或文案问题没有标成蓝色通过。

## 6. 关键时间线

### 6.1 Home 第一轮 C-Data / DevTools recompile

| 阶段 | 相对 route start | 分段耗时 | 判断 |
|---|---:|---:|---|
| context ready | `787ms` | `787ms` | 启动/上下文占一段明显时间 |
| primary request start | `797ms` | `10ms` | 上下文后很快发主请求 |
| primary response | `2138ms` | `1341ms` | 主要瓶颈在等待主响应 |
| primary setData | `2153ms` | `15ms` | 客户端转换/提交很短 |
| primary viewport visible | `2188ms` | `35ms` | 提交到可见很短 |
| secondary complete | `2852ms` | `664ms` | optional tail 在主内容后完成 |

Home 的 4 个网络记录为：`CurrentEventInfo 907ms`、`CoreEventFixtureSchedule 1335ms`、`GetEntry 536ms`、`MiniHomeSupplement 689ms`。页面 tracker 的 operation count 为 3，是因为全局 `CurrentEventInfo` 不计入页面 caller surface；总表仍按本次路由时间窗内实际 4 条网络记录计数。

### 6.2 Home 第二轮 cache-warm

| 阶段 | 相对 route start |
|---|---:|
| context ready | `5ms` |
| primary request start | `32ms` |
| primary response | `35ms` |
| primary setData | `61ms` |
| secondary complete | `70ms` |
| primary viewport visible | `173ms` |

三个页面 operation 均为 memory：`CoreEventFixtureSchedule 1ms`、`GetEntry 1ms`、`MiniHomeSupplement 0ms`。`secondary complete` 早于 `primary viewport visible`，说明当前字段更像“次要数据任务结束”，不能直接当作页面最终完全可见；这是计时语义缺口。

### 6.3 其他慢点

- 第一轮最慢网络 operation：Home `CoreEventFixtureSchedule 1335ms`，request ID `91c3e013-0508-49dc-8637-596e61350100`。
- 第二轮最慢网络 operation：Live Entry `CalcLivePointsByEntry 1460ms`，request ID `7b91c726-21e2-4972-b8fb-c1bf0dfd5c83`；页面 T6 `1511ms`，因此主要耗时可归于网络/上游返回，而不是本地渲染。
- Gameweek 第一轮 T6 `682ms`，对应 `MiniGameweekSummary 635ms`；第二轮 memory 后 T6 `78ms`。
- Fixtures 第一轮 T6 `531ms`，`Teams 234ms` 与 `FixtureWindow 463ms`；第二轮均 memory，T6 `126ms`。

这些只把瓶颈定位到“客户端等待生产请求”层。G1 尚未读取同一 request ID 的 Web、GraphQL、Redis、Data/DB 分段，不能继续声称 resolver 或数据库是根因。

## 7. 性能页观测缺口

性能页两次均显示：

- 启动耗时 `916ms`；
- 首次渲染 `NaNms`，评级“差”；
- 第一轮累计 `26` logical / `18` network / `31%` hit；
- 第二轮结束累计 `51` logical / `21` network / `59%` hit；
- 分数均为 `63/100`、“良好”。

由于首次渲染是 `NaNms`，`63/100` 必须视为无效派生分数，不能用于 G1 通过或后续优化收益。另有三个关联缺口：

1. automation 的第一轮和第二轮都被标成 `cold-launch`，无法依赖 trigger 区分 C-Data 与 warm re-enter；
2. My FPL Team 合法空态有稳定 selector，但没有 `primaryViewportVisibleAt`；
3. `secondaryCompleteAt` 可以早于 `primaryViewportVisibleAt`，当前 “complete” 不是最终可见完成点。

这些属于 Gate 2 的全局观测问题，优先级高于按页面调数值。

## 8. G1 根因候选与下一 Gate 输入

本节只形成候选，不实施优化。

| 优先级 | 问题 | 当前证据 | 当前能下的结论 | 进入 G2/G3 前需要什么 |
|---|---|---|---|---|
| P0 | 性能时间线可信度不足 | `NaNms`、trigger 误归类、T6 缺失、complete/T6 逆序 | 观测层存在系统性缺口 | 先定义并验证时间线不变量，再重新采样受影响页 |
| P1 | Home 首次主内容 `2188ms` | request wait `1341ms`，response 后仅 `50ms` 到可见 | 本地转换/渲染不是当前主要段 | 真机 C-App n=5；按 request ID 拆 Web proxy、GraphQL、resolver/cache |
| P1 | Live Entry 第二轮 `1511ms` | `CalcLivePointsByEntry 1460ms`；live TTL 10s 已过期 | live 请求等待主导 | 明确 freshness/SLO；追同 request ID 的服务端分段 |
| P1 | Live Tournament 合法空态误报网络问题 | season 2627、current event null、页面无请求，却显示“请检查网络” | 客户端状态映射/文案问题 | 在实时 Section 中覆盖 preseason、live、finished 后再授权修复 |
| P1 | 第二轮严格零网络目标与 live policy 冲突 | 22 memory + 3 live/network-only | 不是普通缓存失效 | 先定义 live/network-only 是否从零网络门槛豁免 |
| P2 | dataset revision 不可关联 | 只有 Data deploy SHA，无响应 revision | 无法证明两次数据 publication 完全相同 | 增加只读 revision/server timing 证据或从当前日志读取 |

Checklist 中的 P0 页面清单及本次状态：Home `🟡`、My FPL Overview `🟢`、My FPL Team `🟡`、Live Entry `🟡`、Live Match `🟢`、Competitions `🟢`、Explore `🟢`、Fixtures `🟢`、Market `🔵`。

没有发现符合“中断 Section 立即处理”的崩溃、白屏、错误用户/赛季、敏感信息泄漏、无限请求、429 或数据破坏。

## 9. 未执行范围

以下项目不属于本次 G0-G1，状态保持未开始：

- iOS/Android 真机；
- 真正 C-App n=5 与真机 p50/max；
- Refresh、BG-Short、offline、stale、401 replay、快速筛选/导航竞态；
- 游客、未绑定以及其他 rich-state；
- P0 页面完整状态矩阵；
- RSC/Web proxy/GraphQL resolver/Redis/Data/PostgreSQL 的同 request ID 分段；
- G2 共性问题修复、任何 Section 优化与回归。

## 10. 网络 request ID 附录

### 10.1 第一轮（18 条）

| 页面 | operation | 耗时 | request ID |
|---|---|---:|---|
| Home | `CurrentEventInfo` | `907ms` | `de818e7d-1382-4333-9899-8d687a3188d6` |
| Home | `CoreEventFixtureSchedule` | `1335ms` | `91c3e013-0508-49dc-8637-596e61350100` |
| Home | `GetEntry` | `536ms` | `3f2c1a21-4171-45d7-9742-949a392267c1` |
| Home | `MiniHomeSupplement` | `689ms` | `5650dbb5-e4ab-4665-abc1-16348ee4d69d` |
| My FPL Overview | `EntryEventResult` | `295ms` | `2b23f6df-ec16-4771-bfb5-a2444de4dea3` |
| My FPL Overview | `EntryLeagues` | `369ms` | `ed54a5e7-f9aa-4bf8-8f0a-315fa870b28c` |
| My FPL Team | `EntryEventResult` | `233ms` | `2ca385d5-1b32-4e24-b006-9898b40bbd03` |
| My FPL Team | `GetLiveSnapshot` | `289ms` | `7f157786-071b-4c60-8a17-2af8068cfaf2` |
| Live Entry | `CalcLivePointsByEntry` | `447ms` | `010c05eb-f4b5-42de-97e2-62c3b1c806ad` |
| Competitions | `EntryTournaments` | `308ms` | `6afdc915-5d72-4773-9e6f-6d7252988381` |
| Gameweek | `MiniGameweekSummary` | `635ms` | `4cca47f8-1bd3-42fa-94db-60214dbbebca` |
| Fixtures | `Teams` | `234ms` | `cd82a69e-f664-40f9-af4b-da956e39dae9` |
| Fixtures | `FixtureWindow` | `463ms` | `2eff90dc-f1fc-4af1-8e99-f91bd81cbb84` |
| Market | `GetPlayerValues` | `245ms` | `f895cbc4-ec9a-4f3f-840f-1cbe027ab0cd` |
| Players | `PlayersForPicker` | `388ms` | `7db0280d-2a4e-427a-a11e-51df43fe8bd5` |
| Player Detail | `Player` | `323ms` | `0f4126b4-1c2a-4d89-a0cc-8241e709cf09` |
| Team Detail | `Team` | `238ms` | `f78ce6ce-4f80-4206-9848-355a9a97b405` |
| Legacy Entry -> My FPL Team | `GetLiveSnapshot` | `311ms` | `784228aa-ac63-4347-89f5-387d4d11da9d` |

### 10.2 第二轮（3 条）

| 页面 | operation | 耗时 | request ID |
|---|---|---:|---|
| My FPL Team | `GetLiveSnapshot` | `323ms` | `e3c6018c-080c-418f-b1bf-36c429e6f8af` |
| Live Entry | `CalcLivePointsByEntry` | `1460ms` | `7b91c726-21e2-4972-b8fb-c1bf0dfd5c83` |
| Legacy Entry -> My FPL Team | `GetLiveSnapshot` | `290ms` | `fefb7cba-e11f-41c9-8fbb-2daf6197e251` |

## 11. 收尾状态

- 两个临时生产 endpoint override 已删除并验证为空；绑定状态未被改变。
- Mini 在 G0 冻结和两轮有效采样期间为干净的 `12acbb2e33d3ba94960443dc3a4d95315f5b67f0`。收尾于 `15:31:15 AWST` 发现主 worktree 新出现未跟踪文件 `miniprogram/config/mock-mode.ts`；其创建晚于 G1 样本结束，不影响本次样本，来源不属于本次只读排查，已原样保留且没有加入文档提交。
- 本轮没有向四个业务仓库写入任何代码或配置变更；用户或其他并行工作的现有/新改动均未触碰。
- 本记录只提交到 `codex/miniprogram-performance-audit-docs`，不 push、不 merge。
