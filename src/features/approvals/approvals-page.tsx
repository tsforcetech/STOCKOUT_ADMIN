import * as React from "react";
import { Link, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckIcon, ClipboardTextIcon, EyeIcon, XIcon, HourglassIcon, IdentificationCardIcon, PackageIcon, SpinnerGapIcon, StorefrontIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards, type StatItem } from "@/components/common/stat-cards";
import { SectionCard, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { DataTable } from "@/components/tables/data-table";
import { PermissionDenied } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { PERMISSIONS as P, type MarketplaceSellerDto } from "@/api/types/user-organization";
import type { InspectionStatus, InspectionSummaryDto, ListingModerationQueueItem } from "@/api/types/catalog-moderation";
import { formatMoney, formatNumber, humanize } from "@/lib/utils/format";
import { useSellersQuery } from "@/features/sellers/sellers-page";
import { canReviewKyc as kycPending, useSellerReview } from "@/features/sellers/seller-review";
import { useModerationQueueQuery } from "@/features/listings/queries";
import { useInspectionQueueQuery } from "@/features/inspections/queries";
import { PersonText, ageSince, fmtUtc, shortId, useSellerNames, useUserNames } from "@/features/listings/shared";

const PREVIEW_SIZE = 10;


function ViewAll({ to, label, count }: { to: string; label: string; count?: number }) {
  return (
    <Button asChild variant="secondary" size="sm">
      <Link to={to}>
        View all{typeof count === "number" ? ` (${formatNumber(count)})` : ""} <span className="sr-only">{label}</span>
      </Link>
    </Button>
  );
}

function PreviewNote({ shown, total, order }: { shown: number; total: number | undefined; order: string }) {
  if (!total) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Showing {formatNumber(shown)} of {formatNumber(total)} · {order}
    </p>
  );
}

function ListingsTab({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const sellerNames = useSellerNames();
  const queue = useModerationQueueQuery({ page: 1, pageSize: PREVIEW_SIZE }, enabled);
  const columns = React.useMemo<ColumnDef<ListingModerationQueueItem, unknown>[]>(
    () => [
      { id: "listing", header: "Listing", cell: ({ row }) => <EntityCell icon={<PackageIcon />} title={row.original.title || "Untitled listing"} subtitle={`v${row.original.versionNumber} · ${row.original.categoryName}`} /> },
      { id: "seller", header: "Seller", cell: ({ row }) => <PersonText id={row.original.sellerId} names={sellerNames} /> },
      { id: "price", header: "Base price", cell: ({ row }) => formatMoney(row.original.basePrice, row.original.currency) },
      { id: "inspection", header: "Inspection", cell: ({ row }) => (row.original.requiresPhysicalInspection ? "Required" : "Not required") },
      { id: "submitted", header: "Submitted", cell: ({ row }) => fmtUtc(row.original.submittedAtUtc) },
      { id: "waiting", header: "Waiting", cell: ({ row }) => ageSince(row.original.submittedAtUtc) },
    ],
    [sellerNames],
  );
  if (!enabled) return <PermissionDenied description="Reviewing listings requires the catalog:listings:review permission." />;
  const items = queue.data?.items ?? [];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PreviewNote shown={items.length} total={queue.data?.totalCount} order="oldest submissions first" />
        <div className="ml-auto flex items-center gap-2">
          <RefreshButton onClick={() => queue.refetch()} spinning={queue.isFetching} />
          <ViewAll to="/listings" label="listings awaiting review" count={queue.data?.totalCount} />
        </div>
      </div>
      <DataTable
        caption="Listings awaiting review"
        columns={columns}
        data={items}
        getRowId={(i) => i.listingVersionId}
        isLoading={queue.isLoading}
        error={queue.error}
        onRetry={() => queue.refetch()}
        onRowClick={(i) => navigate(`/listings/${i.listingId}/versions/${i.listingVersionId}`)}
        clientSorting={false}
        pageSizeOptions={[PREVIEW_SIZE]}
        emptyTitle="No listings awaiting review"
        emptyDescription="Submitted listing versions appear here."
      />
    </>
  );
}

