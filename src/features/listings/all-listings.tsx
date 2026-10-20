import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowRightIcon, ClockIcon, ImageIcon, PackageIcon, RocketLaunchIcon, StorefrontIcon, SquaresFourIcon, ListBulletsIcon, XIcon } from "@phosphor-icons/react";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatCards, type StatItem } from "@/components/common/stat-cards";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { env } from "@/config/env";
import { useUrlState } from "@/hooks/use-url-state";
import { useAccess } from "@/lib/auth/use-access";
import { cn } from "@/lib/utils/cn";
import { formatNumber, humanize } from "@/lib/utils/format";
import { moderationService } from "@/services/moderation.service";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type { AdminListingItem, AdminListingModerationStatus, AdminListingQuery, AdminListingSort, AdminListingStatus } from "@/api/types/catalog-moderation";
import { useSellersQuery } from "@/features/sellers/sellers-page";
import { useCategoriesQuery } from "@/features/catalog/lib/queries";
import { ExportButton } from "@/components/common/export-button";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { PersonText, fmtUtc, useSellerNames } from "./shared";
import { listingKeys } from "./queries";

/** Quick views over the F2-A filters. `null` = no filter. */
const VIEWS: Array<{ key: string; label: string; status?: AdminListingStatus; moderationStatus?: AdminListingModerationStatus }> = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready to publish", moderationStatus: "APPROVED" },
  { key: "review", label: "Under review", moderationStatus: "UNDER_REVIEW" },
  { key: "inspection", label: "Awaiting inspection", moderationStatus: "INSPECTION_REQUIRED" },
  { key: "changes", label: "Changes requested", moderationStatus: "CHANGES_REQUIRED" },
  { key: "draft", label: "Drafts", moderationStatus: "DRAFT" },
  { key: "published", label: "Published", status: "PUBLISHED" },
  { key: "suspended", label: "Suspended", status: "SUSPENDED" },
  { key: "rejected", label: "Rejected", moderationStatus: "REJECTED" },
  { key: "expired", label: "Expired", status: "EXPIRED" },
  { key: "archived", label: "Archived", status: "ARCHIVED" },
];

const SORTS: Array<[AdminListingSort, string]> = [
  ["UpdatedAtUtcDesc", "Recently updated"],
  ["CreatedAtUtcDesc", "Newest first"],
  ["CreatedAtUtcAsc", "Oldest first"],
  ["TitleAsc", "Title A–Z"],
  ["TitleDesc", "Title Z–A"],
];

const DEFAULTS = { view: "all", layout: "list", q: "", seller: "", category: "", sort: "UpdatedAtUtcDesc", page: 1, pageSize: 20 };

/** The version an admin should open: the candidate (draft/review/approved) if any, else the live one. */
export const versionToOpen = (l: AdminListingItem) => l.currentDraftVersionId ?? l.publishedVersionId;

/** One label for "where is this listing now", combining the aggregate and candidate-version states. */
export function listingState(l: AdminListingItem): { value: string; label: string } {
  if (l.isApprovedAwaitingReplacementPublication) return { value: "APPROVED", label: "Update ready to publish" };
  if (l.isApprovedAwaitingPublication) return { value: "APPROVED", label: "Ready to publish" };
  if (l.status === "PUBLISHED" && l.currentDraftVersionStatus && l.currentDraftVersionStatus !== "PUBLISHED") {
    return { value: l.currentDraftVersionStatus, label: `Live · update ${humanize(l.currentDraftVersionStatus).toLowerCase()}` };
  }
  if (l.status === "DRAFT" && l.currentDraftVersionStatus) return { value: l.currentDraftVersionStatus, label: humanize(l.currentDraftVersionStatus) };
  return { value: l.status, label: humanize(l.status) };
}

/** Listing photo from the public file route. Drafts' photos aren't public (backend C4), so fall back to an icon. */
function Thumb({ fileId, className }: { fileId: string | null; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!fileId || failed) {
    return (
      <span className={cn("flex items-center justify-center bg-surface-muted text-muted-foreground", className)} aria-hidden>
        <ImageIcon className="size-6" />
      </span>
    );
  }
  return <img src={`${env.apiBaseUrl}/api/v1/files/${encodeURIComponent(fileId)}/download`} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("object-cover", className)} />;
}

