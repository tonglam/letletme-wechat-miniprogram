# 小程序全页面性能排查执行 Checklist

> 状态：常驻执行模板，尚未代表任何一次验收结果。
>
> 建立日期：2026-08-14。
>
> 建立时路由基线：`main@12acbb2`，`miniprogram/app.json` 共 25 个注册页面。每次执行必须重新记录当前精确 SHA、路由数量和真实运行环境，不能沿用本行。

## 1. 目的与使用边界

本文件用于按照真实用户导航顺序遍历 LetLetMe 微信小程序全部页面，统一记录：

- 冷启动、缓存冷、暖进入、刷新和前后台恢复；
- iOS、Android 与 WeChat DevTools 的差异；
- 游客、未绑定、已绑定和真实 rich-state；
- 正常数据、合法空数据、stale、离线、错误和重试；
- 页面生命周期、GraphQL operation、Web 代理、resolver、Redis/Data/PostgreSQL 的分段证据；
- 逐页结论、共性根因与分阶段优化建议。

首轮默认只读：不改代码、不清生产 Redis、不修改生产数据、不通过延长 TTL、提前结束 loading 或隐藏请求来“改善”指标。若现有观测能力不足，先记录为“观测缺口”，另行提出埋点变更并获得授权。

历史报告仅作为口径和旧证据参考，不代表当前状态：

- [小程序全页面性能整改最终验收报告](./miniprogram-full-page-performance-diagnostic-2026-08-12.md)
- [小程序 UX 与性能严格验收报告](./miniprogram-ux-performance-acceptance-2026-08-11.md)
- [接口调用、Data Fetch 与缓存深度诊断](./data-fetch-interface-cache-diagnostic-2026-08-11.md)

按本 Checklist 生成的独立 Run 记录：

- [2026-08-14 G0-G1 全页面轻量基线](./miniprogram-performance-run-2026-08-14-g0-g1.md)
- [2026-08-14 G2-A 全局观测契约](./miniprogram-performance-run-2026-08-14-g2-a.md)

本 Checklist 的执行、优化和回归顺序由以下常驻策略约束：

- [小程序性能排查与优化执行策略](./miniprogram-performance-audit-section-execution-strategy.md)

## 2. 状态标记

| 标记 | 含义 |
|---|---|
| `⬜` | 未检查 |
| `🟢` | 当前运行证据通过 |
| `🟡` | 有异常或证据不足，待深挖 |
| `🔴` | 已确认阻塞或缺陷 |
| `🔵` | 页面为空，但已证明是当前业务状态 |
| `⚪` | 不适用，必须写明原因 |

规则：

- 不能因为接口 HTTP 200 就标记页面通过；必须确认渲染终态。
- 不能因为页面没有业务行就标记失败；先判断数据库、publication、赛季/GW 和身份条件下是否应该为空。
- 不能因为模拟器通过就标记真机通过。
- 不能用最快样本代替完整样本或 p95。
- 重定向页以最终目标页的有效首屏为准，中间页 FCP 不计入目标页性能。
- 所有 `🟢`、`🔵`、`🔴` 都必须有当前运行的证据链接或 request ID。

## 3. 执行分层

全页面遍历分三轮执行，避免直接展开“25 页面 × 所有设备 × 所有状态”的组合爆炸。

### 3.1 第一轮：全页面快速基线

- [ ] 使用一个固定真机或固定 DevTools profile。
- [ ] 保留同一赛季、GW、身份和网络环境。
- [ ] 按第 7 节顺序遍历 25/25 注册页面。
- [ ] 每页完成首次进入和同会话第二次进入。
- [ ] 记录页面终态、首屏可见、完全稳定、逻辑 operation、网络 operation、console error 和 exception。
- [ ] 给每页标记 `🟢`、`🟡`、`🔴` 或 `🔵`。
- [ ] 只把异常页、关键页和证据不足页升级到第二轮。

### 3.2 第二轮：关键页完整矩阵