function SellersTab({ enabled }: { enabled: boolean }) {
  const query = useSellersQuery(enabled);
  const review = useSellerReview();
  const { act, allowed, openReview } = review;
  const pending = React.useMemo(
    () => (query.data ?? []).filter(kycPending).sort((a, b) => (a.submittedAtUtc ?? "").localeCompare(b.submittedAtUtc ?? "")),
    [query.data],
  );
  const columns = React.useMemo<ColumnDef<MarketplaceSellerDto, unknown>[]>(
    () => [
      { id: "name", header: "Organisation", cell: ({ row }) => <EntityCell icon={<StorefrontIcon />} title={row.original.displayName || "Unnamed seller"} subtitle={shortId(row.original.sellerId)} /> },
      { id: "type", header: "Type", cell: ({ row }) => humanize(row.original.organizationType) },
      { id: "onboarding", header: "Onboarding", cell: ({ row }) => <StatusBadge value={row.original.onboardingStatus} /> },
      { id: "submitted", header: "Submitted", cell: ({ row }) => fmtUtc(row.original.submittedAtUtc) },
      { id: "waiting", header: "Waiting", cell: ({ row }) => ageSince(row.original.submittedAtUtc) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex justify-end gap-1.5">
              <RowAction label="Review KYC" onClick={() => openReview(s)}>
                <EyeIcon />
              </RowAction>
              {allowed("REJECT", s) && (
                <RowAction label="Reject KYC" tone="danger" onClick={() => act("REJECT", s)}>
                  <XIcon />
                </RowAction>
              )}
              {allowed("APPROVE", s) && (
                <RowAction label="Approve KYC" tone="success" onClick={() => act("APPROVE", s)}>
                  <CheckIcon />
                </RowAction>
              )}
            </div>
          );
        },
      },
    ],
    [act, allowed, openReview],
  );
  if (!enabled) return <PermissionDenied description="Seller KYC requires the sellers.view permission." />;
  const preview = pending.slice(0, PREVIEW_SIZE);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PreviewNote shown={preview.length} total={pending.length} order="oldest submissions first" />
        <div className="ml-auto flex items-center gap-2">
          <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
          <ViewAll to="/sellers?tab=pending" label="pending seller KYC" count={query.data ? pending.length : undefined} />
        </div>
      </div>
      <DataTable
        caption="Sellers awaiting KYC review"
        columns={columns}
        data={preview}
        getRowId={(s) => s.sellerId}
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        onRowClick={(s) => openReview(s)}
        clientSorting={false}
        pageSizeOptions={[PREVIEW_SIZE]}
        emptyTitle="No sellers awaiting KYC"
        emptyDescription="Sellers appear here after they submit onboarding for verification."
      />
      {review.element}
    </>
  );
}

const OPEN_STATUSES: InspectionStatus[] = ["PENDING", "ASSIGNED", "IN_PROGRESS"];

