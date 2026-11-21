import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { FilterPills } from "@/components/common/filter-pills";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useUrlState } from "@/hooks/use-url-state";
import { formatMoney, humanize } from "@/lib/utils/format";
import { newId } from "@/lib/utils/id";
import { toast } from "sonner";
import type { AdminPaymentAuthorizationDto } from "@/api/types/admin-orders";
import { adminOrderKeys, adminOrdersService } from "@/services/admin-orders.service";
import { Notice, fmtUtc } from "@/features/listings/shared";
import { OrdersNav } from "./orders-page";
import { PaymentBadge } from "./order-labels";
import { adminMessage } from "./order-detail-page";

const VIEWS = [
  { value: "RECONCILIATION_REQUIRED", label: "Needs reconciliation" },
  { value: "AUTHORIZED", label: "Authorised" },
  { value: "REQUIRES_ACTION", label: "Waiting for 3-D Secure" },
  { value: "PROCESSING", label: "Processing" },
  { value: "AUTHORIZATION_FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
];

/** A hold that isn't attached to an order and still holds the buyer's card or stock can be voided here. */
const canVoid = (a: AdminPaymentAuthorizationDto) => !a.orderId && !["CANCELLED", "AUTHORIZATION_EXPIRED", "CANCELLATION_PENDING"].includes(a.internalStatus) && a.providerStatus !== "succeeded";

function VoidPayment({ a, onClose }: { a: AdminPaymentAuthorizationDto; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [missing, setMissing] = React.useState(false);
  const key = React.useRef(`admin_pay_cancel_${newId()}`);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminOrdersService.cancelPayment(a.attemptId, { reason: reason.trim(), idempotencyKey: key.current });
      toast.success(res.isIdempotentReplay ? "Already cancelled" : "Payment hold cancelled", { description: res.message });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: adminOrderKeys.all });
    }
  };
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cancel this payment hold?"
      description={`Releases ${formatMoney(a.authorizedAmount, a.currency)} on the buyer's card without charging it and puts any reserved items back on sale.`}
      confirmLabel="Cancel payment hold"
      loading={busy}
      onConfirm={() => (reason.trim() ? void submit() : setMissing(true))}
    >
      <div className="space-y-3">
        {error ? <Notice tone="danger">{adminMessage(error)}</Notice> : null}
        <FormField label="Reason" htmlFor="pay-reason" required hint="Recorded in the audit log." error={missing && !reason.trim() ? "Write the reason for cancelling." : undefined}>
          <Textarea id="pay-reason" rows={3} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>
    </ConfirmDialog>
  );
}

const DEFAULTS = { page: 1, pageSize: 20, status: "RECONCILIATION_REQUIRED", q: "" };

/** /orders/payments: checkout card holds, to find and release the ones stuck without an order (BE-25 §4.5–4.6). */
export default function PaymentAuthorizationsPage() {
  const [s, set] = useUrlState(DEFAULTS);
  const [voiding, setVoiding] = React.useState<AdminPaymentAuthorizationDto | null>(null);
  const query = { page: s.page, pageSize: s.pageSize, status: s.status || undefined, q: s.q.trim() || undefined };
  const list = useQuery({ queryKey: adminOrderKeys.payments(query), queryFn: ({ signal }) => adminOrdersService.payments(query, signal), placeholderData: (p) => p });

  const columns = React.useMemo<ColumnDef<AdminPaymentAuthorizationDto, unknown>[]>(
    () => [
      {
        header: "Checkout",
        accessorKey: "createdAtUtc",
        cell: ({ row }) => (
          <div>
            <p className="text-sm">{fmtUtc(row.original.createdAtUtc)}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{row.original.paymentIntentId ?? row.original.attemptId.slice(0, 8).toUpperCase()}</p>
          </div>
        ),
      },
      { header: "Amount", accessorKey: "authorizedAmount", cell: ({ row }) => <span className="font-medium">{formatMoney(row.original.authorizedAmount, row.original.currency)}</span> },
      {
        header: "Payment",
        accessorKey: "internalStatus",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <PaymentBadge status={row.original.internalStatus} captured={row.original.providerStatus === "succeeded"} capturedAmount={row.original.providerStatus === "succeeded" ? row.original.authorizedAmount : 0} />
            {row.original.recoveryStatus && row.original.recoveryStatus !== "NONE" && (
              <Badge tone="warning" className="w-fit">
                {humanize(row.original.recoveryStatus)}
              </Badge>
            )}
          </div>
        ),
      },
      { header: "Items", accessorKey: "reservationStatus", cell: ({ row }) => (row.original.reservationStatus ? humanize(row.original.reservationStatus) : "—") },
      {
        header: "Problem",
        accessorKey: "failureCode",
        cell: ({ row }) => (row.original.failureCode ? <span className="text-xs text-danger">{humanize(row.original.failureCode)}</span> : <span className="text-muted-foreground">—</span>),
      },
      {
        header: "Order",
        accessorKey: "orderNumber",
        cell: ({ row }) =>
          row.original.orderId ? (
            <Link to={`/orders/${row.original.orderId}`} className="font-mono text-xs underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
              {row.original.orderNumber ?? "Open order"}
            </Link>
          ) : canVoid(row.original) ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                setVoiding(row.original);
              }}
            >
              Cancel hold
            </Button>
          ) : (
            <span className="text-muted-foreground">No order</span>
          ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader eyebrow="Operations" title="Stuck payments" description="Card holds from checkout. A hold with no order still blocks the buyer's money and may reserve stock: cancel it with a reason. Holds that belong to an order are cancelled from the order." />
      <OrdersNav />
      <SectionCard>
        <FilterPills className="mb-3" label="Payment state" items={VIEWS} value={s.status} onChange={(status) => set({ status }, { resetPage: true })} />
        <Toolbar
          left={<SearchInput value={s.q} onChange={(q) => set({ q }, { resetPage: true })} placeholder="Order number, Stripe payment ID or any ID" label="Search payments" />}
          right={
            <>
              {(s.q || s.status !== DEFAULTS.status) && (
                <Button variant="ghost" size="sm" onClick={() => set({ status: DEFAULTS.status, q: "" }, { resetPage: true })}>
                  <XIcon /> Reset
                </Button>
              )}
              <RefreshButton onClick={() => list.refetch()} spinning={list.isFetching} />
            </>
          }
        />
        <DataTable
          caption="Payment holds"
          columns={columns}
          data={list.data?.items}
          getRowId={(a) => a.attemptId}
          isLoading={list.isLoading}
          isFetching={list.isFetching && !list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          pagination={{ page: s.page, pageSize: s.pageSize, totalCount: list.data?.totalCount ?? 0, onPageChange: (page) => set({ page }), onPageSizeChange: (pageSize) => set({ pageSize }, { resetPage: true }) }}
          emptyTitle={s.status === "RECONCILIATION_REQUIRED" && !s.q ? "No payments need reconciliation" : "No payments match"}
          emptyDescription="Every checkout card hold appears here, with or without an order."
        />
      </SectionCard>
      {voiding && <VoidPayment key={voiding.attemptId} a={voiding} onClose={() => setVoiding(null)} />}
    </>
  );
}
