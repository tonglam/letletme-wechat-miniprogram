# LetLetMe 微信小程序 My FPL Section — Low-Level Implementation Plan

- **Status:** 待执行
- **Written:** 10 August 2026
- **上游文档:** `documents/my-fpl-section-high-level-engineering-design.md`(用户提供的 Section 2/4)
- **代码基线:** main@`b0b4c4b`(binding 简化 + Live section 全部落地之后)
- **执行方式:** 每个 WP 一个 commit,按 §9 顺序执行

---

## 1. 与高层文档的校准(Amendments)

高层文档基线为 `0d3b3ab`,且明确声明「不覆盖本地进行中的 binding 编辑」。本地两项既定决策(bidding 简化 a1940a7、Live WP5 的 handoff 模式)与文档存在冲突,按用户既定约束校准如下:

| # | 高层文档 | 本计划落地 |
| --- | --- | --- |
| A1 | §9/§17.13 handoff 使用整页 web-view | **web-view 不可用**(用户既定约束)。handoff = `wx.setClipboardData` 复制链接 + 说明文案(沿用 Live WP5 `onCopyCompetitionLink` 模式)。§9 的 web-view 行为规范、§17.13 完成标准不在本计划范围 |
| A2 | §4.1 PrincipalContext 状态机(ACCOUNT_LINK_REQUIRED / TEAM_BINDING_REQUIRED / TEAM_REBIND_REQUIRED / READY / OFFLINE_CACHED),Website 唯一权威 | **不落地新权威**。`entryId` 仍是本地「我的球队」follow 指针(a1940a7 既定模型):展示性偏好、无所有权语义;手动选择为基线,网页验证同步为增强(只增不换、失败绝不清除)。小程序侧只派生三个**展示态**:`READY`(有 follow)/ `NO_FOLLOW`(无 follow)/ `OFFLINE_CACHED`(离线 + 有同上下文缓存)。`TEAM_REBIND_REQUIRED` 阻塞态不做——赛季过期属数据展示态,附网页同步入口。现有 `pages/account/link` 保留为尽力同步入口,不算第二权威 |
| A3 | §6 底部导航重塑为 实时｜我的 FPL｜赛事｜探索 | 本计划只**新增「我的 FPL」tab**(第 4 个可见 tab)。`赛事`/`探索` 分组归 Section 3/4 文档;现有 `实时/统计/数据` 组保持不动 |
| A4 | §8 material changes + live-to-final reconciliation + saved context(MP-M5) | **整体 backend-gated**,本计划不排期。需要双 revision 证据与 `myFplRelevantChanges` / reconciliation 读模型,均不存在;首访不得虚构「since last time」 |
| A5 | §4.2 phase 含 SETTLING,服务端权威 | 现有 `LiveSnapshotState` 只有 `SCHEDULED/LIVE/SETTLED`,无 SETTLING 信号。`currentEventInfo.phase` 列为 backend-gated 增量字段;就绪前用客户端纯函数推导,deadline 已过且无 SETTLED 快照时显示「处理中」展示态,**不断言任何 final 结果** |

另:高层文档 §2.1 对 league reads 的描述(id、name、started-event)比实际略好——现有 `EntryLeagues` 查询(见 `services/common.service.ts:156` 与 `services/entry.service.ts:35`,两处重复)**只返回 `id, name`**;`EntryLeague` 模型虽有可选 `rank`,查询并未取。

## 2. 已验证的当前代码事实

- 路由:`app.json` 19 页,无 `my-fpl/*`;`summaryEntry` 除 `config/routes.ts` 与 bottomNavBar 外**无任何内部引用**,rehome 成本低。
- bottomNavBar(`components/navigation/bottomNavBar/`):van-tabbar 3 个可见 tab(实时/统计/数据)+ 隐藏性能;MENU_MAP 分组驱动 action sheet。
- `common.service.ts` `currentEventInfo` 已返回 `season / currentEvent / nextEvent / nextUtcDeadline` —— SeasonContext 的现有数据源,无 phase。
- `entry.service.ts`:`getEntryInfo / getEntryLeagueInfo / getEntryHistoryInfo / getEntryEventResult / getEntryEventTransfers / getEntryAllTransfers`。
- `summary/entry` 页(501 ts + 169 wxml):四 tab(squad/transfer/chips/history),无赛季选择器(历史 tab 内含 seasonHistoryRows)。可直接物理迁移。
- `auth.service.ts`:`getApiSessionToken`(判 LINKED)、session profile `fplEntryId`(verified follow 来源)。
- `app.ts`:`revalidateSessionProfile` 已在 resume 时尽力刷新 verified entry——handoff 返回刷新直接复用。
- `pages/performance` 已有 perf 页;`utils/perf.ts` ring buffer 模式(WP6 复用)。

