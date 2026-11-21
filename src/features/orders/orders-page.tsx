import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { NavLink, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircleIcon, ClockIcon, PackageIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { StatCards } from "@/components/common/stat-cards";
import { FilterPills } from "@/components/common/filter-pills";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { NativeSelect } from "@/components/ui/input";
import { useUrlState } from "@/hooks/use-url-state";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { AdminOrderListItemDto } from "@/api/types/admin-orders";
import { adminOrderKeys, adminOrdersService } from "@/services/admin-orders.service";
import { fmtUtc } from "@/features/listings/shared";
import { OrderStatusBadge, PAYMENT_STATUS_FILTER, PaymentBadge, paymentLabel } from "./order-labels";

/** Orders · Stuck payments · Escalations, shown on each order-monitoring page. */
export function OrdersNav() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn("-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors", isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground");
  return (
    <nav aria-label="Order monitoring" className="mb-4 flex gap-5 border-b border-border">
      <NavLink to="/orders" end className={tab}>
        Orders
      </NavLink>
      <NavLink to="/orders/payments" className={tab}>
        Stuck payments
      </NavLink>
      <NavLink to="/orders/escalations" className={tab}>
        Escalations
      </NavLink>
    </nav>
  );
}

const sellerName = (s: AdminOrderListItemDto["sellers"][number]) => s.sellerTradingName || s.sellerLegalName || s.sellerOrganizationId.slice(0, 8).toUpperCase();

const DEFAULTS = { page: 1, pageSize: 20, status: "", payment: "", q: "" };

/** /orders: every marketplace order, the day's numbers and the ones that need an admin (BE-25). */
export default function OrdersPage() {
  const navigate = useNavigate();
  const [s, set] = useUrlState(DEFAULTS);
  const summary = useQuery({ queryKey: adminOrderKeys.summary, queryFn: ({ signal }) => adminOrdersService.summary(signal) });
  const query = { page: s.page, pageSize: s.pageSize, status: s.status || undefined, paymentStatus: s.payment || undefined, q: s.q.trim() || undefined };
  const list = useQuery({ queryKey: adminOrderKeys.list(query), queryFn: ({ signal }) => adminOrdersService.list(query, signal), placeholderData: (p) => p });
  const sm = summary.data;

  const columns = React.useMemo<ColumnDef<AdminOrderListItemDto, unknown>[]>(
    () => [
      {
        header: "Order",
        accessorKey: "orderNumber",
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs font-medium text-foreground">{row.original.orderNumber}</p>
            <p className="text-[11px] text-muted-foreground">{fmtUtc(row.original.createdAtUtc)}</p>
          </div>
        ),
      },
      {
        header: "Buyer",
        accessorKey: "buyerDisplayName",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate">{row.original.buyerDisplayName || row.original.buyerEmail || <span className="font-mono text-xs">{row.original.buyerUserId.slice(0, 8).toUpperCase()}</span>}</p>
            {row.original.buyerAccountType && <p className="text-[11px] text-muted-foreground">{row.original.buyerAccountType === "BUSINESS" ? "Business" : "Individual"}</p>}
          </div>
        ),
      },
      {
        header: "Sellers",
        id: "sellers",
        cell: ({ row }) => {
          const sellers = row.original.sellers;
          if (!sellers.length) return "—";
          return (
            <div className="space-y-0.5">
              <p className="truncate">{sellerName(sellers[0])}</p>
              {sellers.length > 1 && <p className="text-[11px] text-muted-foreground">+{sellers.length - 1} more</p>}
              {sellers.some((x) => x.isOverdue) && (
                <Badge tone="danger" className="w-fit">
                  Confirmation overdue
                </Badge>
              )}
              {sellers.some((x) => x.isEscalated) && !sellers.some((x) => x.isOverdue) && (
                <Badge tone="warning" className="w-fit">
                  Escalated
                </Badge>
              )}
            </div>
          );
        },
      },
      { header: "Total", accessorKey: "totalPayableAmount", cell: ({ row }) => <span className="font-medium">{formatMoney(row.original.totalPayableAmount, row.original.currency)}</span> },
      { header: "Order status", accessorKey: "orderStatus", cell: ({ row }) => <OrderStatusBadge value={row.original.orderStatus} /> },
      {
        header: "Payment",
        accessorKey: "paymentStatus",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <PaymentBadge status={row.original.requiresPaymentReconciliation ? "RECONCILIATION_REQUIRED" : row.original.paymentStatus} captured={row.original.isPaymentCaptured} capturedAmount={row.original.capturedAmount} />
            {row.original.isPaymentCaptured && <span className="text-[11px] text-muted-foreground">{formatMoney(row.original.capturedAmount, row.original.currency)} captured</span>}
          </div>
        ),
      },
    ],
    [],
  );

  const views = [
    { value: "", label: "All", count: sm?.totalOrdersInPeriod },
    { value: "PENDING_CONFIRMATION", label: "Awaiting seller", count: sm?.awaitingSellerConfirmation, highlight: (sm?.awaitingSellerConfirmation ?? 0) > 0 },
    { value: "CONFIRMED", label: "Confirmed" },
    { value: "IN_FULFILLMENT", label: "In fulfilment", count: sm?.inFulfillment },
    { value: "COMPLETED", label: "Completed", count: sm?.completedOrders },
    { value: "CANCELLED", label: "Cancelled", count: sm?.cancelledOrders },
  ];
  const filtered = !!s.status || !!s.payment || !!s.q;
  const loading = summary.isLoading;
  const unavailable = summary.error ? "Couldn't load" : undefined;

  return (
    <>
      <PageHeader eyebrow="Operations" title="Orders" description="Every marketplace order: who bought, which sellers, where it stands and what happened to the payment. A card hold is not money received until it is captured." />
      <OrdersNav />
      <StatCards
        className="mb-4"
        items={[
          { label: "Placed today", value: formatNumber(sm?.ordersPlacedToday), icon: <PackageIcon />, loading, unavailable, hint: `${formatNumber(sm?.totalOrdersInPeriod)} in total` },
          {
            label: "Awaiting seller confirmation",
            value: formatNumber(sm?.awaitingSellerConfirmation),
            icon: <ClockIcon />,
            loading,
            unavailable,
            hint: sm?.sellerConfirmationOverdue ? `${formatNumber(sm.sellerConfirmationOverdue)} overdue` : "None overdue",
            hintTone: sm?.sellerConfirmationOverdue ? "danger" : "muted",
          },
          { label: "In fulfilment", value: formatNumber(sm?.inFulfillment), icon: <CheckCircleIcon />, loading, unavailable, hint: `${formatNumber(sm?.completedOrders)} completed · ${formatNumber(sm?.cancelledOrders)} cancelled` },
          {
            label: "Payments needing review",
            value: formatNumber(sm?.paymentReconciliationRequired),
            icon: <WarningIcon />,
            loading,
            unavailable,
            hint: sm?.paymentReconciliationRequired ? "Reconciliation required" : "Nothing to reconcile",
            hintTone: sm?.paymentReconciliationRequired ? "danger" : "muted",
          },
        ]}
      />
      <SectionCard>
        <FilterPills className="mb-3" label="Order status" items={views} value={s.status} onChange={(status) => set({ status }, { resetPage: true })} />
        <Toolbar
          left={
            <>
              <SearchInput value={s.q} onChange={(q) => set({ q }, { resetPage: true })} placeholder="Order number, e.g. SO-10000001" label="Search orders" />
              <NativeSelect className="h-[38px] w-full sm:w-60" value={s.payment} onChange={(e) => set({ payment: e.target.value }, { resetPage: true })} aria-label="Payment">
                <option value="">Any payment state</option>
                {PAYMENT_STATUS_FILTER.map((p) => (
                  <option key={p} value={p}>
                    {paymentLabel(p, p === "CAPTURED", 1).label}
                  </option>
                ))}
              </NativeSelect>
            </>
          }
          right={
            <>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={() => set({ status: "", payment: "", q: "" }, { resetPage: true })}>
                  <XIcon /> Reset
                </Button>
              )}
              <RefreshButton onClick={() => (void list.refetch(), void summary.refetch())} spinning={list.isFetching} />
            </>
          }
        />
        <DataTable
          caption="Orders"
          columns={columns}
          data={list.data?.items}
          getRowId={(o) => o.orderId}
          isLoading={list.isLoading}
          isFetching={list.isFetching && !list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          onRowClick={(o) => navigate(`/orders/${o.orderId}`)}
          pagination={{ page: s.page, pageSize: s.pageSize, totalCount: list.data?.totalCount ?? 0, onPageChange: (page) => set({ page }), onPageSizeChange: (pageSize) => set({ pageSize }, { resetPage: true }) }}
          emptyTitle={filtered ? "No orders match these filters" : "No orders yet"}
          emptyDescription="Orders appear here as soon as a buyer places one."
        />
      </SectionCard>
    </>
  );
}
