# Catalog-Listing: moderation, publication, inspections (admin contract)

Source repo: `/home/user/stockout`, service `services/catalog-listing`. All paths below are relative to
`services/catalog-listing/` unless they start with `services/`. Abbreviations:

- `API/` = `src/Emcore.CatalogListing.Api/`
- `APP/` = `src/Emcore.CatalogListing.Application/`
- `CON/` = `src/Emcore.CatalogListing.Contracts/`
- `INF/` = `src/Emcore.CatalogListing.Infrastructure/`
- `SQL/` = `Emcore.CatalogListing.Migrator/Migrations/Versioned/`

TypeScript types: `src/api/types/catalog-moderation.ts`.

---

## 1. Global conventions

### 1.1 Transport and JSON
- `Program.cs` calls `AddControllers()` with **no** `AddJsonOptions` (API/Program.cs:31-42). So the ASP.NET Core web defaults apply:
  - **camelCase** property names. Request bodies are read case-insensitively.
  - Numbers given as strings are also accepted when reading (web default `AllowReadingFromString`).
  - **No C# enums appear in any in-scope DTO.** Every status and code is a C# `string` filled from SQL string constants, so it is always serialized as a string.
  - Null properties **are written** as `null`. They are never omitted.
  - `Guid` is serialized as a lowercase hyphenated string. `decimal` is a JSON number.
  - `DateTime` values read from SQL by Dapper have `Kind=Unspecified`, so they serialize **without a `Z`/offset**, for example `"2026-10-17T08:30:12.1234567"`. All of them are UTC (the procedures use `GETUTCDATE()`). The frontend must treat a value with no offset as UTC. A few values come from `DateTime.UtcNow` and **do** carry a `Z`, for example the public detail `publishedAtUtc` fallback (APP/Publication/ListingPublicationService.cs:978).
  - `rowVersion` / `expectedRowVersion` are **Base64 strings** of SQL `ROWVERSION` (8 bytes).
- **No response envelope.** Every in-scope endpoint returns the DTO directly with `Ok(dto)` or `StatusCode(201, dto)`. There is **no `{success, data}`**. `ApiResponse<T>` exists in CON/Responses/ApiResponse.cs:3 but these controllers do not use it.
- Route parameters are all `:guid`-constrained. A non-GUID segment does not match the route, so the response is **404 from routing with an empty body**.

### 1.2 Authentication
- The gateway forwards the request and sets `X-User-Id` (plus optional `X-Session-Id`, `X-User-Email`, `X-Email-Verified`). `GatewayHeaderAuthenticationHandler` builds the principal from those headers (`services/../building-blocks/Emcore.BuildingBlocks.Security/SecurityTypes.cs:54-88`). The admin frontend sends its Bearer token to the gateway as usual.
- If the header is missing, `[Authorize]` returns **401 with an empty body**.

### 1.3 Admin permission enforcement
- `[RequiresPlatformPermission("<code>")]` (API/Authorization/RequiresPlatformPermissionAttribute.cs:11-50) calls user-organization `GET /api/internal/permissions/check?userId&permissionCode` (INF/Authorization/PlatformAuthorizationService.cs:45-70).
  - Not authenticated, or the NameIdentifier claim is not a GUID: **401, empty body** (`UnauthorizedResult`).
  - Permission missing, or the check call failed (fail-closed): **403** `{"error":"FORBIDDEN","message":"Insufficient permissions."}`.
- All permission codes are seeded in `services/user-organization/.../026_InspectionPermissions.sql` and `027_Stage5F_ModerationPublicationPermissions.sql`:
  `catalog:listings:view`, `catalog:listings:review`, `catalog:listings:approve`, `catalog:listings:publish`, `catalog:listings:suspend`, `inspections.view`, `inspections.assign`, `inspections.perform`, `inspections.override`, `inspections.templates.manage`.
- Some endpoints run extra permission checks inside the service. These are listed per endpoint (for example `inspections.override` for waivers and supervisor override, and `inspections.perform` for the target inspector).

### 1.4 Headers
- **No admin endpoint in scope reads `X-Idempotency-Key` or `X-StepUp-Token`.** Nothing enforces them, so sending them is harmless.
- `X-Idempotency-Key` is required only on the seller endpoints `POST /marketplace/sellers/{sellerId}/listings` and `.../submit` (API/Controllers/MarketplaceListingsController.cs:45-59, 101-116). Those are out of scope.
- Optimistic concurrency is carried **in the body** (`expectedRowVersion`), or in the **query string** for evidence DELETE. ETag / If-Match are not used.

### 1.5 Error shape and codes
`ErrorResponse` (CON/Responses/ApiResponse.cs:9-13):
```json
{ "error": "CODE", "message": "text or null" }
```
- `MarketplaceExceptionFilter` (API/Filters/MarketplaceExceptionFilterAttribute.cs:11-50) maps errors as follows:
  - `MarketplaceListingException`: the exception's own status code, with `error` set to its code.
  - `UnauthorizedAccessException`: **401** `UNAUTHORIZED`.
  - Anything else: **500** `INTERNAL_SERVER_ERROR`.
- Model-binding and validation failures, including a malformed JSON body, a missing body, an unparseable GUID or date in the query, or a **missing or empty non-nullable string property** (see 1.6), return **400** `{"error":"INVALID_DATA","message":"Validation failed"}` (API/Program.cs:34-41).
- SQL errors are mapped by **two different mappers**:
  - Moderation and publication use INF/Repositories/Listings/MarketplaceSqlExceptionMapper.cs:24-117.
  - Inspections and templates use INF/Repositories/Listings/ListingInspectionRepository.cs:26-210.
  - In both, any unmapped SQL error (for example a CHECK or UNIQUE violation) becomes **500** `MARKETPLACE_LISTING_INTERNAL_ERROR`, and the message contains `Database error: ...` for the moderation mapper.

Moderation and publication SQL codes (MarketplaceSqlExceptionMapper.cs):

