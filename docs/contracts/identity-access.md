# Identity & Access API contract

Source root: `/home/user/stockout/services/identity-access/src`. Abbreviations: `Api/` = `Emcore.IdentityAccess.Api/`, `App/` = `Emcore.IdentityAccess.Application/`, `Infra/` = `Emcore.IdentityAccess.Infrastructure/`, `Mig/` = `../Emcore.IdentityAccess.Migrator/Migrations/Versioned/`. `H:` = `App/Commands/Handlers.cs`, `D:` = `App/DTOs/DTOs.cs`.

Gateway routing: `/api/v1/auth/*` → PublicPolicy + LoginOtpPolicy (10 req/min per IP+path); `/api/v1/identity/*` → AuthenticatedRoutePolicy (+ session-active check) + 300/min. See `gateway.md`.

## 0. Cross-cutting

### Serialization
`AddControllers()` with no JSON customisation (`Api/Program.cs:24`) ⇒ System.Text.Json **web defaults**: camelCase properties, case-insensitive input, nulls **are** written (no ignore condition), `DateTime` as ISO-8601 strings, enums would be numbers (but every enum-like field in this API is already a `string`). Dictionary keys unchanged.

### Authentication inside the service
The service never validates JWTs. It uses the `GatewayHeader` scheme reading `X-User-Id`, `X-Session-Id`, `X-User-Email`, `X-Email-Verified` (`building-blocks/Emcore.BuildingBlocks.Security/SecurityTypes.cs:42-108`). `UserId` = `sub`, `SessionId` = `sid` (`SecurityTypes.cs:27-29`). Endpoints marked `[Authorize]` without these headers ⇒ **401 with empty body** (default challenge), which the gateway likely rewrites to its own problem body.

There are **no roles, policies or permission checks anywhere in this service**. `[Authorize]` = "any authenticated user".

### Error shapes
1. **Handler failures** — `BaseApiController.MapResult` (`Api/Controllers/BaseApiController.cs:15-32`) → `ControllerBase.Problem(...)`:
   ```json
   { "type": "https://emcore.platform/errors/{status}", "title": "...", "status": 401, "detail": "...", "traceId": "00-..." }
   ```
   `Content-Type: application/problem+json`. `traceId` is added by ASP.NET's default `ProblemDetailsFactory`. **There is no machine-readable error code field** — only `title`/`detail` strings. Clients must switch on `status` + `title`.
2. **Unhandled exceptions** — `Api/Middleware/ExceptionHandlingMiddleware.cs:20-62`:
   ```json
   { "type": "https://emcore.platform/errors/{status}", "title": "...", "status": n, "detail": "...", "instance": "/api/v1/...", "traceId": "0HN..." }
   ```
   `InvalidOperationException | ArgumentException | FormatException` ⇒ **400** `title:"Invalid Request"`, `detail = ex.Message` (raw .NET message). `UnauthorizedAccessException` ⇒ 401 `"Unauthorized"`. Others ⇒ 500 `"An unexpected server error occurred."`. Many malformed IDs (non-GUID `userId`, `challengeToken`, `stepUpId`, `sessionId`) hit `Guid.Parse` in the repository and surface as this 400.
3. **Model validation** — `[ApiController]` automatic 400 `ValidationProblemDetails`:
   ```json
   { "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1", "title": "One or more validation errors occurred.", "status": 400, "errors": { "<Field>": ["..."] }, "traceId": "..." }
   ```
   Triggered by malformed JSON, missing body, or a `null`/missing value for a **non-nullable** `string` record parameter (`<Nullable>enable</Nullable>` in `Directory.Build.props:4` ⇒ implicit `[Required]`). Key casing is the C# member name (e.g. `"Email"`) or a JSON path (`"$.email"`) — ambiguous, do not depend on it. Whether parameters that have C# default values (e.g. `RegisterRequest.FirstName = ""`) are treated as required is framework-version dependent — **always send every field**.
