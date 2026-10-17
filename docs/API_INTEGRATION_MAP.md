# API integration map

All requests go through the gateway (`https://stockout.flowb.io`), path unchanged. Contracts with source citations:
`docs/contracts/*`. Service modules: `src/services/*`.

**Status legend** — **Integrated**: wired to the screen against the documented contract and covered by type
checks; **Tested**: also exercised by automated tests with mocked HTTP; **Live**: verified against the
running gateway. *No endpoint is marked Live: the gateway was not reachable from the build environment
(network policy), so live verification is still pending.*

| Module | Endpoint | Method | Auth / permission | Screen | Status |
|---|---|---|---|---|---|
| Auth | `/api/v1/auth/login` | POST | public | Login | Integrated, Tested |
| Auth | `/api/v1/auth/mfa/verify`, `/mfa/resend` | POST | public | Login → OTP step | Integrated, Tested (verify) |
| Auth | `/api/v1/auth/token/refresh` | POST | public (refresh token) | HTTP client / session restore | Integrated, Tested |
| Auth | `/api/v1/auth/sessions`, `/sessions/{sid}` | GET, DELETE | signed-in | Sign-out, Security → sessions | Integrated, Tested (restore) |
| Auth | `/api/v1/auth/logout-all` | POST | signed-in | Security | Integrated |
| Auth | `/api/v1/auth/password/forgot`, `/reset`, `/change` | POST | public / signed-in | Forgot, Reset, Security | Integrated |
| Auth | `/api/v1/auth/account/status`, `/account/activity` | GET | signed-in | Dashboard, Security | Integrated |
| Auth | `/api/v1/auth/mfa/status`, `/register`, `/confirm` | GET, POST | signed-in | Security → MFA | Integrated |
| Identity | `/api/v1/identity/me` | GET | signed-in | Session bootstrap | Integrated, Tested |
| Identity | `/api/v1/identity/admin/users/{id}/status` | PUT | signed-in (**no server check**) — UI gated by `platform-users.disable` | Team → user detail | Integrated |
| Platform | `/api/v1/platform/me/permissions`, `/me/roles` | GET | signed-in | Session bootstrap (menu gating) | Integrated, Tested |
| Platform | `/api/v1/users/me` | GET, PUT | signed-in | My profile | Integrated |
| Platform | `/api/v1/platform/users`, `/{id}`, `/{id}/roles`, `/{id}/disable`, `/{id}/enable` | GET, PUT, POST | platform-users.*, roles.assign | Team → Users | Integrated |
| Platform | `/api/v1/platform/users/invitations` (+ `/batch`, `/{id}`, `/{id}/resend`, `/{id}/revoke`) | GET, POST | platform-users.view/invite/update | Team → Invitations | Integrated |
| Platform | `/api/v1/platform/permissions` | GET | permissions.view | Team → Role detail | Integrated |
| Platform | `/api/v1/platform/roles` (+ `/assignable`, `/{id}`, `/{id}/permissions`) | GET, POST, PUT, DELETE | roles.* | Team → Roles | Integrated |
| Platform | `/api/v1/platform/admins`, `/{id}/roles`, `/{id}/roles/{code}` | GET, POST, DELETE | role PlatformSuperAdmin | Team → Platform admins | Integrated |
| Platform | `/api/v1/platform/settings` (+ `/{key}`, `/{key}/reset`) | GET, PUT, POST | settings.view/update | Settings | Integrated |
| Platform | `/api/v1/platform/feature-flags` (+ `/{key}`, `/{key}/reset`) | GET, PUT, POST | feature-flags.view/update | Settings | Integrated |
| Sellers | `/api/v1/admin/marketplace/sellers` | GET | sellers.view | Sellers, Approvals, Dashboard | Integrated, Tested |
| Sellers | `/api/v1/admin/marketplace/sellers/{id}/verify` | POST | sellers.verify / sellers.reject | Sellers | Integrated, Tested (approve) |
| Sellers | `/api/v1/admin/marketplace/sellers/{id}/suspend` | POST | sellers.suspend | Sellers | Integrated |
| Catalog | `/api/v1/admin/catalog/categories` (+ `/{id}`, deactivate, reactivate, attributes, brands, conditions, units) | GET, POST, PUT | catalog.categories.*, catalog.category-*.* | Catalog → Categories, Category detail | Integrated |
| Catalog | `/api/v1/admin/catalog/attributes` (+ options, deactivate, reactivate) | GET, POST, PUT | catalog.attributes.* | Catalog → Attributes | Integrated |
| Catalog | `/api/v1/admin/catalog/brands` (+ deactivate, reactivate) | GET, POST, PUT | catalog.brands.* | Catalog → Brands | Integrated |
| Catalog | `/api/v1/admin/catalog/units` (+ deactivate, reactivate) | GET, POST, PUT | catalog.units.* | Catalog → Units | Integrated |
| Catalog | `/api/v1/admin/catalog/conditions` (+ grades, deactivate, reactivate) | GET, POST, PUT | catalog.conditions.* | Catalog → Conditions | Integrated |
| Catalog | `/api/v1/admin/catalog/grades` (+ deactivate, reactivate) | GET, POST, PUT | catalog.grades.* | Catalog → Grades | Integrated |
| Catalog | `/api/v1/admin/catalog/inspection-templates` (+ `/{id}`, activate, deactivate, items) | GET, POST, PUT | inspections.templates.manage | Catalog → Inspection templates | Integrated |
| Moderation | `/api/v1/admin/catalog/listings/moderation/queue` | GET (paged) | catalog:listings:review | Listings, Approvals, Dashboard | Integrated |
| Moderation | `…/listings/{id}/versions/{vid}/moderation` (+ `/decide`) | GET, POST | catalog:listings:review / approve | Listing review | Integrated |
| Publication | `…/versions/{vid}/publication-eligibility`, `/publish` | GET, POST | catalog:listings:view / publish | Listing review | Integrated |
| Publication | `…/listings/{id}/suspend`, `/republish`, `/rollback`, `/publication-history` | POST, GET | catalog:listings:suspend / publish / view | Listing review | Integrated |
| Inspections | `/api/v1/admin/catalog/inspections/queue` | GET (paged) | inspections.view | Inspections, Approvals, Dashboard | Integrated |
| Inspections | `/api/v1/admin/catalog/inspections` (+ `/{id}`, assign, reassign, start, responses, evidence, complete, cancel, authorize-reinspection) | GET, POST, PUT, DELETE | inspections.view / assign / perform / override | Inspection detail | Integrated |
| Files | `/api/v1/files/upload-requests`, `/{id}/complete`, `/{id}`, `/{id}/download-url` | POST, GET | signed-in (owner-scoped) | Profile photo, inspection evidence | Integrated |
| Notifications | `/api/v1/admin/notification-templates` (+ `/{code}/{channel}`, versions, activate, retire) | GET, POST, PUT | notification-templates.* | Notifications | Integrated |

## Routed by the gateway but not implemented by the backend (blockers)

| Gateway route | Service | Figma screens waiting on it |
|---|---|---|
| `/api/v1/deals/*` | bidding-deal | Bids & Deals |
| `/api/v1/payments/*` | subscription-payment | Payments & Payouts |
| `/api/v1/messages/*` | conversation-realtime | Support & Disputes |
| `/api/v1/workflows/*` | workflow-scheduler | Tasks & Workflows |
| `/api/v1/audit/*` | audit-reporting | Audit Log, Reports |
| `/api/v1/realtime/*` | realtime-gateway | Notifications bell, live activity |
| `/api/v1/public/*`, `/api/v1/portal/*` | BFFs | — |
| (none) | — | Orders, Delivery, Buyers, Inspectors list, Price Guidance, Buyer Requests, Green Points, Content & Banners, Integrations |
