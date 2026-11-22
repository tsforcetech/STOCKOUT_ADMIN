# Admin financial evaluations (Payments & Payouts)

Source: `services/bidding-deal` — `AdminFinancialSettlementController`, `Contracts/Payments/FinancialSettlementDtos.cs`.
Gateway: `/api/v1/admin/financial` and `/{**catch-all}` → bidding-deal (authenticated). No envelope; ProblemDetails with `code`.
Access: Platform Admin only (`IsPlatformAdminAsync`), else 403 `FORBIDDEN`.

Built (read-only evaluations, nothing executed):

| Method | Route | Response |
| --- | --- | --- |
| GET | `orders/{orderId}/commission-breakdown` | `OrderCommissionBreakdownDto` |
| GET | `orders/{orderId}/capture-readiness` (`idempotencyKey`? query) | `PaymentCaptureEvaluationDto` |
| POST | `orders/{orderId}/evaluate-refund` `{ orderId, requestedRefundAmount > 0, reason, subOrderId? }` | `PaymentRefundEvaluationDto` |
| GET | `suborders/{subOrderId}/settlement-eligibility` (`asOfUtc`? query) | `SellerSettlementEligibilityDto` |

Not built (money movement; needs owner approval before any UI): POST `orders/{id}/capture`, `orders/{id}/refund`,
`orders/{id}/settlement`, `orders/{id}/transfer-reversal` (added after 18 Nov).

Errors: `INVALID_ORDER_ID`, `INVALID_SUBORDER_ID`, `ORDER_NOT_FOUND`, `SUBORDER_NOT_FOUND`, `ORDER_EMPTY`, `INVALID_REFUND_REQUEST`.
