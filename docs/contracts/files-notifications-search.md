# Files, Notification Templates, Search — API contracts

Paths are relative to `/home/user/stockout/services/`. All three services use `AddControllers()` with **no JSON customisation** ⇒ System.Text.Json web defaults: camelCase property names, nulls written, `DateTime` as ISO-8601 strings, `Guid` as `"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`, `decimal`/`long` as JSON numbers, **dictionary keys emitted verbatim** (not camelCased). No `JsonStringEnumConverter` anywhere; all enum-like fields are already `string`.

For gateway policies, rate limits and the gateway's own problem body see `gateway.md`.

---

## A. Inventory & Media — `/api/v1/files/*`

Controller: `inventory-media/src/Emcore.InventoryMedia.Api/Controllers/FilesController.cs` (`FC`). Service: `inventory-media/src/Emcore.InventoryMedia.Application/Services/FileAssetService.cs` (`FS`).

**Auth:** class `[Authorize]` (`FC:14`), `GatewayHeader` scheme (`Program.cs:20`) ⇒ needs gateway-injected `X-User-Id`. Gateway route: `AuthenticatedRoutePolicy` + `AuthenticatedPolicy` (300/min). No permission codes, no step-up, no idempotency. **Strictly owner-only**: every operation compares `file.OwnerUserId` with the caller (`FS:125,185,205,255`) — an admin cannot read or delete other users' files through this API.

**Success envelope** (`Contracts/Responses/ApiResponse.cs:3-7`): `{ "data": T }`.
**Error body** (`ApiResponse.cs:9-14`): `{ "errorCode": string, "message": string }` produced by `MapException` (`FC:107-125`), matching on exception message substrings:

| errorCode | HTTP | message |
|---|---|---|
| `FILE_NOT_FOUND` | 404 | File not found. |
| `FILE_ACCESS_DENIED` | 403 | Access denied. |
| `FILE_PURPOSE_INVALID` | 400 | Invalid purpose. |
| `FILE_CONTENT_TYPE_INVALID` | 400 | Invalid content type. |
| `FILE_SIZE_EXCEEDED` | 413 | File size exceeded. |
| `FILE_UPLOAD_EXPIRED` | 410 | Upload URL expired. |
| `FILE_NOT_PENDING` | 409 | File not pending. |
| `FILE_ALREADY_DELETED` | 410 | File already deleted. |
| `FILE_OBJECT_NOT_FOUND` | 409 | S3 Object not found. |
| `FILE_OBJECT_MISMATCH` | 409 | Object mismatch. |
| `FILE_VERSION_CONFLICT` | 409 | Version conflict. |
| `STORAGE_UNAVAILABLE` | 503 | Storage unavailable. |
| `INTERNAL_SERVER_ERROR` | 500 | An internal error occurred. |

Other errors: 401 empty body when `X-User-Id` missing (gateway may rewrite); a non-GUID `X-User-Id` throws `UnauthorizedAccessException` which is caught and mapped to **500 `INTERNAL_SERVER_ERROR`** (`FC:24-30`); `{fileId:guid}` route constraint ⇒ non-GUID id gives 404 with empty body (gateway rewrites to `unmatched_gateway_route`); malformed JSON / bad `If-Match` ⇒ 400 ASP.NET `ValidationProblemDetails`.

Enums (`Domain/Constants`): status `PENDING_UPLOAD | AVAILABLE | DELETED`; purpose `USER_PROFILE_PHOTO | SELLER_PROFILE_LOGO | SELLER_DOCUMENT | LISTING_IMAGE | LISTING_DOCUMENT | INSPECTION_EVIDENCE | CHAT_ATTACHMENT | RETURN_EVIDENCE | INVOICE_DOCUMENT | GENERAL_ATTACHMENT`.

Purpose policies (`FS:28-40`):

