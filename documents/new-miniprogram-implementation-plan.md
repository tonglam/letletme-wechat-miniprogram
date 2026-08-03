# New Mini Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new LetLetMe WeChat Mini Program from the current TypeScript quickstart template into a production FPL companion app.

**Architecture:** Use native WeChat Mini Program structure, not React structure. Pages are route-level four-file units registered in `miniprogram/app.json`; components are four-file custom components registered through `usingComponents`; API access is centralized in `miniprogram/services` using `wx.request`.

**Tech Stack:** WeChat Mini Program TypeScript, WXML, WXSS, glass-easel component framework, `@vant/weapp`, `miniprogram-table-component`, existing `miniprogram-api-typings`.

---

## 1. Source Documents

Use these documents first:

- `documents/new-miniprogram-app-plan.md` - product scope and Mini Program compliance requirements.
- `documents/miniprogram-app-production-guideline.md` - project structure, page/component rules, API/state rules.
- `documents/guides/letletme-architecture.md` - old Mini Program feature and endpoint inventory.
- `documents/guides/mini-program-development-guideline.md` - exact Mini Program rules when unsure.

Do not read all raw WeChat docs by default. Use the larger `documents/guides/wechat-miniprogram-*.md` files only for exact API/component behavior.

## 2. Current Template Cleanup

The current codebase is still the official TypeScript quickstart template. Treat these as disposable sample code:

- `miniprogram/pages/index/index.*`
- `miniprogram/pages/logs/logs.*`
- demo avatar/nickname/login code in `miniprogram/pages/index/index.ts`
- demo logs storage in `miniprogram/app.ts`
- `miniprogram/utils/util.ts` if no production code uses it

Remove or replace them in Phase 1. The new first page should be `pages/home/index/index`, not `pages/index/index`.

## 3. Package Rules

Do not add new packages for the first implementation pass.

Use existing dependencies:

- `@vant/weapp` for popup, picker, tabs, field, button, dialog, toast, action sheet, grid, search, tag, divider, row/col.
- `miniprogram-table-component` only for table-heavy pages such as player screener if it works cleanly in the current toolchain.
- `miniprogram-api-typings` for TypeScript typings.

Avoid:

- React, Vue, Taro, uni-app, Vite, Webpack, Tailwind, Zustand, Redux, axios, dayjs/moment additions.
- Browser-only libraries that expect `window`, `document`, DOM nodes, or `fetch`.

## 4. Environment And Config Plan

Mini Programs do not use frontend `.env` files the same way a web app does. Use checked-in config files for non-secret constants, WeChat DevTools project config for app/project metadata, and `wx.getAccountInfoSync().miniProgram.envVersion` for runtime environment selection.

### 4.1 Files To Keep

- `project.config.json`
  - Keep `miniprogramRoot: "miniprogram/"`.
  - Keep TypeScript compiler plugin.
  - Keep `packNpmManually: true` and existing npm packaging settings unless DevTools requires adjustment.
  - Keep the real appid in local WeChat DevTools/private config only; tracked config must use the placeholder appid.

- `project.private.config.json`
  - Keep developer-local settings only.
  - Do not put shared app behavior or secrets here.

- `package.json`
  - Rename metadata from quickstart to LetLetMe when implementation starts.
  - Do not add dependencies unless a page cannot be built with native Mini Program/Vant/existing table package.

### 4.2 Files To Create

Create `miniprogram/config/env.ts`:

```ts
export type MiniProgramEnv = "develop" | "trial" | "release";

export const REQUEST_TIMEOUT_MS = 15000;

export const DEFAULT_SEASON = "";

export function getMiniProgramEnv(): MiniProgramEnv {
  return wx.getAccountInfoSync().miniProgram.envVersion;
}

export function getGraphQLEndpoint(): string {
  // develop -> local GraphQL, trial/release -> production proxy.
}
```

Rules:

- Do not store app secrets, WeChat access tokens, session keys, or backend credentials here.
- Production request domains must be on the WeChat Mini Program request-domain whitelist.
- `DEFAULT_SEASON` can stay empty if the current season comes from GraphQL `currentEventInfo`.
- Local dev should resolve from Mini Program `envVersion`, not a manually edited `APP_ENV`.
- Local GraphQL dev default is `http://127.0.0.1:4000/graphql`; DevTools storage key `letletme_graphql_endpoint_override` can override it without code changes.

Create `miniprogram/config/routes.ts`:

```ts
export const routes = {
  home: "/pages/home/index/index",
  entrySearch: "/pages/entry/search/search",
  entryProfile: "/pages/entry/profile/profile",
  liveIndex: "/pages/live/index/index",
  liveEntry: "/pages/live/entry/entry",
  liveMatch: "/pages/live/match/match",
  liveLeague: "/pages/live/league/league",
  dataIndex: "/pages/data/index/index",
  dataPlayers: "/pages/data/players/players",
  dataPlayerDetail: "/pages/data/player-detail/player-detail",
  dataTeams: "/pages/data/teams/teams",
  dataTeamDetail: "/pages/data/team-detail/team-detail",
  dataPrice: "/pages/data/price/price",
  summaryEntry: "/pages/summary/entry/entry",
  summaryLeague: "/pages/summary/league/league",
  summaryGameweek: "/pages/summary/gameweek/gameweek"
} as const;
```

Create `miniprogram/config/storage-keys.ts`:

```ts
export const storageKeys = {
  entryId: "entry",
  selectedLiveLeagueId: "live-tournamentId",
  selectedLiveLeagueName: "live-tournamentName",
  selectedKnockoutId: "live-knockoutId",
  selectedKnockoutName: "live-knockoutName",
  selectedStatLeagueId: "stat-select-id",
  selectedStatLeagueName: "stat-select-name",
  selectedSummaryLeague: "summary-league",
  lastPlayerCode: "stat-player",
  lastPlayerSeason: "stat-player-season",
  lastTeamId: "stat-team",
  lastTeamSeason: "stat-team-season"
} as const;
```

## 5. Final Project Structure

Target structure:

```text
miniprogram/
├── app.ts
├── app.json
├── app.wxss
├── config/
│   ├── env.ts
│   ├── routes.ts
│   └── storage-keys.ts
├── models/
│   ├── app.ts
│   ├── common.ts
│   ├── entry.ts
│   ├── fixture.ts
│   ├── live.ts
│   ├── player.ts
│   ├── summary.ts
│   ├── team.ts
│   └── tournament.ts
├── services/
│   ├── graphql.service.ts
│   ├── common.service.ts
│   ├── entry.service.ts
│   ├── fixture.service.ts
│   ├── live.service.ts
│   ├── player.service.ts
│   ├── price.service.ts
│   ├── summary.service.ts
│   ├── team.service.ts
│   └── tournament.service.ts
├── utils/
│   ├── date.ts
│   ├── fpl.ts
│   ├── navigation.ts
│   └── storage.ts
├── components/
│   ├── app-empty-state/
│   ├── app-error-state/
│   ├── app-loading/
│   ├── entry-card/
│   ├── filter-bar/
│   ├── fixture-chip/
│   ├── gw-picker/
│   ├── player-picker/
│   ├── player-row/
│   ├── season-picker/
│   ├── stat-table/
│   └── team-picker/
└── pages/
    ├── home/index/
    ├── entry/search/
    ├── entry/profile/
    ├── live/index/
    ├── live/entry/
    ├── live/match/
    ├── live/league/
    ├── data/index/
    ├── data/players/
    ├── data/player-detail/
    ├── data/teams/
    ├── data/team-detail/
    ├── data/price/
    ├── data/fixtures/
    ├── data/screener/
    ├── summary/entry/
    ├── summary/league/
    └── summary/gameweek/
```

Deferred structure, only after active need is confirmed:

```text
miniprogram/pages/live/knockout/
miniprogram/pages/tournament/champion-league/
miniprogram/pages/group/scout/
miniprogram/pages/group/tournament/
```

## 6. App Configuration

Replace current quickstart `miniprogram/app.json` with production pages.

Use native `tabBar` for stable top-level sections:

```json
{
  "pages": [
    "pages/home/index/index",
    "pages/live/index/index",
    "pages/data/index/index",
    "pages/entry/search/search",
    "pages/entry/profile/profile",
    "pages/live/entry/entry",
    "pages/live/match/match",
    "pages/live/league/league",
    "pages/data/players/players",
    "pages/data/player-detail/player-detail",
    "pages/data/teams/teams",
    "pages/data/team-detail/team-detail",
    "pages/data/price/price",
    "pages/data/fixtures/fixtures",
    "pages/data/screener/screener",
    "pages/summary/entry/entry",
    "pages/summary/league/league",
    "pages/summary/gameweek/gameweek"
  ],
  "window": {
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "LetLetMe",
    "navigationBarBackgroundColor": "#ffffff",
    "backgroundColor": "#f5f6f8",
    "backgroundTextStyle": "dark"
  },
  "tabBar": {
    "color": "#667085",
    "selectedColor": "#111827",
    "backgroundColor": "#ffffff",
    "borderStyle": "black",
    "list": [
      { "pagePath": "pages/home/index/index", "text": "首页" },
      { "pagePath": "pages/live/index/index", "text": "实时" },
      { "pagePath": "pages/data/index/index", "text": "数据" }
    ]
  },
  "style": "v2",
  "componentFramework": "glass-easel",
  "lazyCodeLoading": "requiredComponents",
  "sitemapLocation": "sitemap.json"
}
```

Notes:

- `wx.switchTab` can only navigate to the tab pages above and cannot pass query params.
- Child pages use `wx.navigateTo` with IDs in query params.
- If WeChat DevTools requires tab icons, add local static assets later; do not add a package for icons.
- Add `sitemap.json` in Phase 1 if missing.

## 7. App Lifecycle And Global State

Replace quickstart `app.ts` with production app state.

`miniprogram/app.ts` should:

- Define `globalData` shape.
- Load selected entry ID from storage.
- Load current event/deadline from `common.service`.
- Avoid demo logs and demo `wx.login`.
- Not call WeChat cloud functions unless a real feature needs them.

Recommended global data:

```ts
export interface AppGlobalData {
  season: string;
  gw: number;
  lastGw: number;
  nextGw: number;
  utcDeadline: string;
  deadline: string;
  entryId?: number;
}
```

Keep detailed entry profile data in pages or services unless multiple active pages need it at app startup.

## 8. Service Layer Plan

### 8.1 `services/graphql.service.ts`

Responsibility:

- Wrap `wx.request` against `getGraphQLEndpoint()`.
- Apply `REQUEST_TIMEOUT_MS`.
- Normalize GraphQL success/error responses.
- Support POST GraphQL queries.
- No app secrets.

Public functions:

- `graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T>`

### 8.2 Domain Services

Create these service modules:

| File | GraphQL operations |
| --- | --- |
| `common.service.ts` | `currentEventInfo`, `eventFixtures`, `miniProgramNotice`, `teams`, `entryLeagues` |
| `entry.service.ts` | `entry`, `entryLeagues`, `entryHistory`, `entryEventResult`, `entryTransferHistory` |
| `live.service.ts` | `calcLivePointsByEntry`, `liveMatches`, `tournamentLivePoints` |
| `player.service.ts` | `player`, `players`, `playerDetail` |
| `team.service.ts` | `team` |
| `fixture.service.ts` | `fixtures`, `eventFixtures` |
| `price.service.ts` | `playerValues`, `playerValueHistory` |
| `summary.service.ts` | `entryEventResult`, `entryHistory`, `entryTransferHistory`, `leagueStandings`, `leagueEventResults`, `eventOverallResult`, `eventLive`, `topTransfersIn`, `topTransfersOut` |
| `tournament.service.ts` | `entryTournaments` |

Do not scatter raw GraphQL strings in page files.

## 9. Utility Plan

Create:

- `utils/storage.ts`
  - `getEntryId()`
  - `setEntryId(entryId: number)`
  - `clearEntryScopedStorage()`
  - wrappers around `wx.getStorageSync`, `wx.setStorageSync`, `wx.removeStorageSync`