P0 页面及第一轮所有 `🟡`、`🔴` 页面执行：

- [ ] iOS 真机。
- [ ] Android 真机。
- [ ] App 冷启动。
- [ ] 客户端数据缓存冷。
- [ ] 暖进入。
- [ ] 下拉刷新或页面等价刷新。
- [ ] 短后台恢复。
- [ ] 游客、未绑定和已绑定状态中所有适用状态。
- [ ] 正常、合法空、stale、离线、错误、重试和快速切换中所有适用状态。

### 3.3 第三轮：按 operation 深入后端

不是每个页面都重复追一次数据库。把第二轮发现的问题按 GraphQL operation 去重，再沿以下链路追踪：

```text
App/Page lifecycle
  -> 页面 service
  -> graphql.service.ts（memory/storage/in-flight/stale/network）
  -> wx.request
  -> /api/graphql Web 代理
  -> GraphQL resolver/read model
  -> Redis/Data publication/PostgreSQL
  -> 客户端转换
  -> setData callback
  -> primary viewport visible
```

## 4. 每次运行的元数据

以下信息未填完整时，不得开始比较冷热数据：

| 字段 | 本次值 |
|---|---|
| Run ID | `YYYY-MM-DD-序号` |
| 开始/结束时间 | ⬜ |
| 操作者 | ⬜ |
| Mini 精确 SHA | ⬜ |
| `origin/main` SHA | ⬜ |
| 是否有未提交改动 | ⬜ |
| 小程序版本 | `develop / trial / release` |
| App 版本号 | ⬜ |
| WeChat / 基础库版本 | ⬜ |
| Web 部署 SHA | ⬜ |
| GraphQL 部署 SHA | ⬜ |
| Data 部署 SHA / dataset revision | ⬜ |
| 实际 GraphQL endpoint | ⬜ |
| Season / current GW / selected GW | ⬜ |
| 身份 | `游客 / 未绑定 / 已绑定 / rich-state` |
| Entry 标识 | 只写脱敏标签，不写 token 或敏感 ID |
| 设备、OS、机型 | ⬜ |
| 网络 | `Wi-Fi / 移动网络 / 限速 / 离线` |
| 客户端缓存动作 | ⬜ |
| 服务端缓存证据 | ⬜；禁止为了测试清生产 Redis |
| 原始证据目录或链接 | ⬜ |

执行前检查：

- [ ] 当前 `app.json` 注册页数量与第 7 节一致。
- [ ] 当前底部导航顺序与第 7 节一致。
- [ ] Explore 卡片顺序与第 7.5 节一致。
- [ ] 生产 `trial/release` endpoint 是 `https://www.letletme.top/api/graphql`；develop 使用当前配置且无意外 override。
- [ ] 测试账号、会话和 FPL 绑定状态已经真实确认。
- [ ] 不记录 Authorization、session token、openid、email 或原始敏感变量。

## 5. 冷热口径

不同“冷”状态必须分开记录，禁止混为一个 cold 指标。

| Profile | 定义 | 用途 |
|---|---|---|
| `C-App` | 完全结束小程序后重新启动，保留普通用户 storage | 真实用户冷启动 |
| `C-Data` | 保留登录，只清客户端 GraphQL memory/storage cache | 页面首次数据获取 |
| `W-Enter` | 同一前台会话离开页面后再次进入 | 日常导航与缓存命中 |
| `Refresh` | 执行页面真实下拉刷新或等价刷新 | 强制获取与刷新尾延迟 |
| `BG-Short` | 页面进入后台后短时间返回 | `onShow`、重复请求与恢复 |
| `Offline` | 已知离线，分别检查有/无 last-good | stale 与错误终态 |

补充规则：

- `C-App` 不等于 `C-Data`；重新启动但保留 L2 cache 仍可能是数据暖态。
- 生产服务端 Redis/DB 是否冷热只能由 server timing、cache source 或日志证明，不主动清缓存。
- DevTools “编译”包含工具链成本，必须与真机启动分开报告。
- 一次运行内若 Season、GW、principal 或 dataset revision 变化，结束该组样本并开启新 Run ID。

