import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircleIcon, ProhibitIcon, RankingIcon, SealIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards } from "@/components/common/stat-cards";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { ExportButton } from "@/components/common/export-button";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { CATALOG_TAXONOMY_PERMISSIONS as CT, type ConditionResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { formatNumber } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { catalogKeys, useConditionsQuery, useGradesQuery } from "./lib/queries";
import { useCatalogMutation } from "./lib/use-catalog-mutation";
import { CreateButton, EntityRowActions, StatusFilter, ToggleActiveDialog, matchesStatus, statUnavailable, statusValue } from "./components/shared";
import { ConditionGradeFormDialog } from "./components/condition-grade-form-dialog";
import { ConditionGradesDialog } from "./components/condition-grades-dialog";

function ConditionsContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ q: "", status: "" });
  const query = useConditionsQuery();
  const canGrades = can(CT.gradesView);
  const gradesQuery = useGradesQuery(canGrades);
  const conditions = React.useMemo(() => query.data ?? [], [query.data]);
  const [form, setForm] = React.useState<{ id: string | null } | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);
  const [gradesId, setGradesId] = React.useState<string | null>(null);
  const find = (id: string | null | undefined) => (id ? (conditions.find((c) => c.conditionId === id) ?? null) : null);
  const editing = find(form?.id);
  const toggleTarget = find(toggleId);
  const gradesTarget = find(gradesId);

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return conditions.filter((c) => matchesStatus(c.isActive, state.status) && (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)));
  }, [conditions, state.q, state.status]);

  const toggle = useCatalogMutation({
    mutationFn: (c: ConditionResponse) => (c.isActive ? catalogService.deactivateCondition(c.conditionId, c.version) : catalogService.reactivateCondition(c.conditionId, c.version)),
    invalidate: [catalogKeys.conditions, catalogKeys.categories],
    refetchOnConflict: [catalogKeys.conditions],
    successMessage: (c) => `Condition "${c.name}" ${c.isActive ? "reactivated" : "deactivated"}.`,
    onSuccess: () => setToggleId(null),
  });

  const exportRows = (rows: ConditionResponse[]) =>
    downloadCsv(
      `conditions-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { header: "Condition ID", value: (c) => c.conditionId },
        { header: "Code", value: (c) => c.code },
        { header: "Name", value: (c) => c.name },
        { header: "Description", value: (c) => c.description },
        { header: "Display order", value: (c) => c.displayOrder },
        { header: "Status", value: (c) => statusValue(c.isActive) },
        { header: "Version", value: (c) => c.version },
      ]),
    );

  const columns = React.useMemo<ColumnDef<ConditionResponse, unknown>[]>(
    () => [
      { id: "name", header: "Condition", accessorFn: (c) => c.name, cell: ({ row }) => <EntityCell icon={<SealIcon />} title={row.original.name} subtitle={row.original.code} /> },
      {
        id: "description",
        header: "Description",
        accessorFn: (c) => c.description ?? "",
        cell: ({ row }) => <span className="block max-w-[360px] truncate text-muted-foreground">{row.original.description || "—"}</span>,
      },
      { id: "order", header: "Display order", accessorFn: (c) => c.displayOrder },
      { id: "status", header: "Status", accessorFn: (c) => statusValue(c.isActive), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityRowActions
            name={row.original.name}
            isActive={row.original.isActive}
            canEdit={can(CT.conditionsUpdate)}
            canDeactivate={can(CT.conditionsDeactivate)}
            canReactivate={can(CT.conditionsReactivate)}
            onEdit={() => setForm({ id: row.original.conditionId })}
            onToggle={() => setToggleId(row.original.conditionId)}
          >
            <RowAction label={`${can(CT.conditionsUpdate) ? "Manage" : "View"} grades of ${row.original.name}`} onClick={() => setGradesId(row.original.conditionId)}>
              <RankingIcon />
            </RowAction>
          </EntityRowActions>
        ),
      },
    ],
    [can],
  );

  const loading = query.isLoading;
  const unavailable = statUnavailable(true, query.error);
  const active = conditions.filter((c) => c.isActive).length;

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Conditions"
        description="Item conditions (new, used, refurbished…) and the grades available for each."
        actions={
          <>
            <ExportButton onExport={() => exportRows(filtered)} disabled={!filtered.length} />
            {can(CT.conditionsCreate) && <CreateButton onClick={() => setForm({ id: null })}>Create Condition</CreateButton>}
          </>
        }
      />
      <StatCards
        className="mb-4"
        items={[
          { label: "Conditions", value: formatNumber(conditions.length), hint: "All conditions", icon: <SealIcon />, loading, unavailable },
          { label: "Active", value: formatNumber(active), hint: "Assignable to categories", hintTone: "success", icon: <CheckCircleIcon />, loading, unavailable },
          { label: "Inactive", value: formatNumber(conditions.length - active), hint: "Not assignable", icon: <ProhibitIcon />, loading, unavailable },
          {
            label: "Active grades",
            value: formatNumber(gradesQuery.data?.filter((g) => g.isActive).length),
            hint: "Grades available for mapping",
            icon: <RankingIcon />,
            loading: canGrades && gradesQuery.isLoading,
            unavailable: statUnavailable(canGrades, gradesQuery.error),
          },
        ]}
      />
      <SectionCard>
        <Toolbar
          left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search conditions..." />}
          right={
            <>
              <StatusFilter value={state.status} onChange={(status) => setState({ status })} />
              <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
            </>
          }
        />
        <DataTable
          caption="Conditions"
          columns={columns}
          data={filtered}
          getRowId={(c) => c.conditionId}
          isLoading={loading}
          isFetching={query.isFetching && !loading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle={conditions.length ? "No conditions match these filters" : "No conditions yet"}
          emptyDescription={conditions.length ? "Clear the search or status filter." : "Create the first condition, then map grades to it."}
        />
        <p className="mt-3 text-xs text-muted-foreground">The API does not check category usage when a condition is deactivated.</p>
      </SectionCard>

      <ConditionGradeFormDialog kind="condition" open={form !== null && (form.id === null || editing !== null)} entity={editing} onOpenChange={(o) => !o && setForm(null)} />
      <ConditionGradesDialog condition={gradesTarget} onOpenChange={(o) => !o && setGradesId(null)} />
      <ToggleActiveDialog target={toggleTarget} entity="condition" loading={toggle.isPending} onClose={() => setToggleId(null)} onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)} />
    </>
  );
}

export default function ConditionsPage() {
  return (
    <RequirePermission permission={CT.conditionsView}>
      <ConditionsContent />
    </RequirePermission>
  );
}
