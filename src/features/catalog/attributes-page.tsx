import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircleIcon, ListBulletsIcon, ProhibitIcon, SlidersHorizontalIcon, TextAaIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards } from "@/components/common/stat-cards";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { ExportButton } from "@/components/common/export-button";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import {
  ATTRIBUTE_DATA_TYPES,
  ATTRIBUTE_OPTION_DATA_TYPES,
  CATALOG_TAXONOMY_PERMISSIONS as CT,
  type AdminAttributeDefinitionResponse,
  type AttributeDataType,
} from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { formatDateTime, formatNumber, humanize } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { catalogKeys, useAttributesQuery } from "./lib/queries";
import { useCatalogMutation } from "./lib/use-catalog-mutation";
import { CreateButton, EntityRowActions, StatusFilter, ToggleActiveDialog, matchesStatus, statUnavailable, statusValue } from "./components/shared";
import { AttributeFormDialog } from "./components/attribute-form-dialog";
import { AttributeOptionsDialog } from "./components/attribute-options-dialog";

const isSelectType = (t: AttributeDataType) => (ATTRIBUTE_OPTION_DATA_TYPES as readonly string[]).includes(t);

function constraintSummary(a: AdminAttributeDefinitionResponse): string {
  const parts: string[] = [];
  if (a.minLength !== null || a.maxLength !== null) parts.push(`length ${a.minLength ?? 0}–${a.maxLength ?? "∞"}`);
  if (a.minValue !== null || a.maxValue !== null) parts.push(`value ${a.minValue ?? "−∞"}–${a.maxValue ?? "∞"}`);
  if (a.decimalPrecision !== null) parts.push(`${a.decimalPrecision} decimals`);
  if (a.regexPattern) parts.push(`pattern /${a.regexPattern}/`);
  return parts.join(" · ");
}

function AttributesContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ q: "", status: "", type: "" });
  const query = useAttributesQuery();
  const attributes = React.useMemo(() => query.data ?? [], [query.data]);
  const [form, setForm] = React.useState<{ id: string | null } | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);
  const [optionsId, setOptionsId] = React.useState<string | null>(null);
  const find = (id: string | null | undefined) => (id ? (attributes.find((a) => a.attributeDefinitionId === id) ?? null) : null);
  const editing = find(form?.id);
  const toggleTarget = find(toggleId);
  const optionsTarget = find(optionsId);

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return attributes.filter(
      (a) => matchesStatus(a.isActive, state.status) && (!state.type || a.dataType === state.type) && (!q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)),
    );
  }, [attributes, state.q, state.status, state.type]);

  const toggle = useCatalogMutation({
    mutationFn: (a: AdminAttributeDefinitionResponse) =>
      a.isActive ? catalogService.deactivateAttribute(a.attributeDefinitionId, a.version) : catalogService.reactivateAttribute(a.attributeDefinitionId, a.version),
    invalidate: [catalogKeys.attributes, catalogKeys.categories],
    refetchOnConflict: [catalogKeys.attributes],
    successMessage: (a) => `Attribute "${a.name}" ${a.isActive ? "reactivated" : "deactivated"}.`,
    onSuccess: () => setToggleId(null),
  });

  const exportRows = (rows: AdminAttributeDefinitionResponse[]) =>
    downloadCsv(
      `attributes-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { header: "Attribute ID", value: (a) => a.attributeDefinitionId },
        { header: "Code", value: (a) => a.code },
        { header: "Name", value: (a) => a.name },
        { header: "Data type", value: (a) => a.dataType },
        { header: "Description", value: (a) => a.description },
        { header: "Min length", value: (a) => a.minLength },
        { header: "Max length", value: (a) => a.maxLength },
        { header: "Min value", value: (a) => a.minValue },
        { header: "Max value", value: (a) => a.maxValue },
        { header: "Decimal precision", value: (a) => a.decimalPrecision },
        { header: "Regex pattern", value: (a) => a.regexPattern },
        { header: "Status", value: (a) => statusValue(a.isActive) },
        { header: "Version", value: (a) => a.version },
      ]),
    );

  const columns = React.useMemo<ColumnDef<AdminAttributeDefinitionResponse, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Attribute",
        accessorFn: (a) => a.name,
        cell: ({ row }) => <EntityCell icon={<SlidersHorizontalIcon />} title={row.original.name} subtitle={row.original.code} />,
      },
      { id: "type", header: "Data type", accessorFn: (a) => a.dataType, cell: ({ getValue }) => <Badge tone="outline">{humanize(getValue() as string)}</Badge> },
      {
        id: "rules",
        header: "Validation",
        enableSorting: false,
        accessorFn: (a) => constraintSummary(a),
        cell: ({ getValue }) => <span className="block max-w-[280px] truncate text-muted-foreground">{(getValue() as string) || "—"}</span>,
      },
      { id: "status", header: "Status", accessorFn: (a) => statusValue(a.isActive), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "updated", header: "Last updated", accessorFn: (a) => a.updatedAtUtc ?? a.createdAtUtc, cell: ({ getValue }) => formatDateTime(getValue() as string) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityRowActions
            name={row.original.name}
            isActive={row.original.isActive}
            canEdit={can(CT.attributesUpdate)}
            canDeactivate={can(CT.attributesDeactivate)}
            canReactivate={can(CT.attributesReactivate)}
            onEdit={() => setForm({ id: row.original.attributeDefinitionId })}
            onToggle={() => setToggleId(row.original.attributeDefinitionId)}
          >
            {isSelectType(row.original.dataType) && (
              <RowAction label={`Options of ${row.original.name}`} onClick={() => setOptionsId(row.original.attributeDefinitionId)}>
                <ListBulletsIcon />
              </RowAction>
            )}
          </EntityRowActions>
        ),
      },
    ],
    [can],
  );

  const loading = query.isLoading;
  const unavailable = statUnavailable(true, query.error);
  const active = attributes.filter((a) => a.isActive).length;

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Attributes"
        description="Listing attributes, their validation rules and selectable options."
        actions={
          <>
            <ExportButton onExport={() => exportRows(filtered)} disabled={!filtered.length} />
            {can(CT.attributesCreate) && <CreateButton onClick={() => setForm({ id: null })}>Create Attribute</CreateButton>}
          </>
        }
      />
      <StatCards
        className="mb-4"
        items={[
          { label: "Attributes", value: formatNumber(attributes.length), hint: "All attribute definitions", icon: <SlidersHorizontalIcon />, loading, unavailable },
          { label: "Active", value: formatNumber(active), hint: "Assignable to categories", hintTone: "success", icon: <CheckCircleIcon />, loading, unavailable },
          { label: "Inactive", value: formatNumber(attributes.length - active), hint: "Deactivated definitions", icon: <ProhibitIcon />, loading, unavailable },
          {
            label: "Select attributes",
            value: formatNumber(attributes.filter((a) => isSelectType(a.dataType)).length),
            hint: "Single/multi-select with options",
            icon: <TextAaIcon />,
            loading,
            unavailable,
          },
        ]}
      />
      <SectionCard>
        <Toolbar
          left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search attributes..." />}
          right={
            <>
              <NativeSelect className="h-[38px] w-44" value={state.type} onChange={(e) => setState({ type: e.target.value })} aria-label="Data type">
                <option value="">All data types</option>
                {ATTRIBUTE_DATA_TYPES.map((t) => (
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
          caption="Attributes"
          columns={columns}
          data={filtered}
          getRowId={(a) => a.attributeDefinitionId}
          isLoading={loading}
          isFetching={query.isFetching && !loading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle={attributes.length ? "No attributes match these filters" : "No attributes yet"}
          emptyDescription={attributes.length ? "Clear the search or filters." : "Create attributes, then assign them to categories."}
        />
        <p className="mt-3 text-xs text-muted-foreground">The API does not check category assignments when an attribute is deactivated.</p>
      </SectionCard>

      <AttributeFormDialog open={form !== null && (form.id === null || editing !== null)} attribute={editing} onOpenChange={(o) => !o && setForm(null)} />
      <AttributeOptionsDialog attribute={optionsTarget} onOpenChange={(o) => !o && setOptionsId(null)} />
      <ToggleActiveDialog target={toggleTarget} entity="attribute" loading={toggle.isPending} onClose={() => setToggleId(null)} onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)} />
    </>
  );
}

export default function AttributesPage() {
  return (
    <RequirePermission permission={CT.attributesView}>
      <AttributesContent />
    </RequirePermission>
  );
}
