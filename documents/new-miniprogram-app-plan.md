# New Mini Program Web Parity Plan

> Purpose: define what the new LetLetMe Mini Program should cover.
> Inputs: `letletme-architecture.md` for old Mini Program feature coverage, and `wmp-vs-modern-web-dev.md` for translating modern web app expectations into Mini Program implementation patterns.

## 1. Working Assumption

There is no dedicated web product feature inventory in this repo. This plan uses:

- `letletme-architecture.md` as the old Mini Program feature map.
- `wmp-vs-modern-web-dev.md` as the guide for building Mini Program pages with web-app-level structure, maintainability, and UX expectations.

If a separate LetLetMe web feature document is added later, this plan should be updated against that file.

## 2. Mini Program Compliance Review

This is a Mini Program plan, not a React app plan.

The plan must follow these Mini Program requirements from `mini-program-development-guideline.md` and `wechat-miniprogram-technical-summary.md`:

- Every route page must be registered in `miniprogram/app.json` under `pages` or under a `subpackages` entry.
- Every page is a four-file unit: `.ts`, `.wxml`, `.wxss`, `.json`.
- Page logic uses `Page({ data, lifecycle, methods })`, not React components, hooks, JSX, or browser routes.
- Every custom component is a four-file unit and its JSON must include `"component": true`.
- Components are consumed through `usingComponents` in page/component JSON or registered globally in `app.json`.
- WXML uses Mini Program components such as `view`, `text`, `image`, `scroll-view`, `swiper`, `navigator`; it is not HTML.
- WXSS uses Mini Program styling rules. Prefer `rpx`; do not assume CSS variables, DOM selectors, or Tailwind utilities exist.
- State rendered by the view must update through batched `setData`; do not call `setData` inside tight loops.
- Network calls must use `wx.request` behind a request helper. Request domains must be whitelisted in the WeChat admin console.
- Do not use browser-only APIs such as `window`, `document`, `localStorage`, DOM refs, `fetch`, or DOM-dependent npm packages.
- `wx.switchTab` can only open pages listed in `tabBar.list` and cannot carry query parameters.
- App secrets, WeChat access tokens, and `api.weixin.qq.com` calls belong on the backend, not in the Mini Program client.

When this document says "web parity", it means product coverage and user experience coverage. It does not mean React implementation, browser APIs, web routing, or web CSS.

## 3. Goal

The new Mini Program should cover as much of the web/user-facing LetLetMe experience as possible while avoiding the old Mini Program's architecture problems.

The target is not a line-by-line rebuild of the old app. The target is:

- Keep the important FPL workflows.
- Rebuild them with clearer page ownership.
- Centralize API access.
- Use reusable components.
- Standardize loading, empty, error, retry, and refresh states.
- Avoid old dead pages, unrelated features, hardcoded values, and duplicated page logic.

## 4. Must-Cover Product Areas

These areas should be treated as the main product surface for the new Mini Program.

| Area | Old Mini Program Source | New Mini Program Direction | Priority |
| --- | --- | --- | --- |
| Entry management | Entry input/search/switch FPL team IDs | Build the first-run and team-switch flow early. Entry ID should become the main app identity. | P0 |
| Home/dashboard | Countdown, fixtures, notice, entry summary | Build a compact home page with current GW, deadline, next fixtures, refresh status, and useful shortcuts. | P0 |
| Live entry tracking | Team live points, lineup, transfers | Core live page. Must be fast, refreshable, and clear during matches. | P0 |
| Live match tracking | Match status and events | Needed to explain live point movement. Can start simple, then add event detail. | P0 |
| Live league/tournament tracking | Real-time standings, sorting, filtering | Important for league users. Use reusable list/table/filter components. | P0 |
| Player statistics | Player detail, stats, fixtures, history | Needed for research and cross-linking from live/stat pages. | P1 |
| Team statistics | Team profile, roster, fixtures, set pieces | Useful supporting workflow. | P1 |
| Price changes | Daily rises/fallers, player price history | Good standalone data feature. Should use date picker and player search. | P1 |
| Player screener/filter | Advanced player search and columns | High value but complex. Build after base data components exist. | P1 |
| Season fixtures | Fixture grid and difficulty colors | Important support feature for player/team planning. | P1 |
| Entry season summary | Entry season analysis | Useful, but can follow live and stat basics. | P2 |
| League season summary | League-wide rankings and analysis | Useful for deeper analysis. | P2 |
| GW overall summary | Dream team, elite players, transfers | Good content page after data layer is stable. | P2 |
| Scout recommendations | Aggregated scout picks | Rebuild if the backend/source data is still supported. | P2 |
| Knockout/H2H | Knockout live results and draw | Keep if tournament features remain active. | P2 |
| Champion League | Group/knockout tournament tracking | Keep if still active; otherwise document as deferred. | P2 |
| Group tournament | Zhejiang team battle | Keep only if active users still use it. | P3 |
| Scout game | Group-based recommendation game | Optional unless still active. | P3 |
| Customer service | Cloud callback auto-reply | Re-evaluate. Could be handled by standard support/contact flow. | P3 |