| SQL# | HTTP | error |
|---|---|---|
| 50800 | 409 | MARKETPLACE_LISTING_VERSION_CONFLICT (rowVersion mismatch) |
| 50801 | 409 | MARKETPLACE_LISTING_VERSION_OWNERSHIP_INVALID |
| 50802 | 409 | MARKETPLACE_LISTING_NOT_READY_FOR_SUBMISSION |
| 50803 | 409 | MARKETPLACE_LISTING_TRANSITION_INVALID |
| 50804 | 400 | MARKETPLACE_MODERATION_REASON_REQUIRED |
| 50805 | 409 | MARKETPLACE_LISTING_NOT_READY_FOR_PUBLICATION |
| 50806 | 409 | MARKETPLACE_LISTING_INSPECTION_NOT_PASSED |
| 50807 | 409 | MARKETPLACE_LISTING_NOT_PUBLISHED |
| 50808 | 409 | MARKETPLACE_LISTING_RESERVATION_ACTIVE |
| 50809 | 403 | MARKETPLACE_SELLER_RESUME_BLOCKED |
| 50810 | 403 | MARKETPLACE_MODERATION_ACCESS_DENIED |
| 50811 / 50720 | 404 | MARKETPLACE_LISTING_NOT_FOUND |
| 50812 | 404 | MARKETPLACE_LISTING_VERSION_NOT_FOUND |
| 50721 | 404 | MARKETPLACE_INSPECTION_TEMPLATE_NOT_FOUND |
| 50732 | 409 | MARKETPLACE_INSPECTION_ALREADY_ACTIVE |
| 50737 | 409 | MARKETPLACE_INSPECTION_LISTING_VERSION_MISMATCH |

Inspection SQL codes (ListingInspectionRepository.cs:34-207). For all of these the `message` equals the `error` code.

| SQL# | HTTP | error |
|---|---|---|
| 50700 | 400 | MARKETPLACE_INSPECTION_ROW_VERSION_INVALID |
| 50701 | 400 | MARKETPLACE_INSPECTION_REQUEST_INVALID |
| 50702 | 400 | MARKETPLACE_INSPECTION_CHECKLIST_INCOMPLETE |
| 50703 | 400 | MARKETPLACE_INSPECTION_CHECKLIST_ITEM_REQUIRED |
| 50704 | 400 | MARKETPLACE_INSPECTION_RESULT_INVALID |
| 50705 | 400 | MARKETPLACE_INSPECTION_FAILURE_DETAILS_REQUIRED |
| 50706 | 400 | MARKETPLACE_INSPECTION_EVIDENCE_TYPE_INVALID |
| 50710 | 403 | MARKETPLACE_INSPECTION_ACCESS_DENIED |
| 50711 | 403 | MARKETPLACE_INSPECTOR_NOT_ASSIGNED |
| 50720 | 404 | MARKETPLACE_INSPECTION_NOT_FOUND (also raised for "listing version not found" on create) |
| 50721 | 404 | MARKETPLACE_INSPECTION_TEMPLATE_NOT_FOUND |
| 50722 | 404 | MARKETPLACE_INSPECTION_RESPONSE_NOT_FOUND |
| 50723 | 404 | MARKETPLACE_INSPECTION_EVIDENCE_NOT_FOUND |
| 50730 | 409 | MARKETPLACE_INSPECTION_VERSION_CONFLICT |
| 50731 | 409 | MARKETPLACE_INSPECTION_TRANSITION_INVALID |
| 50732 | 409 | MARKETPLACE_INSPECTION_ALREADY_ACTIVE |
| 50733 | 409 | MARKETPLACE_INSPECTION_CANNOT_PASS_FAILED_ITEMS |
| 50734 | 409 | MARKETPLACE_INSPECTION_COMPLETED_IMMUTABLE |
| 50735 | 409 | MARKETPLACE_INSPECTION_REINSPECTION_INVALID |
| 50736 | 409 | MARKETPLACE_INSPECTION_ASSIGNMENT_CONFLICT |
| 50737 | 409 | MARKETPLACE_INSPECTION_LISTING_VERSION_MISMATCH |
| 50738 | 409 | MARKETPLACE_INSPECTION_ASSIGNMENT_REQUIRED |
| 50739 | 409 | MARKETPLACE_INSPECTION_EVIDENCE_REQUIRED |
| 50740 | 409 | MARKETPLACE_INSPECTION_TEMPLATE_ACTIVE_CONFLICT (also raised for a duplicate template `code`) |

Other codes raised in services:
- `INVALID_DATA` (400)
- `INVALID_ROW_VERSION` (400): moderation and publication, when the value is not Base64
- `MARKETPLACE_INSPECTION_ROW_VERSION_INVALID` (400): inspections and templates, when the value is not Base64 or is not exactly 8 bytes
- `SERVICE_UNAVAILABLE` (503)
- `MARKETPLACE_LISTING_DEPENDENCY_UNAVAILABLE` (503): media or seller service down
- `MARKETPLACE_SELLER_ACCESS_DENIED` (403)

### 1.6 Implicit required properties (framework behavior; flagged)
- `<Nullable>enable</Nullable>` is set in the Api and Contracts csproj, and the controllers use `[ApiController]`. Under those conditions ASP.NET Core adds an implicit `[Required]` to every **non-nullable `string`** body property.
- An omitted property or `""` therefore returns 400 `INVALID_DATA` / `Validation failed` **before** the service's own checks run.
- In practice the service-level messages such as "ExpectedRowVersion is required." are only reachable for whitespace-only strings.
- The rule is not written explicitly in the C# source; it follows from the framework defaults.
- Non-nullable strings that are therefore required in requests: every `expectedRowVersion`, `decision`, suspend and rollback `reasonCode`, `result`, cancel `reasonCode`, template `code`/`name`, item `itemCode`/`label`/`responseType`, attach `evidenceType`, and the DELETE query `expectedRowVersion`.
- A `[FromBody]` parameter also needs a non-empty body. For `authorize-reinspection`, send at least `{}`.

