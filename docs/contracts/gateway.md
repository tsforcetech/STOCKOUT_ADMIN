# API Gateway contract (Emcore.ApiGateway)

Source root: `/home/user/stockout/gateways/Emcore.ApiGateway`. All citations are `file:line` relative to that root unless they start with `services/` or `building-blocks/` (relative to `/home/user/stockout`).

The gateway is YARP. Paths are forwarded **unchanged** (no PathPrefix/PathRemove transforms on API routes; only the swagger routes use `PathSet`) — `appsettings.json:33-470`.

## 1. Pipeline order (Program.cs:20-192)

1. `UseForwardedHeaders` (trusted proxies 127.0.0.1/::1 by default; `Extensions/GatewayExtensions.cs:32-63`)
2. `GatewayErrorHandlingMiddleware` (wraps everything below — see §4)
3. `HeaderManagementMiddleware` (strip spoofable headers, mint request/correlation ids — §5)
4. `StructuredLoggingMiddleware`
5. `SecurityHeadersMiddleware`
6. `UseHttpsRedirection` (not in Development/Local/Integration)
7. `UseCors("GatewayCorsPolicy")`
8. `UseRateLimiter`
9. `UseAuthentication` (JWT bearer, if `Jwt:Enabled`)
10. `UseAuthorization` (route policies)
11. `MapReverseProxy`

Note: rate limiting runs **before** authentication, so `AuthenticatedPolicy` partitions by `ClaimTypes.NameIdentifier` will normally not yet see a user and fall back to remote IP (`Extensions/GatewayExtensions.cs:127-139`). Ambiguity: ASP.NET endpoint-aware rate limiting resolves the user from `HttpContext.User` at the time the limiter runs; since `UseAuthentication` is after `UseRateLimiter`, the partition key is effectively the client IP.

## 2. Authentication (JWT)

`Extensions/GatewayExtensions.cs:163-222`

- Scheme: `JwtBearer` (default scheme) only when `Jwt:Enabled=true`. Base `appsettings.json` has **no** `Jwt` section (=> disabled => every `AuthenticatedRoutePolicy` route fails). `appsettings.Development.json:9-15` and `appsettings.Production.json:2-8` enable it.
- Validation: issuer, audience, signing key (resolved by `kid` from the identity JWKS, `Security/IdentityJwksKeyProvider.cs`), lifetime required, `ClockSkew = 1 min`, `ValidAlgorithms = ["RS256"]` (`:199-211`).
- Dev values: `Issuer=https://api.stockout.com/identity`, `Audience=https://api.stockout.com`, JWKS `http://127.0.0.1:5194/.well-known/jwks.json` (`appsettings.Development.json:9-15`).
- Token transport: **`Authorization: Bearer <accessToken>` header only.** No cookie auth anywhere (no `Cookie` usage in gateway or identity). CORS is `AllowAnyOrigin()` (credentials therefore not allowed) — `Extensions/GatewayExtensions.cs:80-93`.

### Route authorization policies (`Extensions/GatewayExtensions.cs:247-293`)

| Policy | Behaviour |
|---|---|
| `PublicPolicy` | Always allowed. JWT is still **parsed if present** (UseAuthentication runs for every request), so identity headers are still injected for a valid token. No session-revocation check. |
| `AuthenticatedRoutePolicy` | `RequireAuthenticatedUser()` + assertion: if token has `client_id` and no `sub` → allow (service clients; note identity never issues a `client_id` claim — see identity doc). Otherwise requires `sub` **and** `sid`, then POSTs `{UserId, SessionId}` to identity `POST /api/internal/sessions/validate` with `X-Service-Auth` (3 s timeout) and allows only if response `{ "active": true }`. Any error ⇒ deny (fail closed). |

Outcome mapping (standard ASP.NET behaviour):
- No/invalid/expired token on an `AuthenticatedRoutePolicy` route ⇒ **401** (challenge; JwtBearer adds `WWW-Authenticate: Bearer ...`).
- Valid token but session revoked / identity unreachable ⇒ **403** (forbid). **The admin UI must treat gateway `403 forbidden_access` on any route as possibly "session revoked"**, since there are no permission checks at the gateway.

### Route table relevant to the admin (`appsettings.json`)

| Path | Cluster | AuthorizationPolicy | RateLimiterPolicy | Lines |
|---|---|---|---|---|
| `/api/v1/auth/{**catch-all}` | identity-access | PublicPolicy | **LoginOtpPolicy** | 43-50 |
| `/api/v1/identity/{**catch-all}` | identity-access | AuthenticatedRoutePolicy | AuthenticatedPolicy | 51-58 |
| `/api/v1/files/{**catch-all}` | inventory-media | AuthenticatedRoutePolicy | AuthenticatedPolicy | 35-42 |
| `/api/v1/admin/notification-templates/{**catch-all}` | notification-integration | AuthenticatedRoutePolicy | AuthenticatedPolicy | 187-194 |
| `/api/v1/search/{**catch-all}` | search-discovery | PublicPolicy | AnonymousPolicy | 139-146 |

`{**catch-all}` also matches the bare prefix (e.g. `GET /api/v1/admin/notification-templates`).

Consequences:
- **Every** `/api/v1/auth/*` call (including `token/refresh`, `sessions`, `mfa/status`, `account/activity`) is limited to **10/min per (client IP + exact path)**. A busy admin UI polling `/auth/sessions` will hit 429s.
- `/api/v1/auth/*` is `PublicPolicy`: a token for a **revoked session** is still accepted on `/auth/*` endpoints until it expires (no session check there).
- Legacy `/api/v1/identity/login|register|refresh|verify|resend-verification` are behind `AuthenticatedRoutePolicy` at the gateway, so they are unusable anonymously through the gateway.

