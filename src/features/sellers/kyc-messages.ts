import { getErrorMessage, isApiError } from "@/lib/api/errors";

/** user-organization KYC review codes (ProblemDetails `code`). */
const MESSAGES: Record<string, string> = {
  // Backend defect KYC-FILE-1: verify checks the file's owner against the seller id instead of the uploading user,
  // so every Verify fails with this code until the backend fix is deployed. Reject still works.
  MARKETPLACE_SELLER_DOCUMENT_FILE_INVALID:
    "The server couldn't confirm this file in storage, so it can't be verified yet. This is a known backend issue (KYC-FILE-1) affecting every seller document; Reject still works. Try Verify again after the backend fix is deployed.",
  REJECTION_REASON_REQUIRED: "Add a note explaining why — the seller sees it.",
  AMBIGUOUS_RECLASSIFICATION_NOT_ALLOWED: "Choose an explicit document type; the generic VAT type isn't allowed.",
  SELLER_LICENCE_EXPIRED: "Can't approve: the seller's trade licence expiry date is missing or in the past.",
  MANDATORY_DOCUMENTS_INCOMPLETE: "Can't approve: every required document category needs a verified document, including signatory ID and authority.",
  MANDATORY_KYC_DOCUMENTS_INCOMPLETE: "Can't approve: every required document category needs a verified document, including signatory ID and authority.",
  POLICY_ACCEPTANCE_REQUIRED: "Can't approve: the seller's owner hasn't accepted the current mandatory policies.",
  POLICY_CONFIGURATION_ERROR: "Can't approve: a mandatory policy has no published revision. Publish it under Policies first.",
  MARKETPLACE_SELLER_VERSION_CONFLICT: "The seller changed since you opened it. Close and reopen the review.",
  MARKETPLACE_SELLER_TRANSITION_INVALID: "That decision isn't possible in the seller's current state.",
  MARKETPLACE_SELLER_DOCUMENT_NOT_FOUND: "That document no longer exists.",
  DUPLICATE_TRADE_LICENSE: "Another seller is already registered with this trade licence and authority.",
  FORBIDDEN: "You don't have permission for this decision.",
};

export function kycErrorMessage(error: unknown): string {
  if (isApiError(error) && error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return getErrorMessage(error);
}
