import * as React from "react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ProhibitIcon, SealCheckIcon, StorefrontIcon, WarningCircleIcon, XIcon, HourglassIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards } from "@/components/common/stat-cards";
import { SectionCard, Toolbar, RefreshButton, RowAction, BulkBar, BulkButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { ExportButton } from "@/components/common/export-button";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { NativeSelect } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { sellersService } from "@/services/sellers.service";
import { PERMISSIONS as P, type MarketplaceSellerDto } from "@/api/types/user-organization";
import { formatDateTime, formatNumber, humanize } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";

const TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending KYC" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function matchesTab(s: MarketplaceSellerDto, tab: TabValue): boolean {
  switch (tab) {
    case "pending":
      return s.verificationStatus === "PENDING";
    case "verified":
      return s.verificationStatus === "VERIFIED";
    case "rejected":
      return s.verificationStatus === "REJECTED";
    case "suspended":
      return s.status === "SUSPENDED";
    default:
      return true;
  }
}

/** verify/reject are allowed only while PENDING and SUBMITTED/UNDER_REVIEW (backend state machine). */
const canReview = (s: MarketplaceSellerDto) => s.verificationStatus === "PENDING" && (s.onboardingStatus === "SUBMITTED" || s.onboardingStatus === "UNDER_REVIEW");

type PendingAction = { kind: "APPROVE" | "REJECT" | "SUSPEND"; seller: MarketplaceSellerDto } | null;

export const sellersKeys = { all: ["sellers"] as const };

export function useSellersQuery(enabled = true) {
  return useQuery({ queryKey: sellersKeys.all, queryFn: ({ signal }) => sellersService.list(signal), enabled });
}

function SellersContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ tab: "all", q: "", type: "" });
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [pending, setPending] = React.useState<PendingAction>(null);
  const query = useSellersQuery();
  const sellers = React.useMemo(() => query.data ?? [], [query.data]);

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return sellers.filter(
      (s) =>
        matchesTab(s, state.tab as TabValue) &&
        (!state.type || s.organizationType === state.type) &&
        (!q || (s.displayName ?? "").toLowerCase().includes(q) || s.sellerId.toLowerCase().includes(q)),
    );
  }, [sellers, state.tab, state.type, state.q]);

  const action = useApiMutation({
    mutationFn: (a: NonNullable<PendingAction>) =>
      a.kind === "SUSPEND" ? sellersService.suspend(a.seller.sellerId, a.seller.rowVersion) : sellersService.review(a.seller.sellerId, a.kind, a.seller.rowVersion),
    invalidate: [sellersKeys.all],
    successMessage: (_d, a) => `${a.seller.displayName ?? "Seller"} ${a.kind === "APPROVE" ? "verified" : a.kind === "REJECT" ? "rejected" : "suspended"}.`,
    onSuccess: () => setPending(null),
  });

  const selectedRows = filtered.filter((s) => selection[s.sellerId]);

  const exportRows = (rows: MarketplaceSellerDto[]) =>
    downloadCsv(
      `sellers-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { header: "Seller ID", value: (s) => s.sellerId },
        { header: "Name", value: (s) => s.displayName },
        { header: "Type", value: (s) => s.organizationType },
        { header: "Status", value: (s) => s.status },
        { header: "Verification", value: (s) => s.verificationStatus },
        { header: "Onboarding", value: (s) => s.onboardingStatus },
        { header: "Submitted (UTC)", value: (s) => s.submittedAtUtc },
        { header: "Verified (UTC)", value: (s) => s.verifiedAtUtc },
      ]),
    );

  const columns = React.useMemo<ColumnDef<MarketplaceSellerDto, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Organisation",
        accessorFn: (s) => s.displayName ?? "",
        cell: ({ row }) => <EntityCell icon={<StorefrontIcon />} title={row.original.displayName || "Unnamed seller"} subtitle={row.original.sellerId.slice(0, 8).toUpperCase()} />,
      },
      { id: "type", header: "Type", accessorFn: (s) => s.organizationType, cell: ({ getValue }) => humanize(getValue() as string) },
      { id: "verification", header: "KYC", accessorFn: (s) => s.verificationStatus, cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "onboarding", header: "Onboarding", accessorFn: (s) => s.onboardingStatus, cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "status", header: "Status", accessorFn: (s) => s.status, cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "submitted", header: "Submitted", accessorFn: (s) => s.submittedAtUtc ?? "", cell: ({ row }) => formatDateTime(row.original.submittedAtUtc) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original;
          const reviewable = canReview(s);
          return (
            <div className="flex justify-end gap-1.5">
              {can(P.SELLERS_REJECT) && reviewable && (
                <RowAction label="Reject KYC" tone="danger" onClick={() => setPending({ kind: "REJECT", seller: s })}>
                  <XIcon />
                </RowAction>
              )}
              {can(P.SELLERS_VERIFY) && reviewable && (
                <RowAction label="Approve KYC" tone="success" onClick={() => setPending({ kind: "APPROVE", seller: s })}>
                  <CheckIcon />
                </RowAction>
              )}
              {can(P.SELLERS_SUSPEND) && s.status === "ACTIVE" && (
                <RowAction label="Suspend seller" tone="danger" onClick={() => setPending({ kind: "SUSPEND", seller: s })}>
                  <ProhibitIcon />
                </RowAction>
              )}
            </div>
          );
        },
      },
    ],
    [can],
  );

  const count = (pred: (s: MarketplaceSellerDto) => boolean) => formatNumber(sellers.filter(pred).length);
  const loading = query.isLoading;

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Sellers"
        description="Onboard, verify, monitor and support organisations selling surplus material."
        actions={<ExportButton onExport={() => exportRows(filtered)} disabled={!filtered.length} />}
      />
      <StatCards
        className="mb-4"
        items={[
          { label: "Sellers", value: formatNumber(sellers.length), hint: "All registered sellers", icon: <StorefrontIcon />, loading, unavailable: query.error ? "Unavailable" : undefined },
          { label: "Verified", value: count((s) => s.verificationStatus === "VERIFIED"), hint: "KYC approved", hintTone: "success", icon: <SealCheckIcon />, loading, unavailable: query.error ? "Unavailable" : undefined },
          { label: "Pending KYC", value: count(canReview), hint: "Awaiting review", icon: <HourglassIcon />, loading, unavailable: query.error ? "Unavailable" : undefined },
          { label: "Suspended", value: count((s) => s.status === "SUSPENDED"), hint: "Restricted from selling", icon: <WarningCircleIcon />, loading, unavailable: query.error ? "Unavailable" : undefined },
        ]}
      />
      <SectionCard>
        <Tabs value={state.tab} onValueChange={(tab) => { setSelection({}); setState({ tab }); }}>
          <TabsList aria-label="Seller status">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="pt-4">
          <Toolbar
            left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search sellers..." />}
            right={
              <>
                <NativeSelect className="h-[38px] w-40" value={state.type} onChange={(e) => setState({ type: e.target.value })} aria-label="Seller type">
                  <option value="">All types</option>
                  <option value="BUSINESS">Business</option>
                  <option value="INDIVIDUAL">Individual</option>
                </NativeSelect>
                <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
              </>
            }
          />
          <BulkBar count={selectedRows.length} total={filtered.length} onClear={() => setSelection({})}>
            <BulkButton onClick={() => exportRows(selectedRows)}>Export Selected</BulkButton>
          </BulkBar>
          <DataTable
            caption="Sellers"
            columns={columns}
            data={filtered}
            getRowId={(s) => s.sellerId}
            isLoading={loading}
            isFetching={query.isFetching && !loading}
            error={query.error}
            onRetry={() => query.refetch()}
            selectable
            rowSelection={selection}
            onRowSelectionChange={setSelection}
            emptyTitle={sellers.length ? "No sellers match these filters" : "No sellers yet"}
            emptyDescription={sellers.length ? "Try another tab or clear the search." : "Sellers appear here once they register on the marketplace."}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            The seller list endpoint returns status fields only; contact details, documents and GMV are not exposed to admins by the current API.
          </p>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === "APPROVE" ? "Approve seller KYC?" : pending?.kind === "REJECT" ? "Reject seller KYC?" : "Suspend seller?"}
        description={
          pending?.kind === "APPROVE"
            ? `${pending.seller.displayName ?? "This seller"} will be marked verified and onboarding completed.`
            : pending?.kind === "REJECT"
              ? `${pending?.seller.displayName ?? "This seller"} will be marked rejected and returned to draft so they can resubmit.`
              : `${pending?.seller.displayName ?? "This seller"} will be suspended. There is currently no API to reinstate a suspended seller.`
        }
        confirmLabel={pending?.kind === "APPROVE" ? "Approve" : pending?.kind === "REJECT" ? "Reject" : "Suspend"}
        tone={pending?.kind === "APPROVE" ? "primary" : "danger"}
        loading={action.isPending}
        onConfirm={() => pending && action.mutate(pending)}
      />
    </>
  );
}

export default function SellersPage() {
  return (
    <RequirePermission permission={P.SELLERS_VIEW}>
      <SellersContent />
    </RequirePermission>
  );
}
