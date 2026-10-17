# Catalog taxonomy API contract (catalog-listing service)

Extracted from the C# source in `/home/user/stockout/services/catalog-listing` (read-only). Types: `src/api/types/catalog-taxonomy.ts`.

Citation prefixes:
`API/` = `src/Emcore.CatalogListing.Api/`, `CT/` = `src/Emcore.CatalogListing.Contracts/`, `APP/` = `src/Emcore.CatalogListing.Application/`, `INF/` = `src/Emcore.CatalogListing.Infrastructure/`, `MIG/` = `Emcore.CatalogListing.Migrator/Migrations/Versioned/`, `GW/` = `/home/user/stockout/gateways/Emcore.ApiGateway/`.

---

## 1. Global conventions

### 1.1 Gateway
- `/api/v1/admin/catalog/{**}` uses `AuthenticatedRoutePolicy`. `/api/v1/catalog/{**}` uses `PublicPolicy` with the anonymous rate limiter. Paths are forwarded unchanged (`GW/appsettings.json:115-130`).
- The service does not read the JWT. It authenticates the `X-User-Id` header that the gateway injects (`building-blocks/Emcore.BuildingBlocks.Security/SecurityTypes.cs:55-88`). The frontend sends its normal bearer token to the gateway.
- The gateway turns bodiless error responses (401/403/404/429/502/503/504) into `application/problem+json` with the fields `{type,title,status,detail,code,requestId,correlationId,traceId,instance}` (`GW/Middleware/GatewayErrorHandlingMiddleware.cs:29-35,131-152`). Responses that already have a body pass through unchanged. The service's bare `401` responses have no body. Whether YARP has already started the response by that point is **ambiguous**, so handle both shapes for 401. This also applies to the 404 produced by a `:guid` route-constraint mismatch.

### 1.2 Authorization
- Every admin controller has `[Authorize]`. The default policy requires an authenticated `GatewayHeader` principal (`SecurityTypes.cs:102-108`). Without `X-User-Id` the response is **401** with an empty body.
- Each admin action also has `[RequiresPlatformPermission("<code>")]` (`API/Authorization/RequiresPlatformPermissionAttribute.cs:20-50`). This is an `IAsyncAuthorizationFilter` that calls user-organization `GET /api/internal/permissions/check?userId=&permissionCode=` with an `X-Service-Auth` header and reads `{ allowed: bool }` (`INF/Authorization/PlatformAuthorizationService.cs:45-70`). Possible results:
  - Not authenticated, or the NameIdentifier is not a GUID: **401**, empty body.
  - Permission denied, or **any** failure or timeout (10 s) of the permission call: **403** `{"error":"FORBIDDEN","message":"Insufficient permissions."}`. The check fails closed.
- All permission codes listed below are seeded in user-organization migrations, for example `services/user-organization/.../017_CatalogAttributePermissions.sql` and `020_CatalogUnitPermissions.sql`.
- Public controllers have no `[Authorize]`, or have `[AllowAnonymous]`. No fallback policy exists, so public endpoints are anonymous.

### 1.3 Headers
- **No** `X-Idempotency-Key`, `X-StepUp-Token` or `If-Match` is read by any taxonomy endpoint. Optimistic concurrency uses `expectedVersion` / `expectedCategoryVersion` in the query or body instead.

### 1.4 JSON
- `AddControllers()` has no `AddJsonOptions` (`API/Program.cs:31-42`), so ASP.NET web defaults apply:
  - Output property names are camelCase. Input matching is case-insensitive.
  - Numbers may be sent as strings.
  - Nulls are **written** as `null`, not omitted.
- No C# enums appear in these DTOs. Enum-like values are plain strings, listed below.
- `decimal` is a JSON number. `Guid` is a string.
- `DateTime` values loaded from SQL have no `Z` suffix. Create responses built in memory end in `Z`. Treat all of them as UTC.

### 1.5 Envelope
- Success: `{"success": true, "data": <T>}` (`CT/Responses/ApiResponse.cs:3-7`).
- Error: `{"error": "<CODE>", "message": "<text>" | null}` (`CT/Responses/ApiResponse.cs:9-13`). The unit controllers return `message: null`.

### 1.6 Validation errors
- Model binding or DataAnnotations failures, including malformed JSON, a missing `[FromBody]` body, or a non-GUID route value on routes without `:guid`, always return **400** `{"error":"INVALID_DATA","message":"Validation failed"}`. `InvalidModelStateResponseFactory` (`API/Program.cs:34-41`) produces this. **There are no field-level errors.** Validate on the client.
- FluentValidation is not used.
- `<Nullable>enable</Nullable>` is set (`/home/user/stockout/Directory.Build.props`), so MVC adds an **implicit `[Required]`** to every non-nullable `string` property of a request DTO. Empty, whitespace or missing values then give 400 INVALID_DATA. This is a framework default; no attribute in the code shows it. It matters for `CreateCategoryRequest.description` and `UpdateCategoryRequest.description`, `CreateBrandRequest.code` and `.name`, `UpdateBrandRequest.name`, and the attribute `code`, `name`, `dataType` and option `value`.

