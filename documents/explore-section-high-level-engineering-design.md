# LetLetMe WeChat Mini Program Explore Section — High-Level Engineering Design

- **Status:** Proposed engineering design, ready for technical review
- **Recorded:** 10 August 2026
- **Section:** 4 of 4 — Explore
- **Mini Program baseline:** main@0d3b3ab
- **Website implementation comparison baseline:** codex/web-adjustments-main-integration@547b169
- **Scope:** public FPL evidence, verified external evidence, bounded search and comparison, Briefing source presentation, Website handoff, and the WeChat Mini Program client
- **Product target authority:**
  - letletme-web/docs/product/letletme-four-section-specification.md
  - letletme-web/docs/product/letletme-cross-section-implementation-plan.md

The Website implementation is a source of capability and semantic behavior, not a native Mini Program UI template. Explore deliberately rejects desktop interactions that do not fit the WeChat canvas or operation hierarchy.

## 1. Purpose and fixed decisions

Explore is the neutral evidence layer for:

- current gameweek facts;
- fixture context;
- market changes;
- selection and transfer trends;
- player and team evidence;
- attributed Briefing items.

It helps a viewer inspect evidence. It does not answer “what should I do?”

Fixed decisions:

- The Mini Program Explore UI is Simplified Chinese-only.
- The top-level label is **探索**.
- Opening 探索 goes directly to a compact Overview/router.
- Native destinations are **概览**, **本轮**, **赛程**, **市场**, **趋势**, **球员**, and **简报**, but they are not rendered as seven permanent tabs.
- Public official-FPL evidence remains usable without an account.
- Personal squad/saved overlays are optional enhancements and never gate the public base surface.
- Official FPL facts, verified Understat facts, sampled cohort evidence, and attributed Briefing sources remain visibly distinct.
- No rank cohort is presented as exact unless the complete population and denominator are proven.
- The Mini Program does not scrape arbitrary articles, silently translate them, or render untrusted HTML/Markdown.
- The Mini Program does not provide an AI Assistant.
- The Mini Program does not perform official FPL actions or provide transfer, captain, lineup, chip, price, fixture, or player recommendations.
- Initial delivery introduces zero Mini Program runtime packages. It uses native WXML/WXSS and existing @vant/weapp only.

## 2. Current baseline and gap

### 2.1 Mini Program

| Surface | Current capability | Main gap |
| --- | --- | --- |
| Data index | Cards for players, teams, price, and selections | No target Overview/search router, Gameweek/Fixtures/Briefing destinations, or shared evidence metadata |
| Gameweek summary | Total points, dream team, high scorers, and transfers in four tabs | Strong foundation; missing consistent source, coverage, freshness, and cross-entity deep links |
| Price | Daily price changes and player price history | Narrower than target Market; lacks bounded mode identity and availability/new-player context |
| Selections | Prepared Competition cohort with four bar-list tabs | Requires binding and a prepared object; does not support public sampled cohorts or explicit exact/sample semantics |
| Players | Fetches a large player collection for local search; detail is very small | Unbounded mobile payload, weak detail, no server search/pagination, no bounded comparison |
| Teams | Basic strength/detail | No fixture run or shared entity evidence model |
| Fixtures | No Explore fixture surface | Website capability cannot be copied directly because its matrix/workbench is width- and hover-heavy |
| Briefing | No native surface | Needs source-rights, attribution, language, and safe-link foundations before UI |

Relevant current files:

- miniprogram/pages/data/index/*
- miniprogram/pages/summary/gameweek/*
- miniprogram/pages/data/price/*
- miniprogram/pages/data/selections/*
- miniprogram/pages/data/players/*
- miniprogram/pages/data/teams/*
- miniprogram/services/player.service.ts
- miniprogram/services/team.service.ts
- miniprogram/services/tournament.service.ts

The current package boundary contains @vant/weapp. This design does not broaden it.

### 2.2 Website comparison baseline

The local Web adjustment branch exposes:

- Gameweek;
- Fixtures with horizon controls, fixture-difficulty matrix, squad overlay, position candidates, hover detail, and share interactions;
- Market as a multi-mode evidence desk;
- Selections as a large cohort workspace;
- Player Stats with one/two-player modes, saved/squad rails, aligned evidence sections, charts, sticky controls, and desktop interaction primitives.

Those routes use large-screen composition and Website-specific component libraries. There is currently no complete target Explore Overview or Briefing route to copy.

### 2.3 Capability decision matrix

| Capability | Mini Program decision | Reason |
| --- | --- | --- |
| Overview/router and global player/team search | Build native | High-frequency navigation fits a compact mobile page |
| Gameweek facts | Keep and strengthen native | Existing four-tab surface already matches the operation budget |
| Fixture evidence | Rebuild as vertical team runs | Desktop matrix, hover, multi-panel comparison, and wide overlays do not fit the canvas |
| Market facts | Rebuild as bounded modes/lists | Preserve evidence, remove simultaneous desktop controls |
| Selection/transfer trends | Reuse native bar/list patterns | Works on narrow screens once cohorts and evidence semantics are corrected |
| Single-player detail | Build native, lazy sections | High-value frequent read |
| Two-player comparison | Separate bounded native route | Useful only when capped at two and metrics align vertically |
| Multi-player workspace, saved rail, sticky desktop panels | Do not port | Exceeds canvas and hierarchy; Website continuation where valuable |
| Complete FDR matrix or full-season data table | Defer / Website | Width, density, and precision interaction are desktop-oriented |
| Charts | Optional native Canvas only | No new package; text/table fallback remains authoritative |
| Briefing cards and source timeline | Stage after rights contract | Attribution and safe-source rules precede UI |
| Rich article embed, arbitrary HTML, Markdown renderer | Do not build | Security, rights, package, and WebView constraints |
| AI summary or Q&A | Excluded | Mini Program has no AI Assistant |

## 3. Target technical structure

~~~mermaid
flowchart LR
    FPL["Official FPL facts"] --> DATA["Data evidence stores"]
    UNDERSTAT["Verified Understat facts"] --> DATA
    SOURCES["Approved Briefing registry"] --> DATA
    DATA --> GQL["GraphQL bounded evidence reads"]
    WEB["Website preferences, canonical routes, source policy"] --> MINI["Mini Program Explore router"]
    GQL --> MINI

    MINI --> GW["本轮"]
    MINI --> FIX["赛程"]
    MINI --> MARKET["市场"]
    MINI --> TREND["趋势"]
    MINI --> PLAYER["球员"]
    MINI --> BRIEF["简报"]
    MINI --> HANDOFF["Website deep analysis / source continuation"]
~~~

Ownership:

- Data owns provider-specific ingestion, immutable facts, source time, coverage, sampling method, and revision.
- GraphQL owns bounded search, aggregation, pagination, authorization for optional personal overlays, and evidence projections.
- Website owns canonical deep-analysis routes, saved context, source registry administration, and mobile handoff pages.
- Mini Program owns small-screen routing, evidence labels, lazy presentation, cache/last-good behavior, and Chinese UI.

Provider stores remain independent. Explore can place verified evidence side by side only through explicit bridge identities; it never joins providers by display name on device.

## 4. Evidence and read contracts

### 4.1 EvidenceContext

Every quantitative module carries:

~~~text
EvidenceContext
  evidenceClass:
    OFFICIAL_FPL
    VERIFIED_UNDERSTAT
    EXACT_COHORT
    SAMPLED_COHORT
    ATTRIBUTED_BRIEFING
  source
  season
  eventId nullable
  scope
  observedAt nullable
  capturedAt nullable
  publishedAt nullable
  truthState: READY | PARTIAL | STALE | UNAVAILABLE
  coverage
  exact
  denominator nullable
  sampleSize nullable
  samplingMethod nullable
  methodVersion nullable
  limitations[]
  revision
~~~

Rules:

- Source, freshness, scope, and exact/sample status are visible near the result, not hidden in a tooltip.
- “Top 10k sample” is labelled as a sample with denominator/sample size and deterministic method.
- A sampled cohort cannot silently become “Top 10k”.
- Optional Understat or Briefing failure cannot blank official FPL facts.
- Device fetch time is not source observation time.
- Unknown coverage is not complete coverage.

### 4.2 Bounded read models

| Read model | Mini Program use |
| --- | --- |
| exploreOverview | Route cards, current context, freshness, and bounded search suggestions |
| gameweekEvidence | Four bounded Gameweek sections and EvidenceContext |
| fixtureRuns | Team runs for a selected start event and horizon |
| marketEvidence | One selected market mode/date/window and cursor |
| trendEvidence | One cohort plus one event/window and bounded sections |
| playerSearch | Server-side search/filter/sort with cursor and compact projection |
| playerEvidence | One player, official base plus lazy optional sections |
| playerComparison | Exactly two players with aligned metric groups |
| briefingIndex | Rights-cleared topic cards and cursor |
| briefingTimeline | Structured attributed events and source links |

The server performs expensive aggregation. The Mini Program does not download the complete player pool or full fixture matrix to emulate Website filtering.

### 4.3 Entity and source identity

~~~text
EntityRef
  provider
  season
  entityType: PLAYER | TEAM | FIXTURE
  providerId

BridgeRef
  officialFplRef
  externalRefs[]
  bridgeRevision
  confidenceState
~~~

Only verified bridge links allow cross-provider display. Missing or ambiguous bridges produce an unavailable optional section.

### 4.4 Briefing projection

~~~text
BriefingItem
  id
  topic
  sourceName
  sourceUrl
  sourceLanguage
  publishedAt
  capturedAt
  rightsMode: LINK_ONLY | LICENSED_EXCERPT | STRUCTURED_FACT
  title
  shortExcerpt nullable
  structuredFacts[]
  attribution
  limitations[]
~~~

Rules:

- LINK_ONLY stores/presents metadata and link, not copied article text.
- Excerpts exist only within the approved rights mode.
- Source language is explicit.
- No silent AI translation or AI-generated summary is introduced.
- Untrusted HTML, script, iframe, and arbitrary Markdown are never rendered.

## 5. Mini Program canvas and operation hierarchy

### 5.1 Canvas budget

Explore must remain usable inside the actual WeChat viewport:

- Use wx.getWindowInfo() for windowWidth, windowHeight, safeArea, and menu-capsule position.
- Support 320–430 CSS px portrait widths. Verify 320 × 568, 375 × 667, 390 × 844, and approximately 430 px wide.
- Reserve native navigation/capsule space, custom bottom navigation, and bottom safe-area inset.
- Default to one vertical content column and at most two metric columns.
- Touch targets are at least 44 CSS px, approximately 88rpx.
- Long labels, source names, player names, and limitations wrap; primary meaning never depends on truncation or tooltip.
- Horizontal scrolling is used only for a bounded and signposted comparison/fixture strip. It cannot be required to discover the main result.

### 5.2 Operation hierarchy

Seven capabilities do not become seven permanent page tabs. Overview is the router:

~~~text
探索 -> 概览 -> 本轮 / 赛程 / 市场 / 趋势 / 球员 / 简报
探索 -> 球员 -> 球员详情 -> 双人对比 / 证据来源
探索 -> 赛程 -> 球队赛程 -> 球员或比赛证据
探索 -> 简报 -> 主题时间线 -> 来源
~~~

Rules:

- Core evidence is reachable within three page transitions from bottom navigation.
- A page has no more than four permanent tabs.
- A page exposes no more than two primary selectors at once.
- Additional controls use one non-nested action sheet or a dedicated filter page.
- A row has one primary action and at most one secondary action.
- No core interaction depends on hover, tooltip-only detail, right click, precise drag, keyboard shortcut, resizable panes, modal-in-modal behavior, or a sticky multi-column workspace.
- Back navigation restores search, filters, cursor, and scroll position when the evidence context is unchanged.

### 5.3 Control budgets by destination

| Destination | Maximum visible primary controls | Explicit simplification |
| --- | --- | --- |
| 概览 | Search plus one context action | Route cards in vertical groups, no analytics feed |
| 本轮 | Four tabs plus no more than one event context control | Existing tab model retained |
| 赛程 | Start GW plus horizon | Team run cards; complete matrix omitted |
| 市场 | Mode tabs up to four plus date/window | Other filters in one sheet |
| 趋势 | Cohort plus event/window | One cohort per screen, not multi-cohort panes |
| 球员列表 | Search plus one sort/filter control | Remaining filters in one sheet; server cursor |
| 球员详情 | Section disclosure plus one compare action | One player first; lazy evidence sections |
| 双人对比 | Two selected players | No third player, radar, or “winner” |
| 简报 | Topic plus optional time window | Cards/timeline, no rich embedded article |

## 6. Navigation and route ownership

Target bottom navigation:

~~~text
实时 ｜ 我的 FPL ｜ 赛事 ｜ 探索
~~~

Opening 探索 routes to Overview. The six tools are cards/links on that page and may also be reached contextually; they are not an oversized seven-item action sheet.

Proposed routes:

~~~text
/pages/explore/index/index
/pages/explore/gameweek/gameweek
/pages/explore/fixtures/fixtures
/pages/explore/market/market
/pages/explore/trends/trends
/pages/explore/players/players
/pages/explore/player/player?id=...
/pages/explore/compare/compare?a=...&b=...
/pages/explore/briefing/briefing
/pages/explore/briefing-topic/topic?id=...
~~~

Compatibility mapping:

| Current route | Target ownership |
| --- | --- |
| pages/data/index | Explore Overview |
| pages/summary/gameweek | Explore Gameweek |
| pages/data/price | Explore Market |
| pages/data/selections | Explore Trends |
| pages/data/players and detail | Explore Players |
| pages/data/teams and detail | Explore entity detail/contextual routes |

Physical route renaming is deferred until links, sharing, and rollback paths are verified.

## 7. Page designs

### 7.1 概览

Purpose: answer “我想查哪类证据？”

First render:

1. Current season/event context and compact freshness status.
2. One bounded player/team search field.
3. Vertically grouped destinations.
4. Optional recent public evidence destinations stored locally.

Rules:

- Overview is not a news feed, chat, Q&A box, or multi-chart dashboard.
- Search suggestions are server-bounded and cancellable.
- Do not preload all destination payloads.
- Personal saved context appears only after the public router and only when authorized.
- Route cards show purpose, freshness, and one action; no nested card buttons.

### 7.2 本轮

Reuse the four-tab structure:

~~~text
总览 ｜ 梦幻阵容 ｜ 高分球员 ｜ 转会
~~~

Enhancements:

- Add event/status/freshness and EvidenceContext.
- Add bounded player/team deep links.
- Clarify official totals versus sampled/aggregated sections.
- Preserve public access.
- Keep list rendering incremental.
- Avoid recommendation copy such as “must own”, “buy”, or “avoid”.

No fifth permanent tab is added. New evidence becomes a vertical section or a contextual destination.

### 7.3 赛程

Purpose: answer “一支球队接下来面对什么赛程？”

Native first version:

- start event selector;
- horizon selector, for example 3 or 5 fixtures;
- vertical team run cards;
- compact fixture chips with opponent, home/away, event, and source difficulty;
- team detail showing one run at a time;
- optional personal-squad overlay as a separate view after public content.

Explicit non-parity:

- no full desktop FDR workbench;
- no simultaneous matrix, squad rail, position-candidate rail, and detail pane;
- no hover explanations;
- no width-dependent complete-season grid;
- no “hunt”, “target”, “avoid”, or other advisory modes.

A compact matrix of at most five events can be evaluated later only if real-device tests show it remains legible. It must have a labelled horizontal-scroll affordance and a vertical-card fallback.

### 7.4 市场

Purpose: answer “官方市场数据发生了什么变化？”

Initial modes, maximum four tabs:

~~~text
价格 ｜ 热度 ｜ 可用性 ｜ 新增
~~~

Rules:

- Load one mode and one date/window at a time.
- Render vertical rows with official value/change, ownership or transfers where sourced, status, freshness, and evidence scope.
- Additional position/team filters use one action sheet.
- Player price history is a lazy detail section.
- No client price prediction, transfer recommendation, or “riser to buy” language.
- If a trend is sampled, label it as sampled; official price changes remain distinct.

### 7.5 趋势

Purpose: answer “在一个明确群体与时间范围内，选择或转会分布怎样？”

Rules:

- Select exactly one cohort and one event/window.
- Reuse current narrow-screen bar/list patterns.
- Support public exact or deterministic sampled cohorts without requiring a bound team.
- Prepared Competition cohorts remain authorized/private and explicitly scoped.
- Show exact/sample, denominator, sample size, method, coverage, and update time.
- Do not place several cohorts side by side.
- Selection, captain, bench, and transfer sections are evidence categories, not advice.
- A sampled “Top 10k” never claims complete Top 10k coverage.
- Never fabricate transfers from selection deltas.

### 7.6 球员列表与详情

Player list:

- Replace complete-pool client fetch with server-side bounded search and cursor pagination.
- Expose search plus at most one sort/filter control.
- Move position, team, availability, price, minutes, and other filters into one action sheet.
- Rows show compact official identity and a bounded evidence summary.

Single-player detail:

1. Official FPL identity and current-season headline facts.
2. Availability and fixture context.
3. Form/history sections loaded lazily.
4. Verified Understat evidence only when bridge and source state are valid.
5. Compact Evidence Summary and limitations.
6. Compare action.

Rules:

- Official overview renders even when optional external evidence fails.
- Expand/collapse sections inline; do not open stacked modals.
- One expensive evidence section loads at a time below the first viewport.
- No radar is required.
- No score is labelled a recommendation.

### 7.7 双人对比

Purpose: align evidence for exactly two selected players.

Mobile design:

- selected-player headers stack or form two compact columns;
- metrics are grouped into short aligned rows;
- fixture runs are bounded and signposted if horizontally scrollable;
- source and scope repeat per evidence group where they differ;
- missing provider evidence remains visibly missing.

Explicit exclusions:

- no third or arbitrary-N player;
- no draggable columns;
- no desktop side rail;
- no radar chart;
- no “winner”, “better pick”, or transfer verdict.

### 7.8 简报

Purpose: provide an attributed, rights-safe timeline of relevant public updates.

Initial shape:

~~~text
topic cards -> bounded timeline -> source continuation
~~~

Rules:

- Briefing ships after the source registry, rightsMode, attribution, and redaction contracts are complete.
- The Mini Program displays structured facts, safe short excerpts where licensed, and link metadata.
- Link-only items do not copy article content.
- Source name, language, publish/capture times, and limitations remain visible.
- There is no infinite feed in the first release.
- No arbitrary rich embed, HTML, Markdown, comments, or AI summary.
- Source continuation uses an approved Website/source route or copy-link fallback.

## 8. Replacing Website-specific interactions

| Website interaction | Mini Program replacement |
| --- | --- |
| Hover tooltip | Inline label, short disclosure, or dedicated evidence detail |
| Sticky multi-column workspace | One vertical page and explicit child routes |
| Left/right saved or squad rail | Optional separate saved/squad page or contextual overlay route |
| Many simultaneous filters | Two-control maximum plus one action sheet |
| Command palette / keyboard navigation | Search field and route cards |
| Drag/reorder/resizable panels | Fixed evidence order or explicit sort selection |
| Full fixture matrix | Vertical team runs; optional bounded five-event strip |
| Full knockout/table width | Not an Explore concern; direct relevant detail or Website continuation |
| Dense hover chart | Short native Canvas chart plus text/table fallback, or omit |
| Rich toast stack | Existing native feedback and visible inline state |
| Modal opened from modal | Close-to-page navigation with retained context |
| Desktop share composer | Native onShareAppMessage with public sanitized context |

This replacement table is a design gate: a Web interaction is not approved for Mini Program until its mobile replacement is explicit.

## 9. Website and source handoff

Website continuation is reserved for:

- complete desktop fixture matrix;
- multi-panel or deeper historical analysis;
- saved workspace management not selected for native scope;
- rights-safe Briefing/source continuation;
- unsupported full-format evidence.

Handoff rules:

- Use canonical Simplified Chinese direct-task URLs when Website owns the destination.
- Treat web-view as a separate full-page surface. Native navigation, sheets, filters, and sticky buttons cannot overlay it.
- The Website target must be mobile, single-column, safe-area aware, and pass the same 320–430 CSS px width fixtures. Its height and scroll state are independent because web-view replaces the native page.
- Explain when Website login is required; public evidence must not be needlessly gated.
- Use approved business domains only and provide a copy-link fallback.
- External source domains that cannot open in web-view use an approved Website link page or copy action; do not bypass WeChat domain policy.
- Do not send Mini bearer tokens, principal envelopes, email, openid, private saved context, or private Competition identifiers in public URLs.
- Refresh only the relevant preference/source context after return.

Public sharing uses onShareAppMessage and includes only stable public entity/evidence references. Sample scope and source remain visible on open.

## 10. Mini Program primitives and zero-package boundary

Repo-native units:

~~~text
miniprogram/components/evidence-status/
miniprogram/components/evidence-source/
miniprogram/components/explore-route-card/
miniprogram/components/fixture-run-card/
miniprogram/components/market-row/
miniprogram/components/trend-bars/
miniprogram/components/player-evidence-section/
miniprogram/components/briefing-item/
miniprogram/components/website-handoff/

miniprogram/models/evidence.ts
miniprogram/services/explore.service.ts
miniprogram/utils/evidence-state.ts
miniprogram/utils/evidence-link.ts
~~~

Package rules:

- Add zero runtime npm dependencies for initial Explore delivery.
- Reuse existing @vant/weapp and native picker, scroll-view, action-sheet, IntersectionObserver, Canvas, pull-to-refresh, and onShareAppMessage.
- Do not add Recharts, Radix, Markdown/rich-text, virtual-list, command-palette, drag-and-drop, toast, HTML sanitizer, or state-management packages.
- Use server-side bounded search, aggregation, cursors, lazy queries, subpackages, and incremental setData.
- Native Canvas is optional and isolated; every chart has a text/table fallback.
- An exception requires separate approval, a measured native limitation, package-size/memory impact, maintenance plan, and real-device evidence.

Performance budgets are behavior-based:

- first viewport does not wait for below-fold optional evidence;
- player list never downloads the full season population merely to search;
- only the active tab/mode query loads;
- image and chart work is lazy and cancellable;
- stale request generations cannot update a new search/filter context;
- large lists page incrementally and preserve scroll position.

## 11. Client state, cache, and failures

Public cache key:

~~~text
season
+ surface
+ event/window
+ entity/cohort
+ evidence revision
~~~

Private overlay cache additionally includes principalRevision and authorization scope.

Rules:

- Never let private overlays leak into public sharing or another principal.
- List and detail caches have separate lifetimes.
- Pull-to-refresh bypasses the visible surface cache.
- Preserve same-context last-good evidence with stale/offline marking.
- Official FPL base content stays visible if Understat, sample, Briefing, or saved overlay fails.
- Reject stale responses after season, event, mode, cohort, search, filter, entity, or principal changes.
- Unknown evidenceClass, rightsMode, or method version renders an unsupported section rather than guessing.
- Search cancellation and duplicate-tap coalescing are mandatory.

## 12. Work packages

### MP-E1 — Evidence contract and primitives

- Adopt EvidenceContext, EntityRef, BridgeRef, and source presentation.
- Build repo-native status/source components and semantic fixtures.

### MP-E2 — Navigation, Overview, and bounded search

- Rehome Data index as Explore Overview.
- Add public server-side player/team search and route cards.
- Add four-section navigation compatibility.

### MP-E3 — Gameweek

- Rehome the current four-tab summary.
- Add evidence/freshness/coverage and entity links.
- Preserve public access.

### MP-E4 — Fixtures

- Add fixtureRuns contract and vertical team-run cards.
- Add start-event/horizon controls and optional separate squad overlay.
- Explicitly exclude the desktop workbench.

### MP-E5 — Market and Trends

- Expand Price into bounded Market modes.
- Generalize selections to exact/sampled public and authorized Competition cohorts.
- Add sampling/coverage metadata.

### MP-E6 — Players and comparison

- Replace full-pool local search with server pagination.
- Add lazy single-player evidence.
- Add an exactly-two-player comparison route.

### MP-E7 — Briefing and handoff

- Gate on source registry and rights contract.
- Add structured/link-first timeline, source continuation, and copy fallback.
- Add Website deep-analysis destinations.

### MP-E8 — Performance, observability, and release

- Add subpackage/lazy-loading boundaries, request generations, cache isolation, telemetry, and representative-device checks.
- Verify zero package delta and bundle/memory behavior.

## 13. Dependencies and delivery order

~~~mermaid
flowchart LR
    DATA["Data provider evidence and source rights"] --> GQL["GraphQL bounded evidence reads"]
    GQL --> WEB["Website routes, preferences, source policy"]
    WEB --> MINI["Mini Program Explore"]
~~~

Delivery:

1. Freeze evidence, sampling, bridge, freshness, and rights semantic fixtures.
2. Release additive Data/GraphQL bounded contracts.
3. Ship EvidenceContext primitives plus Overview/Gameweek.
4. Ship Fixtures.
5. Ship Market and Trends.
6. Replace player search and add single-player detail.
7. Add two-player comparison after single-player performance is proven.
8. Ship Briefing only after rights/source gates pass.
9. Observe real-device performance before compatibility cleanup.

Existing quantitative pages may migrate independently after EvidenceContext exists. Briefing is not on their critical path.

Production order remains Data -> GraphQL -> Website -> Mini Program.

## 14. Compatibility and rollback

- Keep current Data, Gameweek Summary, Price, Selections, Players, and Teams routes during migration.
- New GraphQL fields are additive/nullable until active clients no longer require old shapes.
- New navigation can be disabled without removing existing pages.
- Unknown provider evidence is omitted or marked unsupported; official FPL content remains.
- Briefing has an independent feature gate and can stay disabled without affecting Explore evidence.
- A rollback never relabels sampled data as exact, joins providers by display name, or exposes private overlays publicly.
- Route/package cleanup is a separate evidence-backed release.

## 15. Verification plan

### 15.1 Contract and unit

Cover:

- EvidenceContext source, exact/sample, coverage, freshness, and limitations;
- deterministic cohort sampling labels;
- provider bridge present, absent, ambiguous, and stale;
- bounded search/cursor behavior and stale-response rejection;
- official FPL base plus optional provider failure isolation;
- fixture horizon and event resolution;
- market mode/date/window isolation;
- one-cohort Trends state;
- exactly two comparison entities;
- Briefing rights modes and untrusted-content rejection;
- public-share redaction and Website link allowlisting.

Repository checks:

~~~text
npm run typecheck
npm run lint
npm test
npm run package:check
git diff --check
~~~

Verify every route registered in miniprogram/app.json resolves to complete ts, wxml, wxss, and json units.

### 15.2 DevTools and real devices

Verify:

- public use without account and optional personal overlays with a verified principal;
- Overview search cancellation, empty state, slow response, and deep-link restoration;
- Gameweek four tabs and status/freshness;
- Fixtures at horizon 3/5 with long team/opponent names;
- Market four modes and one date/window;
- exact, sampled, and authorized Competition Trends;
- 0, 1, many, and paginated player results;
- player official content when optional Understat evidence fails;
- two-player comparison with different evidence coverage;
- Briefing link-only, licensed excerpt, structured fact, unavailable source, and copy fallback;
- 320 × 568, 375 × 667, 390 × 844, and approximately 430 px-wide portrait canvases;
- native capsule, custom bottom navigation, and bottom safe area;
- no screen exceeds two primary selectors, four permanent tabs, or one non-nested action sheet;
- all core evidence remains within three page transitions;
- horizontal fixture/comparison affordance is visible and a vertical/text fallback preserves meaning;
- no hover, precise drag, desktop keyboard, nested modal, or desktop-width dependency;
- 44 CSS px touch targets, long Chinese/source copy, outdoor legibility, and accessibility labels;
- full-page web-view mobile sizing, explained login, domain restriction, copy fallback, and return behavior;
- package manifests/lock unchanged, no new runtime package, acceptable bundle size, memory, setData, and scroll behavior.

## 16. Observability

Record sanitized fields:

~~~text
surface
season
eventId
evidenceClass
truthState
exact
coverageBucket
sampleSizeBucket
sourceAgeBucket
mode
cursorPageBucket
optionalSectionFailureType
cacheOutcome
handoffTargetType
handoffOpenMode
durationBucket
reasonCode
~~~

Do not log Mini bearer tokens, principal envelopes, email, openid, user ID, saved player lists, private Competition membership, full search text, full payloads, article bodies, or unredacted private identifiers.

Success indicators:

- time to first public evidence;
- bounded-search payload and cancellation success;
- list pages without full-pool download;
- optional-provider failure isolation;
- exact/sample labelling correctness;
- Overview-to-evidence continuation;
- deep-analysis/source handoff and copy fallback;
- stale cross-context render count, which must be zero;
- runtime package delta, which must be zero.

## 17. Completion criteria

The Explore Mini Program design is complete when:

1. 探索 opens a compact Chinese Overview/router rather than an AI, feed, or desktop dashboard.
2. Gameweek, Fixtures, Market, Trends, Players, and Briefing have explicit native, reshaped, deferred, or Website ownership.
3. Website-specific hover, multi-panel, dense matrix, sticky-rail, drag, and nested-workspace interactions are not copied blindly.
4. Every evidence module exposes source, scope, freshness, truth/coverage, exact/sample status, and limitations.
5. Public evidence works without binding; private overlays remain optional and principal-scoped.
6. Fixtures uses vertical team runs and at most two controls; the desktop workbench is excluded.
7. Market and Trends load one mode/cohort and one event/window at a time.
8. Player search is server-bounded, detail is lazy, and comparison is capped at two players without a verdict.
9. Briefing is link-first, attributed, rights-aware, language-labelled, and free of arbitrary rich content or silent AI translation.
10. Every core path remains within three page transitions and every page has no more than two primary selectors or four tabs.
11. Every page works across the 320–430 px portrait canvas range and respects native capsule, bottom navigation, and safe areas.
12. Website/source handoff is a direct independent full-page mobile surface with domain checks and copy fallback.
13. Initial delivery adds zero runtime packages and does not port Website-only UI libraries.
14. Official FPL evidence remains available when optional provider or Briefing content fails.
15. The Mini Program exposes no AI Assistant, official FPL actions, predictions, or recommendation language.
16. Contract, unit, DevTools, real-device, handoff, compatibility, performance, and first-live-gameweek verification pass with recorded evidence.
