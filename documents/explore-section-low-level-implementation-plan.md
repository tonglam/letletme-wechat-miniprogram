# LetLetMe 微信小程序 Explore Section — Low-Level Implementation Plan

- **Status:** 待执行
- **Written:** 10 August 2026
- **上游文档:** `documents/explore-section-high-level-engineering-design.md`(Section 4/4)
- **代码基线:** main@`2ca6258`(Live + My FPL + Competitions 全部落地之后)
- **执行方式:** 每个 WP 一个 commit,按 §9 顺序执行

---

## 1. 与高层文档的校准(Amendments)

| # | 高层文档 | 本计划落地 |
| --- | --- | --- |
| A1 | §9/完成标准 12:web-view 整页 handoff | **web-view 不可用**(既定约束)。复用 `utils/canonical-action.ts` copy-link;Briefing 源继续阅读同类处理(A4 不排期) |
| A2 | §6 目标路由 `/pages/explore/*`,同时「物理路由更名延后」 | 严格照此:`explore/index`(概览)与 `explore/fixtures`(赛程)是**新建路由**,不是更名;`data/index` 变 redirect 壳指向新概览。`summary/gameweek`、`data/price|selections|players|teams` **全部留在原物理路由**,由概览卡片以 Explore 标签链接;物理更名待链接/分享/回滚验证后单独进行 |
| A3 | §6 目标四段导航 实时｜我的 FPL｜赛事｜探索 | 本轮完成收敛:tab = 我的 FPL / 实时 / 赛事 / 探索(单目的地直跳)。**统计 tab 移除**:比赛周 → 概览「本轮」卡片;`summary/tournament` 失去导航入口但**路由保留**(其替代归 RG-COMPETITION-RESULTS,Competitions 计划 §9)。数据 tab 移除:四个目的地全部进概览卡片。**这是本轮唯一可见入口后退,文档 §14 只要求保留路由** |
| A4 | §7.8/MP-E7 Briefing | **整体不排期**。source registry / rightsMode / attribution 契约不存在;不建 UI 空壳。概览不放简报卡片(避免死链),契约就绪后单独加 |
| A5 | §7.7 双人对比(MP-E6 后半) | 按文档交付顺序(「single-player performance 证实后」)**不排期**;球员详情 lazy sections / Understat bridge / 服务端 playerSearch 同为 backend-gated(§10) |
| A6 | §4.1 EvidenceContext 全字段(coverage/revision/methodVersion/limitations[]) | 契约为 backend-gated。本轮落地**客户端可证实的静态标注**(来源:FPL 官方 / 范围:本赛事全部成员·精确 / 更新节奏),未知字段不伪造 —— 「unknown coverage is not complete coverage」 |
| A7 | §5.3 personal saved/squad overlays | 沿用既定:不落地 signed principal;overlay 需求整体 backend-gated。公共证据无账号可用已是现状,不破坏 |

## 2. 已验证的当前代码事实

- **players**:文档声明「下载全量本地搜索」属实 —— `getPlayersByElementType` 拉 `players(limit:600, offset:0)` 全目录(6h TTL)本地过滤;查询**无 search 参数**,服务端搜索为 backend-gated。
- **fixtures**:`getSeasonFixture` 一次拉全季 `fixtures(limit:500)`(event/主客队名+shortName/双边 difficulty/kickoffTime/finished,30min TTL)→ 球队赛程竖卡**可纯客户端组合**,零新后端依赖;`getTeamList`(common.service)提供 20 队 id/name/shortName。
- **data/index**:卡片 球员数据/球队数据/身价变化/阵容选择/性能监控(性能卡 entryId===15702 门控)。
- **summary/gameweek**:四 tab(summary/dreamTeam/…)已符合操作预算,物理留存。
- **price** 页已有 mode 切换(player 等);**selections** 为已筹备赛事队列(精确、需 follow);**team-detail** 已含赛程内容(与赛程页职责不同:赛程页 = 20 队横向对比起跑点)。
- 底部导航当前 5 tab:我的 FPL/实时/赛事/统计/数据;`ROUTE_GROUPS` 前缀驱动。
- 遥测惯例三套 ring buffer 已落地;`canonical-action` 动作表已含 OPEN_HOME 等。

