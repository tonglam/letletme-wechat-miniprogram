# letletme-wechat-miniprogram

## Repository profile

- Use npm with `package-lock.json`. This is a native WeChat Mini Program: TypeScript logic, WXML, WXSS, page/component JSON, Vant Weapp, `wx.request`, and `setData`. Do not apply React, DOM, browser-CSS, or Tailwind assumptions.
- `miniprogram/app.json` is the route/package/global-component source of truth. Central route names live in `miniprogram/config/routes.ts`.
- A route page owns lifecycle, route parameters, loading/empty/error/refresh state, and composition. Reusable presentation belongs in `components`; remote access and business-facing request policy belong in `services`; transport/display contracts belong in `models` and focused utilities.
- Avoid broad context loading. Trace only the affected page four-file set, its service/model/cache/session helpers, and matching tests. Historical `test/pr*-review*` files are regression artifacts, not default reading material.

## Product and request boundary

- Web owns WeChat/email-link login, bearer sessions, verified FPL-entry binding, and the public `/api/miniprogram` and `/api/graphql` endpoints. GraphQL owns product reads; Data owns canonical FPL data/publication. Mini is a client and must not reproduce server authority.
- The normal path is `page lifecycle/event -> service -> graphql.service/auth.service -> Web proxy -> GraphQL/Web-owned auth`. Reuse the centralized timeout, auth mode, cache policy, in-flight dedupe, cooldown, request ID, stale-data, and telemetry behavior.
- Never send a client-supplied identity as authority. Preserve Web-issued bearer rotation/revocation, device-scoped sessions, verified-entry semantics, and the clearing of entry-scoped caches when identity changes.
- `develop` may use the local overrides defined in `miniprogram/config/env.ts`. `trial` and `release` must use the checked-in HTTPS Web proxy and ignore local overrides.
- Keep server-side WeChat credentials, backend signing keys, service tokens, private origins, cookies, and raw secrets out of this client and its logs.

## Mini Program implementation rules

- Use the page/component four-file contract and register routes/components in the owning JSON. Keep page-path changes synchronized with `app.json`, `routes.ts`, navigation, and scenario tests.
- Batch `setData`, keep non-rendered payloads out of view data, and avoid request or formatting logic duplicated across pages. WXML expressions stay simple; WXSS must use supported Mini Program behavior and be checked in DevTools/real devices when layout matters.
- Preserve app initialization order in `app.ts`: update guard, privacy/auth readiness, session restoration, app context, cache invalidation, telemetry, and entry binding are separate lifecycle concerns.
- Read only the relevant section plans under `documents/`. Use `documents/miniprogram-app-production-guideline.md` for page/component/runtime conventions, not as a reason to preload every reference.

## Change routing

- For a Mini-only feature or bug, use `$letletme-mini-client-path`; no cross-repo Change ID is needed.
- If a change needs a Web login/proxy contract, GraphQL field/resolver, Data publication, or Ops release change, use the global `$letletme-stack-audit` and register only the affected repositories.
- Use the global `$letletme-miniprogram-devtools` for DevTools import/build/scenario/simulator/preview/upload work. Use the global `$gh-codex-review-loop` for PR completion and the global `$letletme-release-acceptance` for authorized public-release acceptance.

## Verification and release evidence

- Inspect branch, worktrees, dirty/untracked files, and exact SHA before editing. Preserve unrelated work and the other active worktree.
- Normal static gates are `npm run typecheck`, `npm run lint:strict`, `npm test`, `npm run check:style`, and `npm run package:check`. Run the narrow matching tests first.
- Any GraphQL document/shape change requires `npm run contract:graphql` against the pinned GraphQL schema/module or an explicitly selected compatible endpoint.
- Keep checked-in `project.config.json` on `touristappid`. Real app id and local DevTools preferences stay in ignored `project.private.config.json`; generated `miniprogram/miniprogram_npm` stays uncommitted.
- Treat source/static checks, DevTools compile/Problems, exact simulator scenario, preview/real device, signed development upload, audit, and public publication as distinct evidence. Simulator or upload success is not public release.
- Before any upload, inspect the current online version and update type, continue the approved version line, bind version/description to the exact `origin/main` SHA, and run `npm run check:production-origin`. After publication, verify the online version and a representative real client flow.
