# LetLetMe WeChat Mini Program — Code Review Report

**Date:** 2026-08-16
**Branch:** feat/miniprogram-ui-optimization
**Scope:** Full repo (178 TS files across miniprogram/, tests/, test/, scripts/)

---

## Executive Summary

This is a well-architected native WeChat Mini Program for Fantasy Premier League data, with a sophisticated GraphQL data layer, intelligent caching, and careful lifecycle management. The codebase demonstrates strong engineering discipline — particularly in auth flow correctness, cache invalidation, and stale-while-revalidate patterns.

However, the repo has accumulated **significant over-engineering** in the telemetry/mock/PR-test stack, **dangerous mock-mode leakage into production config**, and a **growing complexity problem** in page lifecycle code that makes maintenance increasingly risky.

---

## 1. Architecture Overview

### 1.1 Technology Stack
- **Runtime:** Native WeChat Mini Program (WXML + WXSS + TypeScript)
- **UI Components:** Vant Weapp (icon + action-sheet only, pruned via script)
- **Data Layer:** GraphQL over `wx.request` with hashed Bearer tokens
- **Auth:** WeChat login → web-issued 30-day session token, encrypted storage
- **Build:** WeChat DevTools compiler plugin for TypeScript, ESLint + `tsc --noEmit`
- **Testing:** Node.js native test runner (`node:test`) + tsx for TS tests; `.mjs` for source-assertion tests

### 1.2 Directory Structure
```
miniprogram/
  config/       4 files  — env, routes, storage keys, mock toggle
  models/      11 files  — TypeScript interfaces (no runtime code)
  services/    20 files  — GraphQL transport, auth, cache, domain services
  utils/       23 files  — formatting, storage, live-refresh, perf, navigation
  components/  19 dirs   — reusable WXML components
  pages/       24 pages  — grouped by feature area (home, live, data, etc.)
  mocks/       24 files  — mock data payloads for UI validation
test/          72 files  — .mjs source-assertion tests + functional tests
tests/         21 files  — .ts unit tests for utils/services
documents/     16 files  — design docs, implementation plans, production guides
docs/           7 files  — architecture diagnostics
scripts/        2 files  — style-drift checker, Vant pruner
```

### 1.3 Data Flow
```
Page.onLoad → ensureAppContext() → graphqlRead()
  ↓
graphqlRead: check memory cache → check storage cache → check in-flight dedup
  → if stale-while-revalidate: serve stale + fire network
  → if offline: serve stale if available, else throw
  → makeRequest(wx.request) → 401? → refreshWechatApiSession() → retry
  → write cache (memory + storage) → return
```

### 1.4 Auth Lifecycle
```
App.onLaunch
  → installPrivacyAuthorizationHandler()
  → requirePrivacyAuthorize → doLogin()
    → restoreApiSessionCredentials() (encrypted storage)
    → if valid token exists: revalidateSessionProfile() (24h throttle)
    → else: refreshWechatApiSession()
      → wx.login → /wechat/login → storeApiSession()
        → encrypted token persist + entry binding + context sync
```

---

## 2. Findings

### P0 — Critical (must fix before release)

#### 2.1 `MOCK_ENABLED = true` in production config
**File:** `miniprogram/config/mock-mode.ts:6`
```typescript
export const MOCK_ENABLED = true;
```
This constant is imported and checked in **20+ page files**. When `true`, every page short-circuits its data loading and renders mock data instead of real backend calls. If this ships to production, **every user sees fake data**.

The file has a comment saying "Set to false (or delete this file + mocks/) to restore normal operation", but there is no build-time guard, no environment check, and no CI gate that prevents `MOCK_ENABLED = true` from reaching a release build.

**Recommendation:** Replace with a build-time/compile-time check (`process.env.NODE_ENV !== 'production'` or use `wx.getAccountInfoSync().miniProgram.envVersion`), or add a CI lint rule that rejects `MOCK_ENABLED = true` on release builds.

#### 2.2 Home page countdown timer can fire after unload
**File:** `miniprogram/pages/home/index/index.ts:698`
```typescript
startCountdown() {
    this.stopCountdown();
    if (!this._pageVisible) return;
    if (this.updateCountdown()) return;
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000) as unknown as number;
},
```
`updateCountdown()` calls `refreshHome(true)` when deadline expires (line 723), which triggers a full page reload. If `startCountdown()` is called during `onShow` and the page is then hidden/unloaded before the timer fires, the timer reference is cleared by `onHide`/`onUnload`, but `scheduleDeadlineRetry()` uses `setTimeout` (line 710) which is NOT cancelled by `stopCountdown()` — only `clearInterval` is called. If the user navigates away during the 60-second retry delay, the delayed `refreshHome(true)` will fire on a destroyed page.