## 3. 目标结构(本计划范围内)

```text
miniprogram/models/evidence.ts               WP0  EvidenceContext-lite 类型(全可选)
miniprogram/utils/evidence-state.ts          WP0  标签/降级纯函数
miniprogram/utils/fixture-run.ts             WP1  球队赛程组合纯函数
miniprogram/pages/explore/fixtures/fixtures  WP2  赛程页(新建路由)
miniprogram/pages/explore/index/index        WP3  探索概览(新建路由)
miniprogram/pages/data/index/*               WP3  → redirect 壳
miniprogram/components/evidence-source/      WP4  来源标注组件
miniprogram/utils/perf.ts                    WP5  recordExploreVisit
```

零新增运行时依赖;复用 @vant/weapp、`app-empty-state`、`filter-bar`、`gw-picker`。

## 4. WP0 — 证据模型 + 标签纯函数

### 4.1 `miniprogram/models/evidence.ts`(新建)

```ts
export type EvidenceClass = "OFFICIAL_FPL" | "VERIFIED_UNDERSTAT" | "EXACT_COHORT" | "SAMPLED_COHORT" | "ATTRIBUTED_BRIEFING" | "UNKNOWN";
export type EvidenceTruth = "READY" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "UNKNOWN";

/** Client-verifiable subset (plan A6); contract fields arrive backend-gated. */
export interface EvidenceLabel {
  evidenceClass: EvidenceClass;
  scopeText?: string;      // 如「本赛事全部成员」
  exact?: boolean;         // 仅客户端可证实精确时置 true
  freshnessText?: string;  // 如「每日更新」
}
```

### 4.2 `miniprogram/utils/evidence-state.ts`(新建)

```ts
export function evidenceClassLabel(cls: EvidenceClass): string;
//   OFFICIAL_FPL→"FPL 官方", VERIFIED_UNDERSTAT→"Understat 验证", EXACT_COHORT→"精确群体",
//   SAMPLED_COHORT→"抽样群体", ATTRIBUTED_BRIEFING→"署名来源", UNKNOWN→"来源未就绪"
export function evidenceTruthLabel(truth: EvidenceTruth): string;
//   READY→"", PARTIAL→"部分数据", STALE→"非最新", UNAVAILABLE→"暂不可用", UNKNOWN→"状态未就绪"
export function composeEvidenceLine(label: EvidenceLabel): string;
//   「来源 · 范围 · 精确/抽样 · 更新节奏」拼接;UNKNOWN 类不落具体措辞;
//   exact 未证实(true 之外)绝不写「精确」。
```

### 4.3 测试 `tests/evidence-state.test.ts`

≥10 用例:五类标签、UNKNOWN 中性、exact undefined → 无「精确」字样、拼接顺序与缺省省略。

## 5. WP1 — `utils/fixture-run.ts`(纯函数)

```ts
export interface FixtureRunChip {
  event: number;
  opponentShortName: string;
  home: boolean;
  difficulty?: number;
  finished: boolean;
}
export interface FixtureRun {
  teamId: number;
  teamName: string;
  teamShortName: string;
  chips: FixtureRunChip[];   // 按 event 升序,长度 ≤ horizon,不足即少(不虚构)
}
export function buildFixtureRuns(
  fixtures: Fixture[],       // models/common Fixture
  teams: { id: number; name: string; shortName: string }[],
  startEvent: number,
  horizon: number            // 仅 3|5,其余钳到 3
): FixtureRun[];
export function maxFixtureEvent(fixtures: Fixture[]): number;  // 选择器上限
```

