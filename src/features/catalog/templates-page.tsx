import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircleIcon, ClipboardTextIcon, GlobeIcon, ListChecksIcon, FoldersIcon } from "@phosphor-icons/react";
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
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { CATALOG_TAXONOMY_PERMISSIONS as CT } from "@/api/types/catalog-taxonomy";
import type { ChecklistTemplateDto } from "@/api/types/catalog-moderation";
import { inspectionTemplatesService } from "@/services/inspection-templates.service";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { catalogKeys, useCategoriesQuery, useTemplatesQuery } from "./lib/queries";
import { categoryPath, indexCategories } from "./lib/category-tree";
import { useCatalogMutation } from "./lib/use-catalog-mutation";
import { CreateButton, EntityRowActions, Notice, StatusFilter, ToggleActiveDialog, matchesStatus, statUnavailable, statusValue } from "./components/shared";
import { TemplateFormDialog } from "./components/template-form-dialog";
import { TemplateItemsDialog } from "./components/template-items-dialog";

function TemplatesContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ q: "", status: "", scope: "" });
  const query = useTemplatesQuery();
  const templates = React.useMemo(() => query.data ?? [], [query.data]);
  const canCategories = can(CT.categoriesView);
  const categoriesQuery = useCategoriesQuery({}, canCategories);
  const categories = React.useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const byId = React.useMemo(() => indexCategories(categories), [categories]);

  const [form, setForm] = React.useState<{ id: string | null } | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);
  const [itemsId, setItemsId] = React.useState<string | null>(null);
  const find = (id: string | null | undefined) => (id ? (templates.find((t) => t.inspectionChecklistTemplateId === id) ?? null) : null);
  const editing = find(form?.id);
  const toggleTarget = find(toggleId);
  const itemsTarget = find(itemsId);

  const scopeName = React.useCallback(
    (t: ChecklistTemplateDto) => (t.categoryId ? categoryPath(t.categoryId, byId) || (canCategories ? "Unknown category" : `Category ${t.categoryId.slice(0, 8)}…`) : "Global default"),
    [byId, canCategories],
  );

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return templates.filter(
      (t) =>
        matchesStatus(t.isActive, state.status) &&
        (state.scope === "" || (state.scope === "global" ? t.categoryId === null : t.categoryId !== null)) &&
        (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || scopeName(t).toLowerCase().includes(q)),
    );
  }, [templates, state.q, state.status, state.scope, scopeName]);

  const toggle = useCatalogMutation({
    // Activate/deactivate take no rowVersion (contract §5).
    mutationFn: (t: ChecklistTemplateDto) => (t.isActive ? inspectionTemplatesService.deactivate(t.inspectionChecklistTemplateId) : inspectionTemplatesService.activate(t.inspectionChecklistTemplateId)),
    invalidate: [catalogKeys.templates],
    successMessage: (t) => `Template "${t.name}" ${t.isActive ? "activated" : "deactivated"}.`,
    onSuccess: () => setToggleId(null),
  });

  const exportRows = (rows: ChecklistTemplateDto[]) =>
    downloadCsv(
      `inspection-templates-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { header: "Template ID", value: (t) => t.inspectionChecklistTemplateId },
        { header: "Code", value: (t) => t.code },
        { header: "Name", value: (t) => t.name },
        { header: "Description", value: (t) => t.description },
        { header: "Category ID", value: (t) => t.categoryId },
        { header: "Scope", value: (t) => scopeName(t) },
        { header: "Status", value: (t) => statusValue(t.isActive) },
        { header: "Created (UTC)", value: (t) => t.createdAtUtc },
        { header: "Updated (UTC)", value: (t) => t.updatedAtUtc },
      ]),
    );

  const columns = React.useMemo<ColumnDef<ChecklistTemplateDto, unknown>[]>(
    () => [
      { id: "name", header: "Template", accessorFn: (t) => t.name, cell: ({ row }) => <EntityCell icon={<ClipboardTextIcon />} title={row.original.name} subtitle={row.original.code} /> },
      {
        id: "scope",
        header: "Scope",
        accessorFn: (t) => scopeName(t),
        cell: ({ row }) =>
          row.original.categoryId ? (
            <span className="block max-w-[280px] truncate">{scopeName(row.original)}</span>
          ) : (
            <Badge tone="info">
              <GlobeIcon className="size-3.5" aria-hidden /> Global default
            </Badge>
          ),
      },
      { id: "status", header: "Status", accessorFn: (t) => statusValue(t.isActive), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "updated", header: "Last updated", accessorFn: (t) => t.updatedAtUtc ?? t.createdAtUtc, cell: ({ getValue }) => formatDateTime(getValue() as string) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityRowActions
            name={row.original.name}
            isActive={row.original.isActive}
            canEdit
            canDeactivate
            canReactivate
            onEdit={() => setForm({ id: row.original.inspectionChecklistTemplateId })}
            onToggle={() => setToggleId(row.original.inspectionChecklistTemplateId)}
          >
            <RowAction label={`Checklist items of ${row.original.name}`} onClick={() => setItemsId(row.original.inspectionChecklistTemplateId)}>
              <ListChecksIcon />
            </RowAction>
          </EntityRowActions>
        ),
      },
    ],
    [scopeName],
  );

  const loading = query.isLoading;
  const unavailable = statUnavailable(true, query.error);
  const active = templates.filter((t) => t.isActive);
  const globalActive = active.some((t) => t.categoryId === null);
  const categoriesState = !canCategories ? "forbidden" : categoriesQuery.isLoading ? "loading" : categoriesQuery.error ? "unavailable" : "ok";

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Inspection templates"
        description="Checklists inspectors complete. The active category template is used first, otherwise the active global default."
        actions={
          <>
            <ExportButton onExport={() => exportRows(filtered)} disabled={!filtered.length} />
            <CreateButton onClick={() => setForm({ id: null })}>Create Template</CreateButton>
          </>
        }
      />
      <StatCards
        className="mb-4"
        items={[
          { label: "Templates", value: formatNumber(templates.length), hint: "All checklist templates", icon: <ClipboardTextIcon />, loading, unavailable },
          { label: "Active", value: formatNumber(active.length), hint: "Used for new inspections", hintTone: "success", icon: <CheckCircleIcon />, loading, unavailable },
          {
            label: "Global default",
            value: globalActive ? "Active" : "None",
            hint: globalActive ? "Fallback for every category" : "Categories without a template cannot be inspected",
            hintTone: globalActive ? "success" : "danger",
            icon: <GlobeIcon />,
            loading,
            unavailable,
          },
          {
            label: "Category templates",
            value: formatNumber(active.filter((t) => t.categoryId !== null).length),
            hint: "Active category-specific templates",
            icon: <FoldersIcon />,
            loading,
            unavailable,
          },
        ]}
      />
      <SectionCard>
        <Toolbar
          left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search templates..." />}
          right={
            <>
              <NativeSelect className="h-[38px] w-44" value={state.scope} onChange={(e) => setState({ scope: e.target.value })} aria-label="Scope">
                <option value="">All scopes</option>
                <option value="global">Global default</option>
                <option value="category">Category-specific</option>
              </NativeSelect>
              <StatusFilter value={state.status} onChange={(status) => setState({ status })} />
              <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
            </>
          }
        />
        <DataTable
          caption="Inspection templates"
          columns={columns}
          data={filtered}
          getRowId={(t) => t.inspectionChecklistTemplateId}
          isLoading={loading}
          isFetching={query.isFetching && !loading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle={templates.length ? "No templates match these filters" : "No inspection templates yet"}
          emptyDescription={templates.length ? "Clear the search or filters." : "Create a global default template so listings that need inspection can be approved."}
        />
        <Notice className="mt-3">
          The template list API does not include checklist items (it always returns an empty list), so item counts are not shown here. Open a template's checklist to load its items.
        </Notice>
      </SectionCard>

      <TemplateFormDialog
        open={form !== null && (form.id === null || editing !== null)}
        template={editing}
        categories={categories}
        categoriesState={categoriesState}
        onOpenChange={(o) => !o && setForm(null)}
        onCreated={(t) => setItemsId(t.inspectionChecklistTemplateId)}
      />
      <TemplateItemsDialog template={itemsTarget} onOpenChange={(o) => !o && setItemsId(null)} />
      <ToggleActiveDialog
        target={toggleTarget}
        entity="template"
        loading={toggle.isPending}
        onClose={() => setToggleId(null)}
        onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)}
        deactivateNote="Existing inspections keep their checklist snapshot. Activation fails if another active template already covers the same scope."
      />
    </>
  );
}

export default function TemplatesPage() {
  return (
    <RequirePermission permission={P.INSPECTIONS_TEMPLATES_MANAGE}>
      <TemplatesContent />
    </RequirePermission>
  );
}
