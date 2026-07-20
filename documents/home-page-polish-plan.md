# Home Page Polish Plan

> Scope: polish the new Mini Program home page by comparing it against the old implementation in `/Users/tong/WechatProjects/miniprogram-letletme/miniprogram/pages/common/home`.

## 1. Compared Files

Old Mini Program:

- `/Users/tong/WechatProjects/miniprogram-letletme/miniprogram/pages/common/home/home.js`
- `/Users/tong/WechatProjects/miniprogram-letletme/miniprogram/pages/common/home/home.wxml`
- `/Users/tong/WechatProjects/miniprogram-letletme/miniprogram/pages/common/home/home.wxss`
- `/Users/tong/WechatProjects/miniprogram-letletme/miniprogram/app.js`
- `/Users/tong/WechatProjects/miniprogram-letletme/miniprogram/utils/utils.js`

New Mini Program:

- `miniprogram/pages/home/index/index.ts`
- `miniprogram/pages/home/index/index.wxml`
- `miniprogram/pages/home/index/index.wxss`
- `miniprogram/app.ts`
- `miniprogram/services/common.service.ts`
- `miniprogram/utils/date.ts`

## 2. Old Home Behavior To Preserve

The old home page did these things:

- Displayed current entry name in the top bar.
- Displayed current GW in the top bar.
- Provided a clear “切换id” action.
- Loaded current GW, next GW, deadline, selected entry, entry profile, next fixtures, and notice.
- Rendered a notice bar only when notice text existed.
- Rendered deadline information and a live countdown until deadline.
- Refreshed event/deadline data when countdown finished.
- On pull-down refresh, refetched GraphQL `currentEventInfo`, refreshed app global GW/deadline, then reloaded fixtures.
- Listed next GW fixtures and linked each fixture to the old H2H record page.
- Used a bottom navigation action-sheet pattern for Live/Summary/Data/Me.

## 3. Auth And Entry Binding Rule

The web account service owns Mini Program authentication. The client only
exchanges a short-lived `wx.login()` code for a web-issued bearer session and
does not control identity, session ownership, or FPL entry binding.

The product-level identity for LetLetMe is the user's FPL Entry ID. Therefore:

- Home must check whether an FPL Entry ID is bound.
- If no Entry ID is bound, home must not behave as a usable dashboard.
- The app must force the user into `pages/entry/search/search` to bind an Entry ID.
- After binding succeeds, the app can return to the tab home page.
- FPL entry ownership is a web-only team-name challenge; the Mini Program
  inherits only the verified entry returned in the web profile.
- Pages that require an entry should use the same guard or show an action that routes to binding.

## 4. New Home Current State

The new home currently:

- Loads next fixtures, notice, and entry info.
- Shows GW/deadline text.
- Shows `entry-card`.
- Shows two shortcut cards: live and data.
- Shows raw fixture rows.
- Shows notice content in a plain card.
- Supports pull-down refresh, but does not explicitly call `refreshEventAndDeadline`.

The new home does not yet:

- Show a live countdown.
- Refresh current GW/deadline on pull-down.
- Refresh when countdown reaches zero.
- Show top-level summary/me shortcuts.
- Link fixtures to any record/H2H route.
- Normalize old fixture fields such as `teamShortName`, `againstTeamShortName`, `teamId`, `againstTeamId`.
- Use the more compact notice-bar treatment.

The new home code now has an initial forced Entry ID binding guard, but it still needs WeChat DevTools verification.

## 5. Target Home UX

The new home should be a compact FPL dashboard:

0. Entry binding gate
   - If no FPL Entry ID is stored, immediately route to entry binding.
   - Do not load entry-specific home data before binding.

1. Header
   - Show app name.
   - Show selected entry name if available.
   - Show GW and next deadline.
   - Provide a clear change-entry action.

2. Deadline card
   - Show `GW{nextGw}` deadline.
   - Show a live countdown broken into days/hours/minutes/seconds.
   - When countdown finishes, refresh current event/deadline and reload home data.

3. Entry card
   - Show selected entry.
   - If no entry exists, this page should already have redirected to binding.
   - Tapping selected entry opens entry profile.

4. Notice
   - Render only when notice exists.
   - Use a compact notice style, not a large content card unless text is long.

5. Feature shortcuts
   - Live.
   - Data.
   - Summary.
   - Me/settings or profile.
   - Use stable tab navigation for tab pages and `navigateTo` for child pages.

6. Next GW fixtures
   - Use normalized fixture display fields.
   - Show team short names, kickoff time, and difficulty if available.
   - If record/H2H page is not implemented yet, keep rows non-linking or route to `data/fixtures`.
   - Do not point at old `/pages/stat/record/record` unless that page exists in the new app.

## 6. Data Model Changes

Update `miniprogram/models/common.ts`:

- Extend `Fixture` with old backend fields:
  - `teamId`
  - `againstTeamId`
  - `teamName`
  - `againstTeamName`
  - `teamShortName`
  - `againstTeamShortName`

Add a home display model in `miniprogram/pages/home/index/index.ts` or `miniprogram/models/common.ts`:

```ts
interface HomeFixtureRow {
  id: string;
  homeName: string;
  awayName: string;
  kickoffTime: string;
  teamId?: number | string;
  againstTeamId?: number | string;
}
```

Use a mapper before `setData`:

```ts
function mapFixtureRow(fixture: Fixture, index: number): HomeFixtureRow {
  return {
    id: String(fixture.id || `${fixture.teamId || "team"}-${fixture.againstTeamId || "against"}-${index}`),
    homeName: fixture.teamShortName || fixture.homeTeam || fixture.teamName || "-",
    awayName: fixture.againstTeamShortName || fixture.awayTeam || fixture.againstTeamName || "-",
    kickoffTime: fixture.kickoffTime || "",
    teamId: fixture.teamId,
    againstTeamId: fixture.againstTeamId
  };
}
```

## 7. Data Mutation Rules

- On page load/show, copy `gw`, `nextGw`, `deadline`, `utcDeadline`, and `entryId` from `app.globalData` in one `setData`.
- On pull-down refresh:
  - call `refreshEventAndDeadline()`;
  - call `app.initAppData()`;
  - reload fixture, notice, and entry data;
  - call `wx.stopPullDownRefresh()`.
- Avoid separate `setData` calls for `fixtures`, `notice`, and `entry` if they can be batched.
- Store rendered fixture rows in page `data`; do not store unnecessary raw fixture payloads.
- If no entry exists, force route to `pages/entry/search/search` and do not call `getEntryInfo`.
- If one request fails but others succeed, keep successful data and show a small warning rather than blanking the whole page.

## 8. Files To Modify

- `miniprogram/pages/home/index/index.ts`
  - Add countdown fields.
  - Add `nextGw`, `utcDeadline`, and display fixture rows.
  - Add explicit event/deadline refresh flow.
  - Add fixture mapper.
  - Add forced Entry ID binding guard.

- `miniprogram/pages/home/index/index.wxml`
  - Add dashboard header.
  - Add deadline countdown card.
  - Add compact notice.
  - Add four shortcut actions.
  - Replace raw fixture rows with normalized fixture rows.

- `miniprogram/pages/home/index/index.wxss`
  - Polish spacing, card hierarchy, countdown blocks, notice bar, shortcuts, fixture rows.

- `miniprogram/models/common.ts`
  - Add old fixture field compatibility.

- `miniprogram/utils/date.ts`
  - Add `getDeadlineDiffMs(utcDeadline: string): number`.
  - Add `formatCountdown(ms: number)` if not using Vant count-down.

- `miniprogram/services/common.service.ts`
  - Ensure `getNextFixture(event?: number)` can pass current GW like old home did.

## 9. Implementation Tasks

### Task 1: Normalize Fixture Data

- [x] Extend `Fixture` with old backend fields.
- [x] Change `getNextFixture(event?: number)` to pass `{ event }` when provided.
- [x] Add `HomeFixtureRow` and `mapFixtureRow`.
- [x] Update home data from `fixtures: Fixture[]` to `fixtureRows: HomeFixtureRow[]`.

### Task 2: Add Countdown Data

- [x] Add `nextGw`, `utcDeadline`, and countdown parts to home data.
- [x] Add date utility for deadline diff.
- [x] Compute countdown from `app.globalData.utcDeadline`.
- [x] Use a simple Mini Program-safe interval instead of Vant count-down.
- [x] Clear interval in `onUnload`.

### Task 3: Refresh Flow

- [x] On pull-down refresh, refetch GraphQL `currentEventInfo`.
- [x] Then call `app.initAppData()`.
- [x] Then reload home data.
- [x] Stop pull-down refresh after reload.
- [x] On countdown finish, run the same refresh flow.

### Task 4: Forced Entry Binding

- [x] Treat WeChat auth and FPL Entry binding as separate concepts.
- [x] If `entryId` is missing, force route to `pages/entry/search/search`.
- [x] Do not call GraphQL `entry(id)` when entry is missing.
- [ ] Verify fresh install/storage-clear lands on entry binding.
- [ ] Verify binding success returns user to home dashboard.

### Task 5: Header And Shortcut UX

- [x] Make header show entry name, GW, deadline, and change-entry action.
- [x] Add four shortcuts: Live, Data, Summary, Me.
- [x] Use `switchTab` only for tab pages.
- [x] Use `navigateTo` only for child pages.

### Task 6: Notice And Fixtures UI

- [x] Convert notice card to compact notice strip.
- [x] Add long-notice wrapping rules.
- [x] Render fixtures with normalized names and kickoff time.
- [x] Keep fixture rows non-linking and route the “更多” action to `data/fixtures`.

### Task 7: Verification

- [x] Run `npx tsc --noEmit`.
- [x] Verify all `app.json` pages still have four files.
- [ ] Verify home opens in WeChat DevTools.
- [ ] Verify pull-down refresh does not leave spinner stuck.
- [ ] Verify countdown reaches zero path by forcing `utcDeadline` to a near-future value.
- [ ] Verify no-entry and saved-entry flows.
