# New Mini Program Polish Todo

> Purpose: track the next implementation stage: polish each page group for Mini Program UI/UX, data mutation safety, styles, and real-device behavior.
> Source plan: `documents/new-miniprogram-implementation-plan.md`.

## Progress Notes

- 2026-04-28: Polish todo created after starter implementation reached service-backed pages and shared components.
- 2026-04-28: Home code now forces unbound users to `pages/entry/search/search`; WeChat DevTools verification is still required.
- 2026-04-28: Home polish implemented in code: normalized fixtures, countdown, refresh event/deadline flow, compact notice strip, four shortcuts, and dashboard styling.
- 2026-04-28: Entry binding page restyled after rendered screenshot review; binding now validates Entry ID through GraphQL `entry(id)` instead of the old REST fuzzy-search path. Runtime config uses Mini Program `envVersion`: `develop` -> `http://127.0.0.1:4000/graphql`, `trial/release` -> web proxy. Dev override is available through local storage key `letletme_graphql_endpoint_override`.
- 2026-04-29: Summary-page polish compared the old Mini Program summary pages with the new TypeScript pages. Scope kept to the three rebuilt core pages: `summary/gameweek` replaces old `summary/overall`; `summary/entry` carries forward old entry tabs; `summary/league` carries forward old league picker, averages, rankings, captain, and score sections. Old niche pages (`groupTournament`, `scout`, `special`) remain deferred.
- 2026-04-29: Data-page comparison scoped to existing pages only. Old `stat/player` maps to new `data/player-detail`; old `stat/team` maps to new `data/team-detail`; old `stat/price` maps to new `data/price`; old `stat/fixture` is referenced by the new data hub but the new fixture page is not present. Old `stat/filter`, `stat/select`, and `stat/record/*` are not included in this pass because there is no existing new page to compare against.
- 2026-04-29: REST-to-GraphQL audit replaced existing GraphQL-backed reads for players, teams, fixtures, price values/history, entry league/history/event/transfer reads, and GW summary/dream-team/elite/transfer reads. Remaining REST calls are refresh/job endpoints or summary season aggregate reads without a matching GraphQL field in `/Users/tong/CursorProjects/letletme-graphql`.

## Principles For This Stage

- [ ] Keep this a native WeChat Mini Program implementation: WXML, WXSS, `Page`, `Component`, `setData`, and `wx.request`.
- [ ] Do not introduce new packages unless a page cannot be finished with native Mini Program APIs, Vant Weapp, or the existing table component.
- [ ] Prefer improving shared components before duplicating UI inside pages.
- [ ] Batch `setData` updates and keep large raw API payloads out of rendered `data`.
- [ ] Every remote-data page must have loading, empty, error, retry, and refresh behavior.
- [ ] Update this todo doc whenever a polish item is finished or split.

## Shared UI System

- [ ] Review `app.wxss` spacing, typography, card, row, muted/action classes against real Mini Program rendering.
- [ ] Add safe-area bottom spacing for pages with tabBar or bottom actions.
- [ ] Standardize page header pattern: title, subtitle, optional action area.
- [ ] Standardize section/card spacing across all pages.
- [ ] Standardize button sizes and action placement.
- [ ] Standardize list row height, border, and tap feedback.
- [ ] Standardize all empty/error/loading blocks so they do not create layout jumps.
- [ ] Verify text does not overflow in Chinese labels, long team names, long player names, and long league names.
- [ ] Add common WXSS difficulty color classes if multiple pages need them outside `fixture-chip`.
- [ ] Confirm Vant components are only registered where actually used.

## Shared Components

- [ ] Polish `entry-card`: selected state, no-entry state, compact mode, rank/points display, tap areas.
- [ ] Polish `app-loading`: replace static dot with Mini Program-safe loading style or Vant loading if already available.
- [ ] Polish `app-empty-state`: make action button optional and visually consistent.
- [ ] Polish `app-error-state`: support retry and dismiss separately if needed.
- [ ] Polish `filter-bar`: support search submit, reset, placeholder, and optional filter count.
- [ ] Polish `stat-table`: horizontal scroll behavior, sticky-ish header if feasible, numeric alignment, row tap feedback.
- [ ] Polish `player-row`: support points, price change, team/position, captain/vice/multiplier, and disabled state.
- [ ] Polish `fixture-chip`: verify difficulty colors and home/away text on real device.
- [ ] Polish `gw-picker`: prevent invalid GW changes, support current GW label, and avoid tiny tap targets.
- [ ] Polish `season-picker`: replace hardcoded assumptions with one centralized season list or API-backed options.
- [ ] Polish `team-picker`: verify long team names and selected value display.
- [ ] Polish `player-picker`: add clear state, no-result state, and row selection feedback.

