import { http } from "@/lib/api/client";
import type { EvaluateRefundRequest, OrderCommissionBreakdownDto, PaymentCaptureEvaluationDto, PaymentRefundEvaluationDto, SellerSettlementEligibilityDto } from "@/api/types/financial";

/** /api/v1/admin/financial — evaluations only (Platform Admin). Contract: docs/contracts/financial.md */
const seg = encodeURIComponent;
const base = "/api/v1/admin/financial";

export const financialService = {
  commission: (orderId: string, signal?: AbortSignal) => http.get<OrderCommissionBreakdownDto>(`${base}/orders/${seg(orderId)}/commission-breakdown`, { signal }),
  captureReadiness: (orderId: string, signal?: AbortSignal) => http.get<PaymentCaptureEvaluationDto>(`${base}/orders/${seg(orderId)}/capture-readiness`, { signal }),
  evaluateRefund: (orderId: string, body: EvaluateRefundRequest) => http.post<PaymentRefundEvaluationDto>(`${base}/orders/${seg(orderId)}/evaluate-refund`, body),
  settlement: (subOrderId: string, asOfUtc?: string, signal?: AbortSignal) =>
    http.get<SellerSettlementEligibilityDto>(`${base}/suborders/${seg(subOrderId)}/settlement-eligibility`, { signal, query: { asOfUtc } }),
};

export const financialKeys = {
  all: ["financial"] as const,
  commission: (id: string) => ["financial", "commission", id] as const,
  capture: (id: string) => ["financial", "capture", id] as const,
  settlement: (id: string, asOf: string) => ["financial", "settlement", id, asOf] as const,
};