## 3. 目标结构(本计划范围内)

```text
miniprogram/models/principal.ts            WP0  派生展示态类型
miniprogram/models/my-fpl.ts               WP0  phase / 页面视图模型类型
miniprogram/utils/my-fpl-phase.ts          WP0  phase + 展示态纯函数
miniprogram/services/my-fpl.service.ts     WP1  上下文与聚合读(客户端组合,无新后端依赖)
miniprogram/utils/canonical-action.ts      WP2  网页动作链接 allowlist + copy-link
miniprogram/components/my-fpl-phase-card/  WP3  总览主卡组件
miniprogram/pages/my-fpl/index/index       WP3  总览
miniprogram/pages/my-fpl/team/team         WP4  球队(自 summary/entry 物理迁移)
miniprogram/pages/my-fpl/leagues/leagues   WP5  官方联赛列表
```

零新增运行时依赖;复用 @vant/weapp、`app-empty-state`、live 页的 last-good/缓存模式。

## 4. WP0 — 模型 + phase 纯函数

### 4.1 `miniprogram/models/principal.ts`(新建)

```ts
export type MyFplPrincipalState = "READY" | "NO_FOLLOW" | "OFFLINE_CACHED";

export interface PrincipalDisplayInput {
  entryId?: number;          // 本地 follow 指针
  accountLinked: boolean;    // session token 存在
  online: boolean;
  hasCachedContent: boolean; // 同上下文 last-good 存在
}
```

### 4.2 `miniprogram/models/my-fpl.ts`(新建)

```ts
export type MyFplPhase = "PRESEASON" | "PRE_DEADLINE" | "LIVE" | "SETTLING" | "SETTLED" | "OFFSEASON";

export interface MyFplContext {
  season?: string;
  currentEvent?: number;
  nextEvent?: number;
  utcDeadline?: string;
  entryId?: number;
  accountLinked: boolean;
}

export interface MyFplTeamBrief {   // 总览主卡 + 二级摘要用
  entryName?: string;
  playerName?: string;
  eventPoints?: number;      // 当前/最近 GW
  overallPoints?: number;
  overallRank?: number;
}

export interface MyFplLeagueBrief { // 联赛列表行;关联/覆盖字段全部可选,缺省即降级
  id: number;
  name: string;
  viewerRank?: number;       // backend-gated(模型已有,查询未取)
  associationCount?: number; // backend-gated
}
```

### 4.3 `miniprogram/utils/my-fpl-phase.ts`(新建)

```ts
export interface MyFplPhaseInput {
  currentEvent?: number;
  nextEvent?: number;
  nextUtcDeadline?: string;
  now: number;                       // 注入,禁直接 Date.now(测试可控)
  snapshotState?: LiveSnapshotState; // 当前 event 的 live 快照(已知时)
  serverPhase?: string;              // backend-gated;合法值优先于一切推导
}
export function deriveMyFplPhase(input: MyFplPhaseInput): MyFplPhase;
export function derivePrincipalDisplay(input: PrincipalDisplayInput): MyFplPrincipalState;
```

推导顺序(先命中先返回):

1. `serverPhase` 为六值之一 → 直接用(A5 后端就绪路径)。
2. `!currentEvent && nextEvent` → `PRESEASON`;`!currentEvent && !nextEvent` → `OFFSEASON`。
3. `snapshotState === "LIVE"` → `LIVE`;`"SCHEDULED"` → `PRE_DEADLINE`;`"SETTLED"` → `SETTLED`。
4. 无快照:`nextUtcDeadline && now < deadline` → `PRE_DEADLINE`;否则 → `SETTLING`(「处理中」展示,A5 fallback,不断言 final)。