## Data Mutation And State Rules

- [ ] Audit each page for multiple sequential `setData` calls that can be batched.
- [ ] Keep full datasets outside rendered `data` only when necessary for filtering/pagination.
- [ ] For pages with search/filter, store source rows and displayed rows separately.
- [ ] For pages with pull-down refresh, reset `error` and preserve current filters.
- [ ] For pages with route params, validate params in `onLoad` before API calls.
- [ ] For entry changes, ensure entry-scoped storage is cleared consistently.
- [ ] For pages that depend on `app.globalData.gw` or `season`, handle app init failure or empty values.
- [ ] Normalize backend responses in services where pages currently rely on uncertain field names.
- [ ] Add small mapping helpers for common display rows instead of formatting inside WXML.
- [ ] Ensure no page calls backend endpoints directly outside `services/`.
- [x] Replace old REST read endpoints with GraphQL where the current GraphQL schema has a matching query.
- [ ] Add GraphQL equivalents before replacing remaining REST refresh/job endpoints or summary season aggregates.

## Home And Entry Group

### `pages/home/index`

- [x] Use `documents/home-page-polish-plan.md` as the source plan for home polish.
- [x] Treat WeChat auth and FPL Entry ID binding as separate concepts; WeChat owns auth, LetLetMe requires team binding.
- [x] Force unbound users from home to `pages/entry/search/search`; home should not be usable without a bound Entry ID.
- [x] Preserve old home behavior: entry title, GW, change-entry action, notice, deadline countdown, next fixtures, and refresh-on-deadline-finish.
- [x] Extend `Fixture` model for old backend fields: `teamId`, `againstTeamId`, `teamName`, `againstTeamName`, `teamShortName`, `againstTeamShortName`.
- [x] Update `getNextFixture(event?: number)` so home can request the current GW like the old page.
- [x] Add `HomeFixtureRow` mapper before `setData`; render normalized fixture rows instead of raw backend fields.
- [x] Add deadline countdown display using Mini Program-safe interval logic.
- [x] Add countdown-finish flow: refresh event/deadline, refresh app global data, reload home data.
- [x] Make pull-down refresh call GraphQL `currentEventInfo`, then `app.initAppData()`, then reload home fixtures/notice/entry.
- [x] Avoid unnecessary GraphQL `entry(id)` calls when no Entry ID exists.
- [x] Convert notice display into a compact notice strip and support long text wrapping.
- [x] Add four shortcuts: Live, Data, Summary, Me; use `switchTab` only for tab pages.
- [x] Decide fixture-row navigation: fixture rows are non-linking; “更多” routes to `data/fixtures`.
- [ ] Verify home in WeChat DevTools: unbound users are forced to entry binding, saved-entry flow returns to home, pull-down refresh, countdown refresh, and fixture rendering.

### `pages/entry/search`

- [x] Polish manual Entry ID input into a compact native Mini Program binding form.
- [x] Add input validation messages that do not rely only on error-state full-page block.
- [x] Add submit behavior from keyboard confirm.
- [x] Remove visible team/player fuzzy search until Web GraphQL exposes a supported search query.
- [x] Validate and bind Entry ID through GraphQL `entry(id)`; local dev resolves from Mini Program `envVersion`, not a hardcoded `APP_ENV`.
- [x] Add local GraphQL endpoint override support through `letletme_graphql_endpoint_override` storage.
- [x] Add fixed Mini Program button styling so default button typography does not render oversized.
- [x] Add loading state while Entry ID validation is running.
- [ ] Verify saved-entry flow returns to home correctly in WeChat DevTools.

### `pages/entry/profile`

