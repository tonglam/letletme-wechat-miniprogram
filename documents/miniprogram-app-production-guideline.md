# Mini Program App Production Guideline

> Scope: how to structure, plan, and build this WeChat Mini Program app.
> Use this as the first planning document. Read the larger reference docs only when a task needs exact API or component details.

## 1. Default Doc Reading Order

Do not read every document before every change. Use this order:

1. `letletme-architecture.md`
   - Read when planning product flow, page ownership, API ownership, app navigation, storage, or feature boundaries.
2. `wechat-miniprogram-technical-summary.md`
   - Read when you need a compact WeChat Mini Program technical refresher.
3. `mini-program-development-guideline.md`
   - Read when creating pages/components or checking common engineering rules.
4. `wmp-vs-modern-web-dev.md`
   - Read only when translating React/web assumptions into Mini Program patterns.

Use these as lookup references, not default reading:

| Need | Reference |
| --- | --- |
| Exact `app.json` fields, lifecycle, WXML/WXS details | `wechat-miniprogram-reference.md` |
| Exact `wx.*` API behavior | `wechat-miniprogram-api.md` |
| Built-in component props and events | `wechat-miniprogram-component.md` |
| WeChat server-side auth, OpenAPI, event push | `wechat-miniprogram-server.md` |
| Runtime, framework, networking, Skyline, performance | `wechat-miniprogram-framework.md` |

Probably skip unless specifically useful:

- `wechat-miniprogram-technical-summary-draft.md`: draft version of the polished summary.
- `wechat-miniprogram-directory-structure.md`: small structure note mostly covered elsewhere.

## 2. Project Shape

The Mini Program source lives under `miniprogram/`.

Recommended structure:

```text
miniprogram/
├── app.ts
├── app.json
├── app.wxss
├── pages/
│   └── featureName/
│       └── pageName/
│           ├── pageName.ts
│           ├── pageName.wxml
│           ├── pageName.wxss
│           └── pageName.json
├── components/
│   └── component-name/
│       ├── component-name.ts
│       ├── component-name.wxml
│       ├── component-name.wxss
│       └── component-name.json
├── utils/
├── services/
├── models/
└── assets/
```

Current project status has moved beyond the TypeScript quickstart. The foundation now uses the production route groups and shared layers:

```text
miniprogram/
├── app.ts
├── app.json
├── app.wxss
├── config/
├── models/
├── services/
├── utils/
├── components/
└── pages/
```

Continue adding pages/components/services inside this structure. The old `pages/index`, `pages/logs`, and demo `utils/util.ts` quickstart files have been removed.

## 3. App Configuration

`app.json` is the route and global behavior source of truth.

Rules:

- Every page must be registered in `pages` unless it is inside a subpackage.
- The first `pages` entry is the default launch page unless `entryPagePath` is set.
- Keep global page chrome in `window`; override only page-specific differences in page JSON.
- Keep `componentFramework: "glass-easel"` unless there is a compatibility reason to change it.
- Keep `lazyCodeLoading: "requiredComponents"` for better startup behavior.
- Add `tabBar` only when the app has stable top-level sections. Do not use tab bars for temporary navigation.
- Use `subpackages` when feature groups become large or rarely opened.

Example:

```json
{
  "pages": [
    "pages/home/index/index",
    "pages/live/index/index",
    "pages/data/index/index"
  ],
  "window": {
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "LetLetMe",
    "navigationBarBackgroundColor": "#ffffff"
  },
  "style": "v2",
  "componentFramework": "glass-easel",
  "lazyCodeLoading": "requiredComponents"
}
```

## 4. Page Design Rules

A page is a route-level screen. It owns route parameters, screen-level loading/error state, page lifecycle, and page composition.

Each page should have four files:

```text
pages/example/example.ts
pages/example/example.wxml
pages/example/example.wxss
pages/example/example.json
```

Use pages for:

- Route entry screens.
- Screens with their own lifecycle: `onLoad`, `onShow`, `onPullDownRefresh`, `onReachBottom`.
- Screens that coordinate multiple components and API calls.
- Screens that need navigation title, pull-down refresh, or page-specific options.