### 1.7 Pagination, sorting and search
- **None.** Every list endpoint returns a bare JSON array in `data`.
- Only the admin category list accepts filters.
- Sort order is fixed by the SQL and noted per endpoint.

### 1.8 Unhandled errors
- No exception middleware or filter covers these controllers. `MarketplaceExceptionFilterAttribute` is only applied to listing controllers.
- SQL exceptions surface as the ASP.NET default 500: an empty body in Production and the developer page in Development. Examples are string truncation beyond the DB column length and Dapper "reader disposed" errors.
- An unknown result code from a proc maps to 500 `{"error":"<code>","message":"Unknown error."}` in the attribute and category controllers.

### 1.9 Concurrency pattern
- Entity mutations take the entity's current `version`. A mismatch returns 409 `*_CONCURRENCY_CONFLICT`. Success returns the updated DTO with `version + 1`.
- A category mapping PUT (attributes, brands, conditions, units) takes `expectedCategoryVersion` and **bumps the category's `version`**. Re-read the category or schema afterwards.
- Deactivate/reactivate passes `expectedVersion` in two different ways:
  - **attributes, options, brands, categories:** query string `?expectedVersion=<int>`. If omitted it is 0, which normally gives a 409.
  - **units, conditions, grades:** JSON body `{"expectedVersion": <int>}`. A body is required (`{}` means 0).

---

## 2. Enumerations and models

| Name | Values | Source |
|---|---|---|
| Attribute `dataType` | `TEXT`, `INTEGER`, `DECIMAL`, `BOOLEAN`, `DATE`, `SINGLE_SELECT`, `MULTI_SELECT` (case-sensitive) | `APP/Attributes/AttributeService.cs:280` |
| Unit `unitType` | `COUNT`, `MASS`, `LENGTH`, `AREA`, `VOLUME`, `PACKAGE` (input is uppercased) | `src/Emcore.CatalogListing.Domain/Units/UnitTypes.cs`, `APP/Units/UnitService.cs:33-46` |
| `inheritanceMode` (units, conditions) | `INHERIT`, `OVERRIDE` | `CT/Units/UpdateCategoryUnitsRequest.cs:8`, `MIG/019:244`, `MIG/022:291` |

### 2.1 Attribute constraints by `dataType`
These rules come from `AttributeService.cs:272-320`. Any violation returns 400 `INVALID_ATTRIBUTE_VALIDATION`.

- **TEXT:** `minLength >= 0`, `maxLength >= minLength`. `minValue`, `maxValue` and `decimalPrecision` must be null. `regexPattern` must compile as a .NET regex.
- **INTEGER:** `minValue` and `maxValue` must be whole numbers with `min <= max`. `minLength`, `maxLength`, `regexPattern` and `decimalPrecision` must be null.
- **DECIMAL:** `min <= max`, `decimalPrecision` from 0 to 10. `minLength`, `maxLength` and `regexPattern` must be null.
- **BOOLEAN, DATE, SINGLE_SELECT, MULTI_SELECT:** every constraint field must be null.

Other attribute rules:
- `code` must already match `^[a-z0-9_]+$`. The check runs before trimming and lowercasing.
- `name` must not be blank.
- An unknown `dataType` returns `INVALID_ATTRIBUTE_DATA_TYPE`.
- `code` and `dataType` are immutable.
- Options exist only for `SINGLE_SELECT` and `MULTI_SELECT`. `value` must not be blank, `displayOrder` must be >= 0, and `value` is unique per attribute.
- You cannot deactivate the last active option of an attribute that is actively assigned to a category (`ATTRIBUTE_REQUIRES_ACTIVE_OPTION`).

### 2.2 Category tree
- The model is an adjacency list (`parentCategoryId`, null for roots) with **no depth limit** and no `depth` or `path` field.
- The admin list is flat, so build the tree on the client. The public endpoint returns a nested tree.
- `code` is trimmed and keeps its case. It is unique and immutable after create.
- `slug` is normalized: trimmed and lowercased, letters and digits kept, runs of space, `_` or `-` collapsed to a single `-`, leading and trailing `-` removed, all other characters dropped (`APP/Categories/CategoryService.cs:237-265`; TS `normalizeCategorySlug`). It is unique.
- Create rules: the parent must exist and be active. Update additionally rejects a parent equal to self or a parent that would create a cycle.
- Deactivation is blocked while the category has active children.
- Reactivation requires an active parent.

### 2.3 Category mappings
Brands, attributes, conditions and units all use the same model:
- A category has **direct** assignments.
- It **inherits** assignments from all of its ancestors.
- For brands and attributes, the nearest assignment wins.
- For units and conditions, `OVERRIDE` on a category stops inheritance above it.
- Every PUT replaces the **whole direct set**.

---

## 3. Endpoints: attributes (`API/Controllers/AdminAttributesController.cs`)

Route prefix `api/v1/admin/catalog/attributes` (L16). Route params are GUIDs without a constraint, so a non-GUID value gives 400 INVALID_DATA. The error map is at L154-176 (codes and statuses are in the TS `AttributeErrorCode`). Any other code returns 500.

| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| A1 | `GET /attributes` | `catalog.attributes.view` (L34) | – | 200 `AdminAttributeDefinitionResponse[]`, all attributes (active and inactive), ordered by `name` (`MIG/007:6`) |
| A2 | `GET /attributes/{id}` | `catalog.attributes.view` (L42) | – | 200 `AdminAttributeDefinitionResponse`. Not found: 404 `ATTRIBUTE_NOT_FOUND` "Attribute definition not found." |
| A3 | `POST /attributes` | `catalog.attributes.create` (L51) | `CreateAttributeDefinitionRequest` (`CT/Attributes/AttributeDefinitionRequests.cs:5-17`) | **201** with a `Location` header pointing to A2, body `AdminAttributeDefinitionResponse` (version 1, isActive true) |
| A4 | `PUT /attributes/{id}` | `catalog.attributes.update` (L63) | `UpdateAttributeDefinitionRequest` (L19-30) | 200 updated DTO |
| A5 | `POST /attributes/{id}/deactivate?expectedVersion=` | `catalog.attributes.deactivate` (L75) | query int | 200 DTO |
| A6 | `POST /attributes/{id}/reactivate?expectedVersion=` | `catalog.attributes.reactivate` (L87) | query int | 200 DTO |
| A7 | `GET /attributes/{id}/options` | `catalog.attributes.view` (L99) | – | 200 `AttributeOptionResponse[]`, active and inactive, ordered by `displayOrder`, then `value` (`MIG/007:252`). An **unknown id returns 200 `[]`**, not 404 |
| A8 | `POST /attributes/{id}/options` | `catalog.attributes.create` (L107) | `CreateAttributeOptionRequest` | **200**, not 201: `AttributeOptionResponse` |
| A9 | `PUT /attributes/{id}/options/{optionId}` | `catalog.attributes.update` (L119) | `UpdateAttributeOptionRequest` (`expectedVersion` is the **option** version) | 200 option |
| A10 | `POST /attributes/{id}/options/{optionId}/deactivate?expectedVersion=` | `catalog.attributes.deactivate` (L131) | query int (option version) | 200 option |
| A11 | `POST /attributes/{id}/options/{optionId}/reactivate?expectedVersion=` | `catalog.attributes.reactivate` (L143) | query int | 200 option |

Errors per action. Sources are `AttributeService.cs`, `MIG/007` and `MIG/008`.

- **A3:**
  - 400: `INVALID_ATTRIBUTE_VALIDATION`, `INVALID_ATTRIBUTE_DATA_TYPE`, `INVALID_DATA` (model)
  - 409: `ATTRIBUTE_CODE_ALREADY_EXISTS`, `ATTRIBUTE_NAME_ALREADY_EXISTS`
- **A4:**
  - 404: `ATTRIBUTE_NOT_FOUND`
  - 400: validation codes as for A3
  - 409: `ATTRIBUTE_CONCURRENCY_CONFLICT`, `ATTRIBUTE_NAME_ALREADY_EXISTS`
- **A5 and A6:**
  - 404: `ATTRIBUTE_NOT_FOUND`
  - 409: `ATTRIBUTE_CONCURRENCY_CONFLICT`, `ATTRIBUTE_ALREADY_INACTIVE` or `ATTRIBUTE_ALREADY_ACTIVE`
  - Attribute deactivation has **no** check for existing category assignments.
- **A8:**
  - 400: `INVALID_DATA` (blank value or displayOrder < 0), `ATTRIBUTE_OPTIONS_NOT_ALLOWED`
  - 404: `ATTRIBUTE_NOT_FOUND`
  - 409: `ATTRIBUTE_OPTION_ALREADY_EXISTS`
- **A9:**
  - 400: `INVALID_DATA`
  - 404: `ATTRIBUTE_OPTION_NOT_FOUND` (this includes an option that belongs to another attribute), `ATTRIBUTE_NOT_FOUND`
  - 409: `ATTRIBUTE_OPTION_CONCURRENCY_CONFLICT`, `ATTRIBUTE_OPTION_ALREADY_EXISTS`
- **A10:**
  - 404: `ATTRIBUTE_OPTION_NOT_FOUND`, `ATTRIBUTE_NOT_FOUND`
  - 409: `ATTRIBUTE_OPTION_CONCURRENCY_CONFLICT`, `ATTRIBUTE_OPTION_ALREADY_INACTIVE`, `ATTRIBUTE_REQUIRES_ACTIVE_OPTION` (`MIG/008:380-391`)
- **A11:**
  - 404: `ATTRIBUTE_OPTION_NOT_FOUND`, `ATTRIBUTE_NOT_FOUND`
  - 409: `ATTRIBUTE_OPTION_CONCURRENCY_CONFLICT`, `ATTRIBUTE_OPTION_ALREADY_ACTIVE`

Length limits are enforced **only by the DB**, and overflow gives a 500:
- `code`: 100
- `name`: 200
- `description`: 1000
- `regexPattern`: 500
- option `value`: 200