## 6. 计时口径与默认门槛

### 6.1 现有客户端时间点

优先复用当前埋点字段：

| 时间点 | 当前字段或证据 | 含义 |
|---|---|---|
| T0 | 点击、扫码或 app launch timeline | 用户动作/启动开始 |
| T1 | `routeStartedAt` | 页面路由开始 |
| T2 | `contextReadyAt` | Season/GW/principal 上下文可用 |
| T3 | `primaryRequestStartAt` | 主请求开始 |
| T4 | `primaryResponseAt` | 主响应返回 |
| T5 | `primarySetDataAt` | 主数据提交渲染 |
| T6 | `primaryViewportVisibleAt` | 核心内容真实进入 viewport |
| T7 | `secondaryCompleteAt` | 次要内容完成 |
| TF | `softFailureAt` | soft timeout 或失败提示出现 |

如果某页面没有某个阶段，标记 `⚪ N/A`，不能填 `0ms`。`setData` callback 只是渲染分段，不代替 T6 的真实可见证据。

当前代码可复用：

- `miniprogram/utils/page-performance.ts`：页面时间线和 primary viewport observer；
- `miniprogram/utils/performance-page.ts`：`cold-launch`、`warm-enter`、`refresh` 生命周期归因；
- `miniprogram/utils/perf.ts`：page/API 记录、cache source、caller surface、request ID；
- `miniprogram/services/graphql.service.ts`：operation、cache、in-flight、stale、network 和 `x-request-id`；
- `miniprogram/pages/performance/index/index`：本地性能汇总页。

### 6.2 默认验收目标

这些是执行目标，不是当前通过状态。若产品 SLO 调整，必须在采样前修改并记录原因，不能看到结果后再改门槛。

| 指标 | 默认目标 |
|---|---:|
| 注册页面语义终态 | 25/25 |
| 正常遍历 runtime error / exception | 0 / 0 |
| 正常遍历 timeout | 0 |
| 自然导航触发 429 | 0 |
| P0 暖进入 primary visible p95 | `<= 550ms` |
| P0 刷新 primary visible p95 | `<= 600ms` |
| P1 暖进入 primary visible p95 | `<= 800ms` |
| P1 complete p95 | `<= 1800ms` |
| response -> setData callback p95 | `<= 50ms` |
| 首页真实冷启动 primary visible | `n=5`，报告全部样本和最大值，默认最大值 `<= 1500ms` |
| 第二轮 cache hit ratio | `>= 70%` |
| 无刷新、无上下文过期的第二轮网络 operation | `0` |
| `season:unknown` 请求或缓存 | `0` |
| telemetry 敏感字段 | `0` |

统计规则：

- p95 使用 nearest-rank，至少 `n >= 10` 才报告 p95。
- 冷启动只有 5 个样本时报告全部样本、p50 和最大值，不伪称 p95。
- 同设备、同网络、同身份、同数据 revision 才能合并分布。
- 页面 operation p95、Web proxy p95、GraphQL p95 和 SQL p95 必须分别报告。

## 7. 25 页面遍历总表

优先级只决定采样深度，不决定是否检查：

- `P0`：完整设备、冷热和状态矩阵；
- `P1`：两轮暖遍历、适用的刷新和关键状态；异常即升级为 P0；
- `P2`：语义、重定向、无意外请求和错误状态；异常即升级。

每页五个状态列依次表示：语义终态、性能基线、异常状态、纵向链路、最终结论。

### 7.1 启动、Home 与身份

