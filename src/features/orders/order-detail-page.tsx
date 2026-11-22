import * as React from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ImageIcon } from "@phosphor-icons/react";
import { PageHeader, DetailList } from "@/components/common/page-header";
import { SectionCard, RefreshButton } from "@/components/common/section-card";
import { CopyButton } from "@/components/common/copy-button";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState, PageSkeleton } from "@/components/feedback/states";
import { isApiError } from "@/lib/api/errors";
import { formatMoney, formatNumber, humanize } from "@/lib/utils/format";
import { newId } from "@/lib/utils/id";
import type { AdminOrderDetailDto, AdminSubOrderDto, AdminTimelineEventDto } from "@/api/types/admin-orders";
import { adminOrderKeys, adminOrdersService } from "@/services/admin-orders.service";
import { Notice, PanelTitle, fmtUtc } from "@/features/listings/shared";
import { env } from "@/config/env";
import { DeliveryProof, DeliveryUpdate } from "./delivery-panel";
import { ADMIN_ORDER_MESSAGES, OrderStatusBadge, PaymentBadge, SubStatusBadge, canCancelOrder, effectiveOrderStatus, showFulfilmentBadge } from "./order-labels";

export const adminMessage = (e: unknown) => (isApiError(e) && e.code && ADMIN_ORDER_MESSAGES[e.code]) || (isApiError(e) ? e.message : "Something went wrong.");

function timeLeft(so: AdminSubOrderDto) {
  if (so.status !== "PENDING_CONFIRMATION") return null;
  if (so.isOverdue) return <Badge tone="danger">Confirmation overdue</Badge>;
  if (so.timeRemainingSeconds == null) return null;
  const m = Math.max(0, Math.floor(so.timeRemainingSeconds / 60));
  return <span className="text-xs text-muted-foreground">{m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`} left to confirm</span>;
}

function SellerPart({ so, currency, orderId }: { so: AdminSubOrderDto; currency: string; orderId: string }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-surface-muted px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{so.sellerTradingName || so.sellerLegalName || "Seller"}</p>
          <p className="font-mono text-xs text-muted-foreground">{so.subOrderNumber}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SubStatusBadge value={so.status} />
          {showFulfilmentBadge(so.status, so.fulfillmentStatus) && <SubStatusBadge value={so.fulfillmentStatus!} />}
          {so.isEscalated && <Badge tone="warning">Escalated</Badge>}
        </div>
      </div>
      <ul className="divide-y divide-border">
        {so.items.map((it) => (
          <li key={it.orderLineId} className="flex items-center gap-3 px-4 py-3 text-sm">
            <ItemThumb path={it.thumbnailUrlSnapshot} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{it.titleSnapshot || "Item"}</p>
              <p className="text-xs text-muted-foreground">
                {it.isWholeLot ? "Whole lot" : `Qty ${formatNumber(it.quantity)}`} · {formatMoney(it.unitPrice, it.currency)} each
              </p>
            </div>
            <span className="shrink-0 font-medium">{formatMoney(it.lineTotal, it.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          {so.sellerConfirmedAtUtc ? `Confirmed ${fmtUtc(so.sellerConfirmedAtUtc)}` : so.sellerRejectedAtUtc ? `Rejected ${fmtUtc(so.sellerRejectedAtUtc)}` : so.confirmationDeadlineUtc ? `Confirm by ${fmtUtc(so.confirmationDeadlineUtc)}` : ""}
          {so.fulfillmentMethod ? ` · ${humanize(so.fulfillmentMethod)}` : ""}
        </span>
        {timeLeft(so)}
        <span className="font-medium">Seller total {formatMoney(so.subOrderTotal, currency)}</span>
      </div>
      {so.sellerRejectionReason && <p className="border-t border-border px-4 py-2 text-sm text-danger">Reason: {so.sellerRejectionReason}</p>}
      <DeliveryUpdate orderId={orderId} so={so} />
      <DeliveryProof so={so} />
    </div>
  );
}

const ACTOR: Record<string, string> = { STRIPE_PROVIDER_OR_SYSTEM: "Stripe / system", SYSTEM: "System" };

function Timeline({ events }: { events: AdminTimelineEventDto[] }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No events recorded yet.</p>;
  return (
    <ol className="space-y-3 text-sm" aria-label="Order timeline">
      {events.map((ev) => (
        <li key={ev.eventId} className="border-l-2 border-border pl-3">
          <p className="font-medium text-foreground">
            {humanize(ev.eventType)}
            {ev.subOrderNumber && <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">{ev.subOrderNumber}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {fmtUtc(ev.occurredAtUtc)}
            {ev.actor ? ` · ${ACTOR[ev.actor] ?? ev.actor}` : ""}
            {ev.fromStatus && ev.toStatus ? ` · ${humanize(ev.fromStatus)} → ${humanize(ev.toStatus)}` : ""}
          </p>
          {ev.description && <p className="mt-1 text-body">{ev.description}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Cancel the whole order: reasoned, confirmed, same idempotency key for retries of this attempt, with the order's rowVersion. */
function CancelOrder({ d }: { d: AdminOrderDetailDto }) {
  const qc = useQueryClient();
  const o = d.order;
  const [reason, setReason] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const key = React.useRef(`admin_ord_cancel_${newId()}`);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminOrdersService.cancelOrder(o.orderId, { reason: reason.trim(), idempotencyKey: key.current, expectedRowVersion: o.rowVersion });
      setDone(res.message || "Order cancelled.");
    } catch (err) {
      setError(err);
    } finally {
      setConfirm(false);
      setBusy(false);
      await qc.invalidateQueries({ queryKey: adminOrderKeys.all });
    }
  };

  if (done) return <Notice title="Order cancelled">{done}</Notice>;
  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{adminMessage(error)}</Notice> : null}
      <FormField label="Reason for cancelling" htmlFor="ord-reason" required hint="Recorded in the order history.">
        <Textarea id="ord-reason" rows={3} value={reason} maxLength={1000} onChange={(ev) => setReason(ev.target.value)} />
      </FormField>
      <Button variant="danger" className="w-full" disabled={!reason.trim() || busy} onClick={() => setConfirm(true)}>
        Cancel order
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Cancel order ${o.orderNumber}?`}
        description="Every seller's part is cancelled, the card hold is released without charging the buyer, and the items go back on sale. This can't be undone."
        confirmLabel="Cancel order"
        loading={busy}
        onConfirm={() => void submit()}
      />
    </div>
  );
}