| Purpose | MIME types | Extensions | Max bytes |
|---|---|---|---|
| USER_PROFILE_PHOTO, SELLER_PROFILE_LOGO | image/jpeg, image/png, image/webp | .jpg .jpeg .png .webp | 5 MiB |
| LISTING_IMAGE | image/jpeg, image/png, image/webp | .jpg .jpeg .png .webp | 10 MiB |
| SELLER_DOCUMENT, LISTING_DOCUMENT | application/pdf, image/jpeg, image/png | .pdf .jpg .jpeg .png | 20 MiB |
| INSPECTION_EVIDENCE, CHAT_ATTACHMENT, RETURN_EVIDENCE, GENERAL_ATTACHMENT | application/pdf, image/jpeg, image/png, image/webp | .pdf .jpg .jpeg .png .webp | 20 MiB |
| INVOICE_DOCUMENT | application/pdf | .pdf | 20 MiB |

### POST /api/v1/files/upload-requests (`FC:32-45`, `FS:49-119`)
Request `CreateUploadRequest` (`Contracts/Requests/CreateUploadRequest.cs:3-9`):
`{ "originalFileName": string|null, "contentType": string|null, "sizeBytes": number, "purpose": string|null }`
Validation order: purpose (case-insensitive, stored uppercased) → `FILE_PURPOSE_INVALID`; `sizeBytes <= 0 || > max` → `FILE_SIZE_EXCEEDED` (413, also for 0); extension of `originalFileName` (lowercased) and `contentType` (lowercased) must both be allowed → `FILE_CONTENT_TYPE_INVALID`.
Response **200** `{ "data": CreateUploadResponse }` (`Contracts/Responses/CreateUploadResponse.cs`):
`{ "fileId": guid, "uploadUrl": string, "httpMethod": "PUT", "requiredHeaders": { "Content-Type": string }, "expiresAtUtc": string }`
(key `"Content-Type"` is verbatim). URL expiry `ObjectStorage:UploadUrlExpirySeconds` default 900 s. Client then `PUT`s the bytes straight to `uploadUrl` with exactly those headers. Presign failure ⇒ 503 `STORAGE_UNAVAILABLE`.

### POST /api/v1/files/{fileId}/complete (`FC:47-60`, `FS:121-179`)
No body. Optional header `If-Match: <int>` = expected concurrency version (no endpoint returns this number; omit it ⇒ server uses the stored version). Response **200** `{ "data": FileAssetResponse }`. Already `AVAILABLE` ⇒ idempotent 200 with current data. Errors: 404, 403, 410 `FILE_ALREADY_DELETED`, 410 `FILE_UPLOAD_EXPIRED`, 409 `FILE_OBJECT_NOT_FOUND` (nothing uploaded), 409 `FILE_OBJECT_MISMATCH` (size or content-type differs; the file is then **deleted**), 409 `FILE_VERSION_CONFLICT` (raised by `PR_FILE_ASSET_COMPLETE`, `inventory-media/Emcore.InventoryMedia.Migrator/Migrations/Versioned/001_FileAssetFoundation.sql:156`).

`FileAssetResponse` (`Contracts/Responses/FileAssetResponse.cs`):
`{ "fileId": guid, "purpose": string|null, "originalFileName": string|null, "actualContentType": string|null, "actualSizeBytes": number, "status": string|null, "createdAtUtc": string, "completedAtUtc": string|null }`
(for pending files `actualContentType`/`actualSizeBytes` fall back to the expected values.)

### GET /api/v1/files/{fileId} (`FC:62-75`, `FS:181-199`)
200 `{ "data": FileAssetResponse }`. 404 / 403 / 410 `FILE_ALREADY_DELETED`.

### POST /api/v1/files/{fileId}/download-url (`FC:77-90`, `FS:201-225`)
No body. 200 `{ "data": { "fileId": guid, "downloadUrl": string, "expiresAtUtc": string } }` (`DownloadUrlResponse.cs`; expiry `ObjectStorage:DownloadUrlExpirySeconds` default 900). Errors: 404, 403, **409 `FILE_NOT_PENDING` when the file is still `PENDING_UPLOAD`** (code name is inverted), 410 deleted, 503 storage.