### 1.7 Paging
- The moderation queue uses `page` (default 1) and `pageSize` (default 20). The inspection queue uses the same two names.
- In SQL, values below 1 are reset to the defaults (page 1, pageSize 20) and `pageSize` is capped at **100** (SQL/036...:609-611, SQL/034...:236-238).
- The response's `page` and `pageSize` **echo the raw request values, not the clamped ones** (APP/Moderation/ListingModerationService.cs:144-145, APP/Inspections/ListingInspectionService.cs:285-286). For example, a request with pageSize=500 returns 100 rows but reports `pageSize: 500`.
- Inspection queue `totalCount` is read from `COUNT(*) OVER()` on the first row. On an empty page past the end, `totalCount` is therefore **0** (INF/.../ListingInspectionRepository.cs:301).
- There is no sort parameter on either admin queue.
- Pagination shape: `{ totalCount, page, pageSize, items }`. Property order differs between the two queues, but the names are identical.

---

## 2. Enumerations (exact serialized strings)

| Concept | Values | Source |
|---|---|---|
| Listing (aggregate) status | `DRAFT` `PUBLISHED` `SUSPENDED` `EXPIRED` `ARCHIVED` | Domain/Listings/ListingStatus.cs:5-9 |
| Listing version status | `DRAFT` `UNDER_REVIEW` `CHANGES_REQUIRED` `APPROVED` `INSPECTION_REQUIRED` `REJECTED` `PUBLISHED` `SUPERSEDED` `ARCHIVED` | Domain/Listings/ListingVersionStatus.cs:5-13 |
| Moderation decision | `APPROVE` `REQUEST_CHANGES` `REJECT` | Domain/Moderation/ModerationDecision.cs:5-7 |
| Publication history action | `INITIAL_PUBLISH` `VERSION_UPDATE` `REPUBLISH_AFTER_SUSPENSION` `ROLLBACK` | Domain/Publication/PublicationHistoryAction.cs:5-8 |
| Suspension reason code (constants; **not validated** server-side, any non-empty string is accepted) | `SELLER_REQUESTED_PAUSE` `ADMINISTRATIVE_SUSPENSION` `POLICY_VIOLATION` `COUNTERFEIT_INVESTIGATION` `SELLER_ACCOUNT_SUSPENDED` `ADMINISTRATIVE_HOLD` | Domain/Publication/SuspensionReasonCode.cs:5-10 |
| Pricing mode | `FIXED_PRICE` `BIDDING` `BOTH` | APP/Listings/MarketplaceListingService.cs:281 |
| Inspection status | `PENDING` `ASSIGNED` `IN_PROGRESS` `COMPLETED` `CANCELLED` | SQL/033...:113 |
| Inspection result | `PASS` `FAIL` `REINSPECTION_REQUIRED` (null unless COMPLETED) | SQL/033...:114 |
| Checklist item response type | `PASS_FAIL` `YES_NO` `TEXT` `NUMBER` `SINGLE_SELECT` `MULTI_SELECT` | SQL/033...:70 |
| Inspection response itemResult | `PASS` `FAIL` `NOT_APPLICABLE` | SQL/033...:163 |
| Evidence type | `IMAGE` `DOCUMENT` | SQL/033...:188, SQL/034 (attach proc) |
| Inspection status-history action | `CREATED` `ASSIGNED` `STARTED` `COMPLETED` `CANCELLED` | SQL/034 + SQL/036 inserts |
| Assignment history reasonCode on first assign | `MANUAL_ASSIGNMENT` (free text on reassign) | SQL/034...:338 |
| Listing media type | `IMAGE` `DOCUMENT` | SQL/029...:22 |
| Publication gate keys | `sellerStanding` `versionModeration` `inspectionCompliance` `catalogCompleteness` `inventoryAvailability` `mediaAvailability` `aggregateState` | CON/Publication/PublicationDtos.cs:15-24 |

Additional notes:
- `passFailValue` is `VARCHAR(10)` with no CHECK constraint, so its allowed values are **not defined** server-side. It is ambiguous; `PASS`/`FAIL` is the natural choice.
- `inspectionNo` has the format `INSP-YYYY-NNNNNN`.
- `listingNumber` has the format `LST-` followed by the first 8 hex digits of the GUID in upper case (APP/Publication/ListingPublicationService.cs:768-776).

---

## 3. Moderation endpoints (API/Controllers/AdminListingModerationController.cs)

### GET `/api/v1/admin/catalog/listings/moderation/queue`. Permission `catalog:listings:review` (l.40-63)
- Query parameters:
  - `categoryId?` (guid), `sellerId?` (guid)
  - `submittedFromUtc?` and `submittedToUtc?` (ISO date-time)
  - `requiresInspectionOnly?` (bool). This is an **equality filter**: `false` returns only categories that do NOT require inspection.
  - `page=1`, `pageSize=20` (max 100)
- Items are the listing's **current draft version** with status `UNDER_REVIEW`, ordered by `submittedAtUtc ASC` (oldest first). `submittedAtUtc` is the version's `UpdatedAtUtc` (SQL/036...:597-671).
- 200 `ListingModerationQueueResponse` `{ totalCount, page, pageSize, items: ListingModerationQueueItem[] }` (CON/Moderation/ModerationDtos.cs:44-66).

### GET `/api/v1/admin/catalog/listings/{listingId}/versions/{versionId}/moderation`. Permission `catalog:listings:review` (l.65-74)
- 200 `ListingModerationDetailResponse` (ModerationDtos.cs:68-154) with these fields:
  - `candidateVersion`
  - `candidateAttributes[]`
  - `mediaAssets[]`: `fileAssetId` refers to inventory-media. Download with `/api/v1/files/{id}/download-url`.
  - `publishedVersion | null`
  - `publishedAttributes[]`
  - `history[]`: includes `internalNotes`, newest first
- **This works for any version of the listing**, not only `UNDER_REVIEW` ones. It is the only admin endpoint that returns `candidateVersion.listingRowVersion`, and that value is the `expectedRowVersion` needed by decide, publish, suspend, republish and rollback. To suspend, roll back or republish, call this endpoint with the listing's `publishedVersionId` to obtain the current listing rowVersion.
- 404 `MARKETPLACE_LISTING_NOT_FOUND` if the version does not belong to the listing (APP/Moderation/ListingModerationService.cs:169-173).