4. **DB disabled** — `Api/Middleware/DatabaseCheckMiddleware.cs:18-32`: 503 `{ "title":"Database not configured", "status":503, "detail":"..." }` (ProblemDetails, camelCase, nulls included: `type`/`instance` null).

### Common response
`StandardSuccessResponse` (`D:70`): `{ "message": string }`.

---

## 1. JWT access token

Generator: `Infra/Security/SecurityServices.cs:133-166`. RS256, header `{ alg:"RS256", typ:"JWT", kid: Jwt:KeyId }`. Payload (exact claims, nothing else):

| Claim | Type | Value |
|---|---|---|
| `sub` | string | user id (GUID; format depends on source — `D` with hyphens when loaded from DB, `N` without hyphens for some freshly created ids; treat as opaque) |
| `jti` | string | random GUID `N` |
| `sid` | string | session id (GUID `N`) |
| `email` | string | user email |
| `email_verified` | **boolean** | |
| `iat`, `nbf` (=iat-60), `exp`, `auth_time` | number (unix s) | |
| `iss`, `aud` | string | config |
| `amr` | string[] (1 item) | `"pwd"` (login/register/invite), `"mfa"` (MFA verify), `"ref"` (refresh), `"s2s"` (service token) |
| `sec_ver` | number | always `1` |

**No roles, permissions, platform-admin flag, tenant or organization claims.** Permission data must come from the user-organization service (not in scope here). Lifetime: `Jwt:AccessTokenLifetimeMinutes` = **15** (`Api/appsettings.json:22`; fallback 15). `expiresIn` in responses = lifetime×60 = 900.

Service-client tokens (`POST /api/v1/auth/token`, `H:1305-1330`) reuse the same generator with `sub = serviceClientId`, `email = clientId`, `sid = keyId`, `email_verified = true`, `amr=["s2s"]` — there is no `client_id` claim, so the gateway's service-client bypass never triggers and the session check is done against `sid=keyId` (will fail ⇒ 403 on `AuthenticatedRoutePolicy` routes).

JWKS: `GET /.well-known/jwks.json` and `GET /api/v1/auth/.well-known/jwks.json` (anonymous) → `{ "keys": [ { kty:"RSA", use:"sig", alg:"RS256", kid, n, e } ] }` (`Api/Controllers/JwksController.cs:17-34`, `SecurityServices.cs:218-236`).

## 2. Tokens, refresh, cookies

- **Purely body-based.** No cookie is ever set (no `Cookie`/`Set-Cookie` usage in identity or gateway). Send access token as `Authorization: Bearer`.
- Refresh token: 48 random bytes, base64url, no padding (64 chars) (`SecurityServices.cs:168-173`); stored as SHA-256 hex. Lifetime `Identity:RefreshTokenLifetimeDays` = **30 days** (`Api/appsettings.json:28`). Not sliding: each rotated token gets a fresh 30 days (`H:668-673`).
- **Rotation on every refresh**: the old token is revoked and replaced in the same family (`Mig/006_Create_Identity_Stored_Procedures.sql:257-311`).
- **Reuse detection**: presenting a revoked **or expired** refresh token revokes the **whole token family and the session** (`006...sql:286-292`) ⇒ 401. Concurrency hazard for the SPA: two parallel refreshes with the same token ⇒ the second one kills the session. Serialize refreshes.
- Unknown token ⇒ 401 (same message).

## 3. Endpoints — `/api/v1/auth/*`

Controller class attributes: `AuthController`, `MfaController`, `PasswordController`, `AccountController` are `[Authorize]` at class level; `VerificationController` and `InvitationsController` are `[AllowAnonymous]`.

### POST /api/v1/auth/login — anonymous
`Api/Controllers/AuthController.cs:42-52`, handler `H:553-656`.

Request `LoginRequest` (`D:24`): `{ "emailOrMobile": string, "password": string }`