Do not put too much business logic in page files. Once a page has repeated request logic, formatting, or domain rules, move those into `services/`, `utils/`, or dedicated components.

Page data pattern:

```ts
Page({
  data: {
    loading: false,
    error: "",
    items: [] as Item[]
  },

  onLoad(options) {
    this.loadData(options);
  },

  async loadData(options) {
    this.setData({ loading: true, error: "" });

    try {
      const items = await itemService.list(options);
      this.setData({ items });
    } catch (error) {
      this.setData({ error: "Load failed" });
    } finally {
      this.setData({ loading: false });
    }
  }
});
```

## 5. Component Design Rules

A component is a reusable UI or interaction unit. It should not know the route unless it is explicitly a navigation component.

Each component should have four files:

```text
components/example-card/example-card.ts
components/example-card/example-card.wxml
components/example-card/example-card.wxss
components/example-card/example-card.json
```

`example-card.json`:

```json
{
  "component": true
}
```

Use components for:

- Repeated display blocks.
- Pickers, filters, cards, list rows, empty states, loading states.
- UI that has local interaction but does not own a route.
- Shared layout pieces such as navigation bars or section headers.

Component contract rules:

- Inputs go through `properties`.
- Internal-only state goes in `data`.
- Output goes through `triggerEvent`.
- Avoid hidden dependencies on `getApp().globalData`.
- Avoid direct API calls inside generic display components. Put API calls in pages or feature-specific smart components.

Example:

```ts
Component({
  properties: {
    title: { type: String, value: "" },
    active: { type: Boolean, value: false }
  },

  methods: {
    onTap() {
      this.triggerEvent("select", { title: this.properties.title });
    }
  }
});
```

## 6. Data And API Layer

Keep network behavior centralized.

Recommended folders:

```text
miniprogram/
├── services/
│   ├── graphql.service.ts
│   ├── entry.service.ts
│   ├── live.service.ts
│   └── common.service.ts
├── models/
│   ├── entry.ts
│   └── player.ts
└── utils/
    ├── format.ts
    └── storage.ts
```

Rules:

- Wrap `wx.request` in one request helper.
- Keep base URL, timeout, headers, loading behavior, and error normalization in the helper.
- Keep API endpoint names in service files, not scattered across pages.
- Type request and response shapes where possible.
- Keep display formatting separate from transport models.
- Use local storage through a small utility so keys are discoverable.

Pay attention to Mini Program networking constraints:

- Request domains must be configured in the WeChat admin console.
- `wx.request` has concurrency limits.
- Do not call `api.weixin.qq.com` directly from the Mini Program client.
- Use backend services for app secrets, access tokens, and server-side WeChat APIs.
- Test timeout and failure behavior on real devices, not only DevTools.

## 7. State Management

Mini Program state is not React state. `setData` crosses from logic layer to view layer, so it is expensive.

Rules:

- Batch related updates into one `setData`.
- Do not call `setData` inside tight loops.
- Do not store huge raw API payloads in page data if only a few fields are rendered.
- Keep non-rendered temporary values outside `data` when possible.
- Use path updates for small nested changes.
- Reset loading/error states intentionally during page refreshes.

Good:

```ts
const updates: Record<string, unknown> = {};
items.forEach((item, index) => {
  updates[`items[${index}].selected`] = item.id === selectedId;
});
this.setData(updates);
```

Avoid:

```ts
items.forEach((item, index) => {
  this.setData({ [`items[${index}].selected`]: item.id === selectedId });
});
```

## 8. WXML And WXSS Rules

WXML is not HTML and WXSS is not full web CSS.

WXML rules:

- Use Mini Program tags: `view`, `text`, `image`, `scroll-view`, `swiper`, etc.
- Use `bindtap`, `bindinput`, and `data-*` for events.
- Keep expressions simple. Move complicated logic into TS helpers or computed data.
- Use `wx:key` for lists.
- Prefer components over large repeated WXML blocks.

WXSS rules:

- Use `rpx` for responsive layout.
- Keep page styles in page WXSS and shared app-level styles in `app.wxss`.
- Avoid relying on unsupported browser CSS features.
- Avoid deep selector coupling between pages and components.
- Test visual behavior on real devices when layout is important.