### POST `/api/v1/admin/catalog/listings/{listingId}/versions/{versionId}/moderation/decide`. Permission `catalog:listings:approve` (l.76-87)
Body `ModerationDecisionRequest` (ModerationDtos.cs:21-29):
```json
{ "decision": "APPROVE|REQUEST_CHANGES|REJECT", "reasonCode": "string|null", "sellerNotes": "string|null",
  "internalNotes": "string|null", "requiresInspectionOverride": true|false|null, "expectedRowVersion": "<listing rowVersion b64>" }
```
Validation (APP/Moderation/ListingModerationService.cs:268-323, SQL/036...:796-1150):
- `decision` must be one of the three values. Otherwise 400 `INVALID_DATA`.
- `REQUEST_CHANGES` and `REJECT` require `reasonCode`. Otherwise 400 `MARKETPLACE_MODERATION_REASON_REQUIRED`.
- `expectedRowVersion` must be Base64. Otherwise 400 `INVALID_ROW_VERSION`. It must equal the **LISTING** rowVersion. Otherwise 409 `MARKETPLACE_LISTING_VERSION_CONFLICT`.
- The version must be `UNDER_REVIEW`. Otherwise 409 `MARKETPLACE_LISTING_TRANSITION_INVALID`. The listing or version not existing returns 404 (50811/50812).
- APPROVE with a category that requires inspection and `requiresInspectionOverride === false` is a **waiver**. It requires:
  - the caller's permission `inspections.override`. Otherwise 403 `MARKETPLACE_MODERATION_ACCESS_DENIED`.
  - `reasonCode` and `internalNotes`. Otherwise 400 `MARKETPLACE_MODERATION_REASON_REQUIRED`.
- How the inspection requirement is decided: `needsInspection = requiresInspectionOverride ?? category.RequiresPhysicalInspection`. Setting `true` forces an inspection even when the category does not require one.
- Outcomes (resulting `versionStatus`):
  - `REQUEST_CHANGES` → `CHANGES_REQUIRED`
  - `REJECT` → `REJECTED`
  - `APPROVE` with no inspection needed → `APPROVED`
  - `APPROVE` with inspection needed → `INSPECTION_REQUIRED`, and a PENDING inspection is created atomically. The response then carries `inspectionId` and `inspectionNo`. This can fail with 404 `MARKETPLACE_INSPECTION_TEMPLATE_NOT_FOUND` if no active template exists, which rolls the approval back, or with 409 `MARKETPLACE_INSPECTION_ALREADY_ACTIVE`.
- The listing aggregate status is unchanged by every decision.

200 `ModerationDecisionResponse` (ModerationDtos.cs:31-42):
- `{ moderationId, listingId, listingVersionId, decision, versionStatus, inspectionId|null, inspectionNo|null, reviewedAtUtc, rowVersion }`
- `rowVersion` is the **new listing rowVersion**.
- `inspectionId` / `inspectionNo` are non-null only when an inspection was created (`versionStatus === 'INSPECTION_REQUIRED'`). The SQL returns `@CreatedInspectionId`, which stays NULL on other branches (SQL/036...:892,1135), even though the repository always passes a fresh GUID as `@InspectionId` (INF/.../ListingModerationRepository.cs:164).

---

## 4. Publication endpoints (API/Controllers/AdminListingPublicationController.cs)
All write endpoints compare `expectedRowVersion` with the **LISTING** rowVersion.

### GET `/api/v1/admin/catalog/listings/{listingId}/versions/{versionId}/publication-eligibility`. Permission `catalog:listings:view` (l.40-49)
- 200 `PublicationEligibilityResponse` `{ listingId, candidateVersionId, isEligible, gates: { <7 gates>: { passed, details|null } }, blockers: string[] }` (APP/Publication/ListingPublicationService.cs:30-165).
- The gate checks are:
  - `sellerStanding`: seller is ACTIVE, VERIFIED and onboarding COMPLETED.
  - `versionModeration`: version status is `APPROVED`.
  - `inspectionCompliance`: a PASS inspection exists if one is required.
  - `catalogCompleteness`: price > 0 and currency/pricingMode are set.
  - `inventoryAvailability`: sellable quantity > 0.
  - `mediaAvailability`: a primary image exists and is valid in the media service.
  - `aggregateState`: listing is in `DRAFT`, `PUBLISHED` or `SUSPENDED`.
- `details` and `blockers` are human-readable English text.
- 404 `MARKETPLACE_LISTING_NOT_FOUND`.

### POST `/api/v1/admin/catalog/listings/{listingId}/versions/{versionId}/publish`. Permission `catalog:listings:publish` (l.51-62)
- Body `{ "expectedRowVersion": "b64" }`. Response 200 `PublishListingResponse` `{ listingId, publishedVersionId, previousPublishedVersionId|null, status, publishedAtUtc, rowVersion }`.
- Preconditions (APP/Publication/ListingPublicationService.cs:167-217, SQL/036...:1252-1468):
  - seller standing. Otherwise 409 `MARKETPLACE_LISTING_NOT_READY_FOR_PUBLICATION`, or 503 `SERVICE_UNAVAILABLE`.
  - a valid primary image. Otherwise 409 `MARKETPLACE_LISTING_NOT_READY_FOR_PUBLICATION`.
  - effective listing status in DRAFT, PUBLISHED or SUSPENDED (EXPIRED if `expiresAtUtc` has passed). Otherwise 409 `MARKETPLACE_LISTING_TRANSITION_INVALID`.
  - version `APPROVED`, price set and inventory available. Otherwise 409 `MARKETPLACE_LISTING_NOT_READY_FOR_PUBLICATION`.
  - inspection PASS when required. Otherwise 409 `MARKETPLACE_LISTING_INSPECTION_NOT_PASSED`.
- Effects:
  - the listing becomes `PUBLISHED`. This also applies when it was SUSPENDED.
  - the version becomes `PUBLISHED` and the previous published version becomes `SUPERSEDED`.
  - the history action is `INITIAL_PUBLISH` or `VERSION_UPDATE`.

### POST `/api/v1/admin/catalog/listings/{listingId}/suspend`. Permission `catalog:listings:suspend` (l.64-74)
- Body `{ "reasonCode": "string (required)", "remarks": "string|null", "expectedRowVersion": "b64" }`. `reasonCode` is free text, see the constants in section 2.
- 200 `SuspendListingResponse` `{ listingId, status, reasonCode, updatedAtUtc, rowVersion }`.
- Requires the effective status `PUBLISHED`. Otherwise 409 `MARKETPLACE_LISTING_NOT_PUBLISHED` (SQL/036...:1469-1578).
- Effect: listing becomes `SUSPENDED`.

