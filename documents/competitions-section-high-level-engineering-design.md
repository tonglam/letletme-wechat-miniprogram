# LetLetMe WeChat Mini Program Competitions Section — High-Level Engineering Design

- **Status:** Proposed engineering design, ready for technical review
- **Recorded:** 10 August 2026
- **Section:** 3 of 4 — Competitions
- **Mini Program baseline:** main@0d3b3ab
- **Website implementation comparison baseline:** codex/web-adjustments-main-integration@547b169
- **Scope:** Competition identity and read contracts, Web-issued principal state and canonical links, and the WeChat Mini Program Competitions client
- **Product target authority:**
  - letletme-web/docs/product/letletme-four-section-specification.md
  - letletme-web/docs/product/letletme-cross-section-implementation-plan.md
  - letletme-web/docs/product/letletme-competitions-section-high-level-design.md

The Website implementation baseline and product target are deliberately separate. Current-code claims in this document come from the local Web adjustment worktree. Target identity, lifecycle, route, and ownership decisions come from the product documents in the canonical Web workspace and are not presented as already implemented.

## 1. Purpose and fixed decisions

The Mini Program Competitions section is the Chinese-only mobile place for a participant or organizer to:

- resume a prepared Competition;
- understand whether it tracks an official FPL league or uses LetLetMe custom rules;
- see its lifecycle, setup/readiness, current stage, and personal context;
- open the current result in Live;
- inspect finalized shared results and history;
- continue creation, setup, recovery, and management on Website.

The Mini Program is not a second Competition administration client. Website remains the command and canonical management surface.

The fixed product decisions are:

- The Mini Program top-level label is **赛事**.
- Opening 赛事 goes directly to **我的赛事**; there is no permanent native Create submenu.
- A Competition has one explicit kind:
  - tracked official league;
  - custom tournament.
- An official FPL league source and a LetLetMe Competition are different identities.
- My FPL → Leagues shows all official leagues available from the linked FPL entry.
- Competitions shows only LetLetMe-prepared tracked leagues and custom tournaments the principal may access.
- One official source may be associated with zero or more Competition objects. The client never chooses the first association as authoritative.
- Competition Home is the stable object summary before, during, and after matchday.
- Current detailed results remain owned by Live.
- Finalized shared results and history remain owned by Competitions.
- Viewer-only meaning and personal change may be reused by My FPL, but My FPL does not reproduce the full shared report.
- Creation, official-source admission, setup, rules editing, roster editing, invitations administration, pause/resume, recovery, archive, and deletion are Website-only.
- Invitation acceptance and roster-claim commands are also Website-only in this initial Mini Program plan. A later native join flow requires a separate approved command and authentication design.
- Competitions are private by default. There is no public Competition directory or arbitrary official-league lookup.
- A read request never starts source admission, full league collection, or Competition preparation.
- The Mini Program does not provide an AI Assistant.
- The Mini Program does not perform official FPL team actions or provide transfer, captain, lineup, or optimization recommendations.
- The initial Competitions implementation adds zero Mini Program runtime packages. It uses native WXML/WXSS and existing @vant/weapp components only.

## 2. Product ownership boundaries

### 2.1 My FPL Leagues versus Competitions

| Question | My FPL → Leagues | Competitions |
| --- | --- | --- |
| What objects appear? | Every official league returned for the verified active-season FPL entry | Prepared tracked official leagues and custom tournaments authorized for the account or active-season entry |
| What is the main purpose? | Personal official-league position and preparation coverage | Shared Competition identity, rules, lifecycle, current result, and final record |
| Does an unprepared official league appear? | Yes, with an explicit coverage state | No |
| Does a custom tournament appear? | Only as a bounded personal summary where relevant | Yes, as a canonical Competition object |
| Does it show full standings/history? | No | Yes, through bounded Competition result and history reads |
| Can it initiate tracking? | Website setup handoff | Website Create handoff |

The same official source may be visible in both sections, but the meaning is different. My FPL displays the manager's official-league relationship; Competitions displays a prepared LetLetMe object.

### 2.2 Live versus Competition Home and Results

| Surface | Owner | Responsibility |
| --- | --- | --- |
| Current prepared Competition result | Live | Fast provisional or selected-GW table, matchup, or bracket |
| Competition identity and lifecycle | Competitions | Kind, source, format, rules, roster behaviour, readiness, current stage, and available destinations |
| Finalized shared result | Competitions | Official or LetLetMe-authority final result with settled metadata |
| Season/stage history | Competitions | Bounded event and stage path with format-specific summaries |
| Personal interpretation | My FPL | Viewer movement and what the result meant for the linked manager |

The Mini Program may render native summaries of these objects, but Website remains the canonical URL owner for deep links, management, and desktop continuation.

## 3. Current implementation baseline

### 3.1 Mini Program

| Area | Current capability | Main gap |
| --- | --- | --- |
| Navigation | 实时, 统计, 数据; 联赛 appears under both Live and Summary | No top-level Competitions section or My Competitions destination |
| Competition index | Selectors inside Live Tournament and League Summary use entryTournaments | No resumable list with kind, role, lifecycle, setup attention, or contextual actions |
| Live | Prepared-object selector, GW selection, search, sorting, ownership and club-exposure filters, incremental rows, partial-failure retention | Generic Tournament/league identity and points-table presentation; no explicit kind or format-specific result contract |
| Summary | Personal GW metrics, top-30 standings plus the viewer, and cumulative value/transfer/bench ranks | Filters to points-race-compatible objects, mixes personal and shared scope, and lacks settled metadata and full history |
| Selection evidence | Competition-cohort selection, captain, and transfer trends | Correctly useful as Explore evidence, but currently reinforces the generic Tournament model |
| Account gate | Reads global entryId and inherited Mini session | Organizer account authority and active-season participant authority are not separated |
| Website handoff | Account copy references Website in limited states | No reusable canonical action-link or web-view handoff primitive for Create and Manage |
| Routes | live/tournament and summary/tournament | No Competition Home, Results/History, or invitation-preview route |