## 5. Do Not Carry Forward Blindly

These old Mini Program areas should not be copied without review:

- Hermes product listing in `me/notice`: unrelated to FPL.
- Empty `summary/special` page.
- Unregistered page directories.
- Mostly unused cloud functions.
- Hardcoded seasons, tournament IDs, GW ranges, and old season picker data.
- Mixed UI libraries for the same purpose.
- Long request timeout and missing retry behavior.
- `wx.redirectTo` everywhere for navigation.

## 6. New Navigation Shape

Use a smaller, stable top-level structure first.

Recommended top-level sections:

```text
Home
Live
Data
Me
```

If these become true tab pages, define them in `app.json.tabBar.list` and navigate with `wx.switchTab`. If a section needs submenus like the old Mini Program, use a Mini Program custom component plus `wx.navigateTo` or `wx.redirectTo` for non-tab child pages.

Suggested page groups:

```text
miniprogram/pages/
├── home/
│   └── index/
├── entry/
│   ├── search/
│   └── profile/
├── live/
│   ├── entry/
│   ├── match/
│   ├── league/
│   └── knockout/
├── data/
│   ├── players/
│   ├── player-detail/
│   ├── teams/
│   ├── team-detail/
│   ├── price/
│   ├── fixtures/
│   └── screener/
├── summary/
│   ├── entry/
│   ├── league/
│   └── gameweek/
└── me/
    ├── index/
    └── settings/
```

Only add `group/`, `scout/`, and `champion-league/` groups when those workflows are confirmed active.

Every page listed above must resolve to real Mini Program files. Example:

```text
miniprogram/pages/live/entry/
├── entry.ts
├── entry.wxml
├── entry.wxss
└── entry.json
```

And it must be registered:

```json
{
  "pages": [
    "pages/home/index/index",
    "pages/live/entry/entry"
  ]
}
```

## 7. Web-Style Experience To Preserve

The Mini Program should feel as complete and efficient as a modern web app, but it must be implemented with Mini Program primitives.

| Web Expectation | Mini Program Implementation |
| --- | --- |
| React page component | Four-file page: `.ts`, `.wxml`, `.wxss`, `.json` |
| React reusable component | Four-file custom component with `properties` and `triggerEvent` |
| URL route with params | Registered page path plus query params in `onLoad(options)` |
| GraphQL API layer | `wx.request` wrapped by `services/graphql.service.ts` |
| React state | Page/component `data` plus batched `setData` |
| Local storage | `wx.getStorageSync` / `wx.setStorageSync` behind a storage utility |
| CSS/Tailwind layout | WXSS with `rpx`, small utility classes, and Vant components |
| DOM measurement | `wx.createSelectorQuery` |
| Browser libraries | Mini Program-compatible packages only |
| Web back navigation | Use `navigateTo`, `switchTab`, `redirectTo`, and `navigateBack` intentionally |

Do not use:

- JSX or React hooks.
- Browser route libraries.
- `fetch`, `window`, `document`, or `localStorage`.
- DOM refs or DOM event APIs.
- Tailwind classes unless a Mini Program-compatible build step is explicitly added and verified.

## 8. New App Architecture Rules

Build with clear layers:

```text
miniprogram/
├── pages/          # route-level screens
├── components/     # reusable UI and interaction units
├── services/       # request wrapper and API modules
├── models/         # TypeScript domain types
├── utils/          # formatters, storage, route helpers
├── assets/         # static assets
└── app.*           # app lifecycle, global config, global style
```