**File:** `miniprogram/pages/home/index/index.ts:708-714`
```typescript
scheduleDeadlineRetry() {
    this.stopCountdown();
    this.countdownTimer = setTimeout(() => {  // ← reuse of countdownTimer for setTimeout
      this.countdownTimer = undefined;
      if (!this._pageVisible) return;
      void this.refreshHome(true);
    }, HOME_DEADLINE_RETRY_MS) as unknown as number;
},
```
`stopCountdown()` calls `clearInterval(this.countdownTimer)` but the timer here is a `setTimeout`, not `setInterval`. `clearInterval` does NOT clear `setTimeout` timers in all WeChat runtime versions. This is a **potential memory leak and stale page operation**.

**Recommendation:** Use a separate `_deadlineRetryTimer` field and clear it in `onUnload` and `onHide`.

#### 2.3 GraphQL cache key includes token hash — session rotation invalidates entire cache
**File:** `miniprogram/services/graphql.service.ts:258-259`
```typescript
const audience = token ? `session:${hashKey(token)}` : "public";
```
Every session-scoped GraphQL request hashes the bearer token into the cache key. When the token rotates (every login / 401 recovery), the cache key changes, meaning **all session-scoped cached data becomes orphaned** — it's still in storage but will never be hit because the key no longer matches.

The code in `auth.service.ts:201-203` explicitly clears session cache on token change:
```typescript
if (previousToken !== session.token) {
    clearStoredGraphQLSessionCache();
}
```
But this means every login/401 forces a full re-fetch of all session data (entry info, leagues, history, etc.), even when the data hasn't changed. For a 30-day token that rotates on each app launch, this is a significant cold-start penalty.

**Recommendation:** Use a stable session identifier (e.g., `entryId` or a persistent session UUID) instead of the rotating token hash for cache key audience scoping.

#### 2.4 `live.service.ts` has mixed indentation (tabs + spaces)
**File:** `miniprogram/services/live.service.ts:246-257`
```typescript
		nextFixtures {
			fixtureId
			eventId
```
The `nextFixtures` block uses tab indentation while the rest of the file uses spaces. This suggests a copy-paste from a different source and could cause parsing issues with strict linting.

---

### P1 — Significant Design Issues

#### 2.5 Duplicate GraphQL query definitions across services
The same GraphQL operations are defined in multiple service files with slightly different field selections:

| Query | File 1 | File 2 | Difference |
|-------|--------|--------|------------|
| `EntryHistory` | `entry.service.ts:46` | `summary.service.ts:119` | summary adds `eventTransfers`, `eventCost`, `eventNetPoints`, `eventBenchPoints` |
| `EntryEventResult` | `entry.service.ts:64` | `summary.service.ts:78` | summary adds `eventBenchPoints`, `eventChip`, `eventCaptainPoints`, `eventPicks`, `entry` |
| `EntryTransferHistory` | `entry.service.ts:182` (as `GetEntryTransferHistory`) | `summary.service.ts:143` (as `EntryTransferHistory`) | Different field sets |

This creates a maintenance hazard: when the backend schema changes, two places must be updated. It also means the same logical entity (`EntryEventResult`) has different TypeScript interfaces in different services (`entry.service.ts:104` vs `summary.service.ts:219`).

**Recommendation:** Consolidate into a single query per operation with the superset of fields, shared via a common query document or a single service file.

#### 2.6 Page lifecycle complexity is excessive
The home page (`pages/home/index/index.ts`) is **1059 lines** with 15+ state flags:
```typescript
_pageVisible, _initialLoadDone, _lastLoadAt, _loadRequestId,
_fixtureGwRequestId, _loadedContextRevision, _perfTracker,
_secondaryPending, _resumeSecondaryOnShow, _startupPending,
_resumeStartupOnShow, _refreshPending, _resumeRefreshOnShow,
_activeRefreshDeadlineTriggered, _resumeRefreshDeadlineTriggered,
_refreshRequestId, _hasShown, _lifecycleRevision
```

