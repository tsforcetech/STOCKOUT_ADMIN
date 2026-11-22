import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { NavLink } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircleIcon, ClockIcon, DownloadSimpleIcon, PackageIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { StatCards } from "@/components/common/stat-cards";
import { FilterPills } from "@/components/common/filter-pills";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Input, NativeSelect } from "@/components/ui/input";
import { useUrlState } from "@/hooks/use-url-state";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { AdminOrderListItemDto } from "@/api/types/admin-orders";
import { adminOrderKeys, adminOrdersService } from "@/services/admin-orders.service";
import { sellersService } from "@/services/sellers.service";
import { fmtUtc } from "@/features/listings/shared";
import { OrdersAccessNotice, PAYMENT_STATUS_FILTER, paymentLabel } from "./order-labels";
import { RANGES, confirmBy, friendlyDate, orderFulfilment, orderPayment, ordersCsv, rangeBounds } from "./order-list-helpers";
import { OrderQuickView } from "./order-quick-view";

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
      <NavLink to="/orders/claims" className={tab}>
        Claims
      </NavLink>
    </nav>
  );
}

const sellerName = (s: AdminOrderListItemDto["sellers"][number]) => s.sellerTradingName || s.sellerLegalName || s.sellerOrganizationId.slice(0, 8).toUpperCase();

const DEFAULTS = { page: 1, pageSize: 20, status: "", payment: "", q: "", range: "30d", from: "", to: "", seller: "" };
const EXPORT_PAGE = 100;
const EXPORT_MAX_PAGES = 20;

