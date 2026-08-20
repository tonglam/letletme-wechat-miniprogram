# LetLetMe 微信小程序 Competitions Section — Low-Level Implementation Plan

- **Status:** 待执行
- **Written:** 10 August 2026
- **上游文档:** `documents/competitions-section-high-level-engineering-design.md`(Section 3/4)
- **代码基线:** main@`6073cb4`(Live section + My FPL section 全部落地之后)
- **执行方式:** 每个 WP 一个 commit,按 §9 顺序执行

---

## 1. 与高层文档的校准(Amendments)

高层文档基线为 `0d3b3ab`;本地已落地 Live(b0f5e00 等)与 My FPL(6aead98…6073cb4)。按既定约束校准:

| # | 高层文档 | 本计划落地 |
| --- | --- | --- |
| A1 | §9.4/§11.2/完成标准 18:handoff 用整页 web-view | **web-view 不可用**(既定约束)。复用 My FPL WP2 的 `utils/canonical-action.ts`(https + host allowlist + `wx.setClipboardData`),扩展动作常量表;§11.2 web-view 规范不在范围 |
| A2 | §5.3 signed PrincipalContext(userId / envelopeVersion / principalRevision) | **不落地**。保持本地 follow 指针 + 尽力 session 同步(My FPL A2 既定模型)。organizer/participant union、`myCompetitions` 授权读整体 backend-gated(§10);principal 展示态复用 `models/principal.ts` 三态 |
| A3 | §9.1 目标四段导航 实时｜我的 FPL｜赛事｜探索 | 本计划新增「赛事」为**第 5 个 tab(临时)**。「统计」退役被 RG-COMPETITION-RESULTS + My FPL parity 双 gate(文档 §9.3/§16.3 明确要求保留至 parity);「数据→探索」归 Section 4。tab 合并延后,与 My FPL 计划 A3 一致 |
| A4 | MP-C6.1 Live 联赛→竞赛重命名 | **已完成**(b0f5e00,Live WP5),不再排期 |
| A5 | §5.2 显式 CompetitionIdentity(kind/rosterBehaviour/format/authority) | 契约为 backend-gated。兼容适配器只做保守映射:`state`(ACTIVE/INACTIVE/FINISHED)、`groupMode`(POINTS_RACES)、`knockoutMode`、`totalTeamNum`、GW 区间可用;**kind 无从推断 → 一律「身份信息未就绪」中性展示,不猜**(MP-C1.4)。与 RG-COMPETITION-IDENTITY 的张力:列表在适配器上先行曝光,所有身份字段降级展示,无推断逻辑出适配器 |
| A6 | §6.5/MP-C7 invitation preview | **整体不排期**。读模型不存在;capability material 不得入日志/缓存/分析(§6.5)——无契约时没有任何可安全渲染的投影 |
| A7 | §10.2/§10.3 Competition Home / Results / Participants(MP-C4/C5) | 读模型(`competition` / `competitionResult` / `competitionHistory` / `competitionParticipants`)不存在 → backend-gated(§10)。列表行主目的地 = 现有 **Live 实时竞赛**(预选该赛事)——与文档「当前结果归 Live」的所有权一致;Home/结果页不建空壳 |

## 2. 已验证的当前代码事实

- `entryTournaments`(`services/tournament.service.ts:5`)返回 `id / name / groupMode / totalTeamNum / groupStartedEventId / groupEndedEventId / state / knockoutMode / knockoutStartedEventId / knockoutEndedEventId` —— 比文档 §3.1 暗示的更丰富,适配器有实料。
- `state` 已知取值 `ACTIVE / INACTIVE / FINISHED`(summary/tournament 的 `formatState`);`groupMode` 已知 `POINTS_RACES`;`knockoutMode` 已知 `NO_KNOCKOUT`。
- `getEntrySummaryTournaments` 过滤为 POINTS_RACES 专用(供 summary 页),**不能**当全量列表用 —— 需新增不过滤的全量读。
- Live 竞赛页从 storage `live-tournamentId` / `live-tournamentName` 恢复选中(`live/tournament/tournament.ts:38,502`)→ 赛事列表可写 key 预选后跳转。
- `utils/canonical-action.ts` 已存在(allowlist + copy-link + 动作常量表)。
- bottomNavBar 当前 4 tab:我的 FPL / 实时 / 统计 / 数据;`ROUTE_GROUPS` 前缀驱动 active。
- `summary/tournament` 混排个人与共享(§9.3 rehome 对象),本计划不动。
- `myCompetitions / competition / competitionResult / competitionHistory / competitionParticipants / competitionInvitationPreview` **均不存在**。
- telemetry 惯例:`utils/perf.ts` ring buffer(Live/My FPL 两套记录已落地)。