规则:主队视角主客场与难度各自对应(`homeTeamDifficulty` 属主队);`finished` 如实透传;跨 teamId/againstTeamId 双边匹配(现有 Fixture 每行只有一队视角?——已验证每行含 homeTeam/awayTeam 双 id,主队字段在 teamId/againstTeamId,注意以 homeTeam.id/awayTeam.id 匹配)。

> 实现注意:`getSeasonFixture` 的 map 把 homeTeam.id → teamId、awayTeam.id → againstTeamId,纯函数按此形状匹配即可;双边名字用 homeTeam/awayTeam 与 shortName 字段。

测试 `tests/fixture-run.test.ts`:双边归属、难度主客对应、horizon 截断与非 3/5 钳制、event 缺口不虚构、finished 透传、空数组、maxFixtureEvent。

## 6. WP2 — 赛程页(新建路由)

`pages/explore/fixtures/fixtures`(4 文件 + app.json + routes.exploreFixtures):

- 控制预算 2 个:`gw-picker`(起始轮,默认 `globalData.gw`,上限 `maxFixtureEvent`) + horizon 分段(3|5，默认 3)。
- 数据:`Promise.all([getSeasonFixture(season), getTeamList(season)])` → `buildFixtureRuns` → 20 张竖卡;失败 → error-state + retry;下拉强制刷新。
- 卡片:队名 + chips(GW 号、对手 shortName、主/客、难度点色 1-5);无 advisory 措辞(A 文档 §7.3 禁令);finished chip 置灰。
- 页面页脚一行静态标注:来源 FPL 官方(WP4 组件落地后替换)。

## 7. WP3 — 概览 + 壳 + 导航收敛

### 7.1 `pages/explore/index/index`(新建)

- 上下文行:赛季 + 当前/下一轮 + 更新提示(`getCurrentEventAndDeadline`,失败降级为静默)。
- 搜索框:球员关键词 → `navigateTo(dataPlayers, { keyword })`(players 页增 onLoad options.keyword 预填;**本地过滤降级标注**:服务端搜索 gated)。
- 路由卡组(竖向分组,每组一卡一行):
  - 证据:本轮(summary/gameweek)/ 赛程(explore/fixtures,新)/ 市场(data/price)/ 趋势(data/selections)
  - 实体:球员(data/players)/ 球队(data/teams)
  - 工具:性能监控(entryId===15702 门控,沿用 data/index 规则)
- 卡:用途一句话 + 「打开」;无嵌套按钮;不预载任何目的地载荷。
- 不放简报卡(A4)。

### 7.2 `pages/data/index/*` → redirect 壳

与 summary/entry 壳同模式:`onLoad → wx.redirectTo(routes.exploreIndex)`;保留 app.json 注册。

### 7.3 bottomNavBar 收敛(A3)

- MENU_MAP:删 `data` 组;新增 `explore: { pages: [], url: { 探索: "/pages/explore/index/index" }, show: false }`;删 `summary` 组。
- wxml tab:我的 FPL / 实时 / 赛事 / 探索(+ 隐藏性能)。
- ROUTE_GROUPS 顺序:`/pages/my-fpl/`→myFpl、`/pages/competitions/`→competitions、`/pages/summary/gameweek`→explore、`/pages/explore/`→explore、`/pages/data/`→explore、`/pages/live/`→live、`/pages/summary/`→`""`(compat 路由,无高亮)、`/pages/performance/`→perf。
- `switchToData()`(utils/navigation)→ 指 explore/index(检查调用方)。
- routes.ts 增 `exploreIndex / exploreFixtures`。

### 7.4 测试 `test/explore-index.test.mjs`

卡片路由正确(本轮→summary/gameweek 等)、搜索跳转带 keyword、性能卡 15702 门控、data/index 壳 redirect 目标。

## 8. WP4 — evidence-source 组件 + 三处标注

`components/evidence-source/`(4 文件):properties `text / tone`,单行小字 + 来源点。接入(静态、客户端可证实):