Response 200 `LoginResponse` (`D:25`):
```json
{ "accessToken": string, "refreshToken": string, "expiresIn": number, "tokenType": "Bearer",
  "mfaRequired": boolean, "mfaChallengeToken": string|null,
  "userId": string|null, "firstName": string|null, "lastName": string|null, "displayName": string|null }
```
- No MFA: tokens set, `mfaRequired=false`, `mfaChallengeToken=null`, profile fields filled (`H:645-655`).
- **MFA enabled** (user has an enabled `EMAIL_OTP` method, `H:586-615`): HTTP 200 with `accessToken=""`, `refreshToken=""`, `expiresIn=0`, `mfaRequired=true`, `mfaChallengeToken=<challenge id, 32-hex GUID>`, `userId=<id>`, names `null`. A 6-digit OTP is emailed; challenge expires in 5 min, max 5 verify attempts.

Errors (all ProblemDetails, no code field):
| Status | title | detail | When |
|---|---|---|---|
| 401 | `Unauthorized` | `Invalid credentials provided.` | identifier unknown (`H:556-559`) |
| 403 | `Account Locked` | `Account is temporarily locked due to excessive failed login attempts.` | `LockoutEndUtc` in future (`H:562-566`) |
| 403 | `Account Disabled` | `Account status is currently {Status}. Access is restricted.` | status not `Active`/`PendingVerification` (`H:567-571`) |
| 401 | `Authentication Failed` | `Invalid credentials.` | wrong password (`H:574-582`) |
| 429 | `Too Many Requests` | `Maximum OTP send limit reached for login. Try again later.` | ≥5 MFA-login challenges in 15 min (`H:589-593`) |

There is **no** `EMAIL_NOT_VERIFIED` rejection: `PendingVerification` users can log in. Lockout: `MaximumFailedLoginAttempts=5`, `LockoutMinutes=15` (`Api/appsettings.json:31-32`). On the 5th failure the proc also sets `USER_ACCOUNT.Status='Locked'` (`006...sql:213-217`), so after the 15 min window the user gets `403 Account Disabled (Locked)` until an admin changes status. Admin status change does **not** reset the failed-attempt counter/lockout end (`Mig/008_Add_Mfa_ServiceClients_And_Hardening.sql:397-438`).

### POST /api/v1/auth/mfa/verify — anonymous
`Api/Controllers/MfaController.cs:27-36`, `H:900-955`.

Request `MfaLoginVerifyRequest` (`D:76`): `{ "userId": string, "challengeToken": string, "code": string, "recoveryCode": string|null }`
- `challengeToken` = `mfaChallengeToken` from login; `userId` = `userId` from login.

Response 200 `LoginResponse` with tokens, `mfaRequired=false`, `mfaChallengeToken=null`, **`userId`, `firstName`, `lastName`, `displayName` all `null`** (`H:954`) — call `/identity/me` for profile. New session, `amr=["mfa"]`.

Errors: 400 `Invalid Request` (`UserId and ChallengeToken are required.`); 401 `Unauthorized` `User not found.`; 400 `Unsupported` if `recoveryCode` non-empty; 401 `Unauthorized` `Invalid MFA verification code.` (wrong/expired/exhausted); 400 `Invalid Request` (exception middleware) if `challengeToken`/`userId` is not a GUID.

### POST /api/v1/auth/mfa/resend — anonymous
`MfaController.cs:66-75`, `H:957-1005`.

Request `ResendMfaRequest` (`D:77`): `{ "userId": string, "challengeId": string }` (`challengeId` = current `mfaChallengeToken`).
Response 200 `ResendMfaResponse` (`D:78`): `{ "message": "Verification code resent successfully.", "challengeId": string }` — **the old challenge is cancelled; use the new `challengeId` for verify.**
Errors: 400 `ChallengeId is required.`; 404 `Challenge not found or already processed.`; **429** `Please wait before requesting a new code.` (< 60 s since challenge creation); 404 `User not found.`; 429 `Maximum OTP send limit reached for this purpose. Try again later.` (≥5 in 15 min). Works for any challenge purpose (it copies `TargetAction`).

