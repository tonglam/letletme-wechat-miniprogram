# Live Section — Low-Level 实施计划

- **日期：** 2026-08-10
- **上游文档：** `documents/live-section-high-level-engineering-design.md`
- **代码基线：** `main@0d3b3ab` + 未提交的 binding 简化改动（本计划的前提，先提交）
- **执行范围：** 仅小程序仓库；后端契约依赖显式标注，不阻塞主线

## 0. 与高层文档的三处差异（已确认约束）

| 高层文档 | 本计划采用 | 理由 |
|---|---|---|
| §4.3 principal 状态机（VERIFIED / REBIND / OFFLINE_CACHED） | 关注指针模型：`entryId` 有/无 + web 同步 best-effort | binding 是便利性，非门禁；允许失败 |
| §5.2 web-view 整页交接 | 复制链接（`wx.setClipboardData`）+ 文案指引浏览器 | 小程序主体不支持 web-view 业务域名 |
| §8 context key 含 `viewerPrincipalRevision` | `season + eventId + surface + objectId + entryId` | 无 principal revision 概念 |

不受影响、直接沿用的部分：共享原语抽取、展示态归一化、刷新规则、页面设计、零新增依赖、MP-L1→L6 顺序。

## 1. 现状核对（已读代码确认）

- 三个 Live 页面的轮询生命周期**逐字段重复**：`autoRefreshTimer` / `freshnessRequest` / `freshnessRequestId` / `shouldAutoRefresh()` / `refreshIfChanged()` / `syncAutoRefresh()` / `stopAutoRefresh()` / `cancelFreshnessCheck()`（entry.ts:98-397、match.ts:226-421、tournament.ts:316-658，结构同构）。
- `services/live.service.ts` 已有 `getLiveSnapshot(eventId)` 轻量探测 + snapshot 包裹的全量查询；`utils/live-refresh.ts` 已有纯函数 `liveSnapshotNeedsRefresh` / `shouldPollLiveSnapshot` / `shouldRevalidateCachedLiveSnapshot`。**抽取controller 不改变现有行为语义，只收编重复代码。**
- 现有测试在 `tests/`（node --test + tsx），只测无 `wx` 依赖的纯函数 → 新原语必须保持 `wx` 无关或可注入。
- 「联赛」文案分布在 Live 与 Summary 两处菜单；本期只改 Live 侧。
- 现有 landing 门禁已拆除（binding 简化），MP-L2 的"比赛公开"已落地。

## 2. 工作包总览

| WP | 内容 | 依赖 | 规模 |
|---|---|---|---|
| WP0 | 展示态归一化纯函数 + 模型兼容扩展 | 无 | S |
| WP1 | `live-refresh-controller` 抽取 + 离线停轮询 | 无 | M |
| WP2 | `live-status-bar` 组件 | WP0 | S |
| WP3 | Live Team 迁移 | WP0/WP1/WP2 | M |
| WP4 | Live Matches 迁移 | WP0/WP1/WP2 | M |
| WP5 | Live Competitions：竞赛重命名 + controller | WP0/WP1/WP2 | M |
| WP6 | 观测量 + 全量验证 | WP3-5 | S |
| BG | 后端契约依赖项（见 §7，不在主线） | GraphQL | — |

每个 WP 独立成 commit/PR，按 WP0→6 顺序合入。

## 3. WP0 — 展示态归一化 + 模型兼容扩展

### 3.1 `miniprogram/models/live.ts`（增量，全部可选）

```ts
export type LiveAuthority = "OFFICIAL_FPL" | "LETLETME_RULES" | "MIXED";

export interface LiveSnapshotStatus {
  eventId: number;
  revision: string;
  state: LiveSnapshotState;
  publishedAt: string;
  checkedAt: string;
  // 以下为 GraphQL 契约交付后的增量字段；缺失时展示层降级，不虚构。
  season?: string;
  authority?: LiveAuthority;
  coverageExpected?: number;
  coverageSucceeded?: number;
  coverageFailed?: number;
  reasonCode?: string | null;
}
```

### 3.2 新增 `miniprogram/utils/live-status.ts`（纯函数，无 `wx` 依赖）