| # | 优先级 | 页面/入口 | 注册路由 | 必查状态 | 语义 | 性能 | 异常 | 链路 | 结论/证据 |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | P0 | Home / 启动落点 | `/pages/home/index/index` | C-App、C-Data、W-Enter、Refresh；主内容与 optional supplement 分离 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | P2 | 账号关联 | `/pages/account/link/link` | 未绑定、已绑定、登录失败、返回内容页；静态页不应误发业务列表请求 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | P2 | Entry 搜索 | `/pages/entry/search/search` | 初始态、有效输入、无效输入、无结果、错误 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | P1 | Entry 资料 | `/pages/entry/profile/profile` | 有效 entry、缺参、未授权、刷新、错误/重试 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

### 7.2 我的 FPL

当前底部导航内部顺序：`总览 -> 球队 -> 联赛`。

| # | 优先级 | 页面/入口 | 注册路由 | 必查状态 | 语义 | 性能 | 异常 | 链路 | 结论/证据 |
|---:|---|---|---|---|---|---|---|---|---|
| 5 | P0 | 我的 FPL 总览 | `/pages/my-fpl/index/index` | 游客、未绑定、已绑定、正常数据、partial、赛季/GW 切换 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | P0 | 我的 FPL 球队 | `/pages/my-fpl/team/team` | NO_PICKS、READY、历史 GW、转会、Live snapshot、刷新 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | P1 | 我的联赛 | `/pages/my-fpl/leagues/leagues` | 无联赛、单/多联赛、刷新、session 失效 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

### 7.3 实时

当前底部导航内部顺序：`球队 -> 竞赛 -> 比赛`；注册的 Live 首页也必须独立覆盖。

| # | 优先级 | 页面/入口 | 注册路由 | 必查状态 | 语义 | 性能 | 异常 | 链路 | 结论/证据 |
|---:|---|---|---|---|---|---|---|---|---|
| 8 | P1 | Live 首页 | `/pages/live/index/index` | 本地入口卡片、无意外请求、进入三个目标页 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | P0 | Live 球队 | `/pages/live/entry/entry` | preseason、NO_PICKS、READY、live、finished、stale、轮询恢复 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | P1 | Live 竞赛 | `/pages/live/tournament/tournament` | 无赛事、有赛事、live/finished、刷新、stale | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | P0 | Live 比赛 | `/pages/live/match/match` | preseason、scheduled、live、finished、筛选切换、迟到响应 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

### 7.4 赛事

| # | 优先级 | 页面/入口 | 注册路由 | 必查状态 | 语义 | 性能 | 异常 | 链路 | 结论/证据 |
|---:|---|---|---|---|---|---|---|---|---|
| 12 | P0 | 我的赛事 | `/pages/competitions/index/index` | 未绑定、无赛事、有赛事、pending season sync、刷新 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | P1 | 赛事总结 | `/pages/summary/tournament/tournament` | 无 context、有效赛事、历史/当前 GW、partial、刷新 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

### 7.5 探索

当前 Explore 真实卡片顺序为：`本轮 -> 赛程 -> 市场 -> 趋势 -> 球员 -> 球队`。性能工具只对授权诊断账号可见，不属于普通用户顺序。

| # | 优先级 | 页面/入口 | 注册路由 | 必查状态 | 语义 | 性能 | 异常 | 链路 | 结论/证据 |
|---:|---|---|---|---|---|---|---|---|---|
| 14 | P0 | Explore 首页 | `/pages/explore/index/index` | 本地菜单先显示、context 成功/失败、搜索跳转、卡片顺序 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 15 | P1 | 本轮 / Gameweek | `/pages/summary/gameweek/gameweek` | 当前/历史 GW、正常、合法空、切换、刷新、错误 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | P0 | 赛程 / Fixtures | `/pages/explore/fixtures/fixtures` | 当前 GW、3/5 horizon、20 队、合法空、切换、刷新 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | P0 | 市场 / Market | `/pages/data/price/price` | 有涨跌、合法无变价、筛选、历史、刷新、publication 缺失/错误 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 18 | P1 | 趋势 / Selections | `/pages/data/selections/selections` | 无赛事、有赛事、各 tab、刷新、partial | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 19 | P1 | 球员 | `/pages/data/players/players` | 初始目录、搜索、无结果、分页、快速关键词切换、重试 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 20 | P1 | 球员详情 | `/pages/data/player-detail/player-detail` | 缺 code、有效 code、显式 season、跨赛季、错误/返回 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 21 | P1 | 球队 | `/pages/data/teams/teams` | 20 队、合法空、刷新、错误 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 22 | P1 | 球队详情 | `/pages/data/team-detail/team-detail` | 缺 teamId、有效 teamId、显式 season、跨赛季、错误/返回 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