## 9. Navigation Rules

Use the right navigation API:

| API | Use when |
| --- | --- |
| `wx.navigateTo` | Open a normal child/detail page and keep current page in stack |
| `wx.redirectTo` | Replace current page, often for same-level flow transitions |
| `wx.switchTab` | Jump to a `tabBar` page |
| `wx.reLaunch` | Reset the whole stack, usually after login/logout or app reset |
| `wx.navigateBack` | Return to a previous page |

Rules:

- Keep route paths centralized when routes become numerous.
- Validate route query parameters in `onLoad`.
- Do not pass large objects through query strings. Pass IDs and reload data.
- Prefer explicit route ownership: each page should have one clear purpose.

## 10. UI Library Rules

This project currently depends on:

- `@vant/weapp`
- `miniprogram-table-component`

Rules:

- Prefer native Mini Program components for simple primitives.
- Use Vant for stable, repeated UI patterns such as popup, picker, tabs, field, button, dialog, toast, action sheet, and grid.
- Do not mix multiple UI libraries for the same control type unless there is a clear reason.
- Register global components only when they are used broadly.
- Register feature-only components locally in page/component JSON.

## 11. Performance Rules

Priorities:

- Keep the first screen small.
- Use `lazyCodeLoading: "requiredComponents"`.
- Split large, rarely-used feature groups into subpackages.
- Batch `setData`.
- Keep WXML trees shallow for large lists.
- Use pagination or incremental rendering for long datasets.
- Avoid heavy synchronous work in page lifecycle methods.
- Avoid large images in the main package. Compress assets and load remote assets when appropriate.

If performance is a feature requirement, test on real iOS and Android devices. DevTools is not enough.

## 12. Error, Empty, And Loading States

Every production page that loads remote data should define:

- Loading state.
- Empty state.
- Error state.
- Retry action.
- Pull-down refresh behavior if the page is data-heavy.

Do not leave users on a blank page when requests fail.

Recommended page state shape:

```ts
data: {
  loading: false,
  refreshing: false,
  error: "",
  items: []
}
```

## 13. What To Pay Attention To

Common Mini Program gotchas:

- No DOM or BOM APIs. Use Mini Program APIs such as `wx.createSelectorQuery`.
- `setData` is the main performance trap.
- WXML expressions are limited compared with JSX.
- WXSS is not full browser CSS.
- Network domains must be whitelisted.
- App secrets and WeChat server APIs belong on the backend, not the client.
- Page routes must be registered.
- Components must set `"component": true`.
- `App()` should be called once in `app.ts`.
- Device behavior can differ from DevTools, especially style, performance, and runtime behavior.

Project planning gotchas:

- Confirm whether a change is page-level, component-level, service-level, or backend-level before editing.
- Do not duplicate API endpoints inside page files.
- Do not put route-specific behavior in reusable components.
- Do not introduce global state unless multiple pages really need it.
- Keep docs and implementation aligned when adding a new feature area.

## 14. Planning Checklist

Before implementing a feature, answer:

1. Which page owns this workflow?
2. Is this a new route, a component inside an existing page, or a service-only change?
3. Does `app.json` need a new page, tab, subpackage, permission, or global component?
4. What API/service owns the data?
5. What data must be rendered, cached, or stored locally?
6. What are the loading, empty, error, and retry states?
7. Does the page need pull-down refresh, pagination, or infinite scroll?
8. Can this be built with existing components or Vant components?
9. What should be tested in DevTools and what must be checked on a real device?
10. Which reference doc is needed for exact API/component behavior?

## 15. Recommended Build Flow

1. Identify the feature owner page or create a new page folder.
2. Register the page in `app.json`.
3. Create the four page files.
4. Add or reuse services for API calls.
5. Create small components for repeated UI.
6. Keep WXML simple and move logic into TS.
7. Add loading, empty, error, and retry states.
8. Check navigation behavior and route parameters.
9. Check style on common screen sizes.
10. Run in WeChat DevTools and test the highest-risk flow on a real device when possible.