(`MIG/006:2-39`). `minValue` and `maxValue` are stored as DECIMAL(28,4).

## 4. Endpoints: brands (`API/Controllers/AdminBrandsController.cs`, `PublicBrandsController.cs`)

Route prefix `api/v1/admin/catalog/brands` (L15).

| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| B1 | `GET /brands` | `catalog.brands.view` (L33) | – | 200 `BrandResponse[]`, all brands, ordered by `name` (`MIG/012:6`) |
| B2 | `GET /brands/{brandId}` | `catalog.brands.view` (L41) | – | 200 `BrandResponse`. Not found: 404 `BRAND_NOT_FOUND` |
| B3 | `POST /brands` | `catalog.brands.create` (L52) | `CreateBrandRequest` (`CT/Brands/BrandRequests.cs:5-10`) | **200** `BrandResponse` |
| B4 | `PUT /brands/{brandId}` | `catalog.brands.update` (L67) | `UpdateBrandRequest` (L12-17) | 200 |
| B5 | `POST /brands/{brandId}/deactivate?expectedVersion=` | `catalog.brands.deactivate` (L85) | query | 200 |
| B6 | `POST /brands/{brandId}/reactivate?expectedVersion=` | `catalog.brands.reactivate` (L100) | query | 200 |

Errors:
- **B3:**
  - 400: `INVALID_DATA` (blank code or name)
  - 409: **any other code**, with message "Conflict when creating brand.". In practice that means `BRAND_CODE_ALREADY_EXISTS` or `BRAND_NAME_ALREADY_EXISTS` (`MIG/012:46,53`).
- **B4:**
  - 404: `BRAND_NOT_FOUND`
  - 400: `INVALID_DATA`
  - 409: other codes, namely `BRAND_CONCURRENCY_CONFLICT` and `BRAND_NAME_ALREADY_EXISTS`
- **B5 and B6:**
  - 404: `BRAND_NOT_FOUND`
  - 409: other codes, namely `BRAND_CONCURRENCY_CONFLICT` and `BRAND_ALREADY_INACTIVE` or `BRAND_ALREADY_ACTIVE`

Field rules:
- `code` and `name` are trimmed and must not be blank. `code` keeps its case and is immutable.
- DB limits are `code` 100, `name` 200 and `description` 500 (`MIG/011:2-15`). There are no DataAnnotations, so overflow gives a 500.

Public (anonymous):
- **P1.** `GET /api/v1/catalog/brands` returns 200 `PublicBrandResponse[]`, active brands only, ordered by name (`PublicBrandsController.cs:22-27`, `MIG/012:14`).
- **P2.** `GET /api/v1/catalog/brands/{brandId}` returns 200 `PublicBrandResponse`. A missing or **inactive** brand returns 404 `BRAND_NOT_FOUND` (L29-43).

## 5. Endpoints: categories (`API/Controllers/AdminCategoriesController.cs`, `PublicCategoriesController.cs`)

Route prefix `api/v1/admin/catalog/categories` (L15). The error map is at L99-117 (codes and statuses are in the TS `CategoryErrorCode`). Any other code returns 500.

| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| C1 | `GET /categories?search=&parentCategoryId=&isActive=` | `catalog.categories.view` (L33) | query: `search` string (SQL `LIKE %s%` on name, code and slug), `parentCategoryId` GUID (direct children only), `isActive` bool. All are optional. Omitted means unfiltered. **There is no roots-only filter** (`MIG/010:2-39`) | 200 `AdminCategoryResponse[]` (flat, includes `parentCategoryName`), ordered by `displayOrder`, then `name` |
| C2 | `GET /categories/{categoryId}` | `catalog.categories.view` (L41) | – | 200 `AdminCategoryResponse`. Not found: 404 `CATEGORY_NOT_FOUND` |
| C3 | `POST /categories` | `catalog.categories.create` (L52) | `CreateCategoryRequest` (`CT/Categories/CategoryRequests.cs:6-26`) | **201** with `Location` pointing to C2. `parentCategoryName` is **null** in this body |
| C4 | `PUT /categories/{id}` | `catalog.categories.update` (L64) | `UpdateCategoryRequest` (L28-46). `parentCategoryId: null` moves the category to the root | 200 |
| C5 | `POST /categories/{id}/deactivate?expectedVersion=` | `catalog.categories.deactivate` (L76) | query | 200 |
| C6 | `POST /categories/{id}/reactivate?expectedVersion=` | `catalog.categories.reactivate` (L88) | query | 200 |

Validation:
- DataAnnotations: `code` [Required, MaxLength 100], `slug` [Required, MaxLength 100], `description` [MaxLength 500] (and implicitly required, see 1.6), `name` [Required, MaxLength 200].
- The service also returns `INVALID_DATA` when `name`, `code` or the normalized `slug` is blank (`CategoryService.cs:64-76`).
- `displayOrder` is an int with no range.

Errors per action (`MIG/009:122-329`, `MIG/005`):
- **C3:**
  - 409: `DUPLICATE_CATEGORY_CODE`, `DUPLICATE_CATEGORY_SLUG`
  - 400: `PARENT_CATEGORY_NOT_FOUND`, `PARENT_CATEGORY_INACTIVE`