Current Mini Program references:

- miniprogram/components/navigation/bottomNavBar/bottomNavBar.ts
- miniprogram/pages/live/tournament/tournament.ts
- miniprogram/pages/summary/tournament/tournament.ts
- miniprogram/pages/data/selections/selections.ts
- miniprogram/services/tournament.service.ts
- miniprogram/services/live.service.ts
- miniprogram/models/tournament.ts

### 3.2 Website comparison baseline

| Area | Current implementation |
| --- | --- |
| Navigation | A singular Tournament category exposes New Tournament and Browse Tournaments; Tournament views also remain under Live and Me |
| List | The browse route supports search, Classic/H2H and lifecycle filters, organizer filtering, sorting, progressive rows, and Live/Manage actions |
| Menu default | The current menu opens browse with mine=true, which prioritizes administered objects rather than all participant and organizer relationships |
| Create | A Classic path and a custom builder load official-source participants, support selected rosters, points groups, and single/double elimination configuration |
| Canonical object | /tournament/[id] redirects directly to /live/tournaments/[id] |
| Live | Strong standings, comparison, filters, roster/rules, setup status, recovery, and management linking |
| Settled analysis | Rich shared and viewer-specific reporting is mixed inside /me/tournament |
| Manage | Rename, pause/resume, setup retry, official roster-sync recovery, and permanent deletion are present |
| Missing target foundations | Explicit competition kind/season/stable owner, source-to-many-Competition identity, canonical Home, invitations/join, roster lock, archive-first deletion, and complete format-specific result journeys |

The Mini Program must not copy current Website weaknesses into a new native structure. It consumes the additive target contracts after their upstream release gates pass.

## 4. Target technical structure

~~~mermaid
flowchart LR
    FPL["Official FPL source"] --> DATA["Data: source, Competition, lifecycle, results"]
    DATA --> GQL["GraphQL: bounded authorized Competition reads"]

    AUTH["Website: account, principal, canonical links"] --> MINI["Mini Program Competitions router"]
    GQL --> MINI

    MINI --> LIST["我的赛事"]
    MINI --> HOME["赛事主页"]
    MINI --> RESULTS["结果与历史"]
    MINI --> INVITE["邀请预览"]

    HOME --> LIVE["实时竞赛"]
    LIST --> WEB["Website Create"]
    HOME --> WEB
    INVITE --> WEB
~~~

Ownership rules:

- **Data** owns official-source admission state, Competition identity, membership facts, lifecycle, setup facts, format calculations, settled results, and audit history.
- **GraphQL** owns bounded read models, stable organizer/member authorization, result discriminators, pagination, coverage, and compatibility adapters.
- **Website** owns Better Auth identity, season-aware FPL binding, trusted Competition commands, target route registry, localized canonical links, and management UX.
- **Mini Program** owns Chinese mobile navigation, bounded list/detail composition, local continuation state, Website handoff presentation, and offline/last-good behavior.

The Mini Program does not persist a parallel Competition truth store and does not infer kind, lifecycle, authority, or capabilities from old fields.

## 5. Shared identity and state contracts

### 5.1 Season-safe references

Every new Competition read uses explicit identity:

~~~text
CompetitionRef
  competitionId
  season

OfficialLeagueSourceRef
  sourceId
  season
  leagueType
  leagueId

EntryRef
  season
  entryId

AccountRef
  userId
~~~

Rules:

- Competition ID is the stable LetLetMe object identity.
- Display names are non-unique metadata and never drive navigation or cache identity.
- Official source identity is unique by season, league type, and league ID.
- Several Competition objects may reference the same official source.
- Stable organizer ownership uses AccountRef.
- Competitive participation, standings, and viewer position use EntryRef.
- A numeric entry, event, official league, or player ID is not sufficient outside a season-scoped aggregate.
- Legacy Tournament fields are adapted at GraphQL; the Mini Program does not reproduce kind-inference logic.

### 5.2 Competition identity

The shared minimum projection is:

~~~text
CompetitionIdentity
  competitionId
  season
  name
  competitionKind:
    TRACKED_OFFICIAL_LEAGUE
    CUSTOM_TOURNAMENT
  officialLeagueSource nullable
  format
  rosterBehaviour:
    OFFICIAL_SYNC
    FIXED_CUSTOM_ROSTER
  resultAuthority:
    OFFICIAL_FPL
    LETLETME_RULES
~~~

Display mapping:

| Contract value | Mini Program label |
| --- | --- |
| TRACKED_OFFICIAL_LEAGUE | 官方联赛追踪 |
| CUSTOM_TOURNAMENT | 自定义赛事 |
| OFFICIAL_SYNC | 名单随官方联赛同步 |
| FIXED_CUSTOM_ROSTER | 名单按赛事规则锁定 |
| OFFICIAL_FPL | 最终结果以 FPL 官方为准 |
| LETLETME_RULES | 最终结果按 LetLetMe 规则计算 |

The client displays an unknown compatible enum as a neutral unsupported state and keeps safe canonical Website actions. It must not guess a familiar type.

### 5.3 Principal and authorization

The Mini Program consumes a signed principal derived from the linked Website account:

~~~text
PrincipalContext
  userId
  bindingSeason nullable
  entryId nullable
  bindingVerifiedAt nullable
  envelopeVersion
  principalRevision
~~~

Authorization has two independent relationships:

1. **Organizer:** stable Website user owns the Competition.
2. **Participant:** active-season FPL Entry is in the Competition roster.

Access behavior:

| Principal state | My Competitions behavior |
| --- | --- |
| ACCOUNT_LINK_REQUIRED | No private Competition query; show account-link CTA |
| TEAM_BINDING_REQUIRED | GraphQL may return organizer-owned objects authorized by user identity; participant summaries remain unavailable; show Website binding CTA |
| TEAM_REBIND_REQUIRED | Never reuse the stale entry; organizer-only access may remain if explicitly authorized; show rebind CTA |
| READY | Show the union of organizer-owned and active-entry-participating Competitions |
| OFFLINE_CACHED | Show only same-principal cached objects with offline status and disable freshness-sensitive actions |