| 页面 | 标注 |
| --- | --- |
| summary/gameweek | 「来源 FPL 官方 · 本轮统计」 |
| data/selections | 「范围:本赛事全部成员 · 精确 · LetLetMe 计算」 |
| data/price | 「来源 FPL 官方 · 每日更新」 |
| explore/fixtures | 「来源 FPL 官方」(WP2 页脚替换) |

精确字样只出现在 selections(服务端对全 roster 计算,可证实);其余无「精确」。

## 9. WP5 — 观测量 + 全量验证

```ts
export interface ExploreVisitRecord {
  surface: "overview" | "fixtures";
  contractSource: "compat";
  eventId?: number;        // fixtures 起始轮
  horizon?: 3 | 5;
  cacheOutcome?: "fresh" | "last-good" | "miss";
  durationBucket?: string;
  ts: number;
}
export function recordExploreVisit(record: Omit<ExploreVisitRecord, "ts">): void;
```

不记搜索词(§16 明确 full search text 不记)、不记队名/球员名。记录点:概览首渲、赛程页每次组合完成。测试沿用 perf 三件(round-trip/cap/无标识)。

全量验证:`npm run typecheck && npm run lint && npm test && npm run package:check && git diff --check`。
DevTools deferred:四 tab safe-area、赛程 horizon 3/5 长队名换行、概览搜索跳转、壳 redirect、320×568/390×844。

### 提交顺序

```text
1. WP0 evidence 模型 + 标签纯函数 + 测试     —— 1 commit
2. WP1 fixture-run 纯函数 + 测试             —— 1 commit
3. WP2 赛程页                                —— 1 commit
4. WP3 概览 + 壳 + 导航收敛                   —— 1 commit
5. WP4 evidence-source + 标注                —— 1 commit
6. WP5 观测量 + 验证                         —— 1 commit
```

## 10. Backend-gated(不在本计划)

| 项 | 需要 | 缺省行为 |
| --- | --- | --- |
| `exploreOverview` | 服务端聚合路由卡/freshness/搜索建议 | 客户端静态卡组 + 现有上下文读 |
| EvidenceContext 全字段 | coverage/revision/methodVersion/limitations | 静态可证实标注,未知不伪造(A6) |
| `gameweekEvidence` | 四区 EvidenceContext | 现有四 tab + 静态来源标注 |
| `fixtureRuns` | 服务端赛程聚合 | WP1 客户端组合(全季 fixtures 已缓存) |
| `marketEvidence` | 热度/可用性/新增三模式 | price 页现状(价格模式),概览卡标注「市场(价格)」 |
| `trendEvidence` | 公共精确/确定性抽样群体、无需 follow | selections 现状(已筹备赛事·精确);抽样「Top N」语义不伪造 |
| `playerSearch` | 服务端 search 参数 | 600 行缓存目录 + 本地过滤,概览跳转预填 keyword |
| `playerEvidence` 增强 | lazy sections / Understat bridge / 限制说明 | 详情页现状 |
| `playerComparison` | 双人对齐读 | A5,不排期 |
| `briefingIndex/Timeline` | 权利契约 + 源注册 | A4,不排期,概览无卡 |
| 物理路由更名 | 链接/分享/回滚验证 | A2,延后 |
| saved/squad overlays | principalRevision 契约 | A7,gated |

## 11. 明确不做

- 不实现 web-view(A1);不做 Briefing UI(A4);不做双人对比(A5)。
- 不做服务端 playerSearch / FDR 矩阵 / 任何「hunt/target/avoid/必买」措辞。
- 不伪造精确/抽样语义、覆盖度或 EvidenceContext 未知字段(A6)。
- 不删除 summary/gameweek、summary/tournament、data/* 任何路由(A2/A3 只动导航与壳)。
- 不动 home 页赛程区(launch router 现状)。
- 不爬文章、不渲染 HTML/Markdown、无 AI 助手、零新增运行时依赖。