### POST /api/v1/auth/token/refresh — anonymous
`AuthController.cs:57-65`, `H:658-690`.
Request `RefreshRequest` (`D:27`): `{ "refreshToken": string }`
Response 200 `RefreshResponse` (`D:28`): `{ "accessToken", "refreshToken", "expiresIn", "tokenType": "Bearer" }` (new refresh token — replace the stored one).
Errors: 400 `Invalid Request` `Refresh token must be provided.`; 401 `Unauthorized` `The refresh token is invalid, expired, or revoked due to reuse detection.`; 401 `User associated with session not found.`
Note: refresh does **not** re-check account status (a Suspended user keeps refreshing unless the admin status change revoked sessions — it does for Locked/Suspended/Closed).

### POST /api/v1/auth/logout — authenticated
`AuthController.cs:70-76`, `H:692-701`. Request body optional `LogoutRequest` (`D:30`): `{ "refreshToken": string|null }`.
Response 200 `{ "message": "Logged out successfully." }`.
**BROKEN:** when `refreshToken` is supplied, the handler passes the refresh-token SHA-256 hash as a *session id* to `RevokeSessionAsync` (`H:696-697`), which does `Guid.Parse(hash)` (`Infra/Persistence/IdentityRepository.cs:512`) ⇒ `FormatException` ⇒ **400 `Invalid Request`** with a .NET message. When `refreshToken` is omitted, it returns 200 but **revokes nothing** (only logs). To actually end the current session use `DELETE /api/v1/auth/sessions/{sid}` (sid from the JWT) or `logout-all`.

### POST /api/v1/auth/logout-all — authenticated
`AuthController.cs:81-87`, `H:703-712`. No body. 200 `{ "message": "All user sessions have been revoked successfully." }`. Revokes all sessions + refresh tokens (`006...sql:348-366`), including the caller's.

### GET /api/v1/auth/sessions — authenticated
`AuthController.cs:92-98`, `H:834-849`. 200 `SessionDto[]` (`D:43`):
```json
[{ "sessionId": string, "status": "Active", "createdAtUtc": string, "revokedAtUtc": string|null, "isCurrentSession": boolean, "deviceLabel": string|null, "ipAddress": string|null }]
```
Only `Active` sessions are returned (`Mig/017_Fix_Session_Procedures.sql:1-17`); `status` is `SessionStatus.ToString()` ∈ `Active|Revoked|Expired|Compromised` (`Domain/Enums/Enums.cs:5`). `sessionId` is GUID `N` format. `deviceLabel` is always `"Web Client"` and `ipAddress` `"127.0.0.1"` for sessions created by login (session entity never sets them: `IdentityRepository.cs:445-446`). `isCurrentSession` compares with JWT `sid`.

### DELETE /api/v1/auth/sessions/{sessionId} — authenticated
`AuthController.cs:103-110`, `H:858-872`. 200 `{ "message": "Session revoked successfully." }`; 404 `Not Found` `Session not found or not owned by user.`; non-GUID id ⇒ 400 (exception middleware).

### Password
`Api/Controllers/PasswordController.cs`.
- **POST /api/v1/auth/password/forgot** (anon, `:27-35`, `H:714-755`): `{ "emailOrMobile": string }` → always 200 `{ "message": "If an account with that identifier exists, password recovery instructions have been initiated." }` (anti-enumeration; silently skips unverified email, >5 per 15 min, <1 min cooldown). Token: 32 random bytes base64url, 15 min (`PasswordResetLifetimeMinutes`).
- **POST /api/v1/auth/password/reset** (anon, `:40-48`, `H:757-800`): `{ "token": string, "newPassword": string, "emailOrMobile": string|null, "stepUpToken": string|null }` → 200 `{ "message": "Password has been reset successfully." }`. Errors 400: `Invalid Request` (missing), `Invalid Password` (`Password must be at least 12 characters long.`), `Invalid Token` (`The password reset token is incorrect or has expired.`), `Invalid User`. `stepUpToken` is **ignored**. Revokes all sessions. Always delays 500 ms.
- **POST /api/v1/auth/password/change** (auth, `:53-61`, `H:802-832`): `{ "currentPassword": string, "newPassword": string, "stepUpToken": string|null }` → 200 `{ "message": "Password changed successfully. All other sessions have been revoked." }`. Errors: 400 `Invalid Request`, 400 `Invalid Password` (length or `Current password provided is incorrect.`), 404. `stepUpToken` **ignored**. Despite the message, the proc revokes **all** sessions including the current one (`006...sql:478-480`) ⇒ client must re-login.
- Min password length 12 (`Identity:MinimumPasswordLength`). No complexity rules.