### DELETE /api/v1/files/{fileId} (`FC:92-105`, `FS:251-270`)
**204 No Content**. Soft-deletes then deletes the S3 object. Already-deleted ⇒ still 204 (no-op). 404 / 403.

---

## B. Notification & Integration — `/api/v1/admin/notification-templates/*`

Controller: `notification-integration/src/Emcore.NotificationIntegration.Api/Controllers/AdminNotificationTemplatesController.cs` (`NC`). Contracts: `.../Emcore.NotificationIntegration.Contracts/NotificationTemplates/Requests.cs` (`NReq`) and `Responses.cs` (`NRes`). Service: `.../Application/Services/NotificationTemplateService.cs` (`NS`). Validator: `.../Application/Validation/NotificationTemplateValidator.cs` (`NV`). SQL: `notification-integration/Emcore.NotificationIntegration.Migrator/Migrations/Versioned/003_NotificationTemplateMasters.sql` (`NSQL`).

**Auth:** no `[Authorize]`; each action has `[RequiresPlatformPermission(code)]` (`Api/Authorization/RequiresPlatformPermissionAttribute.cs:13-53`), an `IAsyncAuthorizationFilter`:
- not authenticated or `X-User-Id` not a GUID ⇒ **401, empty body** (`UnauthorizedResult`).
- otherwise calls user-organization `GET /api/internal/permissions/check?userId=&permissionCode=` with `X-Service-Auth` (`Infrastructure/Authorization/PlatformAuthorizationService.cs:36-61`); `allowed:false` **or any failure/outage** ⇒ **403** `{ "error": "FORBIDDEN", "message": "Insufficient permissions." }`.
- Permission codes: `notification-templates.view | .create | .update | .activate | .deactivate`. Seed data grants only `notification-templates.view` to role `PlatformAdmin` (`user-organization/Emcore.UserOrganization.Migrator/Migrations/Versioned/023_NotificationTemplatePermissions.sql:38-55`); the other four exist but are not granted by migrations.
Gateway: `AuthenticatedRoutePolicy` + 300/min. No step-up, no idempotency headers.

**Success envelope** (`NRes:60-64`): `{ "success": true, "data": T }`.
**Error body** (`NRes:66-70`): `{ "error": string, "message": string }` — for every error except FORBIDDEN the controller sets only `error`, so **`message` is `""`**. Unhandled exceptions (anything not `ApplicationException`, e.g. SQL errors, and all exceptions in `ListAsync`) ⇒ default ASP.NET 500 (empty body in Production; developer exception page in Development). Malformed JSON/missing body ⇒ 400 `ValidationProblemDetails`.

Enums (`Domain/Constants/`): channel `EMAIL | WHATSAPP | SMS | PUSH | IN_APP`; purpose `TRANSACTIONAL | SECURITY | SYSTEM | MARKETING`; version status `DRAFT | ACTIVE | RETIRED`; parameter dataType `STRING | NUMBER | DATETIME | URL`. All compared **case-sensitively** in C# (`NV:58, 116`, `NS:118`).

Route params `{templateCode}` and `{channel}` are free strings matched in SQL (`NSQL:132-151`). A template is unique per `(templateCode, channel)`.

### GET /api/v1/admin/notification-templates — `.view` (`NC:29-42`)
Query: `page:int=1` (clamped ≥1), `pageSize:int=20` (clamped 1..100) (`NS:84-98`), `search:string?` (SQL `LIKE '%search%'` on TemplateCode), `channel`, `purpose`, `status` (strings; `status` filters templates having **any** version with that status, `NSQL:82-92`). Ordered by templateCode, channel.
200 `{ success, data: NotificationTemplateListResponse }` = `{ items: NotificationTemplateSummaryResponse[], page, pageSize, totalCount }` (`NRes:52-58`, echoed values are the clamped ones).
`NotificationTemplateSummaryResponse` (`NRes:6-16`): `{ templateId: guid, templateCode, channel, purpose, activeVersionId: guid|null, activeVersionNumber: number|null, createdAtUtc: string, createdByUserId: guid|null }`.