## 3. 目标结构(本计划范围内)

```text
miniprogram/models/competition.ts              WP0  身份/生命周期/设置/角色类型(契约子集 + unknown)
miniprogram/utils/competition-state.ts         WP0  兼容适配器纯函数(entryTournaments 行 → 列表项)
miniprogram/services/competition.service.ts    WP1  全量读 + last-good 组合
miniprogram/services/tournament.service.ts     WP1  增量:getEntryAllTournaments(不过滤)
miniprogram/utils/canonical-action.ts          WP2  动作表扩展(CREATE/MANAGE/VIEW)
miniprogram/components/competition-card/       WP3  列表卡(一主一次操作)
miniprogram/pages/competitions/index/index     WP3  我的赛事
```

零新增运行时依赖;复用 @vant/weapp、`app-empty-state`、`filter-bar`、last-good 模式。

## 4. WP0 — 模型 + 适配器纯函数

### 4.1 `miniprogram/models/competition.ts`(新建)

```ts
export type CompetitionKind = "TRACKED_OFFICIAL_LEAGUE" | "CUSTOM_TOURNAMENT" | "UNKNOWN";
export type CompetitionLifecycleCompat = "ACTIVE" | "INACTIVE" | "FINISHED" | "UNKNOWN";
export type CompetitionFormatHint = "POINTS_TABLE" | "KNOCKOUT" | "UNKNOWN";

export interface CompetitionListItem {
  competitionId: number;
  name: string;
  /** Adapter output: identity contract is backend-gated; UNKNOWN renders a
   * neutral "身份信息未就绪", never a guessed label (MP-C1.4). */
  kind: CompetitionKind;
  lifecycle: CompetitionLifecycleCompat;
  formatHint: CompetitionFormatHint;
  participantCount?: number;
  startedEventId?: number;
  endedEventId?: number;
}
```

`kind` 在适配器时代恒为 `UNKNOWN`;契约就绪后类型扩为服务端枚举直传。

### 4.2 `miniprogram/utils/competition-state.ts`(新建)

```ts
export interface EntryTournamentRow {  // 适配器输入(与 GraphQL 行同形)
  id: number | string;
  name: string;
  groupMode?: string | null;
  totalTeamNum?: number | null;
  groupStartedEventId?: number | null;
  groupEndedEventId?: number | null;
  state?: string | null;
  knockoutMode?: string | null;
  knockoutStartedEventId?: number | null;
  knockoutEndedEventId?: number | null;
}
export function adaptEntryTournament(row: EntryTournamentRow): CompetitionListItem | null;
//   id 非正整数 → null(丢弃);state 未知值 → UNKNOWN;groupMode POINTS_RACES → POINTS_TABLE,
//   其余/空但 knockoutMode 有效 → KNOCKOUT;都空 → UNKNOWN。kind 恒 UNKNOWN。
export function adaptEntryTournaments(rows: EntryTournamentRow[]): CompetitionListItem[];
//   过滤 null + 稳定排序(进行中优先,然后名字)。相关度排序契约就绪前为保守顺序。
export function listCountBucket(count: number): "0" | "1" | "2-5" | "6-20" | ">20";
//   §18 遥测分桶。
```

### 4.3 测试 `tests/competition-state.test.ts`(新建)

≥12 用例:非法 id 丢弃、三 state 直传、未知 state → UNKNOWN、POINTS_RACES → POINTS_TABLE、knockout 兜底、双空 → UNKNOWN、kind 恒 UNKNOWN、GW 区间透传、participantCount 空值、排序稳定性、分桶边界。

## 5. WP1 — 读服务

### 5.1 `services/tournament.service.ts` 增量