/** /orders: every marketplace order, the day's numbers and the ones that need an admin (BE-25). */
export default function OrdersPage() {
  const [s, set] = useUrlState(DEFAULTS);
  const [preview, setPreview] = React.useState<AdminOrderListItemDto | null>(null);
  const [exporting, setExporting] = React.useState<string | null>(null);
  const bounds = React.useMemo(() => rangeBounds(s.range, s.from, s.to), [s.range, s.from, s.to]);
  const summary = useQuery({ queryKey: adminOrderKeys.summary(bounds), queryFn: ({ signal }) => adminOrdersService.summary(bounds, signal) });
  const filters = { status: s.status || undefined, paymentStatus: s.payment || undefined, q: s.q.trim() || undefined, sellerOrganizationId: s.seller || undefined, ...bounds };
  const query = { page: s.page, pageSize: s.pageSize, ...filters };
  const list = useQuery({ queryKey: adminOrderKeys.list(query), queryFn: ({ signal }) => adminOrdersService.list(query, signal), placeholderData: (p) => p });
  const sellers = useQuery({ queryKey: ["admin", "marketplace-sellers"], queryFn: ({ signal }) => sellersService.list(signal), staleTime: 5 * 60_000, retry: false });
  const sm = summary.data;
  const periodLabel = s.range === "custom" ? "in this period" : (RANGES.find((r) => r.value === s.range)?.label ?? "All time").toLowerCase();

  // Every order matching the current filters (not just this page), as CSV.
  const exportCsv = async () => {
    setExporting("Preparing…");
    try {
      const rows: AdminOrderListItemDto[] = [];
      for (let page = 1; page <= EXPORT_MAX_PAGES; page++) {
        const res = await adminOrdersService.list({ ...filters, page, pageSize: EXPORT_PAGE });
        rows.push(...res.items);
        if (rows.length >= res.totalCount || res.items.length < EXPORT_PAGE) break;
      }
      const blob = new Blob(["\uFEFF" + ordersCsv(rows)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `stockout-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExporting(null);
    } catch {
      setExporting("Export failed. Try again.");
    }
  };

  const columns = React.useMemo<ColumnDef<AdminOrderListItemDto, unknown>[]>(
    () => [
      {
        header: "Order",
        accessorKey: "orderNumber",
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs font-medium text-foreground">{row.original.orderNumber}</p>
            <p className="text-[11px] text-muted-foreground" title={fmtUtc(row.original.createdAtUtc)}>
              {friendlyDate(row.original.createdAtUtc)}
            </p>
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
      {
        header: "Fulfilment",
        id: "fulfilment",
        cell: ({ row }) => {
          const f = orderFulfilment(row.original.sellers);
          const clock = confirmBy(row.original);
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge tone={f.tone} dot>
                {f.label}
              </Badge>
              {f.detail && <span className="text-[11px] text-muted-foreground">{f.detail}</span>}
              {clock && <span className={cn("text-[11px] font-medium", clock.overdue ? "text-danger" : "text-warning-soft-foreground")}>{clock.text}</span>}
            </div>
          );
        },
      },
      {
        header: "Payment",
        accessorKey: "paymentStatus",
        cell: ({ row }) => {
          const p = orderPayment(row.original);
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge tone={p.tone} dot>
                {p.label}
              </Badge>
              {row.original.isPaymentCaptured && <span className="text-[11px] text-muted-foreground">{formatMoney(row.original.capturedAmount, row.original.currency)} captured</span>}
            </div>
          );
        },
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
  const filtered = !!s.status || !!s.payment || !!s.q || !!s.seller;
  const loading = summary.isLoading;
  const unavailable = summary.error ? "Couldn't load" : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Every marketplace order: who bought, which sellers, where it stands and what happened to the payment. A card hold is not money received until it is captured."
        actions={
          <div className="flex flex-col items-end gap-1">
            <Button variant="secondary" onClick={() => void exportCsv()} loading={exporting === "Preparing…"} disabled={!list.data?.totalCount}>
              <DownloadSimpleIcon /> Export
            </Button>
            {exporting && exporting !== "Preparing…" && (
              <span role="alert" className="text-xs text-danger">
                {exporting}
              </span>
            )}
          </div>
        }
      />
      <OrdersNav />
      <OrdersAccessNotice error={list.error} />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Period">
        <NativeSelect className="h-[38px] w-44" value={s.range} onChange={(e) => set({ range: e.target.value }, { resetPage: true })} aria-label="Period">
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
        {s.range === "custom" && (
          <>
            <Input type="date" className="h-[38px] w-40" aria-label="From date" value={s.from} max={s.to || undefined} onChange={(e) => set({ from: e.target.value }, { resetPage: true })} />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" className="h-[38px] w-40" aria-label="To date" value={s.to} min={s.from || undefined} onChange={(e) => set({ to: e.target.value }, { resetPage: true })} />
          </>
        )}
      </div>
      <StatCards
        className="mb-4"
        items={[
          { label: "Placed today", value: formatNumber(sm?.ordersPlacedToday), icon: <PackageIcon />, loading, unavailable, hint: `${formatNumber(sm?.totalOrdersInPeriod)} ${periodLabel}` },
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
              <NativeSelect className="h-[38px] w-full sm:w-56" value={s.seller} onChange={(e) => set({ seller: e.target.value }, { resetPage: true })} aria-label="Seller" disabled={!sellers.data}>
                <option value="">{sellers.error ? "Sellers unavailable" : "All sellers"}</option>
                {[...(sellers.data ?? [])]
                  .sort((a, b) => (a.displayName || a.legalName || "").localeCompare(b.displayName || b.legalName || ""))
                  .map((x) => (
                    <option key={x.sellerId} value={x.sellerId}>
                      {x.displayName || x.legalName || x.email}
                    </option>
                  ))}
              </NativeSelect>
            </>
          }
          right={
            <>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={() => set({ status: "", payment: "", q: "", seller: "" }, { resetPage: true })}>
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
          onRowClick={(o) => setPreview(o)}
          pagination={{ page: s.page, pageSize: s.pageSize, totalCount: list.data?.totalCount ?? 0, onPageChange: (page) => set({ page }), onPageSizeChange: (pageSize) => set({ pageSize }, { resetPage: true }) }}
          emptyTitle={filtered ? "No orders match these filters" : "No orders yet"}
          emptyDescription="Orders appear here as soon as a buyer places one."
        />
      </SectionCard>
      <OrderQuickView order={preview} onClose={() => setPreview(null)} />
    </>
  );
}