- `utils/navigation.ts`
  - `goToEntrySearch()`
  - `goToPlayerDetail(code: number | string, season?: string)`
  - `goToTeamDetail(teamId: number | string, season?: string)`
  - `goToLiveEntry(entryId?: number)`
  - `switchToHome()`, `switchToLive()`, `switchToData()`

- `utils/date.ts`
  - deadline formatting
  - date key formatting for price pages
  - simple countdown input formatting

- `utils/fpl.ts`
  - difficulty color mapping
  - chip name mapping
  - position names
  - price formatting such as `£8.6m`

## 10. Model Plan

Keep model files small and practical. Do not over-model every backend field before pages need it.

Create:

- `models/common.ts`
  - `CurrentEventDeadline`
  - `Notice`
  - `TeamOption`
  - `GameweekOption`

- `models/entry.ts`
  - `EntrySearchResult`
  - `EntryInfo`
  - `EntryHistory`
  - `EntryTransfer`
  - `EntryLeague`

- `models/live.ts`
  - `LiveEntryResult`
  - `LivePlayerRow`
  - `LiveMatch`
  - `LiveLeagueRow`

- `models/player.ts`
  - `PlayerOption`
  - `PlayerDetail`
  - `PlayerFilterRow`
  - `PlayerValueChange`

- `models/team.ts`
  - `TeamSummary`
  - `TeamFixture`
  - `TeamPlayer`

- `models/summary.ts`
  - `EntrySeasonSummary`
  - `LeagueSeasonSummary`
  - `GameweekOverallSummary`

- `models/tournament.ts`
  - `TournamentOption`
  - `KnockoutOption`
  - `ChampionLeagueOption`

## 11. Shared Component Plan

Every component must have `.ts`, `.wxml`, `.wxss`, `.json`; component JSON must contain `"component": true`.

### 11.1 `app-loading`

Purpose: reusable loading block.

Properties:

- `text: string`

Used by all remote-data pages.

### 11.2 `app-empty-state`

Purpose: standard empty state.

Properties:

- `title: string`
- `description: string`
- `actionText: string`

Events:

- `action`

### 11.3 `app-error-state`

Purpose: standard error display with retry.

Properties:

- `message: string`
- `retryText: string`

Events:

- `retry`

### 11.4 `entry-card`

Purpose: display selected FPL entry/team.

Properties:

- `entry: object`
- `compact: boolean`

Events:

- `change`
- `open`

### 11.5 `fixture-chip`

Purpose: display fixture opponent and difficulty.

Properties:

- `opponent: string`
- `difficulty: number`
- `homeAway: string`

Use `utils/fpl.ts` for difficulty class mapping.

### 11.6 `player-row`

Purpose: reusable row for player list/live lineup/price changes.

Properties:

- `player: object`
- `showTeam: boolean`
- `showPrice: boolean`
- `showPoints: boolean`

Events:

- `open`

### 11.7 `gw-picker`

Purpose: choose current/target gameweek.

Properties:

- `value: number`
- `min: number`
- `max: number`

Events:

- `change`

Use Vant popup/picker if available after npm build.

### 11.8 `season-picker`

Purpose: choose season without hardcoding old season list.

Properties:

- `value: string`
- `seasons: array`

Events:

- `change`

Initially derive available seasons from API responses or a small constant updated in one place.

### 11.9 `team-picker`

Purpose: choose team.

Properties:

- `value: string`
- `season: string`
- `teams: array`

Events:

- `change`

Page owns API call; component renders options.

### 11.10 `player-picker`

Purpose: search/select player by position/team/player.

Properties:

- `value: object`
- `players: array`
- `loading: boolean`

Events:

- `search`
- `change`

Avoid internal generic API calls unless the component becomes a feature-specific smart component.

### 11.11 `filter-bar`

Purpose: shared search/filter controls for league, player, and data pages.

Properties:

- `keyword: string`
- `placeholder: string`
- `filters: array`

Events:

- `search`
- `filterChange`
- `reset`

### 11.12 `stat-table`

Purpose: reusable table/list shell for dense data.

Properties:

- `columns: array`
- `rows: array`
- `loading: boolean`

Events:

- `rowTap`
- `sortChange`