Rules:

- Pages own routing, lifecycle, screen state, and composition.
- Components own reusable UI and local interaction.
- Services own API endpoints and response normalization.
- Models own shared TypeScript types.
- Utils own formatting, route helpers, storage keys, and small pure functions.
- Avoid API calls directly inside generic components.
- Avoid copying similar logic between `live`, `me`, and `summary` pages.
- Keep imports compatible with the Mini Program TypeScript toolchain. Prefer local modules and Mini Program-compatible packages.
- Do not assume a Vite/Webpack browser runtime.

## 9. Page And Component File Rules

New page template:

```text
miniprogram/pages/<group>/<page>/<page>.ts
miniprogram/pages/<group>/<page>/<page>.wxml
miniprogram/pages/<group>/<page>/<page>.wxss
miniprogram/pages/<group>/<page>/<page>.json
```

Page JSON should include page-only options and local component registration:

```json
{
  "navigationBarTitleText": "Live Entry",
  "enablePullDownRefresh": true,
  "usingComponents": {
    "entry-card": "../../../components/entry-card/entry-card"
  }
}
```

New component template:

```text
miniprogram/components/<component-name>/<component-name>.ts
miniprogram/components/<component-name>/<component-name>.wxml
miniprogram/components/<component-name>/<component-name>.wxss
miniprogram/components/<component-name>/<component-name>.json
```

Component JSON:

```json
{
  "component": true
}
```

Component logic must use Mini Program `Component({ properties, data, methods })`. Emit parent events with `this.triggerEvent(...)`; do not pass function props like React.

## 10. Shared Components To Build Early

These components should exist before rebuilding many feature pages:

| Component | Purpose |
| --- | --- |
| `app-empty-state` | Standard empty result display |
| `app-error-state` | Standard error and retry display |
| `app-loading` | Standard loading block or skeleton |
| `entry-card` | Entry/team summary display |
| `player-row` | Reusable player display row |
| `fixture-chip` | Fixture opponent/difficulty display |
| `gw-picker` | Current/target gameweek picker |
| `season-picker` | API-backed season picker |
| `team-picker` | Team selector |
| `player-picker` | Player selector/search |
| `stat-table` | Reusable data table/list shell |
| `filter-bar` | Reusable filter/search controls |
| `bottom-nav` | App-level navigation if tabBar is not enough |

Use Vant Weapp for popup, picker, tabs, field, button, dialog, toast, action sheet, and grid where it fits. Register Vant components in the relevant page/component JSON or globally only when they are widely used.

## 11. API Modules To Build Early

Centralize API calls by domain:

```text
miniprogram/services/
├── graphql.service.ts
├── common.service.ts
├── entry.service.ts
├── live.service.ts
├── tournament.service.ts
├── player.service.ts
├── team.service.ts
├── fixture.service.ts
├── price.service.ts
├── summary.service.ts
└── scout.service.ts
```

The old Mini Program scattered API calls across pages. The new app should not repeat that.

Each service should:

- Export named functions, not raw endpoint strings.
- Normalize backend errors.
- Return typed data.
- Keep endpoint names in one place.
- Avoid page-specific display formatting.
- Use `wx.request`, not `fetch`.
- Respect the Mini Program concurrent request limit.
- Keep request domain, timeout, and auth handling in `graphql.service.ts`.
- Never store app secrets or WeChat access tokens in the Mini Program.

## 12. WXML, WXSS, And State Rules

For each planned feature, translate UI and state into Mini Program syntax before implementation.

WXML:

- Use `view`, `text`, `image`, `scroll-view`, `swiper`, `navigator`, and Vant components.
- Use `wx:if`, `wx:elif`, `wx:else`, and `wx:for`.
- Add `wx:key` for repeated lists.
- Use `bindtap`, `bindinput`, `bindchange`, and `data-*` for events and event payloads.
- Keep expressions simple; precompute complex display fields in TypeScript before `setData`.

WXSS:

- Use `rpx` as the default size unit.
- Keep styles flat; do not assume SCSS nesting.
- Do not assume CSS custom properties or `calc()` are available.
- Put global shared styles in `app.wxss`; keep page/component styles local.