Rules:

- The Mini Program never supplies another user ID or treats a route Entry ID as principal identity.
- Stable organizer access is not lost merely because an official source later removes the organizer's competitive entry.
- Participant-only reads require an active-season verified binding.
- Content 404, GraphQL failure, or network timeout never clears account or FPL binding.
- Only an authoritative Website profile/principal transition changes binding state.
- Full Competition views remain organizer/member private. An invitation preview uses a separately sanitized projection.

### 5.4 Lifecycle and setup

Product lifecycle and operational setup are separate:

~~~text
CompetitionLifecycle
  DRAFT
  ENROLLING
  PREPARING
  ACTIVE
  PAUSED
  FINISHED
  ARCHIVED

CompetitionSetup
  PENDING
  PROCESSING
  READY
  FAILED
~~~

Mini Program presentation mapping:

| Lifecycle/setup | Primary presentation | Primary action |
| --- | --- | --- |
| DRAFT | 草稿，尚未开放 | 到网页继续设置 |
| ENROLLING | 招募中 | 查看说明 / 到网页管理 |
| PREPARING + PENDING/PROCESSING | 正在准备数据 | 查看进度 |
| PREPARING + FAILED | 准备失败，需要组织者处理 | 到网页修复 |
| ACTIVE | 进行中 | 查看实时结果 |
| PAUSED | 已暂停 | 查看状态；组织者到网页管理 |
| FINISHED | 已结束 | 查看结果与历史 |
| ARCHIVED | 已归档 | 查看历史；默认列表隐藏 |

Rules:

- Setup state never replaces lifecycle.
- A participant sees setup attention without receiving recovery commands.
- The Mini Program renders server-supplied available actions; it does not derive command permission from role plus state.
- Archive preserves history and removes the object from active defaults.
- Hard deletion is never exposed in Mini Program.

### 5.5 Result metadata

Current and finalized results use different contracts.

~~~text
LiveResultMeta
  season
  eventId
  revision
  state: SCHEDULED | LIVE | SETTLED
  publishedAt
  checkedAt
  authority: OFFICIAL_FPL | LETLETME_RULES | MIXED
  coverage.expected
  coverage.succeeded
  coverage.failed
  reasonCode nullable

SettledResultMeta
  season
  eventId
  state: PREPARING | FINAL | PARTIAL | UNAVAILABLE
  authority: OFFICIAL_FPL | LETLETME_RULES
  sourceCheckedAt nullable
  detailsReadyAt nullable
  coverageThroughEventId nullable
  reasonCode nullable
~~~

Rules:

- Competition Home contains only compact result summaries.
- Current detailed result opens Live and follows Live polling/retention rules.
- Results/History consumes settled metadata and never polls as if it were Live.
- PREPARING, PARTIAL, UNAVAILABLE, empty, and unauthorized are distinct states.
- Official tracked-league final records use official authority.
- Custom tournament results use LetLetMe rule authority after official input and audit gates pass.
- The Mini Program never changes authority based on which provider fields appear in a result.

## 6. Required GraphQL read models

Add competition-named reads while retaining current Tournament reads during compatibility.

### 6.1 My Competitions

~~~text
myCompetitions(
  first
  after
  lifecycleFilter
  roleFilter
  kindFilter
  search
)
  seasonContext
  edges
    identity
    lifecycle
    setupSummary
    viewerRole
    viewerSummary
    currentStage
    participantCount
    factsRevision
    availableActions
  pageInfo
~~~

Requirements:

- Bounded and cursor-paginated.
- Stable ordering: setup attention, active relevance, recent activity, stable ID.
- One list row never loads a full standings table, roster, or history.
- Organizer and participant relationships are de-duplicated into one row with combined role metadata.
- Archived objects are excluded by default.
- Search operates only on already-authorized bounded metadata.

### 6.2 Competition Home

~~~text
competition(competitionRef)
  identity
  lifecycle
  setup
  viewerAccess
  viewerSummary
  organizerDisplay
  sourceSummary
  rulesSummary
  rosterSummary
  currentStage
  currentResultSummary
  latestSettledResultSummary
  factsRevision
  availableActions
  canonicalLinks
~~~

Requirements:

- No full Live result table.
- No complete history response.
- Rules and roster are summaries with bounded preview counts.
- Organizer display is authorized presentation metadata, not a public account identifier.
- Unsupported formats remain viewable as identity/history-safe objects with a Website continuation action.

### 6.3 Participants

~~~text
competitionParticipants(
  competitionRef
  first
  after
  search
)
  edges
    entryDisplay
    membershipOrigin
    membershipState
    viewerRelationship
  pageInfo
~~~

Requirements:

- Member-safe, paginated, and search-bounded.
- Private identifiers and account IDs are not exposed.
- Tracked official leagues explain synchronized membership.
- Custom tournaments explain selected/locked membership.
- The Mini Program offers no add/remove/reorder controls.

### 6.4 Results and History

~~~text
competitionResult(competitionRef, eventRef)
  settledMeta
  viewerContext
  resultBody

competitionHistory(
  competitionRef
  first
  after
)
  edges
    eventRef
    stage
    summary
    settledMeta
  pageInfo
~~~

Requirements:

- One selected detailed result plus a bounded history index.
- The selected result body is discriminated by enabled format.
- History does not return every participant row for every event.
- Viewer context is optional and cannot change the shared result.
- Deep links preserve Competition, season, event, and stage.

### 6.5 Invitation preview

~~~text
competitionInvitationPreview(invitationReference)
  sanitizedIdentity
  organizerDisplay
  rulesSummary
  scheduleSummary
  participantCount
  capacityState
  invitationState
  websiteJoinLink
~~~

Requirements:

- Preview is a sanitized capability projection, not full Competition authorization.
- The initial Mini Program has no join mutation.
- Accept/join, claim, duplicate, full, closed, expired, revoked, wrong-season, and binding flows continue on Website.
- Invitation capability material is never logged, cached beyond its short requirement, or placed into analytics.

