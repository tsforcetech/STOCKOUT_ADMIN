# Stockout Admin — Frontend Architecture

## Stack

| Concern | Choice |
|---|---|
| Build / dev server | Vite 7, TypeScript 5.9 (strict) |
| UI | React 19, Tailwind CSS 4 (CSS-first tokens), Radix UI primitives (shadcn-style wrappers in `src/components/ui`) |
| Icons | `@phosphor-icons/react` — the icon set used by the Figma file (page "Icons", Phosphor contact sheet) |
| Fonts | Geist (body) and Space Grotesk (headings), self-hosted via `@fontsource-variable/*` |
| Routing | React Router 7 data router, route-level `lazy()` code splitting |
| Server state | TanStack Query 5 |
| Tables | TanStack Table 8 (`src/components/tables/data-table.tsx`) |
| Forms | react-hook-form + zod 4 |
| Toasts | sonner |
| Tests | Vitest + Testing Library (jsdom), Playwright (smoke) |

## Folder layout

```text
src/
  api/types/            Contract types per backend service (generated from the C# source, see docs/contracts)
  app/
    app.tsx             Providers: theme → query client → tooltip → auth → router
    layouts/            App shell: top bar, sidebar, breadcrumbs (Figma Dashboard frame)
    providers/          Theme, QueryClient defaults
    router/             Route table (lazy), nav config (Figma navigation), route error element
  components/
    ui/                 Primitives: Button, Input, Select, Badge, Card, Tabs, Dialog, ConfirmDialog, DropdownMenu…
    common/             Page header, stat cards, section card + toolbar, status badge, entity cell, logo, export
    forms/              FormField, FormError, ReasonDialog, PasswordInput
    tables/             DataTable (server or client pagination), SearchInput
    feedback/           Empty / error / permission-denied / backend-pending states, ErrorBoundary, skeletons
  config/env.ts         Typed environment
  features/<module>/    Screens per business module (pages + module components)
  hooks/                useApiMutation, useUrlState, useDebouncedValue
  lib/
    api/                HTTP client, error normalisation, envelope adapters, form error mapping
    auth/               Token store, AuthProvider, guards, useAccess
    permissions/        Permission requirement model
    utils/              Formatting, CSV, ids, cn
  services/             One module per backend area; the only place that knows URLs
  styles/globals.css    Design tokens (from Figma variables) + Tailwind theme
  test/                 Test setup and helpers (fetch mock, app renderer)
```

## Request pipeline

```
Screen → TanStack Query hook → services/*.service.ts → lib/api/client.ts (fetch)
                                         ↓                     ↓
                               envelope adapter          ApiError (normalised)
```

* **One HTTP client** (`lib/api/client.ts`): base URL, bearer token, `X-Correlation-Id`, timeout (30 s) and
  cancellation via `AbortSignal`, JSON / blob / text bodies, optional `X-Idempotency-Key` / `X-StepUp-Token`.
* **Refresh**: the access token lives in memory (15 min). On 401 the client runs **one** refresh for all
  concurrent requests (the backend revokes the whole session on refresh-token reuse, so parallel refreshes
  would sign the user out) and retries once. A gateway `403 forbidden_access` (revoked session) also
  triggers one refresh attempt. If refresh fails, `AuthProvider` ends the session and the login page shows
  "Your session has expired".
* **Error normalisation** (`lib/api/errors.ts`): the backend has at least six error shapes (gateway
  problem+json, identity ProblemDetails, `{error,message}`, `{errorCode,message}`, `{code}`, ASP.NET
  ValidationProblemDetails). Every one becomes `ApiError { kind, status, code, message, fieldErrors,
  requestId, retryAfterSeconds }`. 5xx messages are never shown verbatim.
* **Envelope adapters** (`lib/api/envelope.ts`): `{success,data}` and `{data}` are unwrapped explicitly by the
  services that use them; identity and catalog-moderation return bare DTOs. Nothing guesses.
* **Queries** retry only transient failures (network / timeout / 502-504) of GETs. **Mutations never retry**
  (`useApiMutation`), show success only after the API confirms, and invalidate the affected queries.
* **Optimistic concurrency** uses the backend's `expectedVersion` / `expectedRowVersion` body fields. 409
  conflicts are shown with a "reload and try again" message.

## Authentication & authorization

* Identity (`/api/v1/auth/*`) is token-in-body; no cookies are issued. Access token: memory only. Refresh
  token: `localStorage` (shared by all tabs, refreshes serialised with a Web Lock, sign-out in one tab ends the others) by default; `sessionStorage` with `VITE_REFRESH_TOKEN_STORAGE=session`.
  Tokens are never logged.
* Login supports the emailed-OTP MFA challenge (`mfaRequired` → `/auth/mfa/verify`, resend with cooldown).
* Sign-out revokes the current session explicitly with `DELETE /auth/sessions/{sid}` because
  `POST /auth/logout` does not revoke anything (backend defect, see contracts).
* The JWT carries no roles. Effective permissions come from `GET /platform/me/permissions` and roles from
  `GET /platform/me/roles` (user-organization). `useAccess().can(requirement)` drives menu visibility,
  buttons and `RequirePermission` page guards. **The backend re-checks every request**; the UI checks are
  only for usability.

## Data tables

`DataTable` supports both modes and never fakes the other:

* **Server pagination** (moderation queue, inspection queue, account activity): pass `pagination` with the
  server's `totalCount`; page/pageSize live in the URL (`useUrlState`) so refresh/back/deep links work.
* **Complete lists** (user-organization and catalog taxonomy endpoints return full arrays): omit
  `pagination`; the table paginates and sorts the loaded list client-side.

## Resilience

* `ErrorBoundary` at the app root and around every routed page (reset on navigation).
* `RouteError` as the router `errorElement` (also handles stale chunks after a deploy).
* Every list/detail renders explicit loading, empty, error (with retry and request id), and
  permission-denied states. Missing backend modules use `BackendPendingState` / disabled "Soon" menu items.

## Performance

Route-level code splitting, manual vendor chunks, query caching (30 s stale time, no focus refetch — the
`/auth/*` routes are rate-limited to 10 req/min per path), debounced search, request cancellation through
TanStack Query's `signal`.
