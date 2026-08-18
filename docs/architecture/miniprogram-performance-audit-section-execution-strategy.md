# 小程序性能排查与优化执行策略

> 决策：先冻结全页面轻量基线，再处理全局共性问题，随后按 Section 完成“检查 -> 归因 -> 优化 -> 回归”闭环。
>
> 本文是常驻执行策略，不代表任何页面当前已经检查或通过。
>
> 原稿写在 `codex/miniprogram-performance-audit-docs`。2026-08-18 已按明确要求合入 `main`。

## 1. 配套文档

逐页范围、状态矩阵、计时口径和证据表见：

- [小程序全页面性能排查执行 Checklist](./miniprogram-all-pages-performance-audit-checklist.md)

两份文档分工：

| 文档 | 负责内容 |
|---|---|
| 全页面 Checklist | 检查什么、如何记录、什么才算通过 |
| 本执行策略 | 什么时候检查、什么时候优化、如何控制改动与回归 |

## 2. 为什么不采用两个极端

### 2.1 不采用“检查完一页立即优化一页”

这个项目有大量跨页面共享层：

- `app.onLaunch`、登录恢复与 AppContext；
- `graphql.service.ts` 的 memory/storage/in-flight/stale/network；
- `CurrentEventInfo`、Teams、EntryTournaments 等共享 operation；
- principal、season、GW、context revision 和 cache variant；
- bottom navigation、状态组件和页面性能 tracker。

逐页立即优化会产生以下风险：

- 第一个页面的改动污染后续页面的原始基线；
- 同一个缓存、context 或 resolver 根因被多个页面重复修改；
- 局部变快但共享正确性退化；
- 每页一个提交导致回归次数和 review 成本过高；
- 无法判断收益来自页面改动还是共享层改动。

### 2.2 不采用“所有页面全部深查完成后一次性优化”

这种方式虽然基线一致，但也不可控：

- 深查周期过长，发现的高优先级问题长期悬空；
- 问题和提案积累过多，容易形成跨仓库大改动；
- 最终变更范围过大，难以 review、回滚和定位回归；
- 某个全局观测缺口可能让后面大量深查失去可信度。

## 3. 总体执行模型

```text
Gate 0 版本与环境冻结
  -> Gate 1 25 页面轻量基线
  -> Gate 2 全局共性问题
  -> Gate 3 按 Section 深查与优化
  -> Gate 4 跨 Section operation 收敛
  -> Gate 5 全页面最终回归
```

核心原则：

- 页面是体验验收单位；
- Section 是日常排查与回归单位；
- 根因包是实现、提交和 review 单位；
- GraphQL operation 是后端纵向追踪单位；
- 25 页面 smoke 是每轮防止跨区回归的安全网。

## 4. Gate 0：冻结版本与环境

开始任何比较前完成：

- [ ] 记录 Mini、Web、GraphQL、Data 精确 SHA 或部署 revision。
- [ ] 确认当前工作树、分支和未提交改动。
- [ ] 记录小程序 `develop / trial / release` 和实际 endpoint。
- [ ] 固定设备、OS、WeChat 基础库、网络、身份、Season 和 GW。
- [ ] 区分 C-App、C-Data、W-Enter、Refresh 和 BG-Short。
- [ ] 建立 Run ID 和原始证据位置。
- [ ] 明确本轮是只读诊断，还是已经授权实现。

Gate 0 未完成时，不比较冷热结果，不开始优化。

## 5. Gate 1：25 页面轻量基线

目标是获得同一代码、同一环境下的完整横截面，不进行页面级优化。

最低动作：

- [ ] 按真实用户导航顺序遍历 25/25 注册页面。
- [ ] 每页至少记录首次进入和同会话第二次进入。
- [ ] 确认最终渲染状态，不以 HTTP 200 代替页面证据。
- [ ] 记录 primary visible、complete、逻辑 operation、网络 operation 和 cache source。
- [ ] 记录 console error、exception、timeout、429 和非预期重定向。
- [ ] 把空页面分类为合法空、身份限制、数据缺失、契约错误或渲染错误。
- [ ] 给页面标记 `🟢 / 🟡 / 🔴 / 🔵`。

Gate 1 输出：

- 一份冻结的全页面原始基线；
- P0 页面清单；
- 所有 `🟡`、`🔴` 页面；
- 共享 operation 和共性现象列表；
- 需要立即中断处理的正确性问题。

Gate 1 完成后才允许进入结构性优化。后续修改不能覆盖这份原始基线。

## 6. Gate 2：先处理全局共性问题

以下问题不归属某一个页面，应在 Section 优化前单独处理：