### 7.6 兼容路由与内部工具

| # | 优先级 | 页面/入口 | 注册路由 | 必查状态 | 语义 | 性能 | 异常 | 链路 | 结论/证据 |
|---:|---|---|---|---|---|---|---|---|---|
| 23 | P2 | Legacy Data shell | `/pages/data/index/index` | 必须重定向 Explore；无业务 payload、无循环跳转 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 24 | P2 | Legacy Entry Summary | `/pages/summary/entry/entry` | 缺参/兼容入口按当前契约进入 My FPL Team；无中间页误判 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 25 | P2 | 性能监控 | `/pages/performance/index/index` | 仅授权诊断账号可见；本地汇总不新增业务请求；清理动作受控 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

覆盖汇总：

| 项目 | 目标 | 当前 Run |
|---|---:|---:|
| 已检查注册页面 | 25 | 0 |
| 当前运行语义通过 | 25 | 0 |
| 合法空态 | 按运行数据解释 | 0 |
| 预期重定向 | 2 | 0 |
| 非预期白屏 | 0 | 0 |
| runtime error / exception | 0 / 0 | ⬜ |
| timeout | 0 | ⬜ |

## 8. 单页检查卡模板

每个页面执行时复制本节；总表只负责覆盖，详细证据保存在页面卡中。

```markdown
### 页面：<名称>

#### A. 身份与契约

- Route：
- 入口与返回路径：
- 精确 Mini SHA：
- Env / endpoint：
- Season / GW / dataset revision：
- 身份：游客 / 未绑定 / 已绑定 / rich-state
- 核心 operation：
- 期望数据：
- 合法空数据条件：

#### B. 样本

| Profile | 设备 | n | primary p50/p95/max | complete p50/p95/max | logical/network ops | cache source | 结果 | 证据 |
|---|---|---:|---|---|---|---|---|---|
| C-App | | | | | | | ⬜ | |
| C-Data | | | | | | | ⬜ | |
| W-Enter | | | | | | | ⬜ | |
| Refresh | | | | | | | ⬜ | |
| BG-Short | | | | | | | ⬜ | |

#### C. 时间线

| 阶段 | 时间 | 判断 |
|---|---:|---|
| T0 -> T1 启动/导航到 route | | |
| T1 -> T2 上下文 | | |
| T2/T3 -> T4 请求等待 | | |
| T4 -> T5 数据转换与 setData | | |
| T5 -> T6 viewport visible | | |
| T6 -> T7 secondary complete | | |

#### D. 页面与客户端

- [ ] Loading 立即可见且不闪烁。
- [ ] 主内容、空态或错误态进入明确终态。
- [ ] 没有无依赖串行请求。
- [ ] 没有重复 operation。
- [ ] 没有无界大 setData 或长列表一次性提交。
- [ ] 返回页面不会无条件重复加载。
- [ ] 旧 generation/request 不会覆盖新 season、GW、筛选或 route params。
- [ ] cache variant 包含所需 principal/season/event/revision 维度。
- [ ] stale 有持续、可见、真实的说明。
- [ ] 页面隐藏和卸载后不会错误提交或继续归因。

#### E. 状态

- [ ] 正常数据。
- [ ] 合法空数据。
- [ ] 游客/未绑定。
- [ ] offline + last-good。
- [ ] offline + no cache。
- [ ] transient error + retry。
- [ ] 401 refresh/replay。
- [ ] invalid route params。
- [ ] 快速导航/筛选竞态。
- [ ] Season/GW/deadline 变化。

#### F. 结论

- 状态：⬜ / 🟢 / 🟡 / 🔴 / 🔵 / ⚪
- 最慢阶段：
- 根因层：启动/包体、生命周期、渲染、网络/代理、GraphQL/cache、Data/DB、合法空数据、观测缺口
- request IDs：
- 证据：
- 优先级：
- 下一步：
```

