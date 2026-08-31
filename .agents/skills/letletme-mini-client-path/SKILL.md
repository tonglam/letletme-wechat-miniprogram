---
name: letletme-mini-client-path
description: Trace or change a LetLetMe WeChat Mini Program page, component, GraphQL/auth request, cache, session, app-context, or client lifecycle. Use for Mini-only features and bugs; escalate when Web, GraphQL, Data, or Ops contracts must change.
---

# LetLetMe Mini client path

## Establish scope

1. Inspect branch/SHA, all worktrees, and dirty/untracked state. Preserve unrelated work.
2. Name the exact Mini route/scenario, runtime environment (`develop`, `trial`, or `release`), identity state, and acceptance target.
3. Keep the task Mini-only if the existing Web/GraphQL/Data contract can satisfy it. Otherwise invoke `$letletme-stack-audit` and register only affected repositories; do not create a Change ID for a single-repository change.

## Trace before editing

Follow the smallest applicable chain:

- Route: `miniprogram/app.json` and `miniprogram/config/routes.ts`.
- Page: its `.ts`, `.wxml`, `.wxss`, and `.json`, plus navigation callers.
- Data: page lifecycle/event -> feature service -> `graphql.service.ts` -> auth/cache/cooldown/session hooks -> Web `/api/graphql`.
- Auth: `app.ts` readiness -> `auth.service.ts`/auth-session -> Web `/api/miniprogram` -> stored session/entry-context update -> GraphQL cache invalidation.
- App context: `app-context.service.ts` and state helpers -> affected page refresh policy.

Search for the operation, route constant, storage key, cache policy, and matching tests. Do not read all pages or historical PR-review regression files.

## Preserve client contracts

- Keep network access inside existing services and endpoint selection inside `config/env.ts`.
- Keep identity authoritative on Web. Mini sends only Web-issued bearer sessions and device/login evidence defined by the current contract.
- Preserve request ID, timeout, retry/cooldown, in-flight dedupe, cache freshness/staleness, season/context variants, and user-visible error mapping.
- Clear identity/entry-scoped state on rotation, revocation, logout, or binding change. Never serve one user's persisted cache to another identity.
- Keep `develop` overrides local. `trial` and `release` must ignore them and use the production Web origin.
- For UI work, preserve lifecycle idempotency, loading/empty/error/retry states, batched `setData`, pull-down completion, route registration, component JSON, and supported WXML/WXSS.

## Verify

1. Run the narrow matching test(s), then `npm run typecheck` and `npm run lint:strict`.
2. Run `npm run check:style` for WXML/WXSS/component changes.
3. Run `npm run contract:graphql` for operation or response-shape changes.
4. Use `$letletme-miniprogram-devtools` for the exact route and scenario; prove compile/Problems state plus visible behavior. Do not substitute another page.
5. Include auth loss, no-entry, updating/stale, network/rate-limit, background/foreground, or real-device cases when the changed path can encounter them.
6. Report source/tests, DevTools simulator, preview/device, upload, audit, and publication separately.
