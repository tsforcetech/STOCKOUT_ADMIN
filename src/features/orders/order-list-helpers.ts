import type { BadgeTone } from "@/components/ui/misc";
import type { AdminOrderListItemDto } from "@/api/types/admin-orders";
import { paymentLabel } from "./order-labels";

const up = (v: string | null | undefined) => (v ?? "").toUpperCase();

type Step = { rank: number; label: string; tone: BadgeTone };
/** One seller part's place in the journey (rank orders "least advanced" for a multi-seller order). */
export function sellerStep(s: { status: string; fulfillmentStatus?: string | null }): Step {
  const st = up(s.status);
  const f = up(s.fulfillmentStatus);
  if (st === "REJECTED") return { rank: 99, label: "Rejected", tone: "danger" };
  if (st === "CANCELLED") return { rank: 99, label: "Cancelled", tone: "neutral" };
  if (st === "PENDING_CONFIRMATION") return { rank: 0, label: "Awaiting seller", tone: "warning" };
  if (st === "ACCEPTED" || st === "COMPLETED") return { rank: 6, label: "Accepted", tone: "success" };
  if (st === "DELIVERED" || f === "DELIVERED" || f === "COLLECTED") return { rank: 5, label: "Delivered", tone: "success" };
  if (f === "IN_TRANSIT") return { rank: 4, label: "In transit", tone: "info" };
  if (f === "READY_FOR_PICKUP") return { rank: 3, label: "Ready for pickup", tone: "info" };
  if (f === "PREPARING") return { rank: 2, label: "Preparing", tone: "info" };
  return { rank: 1, label: "Confirmed", tone: "info" };
}

/**
 * Fulfilment column (Shopify-style, separate from payment), worked out from the seller parts because the parent
 * order status never moves past PENDING_CONFIRMATION (OJ-14). Multi-seller: the least advanced live part, plus
 * "x of n delivered".
 */
export function orderFulfilment(sellers: Pick<AdminOrderListItemDto["sellers"][number], "status" | "fulfillmentStatus">[]): { label: string; tone: BadgeTone; detail: string | null } {
  if (!sellers.length) return { label: "—", tone: "neutral", detail: null };
  const steps = sellers.map(sellerStep);
  const live = steps.filter((x) => x.rank !== 99);
  if (!live.length) return steps.every((x) => x.label === "Rejected") ? { label: "Rejected", tone: "danger", detail: null } : { label: "Cancelled", tone: "neutral", detail: null };
  const least = live.reduce((a, b) => (b.rank < a.rank ? b : a));
  const delivered = live.filter((x) => x.rank >= 5).length;
  const detail = live.length > 1 && delivered > 0 && delivered < live.length ? `${delivered} of ${live.length} delivered` : steps.length > live.length ? `${steps.length - live.length} of ${steps.length} sellers out` : null;
  return { label: least.label, tone: least.tone, detail };
}

/** Payment column wording: a hold is never shown as money received. */
export function orderPayment(o: Pick<AdminOrderListItemDto, "paymentStatus" | "isPaymentCaptured" | "capturedAmount" | "requiresPaymentReconciliation">) {
  return paymentLabel(o.requiresPaymentReconciliation ? "RECONCILIATION_REQUIRED" : o.paymentStatus, o.isPaymentCaptured, o.capturedAmount);
}

const pad = (n: number) => String(n).padStart(2, "0");
const parse = (iso: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", " ");
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today at 6:55 am", "Yesterday at 11:55 pm", "20 Nov at 9:10 am", "20 Nov 2025". */
export function friendlyDate(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (days === 0) return `Today at ${time(d)}`;
  if (days === 1) return `Yesterday at ${time(d)}`;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  return d.getFullYear() !== now.getFullYear() ? date : `${date} at ${time(d)}`;
}

const span = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${pad(m % 60)}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};

/** Seller confirmation clock for orders still waiting: "Confirm in 5h 20m" or "Overdue 2h 05m". */
export function confirmBy(o: Pick<AdminOrderListItemDto, "sellers" | "earliestConfirmationDeadlineUtc">, now = new Date()): { text: string; overdue: boolean } | null {
  const pending = o.sellers.filter((s) => up(s.status) === "PENDING_CONFIRMATION");
  if (!pending.length) return null;
  const deadline = o.earliestConfirmationDeadlineUtc ?? pending.map((s) => s.confirmationDeadlineUtc).filter(Boolean).sort()[0] ?? null;
  if (!deadline) return pending.some((s) => s.isOverdue) ? { text: "Overdue", overdue: true } : null;
  const left = parse(deadline).getTime() - now.getTime();
  return left <= 0 || pending.some((s) => s.isOverdue) ? { text: `Overdue ${left < 0 ? span(-left) : ""}`.trim(), overdue: true } : { text: `Confirm in ${span(left)}`, overdue: false };
}

export const RANGES = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
] as const;

/** UTC bounds for the chosen period (local calendar days). Custom uses yyyy-mm-dd from/to, both inclusive. */
export function rangeBounds(range: string, from: string, to: string, now = new Date()): { fromUtc?: string; toUtc?: string } {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (days: number) => ({ fromUtc: new Date(start(now).getTime() - (days - 1) * 86_400_000).toISOString() });
  switch (range) {
    case "today":
      return back(1);
    case "7d":
      return back(7);
    case "30d":
      return back(30);
    case "90d":
      return back(90);
    case "custom": {
      const f = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00`) : null;
      const t = /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000 - 1) : null;
      return { fromUtc: f && !Number.isNaN(f.getTime()) ? f.toISOString() : undefined, toUtc: t && !Number.isNaN(t.getTime()) ? t.toISOString() : undefined };
    }
    default:
      return {};
  }
}

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** CSV of orders (one row per order) as shown in the list. */
export function ordersCsv(rows: AdminOrderListItemDto[]): string {
  const head = ["Order", "Placed (UTC)", "Buyer", "Buyer email", "Account type", "Sellers", "Seller parts", "Total", "Currency", "Fulfilment", "Payment", "Captured", "Payment reference"];
  const lines = rows.map((o) => {
    const f = orderFulfilment(o.sellers);
    return [
      o.orderNumber,
      o.createdAtUtc,
      o.buyerDisplayName ?? "",
      o.buyerEmail ?? "",
      o.buyerAccountType ?? "",
      o.sellers.map((s) => s.sellerTradingName || s.sellerLegalName || s.sellerOrganizationId).join("; "),
      o.sellers.map((s) => `${s.subOrderNumber}: ${sellerStep(s).label}`).join("; "),
      o.totalPayableAmount.toFixed(2),
      o.currency,
      f.detail ? `${f.label} (${f.detail})` : f.label,
      orderPayment(o).label,
      o.capturedAmount.toFixed(2),
      o.paymentReference ?? "",
    ].map(cell).join(",");
  });
  return [head.map(cell).join(","), ...lines].join("\r\n");
}