## 9. GraphQL Operation 去重表

页面表和 operation 表必须互相引用。一个 operation 被多个页面消费时，后端链路只深入一次，但每个页面仍要检查自己的编排、转换和渲染。

| Operation | 主要页面 | Auth | 预期 cache policy | 页面映射 | 冷/热证据 | Proxy | Resolver | Redis/DB | 结论 |
|---|---|---|---|---|---|---|---|---|---|
| `CurrentEventInfo` | 全局上下文、多页面 | public | deadline | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `CoreEventFixtureSchedule` | Home | public | fixtures | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `FixtureWindow` | Explore Fixtures | public | fixtures | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `MiniHomeSupplement` | Home | public | market | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `MiniProgramNotice` | Home | public | notice | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `EventOverallResult` | Home / Gameweek | public | historical | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `GetPlayerValues` | Market | public | market | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `GetPlayerValueHistory` | Market 历史 | public | historical | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `MiniGameweekSummary` | Gameweek | public | historical | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `PlayersForPicker` | Players / 搜索 | public | player-picker | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `Player` / `PlayerDetail` | Player Detail | public | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `Teams` / `Team` | Teams / Team Detail / Fixtures | public | team-directory | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `GetEntry` | Profile / My FPL | session | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `EntryLeagues` | My FPL / Leagues | session | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `EntryHistory` | My FPL Team | session | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `EntryEventResult` | My FPL / Team | session | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `EntryTransferHistory` / `GetEntryTransferHistory` | My FPL / Live Entry | session | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `EntryTournaments` | Competitions / Tournament / Selections | session | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `TournamentSummary` | Tournament Summary | session | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `TournamentSelectionStats` | Selections | session | reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `GetLiveSnapshot` | My FPL Team | public | network-only | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `CalcLivePointsByEntry` | Live Entry | session | live | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `LiveMatches` | Live Match | public | live | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `GetTournamentLivePoints` | Live Tournament | session | live | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

执行时从当前 GraphQL documents 和 `graphql-cache-policy.ts` 重新生成/核对 operation 清单；本表只是当前种子，不是永久完整清单。

## 10. 单个慢 Operation 的纵向追踪卡

只有满足以下任一条件才进入深追踪：

- 超过页面或 operation 门槛；
- 发生错误、timeout、429、重复请求或非必要串行；
- 冷热差异无法由客户端 cache source 解释；
- 页面为空但无法证明数据本来就为空；
- GraphQL 快而页面慢，或页面网络慢而 resolver/DB 快；
- 同一 request ID 各层时间无法闭合。

追踪 Checklist：

- [ ] 记录 page route、navigation ID、trigger、operation 和脱敏 variables。
- [ ] 记录 client source：`memory / storage / in-flight / stale / network`。
- [ ] 记录 cache age、cache variant hash、context revision 和 force reason。
- [ ] 记录 `x-request-id`，将 Mini、Web 和 GraphQL 日志对齐。
- [ ] 确认 `trial/release` 经 `https://www.letletme.top/api/graphql`，没有绕过 Web 代理。
- [ ] 分离微信网络/TLS、Web proxy、GraphQL admission、resolver、Redis 和 PostgreSQL 时间。
- [ ] 确认 resolver 是否存在串行 waterfall、过量字段、重复 loader 或 cache miss。
- [ ] 确认 Redis 命中、negative hit、miss 与 PostgreSQL fallback。
- [ ] 确认 Data publication revision、capture timestamp、row count 和完整性。
- [ ] 对疑似 SQL 瓶颈先取 query timing/plan 证据，再提出索引或 SQL 变更。
- [ ] 将响应返回到 T6 的客户端转换、setData 和 viewport 时间单独报告。
- [ ] 判断空数据是 season-gated、principal-gated、publication 缺失还是代码丢失。