State:

- Rendered state belongs in `data`.
- Use `this.setData(...)` to update rendered state.
- Batch updates into one `setData` call.
- Keep large raw API payloads out of rendered `data` when only derived fields are shown.
- Use module variables only for carefully reviewed non-rendered caches.

## 13. Feature Coverage Phases

### Phase 1: App Foundation

Build:

- App shell and global style.
- `app.json` page registration and any initial `tabBar` decision.
- Request helper.
- Route constants.
- Storage helper.
- Shared loading/empty/error components.
- Entry search and selected entry storage.
- Home dashboard.

Done when:

- A user can open the app, set an entry, see current GW/deadline/home data, and recover from request failure.

### Phase 2: Live Core

Build:

- Live entry page.
- Live match page.
- Live league/tournament page.
- Pull-down refresh and manual refresh.
- Standard live data timestamp/refresh indicator.
- Batched `setData` for live score/list updates.

Done when:

- A user can follow their team, matches, and league during live gameweeks.

### Phase 3: Data Core

Build:

- Player list/detail.
- Team list/detail.
- Fixture grid.
- Price changes.
- Shared player/team/fixture components.
- Pagination or incremental rendering for long lists.

Done when:

- A user can research players, teams, fixtures, and price movement.

### Phase 4: Advanced Analysis

Build:

- Player screener/filter.
- Entry season summary.
- League season summary.
- GW overall summary.
- Selection/captain/transfer stats.
- Filter state encoded as page data and service query params, not DOM state.

Done when:

- A user can use the Mini Program for most analysis workflows without going to web.

### Phase 5: Tournament And Community Extras

Build only after confirming active need:

- Knockout draw.
- Champion League.
- Group tournament.
- Scout recommendations.
- Scout game.
- Customer service or support workflow.

Done when:

- Active community workflows from the old Mini Program are covered or explicitly retired.

## 14. Missing Checks From Old Mini Program

Before finalizing scope, verify these:

- Which old pages still have active users?
- Which tournament features are still backed by working APIs?
- Whether Champion League data is still current.
- Whether scout recommendation sources still update.
- Whether cloud functions are still needed.
- Whether all old backend endpoints still exist.
- Whether the web app has newer workflows not present in the old Mini Program.
- Whether the new app should support dark mode or only light mode.
- Whether any pages need English/i18n or Chinese-only remains acceptable.
- Which request domains must be whitelisted for the Mini Program.
- Which pages should be tab pages versus normal stack pages.
- Whether any feature needs subpackages to keep the main package small.

## 15. Quality Bar For Each Page

Every new production page should include:

- Clear route ownership.
- Registration in `app.json` or a subpackage config.
- A four-file Mini Program page implementation.
- Typed route params.
- Loading state.
- Empty state.
- Error state.
- Retry action.
- Pull-down refresh if the data changes often.
- Batched `setData`.
- No duplicated endpoint strings.
- No large raw payloads stored in rendered `data`.
- A clear navigation path back or onward.
- Mini Program WXML tags, not HTML tags.
- WXSS with `rpx` and Mini Program-compatible styles.
- Local `usingComponents` registration for feature components.

## 16. Build Rules Based On The Web Comparison Doc

When translating a web-style feature into Mini Program:

- Replace HTML tags with Mini Program components: `view`, `text`, `image`, `scroll-view`.
- Replace JSX logic with simple WXML expressions and prepared page data.
- Replace React hooks with page lifecycle methods.
- Replace browser storage with `wx` storage.
- Replace `fetch` with the request service.
- Replace DOM refs with `selectComponent` or `wx.createSelectorQuery`.
- Replace Tailwind-heavy styling with WXSS classes and `rpx`.
- Treat `setData` as a performance boundary.
- Test on real devices for style, performance, and network behavior.

## 17. Final Recommendation

Start with a focused parity target:

1. Entry management.
2. Home dashboard.
3. Live team, match, and league tracking.
4. Player/team/fixture/price data.
5. Entry and league summaries.

Then add advanced tournament/community features only after confirming they are still live and valuable.

This gives the new Mini Program broad web-like coverage without inheriting the old Mini Program's dead pages, duplicated logic, and unstable architecture.