`derivePrincipalDisplay`:`!online && hasCachedContent` → `OFFLINE_CACHED`;`entryId` → `READY`;否则 `NO_FOLLOW`。

### 4.4 测试 `tests/my-fpl-phase.test.ts`(新建)

golden + 优先级用例 ≥12:serverPhase 优先/非法忽略、preseason、offseason、三快照态、deadline 前后、无 deadline 无快照 → SETTLING、OFFLINE_CACHED 优先于 READY、NO_FOLLOW。沿用现有 plain-assert 风格。

## 5. WP1 — `services/my-fpl.service.ts`(新建)

```ts
export async function getMyFplContext(forceRefresh?: boolean): Promise<MyFplContext>;
//   = getCurrentEventAndDeadline + getEntryId(storage) + getApiSessionToken 组合,零新查询。

export async function getMyFplTeamBrief(entryId: number, event: number): Promise<MyFplTeamBrief | null>;
//   = getEntryInfo + getEntryEventResult 组合;失败返回 null(调用方保留 last-good)。

export async function getMyFplLeagues(entryId: number): Promise<MyFplLeagueBrief[]>;
//   = 现有 getEntryLeagueInfo(id/name);viewerRank/association 缺省。

export async function getCurrentSnapshotState(event: number): Promise<LiveSnapshotState | undefined>;
//   = getLiveSnapshot(event) 轻量探测,仅供 phase 推导;失败返回 undefined(不阻塞总览)。
```

规则:

- 缓存键 `entryId + event + surface`,复用 `graphql.service` 的 TTL 缓存;页面侧另存 last-good(storage,同 Live 页模式)。
- 全部失败容忍:任何子读失败降级为部分视图,**绝不清除 follow**;错误以展示态呈现。
- 请求代际计数器拒绝 stale 响应(entry/event 切换后丢弃迟到的响应)。

测试 `tests/my-fpl-service.test.ts`(新建):组合逻辑用注入的 mock fetch 验证——部分失败降级、stale 拒绝、缓存键隔离。若 service 层难以注入,则把组合逻辑收成纯函数 `mergeMyFplOverview(...)` 放 service 文件内导出,测试纯函数,IO 壳保持薄。

## 6. WP2 — `utils/canonical-action.ts`(新建)

```ts
export interface CanonicalAction {
  actionType: "ACCOUNT_LINK" | "TEAM_BIND" | "LEAGUE_PREPARE" | "LEAGUE_MANAGE" | "OPEN_HOME";
  href: string;
}

export function isAllowedWebsiteUrl(href: string): boolean;
//   https + host ∈ { www.letletme.top, letletme.top } allowlist;其余一律拒绝。

export function openWebsiteAction(action: CanonicalAction): void;
//   校验 → wx.setClipboardData({ data: href }) → toast「链接已复制,请在浏览器打开,可能需要登录网页版」。
//   URL 只允许静态常量,绝不拼接 token / email / openid / entryId。
```

动作 → URL 常量表(静态写死,与 env.ts 站点一致):

```ts
ACCOUNT_LINK  → https://www.letletme.top/zh-CN/account
TEAM_BIND     → https://www.letletme.top/zh-CN/account
LEAGUE_PREPARE→ https://www.letletme.top/zh-CN/tournament
LEAGUE_MANAGE → https://www.letletme.top/zh-CN/tournament
OPEN_HOME     → https://www.letletme.top/zh-CN
```

返回刷新:页面 `onShow` 复用现有模式(重读 follow 指针 + `getApp().revalidateSessionProfile()` 已在 app.ts resume 路径),无新增机制。

测试 `tests/canonical-action.test.ts`(新建):allowlist 正/反例(http、异host、子域、空串),动作表完整性。

## 7. WP3 — 总览页 + phase 卡组件 + 导航

### 7.1 `components/my-fpl-phase-card/`(新建,4 文件)

properties:`phase / principalState / deadline / teamBrief / eventId / compact`;events:`primary / secondary`。
渲染:每 phase 一套标题/描述/主按钮(组件内 STATE_META map,沿用 live-status-bar 模式):