分段记录：

| 层 | 开始/结束 | 耗时 | cache/source | 证据 | 判断 |
|---|---|---:|---|---|---|
| Mini lifecycle/context | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Mini cache/request | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 微信网络 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Web GraphQL proxy | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| GraphQL admission/context | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Resolver/read model | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Redis | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| PostgreSQL/Data publication | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Client transform/setData | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Native visible/complete | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

## 11. 跨页面专项 Checklist

### 11.1 启动、包体与组件

- [ ] 主包大小和增量变化已记录。
- [ ] 当前仍无分包时，区分全局主包成本和单页成本。
- [ ] `lazyCodeLoading: requiredComponents` 当前有效。
- [ ] Vant 和公共组件没有被重复打包或无条件初始化。
- [ ] `app.onLaunch` 的 auth、AppContext 和 cache prune 没有阻塞首屏主内容。
- [ ] Home 主内容与 optional session/supplement 尾部单独计时。

### 11.2 生命周期与竞态

- [ ] `onLoad` / `onShow` 没有同一 generation 重复请求。
- [ ] 下拉刷新 Promise 到真实数据任务结束后才结算。
- [ ] `onHide` / `onUnload` 后 tracker 和 observer 正确断开。
- [ ] 迟到响应只能提交到匹配的 route、season、GW、principal 和 context revision。
- [ ] deadline crossing 与普通回前台刷新能够区分。

### 11.3 Cache 与正确性

- [ ] public/session cache 隔离。
- [ ] principal、season、event、revision、filter 和 route params 被正确纳入 variant。
- [ ] fresh、stale 和 forced 行为与页面文案一致。
- [ ] partial response 不覆盖完整 last-good。
- [ ] 401 只集中 refresh/replay 一次，不产生请求风暴。
- [ ] L1/L2/in-flight 去重可观测。
- [ ] cache 容量、淘汰和敏感字段检查通过。

### 11.4 列表与渲染

- [ ] 首屏不等待非首屏列表全部完成。
- [ ] 长列表有分页、分批提交或等价的有界策略。
- [ ] 搜索输入只在约定时发请求，不逐键意外请求。
- [ ] filter/GW 切换没有重复全量 setData。
- [ ] response -> setData 与 setData -> viewport visible 分开计时。

### 11.5 空态与韧性

- [ ] 每个空态都有业务原因，不使用笼统“暂无数据”掩盖错误。
- [ ] preseason、pending sync、未绑定、无赛事和无调价分别表达。
- [ ] 离线有 last-good 时持续显示 stale 状态。
- [ ] 离线无缓存时快速进入可重试错误态。
- [ ] transient error 不清空仍然有效的数据。
- [ ] invalid route params 不发无意义请求并提供安全返回路径。

## 12. 根因归类与分阶段优化表

每个问题只能基于当前证据进入以下一类或多类：

| 根因层 | 典型证据 | 可选优化阶段 |
|---|---|---|
| 启动/主包 | T0->T1 慢，页面本身 T1->T6 快 | 分包、依赖裁剪、延后非关键初始化 |
| 页面生命周期 | T1->T3 慢、重复 onLoad/onShow、串行 context | 合并编排、single-flight、分区渐进加载 |
| 客户端 cache | 冷热差异异常、variant 错、重复 network | cache key/TTL/in-flight/stale 治理 |
| 转换/渲染 | T4->T6 慢、setData 大、节点多 | 有界数据、分批提交、组件/列表优化 |
| 微信网络/Web 代理 | Mini network 慢而 resolver 快 | 连接、代理 fast path、admission 分段 |
| GraphQL resolver | resolver waterfall、重复 loader、over-fetch | aggregate/read model、批处理、缓存 |
| Redis/Data | Redis miss、snapshot 无效或 revision 不完整 | publication/cache 修复 |
| PostgreSQL | 有真实慢 query/plan 证据 | SQL、索引、view/materialization |
| 合法空数据 | 数据源与 publication 均证明应为空 | 改善空态说明，不伪造数据 |
| 观测缺口 | request ID 或分段无法闭合 | 先补埋点，再判断优化 |