- **C4:**
  - 409: `DUPLICATE_CATEGORY_SLUG`, `CATEGORY_CONCURRENCY_CONFLICT`
  - 404: `CATEGORY_NOT_FOUND`
  - 400: `CATEGORY_PARENT_SELF_REFERENCE`, `PARENT_CATEGORY_NOT_FOUND`, `PARENT_CATEGORY_INACTIVE`, `CATEGORY_HIERARCHY_CYCLE`
- **C5:**
  - 404: `CATEGORY_NOT_FOUND`
  - 409: `CATEGORY_CONCURRENCY_CONFLICT`, `CATEGORY_ALREADY_INACTIVE`, `CATEGORY_HAS_ACTIVE_CHILDREN`
- **C6:**
  - 404: `CATEGORY_NOT_FOUND`
  - 409: `CATEGORY_CONCURRENCY_CONFLICT`, `CATEGORY_ALREADY_ACTIVE`
  - 400: `PARENT_CATEGORY_NOT_FOUND`, `PARENT_CATEGORY_INACTIVE`

Public:
- **P3.** `GET /api/v1/catalog/categories` returns 200 `PublicCategoryTreeResponse[]`: the roots of the **active** taxonomy, with nested `children` ordered by `displayOrder`, then `name` (`CategoryService.cs:32-50`, `MIG/009:48-70`). An active child of an inactive parent is dropped silently.

### 5.1 Category attributes (`AdminCategoryAttributesController.cs`, `PublicCategoryAttributesController.cs`)
| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| CA1 | `GET /api/v1/admin/catalog/categories/{categoryId}/attributes` | `catalog.category-attributes.view` (L33) | – | 200 `AdminCategoryAttributesResultResponse` `{categoryId, categoryVersion, directAssignments[], inheritedAssignments[]}`. The lists include **soft-removed rows (`isActive:false`)** and rows whose attribute definition is inactive. Inherited rows come first, root to leaf (`MIG/007:505-543`, `INF/Repositories/AttributeRepository.cs:231-263`) |
| CA2 | `PUT …/{categoryId}/attributes` | `catalog.category-attributes.manage` (L42) | `ReplaceCategoryAttributesRequest` `{expectedCategoryVersion, attributes:[{attributeDefinitionId,isRequired,displayOrder}]}` (`CT/Attributes/CategoryAttributeRequests.cs`) | 200, the same schema re-read |
| P4 | `GET /api/v1/catalog/categories/{categoryId}/attributes` (anonymous) | – | – | 200 `EffectiveCategoryAttributeResponse[]`. Nearest assignment wins. Only active options are included. Ordered inherited first, root to leaf, then `displayOrder`, then `name` (`MIG/008:497-612`) |

Errors (`AdminCategoryAttributesController.cs:54-69`):
- **CA1:**
  - 404: `CATEGORY_NOT_FOUND`
  - 409: **`CATEGORY_INACTIVE`**. An inactive category's assignments cannot be viewed.
- **CA2:**
  - 400: `INVALID_DATA` (displayOrder < 0, duplicate id, unknown or inactive attribute)
  - 404: `CATEGORY_NOT_FOUND`
  - 409: `CATEGORY_INACTIVE`, `CATEGORY_CONCURRENCY_CONFLICT`, `ATTRIBUTE_REQUIRES_ACTIVE_OPTION` (a select-type attribute with no active option), `CATEGORY_ATTRIBUTE_ALREADY_ASSIGNED` (already active on an ancestor) (`MIG/008:14-186`)
- **P4:**
  - 404: `CATEGORY_NOT_FOUND`
  - 409: `CATEGORY_INACTIVE`, `CATEGORY_HIERARCHY_INVALID` (an inactive ancestor)

### 5.2 Category brands (`AdminCategoryBrandsController.cs`, `PublicCategoryBrandsController.cs`)
| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| CB1 | `GET …/categories/{categoryId}/brands` | `catalog.category-brands.view` (L33) | – | 200 `AdminCategoryBrandResponse[]`, a **bare array** with **no categoryVersion**. Get the version from C2. The list includes soft-removed rows (`isActive:false`). An **unknown category returns 200 `[]`** (`MIG/013:2-37`) |
| CB2 | `PUT …/categories/{categoryId}/brands` | `catalog.category-brands.manage` (L41) | `ReplaceCategoryBrandsRequest` `{expectedCategoryVersion, brandIds: Guid[]}` | 200 `AdminCategoryBrandResponse[]` |
| P5 | `GET /api/v1/catalog/categories/{categoryId}/brands` | – | – | 200 `EffectiveCategoryBrandResponse[]`. An unknown or inactive category returns 200 `[]` |

CB2 errors (L52-58, `MIG/013:89-219`):
- 404: `CATEGORY_NOT_FOUND`
- 400: `INVALID_DATA` (unknown, inactive or duplicate brand)
- 409: anything else, with message "Conflict updating category brands.", namely `CATEGORY_INACTIVE`, `CATEGORY_CONCURRENCY_CONFLICT`, `CATEGORY_BRAND_ALREADY_ASSIGNED`