- 冷启动、主包或公共依赖成本；
- auth 恢复、AppContext 或 privacy 流程阻塞主内容；
- `onLoad` / `onShow` 全局重复请求；
- GraphQL cache、in-flight dedupe、stale fallback 或 401 replay；
- request ID、page navigation ID 或 server timing 无法关联；
- cache variant 缺失 principal、season、GW、event 或 revision；
- 公共组件造成的大量 setData、布局或渲染成本；
- 生产 endpoint、代理或 admission 的系统性异常。

处理规则：

1. 先用至少三个受影响页面证明它是共性根因。
2. 形成一个有明确边界的根因包。
3. 修改后回归受影响页面。
4. 再跑 25 页面快速 smoke。
5. 保存修改前后同口径对照，不能只报告优化后数字。

如果 Gate 2 只是观测缺口，先完成最小埋点补齐，再重新冻结基线；不能在证据不足时猜测优化。

### 6.1 Gate 2 固定拆分

Gate 2 内部固定为三个子阶段，避免把观测、运行矩阵和后端归因混成一个无限扩张的任务：

| 子阶段 | 目标 | 退出条件 |
|---|---|---|
| G2-A | 建立可信观测契约 | T6、冷热、有限值、complete 语义和 25-page smoke 可解释 |
| G2-B | 完成跨页面运行矩阵 | C-App、W-Enter、Refresh、BG-Short、身份、离线、错误、竞态、401、包体；真机单列 |
| G2-C | 完成共享 operation 纵向归因 | request ID 对齐 Web、GraphQL、Redis/Data publication 与 PostgreSQL；缺口显式记录 |

G2-A/B/C 是一个 Gate 的证据分工，不会增加顶层阶段数量；顶层仍为 G0 到 G5 共六个 Gate。

当前执行记录：

- [G2-A 全局观测契约](./miniprogram-performance-run-2026-08-14-g2-a.md)
- [G2-B/C 运行矩阵与生产纵向追踪](./miniprogram-performance-run-2026-08-14-g2-b-c.md)
- [G2 生产分段闭环](./miniprogram-performance-run-2026-08-14-g2-production-closure.md)
- [G3-G5 Section 深查、operation 收敛与最终回归](./miniprogram-performance-run-2026-08-14-g3-g5.md)

## 7. Gate 3：按 Section 完成闭环

当前底部导航顺序：

1. 我的 FPL
2. 实时
3. 赛事
4. 探索

每个 Section 使用相同循环：

```text
Section 入口检查
  -> Section 全部页面和状态
  -> 页面到 operation 映射
  -> 根因去重与排序
  -> 获得实现授权
  -> 按根因包优化
  -> 目标页面回归
  -> Section 全量回归
  -> 25 页面快速 smoke
  -> Section 关闭
```

### 7.1 Section 进入条件

- [ ] Gate 1 全页面基线已经冻结。
- [ ] 会影响本 Section 的 Gate 2 全局问题已有结论。
- [ ] Section 页面、入口、详情页和兼容路由已列全。
- [ ] 当前身份和数据状态可以覆盖关键 rich-state；无法覆盖的状态明确记录。
- [ ] 尚未开始修改本 Section 代码。

### 7.2 Section 检查完成条件

- [ ] Section 全部页面完成语义终态检查。
- [ ] P0 页面完成冷热、真机和关键状态矩阵。
- [ ] 所有合法空态均有 Data/GraphQL/身份依据。
- [ ] 页面到 GraphQL operation 的映射完整。
- [ ] 共享 operation 已去重，不重复深挖数据库。
- [ ] 所有 `🟡`、`🔴` 有明确根因层或观测缺口。
- [ ] 已形成按证据排序的优化候选，不提前实现。

### 7.3 Section 优化完成条件

- [ ] 每个改动对应一个已证明的根因。
- [ ] 改动范围没有顺手扩展到无关页面或仓库。
- [ ] 修改前后使用同一设备、身份、数据 revision 和计时口径。
- [ ] 目标页面功能、空态、错误、stale 和竞态回归通过。
- [ ] Section 其他页面无回归。
- [ ] 25 页面快速 smoke 无跨区回归。
- [ ] 仍未通过的项目保留为明确债务，不通过改门槛隐藏。

## 8. Section 顺序与页面范围

### 8.1 我的 FPL

```text
总览 -> 球队 -> 联赛
```

重点共享项：principal/session、Entry、Event result、history、transfers、leagues、Live snapshot、跨赛季缓存。

### 8.2 实时

```text
Live 首页 -> 球队 -> 竞赛 -> 比赛
```

重点共享项：CurrentEventInfo、live phase、轮询、deadline transition、NO_PICKS/READY、后台恢复、迟到响应。

### 8.3 赛事

```text
我的赛事 -> 赛事总结
```

重点共享项：EntryTournaments、TournamentSummary、无赛事与 pending sync、当前/历史 GW、身份绑定。

### 8.4 探索

当前真实卡片顺序：

```text
Explore 首页
  -> 本轮
  -> 赛程
  -> 市场
  -> 趋势
  -> 球员
  -> 球员详情
  -> 球队
  -> 球队详情
```

