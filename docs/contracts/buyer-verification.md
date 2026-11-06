# Admin buyer identity verification (one ID document, Q1–Q15)

Source: `tsforcetech/STOCKOUT` @ `2239c6a` (6 Nov 2026) — `AdminMarketplaceBuyersController.cs`,
`Contracts/Marketplace/BuyerContracts.cs`, `MarketplaceBuyerService.cs`, migration
`039_BuyerOneDocumentIdentityVerification.sql`. Owner decisions: completion register v3.0 (Q1–Q15).
All responses use the `{ success, data }` envelope; errors are ProblemDetails with `code`.

## Endpoints (base `/api/v1/admin/marketplace/buyers`)

| Method | Path | Permission | Body | Returns |
|---|---|---|---|---|
| GET | `/` | buyers.view | — | `AdminBuyerListItemDto[]` |
| GET | `/{buyerId}` | buyers.view | — | `BuyerProfileDto` (incl. Q4 fields, `requiresReverification`, `rowVersion`) |
| GET | `/{buyerId}/documents` | buyers.view | — | `AdminBuyerDocumentResponse[]` (short-lived `downloadUrl`) |
| GET | `/{buyerId}/documents/{documentId}/download-url` | buyers.view | — | `AdminBuyerDocumentDownloadUrlResponse` (private signed URL) |
| POST | `/{buyerId}/documents/{documentId}/review` | buyers.verify (VERIFY) / buyers.reject (REJECT) | `{ action: "VERIFY"\|"REJECT", reviewRemark?, reclassifiedDocumentType? }` | `AdminBuyerDocumentResponse` |
| POST | `/{buyerId}/verify` | buyers.verify | `{ expectedRowVersion }` | `BuyerProfileDto` |
| POST | `/{buyerId}/reject` | buyers.reject | `{ expectedRowVersion, reason }` | `BuyerProfileDto` |
| POST | `/{buyerId}/suspend` | buyers.suspend | `{ expectedRowVersion, reason }` | `BuyerProfileDto` |
| GET | `/{buyerId}/history` | buyers.view | — | `BuyerVerificationHistoryDto[]` |

Types: `src/api/types/user-organization.ts` (AdminBuyer*, BuyerDocumentResponse, BuyerVerificationHistoryDto).

## Rules enforced by the backend (and mirrored in the UI)

- Accepted ID types: `EMIRATES_ID`, `PASSPORT`, `NATIONAL_ID` (aliases `GOVERNMENT_ID`, `OTHER_GOVERNMENT_ID`).
- Approve needs exactly one qualifying identity document reviewed `VERIFIED`, complete Q4 details and current policy
  acceptances (`MANDATORY_KYC_DOCUMENTS_INCOMPLETE`, `BUYER_IDENTITY_DETAILS_INCOMPLETE`, `POLICY_ACCEPTANCE_REQUIRED`).
- Verify / reject buyer: status `SUBMITTED` or `UNDER_REVIEW`, or `requiresReverification = 1`. Suspend: from `VERIFIED`,
  `SUBMITTED`, `UNDER_REVIEW`. Otherwise `MARKETPLACE_BUYER_TRANSITION_INVALID`.
- Reject and suspend need a reason (`REJECTION_REASON_REQUIRED`, `SUSPENSION_REASON_REQUIRED`); rejecting a document
  needs `reviewRemark`. Verifying an expired document → `DOCUMENT_EXPIRED`.
- Stale `expectedRowVersion` → `MARKETPLACE_BUYER_VERSION_CONFLICT`. The UI re-reads the buyer before every decision.
- Q8: verified buyers stay verified after document expiry; revocation = suspend.
- Q10: historical verified buyers have `requiresReverification = true` and cannot purchase until re-approved.

## Not available / pending

- Two-business-day target is shown as advice; no business calendar SLA deadline is returned (register §7.1).
- No reinstate/unsuspend route for buyers.
- Live UAT not yet run (needs an admin with buyers.* permissions and migration 039 deployed).
