# 小程序性能优化实施与验收 Run：2026-08-14

> 状态：Mini 侧五个交付阶段均已实现；PR0 已合并，PR1 已通过 CI 和 Codex 复审但仍受仓库 review-thread resolution 规则阻塞，PR2-PR5 以独立本地提交等待固定顺序发布。
>
> 本 Run 只修改微信小程序仓库。没有修改 Web、GraphQL resolver、Data、数据库、生产部署或公共发布；`miniprogram/config/mock-mode.ts` 未改。审计证据原稿写在 `codex/miniprogram-performance-audit-docs`，2026-08-18 已按明确要求合入 `main`。

## 1. 版本与边界

| 项目 | 值 |
|---|---|
| PR0 / observability | GitHub PR `#33`；merge commit `6361b99cdf26367e199d49c0981d683a6277ae49` |
| PR1 / Live Tournament | GitHub PR `#34`；当前 head `2ea60f12c7ac3ddb31e929efa95704d8c7dfbe95` |
| PR2 / Competitions | 本地独立提交 `300febd` |
| PR3 / Fixtures | 本地独立提交 `0ee83c8` |
| PR4 / My FPL Overview | 本地独立提交 `abca808` |
| PR5 / build/package Gate | 本地独立提交 `dfaaae2` |
| 运行时组合 head | `dfaaae2`，tracked clean |
| PR1 latest + PR2-PR5 集成验证 head | 临时本地 `29604e0`，tracked clean；不推送、不改变独立 PR 顺序 |
| 测试平台 | 微信 DevTools simulator；iPhone 12/13 Pro profile；`390 x 753`；DPR 3；SDK `3.15.2` |
| 身份 | 已绑定 rich-state；证据不记录 token |
| 当前业务上下文 | season `2627`；当前比赛周尚未开始，display event 为 1 |
| iOS / Android 真机 | ⚪ 本轮未执行，不记为通过 |

固定发布顺序仍是 `PR0 -> PR1 -> PR2 -> PR3 -> PR4 -> PR5`。后四个提交不得作为一个大 PR 合并；前一 PR 合并后，后一提交必须基于最新 `main` 重新形成独立 PR。

## 2. 五阶段实现结果

| 阶段 | 实现结果 | 当前发布状态 |
|---|---|---|
| 1. 可信观测基线 | Page lifecycle token、主内容可见边界、API/cache/network attribution 与 performance 页面进入 `main` | 🟢 PR0 已合并 |
| 2. 页面语义正确性 | Live Tournament 将 `currentEvent=0` 统一映射为 `preseason` 业务空态；启动、上下文切换和错误恢复共用纯状态构造；真实失败会退出空态并显示重试 | 🟡 PR1 代码/CI/复审通过，等待关闭已修复 review threads |
| 3a. Competitions | 页面唯一拥有刷新上下文；显式 season 传给目录 service；新鲜上下文不再读 `CurrentEventInfo` | ⚪ PR2 本地实现完成，等待 PR1 |
| 3b. Fixtures | 同赛季复用页面 `teams`；刷新只强制 `FixtureWindow`；赛季切换清旧数据并重载目录 | ⚪ PR3 本地实现完成，等待 PR2 |
| 3c. My FPL Overview | 新增单一 `MyFplOverview` operation；三个 root 独立降级；季前跳过 event result；partial data 不进 transport cache | ⚪ PR4 本地实现完成，等待 PR3 |
| 4. 构建与包体 Gate | 固定 `miniprogram-ci@2.1.5`；CI/上传共享 `build npm -> prune Vant -> verify closure`；缺目录和非法闭包均失败 | ⚪ PR5 本地实现完成，等待 PR4 |
| 5. 全页面回归 | 25/25 静态可见边界、379/379 自动测试和五页共 50 次真实刷新已完成；真机未执行 | 🟡 DevTools 主运行完成，PR1 精确分支二次启动因 DevTools 退出登录未执行 |

## 3. 自动化 Gate

运行时组合 head `dfaaae2` 的测试为 379/379。随后将 PR1 复审修正 head `2ea60f1` 与 PR2-PR5 四个独立提交无冲突叠加到临时验证 head `29604e0`，从干净 `npm ci` 重新执行全部 Gate：

| Gate | 结果 |
|---|---|
| `npm run lint` | 🟢 |
| `npm run typecheck` | 🟢 |
| `npm test` | 🟢 最终集成 380/380，0 fail/skip/cancel |
| `npm run check:style` | 🟢 `style-drift: clean` |
| 25 注册页静态覆盖 | 🟢 25/25，loading placeholder 不作为完成边界 |
| `npm run package:check` | 🟢；仅为 repository `npm pack --dry-run`，不冒充微信包体 Gate |
| `npm run prepare:miniprogram` | 🟢 build 1 package；裁剪 59 个目录；保留 13 个；3 个直接引用闭包合法 |
| `npm audit --omit=dev --audit-level=high` | 🟢 0 vulnerabilities |
| tracked worktree / `git diff --check` | 🟢 clean / clean |

Vant Gate 的负向测试覆盖：缺构建目录、缺 KEEP 组件、多余顶层组件、未登记引用、断裂相对依赖；合法闭包通过。CI 和微信上传 workflow 都调用同一个 `prepare:miniprogram`，不再各自复制内联构建逻辑。

## 4. 10 次 Refresh nearest-rank p95