function InspectionsTab({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const userNames = useUserNames();
  const [state, setState] = useUrlState({ istatus: "PENDING" });
  const status = (OPEN_STATUSES as string[]).includes(state.istatus) ? (state.istatus as InspectionStatus) : "PENDING";
  const queue = useInspectionQueueQuery({ status, page: 1, pageSize: PREVIEW_SIZE }, enabled);
  const columns = React.useMemo<ColumnDef<InspectionSummaryDto, unknown>[]>(
    () => [
      { id: "inspection", header: "Inspection", cell: ({ row }) => <EntityCell icon={<ClipboardTextIcon />} title={row.original.inspectionNo} subtitle={row.original.listingTitle ?? `Listing ${shortId(row.original.listingId)}`} /> },
      { id: "status", header: "Status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
      { id: "inspector", header: "Inspector", cell: ({ row }) => (row.original.assignedInspectorUserId ? <PersonText id={row.original.assignedInspectorUserId} names={userNames} /> : <span className="text-muted-foreground">Unassigned</span>) },
      { id: "created", header: "Created", cell: ({ row }) => fmtUtc(row.original.createdAtUtc) },
      { id: "age", header: "Age", cell: ({ row }) => ageSince(row.original.createdAtUtc) },
    ],
    [userNames],
  );
  if (!enabled) return <PermissionDenied description="Inspections require the inspections.view permission." />;
  const items = queue.data?.items ?? [];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PreviewNote shown={items.length} total={queue.data?.totalCount} order="newest first" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NativeSelect className="h-[38px] w-40" value={status} onChange={(e) => setState({ istatus: e.target.value })} aria-label="Inspection status">
            <option value="PENDING">Pending</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In progress</option>
          </NativeSelect>
          <RefreshButton onClick={() => queue.refetch()} spinning={queue.isFetching} />
          <ViewAll to={`/inspections?status=${status}`} label="inspections" count={queue.data?.totalCount} />
        </div>
      </div>
      <DataTable
        caption="Open inspections"
        columns={columns}
        data={items}
        getRowId={(i) => i.inspectionId}
        isLoading={queue.isLoading}
        error={queue.error}
        onRetry={() => queue.refetch()}
        onRowClick={(i) => navigate(`/inspections/${i.inspectionId}`)}
        clientSorting={false}
        pageSizeOptions={[PREVIEW_SIZE]}
        emptyTitle={`No ${humanize(status).toLowerCase()} inspections`}
      />
    </>
  );
}

const TABS = [
  { value: "listings", label: "Listings" },
  { value: "kyc", label: "Seller KYC" },
  { value: "inspections", label: "Inspections" },
] as const;

export default function ApprovalsPage() {
  const { can } = useAccess();
  const canListings = can(P.CATALOG_LISTINGS_REVIEW);
  const canSellers = can(P.SELLERS_VIEW);
  const canInspections = can(P.INSPECTIONS_VIEW);
  const [state, setState] = useUrlState({ tab: canListings ? "listings" : canSellers ? "kyc" : "inspections" });

  // Counts: pageSize 1 is enough to read totalCount from the server-paginated queues.
  const listings = useModerationQueueQuery({ page: 1, pageSize: 1 }, canListings);
  const sellers = useSellersQuery(canSellers);
  const pending = useInspectionQueueQuery({ status: "PENDING", page: 1, pageSize: 1 }, canInspections);
  const inProgress = useInspectionQueueQuery({ status: "IN_PROGRESS", page: 1, pageSize: 1 }, canInspections);

  const stat = (allowed: boolean, q: { isLoading: boolean; error: unknown }, value: number | undefined): Pick<StatItem, "value" | "loading" | "unavailable"> =>
    !allowed ? { value: "—", unavailable: "No permission" } : { value: formatNumber(value), loading: q.isLoading, unavailable: q.error ? "Unavailable" : undefined };

  if (!canListings && !canSellers && !canInspections) return <PermissionDenied />;

  return (
    <>
      <PageHeader eyebrow="StockOut administration" title="Approvals" description="Review every listing, seller and inspection waiting on an admin decision." />
      <StatCards
        className="mb-4"
        items={[
          { label: "Listings awaiting review", hint: "Submitted versions under review", icon: <PackageIcon />, ...stat(canListings, listings, listings.data?.totalCount) },
          { label: "Seller KYC pending", hint: "Submitted for verification", icon: <IdentificationCardIcon />, ...stat(canSellers, sellers, sellers.data?.filter(kycPending).length) },
          { label: "Inspections pending", hint: "Waiting for an inspector", icon: <HourglassIcon />, ...stat(canInspections, pending, pending.data?.totalCount) },
          { label: "Inspections in progress", hint: "Being inspected now", icon: <SpinnerGapIcon />, ...stat(canInspections, inProgress, inProgress.data?.totalCount) },
        ]}
      />
      <SectionCard>
        <Tabs value={state.tab} onValueChange={(tab) => setState({ tab })}>
          <TabsList aria-label="Approval queues">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="listings">
            <ListingsTab enabled={canListings} />
          </TabsContent>
          <TabsContent value="kyc">
            <SellersTab enabled={canSellers} />
          </TabsContent>
          <TabsContent value="inspections">
            <InspectionsTab enabled={canInspections} />
          </TabsContent>
        </Tabs>
      </SectionCard>
    </>
  );
}