### POST `/api/v1/admin/catalog/listings/{listingId}/republish`. Permission `catalog:listings:publish` (l.76-86)
- Body `{ "expectedRowVersion": "b64" }`. Response 200 `RepublishListingResponse` `{ listingId, publishedVersionId, status, updatedAtUtc, rowVersion }`.
- Preconditions:
  - the listing has a `publishedVersionId`. Otherwise 409 `MARKETPLACE_LISTING_NOT_READY_FOR_PUBLICATION`.
  - seller standing and media checks pass.
  - status is `SUSPENDED` and not past `expiresAtUtc`. Otherwise 409 `MARKETPLACE_LISTING_TRANSITION_INVALID`.
  - inventory, media and inspection gates pass (SQL/036...:1579-1752).
- Effects: listing becomes `PUBLISHED`; history action `REPUBLISH_AFTER_SUSPENSION` with reasonCode `REACTIVATION`.
- Admin republish has no restriction on the original suspension reason. The seller resume path does have one: error 50809.

### POST `/api/v1/admin/catalog/listings/{listingId}/rollback`. Permission `catalog:listings:publish` (l.88-98)
- Body `{ "targetRollbackVersionId": "guid", "reasonCode": "string", "remarks": "string|null", "expectedRowVersion": "b64" }`.
- `targetRollbackVersionId` must be non-empty. Otherwise 400 `INVALID_DATA`.
- 200 `RollbackListingResponse` `{ listingId, publishedVersionId, previousPublishedVersionId|null, status, updatedAtUtc, rowVersion }`.
- Preconditions (SQL/036...:1991-2200):
  - listing effective status is PUBLISHED or SUSPENDED. Otherwise 409 `TRANSITION_INVALID`.
  - a version is currently published. Otherwise 409 `MARKETPLACE_LISTING_NOT_PUBLISHED`.
  - the target is not the current version. Otherwise 409 `TRANSITION_INVALID`.
  - the target status is `SUPERSEDED`. Otherwise 409 `TRANSITION_INVALID`; an unknown target returns 404 `MARKETPLACE_LISTING_VERSION_NOT_FOUND`.
  - inventory, media and inspection gates pass.
- Effects:
  - the listing becomes **PUBLISHED**, which also un-suspends it.
  - the current version becomes SUPERSEDED and the target becomes PUBLISHED.
  - history action `ROLLBACK`.
- There is no endpoint that lists a listing's versions. Candidate targets have to be derived from `publication-history[].listingVersionId` / `previousPublishedVersionId`.

### GET `/api/v1/admin/catalog/listings/{listingId}/publication-history`. Permission `catalog:listings:view` (l.100-108)
- 200 **bare JSON array** `ListingPublicationHistoryDto[]` `{ publicationHistoryId, listingId, listingVersionId, previousPublishedVersionId|null, action, reasonCode|null, remarks|null, publishedByUserId, publishedAtUtc }`.
- Ordered `publishedAtUtc DESC`.
- An unknown listing returns `[]`, not 404 (SQL/036...:2222-2242).

---

