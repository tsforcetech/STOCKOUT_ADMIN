/**
 * Admin delivery progression, proof and claims (BiddingDeal AdminOrdersDeliveryController, OrderLifecycleDtos.cs,
 * main 2f439f7). No envelope; ProblemDetails with `code`. Platform Admin only.
 */
export type FulfillmentTarget = "PREPARING" | "IN_TRANSIT" | "DELIVERED";

export interface UpdateFulfillmentStatusRequest {
  /** PREPARING, READY_FOR_COLLECTION, IN_TRANSIT, DELIVERED, COLLECTED (freight uses PREPARING → IN_TRANSIT → DELIVERED). */
  status: FulfillmentTarget;
  /** When given, the server also records it as verified STOCKOUT_DELIVERY_PROOF. */
  proofReference: string | null;
  remarks: string | null;
  expectedRowVersion: string;
  timestampUtc: string | null;
}

export interface OrderDeliveryEvidenceDto {
  evidenceId: string;
  subOrderId: string;
  orderId: string;
  evidenceType: string;
  fileAssetId: string | null;
  documentReference: string;
  recordedBy: string;
  recordedAtUtc: string;
  verificationStatus: string;
  verifiedBy: string | null;
  verifiedAtUtc: string | null;
  notes: string | null;
}

export interface RecordDeliveryEvidenceRequest {
  evidenceType: "STOCKOUT_DELIVERY_PROOF";
  fileAssetId: string | null;
  /** Required (400 INVALID_EVIDENCE when blank). */
  documentReference: string;
  notes: string | null;
}

export interface BuyerOrderClaimDto {
  claimId: string;
  subOrderId: string;
  orderId: string;
  buyerUserId: string;
  sellerOrganizationId: string;
  orderLineId: string | null;
  claimReason: string;
  affectedQuantity: number | null;
  evidenceReference: string | null;
  /** FILED, UNDER_REVIEW, APPROVED, REJECTED, ESCALATED */
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  resolvedAtUtc: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}