Use `miniprogram-table-component` only if native WXML layout becomes too heavy.

## 12. Page Plan

Every page must include loading, empty, error, and retry where it loads remote data.

### 12.1 `pages/home/index`

Purpose:

- Default launch page.
- Shows current GW, deadline countdown, selected entry summary, next fixtures, notice, and shortcuts.

Services:

- `common.getCurrentEventAndDeadline`
- `common.getNextFixture`
- `common.getMiniProgramNotice`
- `entry.getEntryInfo` if `entryId` exists

Components:

- `entry-card`
- `fixture-chip`
- `app-loading`
- `app-error-state`
- `app-empty-state`

Navigation:

- no entry -> `entry/search`
- live shortcut -> `live/index` with `wx.switchTab`
- player/data shortcuts -> `data/index` with `wx.switchTab`

### 12.2 `pages/entry/search`

Purpose:

- First-run entry ID setup.
- Search by team/player name.
- Save selected entry ID.

Services:

- `entry.fuzzyQueryEntry`
- `entry.getEntryInfo`

Components:

- `filter-bar`
- `entry-card`
- Vant search/button/cell if useful

State:

- `keyword`
- `results`
- `manualEntryId`
- `loading`
- `error`

On save:

- call `setEntryId`
- clear entry-scoped storage
- navigate to `home` using `wx.switchTab` or `wx.reLaunch` depending stack state

### 12.3 `pages/entry/profile`

Purpose:

- Display selected entry profile, leagues, history, and transfers.

Services:

- `entry.getEntryInfo`
- `entry.getEntryLeagueInfo`
- `entry.getEntryHistoryInfo`
- `entry.getEntryAllTransfers`

Components:

- `entry-card`
- `stat-table`
- `app-loading`
- `app-error-state`

### 12.4 `pages/live/index`

Purpose:

- Tab landing page for live workflows.
- Shows selected entry live summary and links to live team, match, and league pages.

Services:

- `entry.getEntryInfo`
- GraphQL refetch only on explicit refresh

Navigation:

- `live/entry`
- `live/match`
- `live/league`

### 12.5 `pages/live/entry`

Purpose:

- Live points for selected entry: lineup, bench, captain, chips, transfers.

Services:

- `live.getLivePointsByEntry`
- `entry.getEntryEventTransfers`

Components:

- `player-row`
- `gw-picker`
- `fixture-chip`
- `app-loading`
- `app-error-state`

Important:

- Pull-down refresh should call live cache refresh, then reload page data.
- Batch lineup updates in one `setData`.

### 12.6 `pages/live/match`

Purpose:

- Match list by status: playing, finished, upcoming.
- Show event details needed to explain live scoring.

Services:

- `live.getLiveMatchByStatus`

Components:

- `fixture-chip`
- `filter-bar`
- `app-loading`
- `app-empty-state`

### 12.7 `pages/live/league`

Purpose:

- Live league/tournament standings.
- Search/filter rows and support Royale mode if data supports it.

Services:

- `tournament.getEntryPointsRaceTournament`
- `live.getLivePointsByTournament`
- `live.searchLivePointsByTournament`

Components:

- `filter-bar`
- `stat-table`
- `gw-picker`
- `app-loading`
- `app-error-state`

State:

- selected tournament ID/name from storage
- displayed rows
- full rows kept outside rendered `data` only if needed for pagination/search

### 12.8 `pages/data/index`

Purpose:

- Tab landing page for data workflows.
- Cards/links to players, teams, price changes, fixtures, screener.

Services:

- none required for first render, optional current event context

Components:

- native `view` cards or Vant grid

### 12.9 `pages/data/players`

Purpose:

- Player search/list entry point.

Services:

- `player.getPlayersByElementType`
- `common.getTeamList`

Components:

- `player-picker`
- `player-row`
- `filter-bar`

Navigation:

- row tap -> `data/player-detail?code=...&season=...`

### 12.10 `pages/data/player-detail`

Purpose:

- Player season summary, fixture list, and historical data.

Services:

- `player.getPlayerInfoByCode`
- `player.getPlayerSummary`

Components:

- `fixture-chip`
- `stat-table`
- `season-picker`
- `app-loading`

### 12.11 `pages/data/teams`

Purpose:

- Team list and navigation into team detail.

Services:

- `common.getTeamList`

Components:

- `team-picker`
- `filter-bar`

### 12.12 `pages/data/team-detail`

Purpose:

- Team summary, roster, fixtures, set-piece information.

Services:

- `team.getTeamSummary`

Components:

- `fixture-chip`
- `player-row`
- `stat-table`
- `season-picker`

### 12.13 `pages/data/price`

Purpose:

- Daily rises/fallers and player price history.

Services:

- `price.getPlayerValueByDate`
- `price.getPlayerValueByElement`

Components:

- `player-row`
- `player-picker`
- `filter-bar`
- Vant datetime-picker if useful

### 12.14 `pages/data/fixtures`

Purpose:

- Season fixture grid with difficulty coloring.

Services:

- `fixture.getSeasonFixture`

Components:

- `fixture-chip`
- `season-picker`
- `team-picker`

### 12.15 `pages/data/screener`

Purpose:

- Advanced player filter/screener.

Services:

- `player.getFilterPlayers`
- `common.getTeamList`

Components:

- `filter-bar`
- `stat-table`
- `player-row`
- `season-picker`
- `team-picker`

Important:

- Use pagination/incremental rendering.
- Do not call `setData` for every row.
- Keep filter source data outside rendered `data` only if needed.

### 12.16 `pages/summary/entry`

Purpose:

- Entry season overview, captain stats, transfer stats, score distribution.

Services:

- `summary.getEntryTeamStatsHistory`
- `summary.getEntryTeamStatsEventResult`
- `summary.getEntryTeamStatsTransfers`

Components:

- `entry-card`
- `stat-table`
- `season-picker`

### 12.17 `pages/summary/league`

Purpose:

- League season averages, rankings, captain stats, score distribution.

Services:

- `common.getAllLeagueName`
- `summary.getLeagueSeasonInfo`
- `summary.getLeagueSeasonSummary`
- `summary.getLeagueSeasonCaptain`
- `summary.getLeagueSeasonScore`

Components:

- `filter-bar`
- `stat-table`
- `season-picker`

### 12.18 `pages/summary/gameweek`

Purpose:

- GW overall summary, dream team, elite players, transfer trends.

Services:

- `summary.getGameweekOverallSummary`
- `summary.getEventDreamTeam`
- `summary.getEventEliteElements`
- `summary.getEventOverallTransfers`

Components:

- `gw-picker`
- `player-row`
- `stat-table`


## 13. Deferred Pages

Do not implement in the first build unless confirmed active:

- `pages/live/knockout`
- `pages/tournament/champion-league`
- `pages/group/scout`
- `pages/group/tournament`
- customer-service cloud function UI

When added, they must follow the same four-file page and service-layer rules.

## 14. Styling Plan

Use `miniprogram/app.wxss` for shared base styles:

- page background
- text color classes
- spacing utilities
- card shell classes
- row/list classes
- difficulty color classes
- safe-area bottom padding helpers

Use page/component WXSS for local layout only.

Rules:

- Use `rpx`.
- Keep selectors flat.
- Do not assume CSS variables.
- Do not assume Tailwind classes.
- Avoid one-off deeply nested page styles.

## 15. Testing And Verification Plan

Use WeChat DevTools as the primary verification environment.

For each implementation phase:

- Open project in WeChat DevTools.
- Run TypeScript compilation through DevTools.
- Build npm in DevTools after using Vant/table components.
- Verify `app.json` page paths resolve.
- Verify tab pages open with `wx.switchTab`.
- Verify child pages open with `wx.navigateTo`.
- Verify the request-domain allowlist contains `https://www.letletme.top`.
- Verify loading/empty/error states by temporarily using invalid entry IDs or disconnected network.
- Test high-risk live/data pages on a real device when possible.

If adding scripts later, keep them minimal and avoid adding a build framework.

## 16. Implementation Todo List

The implementation checklist is maintained separately:

`documents/new-miniprogram-implementation-todo.md`
