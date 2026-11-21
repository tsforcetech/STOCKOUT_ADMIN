import { http } from "@/lib/api/client";
import type {
  AdminCancelResponse,
  AdminOrderDetailDto,
  AdminOrderListItemDto,
  AdminOrderListQuery,
  AdminOrderTimelineDto,
  AdminOrdersSummaryDto,
  AdminPaymentAuthorizationDto,
  AdminPaymentAuthorizationQuery,
  PagedResponse,
} from "@/api/types/admin-orders";

/** BE-25 admin order monitoring (BiddingDeal via Gateway). PlatformAdmin only; the two cancels are reasoned and idempotent. */
const seg = encodeURIComponent;
const orders = "/api/v1/admin/orders";
const payments = "/api/v1/admin/payment-authorizations";
const opt = (v: string | undefined) => v || undefined;

export const adminOrdersService = {
  summary: (signal?: AbortSignal) => http.get<AdminOrdersSummaryDto>(`${orders}/summary`, { signal }),
  list: (q: AdminOrderListQuery, signal?: AbortSignal) =>
    http.get<PagedResponse<AdminOrderListItemDto>>(orders, {
      signal,
      query: { page: q.page, pageSize: q.pageSize, status: opt(q.status), paymentStatus: opt(q.paymentStatus), sellerOrganizationId: opt(q.sellerOrganizationId), buyerOrganizationId: opt(q.buyerOrganizationId), fromUtc: opt(q.fromUtc), toUtc: opt(q.toUtc), q: opt(q.q) },
    }),
  detail: (id: string, signal?: AbortSignal) => http.get<AdminOrderDetailDto>(`${orders}/${seg(id)}`, { signal }),
  timeline: (id: string, signal?: AbortSignal) => http.get<AdminOrderTimelineDto>(`${orders}/${seg(id)}/timeline`, { signal }),
  cancelOrder: (id: string, body: { reason: string; idempotencyKey: string; expectedRowVersion: string }) =>
    http.post<AdminCancelResponse>(`${orders}/${seg(id)}/cancel`, body),
  payments: (q: AdminPaymentAuthorizationQuery, signal?: AbortSignal) =>
    http.get<PagedResponse<AdminPaymentAuthorizationDto>>(payments, { signal, query: { page: q.page, pageSize: q.pageSize, status: opt(q.status), recoveryStatus: opt(q.recoveryStatus), q: opt(q.q) } }),
  cancelPayment: (attemptId: string, body: { reason: string; idempotencyKey: string }) =>
    http.post<AdminCancelResponse>(`${payments}/${seg(attemptId)}/cancel`, body),
};

export const adminOrderKeys = {
  all: ["admin-orders"] as const,
  summary: ["admin-orders", "summary"] as const,
  list: (q: AdminOrderListQuery) => ["admin-orders", "list", q] as const,
  detail: (id: string) => ["admin-orders", "detail", id] as const,
  timeline: (id: string) => ["admin-orders", "timeline", id] as const,
  payments: (q: AdminPaymentAuthorizationQuery) => ["admin-orders", "payments", q] as const,
};
