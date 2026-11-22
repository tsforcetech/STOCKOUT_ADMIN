/**
 * Admin financial evaluations (BiddingDeal, /api/v1/admin/financial). Read-only checks: nothing captures, refunds
 * or transfers money. Platform Admin only. No envelope; errors are ProblemDetails with `code`.
 * Mirrors Contracts/Payments/FinancialSettlementDtos.cs (main 2373993).
 */
import type { Guid } from "./catalog-moderation";

export interface SubOrderCommissionDto {
  subOrderId: Guid;
  sellerOrganizationId: Guid;
  subOrderNumber: string;
  materialSubtotal: number;
  applicableMaterialVat: number;
  subOrderTotal: number;
  sellerFundedDiscount: number;
  netMaterialValueBase: number;
  platformServiceCharge: number;
  commissionVatAmount: number;
  totalPlatformDeduction: number;
  netSellerPayoutAllocation: number;
}

export interface OrderCommissionBreakdownDto {
  orderId: Guid;
  orderNumber: string;
  currency: string;
  aggregateMaterialAmount: number;
  aggregateMaterialVat: number;
  aggregateDeliveryAmount: number;
  aggregateDeliveryVat: number;
  totalBuyerPayable: number;
  totalPlatformServiceCharge: number;
  totalCommissionVat: number;
  totalPlatformRetainedRevenue: number;
  totalSellerPayoutAllocation: number;
  subOrders: SubOrderCommissionDto[];
  roundingResidual: number;
}

export interface PaymentCaptureEvaluationDto {
  orderId: Guid;
  orderNumber: string;
  currentPaymentStatus: string;
  canCapture: boolean;
  requiresReconciliation: boolean;
  code: string;
  description: string;
  /** True while live provider execution (Stripe) is gated off. */
  isProviderExecutionGated: boolean;
  evaluatedAtUtc: string;
}

export interface PaymentRefundEvaluationDto {
  orderId: Guid;
  orderNumber: string;
  canRefund: boolean;
  isPreCaptureCancellation: boolean;
  code: string;
  description: string;
  eligibleRefundAmount: number;
  commissionReversalAmount: number;
  commissionVatReversalAmount: number;
  isProviderExecutionGated: boolean;
  evaluatedAtUtc: string;
}

export interface EvaluateRefundRequest {
  orderId: Guid;
  /** Must be > 0 (400 INVALID_REFUND_REQUEST). */
  requestedRefundAmount: number;
  reason: string;
  subOrderId: string | null;
}

export interface SellerSettlementEligibilityDto {
  subOrderId: Guid;
  subOrderNumber: string;
  sellerOrganizationId: Guid;
  isEligible: boolean;
  payoutEligibilityStatus: string;
  netPayableAmount: number;
  deductedCommission: number;
  deductedCommissionVat: number;
  settlementCurrency: string;
  isTransferExecutionGated: boolean;
  passingChecks: string[];
  failingChecks: string[];
  summary: string;
  evaluatedAtUtc: string;
}
