# Stockout Admin

Enterprise admin console for the STOCKOUT marketplace. React + TypeScript + Vite, implemented from the
StockOut Figma file and integrated with the STOCKOUT .NET API gateway (`https://stockout.flowb.io`).

## Quick start

```bash
npm ci
cp .env.example .env.local      # optional — defaults work for local development
npm run dev                     # http://localhost:5173
```

In development the browser calls same-origin `/api/*`; Vite proxies it to `VITE_DEV_PROXY_TARGET`
(default `https://stockout.flowb.io`). Sign in with a platform admin account; menus appear according to the
permissions returned by `GET /api/v1/platform/me/permissions`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with API proxy |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | Playwright smoke tests (builds and previews the app) |

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | empty | Gateway origin for the built app. Empty = same-origin `/api` (recommended behind a reverse proxy). Set `https://stockout.flowb.io` to call the gateway directly (it currently allows any origin; restrict CORS before production). |
| `VITE_DEV_PROXY_TARGET` | `https://stockout.flowb.io` | Dev-server proxy target. |
| `VITE_REFRESH_TOKEN_STORAGE` | `local` | `local` (shared by all tabs; refreshes serialised with a Web Lock) or `session` (tab-scoped; a duplicated tab logs both tabs out on refresh). |

No secrets are needed or read by the frontend.

## Deployment

`npm run build` produces a static SPA in `dist/`. Serve it with any static host and:

1. Rewrite unknown paths to `/index.html` (client-side routing, deep links).
2. Either proxy `/api/*` to the gateway on the same origin (recommended), or set `VITE_API_BASE_URL` at
   build time and add the admin origin to the gateway's CORS allow-list.
3. Cache `/assets/*` immutably; do not cache `index.html`.

Example (nginx):

```nginx
location /api/ { proxy_pass https://stockout.flowb.io; proxy_set_header Host stockout.flowb.io; }
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
location / { try_files $uri /index.html; add_header Cache-Control "no-cache"; }
```

## Documentation

* `docs/FRONTEND_ARCHITECTURE.md` — structure, request pipeline, auth, tables, resilience
* `docs/API_INTEGRATION_MAP.md` — every endpoint, the screen that uses it, status
* `docs/SCREEN_IMPLEMENTATION_PLAN.md` — screens, Figma frames, backend support
* `docs/FIGMA_IMPLEMENTATION.md` — tokens, components, assets to export, deviations
* `docs/contracts/*` — exact backend contracts extracted from the C# source (with file:line citations)
* `IMPLEMENTATION_REPORT.md` — status, test results, known limitations and backend blockers