## 7. Format-specific result contract

GraphQL returns a discriminated result body:

~~~text
OFFICIAL_CLASSIC_STANDINGS
CUSTOM_POINTS_TABLE
CUSTOM_BATTLE_MATCHUPS
CUSTOM_KNOCKOUT_BRACKET
~~~

Initial release gates:

- Official Classic tracking and custom points table are the first production paths.
- Custom battle and knockout appear only after creation, explanation, setup, Live, settlement, history, and management work end to end on Website.
- Official H2H remains disabled until its official contract is separately verified.
- A backend enum or stored result table is not sufficient to expose a format.

Mini Program renderers:

| Result type | Native presentation |
| --- | --- |
| OFFICIAL_CLASSIC_STANDINGS | Official rank, movement, points, viewer row, source/final status |
| CUSTOM_POINTS_TABLE | LetLetMe points table, group/stage, tie-break summary, viewer row |
| CUSTOM_BATTLE_MATCHUPS | Matchup cards plus group/table summary |
| CUSTOM_KNOCKOUT_BRACKET | Mobile round selector, tie/leg cards, score and advancement |

Rules:

- Unknown result types show an unsupported-format state with canonical Website continuation.
- Do not collapse battle or knockout into a generic standings table.
- Wide tables use mobile cards or deliberate horizontal scrolling with fixed identity context.
- Result copy explains authority and format without recommendation or judgment language.

## 8. Server-owned capabilities and actions

The Mini Program never reconstructs permissions from fields.

~~~text
CompetitionCapabilities
  canViewHome
  canViewParticipants
  canViewLive
  canViewResults
  canViewHistory
  canPreviewInvitation
  canOpenWebsiteCreate
  canOpenWebsiteManage
  canOpenWebsiteJoin
  canShareSanitizedResult
~~~

Native Mini Program actions are limited to authorized reads, local filters, navigation, refresh, and sanitized sharing.

Website-only actions include:

- track an official league;
- create a custom tournament;
- inspect/admit an official source;
- edit rules or schedule;
- add/remove participants;
- create/revoke invitations;
- join or claim a roster place;
- lock the roster;
- start or retry preparation;
- pause/resume;
- archive;
- permanently delete when server-authorized.

An unavailable action is omitted or rendered with a typed explanation. The Mini Program must not show a button that calls a hidden command endpoint.

## 9. Navigation and route ownership

### 9.1 Target bottom navigation

~~~text
实时 ｜ 我的 FPL ｜ 赛事 ｜ 探索
~~~

Opening **赛事** goes directly to My Competitions.

There is no action sheet containing a native Create destination because only one permanent Mini Program destination exists at section level.

Within My Competitions:

- primary action: open the most relevant authorized Competition;
- secondary action: 在网页创建赛事;
- organizer contextual action: 到网页管理;
- empty state: explain tracked official league versus custom tournament, then hand off to Website Create.

### 9.2 Proposed Mini Program routes

~~~text
/pages/competitions/index/index
/pages/competitions/detail/detail?id=...
/pages/competitions/results/results?id=...&season=...&event=...
/pages/competitions/participants/participants?id=...
/pages/competitions/invite/invite?ref=...
~~~

Compatibility routes remain:

~~~text
/pages/live/tournament/tournament
/pages/summary/tournament/tournament
/pages/data/selections/selections
~~~

Physical route cleanup is not required for the first release. User-facing terminology and canonical ownership change before legacy removal.

### 9.3 Rehome map

| Current Mini Program surface | Target owner |
| --- | --- |
| Live → 联赛 | Live → 竞赛 |
| 统计 → 联赛 → 我的表现 | My FPL bounded personal Competition summary |
| 统计 → 联赛 → 排名/赛事信息 | Competition Results |
| 统计 → 联赛 → 累计共享指标 | Competition Results/History |
| 数据 → 阵容选择 | Explore → Trends/evidence, retaining exact Competition cohort context |

Do not remove the current Summary page until My FPL personal-summary parity and Competition Results parity both pass.

### 9.4 Mini Program canvas and operation hierarchy

Competitions must not reproduce the Website administration workspace inside a smaller viewport. The native design starts from the usable WeChat canvas:

- Resolve windowWidth, windowHeight, safeArea, and the menu-capsule boundary with wx.getWindowInfo().
- Support 320–430 CSS px portrait widths. Verify at least 320 × 568, 375 × 667, 390 × 844, and an approximately 430 px-wide device.
- Reserve native navigation, capsule, custom bottom navigation, and bottom safe area before placing sticky controls.
- Default to one vertical column and at most two metric columns. Touch targets are at least 44 CSS px (approximately 88rpx).
- A Competition card has one primary action and at most one secondary Website action. More actions live on Competition Home or one action sheet.
- No native flow uses hover, tooltip-only explanations, right click, precise drag, desktop keyboard commands, modal-in-modal interaction, or a full desktop bracket.

The core hierarchy is:

~~~text
赛事 -> 我的赛事 -> 赛事主页 -> 实时 / 结果 / 成员 / 网页
~~~

The selected destination is reachable within three page transitions from bottom navigation. Competition Home is the decision hub; it does not become a page containing several nested workspaces.

Control budgets:

- A page exposes no more than two primary selectors at once.
- A page exposes no more than four permanent tabs; additional sections become vertical blocks or child routes.
- Search plus one high-value filter may be visible on My Competitions. Lifecycle, role, kind, and format filters collapse into one non-nested action sheet.
- Results show at most two controls: event/stage and format-relevant round/group. A knockout shows one selected round with previous/next navigation.
- Wide result tables are a last resort. When used, freeze the identity cell, show an explicit horizontal-scroll affordance, and keep the viewer summary readable outside the table.
- Participants are a paginated vertical list; roster search and membership filters are not simultaneous desktop sidebars.