### 5.3 Category conditions (`AdminCategoryConditionController.cs`, `PublicCategoryConditionController.cs`)
| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| CC1 | `GET …/categories/{categoryId}/conditions` | `catalog.category-conditions.view` (L33) | – | 200 `AdminCategoryConditionsResponse` `{categoryId, categoryVersion, inheritanceMode, isConditionRequired, directAssignments[], inheritedAssignments[], effectiveConditions[]}`. **Only effective** (winning, active) rows are returned, split into direct and inherited (`MIG/022:161-248`, `APP/Conditions/CategoryConditionService.cs:21-50`) |
| CC2 | `PUT …/categories/{categoryId}/conditions` | `catalog.category-conditions.manage` (L44) | `UpdateCategoryConditionsRequest` `{expectedCategoryVersion, inheritanceMode, isConditionRequired, conditions:[{conditionId,displayOrder,isGradeRequired}]}`. `conditions` has a maximum of 50 items. `inheritanceMode` is [StringLength 50] and is trimmed and uppercased | 200 schema |
| P6 | `GET /api/v1/catalog/categories/{categoryId}/conditions` (anonymous) | – | – | 200 `PublicCategoryConditionsResponse` `{categoryId, isConditionRequired, conditions:[{…, grades:[{gradeId,code,name}]}]}`. An unknown category returns 200 with empty conditions. `isConditionRequired` comes from the category's **own** config only (`MIG/022:440-443`) |

Errors:
- **CC1:** the 404 `CATEGORY_NOT_FOUND` branch is **unreachable**, because the proc always returns a config row. For an unknown category the proc ends after the first result set, and Dapper `ReadAsync` then throws, so expect an **unhandled 500** (`INF/Repositories/Conditions/ConditionRepository.cs:138-145`).
- **CC2** (L56-62):
  - 404 "Entity not found.": `CATEGORY_NOT_FOUND`, `CONDITION_NOT_FOUND`
  - 400 "Validation failed.": `INVALID_INHERITANCE_MODE`, `INVALID_DATA` (duplicate conditionId)
  - 409: anything else, namely `CATEGORY_CONCURRENCY_CONFLICT`, `CATEGORY_INACTIVE`, `CONDITION_ALREADY_INACTIVE`, `GRADE_REQUIRED_BUT_NO_ACTIVE_GRADES`

### 5.4 Category units (`AdminCategoryUnitsController.cs`, `PublicCategoryUnitsController.cs`)
Route `categories/{categoryId:guid}/units`. A non-GUID value fails to match the route, giving a 404 with an empty body (which the gateway may rewrite).

| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| CU1 | `GET …/categories/{categoryId}/units` | `catalog.category-units.view` (L33) | – | 200 `AdminCategoryUnitsResponse` `{categoryId, categoryVersion, inheritanceMode, defaultUnitId, directAssignments[], inheritedAssignments[], effectiveUnits[]}`. An unknown category returns 200 with `categoryVersion: 0` and `INHERIT` (`MIG/019:2-77`, `APP/Units/CategoryUnitService.cs:19-34`) |
| CU2 | `PUT …/categories/{categoryId}/units` | `catalog.category-units.manage` (L41) | `UpdateCategoryUnitsRequest` `{expectedCategoryVersion, inheritanceMode (regex ^(INHERIT\|OVERRIDE)$, case-sensitive), defaultUnitId?, units:[{unitId, displayOrder, minQuantity? (>=0 Range; SQL requires >0), maxQuantity? (>= min), quantityDecimalPrecision? (0..6)}]}` (`CT/Units/UpdateCategoryUnitsRequest.cs`) | 200 schema |
| P7 | `GET /api/v1/catalog/categories/{categoryId}/units` | – | – | 200 `PublicCategoryUnitsResponse` `{categoryId, defaultUnitId (resolved), units[]}`. An unknown or inactive category returns empty units |

CU2 errors (L52-60, `ErrorResponse.message` is null):
- 404: `CATEGORY_NOT_FOUND`, `UNIT_NOT_FOUND`
- 400: `INVALID_INHERITANCE_MODE`, `INVALID_QUANTITY_RANGE`, `INVALID_QUANTITY_PRECISION`, `DEFAULT_UNIT_NOT_EFFECTIVE`
- 409: anything else, namely `CATEGORY_CONCURRENCY_CONFLICT`, `CATEGORY_INACTIVE`, `UNIT_INACTIVE`, `CATEGORY_UNIT_ALREADY_ASSIGNED` (`MIG/019:201-484`)

> **BROKEN:** `CategoryUnitService.UpdateDirectAssignmentsAsync` serializes `request.Units` with default `JsonSerializer` options, which produce PascalCase keys (`"UnitId"`) (`APP/Units/CategoryUnitService.cs:62`). The proc reads `'$.unitId'`, `'$.minQuantity'` and so on, and SQL JSON paths are case-sensitive (`MIG/019:256-261,455-459`). Every element therefore resolves `unitId = NULL`, and **any non-empty `units` array returns 404 `UNIT_NOT_FOUND`**. Only `units: []` works: it clears direct units and sets the mode and default.