function useCount(q: AdminListingQuery, enabled: boolean) {
  return useQuery({
    queryKey: [...listingKeys.all, "admin-count", q] as const,
    queryFn: ({ signal }) => moderationService.allListings({ ...q, page: 1, pageSize: 1 }, signal),
    enabled,
    staleTime: 30_000,
  });
}

export function AllListings() {
  const navigate = useNavigate();
  const { can } = useAccess();
  const [state, setState] = useUrlState(DEFAULTS);
  const sellerNames = useSellerNames();
  const sellers = useSellersQuery(can(P.SELLERS_VIEW));
  const categories = useCategoriesQuery({});
  const [search, setSearch] = React.useState(state.q);

  // Debounce typing into the URL (and the request).
  React.useEffect(() => {
    if (search === state.q) return;
    const t = setTimeout(() => setState({ q: search }, { resetPage: true }), 350);
    return () => clearTimeout(t);
  }, [search, state.q, setState]);

  const view = VIEWS.find((v) => v.key === state.view) ?? VIEWS[0]!;
  const query: AdminListingQuery = {
    page: state.page,
    pageSize: state.pageSize,
    status: view.status,
    moderationStatus: view.moderationStatus,
    sellerId: state.seller || undefined,
    categoryId: state.category || undefined,
    search: state.q.trim().slice(0, 255) || undefined,
    sort: (SORTS.some(([s]) => s === state.sort) ? state.sort : "UpdatedAtUtcDesc") as AdminListingSort,
  };
  const list = useQuery({
    queryKey: [...listingKeys.all, "admin-all", query] as const,
    queryFn: ({ signal }) => moderationService.allListings(query, signal),
    placeholderData: (prev) => prev,
  });
  const items = list.data?.items ?? [];

  const total = useCount({}, true);
  const ready = useCount({ moderationStatus: "APPROVED" }, true);
  const review = useCount({ moderationStatus: "UNDER_REVIEW" }, true);
  const live = useCount({ status: "PUBLISHED" }, true);
  const stat = (q: { data?: { totalCount: number }; isLoading: boolean; error: unknown }): Pick<StatItem, "value" | "loading" | "unavailable"> => ({
    value: formatNumber(q.data?.totalCount),
    loading: q.isLoading,
    unavailable: q.error ? "Unavailable" : undefined,
  });

  const open = (l: AdminListingItem) => {
    const v = versionToOpen(l);
    if (v) navigate(`/listings/${l.listingId}/versions/${v}`);
  };
  const hasFilters = Boolean(state.q || state.seller || state.category);

  const columns = React.useMemo<ColumnDef<AdminListingItem, unknown>[]>(
    () => [
      {
        id: "listing",
        header: "Listing",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Thumb fileId={row.original.primaryFileAssetId} className="size-11 shrink-0 rounded-md" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{row.original.title || "Untitled listing"}</span>
              <span className="block text-xs text-muted-foreground">{row.original.listingNumber}</span>
            </span>
          </div>
        ),
      },
      { id: "seller", header: "Seller", cell: ({ row }) => <PersonText id={row.original.sellerId} names={sellerNames} /> },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span>{row.original.categoryName ?? "—"}</span>
            {row.original.requiresPhysicalInspection && (
              <Badge tone="info" className="w-fit">
                Inspection required
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "state",
        header: "State",
        cell: ({ row }) => {
          const s = listingState(row.original);
          return <StatusBadge value={s.value} label={s.label} />;
        },
      },
      { id: "updated", header: "Updated", cell: ({ row }) => fmtUtc(row.original.updatedAtUtc ?? row.original.createdAtUtc) },
      { id: "published", header: "Published", cell: ({ row }) => (row.original.publishedAtUtc ? fmtUtc(row.original.publishedAtUtc) : <span className="text-muted-foreground">Never</span>) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowAction label={row.original.isApprovedAwaitingPublication ? "Open to publish" : "Open listing"} onClick={() => open(row.original)} disabled={!versionToOpen(row.original)}>
              {row.original.isApprovedAwaitingPublication ? <RocketLaunchIcon /> : <ArrowRightIcon />}
            </RowAction>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sellerNames],
  );

  const exportRows = () =>
    downloadCsv(
      `listings-${view.key}-page-${state.page}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(items, [
        { header: "Listing ID", value: (i) => i.listingId },
        { header: "Listing no.", value: (i) => i.listingNumber },
        { header: "Title", value: (i) => i.title },
        { header: "Seller", value: (i) => sellerNames.get(i.sellerId.toLowerCase()) ?? i.sellerId },
        { header: "Category", value: (i) => i.categoryName },
        { header: "Status", value: (i) => i.status },
        { header: "Version status", value: (i) => i.currentDraftVersionStatus },
        { header: "Ready to publish", value: (i) => (i.isApprovedAwaitingPublication ? "Yes" : "No") },
        { header: "Requires inspection", value: (i) => (i.requiresPhysicalInspection ? "Yes" : "No") },
        { header: "Created (UTC)", value: (i) => i.createdAtUtc },
        { header: "Updated (UTC)", value: (i) => i.updatedAtUtc },
        { header: "Published (UTC)", value: (i) => i.publishedAtUtc },
      ]),
    );

  const pagination = {
    page: state.page,
    pageSize: state.pageSize,
    totalCount: list.data?.totalCount ?? 0,
    onPageChange: (page: number) => setState({ page }),
    onPageSizeChange: (pageSize: number) => setState({ pageSize, page: 1 }),
  };

  return (
    <>
      <StatCards
        className="mb-4"
        items={[
          { label: "All listings", hint: "Every seller, every state", icon: <PackageIcon />, ...stat(total) },
          { label: "Ready to publish", hint: "Approved, waiting for an admin", icon: <RocketLaunchIcon />, ...stat(ready) },
          { label: "Under review", hint: "Submitted by sellers", icon: <ClockIcon />, ...stat(review) },
          { label: "Published", hint: "Live on the marketplace", icon: <StorefrontIcon />, ...stat(live) },
        ]}
      />
      <SectionCard>
        <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Listing state">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v.key === view.key}
              onClick={() => setState({ view: v.key }, { resetPage: true })}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                v.key === view.key ? "border-foreground bg-foreground text-surface" : "border-border bg-surface text-foreground hover:border-foreground/40",
              )}
            >
              {v.label}
              {v.key === "ready" && ready.data?.totalCount ? <span className="ml-1.5 rounded-full bg-action px-1.5 text-xs text-action-foreground">{formatNumber(ready.data.totalCount)}</span> : null}
            </button>
          ))}
        </div>
        <Toolbar
          left={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search title, LST number or listing ID…" />
              <NativeSelect className="h-[38px] w-full sm:w-52" value={state.seller} onChange={(e) => setState({ seller: e.target.value }, { resetPage: true })} aria-label="Seller">
                <option value="">All sellers</option>
                {(sellers.data ?? [])
                  .slice()
                  .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""))
                  .map((s) => (
                    <option key={s.sellerId} value={s.sellerId}>
                      {s.displayName || "Unnamed seller"}
                    </option>
                  ))}
              </NativeSelect>
              <NativeSelect className="h-[38px] w-full sm:w-56" value={state.category} onChange={(e) => setState({ category: e.target.value }, { resetPage: true })} aria-label="Category">
                <option value="">All categories</option>
                {(categories.data ?? [])
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.categoryId} value={c.categoryId}>
                      {c.name}
                    </option>
                  ))}
              </NativeSelect>
            </>
          }
          right={
            <>
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setState({ q: "", seller: "", category: "" }, { resetPage: true });
                  }}
                >
                  <XIcon /> Clear
                </Button>
              )}
              <NativeSelect className="h-[38px] w-44" value={state.sort} onChange={(e) => setState({ sort: e.target.value }, { resetPage: true })} aria-label="Sort">
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
              <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Layout">
                {(
                  [
                    ["list", "List view", ListBulletsIcon],
                    ["grid", "Grid view", SquaresFourIcon],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={label}
                    aria-pressed={state.layout === key}
                    title={label}
                    onClick={() => setState({ layout: key })}
                    className={cn("flex size-8 cursor-pointer items-center justify-center rounded", state.layout === key ? "bg-foreground text-surface" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
              <ExportButton onExport={exportRows} disabled={!items.length} />
              <RefreshButton onClick={() => list.refetch()} spinning={list.isFetching} />
            </>
          }
        />

        {state.layout === "grid" ? (
          <ListingGrid items={items} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} onOpen={open} sellerNames={sellerNames} pagination={pagination} hasFilters={hasFilters || view.key !== "all"} />
        ) : (
          <DataTable
            caption="Listings"
            columns={columns}
            data={items}
            getRowId={(i) => i.listingId}
            isLoading={list.isLoading}
            isFetching={list.isFetching && !list.isLoading}
            error={list.error}
            onRetry={() => list.refetch()}
            onRowClick={open}
            clientSorting={false}
            pagination={pagination}
            emptyTitle={hasFilters || view.key !== "all" ? "No listings match" : "No listings yet"}
            emptyDescription={hasFilters || view.key !== "all" ? "Try another state or clear the filters." : "Listings appear here as soon as sellers create them."}
          />
        )}
      </SectionCard>
    </>
  );
}

function ListingGrid({
  items,
  loading,
  error,
  onRetry,
  onOpen,
  sellerNames,
  pagination,
  hasFilters,
}: {
  items: AdminListingItem[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpen: (l: AdminListingItem) => void;
  sellerNames: Map<string, string>;
  pagination: { page: number; pageSize: number; totalCount: number; onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void };
  hasFilters: boolean;
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <p className="font-medium text-foreground">Couldn't load listings</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (loading) {
    return (
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy>
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="h-72 animate-pulse rounded-xl bg-surface-muted" />
        ))}
      </ul>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="font-medium text-foreground">{hasFilters ? "No listings match" : "No listings yet"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{hasFilters ? "Try another state or clear the filters." : "Listings appear here as soon as sellers create them."}</p>
      </div>
    );
  }
  const pages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));
  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((l) => {
          const s = listingState(l);
          return (
            <li key={l.listingId}>
              <button
                type="button"
                onClick={() => onOpen(l)}
                disabled={!versionToOpen(l)}
                className="group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition-shadow hover:shadow-raised disabled:cursor-not-allowed"
              >
                <div className="relative">
                  <Thumb fileId={l.primaryFileAssetId} className="aspect-[16/10] w-full" />
                  {l.isApprovedAwaitingPublication && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-action px-2 py-0.5 text-xs font-bold text-action-foreground">
                      <RocketLaunchIcon className="size-3.5" /> Ready to publish
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {l.categoryName ?? "—"} · {l.listingNumber}
                  </p>
                  <p className="line-clamp-2 font-heading text-[15px] font-bold leading-5 text-foreground group-hover:underline">{l.title || "Untitled listing"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <PersonText id={l.sellerId} names={sellerNames} />
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                    <StatusBadge value={s.value} label={s.label} />
                    {l.requiresPhysicalInspection && <Badge tone="info">Inspection</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Updated {fmtUtc(l.updatedAtUtc ?? l.createdAtUtc)}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <nav className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
        <span className="text-muted-foreground">
          {formatNumber((pagination.page - 1) * pagination.pageSize + 1)}–{formatNumber(Math.min(pagination.page * pagination.pageSize, pagination.totalCount))} of {formatNumber(pagination.totalCount)}
        </span>
        <div className="flex items-center gap-2">
          <NativeSelect className="h-8 w-28" value={String(pagination.pageSize)} onChange={(e) => pagination.onPageSizeChange(Number(e.target.value))} aria-label="Per page">
            {[12, 20, 48, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </NativeSelect>
          <Button variant="secondary" size="sm" disabled={pagination.page <= 1} onClick={() => pagination.onPageChange(pagination.page - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {pagination.page} of {pages}
          </span>
          <Button variant="secondary" size="sm" disabled={pagination.page >= pages} onClick={() => pagination.onPageChange(pagination.page + 1)}>
            Next
          </Button>
        </div>
      </nav>
    </>
  );
}