## 3. Rate limiting (`Extensions/GatewayExtensions.cs:96-160`, config `appsettings.json:22-32`)

All are **fixed window, 1 minute, QueueLimit 0**.

| Policy | Default PermitLimit (appsettings.json) | Partition key |
|---|---|---|
| `AnonymousPolicy` | 60 / min | remote IP (`:114-123`) |
| `AuthenticatedPolicy` | 300 / min | `NameIdentifier` → `client_id` → remote IP (`:127-139`) |
| `LoginOtpPolicy` | 10 / min | `"{remoteIp}:{request.Path}"` (`:143-153`) |
| `HealthPolicy` | unlimited | — |

`appsettings.Integration.json:9-13` raises all three to 10000.

On rejection (`:98-110`): status **429**, header `Retry-After: <seconds>` (lease metadata, else `"60"`), no body written by the limiter → the error middleware then writes the problem body (§4) with `code: "rate_limit_exceeded"`.

## 4. Gateway error body (`Middleware/GatewayErrorHandlingMiddleware.cs`)

After the pipeline runs, if `StatusCode >= 400` **and the response has not started** (i.e. nobody wrote a body) and status is one of 401/403/404/429/502/503/504 or a YARP forwarder error occurred, the gateway writes (`:29-35`, `:133-155`):

```
Content-Type: application/problem+json
{
  "type": "https://httpstatuses.io/{status}",
  "title": string,
  "status": number,
  "detail": string,
  "code": string,
  "requestId": string,
  "correlationId": string,
  "traceId": string,          // omitted when null (WhenWritingNull)
  "instance": string          // request path
}
```

Property names are emitted exactly as above (anonymous object, default serializer options) (`:141-154`).

| Status | `code` | `title` | Lines |
|---|---|---|---|
| 401 | `authentication_required` | Unauthorized | 102-106 |
| 403 | `forbidden_access` | Forbidden | 107-111 |
| 404 | `unmatched_gateway_route` | Unmatched gateway route | 92-96 |
| 429 | `rate_limit_exceeded` | Too Many Requests | 97-101 |
| 502 | `proxy_error` | Proxy or invalid downstream response | 73-84, 112-116 |
| 503 | `destination_unavailable` | Destination unavailable | 67-72, 117-121 |
| 504 | `downstream_timeout` | Downstream timeout | 60-66, 122-126 |
| 500 (exception in gateway) | `gateway_internal_error` | Gateway Internal Error | 38-45 |

**Important for the client:** downstream responses that already carry a body pass through untouched, so a 401/403/404 can have *either* this gateway shape *or* the service's own shape. Downstream services that return 401 with an **empty** body (identity, inventory-media, notification-integration all do via `GatewayHeader` auth challenge or `UnauthorizedResult`) are probably rewritten into this shape, but this depends on YARP not having flushed headers for an empty body — **ambiguous; handle both**. A downstream empty-body 404 is reported as `unmatched_gateway_route` (misleading).

## 5. Headers

Request — stripped before proxying (`Middleware/HeaderManagementMiddleware.cs:16-28, 38-53`): `X-User-Id, X-Session-Id, X-Tenant-Id, X-Organization-Id, X-Internal-Identity, X-Internal-Role, X-Permissions, X-Is-Admin, X-Internal-Sub, X-Internal-Caller` and any `X-Internal-*`. The YARP transform additionally removes `X-User-Id, X-Session-Id, X-User-Email, X-Email-Verified` (`Extensions/GatewayExtensions.cs:300-307`).

Request — added (`Extensions/GatewayExtensions.cs:308-336`), only when the JWT validated:
- `X-User-Id` = `sub` (via `NameIdentifier`)
- `X-Session-Id` = `sid`
- `X-User-Email` = `email`
- `X-Email-Verified` = `email_verified` (string `"true"`/`"false"`)

Downstream services authenticate **solely** from these headers (`building-blocks/Emcore.BuildingBlocks.Security/SecurityTypes.cs:42-89`, `GatewayHeader` scheme). No roles/permissions headers are forwarded.

Request/response — `X-Request-Id` and `X-Correlation-Id` are generated if absent (GUID), forwarded downstream and echoed on every response (`Middleware/HeaderManagementMiddleware.cs:55-82`). CORS exposes `X-Request-Id, X-Correlation-Id, Retry-After` (`Extensions/GatewayExtensions.cs:85-88`).

Response security headers (`Middleware/SecurityHeadersMiddleware.cs:20-44`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests;` on API paths, HSTS in Production.

Not implemented anywhere: `X-StepUp-Token` header (declared only as an OpenAPI security scheme: `building-blocks/Emcore.BuildingBlocks.Api/OpenApiExtensions.cs:204-210`, described as "Downstream Step-Up Enforcement: NOT VERIFIED / NOT IMPLEMENTED"); `X-Idempotency-Key` (commented out, "current runtime does not enforce": `OpenApiExtensions.cs:300-303`; identity merely echoes it back — `services/identity-access/src/Emcore.IdentityAccess.Api/Program.cs:63-64`).

## 6. Limits

- Max request body 10 MiB (`Gateway:MaxRequestBodySizeBytes`, `appsettings.json:20`; `Extensions/GatewayExtensions.cs:66-75`). File bytes go directly to S3 via presigned URL, not through the gateway.
- Request headers timeout 30 s.

## 7. Gateway-owned endpoints (Program.cs:58-124)

`GET /health`, `/health/live`, `/health/ready` → `{ "status": ..., "service": ... }` (minimal-API `Results.Ok` uses web JSON defaults ⇒ camelCase); `GET /api/v1/system/version` → `{ serviceName, version, environment }`; `GET /api/v1/swagger/registry` (non-prod, or authenticated in prod).