```ts
export type LiveDisplayState =
  | "scheduled" | "fresh" | "refreshing" | "delayed"
  | "partial" | "final" | "offline" | "unavailable";

export interface LiveDisplayInput {
  snapshot: LiveSnapshotStatus | null;
  hasData: boolean;
  loading: boolean;          // 全量请求进行中
  probing: boolean;          // revision 探测进行中
  lastError: string;         // 最近一次刷新错误，无则 ""
  online: boolean;
  partialFailedCount?: number; // 竞赛部分失败的行数
}

export function normalizeLiveDisplayState(input: LiveDisplayInput): LiveDisplayState;
```

判定顺序（先匹配先胜出）：

1. `!online && hasData` → `offline`
2. `!hasData && lastError` → `unavailable`
3. `partialFailedCount > 0 && hasData` → `partial`
4. `snapshot?.state === "SETTLED"` → `final`
5. `snapshot?.state === "SCHEDULED" && !hasData` → `scheduled`
6. `loading || probing` → `refreshing`
7. `lastError && hasData` → `delayed`
8. 其余 → `fresh`

### 3.3 测试 `tests/live-status.test.ts`

golden cases 覆盖：8 种状态各至少 1 例 + 优先级冲突例（offline+partial → offline；SETTLED+probing → final；SCHEDULED+hasData → 非 scheduled）。

**验收：** `npm run typecheck && npm test` 通过；无运行时代码引用，行为零变化。

## 4. WP1 — `live-refresh-controller` 抽取

### 4.1 新增 `miniprogram/utils/live-refresh-controller.ts`（核心无 `wx` 依赖）

```ts
export interface LiveRefreshControllerOptions {
  /** 页面守卫：可见 + 选中当前轮 + 未结算 + 目标存在（如有关注球队）。 */
  isEligible: () => boolean;
  /** 当前已接受的快照，用于 revision 比较。 */
  getAcceptedSnapshot: () => LiveSnapshotStatus | null;
  /** 轻量探测，生产环境即 getLiveSnapshot。 */
  probe: () => Promise<LiveSnapshotStatus | null>;
  /** revision/事件变化后的后台全量重载。 */
  reload: () => Promise<void>;
  /** 探测到未变化时采纳新快照（更新 checkedAt 等）。 */
  acceptSnapshot?: (snapshot: LiveSnapshotStatus | null) => void;
  /** 探测失败回调：保留当前数据，页面只更新状态条。 */
  onProbeError?: (message: string) => void;
  /** 额外过期守卫（页面请求 id / 上下文切换）。 */
  isStale?: () => boolean;
  /** 在线判定与订阅，生产注入 wx 实现，测试注入假实现。 */
  isOnline?: () => boolean;
  subscribeNetwork?: (onChange: (online: boolean) => void) => () => void;
  intervalMs?: number; // 默认 LIVE_REFRESH_INTERVAL_MS
}

export interface LiveRefreshController {
  sync(): void;       // 依 isEligible 重建/清除定时器（替代 syncAutoRefresh）
  probeNow(): Promise<void>; // 立即单飞探测（替代 refreshIfChanged）
  stop(): void;       // 清定时器 + 作废进行中探测（替代 stop+cancelFreshnessCheck）
  dispose(): void;    // stop + 退订网络监听（onUnload）
}

export function createLiveRefreshController(opts: LiveRefreshControllerOptions): LiveRefreshController;
```

收编的内部状态（从三页原样迁入）：定时器、`freshnessRequest` 单飞、`freshnessRequestId` 守卫、探测→`liveSnapshotNeedsRefresh` 比较→`reload()` 或 `acceptSnapshot()+sync()`。

**新增能力（只加一次，三页共享）：** 网络离线显式停轮询 + 恢复后一次 `probeNow()`。

### 4.2 新增 `miniprogram/utils/live-network.ts`（`wx` 绑定薄层，无需测试）

```ts
export function isOnline(): boolean; // wx.getNetworkType 同步兜底 true
export function subscribeNetworkStatus(onChange: (online: boolean) => void): () => void; // wx.onNetworkStatusChange/offNetworkStatusChange
```

### 4.3 测试 `tests/live-refresh-controller.test.ts`

注入假 `probe`/`isOnline`/`subscribeNetwork` + 短 `intervalMs`：