### GET /api/v1/admin/notification-templates/{templateCode}/{channel} — `.view` (`NC:44-57`)
200 `{ success, data: NotificationTemplateSummaryResponse }`; 404 `{ error: "NOTIFICATION_TEMPLATE_NOT_FOUND", message: "" }`.

### GET /api/v1/admin/notification-templates/{templateCode}/{channel}/versions — `.view` (`NC:59-74`)
200 `{ success, data: NotificationTemplateVersionResponse[] }` ordered by `versionNumber` desc (`NSQL:567`); 404 `NOTIFICATION_TEMPLATE_NOT_FOUND`.
`NotificationTemplateVersionResponse` (`NRes:18-39`): `{ versionId, templateId, versionNumber, concurrencyVersion, status, subject|null, title|null, bodyText|null, bodyHtml|null, parameters: [{ parameterId, versionId, name, dataType, isRequired, description|null, displayOrder }], createdAtUtc, createdByUserId|null, updatedAtUtc|null, updatedByUserId|null, activatedAtUtc|null, activatedByUserId|null, retiredAtUtc|null, retiredByUserId|null }`. There is no single-version GET endpoint.

### POST /api/v1/admin/notification-templates — `.create` (`NC:76-90`, `NS:113-131`)
Body `CreateNotificationTemplateRequest` (`NReq:6-16`): `{ templateCode, channel, purpose, subject|null, title|null, bodyText|null, bodyHtml|null, parameters: NotificationTemplateParameterDto[] }`; parameter (`NReq:38-45`) `{ name, dataType, isRequired, description|null, displayOrder }`.
Validation (all ⇒ **400**):
- `templateCode` non-blank, ≤150 chars; `purpose` in enum → `TEMPLATE_CONTENT_INVALID`.
- Channel content (`NV:56-80`) → `TEMPLATE_CONTENT_INVALID`: EMAIL needs `subject` + (`bodyText` or `bodyHtml`) and **no** `title`; SMS needs `bodyText` and no `subject`/`title`/`bodyHtml`; PUSH/IN_APP need `title` + `bodyText`; WHATSAPP needs `bodyText`; unknown channel invalid.
- Parameters (`NV:108-125`) → `TEMPLATE_PARAMETER_INVALID`: name matches `^[A-Za-z][A-Za-z0-9_]*$`, dataType in enum, `displayOrder >= 0`, names unique (case-insensitive).
- Placeholders `{{name}}` (`NV:82-106`): content must match the name regex else `TEMPLATE_CONTENT_INVALID`; undeclared name → `TEMPLATE_PLACEHOLDER_UNDECLARED`; stray `{{`/`}}` → `TEMPLATE_CONTENT_INVALID`.
Success **200** (not 201) `{ success: true, data: { versionId: guid, concurrencyVersion: 1 } }` — new template with version 1 in `DRAFT`. **409** `TEMPLATE_CODE_EXISTS`.

### POST /api/v1/admin/notification-templates/{templateCode}/{channel}/versions — `.create` (`NC:92-107`)
No body. Copies the ACTIVE version (else latest RETIRED) into a new DRAFT (`NSQL:225-305`). 200 `{ success, data: { versionId, concurrencyVersion: 1 } }`. 404 `TEMPLATE_VERSION_NOT_FOUND`; 409 `TEMPLATE_DRAFT_ALREADY_EXISTS` (at most one draft per template).

### PUT /api/v1/admin/notification-templates/{templateCode}/{channel}/versions/{versionId} — `.update` (`NC:109-124`)
Body `UpdateNotificationTemplateDraftRequest` (`NReq:18-26`): `{ expectedVersion: number, subject|null, title|null, bodyText|null, bodyHtml|null, parameters: [...] }` (full replacement incl. parameters; same validation as create, channel taken from route). 200 `{ success, data: { versionId, concurrencyVersion: expectedVersion + 1 } }`. 404 `TEMPLATE_VERSION_NOT_FOUND`; 409 `TEMPLATE_NOT_EDITABLE` (not DRAFT) / `TEMPLATE_VERSION_CONFLICT` (expectedVersion ≠ stored `concurrencyVersion`); 400 validation codes. Non-GUID `versionId` (route has no `:guid` constraint, action param is `Guid`) ⇒ model-binding 400 `ValidationProblemDetails` (applies to activate/retire too).