The live entry page (`pages/live/entry/entry.ts`) is **1033 lines** with a similar pattern. Each page hand-rolls:
- Visibility tracking (`pageVisible`, `hasShown`)
- Request deduplication (`liveRequest`, `liveRequestKey`, `liveForcedFollowup`)
- Resume-after-show logic (`resumeLiveAfterShow`, `resumeStartupAfterShow`, `resumeForcedRefreshAfterShow`)
- Stale-response guards (`requestId !== this.liveRequestId`)

This pattern is repeated across every live page (entry, match, tournament) with slight variations. The `LiveRefreshController` abstraction exists but only covers the polling timer — the surrounding lifecycle plumbing is still copy-pasted.

**Recommendation:** Extract a `PageLifecycle` mixin or higher-order function that owns visibility tracking, request identity, and resume-after-show, reducing each page to its domain logic only.

#### 2.7 `EntryInfo` model has redundant alias fields
**File:** `miniprogram/models/entry.ts:9-21`
```typescript
export interface EntryInfo {
  entry?: number;
  entryId?: number;      // ← alias of entry
  playerName?: string;
  entryName?: string;
  teamName?: string;     // ← alias of entryName
  ...
}
```
And in `entry.service.ts:113-114`:
```typescript
entry: entry.id,
entryId: entry.id,
entryName: entry.entryName,
teamName: entry.entryName,
```
Every field is optional, every alias is populated, and consumers must guess which to use. This is a classic "adapter layer that never converged" — the model should have one canonical shape.

#### 2.8 `getEntryEventResult` returns `unknown`
**File:** `miniprogram/services/entry.service.ts:104-106,229`
```typescript
interface EntryEventResultResponse {
  entryEventResult: unknown;  // ← untyped
}

export async function getEntryEventResult(entry: number, event: number): Promise<unknown> {
```
This forces every consumer to cast the result (`my-fpl.service.ts:136` casts to `EntryEventResultPayload`). The summary service has a fully typed version of the same query — the entry service should use it.

#### 2.9 `performance-page.ts` and `PagePerformanceTracker` are tightly coupled but separate files
`utils/performance-page.ts` defines `PagePerformanceTracker` (155 lines). `utils/perf.ts` defines the storage layer (335 lines). `utils/performance-summary.ts` and `utils/performance-page.ts` are imported by different subsets of pages. The split adds cognitive overhead without clear module boundaries — `perf.ts` already imports from `page-performance.ts` indirectly via `recordPagePerformance`.

**Recommendation:** Consider consolidating `perf.ts` and `page-performance.ts` into a single module, or at minimum document the dependency direction.

#### 2.10 `currentEntryId()` pattern is duplicated in 3+ places
The pattern of "read from globalData, fall back to storage" appears in:
- `utils/follow.ts:27-38` (`currentFollowEntryId`)
- `services/common.service.ts:130-138` (`getCurrentEntryId`)
- `services/my-fpl.service.ts:101-109` (inline)
- `services/summary.service.ts` (via `getAppContextSnapshot`)

Each has slightly different error handling. This should be a single utility.

#### 2.11 `request.ts` is a dead compatibility stub
**File:** `miniprogram/services/request.ts:1-3`
```typescript
// Compatibility module for WeChat DevTools stale TypeScript compile graphs.
// Runtime data access is handled by graphql.service.ts.
export {};
```
This file exists solely to satisfy a stale DevTools compile graph. It should be removed once the compile issue is resolved, or documented as a permanent shim with a tracking issue.

---

### P2 — Style, Duplication, and Minor Issues

#### 2.12 PR-specific regression tests dominate the test suite
**72 `.mjs` test files** in `test/`, of which **42 are `pr19-review-round*.test.mjs`** and **4 are `pr-review-*.test.mjs`**. These are source-assertion tests that `readFileSync` TypeScript source and assert on code structure (e.g., "route season satisfies the season-scoped Team cache guard"). They are:
- Fragile (break on any refactor)
- Non-descriptive names (`pr19-review-round35`)
- Not testing runtime behavior

The remaining ~26 functional tests in `test/` and 21 `.ts` tests in `tests/` are genuine unit tests.

**Recommendation:** Replace PR-round source-assertion tests with behavioral unit tests. Keep them only for critical invariants that cannot be tested otherwise.

