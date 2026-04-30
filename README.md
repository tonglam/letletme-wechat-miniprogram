# LetLetMe WeChat Mini Program

LetLetMe WeChat Mini Program is a TypeScript-based Mini Program client for Fantasy Premier League data, live match tracking, tournament views, entry summaries, and player/team statistics.

The app is built with native WeChat Mini Program pages, components, WXML, WXSS, and `wx.request`. It uses the LetLetMe GraphQL API for product data and keeps local-only WeChat DevTools settings out of source control.

## Features

- Home dashboard with live gameweek context and player price movement highlights.
- Live pages for fixtures, entries, transfers, player details, and tournament views.
- Data pages for players, teams, selections, prices, and team/player detail screens.
- Summary pages for entry, gameweek, and tournament analysis.
- Shared Mini Program components for navigation, pickers, cards, tables, loading states, and empty/error states.

## Tech Stack

- WeChat Mini Program native runtime
- TypeScript
- WXML and WXSS
- Vant Weapp components
- GraphQL over `wx.request`
- ESLint and TypeScript checks

## Project Structure

```text
miniprogram/
  components/     Shared Mini Program components
  config/         Runtime constants and endpoint selection
  models/         TypeScript data contracts
  pages/          App pages grouped by product area
  services/       GraphQL and service-layer data access
  utils/          Formatting, storage, date, and navigation helpers
documents/        Product, implementation, and production guidance
tests/            TypeScript unit tests for live-page helpers
typings/          WeChat Mini Program type declarations
```

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Open the project in WeChat DevTools.

3. Set the real Mini Program app id in your local `project.private.config.json` or through WeChat DevTools project settings. The checked-in `project.config.json` intentionally uses the public `touristappid` placeholder.

4. Build npm inside WeChat DevTools when component packages need to be regenerated. Generated Mini Program npm output is ignored by Git.

## Environment

The app selects the GraphQL endpoint from the Mini Program runtime environment:

- `develop`: local GraphQL endpoint for simulator development
- `trial`: production LetLetMe GraphQL proxy
- `release`: production LetLetMe GraphQL proxy

For development testing, the endpoint can be overridden through the storage key managed by `miniprogram/config/env.ts`.

## Checks

```bash
npm run typecheck
npm run lint
```

## Security Notes

- Do not commit WeChat app secrets, access tokens, backend credentials, private keys, or local `.env` files.
- `project.private.config.json` is ignored because it contains local WeChat DevTools preferences and can contain developer-specific project metadata.
- Server-side WeChat APIs and credentialed integrations should stay in backend services, not in the Mini Program client.