| phase | 主卡 | 主按钮 |
| --- | --- | --- |
| PRESEASON / OFFSEASON | 赛季状态 + follow 队名(如有) | 查看球队 |
| PRE_DEADLINE | deadline 倒计时 + 最近已冻结公开阵容摘要(不含私有草稿断言) | 查看球队 |
| LIVE | 当前 event 得分概要 | 去实时球队 |
| SETTLING | 「结算处理中」+ 最近一致临时结果 | 查看球队(禁用措辞不断言 final) |
| SETTLED | 最近 GW 最终得分/总分/排名 | 查看球队复盘 |
| NO_FOLLOW 态 | 覆盖主卡:说明 + 「选择我的球队」 | 去选择球队(次按钮:账号同步 → account/link) |
| OFFLINE_CACHED | 缓存内容 + 离线标记 | 同原 phase |

### 7.2 `pages/my-fpl/index/index`(新建,4 文件 + app.json 注册)

- `onLoad`:`getMyFplContext` → 渲染骨架;`getCurrentSnapshotState` 与 `getMyFplTeamBrief` 并行、**不阻塞主卡**;phase 由 `deriveMyFplPhase` 推导。
- 二级模块(有界、可折叠、失败独立降级):我的联赛数量摘要(WP1 leagues 读)、LIVE 时一条实时入口条。saved context / relevant changes 不做(A4)。
- last-good:同上下文(entryId+event)缓存写 storage;失败保留 + 状态条;复用 `subscribeNetworkStatus` 标记离线。
- pull-to-refresh 强制绕过缓存;`onShow` 重读 follow(网页同步后返回即生效)。
- 导航:主按钮按 phase 跳 `myFplTeam` / `liveEntry` / `entrySearch`;次级摘要行跳 `myFplLeagues`。

### 7.3 bottomNavBar 增量

- MENU_MAP 新增 `myFpl` 组:`总览 / 球队 / 联赛` → 三条新路由;`ROUTE_GROUPS` 加 `{ prefix: "/pages/my-fpl/", active: "myFpl" }`。
- wxml 在第 1 位插入 `<van-tabbar-item name="myFpl" icon="user-o">我的 FPL</van-tabbar-item>`(实时右移一位;统计/数据不动,A3)。
- `config/routes.ts` 加 `myFplIndex / myFplTeam / myFplLeagues`。

### 7.4 测试

`test/` 现有 page-state 风格覆盖总览:onLoad 调用序(context → 非阻塞二级读)、follow 缺失 → NO_FOLLOW 渲染分支、phase 卡事件路由正确。wp3 同时更新 `test/live-page-state.test.mjs` 不受影响(无交叉)。

## 8. WP4 — 球队 rehome + WP5 联赛列表

### 8.1 WP4 `pages/my-fpl/team/team`

- 物理迁移 `pages/summary/entry/*` 四文件 → `pages/my-fpl/team/*`(git mv 语义,一个 commit 内完成),组件相对路径修正。
- 原路由保留兼容壳:`pages/summary/entry/entry.ts` 瘦身为 `onLoad(options) → wx.redirectTo({ url: myFplTeam + 原 query })`;wxml/wxss/json 最小化。外部/分享旧链接不断。
- bottomNavBar:`summary` 组 `球队` 项改指 `myFpl/team`…… 不,A3 规定 summary 组不动;**我的 FPL 组球队项指新路由**,summary 组原项让它自然走到兼容壳(重定向后落地新页,用户无感)。summary 组清理归后续 section。
- phase 横幅:LIVE 时页顶一条「进行中,去看实时」链接(跳 `liveEntry`,不在本页起第二个轮询引擎);SETTLING 显示「结算处理中」;SETTLED 无 SettledResultMeta 时维持现状(backend-gated §10)。
- 四 tab 上限、事件选择器保留;不加赛季选择器(历史 tab 已含赛季行)。

### 8.2 WP5 `pages/my-fpl/leagues/leagues`(新建,4 文件 + 注册)

- 数据:`getMyFplLeagues(follow entryId)`;NO_FOLLOW → empty state「先选择我的球队」(复用 app-empty-state + `goToEntrySearch`)。
- 行:`联赛名` + `viewerRank(有才显示)` + 「未关联竞赛」降级文案 + 主操作「网页查看/筹备」→ `openWebsiteAction(LEAGUE_PREPARE)`。
- 搜索:客户端 filter(联赛数小);无额外可见筛选器(控制预算 §5.3)。
- 下拉刷新强制重取;last-good + 错误态与 Live 页一致。
- `pages/my-fpl/league/league` 详情页**不建**——`id/name` 之外无内容,详情读模型列入 backend-gated §10;行主操作即网页 handoff。