- [ ] Expand from basic entry card into profile sections: leagues, history, transfers.
- [ ] Add tabs or segmented controls for profile/history/transfers.
- [ ] Format rank, total points, event points, and transfer cost consistently.
- [ ] Add pull-down refresh for profile data.
- [ ] Add clear no-entry state with action to choose entry.

## Live Group

### Polish Plan From Old Live Pages

- [x] Compare old `live/entry`, `live/match`, and `live/tournament` pages with the new TypeScript live group.
- [x] Keep the new service-backed page structure, but bring forward old UX strengths: GW context, live summary metrics, captain/chip/transfer visibility, match status tabs, match detail rows, tournament switching, sorting, and incremental league rendering.
- [x] Prioritize supported current GraphQL operations first: `calcLivePointsByEntry`, `entryTransferHistory`, `liveMatches`, `entryTournaments`, and tournament live-points queries.
- [x] Defer old-only advanced filters that need picker/data dependencies not yet rebuilt in the new app: multi-player lineup search, captain dropdown, chip dropdown, Royale elimination zones, knockout/champion league pages.
- [x] Use normalized display rows before `setData` so WXML does not depend on uncertain backend field variants.

### `pages/live/index`

- [x] Polish live landing cards with clear hierarchy and status hints.
- [x] Show selected entry summary or no-entry action.
- [x] Show current GW context.

### `pages/live/entry`

- [x] Split lineup, bench, captain, transfers, and chips into readable sections.
- [x] Map backend live player rows into stable display fields before `setData`.
- [x] Add captain/vice/multiplier visual treatment in `player-row`.
- [x] Add last refreshed timestamp after live cache refresh.
- [x] Make pull-down refresh call cache refresh and then reload data with clear feedback.
- [x] Handle live cache refresh failure separately from data load failure if possible.
- [x] Verify list updates are batched.

### `pages/live/match`

- [x] Replace free-text status search with status segmented control: all, playing, finished, upcoming.
- [x] Group matches by status or kickoff time.
- [x] Add match event details when available: goals, assists, cards, penalties, saves.
- [x] Format scoreline and kickoff time consistently.
- [x] Add empty state per status.

### `pages/live/league`

- [x] Add tournament picker instead of auto-picking first tournament only.
- [x] Persist selected tournament ID/name in storage.
- [x] Add search submit control, not only live input mutation.
- [x] Add sorting for rank, live points, total points if backend rows support it.
- [x] Add pagination/incremental rendering for large league rows.
- [ ] Add Royale mode display only if tournament metadata confirms it.

## Data Group

### Functionality Comparison From Old Data Pages

- [x] Compare old `pages/stat/player` with existing new `pages/data/player-detail`.
- [x] Compare old `pages/stat/team` with existing new `pages/data/team-detail`.
- [x] Compare old `pages/stat/price` with existing new `pages/data/price`.
- [x] Compare old `pages/stat/fixture` with the current new data hub reference.
- [x] Add new `pages/data/selections` from website `/data/selections` as the supported replacement for old `pages/stat/select`.
- [x] Keep this pass limited to existing new pages; do not add new page requirements for old `stat/filter`, `stat/select`, or `stat/record/*`.

#### Existing Page Mapping

| Old Mini Program | New Mini Program | Functionality status |
| --- | --- | --- |
| `pages/stat/player` | `pages/data/player-detail` | Same player detail concept, but the new page is a thin card. Old page has season/player pickers, player info, position-specific stat rows, fixtures, refresh, and storage-backed last selection. |
| `pages/stat/team` | `pages/data/team-detail` | Same team detail concept, but the new page only shows a basic strength row. Old page has season/team pickers, team stat tab, roster grouped by position, fixtures, set-piece orders, refresh, and storage-backed last selection. |
| `pages/stat/price` | `pages/data/price` | Same price-change concept, but the new page only supports current date and raw element input. Old page has date/player modes, date picker, player picker, rise/faller/start tabs, player history list, pull-down refresh, and share metadata. |
| `pages/stat/fixture` | `pages/data/index` card only | New data hub references fixtures, but no existing new fixture page is present in `miniprogram/pages/data`. Treat as a broken hub card unless a current fixture page is added or the card is removed/disabled. |
| `pages/stat/select` | `pages/data/selections` | Rebuilt from website `/data/selections`: tournament picker, GW picker, selected/captain/transfers-in/transfers-out tabs, and GraphQL `tournamentSelectionStats`. |

