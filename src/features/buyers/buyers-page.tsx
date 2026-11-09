import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { ArrowsClockwiseIcon, HourglassIcon, SealCheckIcon, ShoppingCartIcon, UserIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards } from "@/components/common/stat-cards";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { ExportButton } from "@/components/common/export-button";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { FilterPills } from "@/components/common/filter-pills";
import { Badge } from "@/components/ui/misc";
import { RequirePermission } from "@/lib/auth/guards";
import { useUrlState } from "@/hooks/use-url-state";
import { buyersService } from "@/services/buyers.service";
import { PERMISSIONS as P, type AdminBuyerListItemDto } from "@/api/types/user-organization";
import { formatDateTime, formatNumber, humanize } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { ageSince } from "@/features/listings/shared";
import { SlaBadge, buyerName, buyersKeys, canDecideBuyer, useBuyerReview } from "./buyer-review";

const TABS = [
  { value: "review", label: "Awaiting review" },
  { value: "reverify", label: "Re-verification" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "draft", label: "Not submitted" },
  { value: "suspended", label: "Suspended" },
  { value: "all", label: "All" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

function matchesTab(b: AdminBuyerListItemDto, tab: TabValue): boolean {
  switch (tab) {
    case "review":
      return canDecideBuyer(b) && (b.verificationStatus === "SUBMITTED" || b.verificationStatus === "UNDER_REVIEW");
    case "reverify":
      return b.requiresReverification;
    case "verified":
      return b.verificationStatus === "VERIFIED" && !b.requiresReverification;
    case "rejected":
      return b.verificationStatus === "REJECTED";
    case "draft":
      return b.verificationStatus === "DRAFT";
    case "suspended":
      return b.orgStatus === "SUSPENDED";
    default:
      return true;
  }
}

const ID_LABEL: Record<string, string> = { EMIRATES_ID: "Emirates ID", PASSPORT: "Passport", NATIONAL_ID: "National ID" };

function BuyersContent() {
  const review = useBuyerReview();
  const [state, setState] = useUrlState({ tab: "review", q: "" });
  const query = useQuery({ queryKey: buyersKeys.all, queryFn: ({ signal }) => buyersService.list(signal) });
  const buyers = React.useMemo(() => query.data ?? [], [query.data]);

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    const rows = buyers.filter((b) => matchesTab(b, state.tab as TabValue) && (!q || buyerName(b).toLowerCase().includes(q) || b.buyerId.toLowerCase().includes(q)));
    // Review queue: overdue first, then the nearest server deadline (records without one last), then oldest submission.
    return state.tab === "review"
      ? [...rows].sort(
          (a, b) =>
            Number(!!b.isOverdue) - Number(!!a.isOverdue) ||
            (a.reviewDeadlineUtc ?? "9999").localeCompare(b.reviewDeadlineUtc ?? "9999") ||
            (a.submittedAtUtc ?? "").localeCompare(b.submittedAtUtc ?? ""),
        )
      : rows;
  }, [buyers, state.tab, state.q]);

  const exportRows = (rows: AdminBuyerListItemDto[]) =>
    downloadCsv(
      `buyers-${new Date().toISOString().slice(0, 10)}.csv`,
      // No document numbers or personal addresses in exports (privacy, B12).
      toCsv(rows, [
        { header: "Buyer ID", value: (b) => b.buyerId },
        { header: "Name", value: (b) => buyerName(b) },
        { header: "ID type", value: (b) => b.documentType },
        { header: "Issuing country", value: (b) => b.issuingCountry },
        { header: "Verification", value: (b) => b.verificationStatus },
        { header: "Re-verification required", value: (b) => (b.requiresReverification ? "Yes" : "No") },
        { header: "Account", value: (b) => b.orgStatus },
        { header: "Submitted (UTC)", value: (b) => b.submittedAtUtc },
        { header: "Verified (UTC)", value: (b) => b.verifiedAtUtc },
        { header: "Review deadline (UTC)", value: (b) => b.reviewDeadlineUtc ?? "" },
        { header: "Review SLA", value: (b) => b.reviewSlaStatus ?? "" },
        { header: "Overdue", value: (b) => (b.isOverdue ? "Yes" : "No") },
      ]),
    );

  const columns = React.useMemo<ColumnDef<AdminBuyerListItemDto, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Buyer",
        accessorFn: (b) => buyerName(b),
        cell: ({ row }) => <EntityCell icon={<UserIcon />} title={buyerName(row.original)} subtitle={row.original.buyerId.slice(0, 8).toUpperCase()} />,
      },
      {
        id: "id",
        header: "ID document",
        accessorFn: (b) => b.documentType ?? "",
        cell: ({ row }) => {
          const b = row.original;
          return b.documentType ? `${ID_LABEL[b.documentType.toUpperCase()] ?? humanize(b.documentType)}${b.issuingCountry ? ` · ${b.issuingCountry}` : ""}` : <span className="text-muted-foreground">None yet</span>;
        },
      },
      {
        id: "verification",
        header: "Verification",
        accessorFn: (b) => b.verificationStatus,
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge value={row.original.verificationStatus} />
            {row.original.requiresReverification && <Badge tone="warning">Re-verify</Badge>}
          </span>
        ),
      },
      { id: "account", header: "Account", accessorFn: (b) => b.orgStatus, cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      {
        id: "submitted",
        header: "Submitted",
        accessorFn: (b) => b.submittedAtUtc ?? "",
        cell: ({ row }) => (row.original.submittedAtUtc ? `${formatDateTime(row.original.submittedAtUtc)} (${ageSince(row.original.submittedAtUtc)})` : "—"),
      },
      {
        id: "deadline",
        header: "Review deadline",
        accessorFn: (b) => b.reviewDeadlineUtc ?? "",
        cell: ({ row }) =>
          row.original.reviewDeadlineUtc ? formatDateTime(row.original.reviewDeadlineUtc) : row.original.reviewSlaStatus === "CALENDAR_COVERAGE_MISSING" ? <span className="text-warning">Unavailable</span> : "—",
      },
      { id: "sla", header: "SLA", accessorFn: (b) => (b.isOverdue ? "0" : "1") + (b.reviewSlaStatus ?? ""), cell: ({ row }) => <SlaBadge b={row.original} /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowAction label={canDecideBuyer(row.original) ? "Review buyer" : "View buyer"} onClick={() => review.openReview(row.original)}>
              <SealCheckIcon />
            </RowAction>
          </div>
        ),
      },
    ],
    [review],
  );

  const count = (pred: (b: AdminBuyerListItemDto) => boolean) => formatNumber(buyers.filter(pred).length);
  const loading = query.isLoading;
  const unavailable = query.error ? "Unavailable" : undefined;

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Buyers"
        description="Verify buyers' identity documents. One approved ID (Emirates ID, passport or national ID) is required before a buyer can purchase."
        actions={<ExportButton onExport={() => exportRows(filtered)} disabled={!filtered.length} />}
      />
      <StatCards
        className="mb-4"
        items={[
          { label: "Buyers", value: formatNumber(buyers.length), hint: "Buyer profiles", icon: <ShoppingCartIcon />, loading, unavailable },
          {
            label: "Awaiting review",
            value: count((b) => matchesTab(b, "review")),
            hint: buyers.some((b) => b.isOverdue && matchesTab(b, "review")) ? `${buyers.filter((b) => b.isOverdue && matchesTab(b, "review")).length} overdue` : "Target: 2 UAE business days",
            hintTone: buyers.some((b) => b.isOverdue && matchesTab(b, "review")) ? "danger" : undefined,
            icon: <HourglassIcon />,
            loading,
            unavailable,
          },
          { label: "Verified", value: count((b) => matchesTab(b, "verified")), hint: "Can purchase", hintTone: "success", icon: <SealCheckIcon />, loading, unavailable },
          { label: "Re-verification", value: count((b) => b.requiresReverification), hint: "Previously verified, must resubmit", icon: <ArrowsClockwiseIcon />, loading, unavailable },
        ]}
      />
      <SectionCard>
        <FilterPills
          label="Buyer status"
          value={state.tab}
          onChange={(tab) => setState({ tab })}
          items={TABS.map((t) => ({ value: t.value, label: t.label, count: query.data ? buyers.filter((b) => matchesTab(b, t.value)).length : undefined, highlight: t.value === "review" }))}
        />
        <div className="pt-3">
          <Toolbar
            left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search buyers..." />}
            right={<RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />}
          />
          <DataTable
            caption="Buyers"
            columns={columns}
            data={filtered}
            getRowId={(b) => b.buyerId}
            isLoading={loading}
            isFetching={query.isFetching && !loading}
            error={query.error}
            onRetry={() => query.refetch()}
            onRowClick={(b) => review.openReview(b)}
            emptyTitle={buyers.length ? "No buyers in this view" : "No buyers yet"}
            emptyDescription={buyers.length ? "Try another tab or clear the search." : "Buyers appear here once they create a buyer profile."}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Open a buyer to see their identity details, open the private ID file, verify or reject it, then approve or reject the buyer. Verified buyers stay verified after their ID expires until you suspend them.
          </p>
        </div>
      </SectionCard>
      {review.element}
    </>
  );
}

export default function BuyersPage() {
  return (
    <RequirePermission permission={P.BUYERS_VIEW}>
      <BuyersContent />
    </RequirePermission>
  );
}
