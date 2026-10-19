import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircleIcon, ProhibitIcon, RulerIcon, ShapesIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards } from "@/components/common/stat-cards";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { ExportButton } from "@/components/common/export-button";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { NativeSelect } from "@/components/ui/input";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { CATALOG_TAXONOMY_PERMISSIONS as CT, UNIT_TYPES, type UnitResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { formatDateTime, formatNumber, humanize } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { catalogKeys, useUnitsQuery } from "./lib/queries";
import { useCatalogMutation } from "./lib/use-catalog-mutation";
import { CreateButton, EntityRowActions, StatusFilter, ToggleActiveDialog, matchesStatus, statUnavailable, statusValue } from "./components/shared";
import { UnitFormDialog } from "./components/unit-form-dialog";

function UnitsContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ q: "", status: "", type: "" });
  const query = useUnitsQuery();
  const units = React.useMemo(() => query.data ?? [], [query.data]);
  const [form, setForm] = React.useState<{ id: string | null } | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);
  const editing = form?.id ? (units.find((u) => u.unitId === form.id) ?? null) : null;
  const toggleTarget = toggleId ? (units.find((u) => u.unitId === toggleId) ?? null) : null;

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return units.filter(
      (u) =>
        matchesStatus(u.isActive, state.status) &&
        (!state.type || u.unitType === state.type) &&
        (!q || u.name.toLowerCase().includes(q) || u.code.toLowerCase().includes(q) || u.symbol.toLowerCase().includes(q)),
    );
  }, [units, state.q, state.status, state.type]);

  const toggle = useCatalogMutation({
    mutationFn: (u: UnitResponse) => (u.isActive ? catalogService.deactivateUnit(u.unitId, u.version) : catalogService.reactivateUnit(u.unitId, u.version)),
    invalidate: [catalogKeys.units, catalogKeys.categories],
    refetchOnConflict: [catalogKeys.units],
    successMessage: (u) => `Unit "${u.name}" ${u.isActive ? "reactivated" : "deactivated"}.`,
    onSuccess: () => setToggleId(null),
  });

  const exportRows = (rows: UnitResponse[]) =>
    downloadCsv(
      `units-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { header: "Unit ID", value: (u) => u.unitId },
        { header: "Code", value: (u) => u.code },
        { header: "Name", value: (u) => u.name },
        { header: "Symbol", value: (u) => u.symbol },
        { header: "Type", value: (u) => u.unitType },
        { header: "Decimal precision", value: (u) => u.decimalPrecision },
        { header: "Description", value: (u) => u.description },
        { header: "Status", value: (u) => statusValue(u.isActive) },
        { header: "Version", value: (u) => u.version },
        { header: "Updated (UTC)", value: (u) => u.updatedAtUtc ?? u.createdAtUtc },
      ]),
    );

  const columns = React.useMemo<ColumnDef<UnitResponse, unknown>[]>(
    () => [
      { id: "name", header: "Unit", accessorFn: (u) => u.name, cell: ({ row }) => <EntityCell icon={<RulerIcon />} title={row.original.name} subtitle={row.original.code} /> },
      { id: "symbol", header: "Symbol", accessorFn: (u) => u.symbol, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
      { id: "type", header: "Type", accessorFn: (u) => u.unitType, cell: ({ getValue }) => humanize(getValue() as string) },
      { id: "precision", header: "Decimals", accessorFn: (u) => u.decimalPrecision },
      { id: "status", header: "Status", accessorFn: (u) => statusValue(u.isActive), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "updated", header: "Last updated", accessorFn: (u) => u.updatedAtUtc ?? u.createdAtUtc, cell: ({ getValue }) => formatDateTime(getValue() as string) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityRowActions
            name={row.original.name}
            isActive={row.original.isActive}
            canEdit={can(CT.unitsUpdate)}
            canDeactivate={can(CT.unitsDeactivate)}
            canReactivate={can(CT.unitsReactivate)}
            onEdit={() => setForm({ id: row.original.unitId })}
            onToggle={() => setToggleId(row.original.unitId)}
          />
        ),
      },
    ],
    [can],
  );

  const loading = query.isLoading;
  const unavailable = statUnavailable(true, query.error);
  const active = units.filter((u) => u.isActive).length;
  const typesInUse = new Set(units.map((u) => u.unitType)).size;

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Units"
        description="Units of measure sellers use for listing quantities."
        actions={
          <>
            <ExportButton onExport={() => exportRows(filtered)} disabled={!filtered.length} />
            {can(CT.unitsCreate) && <CreateButton onClick={() => setForm({ id: null })}>Create unit</CreateButton>}
          </>
        }
      />
      <StatCards
        className="mb-4"
        items={[
          { label: "Units", value: formatNumber(units.length), hint: "All units of measure", icon: <RulerIcon />, loading, unavailable },
          { label: "Active", value: formatNumber(active), hint: "Assignable to categories", hintTone: "success", icon: <CheckCircleIcon />, loading, unavailable },
          { label: "Inactive", value: formatNumber(units.length - active), hint: "Not assignable", icon: <ProhibitIcon />, loading, unavailable },
          { label: "Unit types used", value: `${formatNumber(typesInUse)} / ${UNIT_TYPES.length}`, hint: "Distinct unit types", icon: <ShapesIcon />, loading, unavailable },
        ]}
      />
      <SectionCard>
        <Toolbar
          left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search units..." />}
          right={
            <>
              <NativeSelect className="h-[38px] w-40" value={state.type} onChange={(e) => setState({ type: e.target.value })} aria-label="Unit type">
                <option value="">All types</option>
                {UNIT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </NativeSelect>
              <StatusFilter value={state.status} onChange={(status) => setState({ status })} />
              <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
            </>
          }
        />
        <DataTable
          caption="Units"
          columns={columns}
          data={filtered}
          getRowId={(u) => u.unitId}
          isLoading={loading}
          isFetching={query.isFetching && !loading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle={units.length ? "No units match these filters" : "No units yet"}
          emptyDescription={units.length ? "Clear the search or filters." : "Create the first unit of measure."}
        />
      </SectionCard>

      <UnitFormDialog open={form !== null && (form.id === null || editing !== null)} unit={editing} onOpenChange={(o) => !o && setForm(null)} />
      <ToggleActiveDialog target={toggleTarget} entity="unit" loading={toggle.isPending} onClose={() => setToggleId(null)} onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)} />
    </>
  );
}

export default function UnitsPage() {
  return (
    <RequirePermission permission={CT.unitsView}>
      <UnitsContent />
    </RequirePermission>
  );
}