#### Existing Functionality Gaps

- [ ] `data/index`: remove or disable cards that point at missing routes (`routes.dataFixtures`, `routes.dataScreener`) unless those pages are created in a separate pass.
- [ ] `data/index`: order existing, working cards by current support: price, players, teams.
- [ ] `data/player-detail`: carry over old season switching and selected-player switching within the existing page.
- [ ] `data/player-detail`: render old player info fields: position, current/start price, total points, ownership, news/chance, transfers in/out, form, points per game.
- [ ] `data/player-detail`: render position-specific stat rows for GKP, DEF, MID, FWD, and manager if backend data includes those fields.
- [ ] `data/player-detail`: render fixture list with GW, kickoff, home/away, score/status, and difficulty.
- [ ] `data/player-detail`: add pull-down refresh through the player summary refresh endpoint.
- [ ] `data/team-detail`: carry over old season switching and selected-team switching within the existing page.
- [ ] `data/team-detail`: render old team data fields: win/loss/draw, form, goals, assists, clean sheets, goals conceded, cards, saves, bonus, penalties.
- [ ] `data/team-detail`: render roster grouped by position and link rows to `data/player-detail`.
- [ ] `data/team-detail`: render fixture list with GW, kickoff, home/away, score/status, and difficulty.
- [ ] `data/team-detail`: render set-piece order sections: penalties, direct free kicks, corners/indirect free kicks.
- [ ] `data/team-detail`: add pull-down refresh through the team summary refresh endpoint.
- [x] `data/price`: replace raw element-only search with two-mode behavior: date mode and player mode.
- [x] `data/price`: add date picker behavior for date mode.
- [x] `data/price`: add player picker/search behavior for player mode.
- [x] `data/price`: split date-mode results into rise and faller sections.
- [x] `data/price`: render player-mode price history with change type and change date.
- [x] `data/price`: make pull-down refresh reload the active GraphQL-backed price view.
- [x] `data/selections`: add tournament-scoped selection stats from GraphQL `tournamentSelectionStats`.
- [x] `data/selections`: add tournament picker, GW picker, four stat tabs, pull-down refresh, and data-nav entry.

### `pages/data/index`

- [ ] Polish data hub cards and order by currently supported existing pages: price, players, teams.
- [ ] Add small current GW/season context if useful.
- [ ] Add visual grouping for research vs tools.

### `pages/data/players`

- [ ] Replace `elementType: all` assumption if backend expects a specific position value.
- [ ] Add position/team filters.
- [ ] Add pagination or incremental rendering beyond first 50 rows.
- [ ] Normalize player display fields: name, team, position, price, total points.
- [ ] Verify row tap navigation passes the correct `code` and `season`.

### `pages/data/player-detail`

- [ ] Expand player detail into existing old sections: data, fixtures, history placeholder only if still needed.
- [ ] Format price, ownership, form, points, and fixture difficulty.
- [ ] Add season picker.
- [ ] Add refresh action for player summary.
- [ ] Handle missing `code` route param with an action back to player search.

### `pages/data/teams`

- [ ] Add season picker before loading team list if season is empty.
- [ ] Normalize team IDs and names from backend response.
- [ ] Add search/filter if team list becomes long.
- [ ] Verify row tap passes correct team ID and season.

### `pages/data/team-detail`

- [ ] Expand team detail into existing old sections: data, roster, fixtures, set pieces.
- [ ] Add season picker.
- [ ] Add player row links from roster to player detail.
- [ ] Format fixture difficulty with `fixture-chip`.
- [ ] Add refresh action for team summary.

### `pages/data/price`

- [x] Add date picker for daily price changes.
- [x] Add player picker/search for player price history instead of raw element input.
- [x] Split rises and fallers visually.
- [x] Format price as `£8.6m -> £8.7m`.
- [x] Add refresh action for price data.
- [x] Preserve selected date/player in page state without polluting unrelated storage.

### `pages/data/selections`

- [x] Add tournament picker sourced from GraphQL `entryTournaments`.
- [x] Add GW picker defaulting to current GW.
- [x] Render selected, captain, transfers in, and transfers out tabs.
- [x] Persist selected tournament separately from live/summary tournament selections.
- [x] Add data hub and bottom-nav entries.