#### 2.13 Mock data files are large and numerous
24 mock files in `miniprogram/mocks/` plus `index.ts`. Combined with `MOCK_ENABLED = true`, they add significant weight to the upload package. The `ignoreUploadUnusedFiles: true` setting in `project.config.json` may or may not catch these — they are imported by pages, so they ARE "used" at compile time.

**Recommendation:** Gate mock imports behind a compile-time flag or move mocks to a separate build target.

#### 2.14 Documents directory is bloated
16 design documents in `documents/` including high-level designs, low-level implementation plans, production guidelines, and a polish todo. Many reference deleted components (`competition-card`, `my-fpl-phase-card`). The `docs/architecture/` directory has 7 additional diagnostic files including HTML reports.

**Recommendation:** Archive completed implementation plans. Remove references to deleted components. Consider moving diagnostics to a separate repo or `.gitignore`-ing generated HTML.

#### 2.15 `LivePlayerRow` model has too many optional fields
**File:** `miniprogram/models/live.ts:43-78` — 30+ optional fields, many of which are display-layer concerns (`statusText`, `roleText`, `pointsText`, `metaText`, `statusClass`). The model conflates data contract and presentation — display strings should be computed in the component, not stored in the model.

#### 2.16 `perf.ts` flushes to storage on every single API call
**File:** `miniprogram/utils/perf.ts:202`
```typescript
flush();  // called after every recordApi, recordPagePerformance, etc.
```
`flush()` calls `wx.setStorage()` synchronously on every API response. During a live match with 30-second polling across multiple pages, this means multiple synchronous storage writes per minute. This is unnecessary — batch flushes on a timer or on page hide.

#### 2.17 `evidence-state.ts` and `evidence-source` component are unused by pages
No page imports `evidence-state.ts` or references the `evidence-source` component. The models (`models/evidence.ts`) define `EvidenceClass`, `EvidenceTruth`, `EvidenceLabel` but no runtime code consumes them. This appears to be speculative infrastructure for a future feature.

#### 2.18 Inconsistent error message language
Error messages are in Chinese throughout (good for the target audience), but some TypeScript error constructors use English:
- `auth-session.ts:13`: `"Link this Mini Program to your LetLetMe account by email first"`
- `graphql.service.ts:284`: English error for season-scoped policy

These English messages would leak to the user if not caught by a higher-level handler.

#### 2.19 `season-picker` and `team-picker` components exist but may be unused
No page file directly references these components by import path. They may be used via `usingComponents` in page JSON files — verify before removing.

#### 2.20 `getTeamFixtureByShortName` returns empty array
**File:** `miniprogram/services/player.service.ts:335-337`
```typescript
export function getTeamFixtureByShortName(_shortName: string, _season?: string): Promise<unknown[]> {
  return Promise.resolve([]);
}
```
Stub function with underscore-prefixed params. Either implement or remove.

#### 2.21 `refreshPlayerStat` and `getFilterPlayers` are thin wrappers
**File:** `miniprogram/services/player.service.ts:339-346`
```typescript
export async function getFilterPlayers(_season: string): Promise<PlayerFilterRow[]> {
  const page = await getPlayersForPickerPage({ limit: 50 });
  return page.items.map((player) => ({ ...player }));
}

export function refreshPlayerStat(season: string): Promise<unknown> {
  return getFilterPlayers(season);
}
```
`refreshPlayerStat` just calls `getFilterPlayers`. `getFilterPlayers` fetches 50 players with no filter — this is not "filter players". These add API surface without value.

---

## 3. Best Practices Assessment

| Practice | Status | Notes |
|----------|--------|-------|
| TypeScript strict mode | ✅ Full | `strict: true`, `strictNullChecks`, `noImplicitAny`, `noUnusedLocals` |
| ESLint | ✅ Good | `no-console: warn`, `no-explicit-any: warn` |
| Design token system | ✅ Good | `app.wxss` defines color tokens; `check-style-drift.mjs` enforces |
| Encrypted session storage | ✅ Good | `setStorage.object.encrypt` with legacy migration |
| Single-flight auth refresh | ✅ Good | `pendingRefresh` dedup in auth.service.ts |
| GraphQL request dedup | ✅ Good | `inFlightRequests` map in graphql.service.ts |
| Stale-while-revalidate | ✅ Good | Two-tier cache (fresh/stale) with offline fallback |
| Offline awareness | ✅ Good | `network-status.ts` + `live-network.ts` + controller integration |
| Privacy compliance | ✅ Good | `requirePrivacyAuthorize` + custom dialog |
| CI pipeline | ✅ Good | typecheck + lint + test + package:check |
| Vant pruning | ✅ Good | `prune-vant.mjs` keeps only used components |
| Mock isolation | ❌ Broken | `MOCK_ENABLED = true` in source, no build guard |
| Page complexity | ⚠️ Concerning | 1000+ line pages with 15+ state flags |
| Test quality | ⚠️ Mixed | 42/72 tests are fragile source assertions |
| Model cleanliness | ⚠️ Mixed | Redundant aliases, untyped returns, display-layer fields in models |