## 9. WP6 — 观测量 + 全量验证

### 9.1 `utils/perf.ts` 增量

```ts
export interface MyFplVisitRecord {
  surface: "overview" | "team" | "leagues";
  principalState?: MyFplPrincipalState;
  phase?: MyFplPhase;
  eventId?: number;
  cacheOutcome?: "fresh" | "last-good" | "miss";
  handoffActionType?: string;
  durationBucket?: string;
  ts: number;
}
export function recordMyFplVisit(record: Omit<MyFplVisitRecord, "ts">): void;
```

复用 ring buffer(100 上限、flush 永不抛错、旧缓存兼容)。记录点:总览主卡首渲(phase + cacheOutcome + durationBucket)、handoff 动作(actionType)、页面 principalState 变化。**不记** token/email/openid/队名/联赛名/完整 entryId 之外的标识——entryId 本身不记(A2 语义敏感,follow 指针也不入遥测)。

### 9.2 验证清单

```text
npm run typecheck
npm run lint
npm test
npm run package:check
git diff --check
```

DevTools 手测(deferred checkpoint):NO_FOLLOW / READY / OFFLINE_CACHED 三态;六 phase 主卡(SETTLING 用 mock deadline);handoff 复制链接 + 返回后 follow 刷新;四 tab 球队页迁移 + 旧路由重定向;320×568 / 390×844 主卡不折行;核心路径 ≤3 跳。

### 9.3 提交顺序

```text
1. WP0 models + my-fpl-phase + 测试          —— 1 commit
2. WP1 my-fpl.service + 测试                 —— 1 commit
3. WP2 canonical-action + 测试               —— 1 commit
4. WP3 总览页 + phase-card + 导航             —— 1 commit
5. WP4 球队 rehome + 兼容壳                   —— 1 commit
6. WP5 联赛列表                              —— 1 commit
7. WP6 观测量 + 验证                         —— 1 commit
```

## 10. Backend-gated(不在本计划,接口就绪前不得阻塞上述 WP)

| 项 | 需要 | 缺省行为(已内建于上述实现) |
| --- | --- | --- |
| `currentEventInfo.phase` | 服务端六值 phase | WP0 客户端推导,非法/缺省忽略 |
| `EntryLeagues` 增量字段 | leagueType / startedEvent / viewerRank / rankMovement / coverage | 行只显示 id/name,关联数缺省即「未关联竞赛」 |
| Competition 关联列表 | LeagueCompetitionAssociation(0..n) | 无关联展示,网页筹备入口保留 |
| `myFplOverview` 聚合读 | 服务端 display-ready 摘要 | WP1 客户端组合替代 |
| `SettledResultMeta` on EntryEventResult | state/coverage/factsRevision | 球队页维持现状,SETTLED 措辞保守 |
| Relevant changes + ack | myFplRelevantChanges + last-seen 端点 | A4,不排期 |
| Reconciliation | myEntrySettlementReconciliation | A4,不排期 |
| Saved players/rivals context | 共享 season-safe 契约 | A4,不排期 |
| 联赛详情读(邻近行/覆盖) | league detail bounded read | WP5 不建详情页,网页 handoff |
| 服务端 league 搜索/分页 | bounded cursor | 客户端 filter 小列表 |

## 11. 明确不做

- 不实现 web-view(A1)。
- 不落地 PrincipalContext 状态机与 rebind 阻塞(A2);不清除 follow 的任何新路径。
- 不做 relevant changes / reconciliation / saved context / AI 助手 / 任何推荐措辞(A4 + 产品既定)。
- 不做 FPL 官方操作(转会/队长/阵容/开卡)。
- 不动 home 页(它保持 launch router + 公共版块;My FPL 总览不在 home 重复)。
- 不动 summary/data 导航组(A3);不动 summary/tournament(其个人语义迁移归 Section 3)。
- 不新增运行时 npm 依赖;不引图表库。