/**
 * Item photo from the order snapshot. The snapshot holds the gateway-relative file route
 * ("/api/v1/files/{id}/download"), so it must be resolved against the API host, not this site; a photo that can't be
 * loaded (e.g. the listing is no longer public) falls back to the placeholder.
 */
export const orderAssetUrl = (path: string | null | undefined) => (!path ? null : /^https?:\/\//.test(path) ? path : `${env.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);

function ItemThumb({ path }: { path: string | null | undefined }) {
  const [failed, setFailed] = React.useState(false);
  const src = orderAssetUrl(path);
  if (!src || failed)
    return (
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-muted text-muted-foreground">
        <ImageIcon className="size-5" aria-hidden />
      </span>
    );
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-11 shrink-0 rounded-md object-cover" />;
}

export default function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const q = useQuery({ queryKey: adminOrderKeys.detail(orderId), queryFn: ({ signal }) => adminOrdersService.detail(orderId, signal) });
  const tl = useQuery({ queryKey: adminOrderKeys.timeline(orderId), queryFn: ({ signal }) => adminOrdersService.timeline(orderId, signal), enabled: !!q.data });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) {
    const notFound = isApiError(q.error) && q.error.status === 404 && q.error.code !== "unmatched_gateway_route";
    return notFound ? (
      <Notice tone="warning" title="Order not found">
        The link may be wrong.{" "}
        <Link to="/orders" className="underline underline-offset-4">
          Back to orders
        </Link>
      </Notice>
    ) : (
      <ErrorState error={q.error} onRetry={() => void q.refetch()} />
    );
  }
  const d = q.data;
  const o = d.order;
  const p = d.payment;
  const cur = o.currency || "AED";
  const captured = p?.isPaymentCaptured ?? false;
  const stage = effectiveOrderStatus(o);
  const cancellable = canCancelOrder(stage, captured);

  return (
    <>
      <Link to="/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Orders
      </Link>
      <PageHeader
        eyebrow="Order"
        title={o.orderNumber}
        description={`Placed ${fmtUtc(o.orderDateUtc)} · ${o.subOrders.length} seller${o.subOrders.length === 1 ? "" : "s"} · ${formatMoney(o.totalPayableAmount, cur)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge value={stage} />
            <PaymentBadge status={p?.requiresReconciliation ? "RECONCILIATION_REQUIRED" : o.paymentStatus} captured={captured} capturedAmount={p?.capturedAmount} />
            <RefreshButton onClick={() => (void q.refetch(), void tl.refetch())} spinning={q.isFetching} />
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4">
          <SectionCard>
            <PanelTitle title="Sellers and items" />
            <div className="mb-4 space-y-3">
              {o.subOrders.map((so) => (
                <SellerPart key={so.subOrderId} so={so} currency={cur} orderId={o.orderId} />
              ))}
            </div>
            <DetailList
              columns={3}
              items={[
                { label: "Materials", value: formatMoney(o.aggregateMaterialAmount, cur) },
                { label: "VAT", value: formatMoney(o.applicableMaterialVat + o.deliveryVatAmount, cur) },
                { label: "Delivery", value: formatMoney(o.deliveryAmount, cur) },
                { label: "Total", value: <span className="font-bold">{formatMoney(o.totalPayableAmount, cur)}</span> },
              ]}
            />
          </SectionCard>
          <SectionCard>
            <PanelTitle title="Timeline" description="Only events the system recorded, oldest first." />
            {tl.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : tl.error ? <ErrorState error={tl.error} onRetry={() => void tl.refetch()} /> : <Timeline events={tl.data?.events ?? []} />}
          </SectionCard>
        </div>
        <div className="space-y-4 lg:sticky lg:top-4">
          <SectionCard>
            <PanelTitle title="Payment" />
            {p ? (
              <>
                {!captured && p.authorizedAmount > 0 && o.paymentStatus === "AUTHORIZED" && (
                  <Notice className="mb-3">The buyer&apos;s card is on hold for {formatMoney(p.authorizedAmount, p.currency)}. Nothing has been charged yet.</Notice>
                )}
                {p.requiresReconciliation && <Notice tone="danger" className="mb-3" title="Needs reconciliation">{p.failureMessage || p.failureCode || "Check this payment in Stripe."}</Notice>}
                <DetailList
                  columns={1}
                  items={[
                    { label: "On hold (authorised)", value: formatMoney(p.authorizedAmount, p.currency) },
                    { label: "Captured", value: formatMoney(p.capturedAmount, p.currency) },
                    ...(p.refundedAmount ? [{ label: "Refunded", value: formatMoney(p.refundedAmount, p.currency) }] : []),
                    { label: "Hold expires", value: fmtUtc(p.authorizationExpiresAtUtc) },
                    { label: "Stripe status", value: p.providerStatus ? humanize(p.providerStatus) : "—" },
                    { label: "Items reserved", value: p.reservationStatus ? humanize(p.reservationStatus) : "—" },
                    {
                      label: "Stripe payment",
                      value: p.paymentIntentId ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs">
                          {p.paymentIntentId} <CopyButton value={p.paymentIntentId} label="Copy payment ID" />
                        </span>
                      ) : (
                        "—"
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No payment record.</p>
            )}
          </SectionCard>
          <SectionCard>
            <PanelTitle title="Buyer" />
            <DetailList
              columns={1}
              items={[
                { label: "Name", value: d.buyer?.displayName || "—" },
                { label: "Email", value: d.buyer?.email || "—" },
                { label: "Account", value: d.buyer?.buyerAccountType ? humanize(d.buyer.buyerAccountType) : "—" },
                { label: "User ID", value: <span className="font-mono text-xs">{o.buyerUserId}</span> },
              ]}
            />
          </SectionCard>
          <SectionCard>
            <PanelTitle title="Cancel order" description={cancellable ? "Only before any seller starts fulfilment and before the payment is captured." : undefined} />
            {cancellable ? (
              <CancelOrder key={o.rowVersion} d={d} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {stage === "CANCELLED" ? "This order is cancelled." : captured ? "The payment is captured, so this order can't be cancelled here." : "Fulfilment has started, so this order can't be cancelled here."}
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