---

## 4. Over-Engineering Assessment

| Area | Verdict | Evidence |
|------|---------|----------|
| GraphQL cache system | **Proportionate** | Two-tier cache with LRU, storage persistence, and operation-level policy is justified for a live-sports app |
| Auth system | **Proportionate** | Single-flight refresh, epoch tracking, encrypted storage — all necessary for WeChat Mini Program security model |
| Live refresh controller | **Proportionate** | Timer + probe + reload + offline awareness is the right abstraction for 30-second live polling |
| Performance telemetry | **Over-engineered** | 4 files (perf.ts, page-performance.ts, performance-page.ts, performance-summary.ts) + 8 record types for telemetry that is never exported or sent anywhere — it just accumulates in local storage |
| Evidence system | **Speculative** | `evidence-state.ts`, `evidence-source` component, `models/evidence.ts` — no page uses them |
| PR regression tests | **Over-engineered** | 42 source-assertion tests that read TypeScript files and assert on code structure |
| Documents | **Bloated** | 16 design docs + 7 diagnostics for a 178-file app |
| Mock system | **Over-engineered** | 24 mock files with full payloads, gated by a single boolean constant |

---

## 5. Redundancy Assessment

| Redundancy | Files Affected | Impact |
|------------|----------------|--------|
| Duplicate GraphQL queries | entry.service.ts vs summary.service.ts | 3 queries duplicated with different field sets |
| `currentEntryId` pattern | follow.ts, common.service.ts, my-fpl.service.ts, summary.service.ts | 4 implementations of the same read-from-globalData-then-storage pattern |
| `EntryInfo` alias fields | models/entry.ts, entry.service.ts | `entry`/`entryId`, `entryName`/`teamName` |
| `LivePlayerRow` display fields | models/live.ts | `statusText`, `roleText`, `pointsText`, `metaText`, `statusClass` belong in components |
| Performance recording | perf.ts (335 lines) | 8 nearly-identical `record*` functions with copy-pasted array management |

---

## 6. Summary of Recommendations

### Immediate (before next release)
1. **Fix `MOCK_ENABLED = true`** — add a build guard or environment check
2. **Fix countdown timer leak** — separate `setTimeout` from `clearInterval` in home page
3. **Fix tab/space inconsistency** in `live.service.ts`

### Short-term (next sprint)
4. Consolidate duplicate GraphQL queries
5. Type `getEntryEventResult` return value properly
6. Extract `currentEntryId()` into a single shared utility
7. Remove `request.ts` dead stub or document it
8. Clean up English error messages in user-facing paths

### Medium-term (next quarter)
9. Extract page lifecycle boilerplate into a shared abstraction
10. Slim down performance telemetry — batch flushes, remove unused record types
11. Replace PR-round source-assertion tests with behavioral tests
12. Remove or implement evidence system, `getTeamFixtureByShortName`, and other stubs
13. Archive completed design documents

---

## 7. Architecture Strengths

Despite the issues above, this codebase has several notable strengths:

- **Cache architecture is genuinely excellent.** The two-tier memory+storage cache with operation-level policy, stale-while-revalidate, offline fallback, and LRU eviction is production-grade.
- **Auth flow is carefully reasoned.** The epoch tracking, single-flight refresh, and 401 recovery chain handle real race conditions that most mini programs ignore.
- **TypeScript discipline is strong.** Strict mode, no implicit any, no unused locals — this catches bugs at compile time.
- **Design token system with enforcement.** The `check-style-drift.mjs` script prevents CSS token drift, which is rare in mini program projects.
- **Vant pruning script.** Shipping only the transitive closure of used Vant components saves ~1.6 MB per upload.
