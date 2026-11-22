import { Badge, type BadgeTone } from "@/components/ui/misc";
import { isApiError } from "@/lib/api/errors";
import { Notice } from "@/features/listings/shared";
import { humanize } from "@/lib/utils/format";

/** Order statuses an admin can filter by (BE-25 §4.2). */
export const ORDER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING_CONFIRMATION: { label: "Awaiting seller", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  IN_FULFILLMENT: { label: "In fulfilment", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  DRAFT: { label: "Draft", tone: "neutral" },
};

export function OrderStatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const s = ORDER_STATUS[value] ?? { label: humanize(value), tone: "neutral" as BadgeTone };
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

const SUB_STATUS: Record<string, BadgeTone> = { PENDING_CONFIRMATION: "warning", CONFIRMED: "info", REJECTED: "danger", CANCELLED: "neutral", COMPLETED: "success", ACCEPTED: "success", DELIVERED: "success", COLLECTED: "success" };
export function SubStatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <Badge tone={SUB_STATUS[value] ?? "neutral"} dot>
      {label ?? (value === "PENDING_CONFIRMATION" ? "Awaiting seller" : humanize(value))}
    </Badge>
  );
}

/**
 * Payment badge (BE-25 §1, §5). An authorised hold is never shown as money received: "Captured" only when the server says
 * isPaymentCaptured (or CAPTURED with a captured amount).
 */
export function paymentLabel(status: string | null | undefined, captured: boolean, capturedAmount = 0): { label: string; tone: BadgeTone } {
  const s = (status ?? "").toUpperCase();
  if (s === "REFUNDED") return { label: "Refunded", tone: "neutral" };
  if (s === "REFUND_PENDING") return { label: "Refund pending", tone: "warning" };
  if (captured || (s === "CAPTURED" && capturedAmount > 0)) return { label: "Captured", tone: "success" };
  if (s === "AUTHORIZED") return { label: "Authorised hold · not captured", tone: "info" };
  if (s === "CAPTURE_PENDING") return { label: "Capture pending", tone: "warning" };
  if (s === "VOIDED" || s === "CANCELLED") return { label: "Cancelled / voided", tone: "neutral" };
  if (s === "RECONCILIATION_REQUIRED") return { label: "Reconciliation required", tone: "danger" };
  if (s === "AUTHORIZATION_EXPIRED") return { label: "Hold expired", tone: "danger" };
  if (s === "FAILED" || s === "AUTHORIZATION_FAILED") return { label: "Failed", tone: "danger" };
  if (s === "PENDING_AUTHORIZATION") return { label: "Awaiting authorisation", tone: "warning" };
  return { label: status ? humanize(status) : "—", tone: "neutral" };
}

export function PaymentBadge({ status, captured, capturedAmount }: { status: string | null | undefined; captured: boolean; capturedAmount?: number }) {
  const p = paymentLabel(status, captured, capturedAmount);
  return (
    <Badge tone={p.tone} dot>
      {p.label}
    </Badge>
  );
}

export const PAYMENT_STATUS_FILTER = ["AUTHORIZED", "CAPTURED", "VOIDED", "RECONCILIATION_REQUIRED", "AUTHORIZATION_EXPIRED", "REFUNDED", "FAILED"];

/** Order cancel is offered only before dispatch and before capture (BE-25 §4.7); the server re-checks. */
const up = (v: string | null | undefined) => (v ?? "").toUpperCase();
const DONE = new Set(["CANCELLED", "REJECTED"]);
const FINISHED = new Set(["COMPLETED", "ACCEPTED"]);

/**
 * The order's real stage from its seller parts. BiddingDeal never moves the parent order off PENDING_CONFIRMATION after
 * sellers confirm (OJ-14), so trusting it alone shows "Awaiting seller" on delivered orders and offers Cancel. The
 * parent value wins only when it is already further along (CANCELLED / COMPLETED) or no part says otherwise.
 */
export function effectiveOrderStatus(o: { status: string; subOrders: { status: string; fulfillmentStatus?: string | null }[] }): string {
  const parent = up(o.status);
  if (parent === "CANCELLED" || parent === "COMPLETED" || !o.subOrders.length) return parent;
  const subs = o.subOrders.map((s) => ({ st: up(s.status), f: up(s.fulfillmentStatus) }));
  if (subs.some((s) => s.st === "PENDING_CONFIRMATION")) return "PENDING_CONFIRMATION";
  const live = subs.filter((s) => !DONE.has(s.st));
  if (!live.length) return "CANCELLED";
  if (live.every((s) => FINISHED.has(s.st))) return "COMPLETED";
  if (live.every((s) => FINISHED.has(s.st) || s.st === "DELIVERED" || s.f === "DELIVERED")) return "DELIVERED";
  if (live.some((s) => s.st === "IN_FULFILLMENT" || (s.f && s.f !== "NOT_STARTED") || s.st === "DELIVERED")) return "IN_FULFILLMENT";
  return "CONFIRMED";
}

/** Seller-part badges: the fulfilment step only when it adds something (no "Delivered · Delivered"). */
export const showFulfilmentBadge = (status: string, fulfillmentStatus: string | null | undefined) =>
  !!fulfillmentStatus && up(fulfillmentStatus) !== "NOT_STARTED" && up(fulfillmentStatus) !== up(status);

export const canCancelOrder = (status: string, captured: boolean) => (status === "PENDING_CONFIRMATION" || status === "CONFIRMED") && !captured;

export const ADMIN_ORDER_MESSAGES: Record<string, string> = {
  ORDER_FULFILLMENT_IN_PROGRESS: "A seller has already started fulfilling this order, so it can't be cancelled here.",
  ORDER_PAYMENT_ALREADY_CAPTURED: "The payment has already been captured. Cancelling now needs a refund, which isn't available here.",
  PAYMENT_ALREADY_CAPTURED: "Stripe says this payment was already captured, so it can't be voided.",
  ORDER_NOT_ELIGIBLE_FOR_CANCELLATION: "This order can no longer be cancelled.",
  ORDER_CONCURRENCY_CONFLICT: "The order changed since you opened it. It has been reloaded; check it before trying again.",
  INVALID_ROW_VERSION: "The order needs reloading. It has been refreshed; try again.",
  PAYMENT_PREAUTH_BOUND_TO_ACTIVE_ORDER: "This payment belongs to a placed order. Cancel the order instead (open it from the Orders list).",
  MANDATORY_CANCELLATION_REASON: "Write the reason for cancelling.",
  FORBIDDEN: "Only Platform Admins can do this.",
};

/** BE-25 answers 403 when the admin lacks the backend's order-monitoring permission: say so instead of showing an empty list. */
export function OrdersAccessNotice({ error }: { error: unknown }) {
  if (!isApiError(error) || error.status !== 403) return null;
  return (
    <Notice tone="warning" className="mb-4" title="Your admin account can't see orders yet">
      The orders service needs the platform.admin or orders.escalations.view permission on your account. Ask the backend team to add it to the Super Admin / Platform Admin role.
    </Notice>
  );
}