### POST .../versions/{versionId}/activate — `.activate` (`NC:126-141`)
Body `{ expectedVersion: number }` (`NReq:28-31`). Re-validates stored content, then DRAFT → ACTIVE and the previously ACTIVE version → RETIRED (`NSQL:387-467`). 200 `{ success, data: { versionId, concurrencyVersion: expectedVersion + 1, status: "ACTIVE" } }`. 404 `TEMPLATE_VERSION_NOT_FOUND`; 409 `TEMPLATE_INVALID_STATE` (not DRAFT) / `TEMPLATE_VERSION_CONFLICT`; 400 content codes.

### POST .../versions/{versionId}/retire — `.deactivate` (`NC:143-158`)
Body `{ expectedVersion: number }`. ACTIVE → RETIRED. 200 `{ success, data: { versionId, concurrencyVersion: expectedVersion + 1, status: "RETIRED" } }`. 404 / 409 `TEMPLATE_INVALID_STATE` (not ACTIVE) / `TEMPLATE_VERSION_CONFLICT`.

Optimistic concurrency: `concurrencyVersion` from the versions list is the value to send as `expectedVersion`.

---

## C. Search & Discovery — `/api/v1/search/*`

Program: `search-discovery/src/Emcore.SearchDiscovery.Api/Program.cs` (`SP`). Contracts: `.../Contracts/Search/SearchListingsContracts.cs` (`SC`), `SearchSuggestionsContracts.cs` (`SSC`). Validators: `.../Application/Search/SearchListingsRequestValidator.cs` (`SV`), `SearchSuggestionsRequestValidator.cs` (`SSV`).

**Auth:** `[AllowAnonymous]`; the service registers no authentication at all (`SP:14-66`). Gateway: `PublicPolicy` + `AnonymousPolicy` (60/min per IP). Results are public-visibility only (verified sellers, not expired) — no admin view.

**Error body** `SearchProblemDetailsDto` (`SC:184-193`), from `SearchExceptionFilterAttribute` and the custom `InvalidModelStateResponseFactory` (`SP:20-51`):
```json
{ "type": "https://tools.ietf.org/html/rfc7807", "title": "<errorSymbol>", "status": 400, "detail": "...", "errorCode": 50901, "errorSymbol": "MARKETPLACE_SEARCH_FILTER_INVALID", "traceId": "..." }
```
Content-Type `application/json` (plain `ObjectResult`). 503 responses add `Retry-After: 30` (`Filters/SearchExceptionFilterAttribute.cs:156-159`).

| errorCode | errorSymbol | HTTP |
|---|---|---|
| 50900 | MARKETPLACE_SEARCH_INTERNAL_ERROR | 500 |
| 50901 | MARKETPLACE_SEARCH_FILTER_INVALID | 400 |
| 50902 | MARKETPLACE_SEARCH_PAGINATION_INVALID | 400 |
| 50903 | MARKETPLACE_SEARCH_PAGINATION_LIMIT_EXCEEDED | 400 |
| 50904 | MARKETPLACE_SEARCH_CURRENCY_REQUIRED | 400 |
| 50905 | MARKETPLACE_SEARCH_SORT_INVALID | 400 |
| 50906 | MARKETPLACE_SEARCH_UNAVAILABLE | 503 |

(`Domain/Exceptions/SearchErrorCodes.cs`; codes 50907-50915 exist but are not produced by these two endpoints.) Model-binding errors (e.g. `page=abc`, bad GUID) map to 50902 if the key is `page`/`pageSize`, else 50901.

### GET /api/v1/search/listings (`Controllers/SearchListingsController.cs:26-40`)
Query (`SearchListingsRequest`, `SC:6-25`; names case-insensitive):