### 5.5 Listing requirements (`PublicListingRequirementsController.cs`)
- **P8.** `GET /api/v1/catalog/categories/{categoryId:guid}/listing-requirements` (anonymous).
- Success is 200 `ListingRequirementsResponse` `{categoryId, attributes: EffectiveCategoryAttributeResponse[], brands: EffectiveCategoryBrandResponse[], unitRules: PublicCategoryUnitsResponse, conditionRules: PublicCategoryConditionsResponse}` (`CT/Validation/ListingRequirementsResponse.cs`).
- Errors:
  - 404: `CATEGORY_NOT_FOUND`
  - 409: `CATEGORY_INACTIVE`, `CATEGORY_HIERARCHY_INVALID`
  - 500: anything else

The state is validated through the attribute effective-schema proc (`APP/Validation/ListingRequirementsService.cs:32-56`).

## 6. Endpoints: conditions (`API/Controllers/ConditionController.cs`, class `AdminConditionController`)

Route prefix `api/v1/admin/catalog/conditions` (L16).
- `MapResult` (L115-120): any code containing `NOT_FOUND` returns 404 "Entity not found.". Any other non-success code returns 409 "Business rule or concurrency conflict.".
- Create returns **200**.

| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| D1 | `GET /conditions` | `catalog.conditions.view` (L33) | – | 200 `ConditionResponse[]` ordered by `displayOrder`, then `name` (`MIG/021:426-436`) |
| D2 | `GET /conditions/{conditionId}` | `catalog.conditions.view` (L41) | – | 200 `ConditionResponse`. Not found: 404 `CONDITION_NOT_FOUND` |
| D3 | `POST /conditions` | `catalog.conditions.create` (L50) | `CreateConditionRequest`: `code` [Required, StringLength 50] (trimmed and lowercased), `name` [Required, 100], `description` [500], `displayOrder` int (`CT/Conditions/MasterDtos.cs:6-21`) | 200 `ConditionResponse` |
| D4 | `PUT /conditions/{conditionId}` | `catalog.conditions.update` (L59) | `UpdateConditionRequest` `{name, description?, displayOrder, expectedVersion}` | 200 |
| D5 | `POST /conditions/{conditionId}/deactivate` | `catalog.conditions.deactivate` (L68) | body `{expectedVersion}` | 200 |
| D6 | `POST /conditions/{conditionId}/reactivate` | `catalog.conditions.reactivate` (L77) | body `{expectedVersion}` | 200 |
| D7 | `GET /conditions/{conditionId}/grades` | `catalog.conditions.view` (L86) | – | 200 `ConditionGradeResponse[]`, **including removed mappings (`isActive:false`)**. `isActive` is the mapping flag. Ordered by grade `displayOrder`, then `name` (`MIG/022:137-158`). Not found: 404 `CONDITION_NOT_FOUND` |
| D8 | `PUT /conditions/{conditionId}/grades` | **`catalog.conditions.update`** (L97) | `UpdateConditionGradesRequest` `{expectedVersion (condition version; bumped), grades:[{gradeId, displayOrder}]}`, maximum 100 items (`CT/Conditions/MappingDtos.cs:16-24`) | 200 `ConditionGradeResponse[]` |

Errors (`MIG/021`, `MIG/022:3-136`):
- **D3:** 409 `CONDITION_CODE_ALREADY_EXISTS`, `CONDITION_NAME_ALREADY_EXISTS`
- **D4:**
  - 404: `CONDITION_NOT_FOUND`
  - 409: `CONDITION_CONCURRENCY_CONFLICT`, `CONDITION_NAME_ALREADY_EXISTS`
- **D5 and D6:**
  - 404: `CONDITION_NOT_FOUND`
  - 409: `CONDITION_CONCURRENCY_CONFLICT`, `CONDITION_ALREADY_INACTIVE` or `CONDITION_ALREADY_ACTIVE`
  - Deactivation has no check for existing category usage.
- **D8:**
  - 400: `INVALID_DATA` (duplicate gradeId)
  - 404: `CONDITION_NOT_FOUND`, `GRADE_NOT_FOUND`
  - 409: `CONDITION_CONCURRENCY_CONFLICT`, `GRADE_ALREADY_INACTIVE`, `CONDITION_GRADE_MAPPING_CONFLICT` (an empty list while a category has `isGradeRequired` for this condition)

## 7. Endpoints: grades (`API/Controllers/AdminGradeController.cs`)

Route prefix `api/v1/admin/catalog/grades` (L16). The `MapResult` rules are the same as for conditions (L85-90).

| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| G1 | `GET /grades` | `catalog.grades.view` (L33) | – | 200 `GradeResponse[]` ordered by `displayOrder`, then `name` |
| G2 | `GET /grades/{gradeId}` | `catalog.grades.view` (L41) | – | 200. Not found: 404 `GRADE_NOT_FOUND` |
| G3 | `POST /grades` | `catalog.grades.create` (L50) | `CreateGradeRequest`, with the same rules as condition create (`MasterDtos.cs:50-65`) | 200 `GradeResponse` |
| G4 | `PUT /grades/{gradeId}` | `catalog.grades.update` (L59) | `UpdateGradeRequest` `{name, description?, displayOrder, expectedVersion}` | 200 |
| G5 | `POST /grades/{gradeId}/deactivate` | `catalog.grades.deactivate` (L68) | body `{expectedVersion}` | 200 |
| G6 | `POST /grades/{gradeId}/reactivate` | `catalog.grades.reactivate` (L77) | body `{expectedVersion}` | 200 |

Errors (`MIG/021:215-415`):
- 409: `GRADE_CODE_ALREADY_EXISTS`, `GRADE_NAME_ALREADY_EXISTS`, `GRADE_CONCURRENCY_CONFLICT`, `GRADE_ALREADY_ACTIVE`, `GRADE_ALREADY_INACTIVE`
- 404: `GRADE_NOT_FOUND`
- Grade deactivation has no check for existing mappings.

## 8. Endpoints: units (`API/Controllers/AdminUnitsController.cs`)

Route prefix `api/v1/admin/catalog/units` (L15). `{unitId:guid}` is route-constrained. All errors are `{error, message:null}`.

| # | Method & path | Permission | Request | Success |
|---|---|---|---|---|
| U1 | `GET /units` | `catalog.units.view` (L33) | – | 200 `UnitResponse[]` ordered by `name` (`INF/Repositories/UnitRepository.cs:23`) |
| U2 | `GET /units/{unitId}` | `catalog.units.view` (L41) | – | 200. Not found: 404 `{"error":"UNIT_NOT_FOUND","message":"Unit not found"}` |
| U3 | `POST /units` | `catalog.units.create` (L50) | `CreateUnitRequest`: `code` [Required, StringLength 50] (lowercased), `name` [Required, 100], `symbol` [Required, 20], `description` [500], `unitType` [Required, 50] (uppercased, must be a `UnitType`), `decimalPrecision` [Range 0..6] (`CT/Units/CreateUnitRequest.cs`) | **200** `UnitResponse` |
| U4 | `PUT /units/{unitId}` | `catalog.units.update` (L60) | `UpdateUnitRequest` `{name, symbol, description?, decimalPrecision, expectedVersion}` | 200 |
| U5 | `POST /units/{unitId}/deactivate` | `catalog.units.deactivate` (L71) | body `{expectedVersion}` | 200 |
| U6 | `POST /units/{unitId}/reactivate` | `catalog.units.reactivate` (L81) | body `{expectedVersion}` | 200 |

Errors (`MIG/018`):
- **U3:**
  - 400: `INVALID_UNIT_TYPE`, `INVALID_DATA`
  - 409: `UNIT_CODE_ALREADY_EXISTS`, `UNIT_NAME_ALREADY_EXISTS` (case-insensitive collation, `MIG/017:41-46`)
- **U4:**
  - 404: `UNIT_NOT_FOUND`
  - 409: `UNIT_CONCURRENCY_CONFLICT`, `UNIT_NAME_ALREADY_EXISTS`
- **U5 and U6:**
  - 404: `UNIT_NOT_FOUND`
  - 409: `UNIT_CONCURRENCY_CONFLICT`, `UNIT_ALREADY_INACTIVE` or `UNIT_ALREADY_ACTIVE`
- `INVALID_QUANTITY_PRECISION` is effectively unreachable, because `[Range(0,6)]` fails first with `INVALID_DATA`.

## 9. Public endpoints that do not exist
- There are **no** public `GET /api/v1/catalog/units`, `/attributes` or `/conditions` endpoints. Units, attributes, brands and conditions are exposed publicly only per category, under `/api/v1/catalog/categories/{categoryId}/…`.
- The only public catalogue list is `GET /api/v1/catalog/brands`.

## 10. Known defects and ambiguities
1. **Category units PUT is broken for non-empty `units`** (section 5.4).
2. `AdminCategoryConditionDto.isActive` is **always false**, because the proc never selects `IsActive` (`MIG/022:232-243`).
3. CC1 returns an unhandled 500 for an unknown category instead of 404.
4. CB1, CU1, A7 and P5–P7 return 200 with empty data for unknown categories or attributes, instead of 404.
5. CA1 returns 409 `CATEGORY_INACTIVE` for inactive categories, so the admin UI cannot view their attribute assignments.
6. Inconsistencies across endpoints:
   - `expectedVersion` is sent in the query for attributes, brands and categories, but in the body for units, conditions and grades.
   - Create returns 201 for attributes and categories, but 200 for options, brands, units, conditions and grades.
   - Units return `message: null` while the other endpoints include a message.
7. Length limits for brands and attributes exist only in the DB, so overflow gives a 500. Enforce them on the client.
8. The implicit `[Required]` on non-nullable strings (section 1.6) is inferred from the framework, not from code. Most significantly, it makes category `description` effectively required.
9. Whether the gateway rewrites the service's bodiless 401 and route-404 responses into problem+json is ambiguous (section 1.1).
