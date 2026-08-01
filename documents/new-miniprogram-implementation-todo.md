# New Mini Program Implementation Todo

> Companion checklist for `documents/new-miniprogram-implementation-plan.md`.

## Progress Notes

- 2026-04-28: Phase 1 foundation scaffold implemented. `npx tsc --noEmit` passes.
- 2026-04-28: All 20 registered `app.json` pages have `.ts`, `.wxml`, `.wxss`, and `.json` files.
- 2026-04-28: Quickstart `pages/index`, `pages/logs`, and `utils/util.ts` were removed.
- 2026-04-28: No new npm packages were added.
- 2026-04-28: Shared components `gw-picker`, `fixture-chip`, `player-row`, `filter-bar`, `stat-table`, `season-picker`, `team-picker`, and `player-picker` were added.
- 2026-04-28: Live core pages now call service-layer APIs with loading/error/empty states.
- 2026-04-28: Data core pages now call service-layer APIs with starter search/list/detail flows.
- 2026-04-28: Summary pages now call service-layer APIs with starter section loading.
- 2026-04-28: Me/settings pages now support entry display, switch, reset, and entry-scoped cache clearing.
- 2026-04-28: Local verification: `npx tsc --noEmit` passes; all 20 registered pages have four files.

## Phase 1: Foundation

- [x] Rename `package.json` metadata from quickstart to LetLetMe Mini Program.
- [x] Create `miniprogram/config/env.ts`.
- [x] Create `miniprogram/config/routes.ts`.
- [x] Create `miniprogram/config/storage-keys.ts`.
- [x] Create model files under `miniprogram/models/`.
- [x] Create `miniprogram/services/graphql.service.ts`.
- [x] Create `common.service.ts`, `entry.service.ts`, and initial domain services.
- [x] Create `utils/storage.ts`, `utils/navigation.ts`, `utils/date.ts`, `utils/fpl.ts`.
- [x] Replace `miniprogram/app.ts` demo code with production global data initialization.
- [x] Replace `miniprogram/app.json` quickstart pages with production pages and tabBar.
- [x] Add `miniprogram/sitemap.json` if missing.
- [x] Remove `pages/index` and `pages/logs` after replacement pages compile.
- [x] Remove unused `utils/util.ts` if no production code references it.
- [x] Create shared state components: `app-loading`, `app-empty-state`, `app-error-state`.
- [ ] Verify the app opens at `pages/home/index/index`.

## Phase 2: Entry And Home

- [x] Create `pages/home/index` four-file page.
- [x] Create `pages/entry/search` four-file page.
- [x] Create `pages/entry/profile` four-file page.
- [x] Create `entry-card`.
- [x] Implement entry search with GraphQL `entry(id)`.
- [x] Implement manual entry ID save.
- [x] Implement selected entry storage and entry-scoped storage clearing.
- [x] Implement home current GW/deadline/notice/fixture loading.
- [ ] Verify no-entry flow routes to entry search.
- [ ] Verify saved-entry flow returns to home with entry summary.

## Phase 3: Live Core

- [x] Create `pages/live/index` tab page.
- [x] Create `pages/live/entry` page.
- [x] Create `pages/live/match` page.
- [x] Create `pages/live/league` page.
- [x] Create `gw-picker`, `fixture-chip`, `player-row`, `filter-bar`, `stat-table`.
- [x] Implement live GraphQL refetch flow.
- [x] Implement live entry points.
- [x] Implement live match status list.
- [x] Implement live league/tournament picker and standings.
- [x] Implement pull-down refresh for live pages.
- [x] Verify live pages batch `setData` for list updates.

## Phase 4: Data Core

- [x] Create `pages/data/index` tab page.
- [x] Create `pages/data/players`.
- [x] Create `pages/data/player-detail`.
- [x] Create `pages/data/teams`.
- [x] Create `pages/data/team-detail`.
- [x] Create `pages/data/price`.
- [x] Create `pages/data/fixtures`.
- [x] Create `pages/data/screener`.
- [x] Create `season-picker`, `team-picker`, `player-picker`.
- [x] Implement player list and detail navigation.
- [x] Implement team list and detail navigation.
- [x] Implement price changes by date and by player.
- [x] Implement fixture grid with difficulty colors.
- [x] Implement screener with pagination/incremental rendering.

## Phase 5: Summary Core

- [x] Create `pages/summary/entry`.
- [x] Create `pages/summary/league`.
- [x] Create `pages/summary/gameweek`.
- [x] Implement entry season summary tabs/sections.
- [x] Implement league season summary tabs/sections.
- [x] Implement gameweek overall summary, dream team, elite players, transfers.
- [x] Add links from `home` and `data/index` to summary pages.

## Phase 6: Deferred Feature Review

- [ ] Confirm whether knockout/H2H is active.
- [ ] Confirm whether Champion League is active.
- [ ] Confirm whether group tournament is active.
- [ ] Confirm whether scout recommendation/game features are active.
- [ ] Confirm whether cloud/customer-service functions are still needed.
- [ ] Add separate implementation plans for confirmed deferred features.

## Phase 8: Final Verification

- [ ] Run WeChat DevTools compile.
- [ ] Build npm in WeChat DevTools.
- [ ] Verify every `app.json` page path opens.
- [ ] Verify tab navigation.
- [ ] Verify child navigation with query params.
- [ ] Verify the WeChat request-domain whitelist contains `https://www.letletme.top` and `https://api.letletme.top` before release.
- [ ] Verify loading, empty, error, retry states.
- [x] Verify no sample quickstart page/code remains.
- [x] Verify no new packages were added.
- [ ] Test high-risk live/data workflows on a real device.