### Account
`Api/Controllers/AccountController.cs`.
- **GET /api/v1/auth/account/status** (`:28-34`, `H:874-885`) → `AccountStatusResponse` (`D:45-54`): `{ userId, email, emailVerified, mobile, mobileVerified, status, failedLoginAttempts, lockoutEndUtc: string|null }`; 404 if user missing.
- **GET /api/v1/auth/account/activity** (`:50-63`, `H:1401-1420`) query: `page:int=1`, `pageSize:int=50`, `eventType:string?` (exact match), `fromUtc:DateTime?`, `toUtc:DateTime?`. Server clamps in SQL (`page<1→1`, `pageSize<1→50`, `>100→100`; `Mig/016_Add_Account_Activity_Tracking.sql:48-50`) **but echoes the unclamped values** in `page`/`pageSize`. Ordered newest first. Response `AccountActivityResponse` (`App/DTOs/AccountActivityDTOs.cs:6-26`): `{ items: [{ id, eventType, occurredAtUtc, success, ipAddress, userAgent, sessionId, details }], page, pageSize, totalCount }`. `eventType` values: constants in `Domain/Enums/Enums.cs:13-34` plus `USER_STATUS_CHANGE` (written by the status proc, `008...sql:422-423`). `details` is a free string, sometimes JSON-encoded (e.g. `{"mfaRequired":true}`, `{"targetAction":"MFA_DISABLE"}`). Only events where the caller is the *target* are listed. Invalid query value (e.g. `page=abc`) ⇒ 400 ValidationProblemDetails.

### MFA (EMAIL_OTP only)
- **GET /api/v1/auth/mfa/status** (`MfaController.cs:104-110`, `H:1364-1372`) → `{ "enabled": boolean, "type": "EMAIL_OTP"|null }`.
- **POST /api/v1/auth/mfa/register** (`:41-48`, `H:1007-1058`) body `{ "type": string }` (default `"EMAIL_OTP"`; value **ignored**, always EMAIL_OTP) → `RegisterMfaResponse` (`D:74`): `{ "secret": "", "qrCodeUri": "", "recoveryCodes": [], "message": "...", "challengeId": string }` (secret/QR/recovery codes always empty — TOTP not implemented). Sends OTP by email. Errors: 404, 400 `Email must be verified before enrolling in Email OTP MFA.`, 429 (≥5 in 15 min).
- **POST /api/v1/auth/mfa/confirm** (`:53-61`, `H:1060-1093`) `{ "type": "EMAIL_OTP", "code": string(6), "challengeId": string }` → 200 `{ "message": "MFA factor successfully confirmed and enabled." }`. Errors 400 `ChallengeId is required.` / `Unsupported MFA type. Only EMAIL_OTP is supported.` / `Please provide a valid 6-digit verification code.` / `The code is incorrect, expired, or belongs to a different purpose.`; 404 `MFA registration not found.`
- **POST /api/v1/auth/mfa/disable** (`:115-124`, `H:1374-1399`) `{ "type": "EMAIL_OTP", "stepUpToken": string }` (body field, **not** a header). Requires a step-up proof for action `MFA_DISABLE` from the same session. Errors: 400 missing fields, 404 `MFA method not found or not enabled.`, 422 `Step-Up Verification Failed`.
  **BROKEN:** the raw proof token is passed as `ProofHash` (`H:1388`) while the DB stores `SHA256hex(token)` (`H:1178`, `Mig/010_Add_StepUp_Proof_Table.sql:53-62`) ⇒ always **422** with a genuine token. (The correct helper `App/Services/StepUpProofValidator.cs:26` hashes but is never called.)