- revision 未变 → 只 `acceptSnapshot`，不 `reload`；
- revision 变化 → 恰好一次 `reload`（并发 `probeNow` 合并）；
- 探测失败 → 保留定时器，调 `onProbeError`，不清数据；
- `isEligible()` false → 无定时器；
- 网络断开事件 → 定时器停；恢复 → 一次 `probeNow`；
- `stop()` 后迟到的探测响应被 `isStale`/id 守卫丢弃。

**验收：** 单测通过；页面尚未接入，行为零变化。

## 5. WP2 — `live-status-bar` 组件

新增 `miniprogram/components/live-status-bar/`（四件套）：

```ts
properties: {
  state: String,          // LiveDisplayState
  lastChecked: String,    // "12:03:45" 或 "-"
  coverageText: String,   // 有 coverage 契约才传，如 "38/40"
  retainedCount: Number,  // 竞赛保留行数，>0 时显示
  compact: Boolean
}
events: refresh           // 手动刷新按钮
```

中文标签映射（组件内 wxs 或 ts 常量）：

```text
scheduled 未开始 | fresh 已更新 | refreshing 刷新中 | delayed 数据延迟
partial 部分数据 | final 已结算 | offline 离线，显示上次结果 | unavailable 暂不可用
```

样式：单行紧凑条（44px 触控高度），状态色点 + 文案 + 上次检查时间 + 右侧刷新按钮；320px 画布不折行（省略 coverage 段）。

**验收：** 组件在页面 JSON 注册后可渲染；`npm run typecheck` 通过。

## 6. WP3/4/5 — 页面迁移（统一接线模式）

三页迁移结构相同，此处定义一次，逐页应用：

```ts
// 页面创建（onLoad 或字段初始化）：
this.liveRefresh = createLiveRefreshController({
  isEligible: () => this.shouldAutoRefresh(),   // 页面保留，逻辑不变
  getAcceptedSnapshot: () => this.liveSnapshot,
  probe: () => getLiveSnapshot(this.data.event),
  reload: () => this.loadData({ background: true, forceRefresh: true }),
  acceptSnapshot: (s) => { this.liveSnapshot = s; this.setData({ error: "" }); },
  onProbeError: (m) => this.setData({ error: m }),
  isOnline,
  subscribeNetwork: subscribeNetworkStatus
});

onShow()  { ...; this.liveRefresh.sync(); }       // 替代 syncAutoRefresh()
onHide()  { ...; this.liveRefresh.stop(); }       // 替代 stopAutoRefresh()
onUnload(){ this.liveRefresh.dispose(); }
// GW/竞赛切换：this.liveRefresh.stop()（内含探测作废），再 sync()
```

逐页删除：`autoRefreshTimer` / `freshnessRequest` / `freshnessRequestId` / `refreshIfChanged()` / `syncAutoRefresh()` / `stopAutoRefresh()` / `cancelFreshnessCheck()` 字段与方法。页面保留：全量请求自己的 id 守卫（`liveRequestId` / `rowsRequestId`）、数据映射、`shouldAutoRefresh()` 的页面守卫（如 entry 页的 `this.data.entryId` 检查）。

状态条接入：每页 `data` 增加 `displayState` / `lastCheckedText`，在 `setData` 集中处调用 `normalizeLiveDisplayState(...)` 计算；WXML 顶部插入 `<live-status-bar ... bind:refresh="onRetry" />`。

### WP3 — Live Team（`pages/live/entry/`）

- 按上模式迁移；转会加载保持独立（`transfersRequestId` 不动）。
- 显式 `?entry=` 深链：维持只读（现状已不写存储），页面头部加一行「查看模式」小字标注（仅显式 entry 且与关注不同时显示）。
- 测试：沿用 `tests/live-entry-player.test.ts` / `live-entry-transfer.test.ts`，新增 controller 接线 smoke（可注入假 probe）。

### WP4 — Live Matches（`pages/live/match/`）

- 按上模式迁移；无关注不挡（已落地）。
- 季前/无当前轮：`globalData.gw` 为空时默认选中「下一轮」tab，`displayState=scheduled`，不渲染为系统错误（改 `shouldAutoRefresh` 的 currentEventId 判定即可，无需契约）。
- 「我的球队影响」标记：**后端契约依赖，见 §7，不在本期。**

