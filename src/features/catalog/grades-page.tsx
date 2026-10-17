import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircleIcon, ListNumbersIcon, ProhibitIcon, RankingIcon, SealIcon } from "@phosphor-icons/react";
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
import { CATALOG_TAXONOMY_PERMISSIONS as CT, type GradeResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { formatNumber } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { catalogKeys, useConditionsQuery, useGradesQuery } from "./lib/queries";
import { useCatalogMutation } from "./lib/use-catalog-mutation";
import { CreateButton, EntityRowActions, StatusFilter, ToggleActiveDialog, matchesStatus, statUnavailable, statusValue } from "./components/shared";
import { ConditionGradeFormDialog } from "./components/condition-grade-form-dialog";

function GradesContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ q: "", status: "" });
  const query = useGradesQuery();
  const canConditions = can(CT.conditionsView);
  const conditionsQuery = useConditionsQuery(canConditions);
  const grades = React.useMemo(() => query.data ?? [], [query.data]);
  const [form, setForm] = React.useState<{ id: string | null } | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);
  const editing = form?.id ? (grades.find((g) => g.gradeId === form.id) ?? null) : null;
  const toggleTarget = toggleId ? (grades.find((g) => g.gradeId === toggleId) ?? null) : null;

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return grades.filter((g) => matchesStatus(g.isActive, state.status) && (!q || g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q)));
  }, [grades, state.q, state.status]);

  const toggle = useCatalogMutation({
    mutationFn: (g: GradeResponse) => (g.isActive ? catalogService.deactivateGrade(g.gradeId, g.version) : catalogService.reactivateGrade(g.gradeId, g.version)),
    invalidate: [catalogKeys.grades, catalogKeys.conditions],
    refetchOnConflict: [catalogKeys.grades],
    successMessage: (g) => `Grade "${g.name}" ${g.isActive ? "reactivated" : "deactivated"}.`,
    onSuccess: () => setToggleId(null),
  });

  const exportRows = (rows: GradeResponse[]) =>
    downloadCsv(
      `grades-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { header: "Grade ID", value: (g) => g.gradeId },
        { header: "Code", value: (g) => g.code },
        { header: "Name", value: (g) => g.name },
        { header: "Description", value: (g) => g.description },
        { header: "Display order", value: (g) => g.displayOrder },
        { header: "Status", value: (g) => statusValue(g.isActive) },
        { header: "Version", value: (g) => g.version },
      ]),
    );

  const columns = React.useMemo<ColumnDef<GradeResponse, unknown>[]>(
    () => [
      { id: "name", header: "Grade", accessorFn: (g) => g.name, cell: ({ row }) => <EntityCell icon={<RankingIcon />} title={row.original.name} subtitle={row.original.code} /> },
      {
        id: "description",
        header: "Description",
        accessorFn: (g) => g.description ?? "",
        cell: ({ row }) => <span className="block max-w-[360px] truncate text-muted-foreground">{row.original.description || "—"}</span>,
      },
      { id: "order", header: "Display order", accessorFn: (g) => g.displayOrder },
      { id: "status", header: "Status", accessorFn: (g) => statusValue(g.isActive), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityRowActions
            name={row.original.name}
            isActive={row.original.isActive}
            canEdit={can(CT.gradesUpdate)}
            canDeactivate={can(CT.gradesDeactivate)}
            canReactivate={can(CT.gradesReactivate)}
            onEdit={() => setForm({ id: row.original.gradeId })}
            onToggle={() => setToggleId(row.original.gradeId)}
          />
        ),
      },
    ],
    [can],
  );

  const loading = query.isLoading;
  const unavailable = statUnavailable(true, query.error);
  const active = grades.filter((g) => g.isActive).length;

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Grades"
        description="Quality grades that can be attached to item conditions (for example A, B, C)."
        actions={
          <>
            <ExportButton onExport={() => exportRows(filtered)} disabled={!filtered.length} />
            {can(CT.gradesCreate) && <CreateButton onClick={() => setForm({ id: null })}>Create Grade</CreateButton>}
          </>
        }
      />
      <StatCards
        className="mb-4"
        items={[
          { label: "Grades", value: formatNumber(grades.length), hint: "All grades", icon: <RankingIcon />, loading, unavailable },
          { label: "Active", value: formatNumber(active), hint: "Assignable to conditions", hintTone: "success", icon: <CheckCircleIcon />, loading, unavailable },
          { label: "Inactive", value: formatNumber(grades.length - active), hint: "Not assignable", icon: <ProhibitIcon />, loading, unavailable },
          {
            label: "Conditions",
            value: formatNumber(conditionsQuery.data?.length),
            hint: "Conditions grades can map to",
            icon: <SealIcon />,
            loading: canConditions && conditionsQuery.isLoading,
            unavailable: statUnavailable(canConditions, conditionsQuery.error),
          },
        ]}
      />
      <SectionCard>
        <Toolbar
          left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search grades..." />}
          right={
            <>
              <StatusFilter value={state.status} onChange={(status) => setState({ status })} />
              <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
            </>
          }
        />
        <DataTable
          caption="Grades"
          columns={columns}
          data={filtered}
          getRowId={(g) => g.gradeId}
          isLoading={loading}
          isFetching={query.isFetching && !loading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle={grades.length ? "No grades match these filters" : "No grades yet"}
          emptyDescription={grades.length ? "Clear the search or status filter." : "Create grades, then map them to conditions on the Conditions tab."}
        />
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ListNumbersIcon className="size-4" aria-hidden /> The API does not check existing condition mappings when a grade is deactivated.
        </p>
      </SectionCard>

      <ConditionGradeFormDialog kind="grade" open={form !== null && (form.id === null || editing !== null)} entity={editing} onOpenChange={(o) => !o && setForm(null)} />
      <ToggleActiveDialog target={toggleTarget} entity="grade" loading={toggle.isPending} onClose={() => setToggleId(null)} onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)} />
    </>
  );
}

export default function GradesPage() {
  return (
    <RequirePermission permission={CT.gradesView}>
      <GradesContent />
    </RequirePermission>
  );
}
