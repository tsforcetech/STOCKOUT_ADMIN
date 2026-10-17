# Screen implementation plan

Legend — **Backend**: ✅ endpoints exist · ⚠️ exist with known defects (see IMPLEMENTATION_REPORT) · ❌ no API.

| Route | Screen | Figma frame | Backend | Permission | Notes |
|---|---|---|---|---|---|
| `/login` | Sign in (+ emailed OTP step) | Login 385:2169, Login Reset Password Otp 660:32253 | ✅ identity `/auth/login`, `/auth/mfa/*` | public | Lockout/disabled/rate-limit messages mapped from ProblemDetails title |
| `/forgot-password`, `/reset-password` | Password recovery | Login section 660:33415 | ✅ `/auth/password/forgot|reset` | public | Anti-enumeration response kept |
| `/` | Dashboard | Dashboard 191:1967 | ✅ (aggregated) | any signed-in | Only real counts: moderation queue, sellers, inspection queue per status, platform users, own activity. GMV/tonnes/orders omitted (no API) |
| `/approvals` | Approvals hub | Approvals 400:2645 | ✅ | catalog:listings:review / sellers.view / inspections.view | Tabs: Listings, Seller KYC, Inspections. "Finance" tab omitted (no API) |
| `/listings` | Listing moderation queue | Listings 438:10207 | ✅ server-paginated | catalog:listings:review | No "all listings" admin API — queue only + open by ID |
| `/listings/:id/versions/:vid` | Listing review & publication | Approval drawer 409:6712 | ⚠️ publish media-owner check | catalog:listings:* | Decide, eligibility gates, publish/suspend/republish/rollback, history |
| `/catalog/categories` (+ `/:id`) | Categories & mappings | Categories 440:11247, Categories Updated 990:42389 | ⚠️ category units PUT | catalog.categories.* | Tree, filters, attribute/brand/condition/unit mappings |
| `/catalog/attributes` | Attributes & options | Categories → Attributes tab | ✅ | catalog.attributes.* | |
| `/catalog/brands` | Brands | — (same template) | ✅ | catalog.brands.* | |
| `/catalog/units` | Units | Categories → Units tab | ✅ | catalog.units.* | |
| `/catalog/conditions`, `/catalog/grades` | Conditions & grades | — (same template) | ✅ | catalog.conditions.*, catalog.grades.* | |
| `/catalog/templates` | Inspection templates | Categories → Templates tab | ⚠️ list returns empty items | inspections.templates.manage | Detail fetched for items |
| `/sellers` | Sellers & KYC | Sellers 444:15548 | ⚠️ list returns partial fields | sellers.* | Approve/reject KYC, suspend; no unsuspend API |
| `/inspections` (+ `/:id`) | Inspection queue & workspace | Inspections 543:12904 | ⚠️ responses not persisted | inspections.* | Assign, start, checklist, evidence upload, complete, cancel, re-inspection |
| `/notifications` | Notification templates | Notifications (Growth) | ✅ | notification-templates.* | Versioned drafts, activate, retire |
| `/team/users` (+ `/:id`) | Platform users | Team & Access 722:33694 | ⚠️ role codes empty in list | platform-users.* | Enable/disable, replace roles, account status |
| `/team/invitations` | Invitations | Team & Access | ✅ | platform-users.view/invite/update | Single + batch (≤100), resend, revoke |
| `/team/roles` (+ `/:id`) | Roles & permission matrix | Team & Access | ✅ | roles.* | System roles protected |
| `/team/admins` | Platform admins | Team & Access | ✅ | role PlatformSuperAdmin | Last super admin protected |
| `/settings` | Platform settings & feature flags | Settings 860:38118 | ✅ | settings.*, feature-flags.* | Typed editors, optimistic concurrency, reset |
| `/account` | My profile | My Profile 831:33943 | ⚠️ null photo deletes file | signed-in | Photo upload via presigned S3 |
| `/account/security` | Password, sessions, MFA, activity | My Profile | ⚠️ MFA disable broken | signed-in | Password change signs out everywhere (backend behaviour) |
| `*` | 404 | Error & Unauthorised 660:33534 | — | — | |

## Figma screens without backend support (shown as disabled "Soon" menu items)

Tasks & Workflows · Price Guidance · Buyer Requests · Bids & Deals · Buyers · Inspectors (list) · Orders ·
Delivery · Payments & Payouts · Green Points · Support & Disputes · Content & Banners · Reports ·
Integrations · Audit Log. The gateway routes `/api/v1/deals`, `/payments`, `/messages`, `/workflows`,
`/audit`, `/realtime` exist but their services only expose `/system/version`.