运行结束后填写：

| 阶段 | 问题/提案 | 证据 | 收益预期 | 风险 | 责任仓库 | 是否授权 |
|---|---|---|---|---|---|---|
| 0 正确性与观测 | ⬜ | ⬜ | ⬜ | ⬜ | Mini/Web/GraphQL/Data | ⬜ |
| 1 Mini 无契约变更优化 | ⬜ | ⬜ | ⬜ | ⬜ | Mini | ⬜ |
| 2 Web proxy/网络 | ⬜ | ⬜ | ⬜ | ⬜ | Web | ⬜ |
| 3 GraphQL/read model/cache | ⬜ | ⬜ | ⬜ | ⬜ | GraphQL | ⬜ |
| 4 Data/数据库 | ⬜ | ⬜ | ⬜ | ⬜ | Data | ⬜ |
| 5 包体/分包架构 | ⬜ | ⬜ | ⬜ | ⬜ | Mini | ⬜ |

## 13. 运行结束门禁

只有以下项目全部完成，才能把一次全页面排查标记为完成：

- [ ] 25/25 注册页面均有当前 Run 的状态和证据。
- [ ] 两个兼容重定向按最终有效页面验收。
- [ ] P0 页面已完成要求的冷热、设备和状态矩阵。
- [ ] 所有 `🟡` 和 `🔴` 已有纵向链路结论或明确观测缺口。
- [ ] 所有空页面已分类为合法空、数据缺失、契约错误或渲染错误。
- [ ] 页面与 GraphQL operation 映射已去重并覆盖全部网络请求。
- [ ] Mini、Web、GraphQL、Data/DB 的时间没有被混为一个 API 数字。
- [ ] 记录了当前 SHA、部署版本、设备、身份、Season/GW 和 dataset revision。
- [ ] 没有把旧报告、模拟器或自动测试证据冒充当前真机生产证据。
- [ ] 给出按证据排序的 P0/P1/P2 根因和分阶段优化方案。
- [ ] 若本轮只读，文档中没有未经授权的实现或生产变更。

最终摘要模板：

```markdown
## Run <ID> 结论

- 覆盖：<n>/25 页面；P0 <n>/<n>；状态场景 <n>/<n>。
- 环境：Mini <SHA>；Web <SHA>；GraphQL <SHA>；Data <SHA/revision>。
- 体验：冷启动 <结果>；暖进入 <结果>；刷新 <结果>。
- 正确性：runtime error <n>；timeout <n>；合法空态 <n>；非预期空白 <n>。
- 网络：逻辑 operation <n>；network operation <n>；cache hit <x%>；429 <n>。
- 最慢页面：<页面 + 最慢阶段 + 证据>。
- 最慢 operation：<operation + 分段 + request ID>。
- 根因排序：P0 <...>；P1 <...>；P2 <...>。
- 实施边界：本轮是否只读；哪些优化尚待授权。
```

## 14. 文档维护规则

- 新增、删除或迁移页面时，同一个变更必须更新第 7 节并重新核对注册页数量。
- Explore 或底部导航调整时，按真实 UI 顺序更新，不按文件系统顺序更新。
- 新增 GraphQL operation 或 cache policy 时，更新第 9 节。
- 每次运行单独保存 Run 元数据与页面卡；不要覆盖历史原始证据。
- 历史结果可以引用，但不能自动继承状态。
- 任何为了通过指标而改变产品语义、缓存 TTL、请求数量或 loading 口径的方案，都必须单独评审。
