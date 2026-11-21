import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { XIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { NativeSelect } from "@/components/ui/input";
import { useUrlState } from "@/hooks/use-url-state";
import { formatNumber } from "@/lib/utils/format";
import type { SellerSubOrderEscalationDto } from "@/api/types/order-escalations";
import { escalationKeys, orderEscalationsService } from "@/services/order-escalations.service";
import { GuidFilterInput, fmtUtc } from "@/features/listings/shared";
import { OrdersNav } from "./orders-page";

export const RESOLUTION_LABEL: Record<string, string> = {
  PENDING: "Awaiting admin",
  RESOLVED_SELLER_CONFIRMED: "Seller confirmed",
  RESOLVED_SELLER_REJECTED: "Seller rejected",
  RESOLVED_ADMIN_CANCELLED: "Cancelled by admin",
  RESOLVED_ADMIN_OVERRIDE: "Admin override",
};
export const resolutionLabel = (s: string) => RESOLUTION_LABEL[s] ?? s.replace(/_/g, " ").toLowerCase();
const statusTone = (s: string) => (s === "PENDING" ? "PENDING" : s === "RESOLVED_ADMIN_CANCELLED" || s === "RESOLVED_SELLER_REJECTED" ? "REJECTED" : "APPROVED");

/** "2 h 15 min left" / "overdue". */
export function remaining(e: Pick<SellerSubOrderEscalationDto, "isOverdue" | "adminReviewTimeRemainingSeconds" | "resolutionStatus">) {
  if (e.resolutionStatus !== "PENDING") return "—";
  if (e.isOverdue || e.adminReviewTimeRemainingSeconds <= 0) return "Overdue";
  const m = Math.floor(e.adminReviewTimeRemainingSeconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
}

const DEFAULTS = { page: 1, pageSize: 20, status: "PENDING", overdue: "", seller: "" };

/** /orders/escalations: seller sub-orders not confirmed within the SLA, waiting for a Platform Admin decision (BE-09). */
export default function EscalationsPage() {
  const navigate = useNavigate();
  const [s, set] = useUrlState(DEFAULTS);
  const query = { page: s.page, pageSize: s.pageSize, status: s.status, isOverdue: s.overdue === "true" ? true : undefined, sellerId: s.seller || undefined };
  const q = useQuery({ queryKey: escalationKeys.queue(query), queryFn: ({ signal }) => orderEscalationsService.queue(query, signal), placeholderData: (p) => p });
  const items = q.data ?? [];
  const columns = React.useMemo<ColumnDef<SellerSubOrderEscalationDto, unknown>[]>(
    () => [
      {
        header: "Sub-order",
        accessorKey: "subOrderNumber",
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs text-foreground">{row.original.subOrderNumber}</p>
            <p className="font-mono text-[11px] text-muted-foreground">Order {row.original.orderNumber}</p>
          </div>
        ),
      },
      { header: "Seller", accessorKey: "sellerName", cell: ({ row }) => row.original.sellerName ?? row.original.sellerOrganizationId.slice(0, 8).toUpperCase() },
      { header: "Total", accessorKey: "subOrderTotal", cell: ({ row }) => formatNumber(row.original.subOrderTotal) },
      { header: "Escalated", accessorKey: "escalatedAtUtc", cell: ({ row }) => fmtUtc(row.original.escalatedAtUtc) },
      {
        header: "Admin deadline",
        accessorKey: "adminReviewDeadlineUtc",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span>{fmtUtc(row.original.adminReviewDeadlineUtc)}</span>
            {row.original.resolutionStatus === "PENDING" &&
              (row.original.isOverdue ? (
                <Badge tone="danger" className="w-fit">
                  Overdue
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">{remaining(row.original)}</span>
              ))}
          </div>
        ),
      },
      { header: "Status", accessorKey: "resolutionStatus", cell: ({ row }) => <StatusBadge value={statusTone(row.original.resolutionStatus)} label={resolutionLabel(row.original.resolutionStatus)} /> },
    ],
    [],
  );
  const filtered = s.status !== "PENDING" || !!s.overdue || !!s.seller;
  const hasNext = items.length === s.pageSize;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Order escalations"
        description="Seller orders not confirmed in time. Review each case; cancelling a seller's part of an order is the only approved action and needs a documented reason."
      />
      <OrdersNav />
      <SectionCard>
        <Toolbar
          left={
            <>
              <NativeSelect className="h-[38px] w-full sm:w-52" value={s.status} onChange={(e) => set({ status: e.target.value }, { resetPage: true })} aria-label="Status">
                <option value="PENDING">Awaiting admin</option>
                <option value="ALL">All cases</option>
                {Object.keys(RESOLUTION_LABEL)
                  .filter((k) => k !== "PENDING")
                  .map((k) => (
                    <option key={k} value={k}>
                      {RESOLUTION_LABEL[k]}
                    </option>
                  ))}
              </NativeSelect>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={s.overdue === "true"} onChange={(e) => set({ overdue: e.target.checked ? "true" : "" }, { resetPage: true })} />
                Overdue only
              </label>
            </>
          }
          right={
            <>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={() => set({ status: "PENDING", overdue: "", seller: "" }, { resetPage: true })}>
                  <XIcon /> Reset
                </Button>
              )}
              <RefreshButton onClick={() => q.refetch()} spinning={q.isFetching} />
            </>
          }
        />
        <div className="-mt-1 mb-4 grid gap-2 sm:grid-cols-2">
          <GuidFilterInput value={s.seller} onChange={(seller) => set({ seller }, { resetPage: true })} label="Seller ID" placeholder="Filter by seller ID" />
        </div>
        <DataTable
          caption="Order escalations"
          columns={columns}
          data={items}
          getRowId={(e) => e.escalationId}
          isLoading={q.isLoading}
          isFetching={q.isFetching && !q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          onRowClick={(e) => navigate(`/orders/escalations/${e.escalationId}`)}
          emptyTitle={s.status === "PENDING" && !filtered ? "No escalations waiting for an admin" : "No escalations match these filters"}
          emptyDescription="Cases appear here when a seller doesn't confirm an order within the confirmation time."
        />
        {(s.page > 1 || hasNext) && (
          <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Escalation pages">
            <Button variant="secondary" size="sm" disabled={s.page <= 1 || q.isFetching} onClick={() => set({ page: s.page - 1 })}>
              Previous
            </Button>
            <span className="text-muted-foreground">Page {s.page}</span>
            <Button variant="secondary" size="sm" disabled={!hasNext || q.isFetching} onClick={() => set({ page: s.page + 1 })}>
              Next
            </Button>
          </nav>
        )}
      </SectionCard>
    </>
  );
}
