import { http } from "@/lib/api/client";
import type { AdminDecisionRequest, EscalationQueueQuery, SellerSubOrderEscalationAuditDto, SellerSubOrderEscalationDetailDto, SellerSubOrderEscalationDto } from "@/api/types/order-escalations";

/**
 * BE-09 escalation review (BiddingDeal via Gateway). View: platform admin or orders.escalations.view;
 * cancel: orders.escalations.cancel + platform admin authority (checked server-side).
 */
const seg = encodeURIComponent;
const base = "/api/v1/admin/orders/escalations";

export const orderEscalationsService = {
  /** Bare array (no totals); pageSize 1–100. */
  queue: (q: EscalationQueueQuery, signal?: AbortSignal) =>
    http.get<SellerSubOrderEscalationDto[]>(base, { signal, query: { page: q.page, pageSize: q.pageSize, status: q.status || undefined, isOverdue: q.isOverdue, sellerId: q.sellerId || undefined } }),
  detail: (id: string, signal?: AbortSignal) => http.get<SellerSubOrderEscalationDetailDto>(`${base}/${seg(id)}`, { signal }),
  audit: (id: string, signal?: AbortSignal) => http.get<SellerSubOrderEscalationAuditDto[]>(`${base}/${seg(id)}/audit`, { signal }),
  decide: (id: string, body: AdminDecisionRequest) => http.post<SellerSubOrderEscalationDto>(`${base}/${seg(id)}/decision`, body),
};

export const escalationKeys = {
  all: ["order-escalations"] as const,
  queue: (q: EscalationQueueQuery) => ["order-escalations", "queue", q] as const,
  detail: (id: string) => ["order-escalations", "detail", id] as const,
  audit: (id: string) => ["order-escalations", "audit", id] as const,
};
