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
| Moderation media (F2-E) | `…/listings/{id}/versions/{vid}/media/{listingMediaAssetId}/download-url`; `mediaAssets[].downloadUrl` in the moderation detail | GET | catalog:listings:review | Listing review photos (15-min URLs, refreshed on expiry or error) | Integrated, verified live 21 Oct |
| Seller detail (F2-I / L16) | `/api/v1/admin/marketplace/sellers/{id}` | GET (enveloped) | sellers.view | Seller review panel: legal name, registration no., country, currency | Integrated, verified live 22 Oct |
| Seller KYC documents (F2-E) | `/api/v1/admin/marketplace/sellers/{id}/documents` (+ `/{documentId}/download-url`) | GET (enveloped) | sellers.view | Seller review panel (Sellers, Approvals) | Integrated, verified live 21 Oct |
| Seller document review (PA-1B.1-R2) | `/api/v1/admin/marketplace/sellers/{id}/documents/{documentId}/review` — `{ action: VERIFY\|REJECT, reviewRemark, verifiedSignatoryId, verifiedSignatoryAuthorityProof, reclassifiedDocumentType }` | POST (enveloped) | sellers.verify (VERIFY) / sellers.reject (REJECT) | Seller review → KYC documents → Review: remark required to reject; reviewer confirms signatory ID / authority; generic VAT uploads must be reclassified | Integrated 26 Oct (UI verified live read-only; no decision submitted) |
| Seller verification history (PA-1B.1) | `/api/v1/admin/marketplace/sellers/{id}/history` | GET (enveloped) | sellers.view | Seller review → Verification history | Integrated, verified live 26 Oct |
| Seller KYC profile + approval checks (PA-1B.1) | `/api/v1/admin/marketplace/sellers/{id}` (licence dates, VAT/TRN, signatory, contact, address, bank, `missingDocumentCategories`, `pendingPolicies`) and `/verify` `{ action, expectedRowVersion, reason }` | GET / POST | sellers.view / verify / reject | Seller review: profile, "Approval checks" (licence expiry, verified categories, reviewer-confirmed signatory, VAT classification, policies); reject now asks for a reason | Integrated 26 Oct |
| Business changes (PA-1B.2) | `/api/v1/admin/organizations/business-changes` (`status`, `changeCategory`, `overdueOnly`, `pageNumber`, `pageSize`; paged `{items,totalCount,pageNumber,pageSize}`), `/{id}/approve {reviewNotes}`, `/{id}/reject {rejectionReason}` | GET, POST | organizations.business_changes.view / approve / reject | Business changes page: queue, detail, approve/reject, KYC re-check warning; deadlines in GST from the server | Integrated 27 Oct (queue verified live, empty) |
| UAE calendar (PA-1B.2) | `/api/v1/admin/calendar/configuration` (GET/PUT `{weekendDays, maxApprovedYear, isActive, changeReason}`), `/holidays?year=`, `/holidays/{id}/confirm` (structured evidence + `attestationConfirmed`) | GET, PUT, POST | organizations.calendar.view / manage / holidays.confirm | UAE calendar page | Integrated 27 Oct (config + holidays verified live; no edits made) |
| Sign-out (B3) | `POST /api/v1/auth/logout {refreshToken}`, fallback `DELETE /api/v1/auth/sessions/{sid}` | POST, DELETE | signed in | Account menu → Sign out | Integrated; live logout still 400 (backend B3) |
| Policies (PA-1A) | `/api/v1/policies?lang=`, `/api/v1/policies/{code}?lang=`, `/api/v1/policies/admin/revisions`, `/api/v1/policies/admin/revisions/{revisionId}/publish` | GET (public), POST | policies.view / policies.manage (create draft) / policies.publish | Policies page: list + full text, "New revision" (start from published text, Markdown preview), drafts list + Publish. No API lists drafts, so drafts created from this browser are kept in localStorage | Integrated 26 Oct (list verified live; no revision created) |
| Eligible inspectors (F2-H) | `/api/v1/platform/inspectors/eligible` (`search`, `page`, `pageSize` ≤ 100, `includeUserId`) | GET (enveloped) | inspections.assign / .override / .view or platform-users.view | Assign / Reassign inspector picker | Integrated, verified live 22 Oct |
| Inspection evidence (F2-E) | `/api/v1/admin/catalog/inspections/{id}/evidence/{evidenceId}/download-url` | GET | admin, or the assigned inspector | Inspection evidence "Open" + photo thumbnails | Integrated; live check pending (no evidence on server yet) |
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
