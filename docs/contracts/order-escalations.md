# Order escalations (BE-09)

Source: `services/bidding-deal` — `AdminOrdersEscalationsController`, `PlatformAdminEscalationService`,
`Contracts/Orders/SellerTimeoutEscalationDtos.cs` (main 95a71b3). Gateway routes `/api/v1/admin/orders/**` to BiddingDeal.
No envelope; errors are ProblemDetails with `code`.

| Method | Route | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/orders/escalations` | `page`≥1, `pageSize` 1–100, `status` (PENDING, ALL, RESOLVED_*), `isOverdue`, `sellerId` | `SellerSubOrderEscalationDto[]` (no total) |
| GET | `/api/v1/admin/orders/escalations/{id}` | — | `{ escalation, subOrder, parentOrder, reminders[], auditTrail[] }` |
| GET | `/api/v1/admin/orders/escalations/{id}/audit` | — | `SellerSubOrderEscalationAuditDto[]` |
| POST | `/api/v1/admin/orders/escalations/{id}/decision` | `{ decision: "CANCEL", reason, notes?, expectedRowVersion }` | `SellerSubOrderEscalationDto` |

Access: view = `orders.escalations.view` OR platform admin. Cancel = `orders.escalations.cancel` AND
(`platform.admin` OR `platform.superadmin` permission). Other decisions → 400 `PROCEDURE_NOT_APPROVED`.

Errors: `INVALID_PAGINATION`, `ESCALATION_NOT_FOUND`/`SUB_ORDER_NOT_FOUND`/`PARENT_ORDER_NOT_FOUND` (404),
`MANDATORY_DECISION_REASON`, `INVALID_ROW_VERSION`, `INVALID_DECISION`, `PROCEDURE_NOT_APPROVED` (400), `FORBIDDEN` (403),
`CONCURRENCY_CONFLICT`, `ALREADY_RESOLVED`, `SELLER_ALREADY_RESPONDED`, `DECISION_FAILED` (409).

Resolution statuses: `PENDING`, `RESOLVED_SELLER_CONFIRMED`, `RESOLVED_SELLER_REJECTED`, `RESOLVED_ADMIN_CANCELLED`, `RESOLVED_ADMIN_OVERRIDE`.

Known gap (17 Nov 2026): no migration seeds `orders.escalations.view`, `orders.escalations.cancel` or `platform.superadmin`, so no
user can cancel until they are created and granted.