采样规则：五页串行、每页真实调用十次 `onPullDownRefresh`；每次等待生命周期 Promise 和页面 busy state 结束，再读取 `PagePerformance` 与 API attribution。`n=10` 的 nearest-rank p95 等于最大样本。缓存命中、页面初次进入和其他 caller surface 不混入刷新分布。

| 页面 | 10 次业务网络 operation | 页面 complete p95 | 唯一 operation 网络 p95 | 结论 |
|---|---:|---:|---:|---|
| Competitions | `EntryTournaments` 10；其他 0 | 822ms | 764ms | 🟢 请求图目标；🔴 超 600ms |
| Fixtures | `FixtureWindow` 10；Teams 0；CurrentEventInfo 0 | 581ms | 507ms | 🟢 请求图与 p95 均通过 |
| My FPL Overview | `MyFplOverview` 10；GetEntry 0；EntryLeagues 0；CurrentEventInfo 0 | 1052ms | 977ms | 🟢 请求图目标；🔴 超 600ms |
| Live Entry | `CalcLivePointsByEntry` 10；其他 0 | 1088ms | 1010ms | 🟢 保持单业务请求；🔴 外部尾延迟 |
| Market / Daily | `GetPlayerValues` 10；其他 0 | 757ms | 688ms | 🟢 保持单业务请求；🔴 外部尾延迟 |

合计证据：

- 50 轮刷新，50 次业务网络 operation；每轮均为 1 次；
- API failure 0、refresh timeout 0、调用异常 0；
- console event 0、automation exception 0；
- 新鲜上下文下五页均未发送 `CurrentEventInfo`；
- Fixtures 十轮未发送 `Teams`；Overview 十轮未发送独立 `GetEntry` 或 `EntryLeagues`；
- 四个超标页面的页面耗时与唯一上游 operation 尾延迟同向，不能继续通过 Mini 侧删必要请求、提前结束 loading 或隐藏 secondary operation 制造绿灯。

逐次页面 complete 样本（ms）：

| 页面 | 01 -> 10 |
|---|---|
| Competitions | `811, 822, 782, 806, 797, 772, 767, 776, 781, 773` |
| Fixtures | `576, 561, 534, 558, 556, 552, 581, 558, 544, 556` |
| My FPL Overview | `788, 803, 792, 796, 808, 778, 781, 794, 786, 1052` |
| Live Entry | `1088, 1038, 1070, 1037, 1042, 1046, 1036, 1036, 1035, 1032` |
| Market | `757, 706, 692, 699, 701, 696, 703, 700, 696, 702` |

逐次唯一 operation 网络样本（ms）：

| operation | 01 -> 10 |
|---|---|
| EntryTournaments | `745, 764, 726, 747, 732, 709, 707, 711, 722, 716` |
| FixtureWindow | `493, 492, 474, 476, 479, 474, 507, 490, 484, 481` |
| MyFplOverview | `728, 729, 719, 723, 728, 714, 710, 719, 725, 977` |
| CalcLivePointsByEntry | `1010, 955, 985, 959, 951, 959, 956, 955, 949, 957` |
| GetPlayerValues | `688, 627, 615, 631, 629, 614, 619, 635, 630, 629` |

## 5. 正确性与未完成矩阵

| 项目 | 状态 | 说明 |
|---|---|---|
| Live Tournament 启动季前 | 🟢 自动测试 | `preseason`、指定标题/描述、无 action、无错误 |
| Live Tournament 切换到季前 | 🟢 自动测试 | 使用同一纯状态构造并清理旧列表/错误 |
| Live Tournament 从季前恢复 | 🟢 自动测试 | 正 event 清空 preseason 并重新加载目录 |
| Live Tournament 季前真实 context failure | 🟢 自动测试 | 退出 preseason，显示真实错误和重试入口 |
| Players SQL error | ⚪ 本轮不改 | 继续显示 error/last-good；不伪装为空结果 |
| 三身份与 401 single-flight | 🟢 既有与新增自动测试 | principal revision、缓存隔离和单次重放仍受回归保护 |
| hide/show、快速切换、迟到响应 | 🟢 自动测试 | lifecycle/request revision 回归用例通过 |
| DevTools 五页 rich-state 刷新 | 🟢 | 50/50 稳定终态 |
| PR1 exact-head DevTools 二次 smoke | 🟡 未执行 | DevTools 在前一轮后退出登录；不以自动测试冒充运行时证据 |
| iOS / Android 真机 | ⚪ 未执行 | 不能记为通过 |

## 6. 退出判断

可以宣布：

1. Mini Refresh 请求 ownership 与重复请求治理已在实现层完成；
2. 五个目标页全部达到一轮刷新一个业务网络 operation；
3. Fixtures 同时达到 `<=600ms` 页面 p95；
4. Live Tournament 的 Mini 可控季前语义缺陷已修复并通过代码级三路径回归；
5. 微信 npm 构建、Vant 裁剪和依赖闭包已有单一、可失败的真实 Gate。

不能宣布：

1. 产品性能 Gate 全绿；Competitions、Overview、Live Entry、Market 仍超过 600ms；
2. iOS/Android 通过；本轮未执行；
3. Players 后端错误已修；本轮边界明确不改 GraphQL/Data/数据库；
4. PR1-PR5 已全部进入 `main`；当前仍受固定发布顺序和 PR1 review-thread resolution 阻塞。

后续只需按固定 PR 顺序完成发布、对每个新 `main` head 重跑同一 Gate，并在本文件追加最终 merge SHA/CI 结果；不得把四个上游尾延迟红灯改写成 Mini 侧通过。