### WP5 — Live Competitions（`pages/live/tournament/`，路由不变）

- 按上模式迁移（探测以选中竞赛的 event 上下文为准；保留行语义不变）。
- **竞赛重命名（仅 Live 侧）：**
  - `pages/live/index/index.ts` 卡片「实时联赛」→「实时竞赛」，描述同步；
  - `pages/live/tournament/tournament.json` `navigationBarTitleText` →「实时竞赛」；
  - `pages/live/tournament/tournament.wxml` 标题「实时联赛」→「实时竞赛」（选择器「联赛」字段标签保留——官方联赛仍是选择器内容的一部分，避免过度改名）；
  - `components/navigation/bottomNavBar/bottomNavBar.ts:18` Live 组「联赛」→「竞赛」（Summary 组 :32 不动）。
- 空态追加管理指引：无 prepared 竞赛时，在现有空态下加一行「创建和管理竞赛请访问 LetLetMe 网页版」，点击 `wx.setClipboardData` 复制站点 URL 并 toast「链接已复制，请在浏览器打开」。
- prepared 索引 / 判别渲染（OFFICIAL_CLASSIC / CUSTOM_KNOCKOUT 等）：**后端契约依赖，见 §7。**

**每页迁移验收：** 对应页面的轮询行为与迁移前一致（可见性停止、revision 未变不全量、切换上下文无串数据）+ 新增离线停轮询生效 + 状态条八态可演示。

## 7. 后端契约依赖项（BG，明确排除在主线外）

| 项 | 解锁内容 | 前置 |
|---|---|---|
| `LiveResultMeta` 字段（authority/coverage/reasonCode） | 状态条显示 coverage/保留行数；`partial` 的精确判定（当前用 `partialFailedCount` 近似） | GraphQL 交付后，WP0 模型直接消费，无需再改解析 |
| `entryPreparedCompetitions` / `competitionLive` 判别契约 | WP5 的竞赛索引、kind/format/readiness、5 种结果体渲染 | GraphQL+Data |
| viewer-impact overlay | WP4「首发/队长/副队/替补」标记 | GraphQL |
| Website canonical link contract | 竞赛管理复制链接的目标 URL 集中注册 | Website |

兼容原则沿用高层文档 §11：字段缺失时展示降级，不虚构 authority/coverage；旧快照形状下只显示 scheduled/live/final 基础态。

## 8. WP6 — 观测量 + 全量验证

### 8.1 `miniprogram/utils/perf.ts` 增量

新增 `recordLiveTransition(record: LiveTransitionRecord)`，复用现有 ring buffer 模式（上限 100 条、flush 永不抛错）。字段取高层文档 §13 子集：`surface / season / eventId / isCurrentEvent / snapshotState / revisionChanged / displayState / coverageFailed / retainedRowCount / probeDurationBucket / fullFetchDurationBucket`。不含 token/email/openid/队名/完整 payload；entryId、competitionId 不记录。接入点：controller 的 probe/reload 完成处 + 页面 displayState 变化处。

### 8.2 验证清单

```text
npm run typecheck
npm run lint
npm test
npm run package:check
git diff --check
```

DevTools 场景（每页）：八态状态条演示、后台切前台一次探测、断网保留 last-good + 状态条离线态、恢复后自动探测、历史 GW 不轮询、320×568 与 390×844 画布状态条不折行。季前无数据属合法数据态，记录为 deferred checkpoint。

## 9. 执行顺序与提交切分

```text
0. 提交当前未提交的 binding 简化（本计划前提）
1. WP0  models + live-status + 测试           —— 1 commit
2. WP1  refresh-controller + live-network + 测试 —— 1 commit
3. WP2  live-status-bar 组件                   —— 1 commit
4. WP3  Live Team 迁移                         —— 1 commit
5. WP4  Live Matches 迁移                      —— 1 commit
6. WP5  Live Competitions 迁移 + 竞赛重命名     —— 1 commit
7. WP6  观测量 + 验证                          —— 1 commit
```

WP1 完成后即可逐页迁移，WP3→4→5 顺序与高层文档 rollout 一致（Team → Matches → Competitions）。
