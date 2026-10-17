# user-organization service — HTTP contract reference

Source: `/home/user/stockout/services/user-organization` (read-only). Everything below comes from the C# code and SQL migrations.
Paths are abbreviated:

- `C/` = `services/user-organization/src/Emcore.UserOrganization.Api/Controllers/`
- `S/` = `services/user-organization/src/Emcore.UserOrganization.Application/`
- `R/` = `services/user-organization/src/Emcore.UserOrganization.Infrastructure/`
- `K/` = `services/user-organization/src/Emcore.UserOrganization.Contracts/`
- `M/` = `services/user-organization/Emcore.UserOrganization.Migrator/Migrations/Versioned/`

TypeScript types: `src/api/types/user-organization.ts`.

---

## 1. Global conventions

### 1.1 JSON serialization
- `Program.cs` calls only `builder.Services.AddControllers()`. It has no `AddJsonOptions`, no `JsonStringEnumConverter` and no `ConfigureHttpJsonOptions` (`src/Emcore.UserOrganization.Api/Program.cs:10`). That means the ASP.NET Core **web defaults** apply:
  - **camelCase** property names, case-insensitive when reading request bodies.
  - **Null values are written** (`"message": null`, `"legalName": null`). Nothing is omitted.
  - C# enums would be serialized as **integers**, but no response DTO has a C# enum property. Every enum-like field is a plain `string` that comes from SQL or a C# literal. Section 6 lists the exact values.
- **Guid** values are serialized as lowercase `"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`.
- **DateTime**: values read from SQL through Dapper have `Kind=Unspecified`, so they are serialized **without** a `Z` or offset, for example `"2026-10-17T10:00:00.1234567"`. They are UTC by convention (`*Utc` columns use `GETUTCDATE()` or `SYSUTCDATETIME()`). Values built in C# with `DateTime.UtcNow` and echoed back without a DB round-trip **do** end in `Z`: the batch-invite `expiresAtUtc` and the `POST seller document` `createdAtUtc`. The frontend should parse every timestamp as UTC whether or not it has a `Z`.
- An unset non-nullable `DateTime` serializes as `"0001-01-01T00:00:00"`. This happens in the admin seller list (see 5.1).

### 1.2 Success envelope
Almost every success body is `{ "success": true, "data": <T> }`. Two mechanisms produce it:
- `BaseApiController.MapResult` → `Ok(new { success = true, data = res.Value })` (`C/BaseApiController.cs:13-18`).
- `ApiResponse<T>` { `Success`, `Data` } (`K/Responses/ApiResponse.cs:3-7`).

Both serialize the same way. "Void" operations return `{ "success": true, "data": {} }`.
**Exception:** `POST /platform/users/invitations/batch` returns the DTO `BatchInvitePlatformUsersResponse` directly. It happens to have the same `{success, data}` shape (see 4.x).

**No endpoint in this service paginates, filters (except invitations), or sorts via query params.** Every list returns a full JSON array in `data`.

### 1.3 Error shapes (there are FIVE, depending on the endpoint)
The service registers **no exception-handling middleware** and no `ProblemDetails` service (`Program.cs`). The shapes are:

| # | Shape | Produced by | Endpoints |
|---|---|---|---|
| E1 | `ErrorResponse` `{ "error": string, "message": string \| null }` | `K/Responses/ApiResponse.cs:9-13` | platform/permissions, roles, users, invitations, settings, feature-flags |
| E2 | ProblemDetails `{ "type": "https://emcore.platform/errors/{status}", "title": string, "status": number, "detail": string, "traceId": string }` | `MapResult` → `Problem(...)` (`C/BaseApiController.cs:20-33`) | users/me, organizations, platform/admins, platform/me/roles, marketplace/*, admin/marketplace (non-403) |
| E3 | `{ "error": string, "message": string }` (anonymous object, so the same JSON as E1) | `C/Marketplace/AdminMarketplaceSellersController.cs:32,44,52,59,67` | admin/marketplace 403s and INVALID_ACTION |
| E4 | `{ "code": "MARKETPLACE_SELLER_ACCESS_DENIED" }` | `C/Marketplace/MarketplaceSellersController.cs:43,53`, `MarketplaceSellerDocumentsController.cs:31,41,51` | marketplace/sellers/{id}*, documents |
| E5 | ValidationProblemDetails `{ "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1", "title": "One or more validation errors occurred.", "status": 400, "errors": { "<Field>": ["msg", ...] }, "traceId": string }` | automatic `[ApiController]` model-state filter | any endpoint with a body or a Guid route param |

E2 details:
- `title` is `ErrorType.ToString()`: one of `"Failure" | "Validation" | "NotFound" | "Conflict" | "Forbidden"`. It is `"Error"` when the `Error` object is null.
- Status mapping: NotFound→404, Forbidden→403, Conflict→409, Validation→400, **anything else (including `Failure`, the default)→500**.
- `detail` is `Error.Message`. Many services set only `Error.Code` and leave `Message` empty, so `detail` is often `""`. **The machine-readable `Error.Code` is NOT included in E2 responses.** For example, marketplace `MARKETPLACE_SELLER_VERSION_CONFLICT` and `MARKETPLACE_SELLER_TRANSITION_INVALID` both arrive as `409 {title:"Conflict", detail:""}` and cannot be told apart.
- `traceId` is added by ASP.NET Core's default `ProblemDetailsFactory`.
- Content-Type: `Problem()` asks for `application/problem+json`, but the base controller has `[Produces("application/json")]`, which most likely forces `application/json`. Do not branch on the content type.

E5 details:
- `[ApiController]` is on `BaseApiController` (`C/BaseApiController.cs:9`), so invalid model state returns 400 E5 **before** the action runs. The `if (!ModelState.IsValid) return BadRequest(ModelState)` lines in the controllers are therefore effectively unreachable.
- `errors` keys are the **C# property names (PascalCase)**, e.g. `"Email"`, `"RoleCodes"`, `"ExpectedVersion"`. No `SystemTextJsonValidationMetadataProvider` is configured. Malformed JSON gives keys like `"$.email"` and/or `"request"`.
- A malformed Guid in a route (e.g. `/platform/users/abc`) also returns 400 E5, because route params have **no route constraints**; they are bound as `Guid` and fail model binding.
- **Implicit required:** `Nullable` is enabled in all projects (`/home/user/stockout/Directory.Build.props`). ASP.NET MVC therefore treats every **non-nullable `string`/reference property** as `[Required]`, which also rejects `""`. The request tables mark these "required (implicit)".

Other status codes:
- **401**: `[Authorize]` on every controller, default policy = authenticated `GatewayHeader` scheme. With no `X-User-Id` header the service sends a challenge, so 401 with an empty body. In practice the gateway rejects first (JWT validation plus active-session check), so 401/403 normally come from the **gateway**, not this service.
- **500 (unhandled)**: DB exceptions, `Guid.Parse` failures, etc. are not caught. There is no exception handler, so the body is empty in Production (developer exception page in Development).

### 1.4 Identity, authorization and tenancy
- **Identity:** the browser sends a JWT to the gateway. The gateway validates it, checks the session is active, strips any client-supplied `X-User-Id`/`X-Session-Id`/`X-Internal-*` headers, and injects `X-User-Id`, `X-Session-Id`, `X-User-Email` and `X-Email-Verified` (`gateways/Emcore.ApiGateway/Extensions/GatewayExtensions.cs:303-334`, `Middleware/HeaderManagementMiddleware.cs`). The service turns those headers into claims `sub`/`NameIdentifier`, `sid`, `email` and `email_verified` (`building-blocks/Emcore.BuildingBlocks.Security/SecurityTypes.cs:42-89`). `UserId` = `Guid.Parse(sub)` (`C/BaseApiController.cs:36-43`).
- **Permission enforcement is imperative, not attribute-based.** No `[Authorize(Policy=...)]` or filters are used. Each action calls `IPlatformPermissionService.HasPermissionAsync(UserId, "<code>")`, which loads the user's effective permission codes from `dbo.PR_PLATFORM_PERMISSION_GET_BY_USER` and compares them case-insensitively (`S/Services/PlatformPermissionService.cs:32-36`). Effective permissions (`M/011_Procedures_PlatformUsersAndInvitations.sql:1-42`):
  - User has `PLATFORM_USER_ACCESS.IsEnabled = 0` → **no permissions**.
  - User has an active `PlatformSuperAdmin` role → **every active permission**.
  - Otherwise → the union of the active permissions of the user's active roles.
- Some endpoints check the **role** `PlatformSuperAdmin` instead of a permission (platform/admins). Organization endpoints check **membership** or the `PlatformSuperAdmin`/`PlatformAdmin` role. Marketplace seller endpoints check **seller membership**.
- **Tenancy:** there is no tenant or organization header. Organizations and sellers (a seller is an `ORGANIZATION` row plus a `SELLER_PROFILE` row) are scoped through `ORGANIZATION_MEMBER` lookups on the current `UserId`.
- **No `X-Idempotency-Key`, `X-StepUp-Token`, `If-Match` or other custom request headers are read anywhere in this service.** A grep for `Idempotency`/`StepUp` returns nothing. Optimistic concurrency uses body fields instead: `expectedVersion` (settings/flags) and `expectedRowVersion` (sellers).

---

## 2. Users & organizations

### 2.1 `GET /api/v1/users/me` — `C/UsersController.cs:21`
| | |
|---|---|
| Auth | authenticated; no permission |
| Success | 200 `{success:true, data: UserProfileResponse}` |
| Errors | 404 E2 `{title:"NotFound", detail:"Profile not found."}` when no `USER_PROFILE` row exists (`S/Services/UserProfileService.cs:31-32`) |

`UserProfileResponse` (`K/Responses/UserProfileResponse.cs`): `userId: guid, displayName: string|null, firstName: string|null, lastName: string|null, preferredLocale: string|null, timeZone: string|null, profileImageAssetId: guid|null, createdAtUtc: datetime, updatedAtUtc: datetime`.

### 2.2 `PUT /api/v1/users/me` — `C/UsersController.cs:27`
Body `UpdateUserProfileRequest` (`K/Requests/UpdateUserProfileRequest.cs`): `displayName: string` **[Required]**, `firstName?: string|null`, `lastName?: string|null`, `preferredLocale?: string|null`, `timeZone?: string|null`, `profileImageAssetId?: guid|null`.
This is an **upsert** (it creates the profile if missing). Success: 200 `{success, data: UserProfileResponse}`.
Errors:
- 400 E5.
- 400 E2 `{title:"Validation", detail:"Invalid ProfileImageAssetId."}` when a new `profileImageAssetId` fails validation with inventory-media (`S/Services/UserProfileService.cs:42-48`).

⚠ Sending `profileImageAssetId: null` does **not** clear the image: the SQL does `ISNULL(@ProfileImageAssetId, ProfileImageAssetId)` (`M/011_UserProfile_ProfileImage.sql:24`). The service still **deletes the old file** in inventory-media (`UserProfileService.cs:65-68`), so the profile ends up pointing at a deleted asset. Avoid sending null when an image is already set.

### 2.3 `POST /api/v1/organizations` — `C/OrganizationsController.cs:23`
Body `CreateOrganizationRequest` (`K/Requests/CreateOrganizationRequest.cs`): `organizationType: string` [Required], `displayName: string` [Required], `legalName: string|null`, `countryCode: string` [Required], `defaultCurrency: string` [Required]. No value validation is done (any `organizationType` string is accepted; DB columns are `VARCHAR(50)`/`(10)`).
Success: 200 (not 201) `{success, data: OrganizationResponse}` with `isOwner: true`, `status: "Active"`.

`OrganizationResponse` (`K/Responses/OrganizationResponse.cs`): `organizationId: guid, organizationType: string, displayName: string, legalName: string|null, countryCode: string, defaultCurrency: string, status: string, isOwner: boolean`.

### 2.4 `GET /api/v1/organizations` — `C/OrganizationsController.cs:29`
Returns the organizations where the caller has an `Active` membership: 200 `{success, data: OrganizationResponse[]}`. This includes marketplace sellers, because they are organizations too.
⚠ `isOwner` is **hard-coded `true`** for every item (`S/Services/OrganizationService.cs:175`).

### 2.5 `GET /api/v1/organizations/{organizationId:guid}` — `C/OrganizationsController.cs:35`
Access: an active member, **or** a user holding the role `PlatformSuperAdmin`/`PlatformAdmin`. This is a role check, not a permission check: `organizations.view` is NOT consulted (`OrganizationService.cs:178-197`).
Errors:
- 403 E2 `detail:"Access denied."`.
- 404 E2 `detail:"Organization not found."`. The access check runs first, so a non-admin always gets 403 for an unknown id.

### 2.6 `PUT /api/v1/organizations/{organizationId:guid}` — `C/OrganizationsController.cs:41`
Body `UpdateOrganizationRequest`: `displayName: string` [Required], `legalName: string|null`.
Access: an active **owner**, or the `PlatformSuperAdmin`/`PlatformAdmin` role (`organizations.update` is not consulted).
Errors: 403 E2 `"Only owners can update."`, 404 E2 `"Organization not found."`.
Success: 200 `{success, data: OrganizationResponse}`. `isOwner` is the caller's real owner flag, or `false` for an admin.

---

## 3. Platform — admins, me, permissions, roles

### 3.1 `GET /api/v1/platform/admins` — `C/PlatformAdminsController.cs:26`
Auth: **role `PlatformSuperAdmin`** (`S/Services/PlatformAdminService.cs:84-93`), else 403 E2 `"Insufficient permissions."`.
Success: `{success, data: PlatformAdminResponse[]}` = `[{ userId: guid, displayName: string|null, roles: string[] }]`. Only users holding `PlatformAdmin` or `PlatformSuperAdmin` are included, and `roles` contains only those two codes (`M/004_PlatformAdminManagement.sql`, `PR_PLATFORM_ADMIN_LIST`).

### 3.2 `GET /api/v1/platform/admins/{userId:guid}/roles` — `C/PlatformAdminsController.cs:33`
Auth: role `PlatformSuperAdmin`.
Errors:
- 403 E2 `"Insufficient permissions."`.
- 404 E2 `"User not found."` when there is no `USER_PROFILE` row.

Success: `{success, data: CurrentPlatformRolesResponse}` = `{ userId: guid, roles: [{code, name}] }`. This lists **all** the user's roles, including inactive ones.

### 3.3 `POST /api/v1/platform/admins/{userId:guid}/roles` — `C/PlatformAdminsController.cs:50`
Body `AssignPlatformRoleRequest`: `{ roleCode: string }` [Required]. Auth: role `PlatformSuperAdmin`.
`roleCode` must be exactly `"PlatformAdmin"` or `"PlatformSuperAdmin"` (`M/005_PlatformAdminToolCompatibilityFix.sql:47`).
Success: 200 `{success, data: PlatformRoleAssignmentResponse}` = `{ userId, roleCode, assigned: boolean, message: string|null }`:
- `assigned:false, message:"Role already assigned."` when the user already had the role.
- `assigned:true, message:null` on a new assignment.

Errors (E2):
- 403 `"Insufficient permissions."`.
- 400 `"Invalid platform role."`.
- 404 `"User not found."` / `"Role not found."`.
- 500 `"An unexpected error occurred."`.

### 3.4 `DELETE /api/v1/platform/admins/{userId:guid}/roles/{roleCode}` — `C/PlatformAdminsController.cs:57`
`roleCode` is a string path segment: `PlatformAdmin` | `PlatformSuperAdmin`. Auth: role `PlatformSuperAdmin`.
Success: 200 `{success:true, data:true}`. Revoking a role the user does not hold is also a success.
Errors (E2):
- 403.
- 400 `"Invalid platform role."`.
- 404 `"User not found."`/`"Role not found."`.
- **409 `"At least one PlatformSuperAdmin must remain assigned."`**.
- 500.

### 3.5 `GET /api/v1/platform/me/roles` — `C/PlatformMeController.cs:20`
Auth: any authenticated user. Success: `{success, data: {userId, roles:[{code,name}]}}`. Includes inactive roles.

### 3.6 `GET /api/v1/platform/me/permissions` — `C/PlatformMeController.cs:27`
Auth: any authenticated user. Success: `{success, data: CurrentPlatformPermissionsResponse}` = `{ userId: guid, permissions: string[] }`. These are the effective codes from 1.4: all active codes for a super admin, `[]` for a disabled user. **Use this endpoint to gate menus.**

### 3.7 `GET /api/v1/platform/permissions` — `C/PlatformPermissionsController.cs:23`
Permission: **`permissions.view`**, else 403 E1 `{error:"FORBIDDEN", message:"You do not have permission to view permissions."}`.
Success: `{success, data: PlatformPermissionResponse[]}` = `[{ platformPermissionId: guid, code, name, description: string|null, module: string }]`. Only active permissions, ordered by module then name.

### 3.8 Roles — `C/PlatformRolesController.cs`
All 403s are E1 `{error:"FORBIDDEN", message:"You do not have permission to <verb> roles."}`.

| Method & path | Line | Permission | Body | Success | Errors |
|---|---|---|---|---|---|
| `GET /api/v1/platform/roles` | 33 | `roles.view` | — | 200 `{success, data: PlatformRoleListResponse[]}` (all roles incl. inactive, ordered by name) | 403 |
| `GET /api/v1/platform/roles/assignable` | 43 | `platform-users.invite` | — | 200 `{success, data: PlatformRoleListResponse[]}` (active only; non-super-admins get non-system roles only) | 403 E1 (permission), 403 E1 `{error:"FORBIDDEN", message:"User is not active."}` when the caller has no USER_PROFILE or is disabled |
| `GET /api/v1/platform/roles/{roleId:guid}` | 75 | `roles.view` | — | 200 `{success, data: PlatformRoleDetailResponse}` | 403, 404 E1 `{error:"ROLE_NOT_FOUND", message:null}` |
| `POST /api/v1/platform/roles` | 88 | `roles.create` | `CreatePlatformRoleRequest` | **201** `{success, data: PlatformRoleDetailResponse}` (`permissions: []`, `isSystemRole:false`, `isActive:true`) | 403, 400 E5, 409 E1 `{error:"DUPLICATE_ROLE_CODE"}`, 500 E1 `{error:"INTERNAL_SERVER_ERROR", message:"An unexpected error occurred."}` |
| `PUT /api/v1/platform/roles/{roleId:guid}` | 110 | `roles.update` | `UpdatePlatformRoleRequest` | 200 `{success, data: PlatformRoleDetailResponse}` | 403, 400 E5, 404 `ROLE_NOT_FOUND`, 500 |
| `DELETE /api/v1/platform/roles/{roleId:guid}` (deactivates; soft) | 131 | `roles.deactivate` | — | 200 `{success:true, data:{}}` | 403, 404 `ROLE_NOT_FOUND`, 409 `{error:"SYSTEM_ROLE_PROTECTED"}` (any `isSystemRole` role), 500 |
| `GET /api/v1/platform/roles/{roleId:guid}/permissions` | 151 | `roles.view` | — | 200 `{success, data: PlatformPermissionResponse[]}` | 403, 404 `ROLE_NOT_FOUND` |
| `PUT /api/v1/platform/roles/{roleId:guid}/permissions` (full replace) | 164 | `roles.update` | `UpdatePlatformRolePermissionsRequest` | 200 `{success:true, data:{}}` | 403, 400 E5, 404 `ROLE_NOT_FOUND`, 409 `{error:"SYSTEM_ROLE_PERMISSIONS_PROTECTED"}` (only the role with code `PlatformSuperAdmin`; `PlatformAdmin` CAN be edited), 400 `{error:"INVALID_PERMISSION"}` (an unknown or inactive code), 500 |

DTOs (`K/PlatformRoles/*`):
- `CreatePlatformRoleRequest`:
  - `code: string`: [Required], MaxLength 100, regex `^[a-zA-Z0-9\-_]+$` (message "Code can only contain letters, numbers, hyphens, and underscores.").
  - `name: string`: [Required], MaxLength 150.
  - `description: string|null`: MaxLength 500.
- `UpdatePlatformRoleRequest`: `name` [Required] max 150, `description: string|null` max 500. The code cannot be changed.
- `UpdatePlatformRolePermissionsRequest`: `permissionCodes: string[]` [Required]. An empty array is allowed and clears the role's permissions.
- `PlatformRoleListResponse`: `platformRoleId, code, name, description: string|null, isSystemRole, isActive, userCount: int, permissionCount: int`.
- `PlatformRoleDetailResponse`: `platformRoleId, code, name, description: string|null, isSystemRole, isActive, permissions: PlatformPermissionResponse[]`.

⚠ For the role-detail `permissions` and for `GET roles/{id}/permissions`, `description` is **always `null`**: `PR_PLATFORM_ROLE_PERMISSION_GET` does not select it (`M/008_Procedures_PlatformRbac.sql:150-167`).
⚠ `/roles/assignable` super-admin detection is broken (see 4.1 bug): super admins also get **only non-system roles**.

---

## 4. Platform users & invitations

### 4.1 Users — `C/PlatformUsersController.cs`
403s are E1 `{error:"FORBIDDEN", message:"Insufficient permissions."}`. Other E1 errors have `message: null`.

| Method & path | Line | Permission | Body | Success | Errors |
|---|---|---|---|---|---|
| `GET /api/v1/platform/users` | 31 | `platform-users.view` | — | 200 `{success, data: PlatformUserListResponse[]}` (users having any platform role or a PLATFORM_USER_ACCESS row; ordered by displayName) | 403 |
| `GET /api/v1/platform/users/{userId:guid}` | 41 | `platform-users.view` | — | 200 `{success, data: PlatformUserDetailResponse}` | 403, 404 `{error:"USER_NOT_FOUND"}` |
| `PUT /api/v1/platform/users/{userId:guid}/roles` (full replace) | 54 | **both** `platform-users.update` AND `roles.assign` | `UpdatePlatformUserRolesRequest` | 200 `{success:true, data:{}}` | 403, 400 E5, 404 `USER_NOT_FOUND`, 400 `{error:"INVALID_ROLE"}` (unknown/inactive code), 409 `{error:"LAST_SUPER_ADMIN_REQUIRED"}`, 500 `{error:"INTERNAL_SERVER_ERROR"}` |
| `POST /api/v1/platform/users/{userId:guid}/disable` | 73 | `platform-users.disable` | `DisablePlatformUserRequest` | 200 `{success:true, data:{}}` | 403, 400 E5, 404 `USER_NOT_FOUND`, 409 `LAST_SUPER_ADMIN_REQUIRED`, 500 |
| `POST /api/v1/platform/users/{userId:guid}/enable` | 91 | `platform-users.enable` | none | 200 `{success:true, data:{}}` | 403, 404 `USER_NOT_FOUND`, 500 |

DTOs (`K/PlatformUsers/PlatformUsersModels.cs`):
- `UpdatePlatformUserRolesRequest`: `{ roleCodes: string[] }` [Required]. Empty is allowed.
- `DisablePlatformUserRequest`: `{ reason: string }`. This is **required (implicit), so it must be non-empty**. The DB column is `NVARCHAR(500)`.
- `PlatformUserListResponse` and `PlatformUserDetailResponse` have the same shape: `{ userId: guid, email: string, displayName: string, isEnabled: boolean, roles: PlatformUserRoleModel[] }`.
  - `PlatformUserRoleModel` = `{ code: string, name: string }`.
  - `email` and `displayName` are `""` when null in the DB.

⚠ **BUG — `roles[].code`/`name` are always `""`.** The procs emit `FOR JSON PATH` with lowercase aliases `code`/`name` (`M/011_Procedures_PlatformUsersAndInvitations.sql`, `PR_PLATFORM_USER_LIST`/`_GET`). The repository deserializes them with default `System.Text.Json` options, which are case-sensitive, into PascalCase `Code`/`Name` (`R/Repositories/PlatformUserRepository.cs`). The array length is correct, but each entry is `{code:"", name:""}`. The same bug makes the `isSuperAdmin` check in `/roles/assignable` always false. Until this is fixed, use `GET /platform/admins/{id}/roles` (super admin only) or `/platform/me/roles` to get role codes.
⚠ `PUT users/{id}/roles` has **no system-role restriction**: any holder of `platform-users.update` + `roles.assign` can grant `PlatformSuperAdmin` (`M/012_PlatformUsersAndInvitationsStage2Fix.sql:214`). Invitations do enforce that restriction.

### 4.2 Invitations — `C/PlatformInvitationsController.cs` (route prefix `api/v1/platform`)
403s are E1 `{error:"FORBIDDEN", message:"Insufficient permissions."}`.

| Method & path | Line | Permission | Body / query | Success | Errors |
|---|---|---|---|---|---|
| `POST /api/v1/platform/users/invitations` | 32 | `platform-users.invite` | `InvitePlatformUserRequest` | **200** `{success, data: PlatformInvitationResponse}` (GET-by-id shape) | 403, 400 E5, 409 `{error:"INVITATION_ALREADY_PENDING"}`, 400 `{error:"INVALID_ROLE"}`, 403 `{error:"ROLE_ASSIGNMENT_FORBIDDEN", message:"You are not allowed to assign one or more requested platform roles."}` (non-super-admin inviting with a system role), 500 `{error:"INTERNAL_SERVER_ERROR"}` |
| `POST /api/v1/platform/users/invitations/batch` | 51 | `platform-users.invite` | `BatchInvitePlatformUsersRequest` | 200 `BatchInvitePlatformUsersResponse` (**returned raw**, but shaped `{success:true, data:{total, created, failed, results[]}}`); per-item failures are reported inside `results` | 403, 400 E5, 500 |
| `GET /api/v1/platform/users/invitations` | 67 | `platform-users.view` | query `status?`, `email?` | 200 `{success, data: PlatformInvitationResponse[]}` ordered by `invitedAtUtc` desc | 403 |
| `GET /api/v1/platform/users/invitations/{invitationId:guid}` | 77 | `platform-users.view` | — | 200 `{success, data: PlatformInvitationResponse}` | 403, 404 `{error:"INVITATION_NOT_FOUND"}` |
| `POST /api/v1/platform/users/invitations/{invitationId:guid}/revoke` | 90 | **`platform-users.update`** | none | 200 `{success:true, data:{}}` (revoking an already-revoked invitation also succeeds) | 403, 404 `INVITATION_NOT_FOUND`, 409 `INVITATION_ALREADY_ACCEPTED`, 500 |
| `POST /api/v1/platform/users/invitations/{invitationId:guid}/resend` | 105 | `platform-users.invite` | none | 200 `{success:true, data:{}}` (new token + new expiry; works on expired invitations) | 403, 404 `INVITATION_NOT_FOUND`, 409 `INVITATION_ALREADY_ACCEPTED`, 409 `INVITATION_REVOKED`, 403 `ROLE_ASSIGNMENT_FORBIDDEN` (+message), 400 `INVALID_ROLE`, 500 |
| `POST /api/v1/platform/invitations/accept` | 124 | none (authenticated only) | `AcceptPlatformInvitationRequest` | 200 `{success:true, data:{}}` | 400 E5; 400 E1 `{error:"INVALID_EMAIL", message:"Email claim missing from token."}`; 400 `{error:"EMAIL_NOT_VERIFIED", message:"Email must be verified."}` (`X-Email-Verified` must parse as bool `true`); 400 `{error:"INVALID_USER", message:"Missing or invalid sub claim."}`; 400 `{error:"INVALID_INVITATION_TOKEN"}` (unknown token); 409 `INVITATION_ALREADY_ACCEPTED` / `INVITATION_REVOKED` / `INVITATION_EXPIRED` / `INVITATION_EMAIL_MISMATCH`; 500. (404 `INVITATION_NOT_FOUND` is coded but unreachable: the service maps not-found to `INVALID_INVITATION_TOKEN`.) |

Query params for the invitation list are bound by parameter name: **`status`** and **`email`**. There are no defaults, no paging, and no `[FromQuery(Name=…)]` renames.
- `status` accepts `Pending` | `Accepted` | `Revoked` | `Expired`. `Expired` is computed as Pending with `expiresAtUtc` < now. Other strings match nothing. Case sensitivity depends on the DB collation (not visible in the repo).
- `email` is an exact match after trim+lowercase.

DTOs (`K/PlatformInvitations/*`):
- `InvitePlatformUserRequest`: `email: string` [Required, EmailAddress], `roleCodes: string[]` [Required, MinLength 1]. Duplicate codes are de-duplicated.
- `BatchInvitePlatformUsersRequest`: `invitations: BatchInvitePlatformUserItem[]` [Required, MinLength 1, **MaxLength 100**]. Each item: `{ email` [Required, EmailAddress], `roleCodes` [Required, MinLength 1] `}`.
- `BatchInvitePlatformUserResultItem`: `email` (as sent, not normalized), `success: boolean`, `invitationId: guid|null`, `status: "Pending"|null`, `expiresAtUtc: datetime|null` (ends in `Z`), `error: string|null`. `error` is one of `DUPLICATE_EMAIL_IN_BATCH`, `INVITATION_ALREADY_PENDING`, `INVALID_ROLE`, `ROLE_ASSIGNMENT_FORBIDDEN`, `INTERNAL_SERVER_ERROR`.
- `AcceptPlatformInvitationRequest`: `{ token: string }` [Required]. The raw invitation token is **never returned** by any endpoint here.
- `PlatformInvitationResponse`: `invitationId: guid, email: string (normalized lowercase), status: InvitationStatus, invitedAtUtc, expiresAtUtc, acceptedAtUtc: datetime|null, revokedAtUtc: datetime|null, invitedByUserId: guid|null, invitedBy: string, roles: string[] (role codes)`.

⚠ **List and get-by-id fill different fields** (`R/Repositories/PlatformInvitationRepository.cs:46-100`):
- List: `invitedBy` = the inviter's **display name** (or `""`), `invitedByUserId` = **null**, `revokedAtUtc` = **null** (not selected).
- Get / create: `invitedByUserId` = the inviter's guid, `invitedBy` = **`""`**, `revokedAtUtc` populated.

Default expiry is `PlatformInvitation:ExpiryHours` (72 in appsettings).

---

## 5. Platform settings & feature flags

Permissions are checked first. 403s are E1 `{error:"FORBIDDEN", message:"You do not have permission to view|update settings|feature flags."}`. Every non-403 error is E1 with a fixed message.

### 5.1 Settings — `C/PlatformSettingsController.cs`
| Method & path | Line | Permission | Body | Success | Errors |
|---|---|---|---|---|---|
| `GET /api/v1/platform/settings` | 28 | `settings.view` | — | 200 `{success, data: PlatformSettingResponse[]}` ordered by category, key | 403 |
| `GET /api/v1/platform/settings/{key}` | 38 | `settings.view` | — | 200 `{success, data: PlatformSettingResponse}` | 403, 404 `{error:"SETTING_NOT_FOUND", message:"Setting not found."}` |
| `PUT /api/v1/platform/settings/{key}` | 59 | `settings.update` | `UpdatePlatformSettingRequest` | 200 `{success, data: PlatformSettingResponse}` (re-read) | 403, 400 E5 (`ExpectedVersion` < 1), 404 `SETTING_NOT_FOUND`, 400 `{error:"SETTING_VALUE_INVALID", message:"Setting value is invalid for the specified type."}`, 409 `{error:"SETTING_NOT_EDITABLE", message:"Setting is not editable."}`, 409 `{error:"VERSION_CONFLICT", message:"Version conflict. The setting has been modified since it was loaded."}`, 500 `{error:<code>, message:"An unexpected error occurred."}` |
| `POST /api/v1/platform/settings/{key}/reset` | 86 | `settings.update` | `ResetPlatformConfigurationRequest` | 200 `{success, data: PlatformSettingResponse}` (`currentValue` becomes null) | 403, 400 E5, 404 `SETTING_NOT_FOUND`, 409 `SETTING_NOT_EDITABLE`, 409 `VERSION_CONFLICT`, 500 |

`{key}` is a plain string such as `listing.inventory.reservation.default-expiry-minutes`. Keys contain dots, which are fine in a path segment, but URL-encode them anyway.

Request DTOs (`K/PlatformConfiguration/PlatformConfigurationRequests.cs`):
- `UpdatePlatformSettingRequest`: `{ value: string|null, expectedVersion: int [Range 1..int.Max] }`. `value` is **always a string**, validated against `valueType` (`S/Services/PlatformConfigurationService.cs:130-153`):

  | `valueType` | Accepted `value` |
  |---|---|
  | `BOOLEAN` | exactly `"true"`/`"false"` |
  | `INTEGER` | `int.TryParse` with an optional leading sign |
  | `DECIMAL` | an optional sign plus a decimal point, invariant culture |
  | `STRING` | up to 1000 chars; `""` is allowed |

  `null` is always invalid → 400. Range hints such as "1-120" appear only in the description text and are **not enforced** by this service.
- `ResetPlatformConfigurationRequest`: `{ expectedVersion: int [Range 1..] }`.

`PlatformSettingResponse`: `platformSettingId: guid, key, name, description, category, valueType: SettingValueType, currentValue: string|null, defaultValue: string, effectiveValue: string (= currentValue ?? defaultValue), isEditable: boolean, version: int, updatedAtUtc: datetime|null`.
⚠ `description` is declared non-nullable in C#, but the DB column is NULL-able, so it can be `null` at runtime.

Seeded settings (`M/025_InventoryReservationSettings.sql`), both in category `Inventory`, type `INTEGER`, editable:
- `listing.inventory.reservation.default-expiry-minutes` (default `"15"`).
- `listing.inventory.reservation.max-expiry-minutes` (default `"60"`).

### 5.2 Feature flags — `C/PlatformFeatureFlagsController.cs`
| Method & path | Line | Permission | Body | Success | Errors |
|---|---|---|---|---|---|
| `GET /api/v1/platform/feature-flags` | 28 | `feature-flags.view` | — | 200 `{success, data: PlatformFeatureFlagResponse[]}` ordered by key | 403 |
| `GET /api/v1/platform/feature-flags/{key}` | 38 | `feature-flags.view` | — | 200 `{success, data: PlatformFeatureFlagResponse}` | 403, 404 `{error:"FEATURE_FLAG_NOT_FOUND", message:"Feature flag not found."}` |
| `PUT /api/v1/platform/feature-flags/{key}` | 59 | `feature-flags.update` | `UpdatePlatformFeatureFlagRequest` | 200 `{success, data: PlatformFeatureFlagResponse}` | 403, 400 E5, 404 `FEATURE_FLAG_NOT_FOUND`, 409 `{error:"VERSION_CONFLICT", message:"Version conflict. The feature flag has been modified since it was loaded."}`, 500 |
| `POST /api/v1/platform/feature-flags/{key}/reset` | 84 | `feature-flags.update` | `ResetPlatformConfigurationRequest` | 200 `{success, data: PlatformFeatureFlagResponse}` (`isEnabled` = `defaultEnabled`) | 403, 400 E5, 404, 409 `VERSION_CONFLICT`, 500 |

- `UpdatePlatformFeatureFlagRequest`: `{ isEnabled: boolean, expectedVersion: int [Range 1..] }`. If `isEnabled` is omitted it defaults to `false`.
- `PlatformFeatureFlagResponse`: `platformFeatureFlagId: guid, key, name, description (nullable at runtime, see above), isEnabled, defaultEnabled, version: int, updatedAtUtc: datetime|null`.
- Seeded flag: `seller.subscription.enforcement.enabled` (default `false`) (`M/022_PlatformConfiguration.sql:42-61`).

---

## 6. Marketplace

### 6.1 Admin sellers — `C/Marketplace/AdminMarketplaceSellersController.cs`
| Method & path | Line | Permission | Body | Success | Errors |
|---|---|---|---|---|---|
| `GET /api/v1/admin/marketplace/sellers` | 28 | `sellers.view` | — | 200 `{success, data: MarketplaceSellerDto[]}` (all sellers, no ordering, **partially populated**, see below) | 403 E3 `{error:"FORBIDDEN", message:"You do not have permission to view sellers."}` |
| `POST /api/v1/admin/marketplace/sellers/{sellerId:guid}/verify` | 38 | `action:"APPROVE"` → `sellers.verify`; `action:"REJECT"` → `sellers.reject` | `AdminSellerReviewRequest` | 200 `{success, data: MarketplaceSellerDto}` (fresh, full) | 400 E5; 400 E3 `{error:"INVALID_ACTION", message:"Action must be APPROVE or REJECT."}` (case-sensitive); 403 E3 `{error:"FORBIDDEN", message:"You do not have permission to verify|reject sellers."}`; 400 E2 `title:"Validation"` (bad rowVersion: must be base64 of exactly 8 bytes); 404 E2 `NotFound`; 409 E2 `Conflict` (version conflict, or not in `verificationStatus=PENDING` with `onboardingStatus ∈ {SUBMITTED, UNDER_REVIEW}`); 500 E2. E2 `detail` is `""` |
| `POST /api/v1/admin/marketplace/sellers/{sellerId:guid}/suspend` | 63 | `sellers.suspend` | `AdminSellerReviewRequest` (`action` is ignored but must be **non-empty**, implicit required) | 200 `{success, data: MarketplaceSellerDto}` | 400 E5, 403 E3, 400/404/409/500 E2 (409 when `status` ≠ `ACTIVE`) |

- `AdminSellerReviewRequest` (`K/Marketplace/MarketplaceSellerRequests.cs:37-41`): `{ action: string, expectedRowVersion: string }`. Both are required (implicit). `expectedRowVersion` is the `rowVersion` string from a seller DTO.
- Transitions (`M/024_MarketplaceActorFoundation.sql`):

  | Action | Result |
  |---|---|
  | APPROVE | `verificationStatus=VERIFIED`, `onboardingStatus=COMPLETED` |
  | REJECT | `verificationStatus=REJECTED`, `onboardingStatus=DRAFT` |
  | suspend | `status=SUSPENDED` |

  There is **no unsuspend endpoint**.

⚠ The admin list proc `PR_SELLER_ADMIN_LIST` selects only these columns: `sellerId, organizationType, displayName, status, verificationStatus, onboardingStatus, submittedAtUtc, verifiedAtUtc, rejectedAtUtc, suspendedAtUtc, rowVersion`. The other fields in the list come back with these values:
- `legalName`, `registrationNo`, `profileLogoAssetId`: `null`.
- `countryCode`, `defaultCurrency`, `email`: `""`.
- `createdAtUtc`, `updatedAtUtc`: `"0001-01-01T00:00:00"`.

### 6.2 Seller self-service — `C/Marketplace/MarketplaceSellersController.cs`, `MarketplaceSellerDocumentsController.cs`
There are no platform permissions here. Access is by seller membership (`PR_SELLER_ACTOR_GET_CONTEXT`: an `ACTIVE` membership in that seller). If there is no membership, the response is **403 E4 `{code:"MARKETPLACE_SELLER_ACCESS_DENIED"}`**, also when the seller id does not exist. Platform admins **cannot** use these endpoints for sellers they do not belong to.

| Method & path | Line | Access | Body | Success | Errors |
|---|---|---|---|---|---|
| `POST /api/v1/marketplace/sellers` | Sellers:32 | any authenticated user | `CreateSellerRequest` | 200 `{success, data: MarketplaceSellerDto}` (an `INDIVIDUAL` caller who already owns one gets the **existing** seller back) | 400 E5; 400 E2 `title:"Validation"` (codes not exposed: invalid sellerType, missing displayName/countryCode/defaultCurrency, missing legalName for BUSINESS); 500 E2 `title:"Failure"` (any DB error) |
| `GET /api/v1/marketplace/sellers/{sellerId:guid}` | Sellers:39 | active member | — | 200 `{success, data: MarketplaceSellerDto}` | 403 E4, 404 E2 |
| `POST /api/v1/marketplace/sellers/{sellerId:guid}/submit` | Sellers:49 | active member (any role, not only the owner) | `{ expectedRowVersion: string }` (`SubmitRequest`, Sellers:13-16) | 200 `{success, data: MarketplaceSellerDto}` (`onboardingStatus=SUBMITTED`, `verificationStatus=PENDING`) | 403 E4, 400 E5, 400/404/409/500 E2 (409 when `onboardingStatus` ≠ `DRAFT` or rowVersion is stale) |
| `GET /api/v1/marketplace/sellers/{sellerId:guid}/documents` | Docs:27 | active member + owner + seller `status=ACTIVE` | — | 200 `{success, data: SellerDocumentResponse[]}` | 403 E4 (not a member), 403 E2 `title:"Forbidden", detail:""` (member but not owner / seller not ACTIVE) |
| `POST /api/v1/marketplace/sellers/{sellerId:guid}/documents` | Docs:37 | same | `CreateSellerDocumentRequest` | 200 `{success, data: SellerDocumentResponse}` (`verificationStatus:"UNVERIFIED"`) | 403 E4 / 403 E2, 400 E5, 400 E2 `Validation` (fileAssetId is not a valid `SELLER_DOCUMENT` file owned by the caller in inventory-media) |
| `DELETE /api/v1/marketplace/sellers/{sellerId:guid}/documents/{documentId:guid}` | Docs:47 | same | — | intended: 200 `{success:true, data:true}` | 403 E4 / 403 E2, **404 E2 `NotFound` — returned even after a successful delete (bug, see below)** |

- `CreateSellerRequest`:
  - `sellerType: string`: required (implicit). Trimmed and upper-cased, then must be `INDIVIDUAL`|`BUSINESS`.
  - `displayName: string`: required.
  - `legalName: string|null`: required when BUSINESS.
  - `registrationNo: string|null`.
  - `countryCode: string`: required, `VARCHAR(3)` in the proc.
  - `defaultCurrency: string`: required, `VARCHAR(3)` in the proc.
- `CreateSellerDocumentRequest`:
  - `documentType: string`: required (implicit), free text up to `VARCHAR(100)`, no enum.
  - `fileAssetId: guid`.
  - `documentNumber: string|null`.
  - `issuedAt: datetime|null`.
  - `expiresAt: datetime|null`.
- `SellerDocumentResponse`: `sellerDocumentId, sellerId, documentType, fileAssetId, documentNumber: string|null, issuedAt: datetime|null, expiresAt: datetime|null, verificationStatus: string, createdAtUtc`.
- `MarketplaceSellerDto` (`K/Marketplace/MarketplaceSellerDto.cs`): `sellerId, organizationType (= sellerType), email: string (ALWAYS "" — never mapped), legalName: string|null, displayName: string|null, registrationNo: string|null, countryCode, defaultCurrency, status, verificationStatus, onboardingStatus, profileLogoAssetId: guid|null, submittedAtUtc|null, verifiedAtUtc|null, rejectedAtUtc|null, suspendedAtUtc|null, createdAtUtc, updatedAtUtc, rowVersion: string (base64, 8 bytes)`.

⚠ **Document DELETE is broken:** `PR_SELLER_DOCUMENT_DELETE` runs with `SET NOCOUNT ON`, so Dapper `ExecuteAsync` returns -1. The repository returns `rows > 0` = false (`R/Marketplace/MarketplaceSellerRepository.cs:175-186`). The row **is deleted**, but the API answers 404. Treat 404 on DELETE as "probably deleted" and re-fetch the list.

### 6.3 `GET /api/v1/marketplace/actors/me` — `C/Marketplace/MarketplaceActorsController.cs:24`
Auth: authenticated. Success: `{success, data: MarketplaceCurrentActorResponse}`:
- `userId: guid`
- `buyer: { enabled: true }` (always true)
- `sellerContexts: SellerContextResponse[]`, where each entry is `{ sellerId, sellerType, displayName, status, verificationStatus, onboardingStatus, isOwner }`. There is one entry per seller where the caller has an ACTIVE membership.

---

## 7. String enum values (exact JSON values)

| Field | Values | Source |
|---|---|---|
| Invitation `status` | `Pending`, `Accepted`, `Revoked`, `Expired` (computed) | `M/013_…FinalRemediation.sql` LIST/GET |
| Setting `valueType` | `BOOLEAN`, `INTEGER`, `DECIMAL`, `STRING` | CHECK constraint `M/022_PlatformConfiguration.sql:19` |
| Seller `organizationType`/`sellerType` | `INDIVIDUAL`, `BUSINESS` | `S/Marketplace/MarketplaceSellerService.cs:64-66` |
| Seller `status` | `ACTIVE`, `SUSPENDED` | `M/024…` CREATE/SUSPEND |
| Seller `verificationStatus` | `UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED` | `M/024…` |
| Seller `onboardingStatus` | `DRAFT`, `SUBMITTED`, `COMPLETED`; `UNDER_REVIEW` is accepted by verify/reject but nothing in this service sets it | `M/024…` |
| Seller document `verificationStatus` | `UNVERIFIED` (the only value this service writes) | `MarketplaceSellerService.cs:213` |
| Organization `status` (via `/organizations`) | `Active` (PascalCase!). Seller orgs use `ACTIVE`/`SUSPENDED`, and both appear in `GET /organizations` | `S/Services/OrganizationService.cs:148`, `M/002_Procedures.sql` |
| E2 `title` | `Failure`, `Validation`, `NotFound`, `Conflict`, `Forbidden`, `Error` | `building-blocks/Emcore.BuildingBlocks.Core/Types.cs:25` |

---

## 8. Permission codes and system roles

### 8.1 System roles (`isSystemRole = true`)
| Code | Name | Notes |
|---|---|---|
| `PlatformSuperAdmin` | Platform Super Admin | Gets **all** active permissions implicitly. Its role-permissions are protected. At least one holder must remain. Only it may use `/platform/admins*`. |
| `PlatformAdmin` | Platform Admin | Seeded grants: `roles.view`, `permissions.view`, `platform-users.view`, `organizations.view`, `organizations.update`, `sellers.view`, `listings.view`, `inspection.view`, `audit.view`, `settings.view`, `feature-flags.view`, `notification-templates.view` (`M/007`, `M/022`, `M/023`). Its permissions can be edited. |

Constants: `src/Emcore.UserOrganization.Domain/Constants/PlatformRoleCodes.cs`. Custom roles are created through `POST /platform/roles`.

### 8.2 Permission codes (all seeded; `module` is in brackets)
Codes marked **★** are enforced by endpoints in this service. The rest are seeded here for other services (catalog, inspection, notification, etc.).

- **Access Control** (`M/007_PlatformRbac.sql`):
  - ★`roles.view`: View Roles
  - ★`roles.create`: Create Roles
  - ★`roles.update`: Update Roles
  - ★`roles.deactivate`: Deactivate Roles
  - ★`roles.assign`: Assign Roles
  - ★`permissions.view`: View Permissions
- **Platform Users** (`M/007`):
  - ★`platform-users.view`
  - ★`platform-users.invite`
  - ★`platform-users.update`
  - ★`platform-users.disable`
  - ★`platform-users.enable`
- **Organizations** (`M/007`; none of these is enforced by this service):
  - `organizations.view`
  - `organizations.update`
  - `organizations.suspend`
  - `organizations.reactivate`
- **Sellers** (`M/007`):
  - ★`sellers.view`
  - ★`sellers.verify`
  - ★`sellers.reject`
  - ★`sellers.suspend`
- **Listings** (`M/007`):
  - `listings.view`
  - `listings.approve`
  - `listings.reject`
- **Listings** (`M/027`, colon-separated):
  - `catalog:listings:review`
  - `catalog:listings:approve`
  - `catalog:listings:publish`
  - `catalog:listings:suspend`
  - `catalog:listings:view`
- **Inspection** (`M/007`, singular):
  - `inspection.view`
  - `inspection.assign`
  - `inspection.accept`
  - `inspection.start`
  - `inspection.complete`
- **Inspection** (`M/026`, plural):
  - `inspections.view`
  - `inspections.assign`
  - `inspections.perform`
  - `inspections.override`
  - `inspections.templates.manage`
- **Finance** (`M/007`):
  - `finance.view`
  - `payments.view`
- **Audit** (`M/007`):
  - `audit.view`
- **Catalog** (`M/016`, `017`, `019`, `020`, `021`):
  - Categories: `catalog.categories.{view,create,update,deactivate,reactivate}`
  - Attributes: `catalog.attributes.{view,create,update,deactivate,reactivate}`, `catalog.category-attributes.{view,manage}`
  - Brands: `catalog.brands.{view,create,update,deactivate,reactivate}`, `catalog.category-brands.{view,manage}`
  - Units: `catalog.units.{view,create,update,deactivate,reactivate}`, `catalog.category-units.{view,manage}`
  - Conditions and grades: `catalog.conditions.{view,create,update,deactivate,reactivate}`, `catalog.grades.{view,create,update,deactivate,reactivate}`, `catalog.category-conditions.{view,manage}`
- **Platform Configuration** (`M/022`):
  - ★`settings.view`
  - ★`settings.update`
  - ★`feature-flags.view`
  - ★`feature-flags.update`
- **Notification Templates** (`M/023`):
  - `notification-templates.{view,create,update,activate,deactivate}`

Ambiguity: the live DB could have other permissions added by hand. `GET /platform/permissions` is the source of truth at runtime. `PERMISSIONS` in the TS file mirrors the seeds above.

---

## 9. Summary of broken or suspect behaviour
1. `platform/users` list and get: `roles[].code`/`name` are always `""` (case-sensitive JSON deserialize). `roles/assignable` therefore never detects a super admin.
2. `DELETE marketplace/sellers/{id}/documents/{docId}` returns 404 even when the delete succeeded (`SET NOCOUNT ON` combined with a `rows > 0` check).
3. The admin seller list omits many fields (defaults/empty values). `MarketplaceSellerDto.email` is always `""`.
4. E2 (ProblemDetails) errors drop the machine-readable error code, and marketplace E2 errors have an empty `detail`.
5. `GET /organizations` always reports `isOwner: true`.
6. Invitation list and get-by-id fill `invitedBy`/`invitedByUserId`/`revokedAtUtc` inconsistently.
7. Role-permission `description` is always null in role detail.
8. Clearing the profile image (`profileImageAssetId: null`) deletes the file but keeps the reference.
9. `PUT platform/users/{id}/roles` allows granting system roles without being a super admin. The organization endpoints ignore the `organizations.*` permissions and use role checks.
10. Admin suspend requires a meaningless non-empty `action` field. There is no unsuspend or reactivate endpoint.