Creation, management, recovery, invitations, join, archive, and deletion open Website as a full-page web-view task. The Mini Program does not overlay controls over web-view. Each handoff uses a direct mobile single-column target, explains possible Website login, supplies a copy-link fallback, and refreshes principal/list/object state after return.

## 10. Page designs

### 10.1 My Competitions

Purpose: answer “我参加或组织的赛事，哪个现在最需要我关注？”

Required first render:

1. Resolve principal and active season.
2. Load the bounded first page only.
3. Lead with one relevant group:
   - 需要处理;
   - 进行中;
   - 准备中;
   - 最近结束.
4. Keep search and filters secondary.
5. Restore a locally remembered Competition only when it remains in the newly authorized list.

Competition card:

~~~text
name
kind label
format label
lifecycle/setup badge
viewer role
participant count
current stage or relevant GW
viewer position or matchup
one primary destination
optional Website management action
~~~

Rules:

- Default includes both participant and organizer relationships.
- Do not default to Classic-only or organizer-only.
- Do not show all official FPL leagues here.
- Do not calculate one full field result per card.
- A setup failure identifies that organizer attention is required without exposing recovery controls to participants.
- Pull-to-refresh bypasses the list cache.
- Returning from Website forces principal and list revalidation.
- Render cards in one vertical column. Keep one primary destination plus at most one Website action per card.
- Show search plus at most one primary filter; move all remaining filters into one action sheet.

Primary files:

- new miniprogram/pages/competitions/index/*
- new miniprogram/components/competition-card/*
- miniprogram/services/tournament.service.ts during compatibility
- target miniprogram/services/competition.service.ts

### 10.2 Competition Home

Purpose: answer “这是什么赛事，现在处于什么状态，我下一步应该去哪里？”

Required sections:

1. Identity:
   - name;
   - kind;
   - organizer display;
   - participant count.
2. Source and rules:
   - official source where applicable;
   - roster behaviour;
   - format;
   - compact rules/tie-break summary.
3. Lifecycle:
   - draft/enrolling/preparing/active/paused/finished/archived;
   - setup state;
   - current stage;
   - coverage or preparation attention.
4. Viewer context:
   - organizer/participant role;
   - current position or matchup;
   - latest movement where proven.
5. Continue actions:
   - current result in Live;
   - finalized result/history;
   - participants;
   - Website Manage where authorized.

Rules:

- Home is useful outside a live gameweek.
- It does not embed the complete Live table, bracket, full participant roster, or season history.
- An archived object remains readable through authorized history links.
- A failed setup does not appear as an empty competition.
- Current Website paths remain compatibility destinations until target /competitions routes exist.
- Use a compact identity/status header followed by vertical sections. Do not display Live, History, Participants, and Manage as simultaneous panels.
- Keep at most two selector/control areas visible; downstream actions open pages rather than nested dialogs.

Primary files:

- new miniprogram/pages/competitions/detail/*
- new miniprogram/components/competition-identity/*
- new miniprogram/components/competition-status/*
- new miniprogram/components/competition-actions/*

### 10.3 Results and History

Purpose: answer “整个赛事在这个 GW 或阶段最终发生了什么？”

Required behavior:

1. Load a bounded history index.
2. Select latest finalized result by default.
3. Allow explicit historical event/stage selection.
4. Load only one detailed result at a time.
5. Render format-specific result bodies.
6. Highlight the viewer without changing shared ordering.
7. Show settled authority, preparation/final state, coverage, and source check time.
8. Keep current provisional result in Live; do not duplicate its polling.
9. Preserve direct event/stage links.
10. Offer a compact sanitized share action only when the server reports it safe.

Content may include:

- final standings, groups, matchups, or bracket;
- personal movement;
- leaders and averages;
- risers/fallers;
- captain, chip, bench, hit, and transfer context;
- source and Competition audit state;
- stage/season path.

The initial Mini Program may ship a smaller read-only subset than Website, but omitted content must have an explicit Website continuation rather than an invented or incomplete native calculation.

Mobile result rules:

- Use cards or short rows for points, groups, and matchups.
- A knockout page renders one round at a time; the complete desktop bracket remains a Website continuation.
- An unavoidable wide standings table freezes the entry identity, advertises horizontal scrolling, and repeats the viewer summary above the table.
- Event/stage plus round/group are the maximum two visible selectors.

Primary files:

- new miniprogram/pages/competitions/results/*
- new miniprogram/components/competition-result/*
- new miniprogram/components/competition-history/*
- reusable pure mapping extracted from miniprogram/pages/summary/tournament/tournament.ts

### 10.4 Participants

Purpose: answer “谁在这个赛事里，名单如何产生？”

Required behavior:

- paginated member list;
- bounded search;
- clear official-sync versus fixed-custom-roster explanation;
- membership state where appropriate;
- no account identifiers;
- no roster mutation controls.

Tracked official leagues show the safe synchronization boundary. Custom tournaments show that the roster is selected and becomes immutable after lock.

### 10.5 Invitation preview

Purpose: give a recipient enough trusted context to decide whether to continue to Website.

Required behavior:

- render only the sanitized projection;
- show inviter/organizer display, kind, format, rules, schedule, capacity, and invitation state;
- use one primary “到网页加入” action;
- preserve the invitation continuation through Website login/binding;
- never treat possession of an invitation reference as membership authorization;
- never store or log reusable invitation capability material.

Native join is explicitly outside this initial design.

## 11. Website handoff design

### 11.1 Canonical action-link contract

Website owns the target route registry and returns localized allowed destinations:

~~~text
CanonicalActionLink
  actionType:
    CREATE_COMPETITION
    VIEW_COMPETITION
    VIEW_LIVE
    VIEW_RESULTS
    MANAGE_COMPETITION
    JOIN_COMPETITION
  href
  locale
  requiresWebsiteAuth
  returnRefreshPolicy
~~~

Rules:

- Use Simplified Chinese destinations.
- Prefer target /zh-CN/competitions routes after they exist.
- During migration, Website maps them to current /zh-CN/tournament and /zh-CN/live/tournaments compatibility routes.
- Mini Program code does not scatter raw Website paths across pages.
- Competition ID is allowed where required; email, user ID, principal Entry ID, Mini bearer token, and signed principal envelope are not.
- Invitation capability material is allowed only inside its dedicated Website join URL and is never logged or reused as authentication.
- Website validates destination and next parameters against an allowlist.

### 11.2 Handoff UX

Add one reusable Website handoff surface:

1. Explain why the action continues on Website.
2. Show the destination and whether Website login may be required.
3. Open an approved WeChat web-view business domain where supported.
4. Provide a copy-link fallback if the domain or client cannot open embedded Website content.
5. On Mini Program resume, refresh principal, Competition list, and selected object according to returnRefreshPolicy.

The initial release does not silently exchange a Mini Program API token for a Website browser session. Website authentication and FPL-binding continuation preserve the canonical destination. Any future single-sign-on bridge requires a separate security design, one-time bounded credentials, destination allowlisting, replay protection, and explicit verification.

The web-view page is independent and full-screen. Native headers, sheets, and sticky actions cannot be assumed to remain above it. Website destinations therefore provide their own mobile navigation, safe-area spacing, single-column form flow, and return/deep-link behavior, and pass the same 320–430 CSS px width fixtures. Web height and scroll state are independent because web-view replaces the native page.

### 11.3 Website-only destinations

| Mini Program state/action | Website destination |
| --- | --- |
| No Competitions | My Competitions / Create |
| Track official league | Create → Track official league |
| Create custom format | Create → Custom tournament |
| Draft/enrolling | Competition Home or Manage |
| Setup failed | Manage recovery |
| Organizer settings | Manage |
| Invitation acceptance | Join |
| Rules/roster administration | Manage |
| Archive/delete | Manage |
| Unsupported full-format view | Competition Home/Results |

## 12. Shared Mini Program primitives

Create small repo-native components:

~~~text
miniprogram/components/competition-card/
miniprogram/components/competition-identity/
miniprogram/components/competition-status/
miniprogram/components/competition-actions/
miniprogram/components/settled-status/
miniprogram/components/website-handoff/

miniprogram/models/competition.ts
miniprogram/services/competition.service.ts
miniprogram/utils/competition-state.ts
miniprogram/utils/competition-result.ts
miniprogram/utils/canonical-action.ts
~~~

Responsibilities:

- competition-card: bounded list identity, state, role, viewer summary, and one primary action.
- competition-identity: kind, source, roster behaviour, format, and authority.
- competition-status: lifecycle and setup mapping without command inference.
- competition-actions: render server-supplied native and Website actions.
- settled-status: final/partial/preparing/unavailable metadata.
- website-handoff: approved URL validation, web-view/copy fallback, and return-refresh marker.
- competition-state: pure lifecycle/setup-to-presentation mapping.
- competition-result: pure discriminated result mapping and unknown-type handling.
- canonical-action: allowlisted action parsing; no session or business authority.

Do not add a general state-management framework for this work.

Package rule:

- Add zero runtime npm dependencies for the initial Competitions delivery.
- Reuse existing @vant/weapp and native picker, scroll-view, action-sheet, IntersectionObserver, pull-to-refresh, and onShareAppMessage APIs.
- Do not port Website Radix, charting, toast, virtual-list, rich-text, drag-and-drop, or bracket packages.
- Prefer bounded server reads, cursor pagination, incremental setData, and small repo-native format renderers.
- Any dependency exception requires separate approval and proof that native components cannot meet the scoped requirement.

## 13. Client state, cache, and failure rules

### 13.1 Context keys

Every private cached object is scoped by:

~~~text
principalRevision
+ season
+ surface
+ competitionId where applicable
+ eventId/stage where applicable
+ factsRevision
~~~

Rules:

- A principal transition invalidates private Competition list/detail/result caches.
- A season transition invalidates participant context and season-scoped objects.
- Competition A is never retained under Competition B.
- A local last-viewed Competition ID is only a navigation preference and is re-authorized before use.
- Search/filter state may remain device-local but never enters canonical URLs or shared payloads.
- Final history may use a longer cache only when factsRevision and settled metadata remain unchanged.
- Pull-to-refresh and Website return bypass list/detail caches.

### 13.2 Last-good behavior

- List refresh failure retains the authorized same-principal list and shows stale/offline status.
- Detail refresh failure retains only same-principal, same-season, same-Competition data.
- Result refresh failure retains only the same selected event/stage and facts revision.
- Invitation preview is not retained as a general last-good private object.
- A content failure never clears account or team binding.
- No previous data plus failure renders unavailable/retry, not an empty list.

### 13.3 Request control

- Use request IDs and context guards to reject stale responses after principal, season, Competition, filter, event, or stage change.
- Coalesce duplicate first-page and detail requests.
- Paginated reads maintain stable cursors and ignore responses for an old filter.
- Do not poll My Competitions or settled results.
- Competition Home may revalidate on foreground based on revision/TTL, but it is not a Live polling surface.
- Live polling remains inside the Live section controller.

## 14. Work packages

### MP-C1 — Contract fixtures and compatibility models

1. Add Mini Program types for CompetitionRef, identity, kind, lifecycle, setup, viewer role, capabilities, canonical links, and settled metadata.
2. Add shared golden fixtures for tracked official, custom points, preparing, failed, active, finished, archived, unauthorized, stale-season, partial, and unknown-format cases.
3. Add compatibility adapters for existing entryTournaments and Tournament summary fields.
4. Keep kind inference only inside the temporary adapter and mark ambiguous objects unsupported rather than guessing.

### MP-C2 — Principal access and section navigation

1. Consume the versioned principal state rather than raw global entryId checks.
2. Add the 赛事 bottom-navigation item.
3. Add the My Competitions route and compatibility navigation.
4. Support organizer-only authorized objects when participant binding is unavailable.
5. Remove any implication that every official FPL league belongs in Competitions.

### MP-C3 — My Competitions

1. Consume the bounded myCompetitions query.
2. Implement relevance ordering, search, kind/lifecycle/role filters, pagination, empty/error/offline states, and local continuation.
3. Render identity, lifecycle/setup, viewer context, and server actions.
4. Add Website Create and contextual Manage handoffs.
5. Refresh after Website return.

### MP-C4 — Competition Home and participants

1. Add the stable native Competition Home summary.
2. Add source, roster behaviour, rules, stage, coverage, and viewer context.
3. Add the paginated read-only participant page.
4. Connect Home to Live, Results, Website Manage, and invitation destinations.
5. Keep full Live and history payloads out of Home.

### MP-C5 — Results/History and current Summary rehome

1. Add bounded history and one selected finalized result.
2. Add official standings and custom points-table renderers first.
3. Add battle/knockout renderers only after upstream format capabilities pass.
4. Extract reusable pure mapping from the current Summary Tournament page.
5. Move personal-only extracts to the My FPL read model.
6. Retire Summary Tournament only after both target owners reach parity.

### MP-C6 — Live and Explore linking

1. Rename the user-facing Live label from 联赛 to 竞赛.
2. Replace generic Tournament identity with Competition identity.
3. Link current results from Competition Home into the selected Live object.
4. Link settled Live states to Competition Results.
5. Keep Competition cohort selection/transfer evidence in Explore with canonical Competition context.
6. Do not duplicate setup/rules/history panels after Competition Home parity.

### MP-C7 — Invitation preview and Website handoff

1. Add the sanitized invitation-preview page.
2. Add the reusable Website handoff component and approved-domain configuration.
3. Preserve Website login/binding/join continuation.
4. Add copy-link fallback and foreground refresh.
5. Verify that no Mini bearer token or private principal field enters URLs/logs.
6. Keep all join and management mutations Website-only.

### MP-C8 — Observability, release, and cleanup

1. Add sanitized list/detail/result/handoff telemetry.
2. Run contract, helper, page, DevTools, and real-device verification.
3. Release behind independent list, Home, Results, and invitation-preview feature switches.
4. Keep old routes and queries through the compatibility observation window.
5. Remove duplicate pages and old fields only in later dedicated cleanup changes.

## 15. Dependency and delivery order

~~~mermaid
flowchart TD
    A["Data: season, kind, source, owner, lifecycle"] --> B["GraphQL Competition contracts"]
    C["Website principal and route registry"] --> B
    B --> D["Website My Competitions + minimum Home"]
    B --> E["MP-C1 contracts"]

    E --> F["MP-C2 navigation/access"]
    D --> G["MP-C3 My Competitions"]
    F --> G

    D --> H["MP-C4 Competition Home"]
    B --> I["Website Results/History contracts"]
    I --> J["MP-C5 Results/History"]

    H --> K["MP-C6 Live/Explore linking"]
    J --> K

    L["Website invitations/join"] --> M["MP-C7 preview/handoff"]
    G --> N["MP-C8 verification/release"]
    H --> N
    J --> N
    K --> N
    M --> N
~~~

Required production order:

1. Freeze Competition, principal, settled, and canonical-link contract fixtures.
2. Deploy additive Data identity, season, kind, source, owner, lifecycle, and result changes.
3. Deploy bounded GraphQL reads, authorization, discriminated results, and compatibility adapters.
4. Deploy Website target routes, minimum Competition Home, canonical link registry, and command continuations.
5. Land Mini Program contract adapters and section shell.
6. Release My Competitions and Home.
7. Release Results/History after finalized format parity.
8. Link and simplify Live/Explore responsibilities.
9. Release invitation preview only after Website join and roster-lock semantics pass.
10. Remove legacy Summary/route/query code only after release-gate evidence.

Within each production slice the order is **Data → GraphQL → Website → Mini Program**.

Mini Program shells may be built against fixtures earlier, but they must not be publicly exposed against inferred or incomplete contracts.

## 16. Compatibility, migration, and rollback

### 16.1 GraphQL compatibility

- Add competition-named roots and fields without initially removing Tournament operations.
- Old entryTournaments remains readable through a compatibility adapter.
- New enum fields are nullable/additive during the consumer rollout.
- Unknown enums fail into typed unsupported UI rather than incorrect familiar UI.
- Every changed stored/cache shape receives a new season-safe version.
- Old Mini Program releases continue to read the old compatible fields through the declared window.

### 16.2 Mini Program routes

- Add pages/competitions routes before changing the bottom navigation.
- Keep live/tournament and summary/tournament physical routes during migration.
- Existing stored selected Tournament IDs may seed the new selection only after authorization and season validation.
- Do not delete the current Summary page in the same change that introduces Results.
- Old share/deep links route through an explicit compatibility resolver.

### 16.3 Responsibility release gates

| Gate | Required before |
| --- | --- |
| RG-COMPETITION-IDENTITY | Exposing the new My Competitions list |
| RG-PRINCIPAL | Showing stable owner and active-season participant unions |
| RG-COMPETITION-HOME | Removing setup/rules/roster context from Live |
| RG-COMPETITION-RESULTS | Removing shared reports from Summary/My Tournament |
| RG-FORMAT | Rendering or creating a battle/knockout format |
| RG-HANDOFF | Publishing Website Create/Manage/Join actions |
| RG-ROUTES | Removing old Mini Program or Website route paths |

### 16.4 Rollback

- New Mini Program navigation can be disabled while old Live/Summary pages remain usable.
- Home, Results, and invitation preview have independent feature switches.
- Additive Data migrations remain in place during application rollback.
- GraphQL compatibility adapters remain until every rollback target no longer needs them.
- A format renderer failure disables exposure without deleting stored history.
- Rollback never converts a tracked league into a snapshot, changes result authority, or deletes finalized Competition records.

## 17. Verification plan

### 17.1 Contract and unit tests

Cover:

- season-safe Competition and official-source identities;
- organizer and participant union/de-duplication;
- account-link, binding-required, stale-season, ready, and offline-cached principal states;
- lifecycle/setup presentation matrix;
- tracked official versus custom identity labels;
- server capability/action mapping;
- unknown kind/format/action handling;
- bounded list ordering, filters, cursors, and stale-response rejection;
- detail cache isolation by principal, season, and Competition;
- current Live handoff versus settled Results ownership;
- settled final, preparing, partial, unavailable, and empty states;
- official standings and custom points result mapping;
- battle/knockout feature gating;
- canonical Website URL allowlisting;
- Website return refresh;
- invitation preview redaction and no-token logging.

Repository checks:

~~~text
npm run typecheck
npm run lint
npm test
npm run package:check
git diff --check
~~~

Also verify every route registered in miniprogram/app.json resolves to a complete .ts, .wxml, .wxss, and .json page unit.

### 17.2 Integration scenarios

- No linked account.
- Linked account with no active-season FPL binding.
- Stale-season binding.
- Organizer not present as an active participant.
- Participant-only account.
- Account that is both organizer and participant.
- No prepared Competitions but several official My FPL leagues.
- One tracked official league.
- Multiple Competitions sharing one official source.
- One custom points tournament.
- Preparing, setup-failed, active, paused, finished, and archived objects.
- Unauthorized Competition deep link.
- Current Live result and latest finalized result.
- Partial/unavailable settled result with last-good retention.
- Unknown future format.
- Invitation valid, expired, revoked, full, wrong season, and binding-required.
- Website login/binding/manage/join continuation and Mini Program return refresh.

### 17.3 WeChat DevTools and real device

Verify:

- four-item bottom navigation, safe area, and active-state restoration;
- Chinese-only labels and no untranslated enum leakage;
- first-page scan speed with 0, 1, 20, and paginated Competition lists;
- slow network, offline launch, refresh failure, foreground recovery, and duplicate-tap coalescing;
- long Chinese names, large ranks, compact cards, horizontal result tables, and knockout round navigation;
- web-view approved-domain behavior and copy-link fallback;
- Website login requirement is explained before handoff;
- returning from Create/Manage/Join refreshes the correct principal and object;
- invitation references, tokens, private IDs, and payloads do not appear in logs or analytics;
- outdoor legibility and touch targets on representative iOS and Android WeChat clients;
- 320 × 568, 375 × 667, 390 × 844, and approximately 430 px-wide portrait canvases;
- no primary content is obscured by the native capsule, bottom navigation, or safe area;
- every core result stays within the documented three-transition hierarchy;
- no screen exceeds two primary selectors, four permanent tabs, or one non-nested action sheet;
- bracket rounds and wide tables remain usable without requiring a desktop-width canvas;
- web-view acts as an independent full-page mobile task with copy fallback and return refresh;
- package manifest and package lock remain unchanged by Competitions work.

## 18. Observability

Record sanitized fields:

~~~text
surface
contractVersion
season
principalState
competitionKind
viewerRole
lifecycle
setupState
resultType
settledState
factsRevisionChanged
listCountBucket
pageCountBucket
cacheOutcome
handoffActionType
handoffOpenMode
returnRefreshOutcome
reasonCode
durationBucket
~~~

Do not log:

- Mini Program bearer tokens;
- signed principal envelopes;
- invitation tokens/references;
- email, openid, unionid, user ID, manager/team names;
- full participant lists or result payloads;
- unredacted Competition names where not operationally required.

Competition IDs may be omitted or one-way bucketed for aggregate telemetry. Incident diagnostics require separately scoped and redacted logs.

Success indicators:

- My Competitions first-page success and latency;
- time from list open to relevant Competition destination;
- bounded list payload and no per-row full-result fan-out;
- Competition Home-to-Live and Home-to-Results continuation;
- percentage of transient failures preserving same-context last-good content;
- Website Create/Manage/Join handoff open and return-refresh success;
- unauthorized/stale-season denials without accidental unbind;
- legacy route/query use during migration;
- setup failure visibility and recovery completion on Website;
- matchday and finalized-result return rate by Competition kind.

## 19. Completion criteria

The Mini Program Competitions design is complete when:

1. 赛事 is a first-class bottom-navigation section that opens My Competitions.
2. My Competitions is a bounded private union of organizer-owned and active-entry participant objects.
3. All official FPL leagues remain My FPL Leagues; only prepared tracked/custom objects appear in Competitions.
4. Official source identity, Competition identity, organizer account identity, and participant Entry identity remain distinct and season-safe.
5. Every Competition displays explicit kind, roster behaviour, format, result authority, lifecycle, setup, and viewer role.
6. Competition Home remains useful before, during, and after a live gameweek without embedding full Live or history payloads.
7. Current results link to Live; finalized shared results and history use settled metadata and format-specific renderers.
8. Official standings, custom points, battle, and knockout are never collapsed into one generic table.
9. List, participants, and history reads are bounded, paginated, authorized, and free from per-row full-result fan-out.
10. Creation, setup, membership administration, management, archive, deletion, and initial join commands are absent from Mini Program.
11. Every Website-only action has a clear Chinese canonical handoff and safe return refresh.
12. No Mini bearer token, private principal field, or invitation capability material leaks into URLs, logs, analytics, or caches.
13. Existing Live Tournament, Summary Tournament, and Tournament GraphQL paths remain compatible until their replacement gates pass.
14. Content failures preserve eligible same-context data and never clear authoritative account/team binding.
15. The Mini Program exposes no AI Assistant, official FPL actions, or recommendation language.
16. Every Competitions page works across the 320–430 px portrait canvas range and respects native navigation plus bottom safe areas.
17. Core destinations remain within three page transitions, no screen exceeds two primary selectors or four tabs, and no flow depends on desktop-only interaction.
18. Website-only work uses a direct full-page mobile web-view handoff with explained login, copy fallback, and state revalidation after return.
19. Competitions delivery adds zero runtime packages.
20. Unit, contract, DevTools, real-device, handoff, compatibility, and season-rollover verification pass with recorded evidence.
