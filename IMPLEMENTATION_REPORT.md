# Stockout Admin — Implementation report

**Status:** all backend-supported admin modules are implemented against the documented API contracts,
type-checked, linted, built, and covered by automated tests with mocked HTTP. **No screen has been
verified against the live gateway yet**: `stockout.flowb.io` (and figma.com assets) were blocked by the
build environment's network policy. Live verification with a real admin account is the main remaining step.

## Screens

"Tested" = automated test exercises the screen; "—" = compile/lint-checked only.

| Screen | UI completed | API connected | Tested | Issues |
|---|---|---|---|---|
| Login (+ OTP, forgot, reset) | Yes | Yes | Yes — unit/integration + Playwright | Identity returns no error codes; messages mapped from status/title |
| App shell (sidebar, top bar, ⌘K, breadcrumbs, 404, error boundary) | Yes | Yes (permissions) | Yes — guards + Playwright (deep link, refresh, 404, nav gating, no overflow, mobile) | — |
| Dashboard | Yes | Yes | Playwright render | Only real metrics; Figma GMV/tonnes/orders have no API |
| Approvals | Yes | Yes | — | No combined backend queue; three tabs instead |
| Listings (moderation queue) | Yes | Yes | — | No admin "all listings" API |
| Listing review & publication | Yes | Yes | — | ⚠ Publish likely fails media-ownership gate (backend) |
| Sellers | Yes | Yes | Yes — list, approve flow, error state | List lacks contact/GMV fields; no unsuspend API |
| Catalog: categories (+ detail/mappings) | Yes | Yes | — | ⚠ Category units PUT fails for non-empty list (backend) |
| Catalog: attributes, brands, units, conditions, grades | Yes | Yes | — | No field-level validation from server (client-side zod instead) |
| Catalog: inspection templates | Yes | Yes | — | List returns empty items (detail fetched) |
| Inspections (queue + workspace) | Yes | Yes | — | ⚠ Checklist responses not persisted by backend → completion blocked for required items |
| Notification templates | Yes | Yes | — | — |
| Team: users, invitations, roles, admins | Yes | Yes | — | ⚠ User list role codes empty (backend); role editor replaces full set |
| Settings: platform settings & feature flags | Yes | Yes | — | — |
| My profile | Yes | Yes | — | Photo cannot be removed (backend deletes file on null) |
| Security: password, sessions, MFA, activity | Yes | Yes | — | ⚠ MFA disable broken (backend) → not offered |
| Orders, Delivery, Payments, Bids & Deals, Buyers, Inspectors, Tasks, Price Guidance, Buyer Requests, Green Points, Support, Content, Reports, Integrations, Audit Log | Menu only ("Soon") | No — **no backend API** | — | Blocked on backend |

## Test results (this build)

| Suite | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 problems) |
| `npm test` (Vitest) | **47 passed**, 9 files — HTTP client (single-flight refresh, revoked-session 403, timeout, network), error normalisation for every backend error shape, envelopes, permissions, token storage, CSV injection guard, UTC dates, route guards & session restore, login + MFA, sellers list/approve/error |
| `npm run test:e2e` (Playwright, Chromium desktop + Pixel 7) | **11 passed**, 1 skipped (desktop-only sidebar check on mobile). API intercepted with `page.route` — verifies the built app's routing/auth wiring/layout, not live backend behaviour |
| `npm run build` | pass; route-level chunks, main entry 268 kB (84 kB gzip) |

Bugs found and fixed by the tests: password label not associated with its input (accessibility); reloading
the page while the session was being restored signed the user out.

## Backend defects and blockers (for the API team)

Severity-ordered; details and file:line citations in `docs/contracts/`.

1. **Security — `PUT/POST /api/v1/identity/admin/users/.../status` has no authorization**: any signed-in user can lock or close any account. Also `/identity/service-clients/*` and `GET /identity/users/{id}` lack admin checks.
2. **Security — committed secrets**: `services/identity-access/.../appsettings.json` contains a JWT signing key, SMTP password and DB credentials.
3. **Security — `PUT /platform/users/{id}/roles`** lets non-super-admins grant `PlatformSuperAdmin`.
4. `POST /auth/logout` does not revoke the session (UI uses `DELETE /auth/sessions/{sid}`).
5. `POST /auth/mfa/disable` always returns 422 (hash comparison bug).
6. `PUT /admin/catalog/inspections/{id}/responses` returns 200 but stores nothing (PascalCase vs camelCase JSON in SQL).
7. Publish/republish/rollback media gate compares file owner with seller id → probably always "not ready".
8. `PUT /admin/catalog/categories/{id}/units` fails for any non-empty list (same JSON casing bug).
9. `GET /platform/users` returns empty `roles[].code/name`; `/roles/assignable` never detects super admins.
10. `DELETE /marketplace/sellers/{id}/documents/{docId}` returns 404 after deleting.
11. Admin seller list returns placeholder values for most fields; no unsuspend endpoint.
12. ProblemDetails errors from identity and user-organization drop machine-readable error codes.
13. `/api/v1/auth/*` (including token refresh) shares a 10 req/min per IP+path limit.
14. Gateway CORS is `AllowAnyOrigin` (TODO in code) — restrict to the admin origin before production.

## Known frontend limitations

* Figma raster assets (logo, login photo) still need exporting to `src/assets/brand/` — text wordmark meanwhile.
* No notification bell / global data search: no backend APIs.
* Refresh token persists in `sessionStorage` (backend issues body tokens, no HttpOnly cookie). Moving to an
  HttpOnly refresh cookie on the backend would remove browser token exposure; only `token-store.ts` changes.
