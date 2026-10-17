import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router";
import { ArrowRightIcon, MagnifyingGlassIcon, PackageIcon, XIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { ExportButton } from "@/components/common/export-button";
import { DataTable } from "@/components/tables/data-table";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { RequirePermission } from "@/lib/auth/guards";
import { useUrlState } from "@/hooks/use-url-state";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type { ListingModerationQueueItem, ModerationQueueQuery } from "@/api/types/catalog-moderation";
import { formatMoney, humanize } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { useModerationQueueQuery } from "./queries";
import { GuidFilterInput, Notice, PersonText, ageSince, dateInputToUtc, fmtUtc, isGuid, shortId, useSellerNames } from "./shared";

export const reviewPath = (item: { listingId: string; listingVersionId: string }) => `/listings/${item.listingId}/versions/${item.listingVersionId}`;

const DEFAULTS = { page: 1, pageSize: 20, inspection: "", from: "", to: "", category: "", seller: "" };

function ListingsContent() {
  const navigate = useNavigate();
  const [state, setState] = useUrlState(DEFAULTS);
  const sellerNames = useSellerNames();
  const [jump, setJump] = React.useState({ listingId: "", versionId: "" });

  const query: ModerationQueueQuery = {
    page: state.page,
    pageSize: state.pageSize,
    requiresInspectionOnly: state.inspection === "true" ? true : state.inspection === "false" ? false : undefined,
    submittedFromUtc: dateInputToUtc(state.from, "start"),
    submittedToUtc: dateInputToUtc(state.to, "end"),
    categoryId: state.category || undefined,
    sellerId: state.seller || undefined,
  };
  const queue = useModerationQueueQuery(query);
  const items = React.useMemo(() => queue.data?.items ?? [], [queue.data]);
  const hasFilters = Boolean(state.inspection || state.from || state.to || state.category || state.seller);

  const columns = React.useMemo<ColumnDef<ListingModerationQueueItem, unknown>[]>(
    () => [
      {
        id: "listing",
        header: "Listing",
        cell: ({ row }) => <EntityCell icon={<PackageIcon />} title={row.original.title || "Untitled listing"} subtitle={`LST-${shortId(row.original.listingId)} · v${row.original.versionNumber}`} />,
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="cursor-pointer text-left hover:underline"
              title="Filter by this category"
              onClick={(e) => {
                e.stopPropagation();
                setState({ category: row.original.categoryId }, { resetPage: true });
              }}
            >
              {row.original.categoryName}
            </button>
            {row.original.requiresPhysicalInspection && (
              <Badge tone="info" className="w-fit">
                Inspection required
              </Badge>
            )}
          </div>
        ),
      },
      { id: "seller", header: "Seller", cell: ({ row }) => <PersonText id={row.original.sellerId} names={sellerNames} /> },
      { id: "price", header: "Base price", cell: ({ row }) => formatMoney(row.original.basePrice, row.original.currency) },
      { id: "mode", header: "Pricing", cell: ({ row }) => humanize(row.original.pricingMode) },
      { id: "submitted", header: "Submitted", cell: ({ row }) => fmtUtc(row.original.submittedAtUtc) },
      { id: "waiting", header: "Waiting", cell: ({ row }) => ageSince(row.original.submittedAtUtc) },
      { id: "status", header: "Status", cell: () => <StatusBadge value="UNDER_REVIEW" /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowAction label="Review listing" onClick={() => navigate(reviewPath(row.original))}>
              <ArrowRightIcon />
            </RowAction>
          </div>
        ),
      },
    ],
    [navigate, sellerNames, setState],
  );

  const exportRows = () =>
    downloadCsv(
      `moderation-queue-page-${state.page}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(items, [
        { header: "Listing ID", value: (i) => i.listingId },
        { header: "Version ID", value: (i) => i.listingVersionId },
        { header: "Version", value: (i) => i.versionNumber },
        { header: "Title", value: (i) => i.title },
        { header: "Category", value: (i) => i.categoryName },
        { header: "Requires inspection", value: (i) => (i.requiresPhysicalInspection ? "Yes" : "No") },
        { header: "Seller ID", value: (i) => i.sellerId },
        { header: "Pricing mode", value: (i) => i.pricingMode },
        { header: "Base price", value: (i) => i.basePrice },
        { header: "Currency", value: (i) => i.currency },
        { header: "Submitted (UTC)", value: (i) => i.submittedAtUtc },
      ]),
    );

  const canJump = isGuid(jump.listingId) && isGuid(jump.versionId);

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Listing moderation"
        description="Review listing versions submitted by sellers, oldest first."
        actions={<ExportButton onExport={exportRows} disabled={!items.length} />}
      />
      <SectionCard>
        <Toolbar
          left={
            <>
              <NativeSelect className="h-[38px] w-full sm:w-52" value={state.inspection} onChange={(e) => setState({ inspection: e.target.value }, { resetPage: true })} aria-label="Inspection requirement">
                <option value="">Any inspection policy</option>
                <option value="true">Requires inspection</option>
                <option value="false">No inspection required</option>
              </NativeSelect>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">From</span>
                <Input type="date" className="h-[38px] w-40" value={state.from} max={state.to || undefined} onChange={(e) => setState({ from: e.target.value }, { resetPage: true })} aria-label="Submitted from (UTC)" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">To</span>
                <Input type="date" className="h-[38px] w-40" value={state.to} min={state.from || undefined} onChange={(e) => setState({ to: e.target.value }, { resetPage: true })} aria-label="Submitted to (UTC)" />
              </label>
            </>
          }
          right={
            <>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => setState({ inspection: "", from: "", to: "", category: "", seller: "" }, { resetPage: true })}>
                  <XIcon /> Clear filters
                </Button>
              )}
              <RefreshButton onClick={() => queue.refetch()} spinning={queue.isFetching} />
            </>
          }
        />
        <Toolbar
          className="-mt-1"
          left={
            <>
              <GuidFilterInput value={state.category} onChange={(category) => setState({ category }, { resetPage: true })} label="Category ID" placeholder="Filter by category ID" />
              <GuidFilterInput value={state.seller} onChange={(seller) => setState({ seller }, { resetPage: true })} label="Seller ID" placeholder="Filter by seller ID" />
            </>
          }
        />
        <DataTable
          caption="Listing versions awaiting moderation"
          columns={columns}
          data={items}
          getRowId={(i) => i.listingVersionId}
          isLoading={queue.isLoading}
          isFetching={queue.isFetching && !queue.isLoading}
          error={queue.error}
          onRetry={() => queue.refetch()}
          onRowClick={(i) => navigate(reviewPath(i))}
          pagination={{
            page: state.page,
            pageSize: state.pageSize,
            totalCount: queue.data?.totalCount ?? 0,
            onPageChange: (page) => setState({ page }),
            onPageSizeChange: (pageSize) => setState({ pageSize, page: 1 }),
          }}
          emptyTitle={hasFilters ? "No submissions match these filters" : "The moderation queue is empty"}
          emptyDescription={hasFilters ? "Clear or change the filters to see more." : "Listing versions appear here when sellers submit them for review."}
        />
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <Notice>
            This queue only contains versions currently <strong>under review</strong>. The backend has no admin endpoint that lists all listings or a listing's versions,
            so published or suspended listings are reached from a version's review page (or by ID below).
          </Notice>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (canJump) navigate(reviewPath({ listingId: jump.listingId.trim().toLowerCase(), listingVersionId: jump.versionId.trim().toLowerCase() }));
            }}
          >
            <Input className="h-[38px] font-mono text-xs sm:w-56" placeholder="Listing ID" aria-label="Listing ID" value={jump.listingId} onChange={(e) => setJump((j) => ({ ...j, listingId: e.target.value }))} />
            <Input className="h-[38px] font-mono text-xs sm:w-56" placeholder="Version ID" aria-label="Version ID" value={jump.versionId} onChange={(e) => setJump((j) => ({ ...j, versionId: e.target.value }))} />
            <Button type="submit" variant="secondary" disabled={!canJump}>
              <MagnifyingGlassIcon /> Open
            </Button>
          </form>
        </div>
      </SectionCard>
    </>
  );
}

export default function ListingsPage() {
  return (
    <RequirePermission permission={P.CATALOG_LISTINGS_REVIEW}>
      <ListingsContent />
    </RequirePermission>
  );
}
