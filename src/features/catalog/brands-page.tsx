import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircleIcon, ProhibitIcon, TagIcon, TagSimpleIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards } from "@/components/common/stat-cards";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { ExportButton } from "@/components/common/export-button";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { CATALOG_TAXONOMY_PERMISSIONS as CT, type BrandResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { catalogKeys, useBrandsQuery } from "./lib/queries";
import { useCatalogMutation } from "./lib/use-catalog-mutation";
import { CreateButton, EntityRowActions, StatusFilter, ToggleActiveDialog, matchesStatus, statUnavailable, statusValue } from "./components/shared";
import { BrandFormDialog } from "./components/brand-form-dialog";

function BrandsContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ q: "", status: "" });
  const query = useBrandsQuery();
  const brands = React.useMemo(() => query.data ?? [], [query.data]);
  const [form, setForm] = React.useState<{ id: string | null } | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);

  const editing = form?.id ? (brands.find((b) => b.brandId === form.id) ?? null) : null;
  const toggleTarget = toggleId ? (brands.find((b) => b.brandId === toggleId) ?? null) : null;

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return brands.filter(
      (b) => matchesStatus(b.isActive, state.status) && (!q || b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || (b.description ?? "").toLowerCase().includes(q)),
    );
  }, [brands, state.q, state.status]);

  const toggle = useCatalogMutation({
    mutationFn: (b: BrandResponse) => (b.isActive ? catalogService.deactivateBrand(b.brandId, b.version) : catalogService.reactivateBrand(b.brandId, b.version)),
    invalidate: [catalogKeys.brands, catalogKeys.categories],
    refetchOnConflict: [catalogKeys.brands],
    successMessage: (b) => `Brand "${b.name}" ${b.isActive ? "reactivated" : "deactivated"}.`,
    onSuccess: () => setToggleId(null),
  });

  const exportRows = (rows: BrandResponse[]) =>
    downloadCsv(
      `brands-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { header: "Brand ID", value: (b) => b.brandId },
        { header: "Code", value: (b) => b.code },
        { header: "Name", value: (b) => b.name },
        { header: "Description", value: (b) => b.description },
        { header: "Status", value: (b) => statusValue(b.isActive) },
        { header: "Version", value: (b) => b.version },
        { header: "Created (UTC)", value: (b) => b.createdAtUtc },
        { header: "Updated (UTC)", value: (b) => b.updatedAtUtc },
      ]),
    );

  const columns = React.useMemo<ColumnDef<BrandResponse, unknown>[]>(
    () => [
      { id: "name", header: "Brand", accessorFn: (b) => b.name, cell: ({ row }) => <EntityCell icon={<TagIcon />} title={row.original.name} subtitle={row.original.code} /> },
      {
        id: "description",
        header: "Description",
        accessorFn: (b) => b.description ?? "",
        cell: ({ row }) => <span className="block max-w-[360px] truncate text-muted-foreground">{row.original.description || "—"}</span>,
      },
      { id: "status", header: "Status", accessorFn: (b) => statusValue(b.isActive), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "updated", header: "Last updated", accessorFn: (b) => b.updatedAtUtc ?? b.createdAtUtc, cell: ({ getValue }) => formatDateTime(getValue() as string) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityRowActions
            name={row.original.name}
            isActive={row.original.isActive}
            canEdit={can(CT.brandsUpdate)}
            canDeactivate={can(CT.brandsDeactivate)}
            canReactivate={can(CT.brandsReactivate)}
            onEdit={() => setForm({ id: row.original.brandId })}
            onToggle={() => setToggleId(row.original.brandId)}
          />
        ),
      },
    ],
    [can],
  );

  const loading = query.isLoading;
  const unavailable = statUnavailable(true, query.error);
  const active = brands.filter((b) => b.isActive).length;

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Brands"
        description="Manufacturer and product brands that sellers can choose for listings in assigned categories."
        actions={
          <>
            <ExportButton onExport={() => exportRows(filtered)} disabled={!filtered.length} />
            {can(CT.brandsCreate) && <CreateButton onClick={() => setForm({ id: null })}>Create brand</CreateButton>}
          </>
        }
      />
      <StatCards
        className="mb-4"
        items={[
          { label: "Brands", value: formatNumber(brands.length), hint: "All brands", icon: <TagSimpleIcon />, loading, unavailable },
          { label: "Active", value: formatNumber(active), hint: "Available to sellers", hintTone: "success", icon: <CheckCircleIcon />, loading, unavailable },
          { label: "Inactive", value: formatNumber(brands.length - active), hint: "Hidden from new listings", icon: <ProhibitIcon />, loading, unavailable },
          {
            label: "With description",
            value: formatNumber(brands.filter((b) => Boolean(b.description)).length),
            hint: "Brands with a description",
            icon: <TagIcon />,
            loading,
            unavailable,
          },
        ]}
      />
      <SectionCard>
        <Toolbar
          left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search brands..." />}
          right={
            <>
              <StatusFilter value={state.status} onChange={(status) => setState({ status })} />
              <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
            </>
          }
        />
        <DataTable
          caption="Brands"
          columns={columns}
          data={filtered}
          getRowId={(b) => b.brandId}
          isLoading={loading}
          isFetching={query.isFetching && !loading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle={brands.length ? "No brands match these filters" : "No brands yet"}
          emptyDescription={brands.length ? "Clear the search or status filter." : "Create the first brand to make it assignable to categories."}
        />
      </SectionCard>

      <BrandFormDialog open={form !== null && (form.id === null || editing !== null)} brand={editing} onOpenChange={(o) => !o && setForm(null)} />
      <ToggleActiveDialog
        target={toggleTarget}
        entity="brand"
        loading={toggle.isPending}
        onClose={() => setToggleId(null)}
        onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)}
      />
    </>
  );
}

export default function BrandsPage() {
  return (
    <RequirePermission permission={CT.brandsView}>
      <BrandsContent />
    </RequirePermission>
  );
}