### `pages/data/fixtures`

- [ ] Add season picker.
- [ ] Add team filter.
- [ ] Group fixtures by gameweek.
- [ ] Use consistent home/away and difficulty display.
- [ ] Avoid rendering the whole season at once if the list is large.

### `pages/data/screener`

- [ ] Define the first supported filter set: position, team, max price, min points, ownership.
- [ ] Replace plain keyword-only filter with structured controls.
- [ ] Add column selection if needed.
- [ ] Add incremental rendering on scroll.
- [ ] Make `stat-table` readable on mobile for dense screener data.
- [ ] Keep full source rows outside rendered `data` if needed for filtering.

## Summary Group

### Polish Plan From Old Summary Pages

- [x] Compare old `summary/overall`, `summary/entry`, and `summary/league` pages with the new TypeScript summary group.
- [x] Keep the new page names and service-backed structure instead of reintroducing old route names.
- [x] Map old GW summary tabs into new native sections: overview metrics, chips, dream team by position, elite players, and transfer trends.
- [x] Map old entry summary tabs into new native sections: season overview, captain, transfers, and score distribution.
- [x] Map old league summary tabs into new native sections: league averages, entry comparison, rankings, captain, and score distribution.
- [x] Use normalized display rows before `setData` so WXML does not depend on uncertain backend field variants.
- [x] Keep old-only niche summaries deferred until their data ownership and API shape are confirmed: group tournament, scout, and special summary.

### `pages/summary/entry`

- [x] Replace “已加载” placeholder sections with real rendered summary data.
- [x] Add tabs/sections: overview, captain, transfers, score distribution.
- [ ] Add season picker.
- [x] Format ranks, points, percentages, and transfer counts.
- [x] Add no-entry action.

### `pages/summary/league`

- [x] Replace manual league-name input with league picker from GraphQL `entryLeagues` where possible.
- [x] Persist selected league only after successful load.
- [x] Replace “已加载” placeholder sections with real data rows/cards.
- [x] Add tabs/sections: averages, rankings, captain, score distribution.
- [ ] Add season picker.

### `pages/summary/gameweek`

- [x] Replace section counts with real GW summary content.
- [x] Render dream team by position with suitable native rows.
- [x] Render elite players and transfer trends with suitable list/table layout.
- [x] Add GW picker boundaries from current event.
- [x] Add refresh action for event overall summary.
- [ ] Convert GW dream-team rows to shared `player-row` once player-detail route mapping is confirmed.

## Navigation UX

- [ ] Audit all `navigateTo` calls and confirm target pages are not tab pages.
- [ ] Audit all `switchTab` calls and confirm target pages are in `app.json.tabBar.list`.
- [ ] Add route-param helpers for player/team/entry pages.
- [ ] Ensure no page relies on passing large objects through query params.
- [ ] Add no-entry guards to pages that require entry ID.
- [ ] Add back/redirect behavior for invalid route params.

## API And Backend Shape Checks

- [x] Verify current app source no longer calls legacy REST endpoints.
- [x] Replace entry binding/profile info source with Web GraphQL `entry(id)`.
- [ ] Confirm request domain whitelist includes `https://www.letletme.top`.
- [ ] Verify actual backend response shape for live entry, match, and tournament GraphQL operations.
- [ ] Verify actual backend response shape for player/team/price/fixture GraphQL operations.
- [ ] Verify actual backend response shape for summary GraphQL operations.
- [ ] Update model interfaces and service normalizers after response-shape verification.
- [ ] Confirm request domain whitelist includes `https://letletme.top`.

## WeChat DevTools And Device Verification

- [ ] Run WeChat DevTools compile.
- [ ] Build npm in WeChat DevTools.
- [ ] Verify `pages/home/index/index` opens.
- [ ] Verify tabBar pages: home, live, data, me.
- [ ] Verify child page navigation from each tab.
- [ ] Verify pull-down refresh on home, live, price, summary pages.
- [ ] Verify no-entry flow on a fresh install/storage-clear.
- [ ] Verify saved-entry flow with a real Entry ID.
- [ ] Verify API failure state by using invalid network or invalid params.
- [ ] Test on a real iOS device for style/performance.
- [ ] Test on a real Android device for style/performance.
