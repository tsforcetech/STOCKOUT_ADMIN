# Admin delivery progression, proof and claims

Source: `services/bidding-deal` - `AdminOrdersDeliveryController`, `OrderLifecycleService`, `Contracts/Orders/OrderLifecycleDtos.cs` (main 2f439f7).
Gateway `/api/v1/admin/orders/**` to bidding-deal. No envelope; ProblemDetails with `code`. Platform Admin only.

| Method | Route | Body / query | Response |
| --- | --- | --- | --- |
| POST | `/api/v1/admin/orders/suborders/{subOrderId}/fulfillment` | `{ status, proofReference?, remarks?, expectedRowVersion, timestampUtc? }` (If-Match also accepted) | `SellerSubOrderDto` |
| POST | `/api/v1/admin/orders/suborders/{subOrderId}/evidence` | `{ evidenceType: STOCKOUT_DELIVERY_PROOF, fileAssetId?, documentReference (required), notes? }` | `OrderDeliveryEvidenceDto` |
| GET | `/api/v1/admin/orders/suborders/{subOrderId}/evidence` | - | `OrderDeliveryEvidenceDto[]` |
| GET | `/api/v1/admin/orders/claims` | `page`, `pageSize`, `status` | `BuyerOrderClaimDto[]` (bare array) |

Status values: PREPARING, READY_FOR_COLLECTION, IN_TRANSIT, DELIVERED, COLLECTED. The UI offers the freight steps PREPARING, IN_TRANSIT, DELIVERED
(proof reference required for DELIVERED); a proof reference on an update is saved by the server as verified STOCKOUT_DELIVERY_PROOF.
The sub-order must be CONFIRMED or IN_FULFILLMENT (else `INVALID_SUB_ORDER_STATE`). Conflicts: `CONCURRENCY_CONFLICT` (reload, never retry).
Claim statuses: FILED, UNDER_REVIEW, APPROVED, REJECTED, ESCALATED. No claim decision endpoint exists yet (handoff OJ-07).