### Step-up
- **POST /api/v1/auth/stepup/initiate** (auth, `MfaController.cs:80-86`, `H:1095-1136`) `{ "targetAction": string }` — case-insensitive match against `MFA_DISABLE | ChangeEmail | DeleteAccount | RotateServiceCredential` (`App/Constants/StepUpActions.cs`), else 400 `ValidationError` `Invalid TargetAction specified.` Requires JWT `sid` (else 401 `Session required for Step-Up.`). Emails a 6-digit OTP (5 min). Response `{ "stepUpId": string, "expiresInSeconds": 300, "message": "Step-up challenge issued. Please verify second factor." }`. No send-rate limit.
- **POST /api/v1/auth/stepup/verify** (auth, `:91-99`, `H:1138-1195`) `{ "stepUpId": string, "code": string }` → `{ "verificationToken": string, "message": "Step-up verified successfully." }`. `verificationToken` = 32 random bytes **standard base64** (may contain `+ / =`), single-use, 5 min, bound to user + session + targetAction. Errors 401: `Step-up challenge invalid or expired.`, `Session mismatch for step-up challenge.`, `Invalid step-up verification code or max attempts reached.` (5 attempts).
- **Where step-up is enforced (whole repo):** only `mfa/disable` (body `stepUpToken`, broken as above). `password/change`/`password/reset` accept `stepUpToken` but ignore it. No service reads an `X-StepUp-Token` header (grep across `services/`, `gateways/`, `building-blocks/`: only the OpenAPI scheme declaration in `building-blocks/Emcore.BuildingBlocks.Api/OpenApiExtensions.cs:204-210`). `ChangeEmail`, `DeleteAccount`, `RotateServiceCredential` have no consuming endpoint.

### Registration / verification / invitations (anonymous; for completeness)
- `POST /api/v1/auth/register` (`AuthController.cs:28-37`, `H:78-162`) `{ email, mobile, password, firstName, lastName, displayName }` → **201** `{ userId, email, mobile, status:"PendingVerification", message }`; 400/409/500.
- `POST /api/v1/auth/verification/registration/confirm` `{ userId, channel:"Email"|"Mobile", token }` → `{ accessToken, refreshToken, expiresIn, tokenType, userId, firstName, lastName, displayName }` (`VerificationController.cs:77-84`, `H:455-551`).
- `POST /api/v1/auth/verification/email/send` `{ email }`, `.../email/confirm` `{ email, token }`, `.../mobile/send` `{ mobile }`, `.../mobile/confirm` `{ mobile, token }` → `{ message }` (`VerificationController.cs:27-72`).
- `POST /api/v1/auth/invitations/validate` `{ invitationToken }` → `{ invitedEmail, expiresAtUtc, accountState: "NEW"|"EXISTING_VERIFIED"|"EXISTING_UNVERIFIED" }`; `POST /api/v1/auth/invitations/register` → **201** `{ accessToken, refreshToken, expiresIn, tokenType, userId, firstName, lastName, displayName, invitationAccepted }` (`InvitationsController.cs`, `App/DTOs/InvitationDTOs.cs`).
- `POST /api/v1/auth/token` (service client credentials) `{ clientId, clientSecret, scope|null }` → `{ accessToken, expiresIn, tokenType }` (`ServiceClientController.cs:27-35`).

## 4. Endpoints — `/api/v1/identity/*` (gateway: AuthenticatedRoutePolicy)

### GET /api/v1/identity/me
`AccountController.cs:39-45`, `H:887-898`. 200 `CurrentIdentityResponse` (`D:56-68`):
```json
{ "userId": string, "email": string, "emailVerified": boolean, "mobile": string, "mobileVerified": boolean,
  "status": string, "authTime": string, "amr": "pwd",
  "firstName": string|null, "lastName": string|null, "displayName": string|null }
```
`mobile` is `""` when absent. `authTime` is **the current server time** (ISO-8601 round-trip `"O"` format), not the real auth time; `amr` is always `"pwd"` (hard-coded). `status` ∈ AccountStatus names. **No roles/permissions/admin flag.** 404 `User identity not found.`

