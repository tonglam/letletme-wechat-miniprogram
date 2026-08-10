# LetLetMe WeChat Mini Program My FPL Section — High-Level Engineering Design

- **Status:** Proposed engineering design, ready for technical review
- **Recorded:** 10 August 2026
- **Section:** 2 of 4 — My FPL
- **Mini Program baseline:** main@0d3b3ab
- **Website implementation comparison baseline:** codex/web-adjustments-main-integration@547b169
- **Scope:** private principal context, personal FPL overview, team review, official-league discovery, Website handoff, and the WeChat Mini Program client
- **Product target authority:**
  - letletme-web/docs/product/letletme-four-section-specification.md
  - letletme-web/docs/product/letletme-cross-section-implementation-plan.md
  - letletme-web/docs/product/letletme-my-fpl-section-high-level-design.md

Current-code observations and product targets are deliberately separate. The in-progress Mini Program account/binding edits in the local worktree are not treated as an implemented baseline or overwritten by this document.

## 1. Purpose and fixed decisions

My FPL is the private, persistent home for the viewer's verified FPL identity. It should answer:

- Is my account and active-season team ready?
- What is the most relevant thing about my team now?
- Where can I review my squad, transfers, chips, and history?
- Which official FPL leagues do I belong to?
- Which of those leagues has a prepared LetLetMe Competition?

The section is Chinese-only and intentionally smaller than the Website personal workspace.

Fixed product decisions:

- The submenu is **总览**, **球队**, and **联赛**.
- Opening 我的 FPL goes directly to 总览.
- 总览 is phase-aware; it is not an equal-weight dashboard of every personal metric.
- Website owns account linking, FPL identity verification, initial team binding, active-season rebind, and security-sensitive account changes.
- The Mini Program detects principal state, explains it, and opens the exact Website task. It does not implement a second binding authority.
- A verified binding is never cleared because an entry read, GraphQL request, or network request failed.
- Before a deadline, the Mini Program may show only the latest publicly frozen official squad. It never presents a private draft as if it knew current selections.
- During an unsettled gameweek, detailed current scoring belongs to Live.
- After settlement, My FPL owns the personal final result and bounded review.
- 联赛 lists all official FPL leagues available for the verified entry, not only LetLetMe-prepared objects.
- Competition creation, preparation, joining, and management remain Website-only.
- The Mini Program does not provide an AI Assistant.
- The Mini Program does not perform official FPL actions or provide transfer, captain, lineup, chip, or optimization recommendations.
- Initial delivery adds zero Mini Program runtime packages and uses native WXML/WXSS plus existing @vant/weapp only.

## 2. Current implementation baseline and gaps

### 2.1 Mini Program

| Surface | Current capability | Target gap |
| --- | --- | --- |
| Home | Account/team identity, current deadline, price changes, current GW, and fixtures | Mixed public and personal ownership; no normalized principal/season state; no phase-led My FPL overview |
| Entry summary | Squad, transfers, chips, and history in four tabs | Strong reusable foundation but not owned by a clear My FPL route and not consistently settlement-aware |
| Tournament summary | Personal GW metrics, rankings, event info, and cumulative information | Mixes official leagues, Competition shared reporting, and personal meaning |
| Entry search/profile | Public Entry lookup and profile utility | Must remain an explicit public lookup and never silently alter the verified principal |
| Bottom navigation | A broad 统计 destination | Does not expose the four-section information architecture |
| League reads | Basic id, name, and started-event identity | Missing viewer rank, movement, coverage, Competition association, and typed action destinations |
| Binding | Pages often reduce identity to entryId present/absent | Cannot distinguish account link, active-season binding, stale-season rebind, data failure, and offline cached state |

Relevant current files:

- miniprogram/pages/home/index/*
- miniprogram/pages/summary/entry/*
- miniprogram/pages/summary/tournament/*
- miniprogram/pages/entry/profile/*
- miniprogram/services/entry.service.ts
- miniprogram/services/auth.service.ts
- miniprogram/components/navigation/bottomNavBar/*

### 2.2 Website comparison baseline

| Surface | Current Website capability | Mini Program decision |
| --- | --- | --- |
| Personal navigation | Team and Tournament destinations under Me | Adopt target Overview/Team/Leagues ownership, not current path naming |
| Home personal desk | Seed personal context on the homepage | Recompose as one phase-led native overview |
| Team | Rich squad, transfer, chip, and history review | Port the bounded evidence, not desktop layout or multi-panel interaction |
| Tournament | Rich personal and shared analysis mixed together | Keep personal meaning in My FPL; shared Competition result remains Competitions |
| Saved context | Saved players, comparisons, rivals, pinned objects, and last-seen context may exist on Website | Consume only bounded, optional context after a shared contract exists |
| Account/binding | Canonical account and team verification surface | Continue on Website through a direct mobile handoff |

The target is not pixel or route parity. It is semantic ownership parity with a smaller mobile interaction model.

## 3. Target technical structure

~~~mermaid
flowchart LR
    FPL["Official FPL facts"] --> DATA["Data: season, entry, league, settled facts"]
    DATA --> GQL["GraphQL: bounded personal read models"]
    WEB["Website: account, verified binding, saved context, canonical links"] --> MINI["Mini Program My FPL router"]
    GQL --> MINI

    MINI --> OVERVIEW["总览"]
    MINI --> TEAM["球队"]
    MINI --> LEAGUES["联赛"]

    OVERVIEW --> LIVE["实时"]
    LEAGUES --> COMP["赛事 / 实时竞赛"]
    MINI --> HANDOFF["Website binding / setup / management"]
~~~

Ownership:

- Data owns official season, entry, picks, history, league facts, finalization, and revisions.
- GraphQL owns authorized bounded personal views, league coverage, association lists, and compatibility adapters.
- Website owns account identity, verified FPL binding, binding season, saved personal context, and canonical task links.
- Mini Program owns phase routing, small-screen presentation, cache isolation, last-good behavior, and Chinese copy.

The Mini Program must not infer a new principal from a searched Entry ID, a league member row, a Competition participant, or cached content.

## 4. Shared contracts

### 4.1 Principal context

~~~text
PrincipalContext
  accountState: UNLINKED | LINKED
  teamState:
    ACCOUNT_LINK_REQUIRED
    TEAM_BINDING_REQUIRED
    TEAM_REBIND_REQUIRED
    READY
    OFFLINE_CACHED
  principalRevision
  entryId nullable
  bindingSeason nullable
  verifiedAt nullable
  canonicalActions[]
~~~

Rules:

- Only Website changes entryId, bindingSeason, or principalRevision authoritatively.
- Mini Program resume after Website handoff refreshes PrincipalContext before personal reads.
- A public Entry deep link is read-only and stored separately from the principal.
- A transient 404, timeout, or server error displays a data state; it does not become TEAM_BINDING_REQUIRED.
- Cached private content is visible only when its principalRevision, season, and entry scope still match.

### 4.2 Season and phase context

~~~text
SeasonContext
  season
  phase: PRESEASON | PRE_DEADLINE | LIVE | SETTLING | SETTLED | OFFSEASON
  currentEventId nullable
  nextEventId nullable
  latestSettledEventId nullable
  deadlineAt nullable
  revision
  checkedAt
~~~

The server is authoritative. Device time may format a countdown but cannot select the season, event, or settlement state.

### 4.3 Bounded My FPL read models

Target reads:

| Read model | Purpose |
| --- | --- |
| myFplOverview | One phase-aware primary card plus bounded team, league, Competition, and saved-context summaries |
| myTeamReview | One entry and event/season review with squad, transfers, chips, and history cursors |
| myOfficialLeagues | All official league identities for the verified entry with viewer context and coverage |
| myCompetitionSummaries | Bounded personal summaries for associated prepared Competitions |
| myEntrySettlementReconciliation | Proven live-to-final adjustments and finalization metadata |
| myFplRelevantChanges | Bounded material changes since a confirmed last-seen revision |

Reads must avoid per-card fan-out. Overview returns display-ready summaries; opening a destination loads its detailed query.

### 4.4 Official league and Competition association

~~~text
OfficialLeagueRef
  provider
  season
  leagueId
  leagueType
  name

LeagueCompetitionAssociation
  officialLeagueRef
  competitions[]
    competitionId
    kind
    lifecycle
    setupState
    viewerRole
    nativeDestination nullable
    websiteAction nullable
~~~

Rules:

- An official league and a LetLetMe Competition are different identities.
- One official league can have zero, one, or several associated Competitions.
- The Mini Program never selects the first association as authoritative.
- If no association exists, the league remains fully visible and offers an optional Website preparation action.
- Large leagues expose explicit rank coverage and pagination. A missing viewer rank is not rank zero.

### 4.5 Settled result metadata

~~~text
SettledResultMeta
  season
  eventId
  state: PREPARING | FINAL | PARTIAL | UNAVAILABLE
  factsRevision
  publishedAt nullable
  checkedAt
  authority
  coverage
  reasonCode nullable
~~~

Final personal review uses only FINAL or explicitly marked PARTIAL data. The Mini Program does not simulate autosubs or final adjustments.

## 5. Mini Program canvas and operation hierarchy

### 5.1 Runtime canvas

The native UI is designed from actual usable space:

- Call wx.getWindowInfo() and use windowWidth, windowHeight, safeArea, and the menu-capsule boundary.
- Support 320–430 CSS px portrait widths; verify at least 320 × 568, 375 × 667, 390 × 844, and approximately 430 px wide.
- Reserve native navigation/capsule height, custom bottom navigation, and bottom safe-area inset.
- Use one vertical content column. Compact metric groups use at most two columns.
- Use touch targets of at least 44 CSS px, approximately 88rpx.
- Avoid fixed-height containers for translated labels, ranks, long manager names, and offline/status copy.
- Horizontal scrolling is deliberate and labelled; it is not required to read the primary personal result.

### 5.2 Core hierarchy

~~~text
我的 FPL -> 总览 -> 实时 / 球队 / 联赛
我的 FPL -> 球队 -> 阵容 / 转会 / 开卡 / 历史
我的 FPL -> 联赛 -> 联赛详情 -> 实时 / 赛事 / 网页
~~~

- Core evidence is reachable within three page transitions from bottom navigation.
- 总览 is a router with one phase-led primary card, not a page of nested mini dashboards.
- Each screen exposes no more than two primary selectors.
- Each screen exposes no more than four permanent tabs.
- A card/list row has one primary action and at most one secondary action.
- Additional filters and actions use one non-nested action sheet or a dedicated page.
- No interaction depends on hover, tooltip-only information, right click, precise drag, keyboard shortcuts, modal-in-modal interaction, or a desktop-width chart.

### 5.3 Section-specific control budgets

| Page | Visible primary controls | Mobile simplification |
| --- | --- | --- |
| 总览 | One phase action; optional one secondary continuation | One leading card, then bounded vertical summaries |
| 球队 | Event selector plus active tab | Season/history selection moves to a secondary sheet/page |
| 联赛 | Search plus one filter at most | Type/status/coverage filters share one action sheet |
| 联赛详情 | One event/season selector plus destination actions | No complete league table; show viewer context and bounded nearby rows |

Charts are optional, never the only representation, and show one analytical question at a time. Use native Canvas only when it materially improves comprehension; always provide text or short-table fallback. Do not introduce a chart package.

## 6. Navigation and route ownership

Target four-section bottom navigation:

~~~text
实时 ｜ 我的 FPL ｜ 赛事 ｜ 探索
~~~

My FPL submenu:

~~~text
我的 FPL
  总览
  球队
  联赛
~~~

Proposed routes:

~~~text
/pages/my-fpl/index/index
/pages/my-fpl/team/team
/pages/my-fpl/leagues/leagues
/pages/my-fpl/league/league?id=...
~~~

Compatibility routes:

~~~text
/pages/home/index/index
/pages/summary/entry/entry
/pages/summary/tournament/tournament
/pages/entry/profile/profile
~~~

Migration rules:

- Existing routes remain valid until all internal and shared links migrate.
- The current four-tab Entry Summary can be rehomed before its physical route changes.
- Tournament Summary is removed only after personal Competition meaning moves to My FPL and shared results move to Competitions.
- Home may remain the Mini Program launch router, but My FPL owns personal overview content.

## 7. Page designs

### 7.1 总览

Purpose: answer “现在与我的 FPL 最相关的是什么？”

First-render order:

1. Resolve PrincipalContext.
2. Resolve SeasonContext.
3. Render one phase-specific primary card.
4. Load bounded secondary summaries without blocking the primary card.
5. Mark freshness, coverage, and last-good state.

Phase behavior:

| Phase | Primary card |
| --- | --- |
| PRESEASON / OFFSEASON | Active-season identity state, upcoming season context, or Website binding/rebind task |
| PRE_DEADLINE | Deadline and latest publicly frozen squad summary; never claim knowledge of a private draft |
| LIVE | Current score/status summary with one primary action to 实时球队 |
| SETTLING | Processing state, last coherent provisional result, and no invented final changes |
| SETTLED | Final GW result, movement, and one action to personal review |

Secondary summaries are bounded:

- official leagues requiring attention or recently changed;
- prepared Competitions with a current personal outcome;
- squad availability or price changes when sourced and material;
- saved players or rivals only after Website exposes a shared, season-safe contract.

Canvas rules:

- One primary phase card occupies the first viewport, not three equal metric panels.
- Summary metrics are a maximum two-column grid.
- Secondary modules are vertical and collapsible; no horizontal carousel is required for discovery.
- At most one primary and one secondary action appear on the lead card.

Empty/error states:

- ACCOUNT_LINK_REQUIRED: explain and open the exact Website account-link task.
- TEAM_BINDING_REQUIRED: explain why a verified team is needed and open Website binding.
- TEAM_REBIND_REQUIRED: block stale-season personal reads and open Website rebind.
- OFFLINE_CACHED: show matching cached summary and a visible offline state.
- Data failure with READY principal: retain binding, preserve same-context content, and retry data only.

### 7.2 球队

Purpose: answer “我的球队在选定 GW/赛季最终发生了什么？”

Reuse the current four-tab foundation:

~~~text
阵容 ｜ 转会 ｜ 开卡 ｜ 历史
~~~

Rules:

- Four tabs is the permanent maximum.
- Keep the event selector visible; move season selection and rare history controls to one secondary sheet/page.
- 阵容 is a vertical starting/bench list, not a pitch that depends on width.
- Compact score and rank summaries use at most two columns.
- 转会, 开卡, and 历史 use bounded pages/cursors and never load an entire season into first render.
- During LIVE, the page links to Live rather than running a second polling engine.
- During SETTLING, display explicit processing state.
- During SETTLED, show only reconciled final facts.
- Player rows may open neutral Explore evidence. They do not contain transfer or captain advice.

Optional native charts:

- render one chart at a time;
- use native Canvas only;
- provide the same facts as accessible text or a compact table;
- lazy-load below the first viewport;
- omit the chart on memory/performance pressure without losing meaning.

### 7.3 联赛

Purpose: answer “我的官方 FPL 联赛有哪些，我在其中处于什么位置？”

List requirements:

- Load all official league identities through a bounded cursor.
- Show league type, start event, viewer rank when covered, rank movement when proven, and coverage.
- Show zero, one, or multiple LetLetMe Competition associations explicitly.
- Keep the official league usable when no Competition is prepared.
- Search is server-bounded. One additional high-value filter may be visible; all other filters use one action sheet.

League row:

~~~text
league name and type
viewer rank / movement / coverage
prepared Competition count
one primary action
optional Website preparation action
~~~

Destination rules:

- Prepared current result -> Live Competition.
- Prepared finalized shared result -> Competition Results.
- Several associations -> small association-selection page, never an implicit first choice.
- No association -> viewer league detail plus optional Website setup.
- Full league management or Competition creation -> Website.

League detail is not a full desktop standings workspace. It shows viewer context, bounded nearby rows where supported, source status, associated Competitions, and clear destinations.

## 8. Relevant changes and reconciliation

### 8.1 Material change types

Only bounded, evidenced changes appear:

~~~text
GAMEWEEK_FINALIZED
OVERALL_RANK_MOVED
OFFICIAL_LEAGUE_RANK_MOVED
COMPETITION_RESULT_READY
COMPETITION_POSITION_MOVED
MATCHUP_CHANGED
SQUAD_PLAYER_AVAILABILITY_CHANGED
SAVED_PLAYER_AVAILABILITY_CHANGED
SQUAD_OR_SAVED_PLAYER_PRICE_CHANGED
~~~

Rules:

- No first visit invents “since last time” changes.
- A change compares two server-confirmed revisions for the same principal, season, and scope.
- Acknowledge last-seen only after the relevant content renders successfully.
- Repeated opens before acknowledgment are idempotent.
- A bounded count and latest items appear on Overview; full history is not an infinite activity feed.
- No change wording becomes a recommendation.

### 8.2 Live-to-final reconciliation

The final review may explain only proven differences between coherent snapshots:

- confirmed autosub effects provided by the authoritative final facts;
- confirmed captain/vice-captain scoring outcome;
- confirmed bonus or correction changes;
- confirmed rank/league movement.

The Mini Program does not infer hypothetical autosubs, simulate private team state, or compare mismatched revisions.

## 9. Website handoff

Website-only actions:

- link account;
- bind or rebind the FPL team;
- change account/security settings;
- prepare an official league as a Competition;
- create, join, or manage a Competition;
- use desktop-depth personal analysis not selected for native delivery.

Handoff contract:

~~~text
CanonicalActionLink
  actionType
  href
  locale: zh-CN
  requiresWebsiteAuth
  returnRefreshPolicy
~~~

Rules:

- Use allowlisted direct task URLs supplied by Website.
- Do not place Mini bearer tokens, email, openid, user ID, or the principal envelope in URLs.
- Treat web-view as an independent full-page surface; native headers, sheets, and buttons cannot overlay it.
- Target Website pages must be mobile, single-column, safe-area aware, pass the same 320–430 CSS px width fixtures, and preserve the intended task through login. Their height and scroll state are independent because web-view replaces the native page.
- Explain that Website login may be required before opening.
- Provide copy-link fallback for unsupported domain/client behavior.
- On return, refresh PrincipalContext first, then season and visible personal content according to returnRefreshPolicy.
- Do not intercept every My FPL visit with binding. Public and cached-safe surfaces continue where their authorization permits.

## 10. Mini Program primitives and package boundary

Repo-native units:

~~~text
miniprogram/components/principal-state/
miniprogram/components/my-fpl-phase-card/
miniprogram/components/personal-status-strip/
miniprogram/components/official-league-card/
miniprogram/components/website-handoff/

miniprogram/models/principal.ts
miniprogram/models/my-fpl.ts
miniprogram/services/my-fpl.service.ts
miniprogram/utils/my-fpl-phase.ts
miniprogram/utils/relevant-change.ts
miniprogram/utils/canonical-action.ts
~~~

Package rule:

- Add zero runtime npm dependencies.
- Reuse existing @vant/weapp and native picker, scroll-view, action-sheet, IntersectionObserver, Canvas, pull-to-refresh, and onShareAppMessage where needed.
- Do not port Website chart, Radix, toast, virtual-list, Markdown/rich-text, command-palette, or state-management packages.
- Prefer bounded GraphQL aggregation, cursor pagination, lazy sections, and incremental setData.
- A later dependency exception requires separate approval and evidence that native APIs cannot meet the bounded requirement.

## 11. Client state, cache, and failures

Private cache key:

~~~text
principalRevision
+ bindingSeason
+ entryId
+ surface
+ eventId or leagueId where applicable
+ factsRevision
~~~

Rules:

- Never reuse personal content across principalRevision, entryId, or season.
- Keep list and detail cache lifetimes independent.
- Pull-to-refresh bypasses the visible surface cache.
- Reject stale responses after principal, season, event, league, tab, or request generation changes.
- Use incremental setData for bounded list append; do not replace the complete page tree for one row update.
- Clear private cache on authoritative unlink/rebind, not on content failure.
- Preserve same-context last-good data with a visible stale/offline status.
- Unknown enum or optional-section failure cannot blank the primary personal result.

## 12. Work packages

### MP-M1 — Principal and season contract

- Adopt PrincipalContext and SeasonContext.
- Separate verified principal, explicit public Entry, and cached context.
- Add binding/rebind Website actions without duplicating authority.

### MP-M2 — Four-section navigation and Overview

- Add 我的 FPL navigation and route ownership.
- Implement phase-led Overview and principal states.
- Rehome compatible Home summaries.

### MP-M3 — Team review

- Rehome Entry Summary under My FPL.
- Add settlement state and reconciliation metadata.
- Enforce four-tab, one-event-selector mobile control budget.

### MP-M4 — Official leagues

- Add all-league bounded index and viewer context.
- Add explicit zero-to-many Competition associations.
- Implement association selection and coverage states.

### MP-M5 — Relevant changes and saved context

- Add revision-safe material changes.
- Add optional saved/rival summaries only after Website contract readiness.
- Add successful-render acknowledgment.

### MP-M6 — Website handoff

- Add canonical action parsing, full-page web-view, login explanation, copy fallback, and return refresh.
- Verify account link, binding, rebind, and league-preparation tasks.

### MP-M7 — Performance, observability, and release

- Add cache isolation, stale-response guards, telemetry, compatibility gates, and representative-device checks.
- Verify zero new package output and package budget.

## 13. Dependency and delivery order

Contract order:

~~~mermaid
flowchart LR
    DATA["Data season / entry / league / settled facts"] --> GQL["GraphQL bounded My FPL reads"]
    GQL --> WEB["Website principal, actions, saved context"]
    WEB --> MINI["Mini Program"]
~~~

Delivery:

1. Freeze semantic fixtures for principal, phase, settlement, league coverage, and associations.
2. Release additive Data/GraphQL fields.
3. Release Website canonical links and principal contract.
4. Ship Mini Program PrincipalContext plus Overview behind a feature switch.
5. Rehome Team, then add Leagues.
6. Enable material changes only after two-revision evidence is proven.
7. Observe a live-to-settled gameweek before removing compatibility ownership.

Production deployment remains Data -> GraphQL -> Website -> Mini Program.

## 14. Compatibility and rollback

- Keep current Home, Entry Summary, Tournament Summary, and public Entry routes during migration.
- GraphQL additions remain nullable/additive until rollback targets no longer require old shapes.
- Unknown association/result types render an explicit unsupported state and Website continuation.
- Disable new My FPL navigation independently while existing routes continue to work.
- A rollback never clears binding, rewrites principal identity, or reports provisional data as final.
- Route and field cleanup is a later evidence-backed change.

## 15. Verification plan

### 15.1 Contract and unit

Cover:

- all PrincipalContext states and authoritative versus transient failures;
- season and phase mapping;
- public Entry isolation from principal Entry;
- pre-deadline public-squad boundary;
- live, settling, final, partial, and unavailable states;
- all-league pagination, rank coverage, and zero-to-many Competition associations;
- stale response rejection across principal/season/event/tab/league changes;
- material-change comparison and post-render acknowledgment;
- same-context last-good eligibility;
- Website action allowlisting and return refresh.

Repository checks:

~~~text
npm run typecheck
npm run lint
npm test
npm run package:check
git diff --check
~~~

Verify every route in miniprogram/app.json has complete ts, wxml, wxss, and json units.

### 15.2 DevTools and real devices

Verify:

- account unlinked, linked/unbound, stale season, ready, and offline cached;
- binding and rebind open the exact Website task and do not mutate principal locally;
- preseason, pre-deadline, live, settling, settled, and offseason Overview;
- Team four-tab behavior and deep-link restoration;
- 0, 1, many, and paginated official leagues;
- zero, one, and multiple Competition associations;
- 320 × 568, 375 × 667, 390 × 844, and approximately 430 px-wide portrait canvases;
- native capsule, custom bottom navigation, and safe-area spacing;
- no screen exceeds two primary selectors, four permanent tabs, or one non-nested action sheet;
- every core evidence path stays within three page transitions;
- long Chinese names, large ranks, large league counts, slow network, offline launch, and foreground recovery;
- 44 CSS px touch targets, outdoor legibility, and screen-reader labels;
- web-view independent full-page behavior, mobile target, login explanation, copy fallback, and return refresh;
- package manifest and lock remain unchanged and no new runtime package is bundled.

## 16. Observability

Record sanitized fields:

~~~text
surface
principalState
principalRevisionChanged
season
phase
eventId
settledState
factsRevisionChanged
leagueCountBucket
associationCountBucket
cacheOutcome
handoffActionType
handoffOpenMode
returnRefreshOutcome
durationBucket
reasonCode
~~~

Do not log Mini bearer tokens, signed principal envelopes, email, openid, user ID, manager/team/league names, full Entry IDs, saved-player lists, or complete payloads.

Success indicators:

- time to phase card;
- percentage of content failures that preserve a verified binding and last-good content;
- Overview-to-Live/Team/League continuation;
- all-league pagination completion;
- binding/rebind handoff and return-refresh success;
- live-to-final reconciliation correctness;
- stale cross-principal or cross-season render count, which must be zero;
- runtime package delta, which must be zero.

## 17. Completion criteria

The My FPL Mini Program design is complete when:

1. 我的 FPL opens a Chinese-only Overview with Team and Leagues as its other permanent destinations.
2. Website remains the only authority for account link, verified team binding, rebind, and security changes.
3. Mini Program principal states are explicit and content failures never clear binding.
4. Overview leads with one correct season-phase card rather than an equal-weight dashboard.
5. Pre-deadline content never claims to know a private draft.
6. Live detail goes to Live; final personal review uses settled facts and proven reconciliation.
7. Team keeps no more than four permanent tabs and a mobile vertical squad.
8. Leagues lists all official leagues with explicit coverage and zero-to-many Competition associations.
9. Competition creation, preparation, joining, and management remain Website-only.
10. Relevant changes compare confirmed same-context revisions and acknowledge only after successful render.
11. Every core path remains within three page transitions and every page stays within two primary selectors.
12. Every page works across the 320–430 px portrait canvas range, native capsule area, bottom navigation, and safe-area inset.
13. Website handoff is a direct, independent full-page mobile web-view task with explained login, copy fallback, and state refresh after return.
14. Initial delivery adds zero runtime packages and does not import Website-specific interaction libraries.
15. The Mini Program exposes no AI Assistant, official FPL actions, or recommendation language.
16. Contract, unit, DevTools, real-device, handoff, compatibility, season-rollover, and first-live-to-settled verification pass with recorded evidence.