## 5. Inspection templates (API/Controllers/AdminInspectionTemplatesController.cs)
- The permission is set **on the class**: `inspections.templates.manage` for every route, **including GETs** (l.18).
- Service: APP/Inspections/ChecklistTemplateService.cs.

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/api/v1/admin/catalog/inspection-templates` | none | 200 `ChecklistTemplateDto[]` (bare array). Ordered by name. **`items` is always `[]` here.** (l.41-46, svc l.83-87) |
| GET | `.../{templateId}` | none | 200 `ChecklistTemplateDto` with `items` ordered by displayOrder. 404 `MARKETPLACE_INSPECTION_TEMPLATE_NOT_FOUND` (l.48-55) |
| POST | `.../inspection-templates` | `{ code, name, description?, categoryId?, isActive (default true) }` | **201** `ChecklistTemplateDto` with `items: []` (l.57-65) |
| PUT | `.../{templateId}` | `{ name, description?, expectedRowVersion }` | 200 `ChecklistTemplateDto` with `items: []` (l.67-76) |
| POST | `.../{templateId}/activate` | none | 200 `ChecklistTemplateDto` with `items: []` (l.78-86) |
| POST | `.../{templateId}/deactivate` | none | 200 `ChecklistTemplateDto` with `items: []` (l.88-96) |
| PUT | `.../{templateId}/items` | `{ items: TemplateItemInput[] }` | 200 `ChecklistTemplateItemDto[]` (bare array) ordered by displayOrder (l.98-107) |

Rules (SQL/034...:1451-1750, schema SQL/033...:18-75):
- `code` must be at most 50 characters and globally unique. A duplicate returns 409 `MARKETPLACE_INSPECTION_TEMPLATE_ACTIVE_CONFLICT`; the code name is misleading.
- `name` must be at most 150 characters and `description` at most 500. Values are trimmed.
- `categoryId` must be an existing category. A bad FK returns 500.
- At most **one active template per category**, plus **one active global default** (`categoryId: null`). Create or activate in violation returns 409 `MARKETPLACE_INSPECTION_TEMPLATE_ACTIVE_CONFLICT`.
- Deactivate never conflicts. Activate and deactivate take **no rowVersion**.
- PUT `/items` **replaces all items** (delete then insert). It takes no rowVersion and is allowed on active templates. Existing inspections are unaffected because they keep snapshots.
- Item fields:
  - `itemId` (optional, a new GUID if absent)
  - `itemCode` (at most 50 characters, unique within the template; a duplicate returns 500)
  - `label` (at most 255 characters)
  - `description?`
  - `responseType` (one of the 6 values; anything else violates a CHECK and returns **500**)
  - `isRequired` (default true), `requiresEvidence` (default false)
  - `displayOrder`: `0` means "use array index + 1"; a negative value returns 500
  - `allowedOptionsJson?`: a raw string with no server-side validation. Its structure is **not defined** by the backend.
- Inspection creation resolves its template in this order: the active category template first, then the active global template. If neither exists it returns 404 `MARKETPLACE_INSPECTION_TEMPLATE_NOT_FOUND` (SQL/036...:102-127).

---

## 6. Inspections (API/Controllers/AdminListingInspectionsController.cs, APP/Inspections/ListingInspectionService.cs)
- Every write takes `expectedRowVersion` = the **inspection** `rowVersion` (Base64, exactly 8 bytes). Otherwise 400 `MARKETPLACE_INSPECTION_ROW_VERSION_INVALID` (svc l.48-68). A stale value returns 409 `MARKETPLACE_INSPECTION_VERSION_CONFLICT`.
- "Supervisor override" means the caller has `inspections.override`, checked inside the service. With it the caller may act on an inspection assigned to someone else. Without it, acting on someone else's inspection returns 403 `MARKETPLACE_INSPECTOR_NOT_ASSIGNED`.

| Method + path (prefix `/api/v1/admin/catalog/inspections`) | Perm | Body | Success |
|---|---|---|---|
| GET `/queue` (l.40-67) | inspections.view | none | 200 `PagedInspectionQueueResponse` |
| GET `/{inspectionId}` (l.69-77) | inspections.view | none | 200 `InspectionDetailDto` |
| POST `` (l.79-88) | inspections.override | `{ listingId, listingVersionId }` | **201** `InspectionSummaryDto` |
| POST `/{id}/assign` (l.90-100) | inspections.assign | `{ inspectorUserId, expectedRowVersion }` | 200 `InspectionSummaryDto` |
| POST `/{id}/reassign` (l.102-112) | inspections.assign | `{ newInspectorUserId, reasonCode?, notes?, expectedRowVersion }` | 200 `InspectionSummaryDto` |
| POST `/{id}/start` (l.114-124) | inspections.perform | `{ expectedRowVersion }` | 200 `InspectionSummaryDto` |
| PUT `/{id}/responses` (l.126-136) | inspections.perform | `{ expectedRowVersion, responses: SaveInspectionResponseItem[] }` | 200 `{ rowVersion, responses: InspectionResponseDto[] }` |
| POST `/{id}/evidence` (l.138-148) | inspections.perform | `{ fileAssetId, inspectionResponseId?, evidenceType, description?, displayOrder, expectedRowVersion }` | **201** `InspectionEvidenceDto` |
| DELETE `/{id}/evidence/{evidenceId}?expectedRowVersion=<b64, URL-encoded>` (l.150-161) | inspections.perform | none | **204** no body |
| POST `/{id}/complete` (l.163-173) | inspections.perform | `{ result, summary?, failureReasonCode?, failureNotes?, expectedRowVersion }` | 200 `InspectionSummaryDto` |
| POST `/{id}/cancel` (l.175-185) | inspections.override | `{ reasonCode, notes?, expectedRowVersion }` | 200 `InspectionSummaryDto` |
| POST `/{id}/authorize-reinspection` (l.187-197) | inspections.override | `{ notes? }` (**`notes` is ignored**, svc l.525-540) | **201** `InspectionSummaryDto` of the NEW inspection |

Queue query parameters (l.40-67, SQL/034...:219-273):
- `status?` (string, one of the inspection statuses; not validated)
- `result?` (string)
- `assignedInspectorUserId?`, `categoryId?`, `sellerId?` (guid)
- `dateFrom?` and `dateTo?` (date-time, compared with `createdAtUtc`)
- `page=1`, `pageSize=20` (max 100)
- Ordered by `createdAtUtc DESC`.

Detail (svc l.165-254):
- Header fields are the same as the summary, plus `responses[]` (ordered by `displayOrderSnapshot`), `evidence[]`, `statusHistory[]` and `assignmentHistory[]`.
- History ordering is **not specified** in the C# code; see `PR_LISTING_INSPECTION_*_HISTORY_GET`.
- `evidence[].downloadUrl` is a presigned URL from inventory-media `POST /api/internal/files/{id}/download-url`. It is **null** if that call fails.

Validation and rules per action (SQL/034...:276-1418, overrides in SQL/036...:54-435):
- **create**:
  - `listingId` and `listingVersionId` must be non-empty. Otherwise 400 `MARKETPLACE_INSPECTION_REQUEST_INVALID`.
  - version must exist. Otherwise 404 (reported as `MARKETPLACE_INSPECTION_NOT_FOUND`).
  - version must belong to the listing. Otherwise 409 `..._LISTING_VERSION_MISMATCH`.
  - no PENDING, ASSIGNED or IN_PROGRESS inspection may exist for the version. Otherwise 409 `MARKETPLACE_INSPECTION_ALREADY_ACTIVE`.
  - an active template must exist. Otherwise 404.
  - **There is no check on the version's status.**
  - The new inspection is `PENDING` with responses snapshotted from the template.
- **assign**:
  - `inspectorUserId` must be non-empty. Otherwise 400.
  - the target user needs `inspections.perform`. Otherwise **403 `MARKETPLACE_INSPECTION_ACCESS_DENIED`**.
  - not allowed when COMPLETED or CANCELLED. Otherwise 409 `TRANSITION_INVALID`.
  - status becomes `ASSIGNED` only from `PENDING`; it is unchanged from `ASSIGNED` or `IN_PROGRESS`.
- **reassign**: same checks as assign, but the **status is never changed**. Reassigning a `PENDING` inspection leaves it PENDING, and `start` then fails. Use `assign` while PENDING.
- **start**:
  - requires an assigned inspector. Otherwise 409 `MARKETPLACE_INSPECTION_ASSIGNMENT_REQUIRED`.
  - the caller must be the assigned inspector or hold the override. Otherwise 403.
  - status must be `ASSIGNED`. Otherwise 409.
  - status becomes `IN_PROGRESS`.
- **responses**:
  - status must be `IN_PROGRESS`. COMPLETED returns 409 `..._COMPLETED_IMMUTABLE`; any other status returns 409 `TRANSITION_INVALID`.
  - requires an assigned inspector, plus the caller rule above.
  - `responses` must be non-null. Each item's `inspectionResponseId` is an `InspectionResponseDto.inspectionResponseId`.
  - `itemResult` is restricted by a CHECK. A bad value would return 500, **but see "BROKEN" below**.
- **evidence attach**:
  - status must be `ASSIGNED` or `IN_PROGRESS`.
  - `evidenceType` must be `IMAGE` or `DOCUMENT`. Otherwise 400 `..._EVIDENCE_TYPE_INVALID`.
  - `inspectionResponseId`, if given, must belong to the inspection. Otherwise 404 `..._RESPONSE_NOT_FOUND`.
  - the same `fileAssetId` cannot be attached twice to one inspection. A duplicate violates a UNIQUE constraint and returns **500**.
  - `description` is at most 500 characters. `displayOrder` must be >= 0.
  - the file must pass validation. Otherwise 400 `MARKETPLACE_INSPECTION_REQUEST_INVALID` ("Evidence file is not available or invalid purpose.").
- **evidence detach**: status must be `ASSIGNED` or `IN_PROGRESS`. The evidence must exist. Otherwise 404 `..._EVIDENCE_NOT_FOUND`.
- **complete**:
  - status must be `IN_PROGRESS`.
  - `result` must be `PASS`, `FAIL` or `REINSPECTION_REQUIRED`. Otherwise 400 `MARKETPLACE_INSPECTION_RESULT_INVALID`.
  - every required item must have an `itemResult`. Otherwise 400 `..._CHECKLIST_INCOMPLETE`.
  - PASS additionally requires no required item with `FAIL` (otherwise 409 `..._CANNOT_PASS_FAILED_ITEMS`), and evidence for every `requiresEvidenceSnapshot` item (otherwise 409 `..._EVIDENCE_REQUIRED`). Evidence with `inspectionResponseId: null` satisfies all items.
  - FAIL and REINSPECTION_REQUIRED require `failureReasonCode` and a `failureNotes` value of at least 10 characters after trimming. Otherwise 400 `..._FAILURE_DETAILS_REQUIRED`.
  - Effects: status becomes `COMPLETED` and `result` is set. On **PASS**, a listing version in `INSPECTION_REQUIRED` becomes `APPROVED` (SQL/036...:368-375). On FAIL, the version stays `INSPECTION_REQUIRED`.
- **cancel**:
  - `reasonCode` must be non-empty. Otherwise 400.
  - not allowed from COMPLETED or CANCELLED. Otherwise 409.
  - status becomes `CANCELLED`. The version status is not touched.
- **authorize-reinspection**:
  - the prior inspection must be `COMPLETED` with result `FAIL` or `REINSPECTION_REQUIRED`. Otherwise 409 `..._REINSPECTION_INVALID`.
  - no other inspection may be active for the version. Otherwise 409 `..._ALREADY_ACTIVE`.
  - creates a new `PENDING` inspection with `reinspectionOfInspectionId` pointing at the prior one and responses re-snapshotted from the current template.

### Evidence files
- Upload through inventory-media (`services/inventory-media/src/Emcore.InventoryMedia.Api/Controllers/FilesController.cs`):
  1. `POST /api/v1/files/upload-requests` with `{ originalFileName, contentType, sizeBytes, purpose: "INSPECTION_EVIDENCE" }`. The response is wrapped in that service's own `ApiResponse` envelope.
  2. PUT the file to the presigned URL.
  3. `POST /api/v1/files/{fileId}/complete`.
- The `INSPECTION_EVIDENCE` purpose allows pdf, jpg, jpeg, png and webp, up to 20 MB (FileAssetService.cs:35).
- Then call `POST .../evidence` with `fileAssetId = fileId`.
- Catalog validates the file through `GET /api/internal/files/{id}/validate?ownerUserId=<acting admin userId>&purpose=INSPECTION_EVIDENCE` (APP/Inspections/ListingInspectionService.cs:420). The SQL requires `OwnerUserId = caller`, `Purpose = INSPECTION_EVIDENCE` and `Status = 'AVAILABLE'`. **The admin performing the attach must be the user who uploaded the file.**

---

## 7. Public and seller read views

### GET `/api/v1/catalog/listings/{listingId}`. `[AllowAnonymous]` (API/Controllers/PublicListingsController.cs:26-63)
- 200 `PublicListingDetailResponse` (CON/Publication/PublicationDtos.cs:274-312).
- 404 `ErrorResponse` `MARKETPLACE_LISTING_NOT_FOUND`: listing is not PUBLISHED, has no published version, or is DRAFT or ARCHIVED.
- **410** `PublicListingUnavailableResponse` `{ listingId, error:"MARKETPLACE_LISTING_UNAVAILABLE", message, alertBanner, isAvailable:false }`: listing is SUSPENDED or EXPIRED, or the seller is not ACTIVE, VERIFIED or onboarding COMPLETED.
- 503 `SERVICE_UNAVAILABLE`: seller service is down (fail-closed) (APP/Publication/ListingPublicationService.cs:799-994).
- Image URLs are relative: `/api/v1/files/{fileAssetId}/download`.

### Seller views `/api/v1/marketplace/sellers/{sellerId}/listings...` (`[Authorize]`, no platform permission)
- **Admins cannot use these.** Every one of them calls `ValidateSellerAccessAsync`, which requires the caller to be the **OWNER member** of that seller organization, with `canOperate` (APP/Listings/MarketplaceListingService.cs:55-67, APP/Inventory/ListingInventoryService.cs:36, APP/Listings/ListingMediaService.cs:39).
- Any other caller gets 403 `MARKETPLACE_SELLER_ACCESS_DENIED`. If the seller service is down the response is 503 `MARKETPLACE_LISTING_DEPENDENCY_UNAVAILABLE`.
- The shapes, for completeness:

| Path | Query | 200 body |
|---|---|---|
| GET `/listings` (MarketplaceListingsController.cs:62-76) | `page=1`, `pageSize=20` (**no max**), `status?` (listing status), `categoryId?`, `search?` (title LIKE), `sort="CreatedAtUtcDesc"` (`CreatedAtUtcDesc`/`CreatedAtUtcAsc`/`TitleAsc`/`TitleDesc`; anything else falls back to the default; SQL/025...:211-213) | `SellerListingListResponse` `{ items, totalCount }` (no page echo) |
| GET `/listings/{listingId}` (l.78-87) | none | `ListingDetailResponse` (404 `MARKETPLACE_LISTING_NOT_FOUND`) |
| GET `/listings/{listingId}/inventory` (MarketplaceListingInventoryController.cs:43-52) | none | `ListingInventoryResponse` (`rowVersion` is null if no inventory row exists) |
| GET `/listings/{listingId}/media` (ListingMediaController.cs:40-49) | none | `ListingMediaResponse` |

- **Admin gap:** no endpoint lists all listings or a listing's versions for platform staff. The only admin listing views are the moderation queue, moderation detail, eligibility, and publication history.

---

## 8. State machines (drive UI buttons)

### 8.1 Listing version (`versionStatus`)
```
DRAFT / CHANGES_REQUIRED --(seller submit)--> UNDER_REVIEW
UNDER_REVIEW --decide REQUEST_CHANGES--> CHANGES_REQUIRED
UNDER_REVIEW --decide REJECT---------> REJECTED (terminal)
UNDER_REVIEW --decide APPROVE (no insp)--> APPROVED
UNDER_REVIEW --decide APPROVE (insp)-----> INSPECTION_REQUIRED  (+ PENDING inspection)
INSPECTION_REQUIRED --inspection COMPLETE PASS--> APPROVED
APPROVED --publish--> PUBLISHED (previous PUBLISHED --> SUPERSEDED)
PUBLISHED --rollback to another--> SUPERSEDED ; SUPERSEDED --rollback target--> PUBLISHED
```
Buttons by version status:
- **Decide (approve, request changes, reject)**: only when `UNDER_REVIEW`.
- **Publish**: only when `APPROVED`, and `eligibility.isEligible` should be true.
- **Create inspection**: the backend allows it for any status. The UI should offer it for `INSPECTION_REQUIRED` when there is no active inspection, for example after a cancel.

### 8.2 Listing aggregate (`status` / `listingAggregateStatus`)
```
DRAFT --publish--> PUBLISHED
PUBLISHED --suspend--> SUSPENDED
SUSPENDED --republish (not expired)--> PUBLISHED
PUBLISHED|SUSPENDED --rollback--> PUBLISHED
DRAFT|PUBLISHED|SUSPENDED --publish(new APPROVED version)--> PUBLISHED
PUBLISHED --(worker, expiresAtUtc passed)--> EXPIRED
(seller) archive --> ARCHIVED
```
Buttons by listing status:
- **Suspend**: only when `PUBLISHED` and not past `expiresAtUtc`.
- **Republish**: only when `SUSPENDED`, not expired, and `publishedVersionId` is set.
- **Rollback**: when `PUBLISHED` or `SUSPENDED`, there is a published version, and at least one `SUPERSEDED` version exists.

### 8.3 Inspection
```
PENDING --assign--> ASSIGNED --start--> IN_PROGRESS --complete--> COMPLETED(result)
PENDING|ASSIGNED|IN_PROGRESS --cancel--> CANCELLED
COMPLETED(FAIL|REINSPECTION_REQUIRED) --authorize-reinspection--> new PENDING inspection
```
Buttons by inspection status:

| status | assign | reassign | start | responses | evidence +/- | complete | cancel | authorize-reinspection |
|---|---|---|---|---|---|---|---|---|
| PENDING | yes | yes (status stays PENDING) | no | no | no | no | yes | no |
| ASSIGNED | yes | yes | yes (assignee or override) | no | yes | no | yes | no |
| IN_PROGRESS | yes | yes | no | yes | yes | yes | yes | no |
| COMPLETED | no | no | no | no | no | no | no | when result is FAIL or REINSPECTION_REQUIRED and no other inspection is active |
| CANCELLED | no | no | no | no | no | no | no | no |

---

## 9. Broken, stubbed or ambiguous

1. **BROKEN: PUT `/inspections/{id}/responses` does not save answers.**
   - The service serializes `request.Responses` with `JsonSerializer.Serialize(...)` using **default options, which produce PascalCase keys** (APP/Inspections/ListingInspectionService.cs:388).
   - The procedure reads it with **case-sensitive camelCase** OPENJSON paths `'$.inspectionResponseId'` and so on (SQL/034...:706-716).
   - As a result the join matches nothing, no response is updated, and only the inspection rowVersion advances. The endpoint still returns 200 with unchanged responses.
   - Consequence: if the template has any required item, `complete` always fails with `MARKETPLACE_INSPECTION_CHECKLIST_INCOMPLETE`.
   - Template item replace is **not** affected: it serializes an anonymous object with camelCase names.
2. **Likely broken: publish, republish and rollback media gate.**
   - It validates the primary image with `ownerUserId = facts.SellerId`, the seller organization id (APP/Publication/ListingPublicationService.cs:134,566).
   - Inventory-media requires `OwnerUserId` to equal the **uploading user's** id. That holds for the seller attach path (ListingMediaService.cs:88 passes `userId`).
   - Unless the seller id equals the uploader's user id, the gate fails with 409 `MARKETPLACE_LISTING_NOT_READY_FOR_PUBLICATION` ("Primary media asset is invalid, unconfirmed, or not owned by seller."). I found no code that makes those ids equal. This needs runtime verification.
3. `authorize-reinspection` ignores `notes`.
4. The template list never includes `items`. Create, update, activate and deactivate also return `items: []`.
5. Several constraint violations surface as 500 `MARKETPLACE_LISTING_INTERNAL_ERROR` instead of 4xx: bad `responseType`, duplicate `itemCode`, negative `displayOrder`, invalid template `categoryId`, and attaching the same evidence file twice.
6. Paging `page` and `pageSize` echo raw input. The inspection queue `totalCount` is 0 on a page past the end.
7. The decide request's `inspectionId` parameter is generated server-side and is unused unless an inspection is created. It is harmless.
8. Admins cannot read seller listing, inventory or media views, and there is no admin endpoint to list listing versions. A rollback target must come from publication history.
9. `suspend.reasonCode`, `rollback.reasonCode`, `cancel.reasonCode`, `complete.failureReasonCode`, `decide.reasonCode`, `passFailValue` and `allowedOptionsJson` have no server-side enumerations.
