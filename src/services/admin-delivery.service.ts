import { http } from "@/lib/api/client";
import type { BuyerOrderClaimDto, OrderDeliveryEvidenceDto, RecordDeliveryEvidenceRequest, UpdateFulfillmentStatusRequest } from "@/api/types/admin-delivery";
import type { AdminSubOrderDto } from "@/api/types/admin-orders";

/** /api/v1/admin/orders/suborders/* and /claims (BiddingDeal). Contract: docs/contracts/admin-delivery.md */
const seg = encodeURIComponent;
const base = "/api/v1/admin/orders";

export const adminDeliveryService = {
  updateFulfillment: (subOrderId: string, body: UpdateFulfillmentStatusRequest) => http.post<AdminSubOrderDto>(`${base}/suborders/${seg(subOrderId)}/fulfillment`, body),
  evidence: (subOrderId: string, signal?: AbortSignal) => http.get<OrderDeliveryEvidenceDto[]>(`${base}/suborders/${seg(subOrderId)}/evidence`, { signal }),
  recordEvidence: (subOrderId: string, body: RecordDeliveryEvidenceRequest) => http.post<OrderDeliveryEvidenceDto>(`${base}/suborders/${seg(subOrderId)}/evidence`, body),
  /** Bare array; page ≥ 1, pageSize 1–100, optional status. */
  claims: (q: { page: number; pageSize: number; status?: string }, signal?: AbortSignal) =>
    http.get<BuyerOrderClaimDto[]>(`${base}/claims`, { signal, query: { page: q.page, pageSize: q.pageSize, status: q.status || undefined } }),
};

export const adminDeliveryKeys = {
  evidence: (subOrderId: string) => ["admin-orders", "evidence", subOrderId] as const,
  claims: (q: object) => ["admin-orders", "claims", q] as const,
};