重点共享项：CurrentEventInfo、Teams、FixtureWindow、Market publication、历史数据、搜索/分页、显式 season 深链。

Explore 内不能在检查完 Market 后立刻只优化 Market。先完成 Explore 全部页面基线，判断 Market 问题属于：

- Market 页面自身转换或渲染；
- Explore 共享 context；
- `GetPlayerValues` / `GetPlayerValueHistory`；
- Web proxy 或 GraphQL admission；
- Redis negative/positive path；
- Data market publication 或 PostgreSQL；
- 当前确实没有调价数据。

确认根因后再选择改动单元。

## 9. 根因包，而不是页面包

实现、提交和 review 应按根因包拆分。

好的根因包示例：

- `Explore shared context request dedupe`；
- `GetPlayerValues resolver/cache path`；
- `Market response-to-visible rendering`；
- `session 401 single refresh/replay`；
- `App cold-start optional work deferral`。

不推荐的范围：

- “修 Market 所有问题”：可能混合 Mini、Web、GraphQL 和 Data；
- “全站性能优化”：边界过大，无法可靠回滚；
- “每页一个 PR”：会重复修改共享层并制造大量交叉回归。

每个根因包必须包含：

| 项目 | 必填内容 |
|---|---|
| 症状 | 哪些页面、状态和样本受影响 |
| 分段证据 | 最慢层和 request IDs |
| 根因 | 为什么是这一层，而不是相邻层 |
| 影响范围 | 页面、operation、仓库和身份状态 |
| 修改范围 | 明确包含与不包含 |
| 风险 | 正确性、缓存、权限、赛季/GW、回滚 |
| 验证 | 目标页、Section、25 页 smoke |
| 前后对照 | 同环境、同口径数据 |

## 10. 可以中断 Section 检查立即处理的情况

只有以下 P0 情况允许在 Section 基线尚未完成时中断并处理：

- 崩溃、长期白屏或无法完成导航；
- 展示错误用户、错误赛季/GW 或错误业务数据；
- session/token/敏感字段泄漏；
- 无限请求、轮询失控或自然导航触发 429；
- 迟到请求覆盖新页面、新筛选或新上下文；
- 生产数据或缓存正在被破坏；
- 观测工具本身系统性制造错误结论。

中断处理后必须：

1. 保存修复前证据；
2. 形成独立根因包；
3. 修复并验证 P0；
4. 重新开始受污染的 Section 基线；
5. 不把修复前后样本合并为同一分布。

普通慢请求、单点抖动、非关键视觉问题或可解释空态不构成立即中断条件。

## 11. 回归层级

每个根因包的验证按以下层级执行：

| 层级 | 必查内容 |
|---|---|
| L1 定向 | 直接受影响的页面、状态、operation 和测试 |
| L2 Section | 当前 Section 全部页面与入口 |
| L3 全页面 smoke | 25/25 语义终态、错误、异常网络和重定向 |
| L4 真机关键路径 | P0 页面 iOS/Android 冷热与刷新 |
| L5 跨仓库 | Web/GraphQL/Data 有改动时检查精确部署 SHA 和生产链路 |

任何共享层改动至少完成 L1、L2、L3。涉及启动、auth、GraphQL transport、cache 或 AppContext 的改动还必须完成 L4。

## 12. Section 运行总表

| 顺序 | Section | 基线 | 根因归类 | 实现授权 | 优化 | Section 回归 | 25 页 smoke | 结论/证据 |
|---:|---|---|---|---|---|---|---|---|
| 0 | 全局启动/身份/GraphQL transport | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 1 | 我的 FPL | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | 实时 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | 赛事 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | 探索 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | 跨 Section operations | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | 最终全页面验收 | ⬜ | ⬜ | ⚪ | ⚪ | ⬜ | ⬜ | ⬜ |

## 13. 每个 Section 的关闭记录

```markdown
## Section：<名称>

- Run IDs：
- Mini/Web/GraphQL/Data SHA：
- 页面覆盖：<n>/<n>
- 状态覆盖：<n>/<n>
- 合法空态：
- 异常页面：
- 共享 operations：
- 根因包：
- 已授权并实施：
- 未实施债务：
- Section 回归：
- 25 页面 smoke：
- 真机证据：
- 最终状态：⬜ / 🟢 / 🟡 / 🔴
```

## 14. 文档与分支规则

- 本策略与全页面 Checklist 已按明确要求从 `codex/miniprogram-performance-audit-docs` 合入 `main`。
- 后续每次执行创建独立 Run 记录，不覆盖模板和历史原始证据。
- 代码优化分支应从执行时的最新目标代码创建，并在 Run 元数据里记录其与这些文档的关系。
- 需要吸收最新路由或 operation 变化时，先检查差异，再做非破坏性同步；不得用 reset/checkout 删除未知记录。
