/**
 * BE-09 Platform Admin seller-timeout escalations (BiddingDeal, /api/v1/admin/orders/escalations). No envelope:
 * bare DTOs / arrays; errors are ProblemDetails with `code`. Mirrors Contracts/Orders/SellerTimeoutEscalationDtos.cs
 * and OrderDtos.cs (only the fields this UI reads are typed). Timestamps are UTC (DateTimeOffset).
 */
import type { Guid } from "./catalog-moderation";

export type EscalationResolutionStatus = "PENDING" | "RESOLVED_SELLER_CONFIRMED" | "RESOLVED_SELLER_REJECTED" | "RESOLVED_ADMIN_CANCELLED" | "RESOLVED_ADMIN_OVERRIDE" | (string & {});

export interface SellerSubOrderEscalationDto {
  escalationId: Guid;
  subOrderId: Guid;
  subOrderNumber: string;
  parentOrderId: Guid;
  orderNumber: string;
  sellerOrganizationId: Guid;
  sellerName: string | null;
  subOrderTotal: number;
  subOrderStatus: string;
  escalatedAtUtc: string;
  slaExpiresAtUtc: string;
  adminReviewDeadlineUtc: string;
  isOverdue: boolean;
  adminReviewTimeRemainingSeconds: number;
  resolutionStatus: EscalationResolutionStatus;
  resolvedAtUtc: string | null;
  resolvedBy: string | null;
  adminDecision: string | null;
  decisionReason: string | null;
  buyerConsentMultiSellerContinuation: boolean;
  buyerNotifiedAtUtc: string | null;
  /** Base64 rowversion; send as expectedRowVersion on a decision. */
  rowVersion: string;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

export interface SellerSubOrderReminderDto {
  reminderId: Guid;
  reminderType: string;
  offsetHours: number;
  scheduledForUtc: string;
  sentAtUtc: string | null;
  channel: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
}

export interface SellerSubOrderEscalationAuditDto {
  auditId: Guid;
  escalationId: Guid;
  subOrderId: Guid;
  action: string;
  performedBy: string;
  performedByRole: string;
  reason: string | null;
  detailsJson: string | null;
  createdAtUtc: string;
}

/** Subset of SellerSubOrderDto. */
export interface EscalationSubOrder {
  subOrderId: Guid;
  subOrderNumber: string;
  sellerLegalName: string | null;
  sellerTradingName: string | null;
  materialSubtotal: number;
  applicableMaterialVat: number;
  subOrderTotal: number;
  status: string;
  fulfillmentStatus: string;
  confirmationDeadlineUtc: string | null;
  sellerConfirmedAtUtc: string | null;
  sellerRejectedAtUtc: string | null;
  sellerRejectionReason: string | null;
  items: Array<{ title?: string | null; quantity?: number; lineTotal?: number } & Record<string, unknown>>;
}

/** Subset of MarketplaceOrderDto. */
export interface EscalationParentOrder {
  orderId: Guid;
  orderNumber: string;
  orderDateUtc: string;
  currency: string;
  totalPayableAmount: number;
  status: string;
  paymentStatus: string;
  buyerConsentMultiSellerContinuation: boolean;
  subOrders: Array<{ subOrderId: Guid }>;
}

export interface SellerSubOrderEscalationDetailDto {
  escalation: SellerSubOrderEscalationDto;
  subOrder: EscalationSubOrder;
  parentOrder: EscalationParentOrder;
  reminders: SellerSubOrderReminderDto[];
  auditTrail: SellerSubOrderEscalationAuditDto[];
}

/** Only CANCEL is approved for operational use; other values return 400 PROCEDURE_NOT_APPROVED. */
export interface AdminDecisionRequest {
  decision: "CANCEL";
  reason: string;
  notes: string | null;
  expectedRowVersion: string;
}

export interface EscalationQueueQuery {
  page: number;
  pageSize: number;
  /** PENDING, ALL or a resolution status. */
  status?: string;
  isOverdue?: boolean;
  sellerId?: string;
}