```ts
export async function getEntryAllTournaments(entry: number, forceRefresh = false): Promise<EntryTournamentRow[]>;
//   复用 GET_ENTRY_TOURNAMENTS(5min TTL),不过滤 —— 全量兼容读。
```

### 5.2 `services/competition.service.ts`(新建)

```ts
export async function getMyCompetitionsCompat(entryId: number, forceRefresh = false): Promise<CompetitionListItem[]>;
//   = getEntryAllTournaments + adaptEntryTournaments。失败抛出由页面保留 last-good。
```

last-good:页面侧 storage key `my-competitions:list`,值 `{ entryId, items, storedAt }`,同 principal 才用(§13.1 简化版:principalRevision 不存在,以 follow 指针为界)。

### 5.3 测试

适配器已在 WP0 覆盖;WP1 无需新纯逻辑,不新增测试文件(service 层模式与 my-fpl.service 一致)。

## 6. WP2 — canonical-action 动作表扩展

`utils/canonical-action.ts` 的 `CanonicalActionType` 与 `ACTION_URLS` 增量:

```ts
CREATE_COMPETITION → https://letletme.top/zh-CN/tournament
MANAGE_COMPETITION → https://letletme.top/zh-CN/tournament
VIEW_COMPETITION   → https://letletme.top/zh-CN/tournament
```

URL 仍为静态常量;**不拼 competitionId**(§11.1 允许 id,但静态更保守,网页端自行定位;后续契约给出 canonicalLinks 再替换)。测试补动作表用例。

## 7. WP3 — 我的赛事页 + 卡片 + 导航

### 7.1 `components/competition-card/`(新建,4 文件)

properties:`item`(CompetitionListItem);events:`open / manage`。
渲染:名字、format 提示标签(POINTS_TABLE →「积分制」/ KNOCKOUT →「淘汰赛」/ UNKNOWN →「赛制未就绪」)、lifecycle 徽标(ACTIVE →「进行中」/ INACTIVE →「未开始」/ FINISHED →「已结束」/ UNKNOWN →「状态未就绪」)、`N 人参与`、GW 区间(有才显示)、kind UNKNOWN 时不渲染 kind 行(而非伪造标签)。主操作「查看实时」、次操作「网页管理」。

### 7.2 `pages/competitions/index/index`(新建,4 文件 + app.json)

- `onLoad`:`getMyFplContext` 轻量取 follow(或直接 storage/globalData,与 leagues 页同款 `currentEntryId()`);NO_FOLLOW → empty state「先选择我的球队」。
- 加载:`getMyCompetitionsCompat`;成功写 last-good;失败保留 + 「刷新失败,当前显示上次成功结果」;无缓存且失败 → unavailable/retry(§13.2,不渲染空列表)。
- 搜索:客户端 filter(filter-bar,与 leagues 页同款);无其他可见筛选器(控制预算)。
- 空列表(READY):说明「官方联赛追踪 vs 自定义赛事」+ 主操作「在网页创建赛事」→ `openWebsiteAction(CREATE_COMPETITION)`。
- `onOpenCompetition`:写 `live-tournamentId/Name` storage → `wx.navigateTo(routes.liveTournament)`(当前结果归 Live,A7)。
- `onManageCompetition`:`openWebsiteAction(MANAGE_COMPETITION)` + 遥测。
- 下拉刷新 `forceRefresh`;`onShow` resume 重读(网页返回刷新)。
- **不轮询**(§13.3:My Competitions 不是 Live surface)。

### 7.3 bottomNavBar 增量

- MENU_MAP 新增 `competitions` 组:pages 仅 `{ name: "我的赛事" }`……不,单目的地组不需要 action sheet:参照 `perf` 组模式(`show: false` + 单 url 直跳)。`competitions: { pages: [], url: { 我的赛事: "/pages/competitions/index/index" }, show: false }` —— 文档 §9.1:「no action sheet containing a native Create destination because only one permanent destination exists」。
- wxml tab 插入第 3 位:`<van-tabbar-item name="competitions" icon="trophy-o">赛事</van-tabbar-item>`(我的 FPL / 实时 / **赛事** / 统计 / 数据;A3,临时 5 tab)。
- `ROUTE_GROUPS` 加 `{ prefix: "/pages/competitions/", active: "competitions" }`;`config/routes.ts` 加 `competitionsIndex`。