### POST /api/v1/identity/admin/users/status
### PUT  /api/v1/identity/admin/users/{id}/status
`Api/Controllers/AdminController.cs:14-48`, `H:1332-1362`.
- Auth: class `[Authorize]` only. **No admin role / permission / step-up check — any authenticated user can change any user's status (security hole).** Gateway adds the session-active check only.
- Request `AdminUpdateUserStatusRequest` (`D:95`): `{ "userId": string, "status": string, "reason": string }`. For PUT, route `{id}` overrides `userId` (`AdminController.cs:45`), but `userId` must still be present in JSON (non-nullable record param ⇒ implicit required) — send `""` or the id.
- `status`: `Enum.TryParse<AccountStatus>(ignoreCase: true)` over `PendingVerification | Active | Locked | Suspended | Closed` (`Domain/Enums/Enums.cs:3`). Caveat: numeric strings (e.g. `"1"`, `"42"`) also parse — only send names.
- Response 200 `{ "message": "User status updated to {Status}." }`.
- Errors (ProblemDetails): 400 `Invalid Request` `UserId and Status are required.`; 400 `Validation Error` `A valid status reason must be provided for administrative status modifications.`; 400 `Invalid Status`; 404 `User account not found.`
- Side effects: `Locked|Suspended|Closed` revoke all sessions & refresh tokens (`008...sql:416-420`). Does not reset login-attempt lockout counters.

### Legacy / out of scope (exist, not documented further)
`LegacyController.cs` (`[Route("api/v1/identity")]`): `POST register`, `POST verify`, `POST resend-verification`, `POST login`, `POST refresh`, `POST logout`, `GET users/{id}` (returns any user's `CurrentIdentityResponse` to any authenticated caller). `ServiceClientController.cs`: `POST /api/v1/identity/service-clients/register`, `POST .../{id}/rotate`, `POST .../credentials/revoke`, `GET .../{id}/credentials` — also `[Authorize]` only, no admin check. Internal: `POST /api/internal/sessions/validate` (X-Service-Auth).

## 5. Enum values

- `AccountStatus`: `PendingVerification | Active | Locked | Suspended | Closed`
- `SessionStatus`: `Active | Revoked | Expired | Compromised`
- MFA type: `EMAIL_OTP`
- Step-up target actions (canonical casing returned/stored): `MFA_DISABLE | ChangeEmail | DeleteAccount | RotateServiceCredential`
- Verification channel: `Email | Mobile` (case-insensitive input)
- Account activity event types: `REGISTRATION_SUCCEEDED, EMAIL_VERIFICATION_SUCCEEDED, MOBILE_VERIFICATION_SUCCEEDED, LOGIN_SUCCEEDED, LOGIN_FAILED, MFA_LOGIN_SUCCEEDED, MFA_LOGIN_FAILED, MFA_ENABLED, MFA_DISABLED, MFA_RESEND_REQUESTED, PASSWORD_CHANGED, PASSWORD_RESET, SESSION_REVOKED, ALL_SESSIONS_REVOKED, LOGOUT, STEP_UP_SUCCEEDED, STEP_UP_FAILED, ACCOUNT_LOCKED, ACCOUNT_UNLOCKED, ACCOUNT_STATUS_CHANGED, USER_STATUS_CHANGE`
- Login failure reasons appear only inside activity `details` (`INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `ACCOUNT_<STATUS>`, `INVALID_OTP`) — never in HTTP responses.

## 6. Headers

- Required: `Authorization: Bearer <access>` for authenticated endpoints (via gateway). Nothing else.
- `X-Idempotency-Key`: not enforced; echoed back if sent (`Api/Program.cs:63-64`). `X-Request-Id` / `X-Correlation-Id` echoed (`:59-62`).
- `X-StepUp-Token`: not read by any code.