| Param | Type | Default | Rules (`SV`) |
|---|---|---|---|
| `q` | string | — | control chars → space, whitespace collapsed, ≤200 (`:96-100`) |
| `categoryId` | GUID | — | not empty GUID |
| `brandId`, `conditionId`, `gradeId` | GUID list | — | comma-separated and/or repeated (`ModelBinding/CommaSeparatedGuidListModelBinder.cs`), ≤50 each, no empty GUID |
| `currency` | string | — | 3 ASCII letters (uppercased); **required** when `minPrice`/`maxPrice` set or sort is `price_*` (50904) |
| `minPrice`, `maxPrice` | decimal | — | ≥0, min ≤ max |
| `countryCode` | string | — | 2 letters |
| `stateOrEmirate`, `city` | string | — | ≤100 |
| `inStockOnly` | bool | false | |
| `attributes[CODE]` / `attrs[CODE]` / `attrs.CODE` / `attributes.CODE` | string | — | comma-separated values (`SearchListingsController.cs:42-90`) |
| `attr` | string (repeatable) | — | `CODE:VALUE[,VALUE]` |
| `sort` | string | `relevance` | `relevance | date_desc | price_asc | price_desc` (case-insensitive) |
| `page` | int | 1 | ≥1 |
| `pageSize` | int | 20 | 1..100; `page*pageSize ≤ 1000` (50903) |

Attribute codes: uppercased, `^[A-Z0-9_-]{1,64}$`; values ≤128 chars.

200 `SearchListingsResponse` (no envelope; `SC:35-46`):
```
{ items: ListingSearchCardDto[], page, pageSize, totalCount (number), totalPages, sort,
  pagination: { page, pageSize, totalCount, totalPages, hasPreviousPage, hasNextPage },
  facets: { categories: [{categoryId, categoryName, count}], brands|conditions|grades: [{id, name, count}],
            countries|statesOrEmirates|cities|currencies: [{key, count}],
            priceRange: { currency|null, minPrice|null, maxPrice|null }, inStockCount,
            attributes: [{ code, values: [{key, count}] }] },
  appliedFilters: { q|null, categoryId|null, brandIds[], conditionIds[], gradeIds[], currency|null, minPrice|null, maxPrice|null,
                    countryCode|null, stateOrEmirate|null, city|null, inStockOnly, attributes: { [CODE]: string[] } } }
```
`ListingSearchCardDto` (`SC:58-89`): `listingId, publishedVersionId, versionNumber, listingNumber, title, description|null, categoryId, categoryName, categoryBreadcrumb: string[], brandId|null, brandName|null, conditionId|null, conditionName|null, gradeId|null, gradeName|null, pricingMode (string, default "FIXED_PRICE"; free-form from catalog), basePrice, currency, quantityUnitId|null, quantityUnitName|null, quantityUnitSymbol|null, sellableQuantity, isAvailable, expiresAtUtc|null, primaryImage: { fileAssetId, cdnUrl }|null, seller: { sellerId, displayName, entityType, isVerified }, location: { countryCode, stateOrEmirate, city }, attributes: [{ code, textValue|null, numValue|null }], publishedAtUtc`.

Quirk: `totalCount` comes from the engine, but `items` is post-filtered in memory (unverified seller, expired, location mismatch; `Application/Search/SearchListingsService.cs:78-87`) ⇒ a page can contain fewer than `pageSize` items while `totalCount` is higher. Responses are cached in-memory.

### GET /api/v1/search/suggest (`Controllers/SearchSuggestionsController.cs:25-37`)
Query (`SSC:6-10`): `prefix` (required; sanitized, 1..100 chars), `limit:int=10` (1..25) — violations ⇒ 400 50901 (`SSV:13-56`).
200 `SearchSuggestionsDto` (`SSC:19-34`): `{ prefix: string (sanitized), limit, totalCount (=suggestions.length), suggestions: [{ text, type: "listing"|"brand"|"category", listingId|null, brandId|null, categoryId|null }] }`.
