import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { useUrlState } from "@/hooks/use-url-state";
import { formatNumber } from "@/lib/utils/format";
import type { BuyerOrderClaimDto } from "@/api/types/admin-delivery";
import { adminDeliveryKeys, adminDeliveryService } from "@/services/admin-delivery.service";
import { Notice, fmtUtc } from "@/features/listings/shared";
import { OrdersNav } from "./orders-page";

const STATUS_LABEL: Record<string, string> = { FILED: "New", UNDER_REVIEW: "Under review", APPROVED: "Approved", REJECTED: "Rejected", ESCALATED: "Escalated" };
const tone = (s: string) => (s === "APPROVED" ? "APPROVED" : s === "REJECTED" ? "REJECTED" : "PENDING");

const DEFAULTS = { page: 1, pageSize: 20, status: "" };

/**
 * /orders/claims: buyer claims on delivered orders (GET /api/v1/admin/orders/claims, bare array). Read-only: the backend
 * has no claim decision endpoint yet (handoff OJ-07), so claims are reviewed here and resolved outside the system.
 */
export default function ClaimsPage() {
  const [s, set] = useUrlState(DEFAULTS);
  const query = { page: s.page, pageSize: s.pageSize, status: s.status };
  const q = useQuery({ queryKey: adminDeliveryKeys.claims(query), queryFn: ({ signal }) => adminDeliveryService.claims(query, signal), placeholderData: (p) => p });
  const items = q.data ?? [];
  const columns = React.useMemo<ColumnDef<BuyerOrderClaimDto, unknown>[]>(
    () => [
      { header: "Filed", accessorKey: "createdAtUtc", cell: ({ row }) => fmtUtc(row.original.createdAtUtc) },
      {
        header: "Reason",
        accessorKey: "claimReason",
        cell: ({ row }) => (
          <div className="max-w-md whitespace-normal">
            <p className="text-foreground">{row.original.claimReason}</p>
            {row.original.evidenceReference && <p className="text-xs text-muted-foreground">Evidence: {row.original.evidenceReference}</p>}
          </div>
        ),
      },
      { header: "Quantity", accessorKey: "affectedQuantity", cell: ({ row }) => (row.original.affectedQuantity != null ? formatNumber(row.original.affectedQuantity) : "Whole part") },
      { header: "Status", accessorKey: "status", cell: ({ row }) => <StatusBadge value={tone(row.original.status)} label={STATUS_LABEL[row.original.status] ?? row.original.status} /> },
      {
        header: "Order",
        accessorKey: "orderId",
        cell: ({ row }) => (
          <Link to={`/orders/${row.original.orderId}`} className="underline underline-offset-4" onClick={(e) => e.stopPropagation()}>
            Open order
          </Link>
        ),
      },
      { header: "Resolution", accessorKey: "resolutionNotes", cell: ({ row }) => (row.original.resolvedAtUtc ? `${fmtUtc(row.original.resolvedAtUtc)}${row.original.resolutionNotes ? ` · ${row.original.resolutionNotes}` : ""}` : "—") },
    ],
    [],
  );
  const hasNext = items.length === s.pageSize;
  return (
    <>
      <PageHeader eyebrow="Operations" title="Claims" description="Problems buyers reported after delivery. A claim pauses the buyer's acceptance of that seller's part." />
      <OrdersNav />
      <Notice className="mb-4">Claims can be reviewed here but not yet resolved in StockOut: the backend has no claim decision action (requested as OJ-07).</Notice>
      <SectionCard>
        <Toolbar
          left={
            <NativeSelect className="h-[38px] w-full sm:w-52" value={s.status} onChange={(e) => set({ status: e.target.value }, { resetPage: true })} aria-label="Status">
              <option value="">All claims</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          }
          right={<RefreshButton onClick={() => q.refetch()} spinning={q.isFetching} />}
        />
        <DataTable
          caption="Buyer claims"
          columns={columns}
          data={items}
          getRowId={(c) => c.claimId}
          isLoading={q.isLoading}
          isFetching={q.isFetching && !q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          emptyTitle={s.status ? "No claims with this status" : "No claims yet"}
          emptyDescription="Claims appear here when a buyer reports a problem with a delivered order."
        />
        {(s.page > 1 || hasNext) && (
          <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Claim pages">
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
