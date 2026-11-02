import { getErrorMessage, isApiError } from "@/lib/api/errors";

/** user-organization KYC review codes (ProblemDetails `code`). */
const MESSAGES: Record<string, string> = {
  MARKETPLACE_SELLER_DOCUMENT_FILE_INVALID:
    "The file for this document is missing or still uploading, so it can't be verified. Ask the seller to upload it again, or reject it with a note.",
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
  REINSTATEMENT_REASON_REQUIRED: "Enter a meaningful reason for reinstating this seller.",
  INVALID_ROW_VERSION: "The seller's record was out of date. It has been reloaded; try again.",
  MARKETPLACE_SELLER_NOT_FOUND: "This seller no longer exists. Return to the seller list.",
};

export function kycErrorMessage(error: unknown): string {
  if (isApiError(error) && error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return getErrorMessage(error);
}