### 7.4 测试 `test/competitions-index.test.mjs`(page-state 风格)

- NO_FOLLOW → 去选择球队路由;
- onOpenCompetition → 写对 storage key + navigateTo liveTournament;
- onShow resume 重载、首 show 不重复;
- 空列表主操作 → CREATE_COMPETITION handoff(stub wx.setClipboardData 断言 URL)。

## 8. WP4 — 观测量 + 全量验证

### 8.1 `utils/perf.ts` 增量

```ts
export interface CompetitionVisitRecord {
  surface: "list";
  principalState?: string;
  contractSource: "compat";        // 契约切换时扩枚举
  listCountBucket?: "0" | "1" | "2-5" | "6-20" | ">20";
  cacheOutcome?: "fresh" | "last-good" | "miss";
  handoffActionType?: string;
  durationBucket?: string;
  ts: number;
}
export function recordCompetitionVisit(record: Omit<CompetitionVisitRecord, "ts">): void;
```

复用 ring buffer;**不记** competition 名/id、entryId、token(§18)。记录点:列表首渲(countBucket + cacheOutcome + duration)、handoff 接受时(actionType)。

### 8.2 验证清单

```text
npm run typecheck
npm run lint
npm test
npm run package:check
git diff --check
```

DevTools 手测(deferred checkpoint):NO_FOLLOW / 空列表 / 20+ 列表、storage 预选落地 Live 竞赛页、离线 last-good、5 tab safe-area、320×568 / 390×844 卡片不折行。

### 8.3 提交顺序

```text
1. WP0 models + competition-state 适配器 + 测试   —— 1 commit
2. WP1 tournament.service 增量 + competition.service —— 1 commit
3. WP2 canonical-action 动作表扩展 + 测试          —— 1 commit
4. WP3 我的赛事页 + competition-card + 导航         —— 1 commit
5. WP4 观测量 + 验证                              —— 1 commit
```

## 9. Backend-gated(不在本计划,接口就绪即插)

| 项 | 需要 | 缺省行为(已内建) |
| --- | --- | --- |
| `myCompetitions` union 读 | organizer+participant 授权 union、cursor、viewerRole、availableActions、factsRevision | 适配器列表仅 participant 视角(follow entry),无 role/actions |
| CompetitionIdentity 契约 | kind / rosterBehaviour / format / authority | kind 恒 UNKNOWN 中性展示 |
| Lifecycle/Setup 契约 | 7 态 lifecycle + 4 态 setup | state 三值直传,其余 UNKNOWN |
| Competition Home | `competition(competitionRef)` | 不建页;主目的地 = Live 竞赛 |
| Results/History | `competitionResult` / `competitionHistory` + SettledResultMeta + 格式判别体 | 不建页;summary/tournament 兼容存续 |
| Participants | `competitionParticipants` | 不建页 |
| Invitation preview | `competitionInvitationPreview` + capability 安全 | A6,不排期 |
| battle/knockout 格式渲染 | RG-FORMAT | 不渲染;UNKNOWN 提示 |
| canonicalLinks 服务端下发 | 目标 /zh-CN/competitions 路由注册表 | WP2 静态兼容 URL |
| 统计页退役 / tab 合并 | RG-COMPETITION-RESULTS + My FPL parity | A3,延后 |
| 探索 cohort 上下文 | Section 4 契约 | 不动 data/selections |

## 10. 明确不做

- 不实现 web-view(A1);不落地 signed principal(A2)。
- 不做 invitation preview / join / roster claim(A6)。
- 不建 Competition Home / Results / Participants 空壳页(A7)。
- 不做 create/manage/setup/archive/delete 的任何原生入口(Website-only)。
- 不在适配器外推断 kind/lifecycle/authority;歧义一律 UNKNOWN(MP-C1.4)。
- 不删/不改 summary/tournament、live/tournament、data/selections;不动统计/数据导航组(A3)。
- My Competitions 不轮询(§13.3);Live 轮询留在 Live controller。
- 遥测不记 competition 名/id、entryId、邀请材料(§18)。
- 零新增运行时 npm 依赖。
