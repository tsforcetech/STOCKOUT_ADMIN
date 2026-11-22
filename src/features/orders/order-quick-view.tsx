import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowSquareOutIcon, XIcon } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/format";
import type { AdminOrderListItemDto } from "@/api/types/admin-orders";
import { adminOrderKeys, adminOrdersService } from "@/services/admin-orders.service";
import { ItemThumb, adminMessage } from "./order-detail-page";
import { confirmBy, friendlyDate, orderFulfilment, orderPayment, sellerStep } from "./order-list-helpers";

/**
 * Side panel opened from an order row: buyer, each seller's part with items and step, totals and payment, without
 * leaving the list. "Open order" goes to the full page for actions (delivery steps, proof, cancel).
 */
export function OrderQuickView({ order, onClose }: { order: AdminOrderListItemDto | null; onClose: () => void }) {
  const open = !!order;
  const q = useQuery({
    queryKey: adminOrderKeys.detail(order?.orderId ?? ""),
    queryFn: ({ signal }) => adminOrdersService.detail(order!.orderId, signal),
    enabled: open,
  });
  const d = q.data;
  const o = d?.order;
  const f = order ? orderFulfilment(order.sellers) : null;
  const pay = order ? orderPayment(order) : null;
  const clock = order ? confirmBy(order) : null;
  const cur = order?.currency ?? "AED";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-surface shadow-raised focus:outline-none" aria-describedby={undefined}>
          {order && (
            <>
              <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                <div className="min-w-0">
                  <DialogPrimitive.Title className="font-heading text-2xl font-bold text-foreground">{order.orderNumber}</DialogPrimitive.Title>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {friendlyDate(order.createdAtUtc)} · {formatMoney(order.totalPayableAmount, cur)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {f && (
                      <Badge tone={f.tone} dot>
                        {f.label}
                        {f.detail ? ` · ${f.detail}` : ""}
                      </Badge>
                    )}
                    {pay && (
                      <Badge tone={pay.tone} dot>
                        {pay.label}
                      </Badge>
                    )}
                    {clock && <Badge tone={clock.overdue ? "danger" : "warning"}>{clock.text}</Badge>}
                  </div>
                </div>
                <DialogPrimitive.Close className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "-mr-2")} aria-label="Close">
                  <XIcon />
                </DialogPrimitive.Close>
              </header>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
                <section aria-label="Buyer">
                  <p className="text-xs font-medium text-muted-foreground">Buyer</p>
                  <p className="mt-1 font-medium text-foreground">{order.buyerDisplayName || order.buyerEmail || order.buyerUserId.slice(0, 8).toUpperCase()}</p>
                  <p className="text-muted-foreground">
                    {[order.buyerEmail, order.buyerAccountType === "BUSINESS" ? "Business" : order.buyerAccountType ? "Individual" : null].filter(Boolean).join(" · ")}
                  </p>
                </section>

                {q.isLoading ? (
                  <div className="space-y-3" aria-busy="true">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : q.error ? (
                  <p role="alert" className="rounded-lg bg-danger-soft p-3 text-danger-soft-foreground">
                    {adminMessage(q.error)}
                  </p>
                ) : (
                  o && (
                    <section aria-label="Sellers and items" className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Sellers and items</p>
                      {o.subOrders.map((so) => {
                        const step = sellerStep(so);
                        return (
                          <div key={so.subOrderId} className="rounded-xl border border-border">
                            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{so.sellerTradingName || so.sellerLegalName || so.sellerOrganizationId.slice(0, 8).toUpperCase()}</p>
                                <p className="font-mono text-xs text-muted-foreground">{so.subOrderNumber}</p>
                              </div>
                              <Badge tone={step.tone} dot>
                                {step.label}
                              </Badge>
                            </div>
                            <ul className="divide-y divide-border">
                              {so.items.map((it) => (
                                <li key={it.orderLineId} className="flex items-center gap-3 px-4 py-2.5">
                                  <ItemThumb path={it.thumbnailUrlSnapshot} />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-foreground">{it.titleSnapshot || "Item"}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Qty {it.quantity} · {formatMoney(it.unitPrice, cur)} each
                                    </p>
                                  </div>
                                  <span className="font-medium">{formatMoney(it.lineTotal, cur)}</span>
                                </li>
                              ))}
                            </ul>
                            {so.sellerRejectionReason && <p className="border-t border-border px-4 py-2 text-xs text-danger">Rejected: {so.sellerRejectionReason}</p>}
                          </div>
                        );
                      })}
                    </section>
                  )
                )}

                {o && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-surface-muted p-4">
                    <dt className="text-muted-foreground">Materials</dt>
                    <dd className="text-right">{formatMoney(o.aggregateMaterialAmount, cur)}</dd>
                    <dt className="text-muted-foreground">VAT</dt>
                    <dd className="text-right">{formatMoney(o.applicableMaterialVat, cur)}</dd>
                    <dt className="text-muted-foreground">Delivery</dt>
                    <dd className="text-right">{formatMoney(o.deliveryAmount + o.deliveryVatAmount, cur)}</dd>
                    <dt className="font-medium text-foreground">Total</dt>
                    <dd className="text-right font-bold">{formatMoney(o.totalPayableAmount, cur)}</dd>
                    <dt className="text-muted-foreground">Captured</dt>
                    <dd className="text-right">{formatMoney(order.capturedAmount, cur)}</dd>
                  </dl>
                )}
              </div>

              <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button asChild>
                  <Link to={`/orders/${order.orderId}`}>
                    Open order <ArrowSquareOutIcon />
                  </Link>
                </Button>
              </footer>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
