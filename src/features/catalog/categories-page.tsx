import * as React from "react";
import { useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircleIcon, ClipboardTextIcon, FolderPlusIcon, FoldersIcon, SlidersHorizontalIcon, TreeStructureIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { StatCards } from "@/components/common/stat-cards";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/misc";
import { EntityCell } from "@/components/common/entity-cell";
import { ExportButton } from "@/components/common/export-button";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { NativeSelect } from "@/components/ui/input";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { CATALOG_TAXONOMY_PERMISSIONS as CT, type AdminCategoryListQuery, type AdminCategoryResponse } from "@/api/types/catalog-taxonomy";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { catalogService } from "@/services/catalog.service";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { catalogKeys, useAttributesQuery, useCategoriesQuery, useTemplatesQuery } from "./lib/queries";
import { childCounts, indexCategories, categoryPath, sortedByPath } from "./lib/category-tree";
import { useCatalogMutation } from "./lib/use-catalog-mutation";
import { CreateButton, EntityRowActions, ToggleActiveDialog, statUnavailable, statusValue } from "./components/shared";
import { CategoryFormDialog } from "./components/category-form-dialog";

/** Client-side only: the API has no roots-only filter (contract §5 C1). */
const ROOTS = "__root";

function CategoriesContent() {
  const { can } = useAccess();
  const navigate = useNavigate();
  const [state, setState] = useUrlState({ q: "", parent: "", status: "" });

  // Unfiltered list: parent names/paths, child counts, pickers and stats.
  const allQuery = useCategoriesQuery({});
  const all = React.useMemo(() => allQuery.data ?? [], [allQuery.data]);
  const byId = React.useMemo(() => indexCategories(all), [all]);
  const children = React.useMemo(() => childCounts(all), [all]);

  // Server-side filters per contract: search (name/code/slug LIKE), parentCategoryId (direct children), isActive.
  const serverQuery: AdminCategoryListQuery = React.useMemo(
    () => ({
      search: state.q.trim() || undefined,
      parentCategoryId: state.parent && state.parent !== ROOTS ? state.parent : undefined,
      isActive: state.status === "active" ? true : state.status === "inactive" ? false : undefined,
    }),
    [state.q, state.parent, state.status],
  );
  const hasServerFilter = serverQuery.search !== undefined || serverQuery.parentCategoryId !== undefined || serverQuery.isActive !== undefined;
  const filteredQuery = useCategoriesQuery(serverQuery, hasServerFilter);
  const listQuery = hasServerFilter ? filteredQuery : allQuery;
  const rows = React.useMemo(() => {
    const data = listQuery.data ?? [];
    return state.parent === ROOTS ? data.filter((c) => c.parentCategoryId === null) : data;
  }, [listQuery.data, state.parent]);

  const canAttributes = can(CT.attributesView);
  const canTemplates = can(P.INSPECTIONS_TEMPLATES_MANAGE);
  const attributesQuery = useAttributesQuery(canAttributes);
  const templatesQuery = useTemplatesQuery(canTemplates);

  const [form, setForm] = React.useState<{ id: string | null; parentId: string | null } | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);
  const editing = form?.id ? (byId.get(form.id) ?? null) : null;
  const toggleTarget = toggleId ? (byId.get(toggleId) ?? null) : null;

  const toggle = useCatalogMutation({
    mutationFn: (c: AdminCategoryResponse) => (c.isActive ? catalogService.deactivateCategory(c.categoryId, c.version) : catalogService.reactivateCategory(c.categoryId, c.version)),
    invalidate: [catalogKeys.categories],
    refetchOnConflict: [catalogKeys.categories],
    successMessage: (c) => `Category "${c.name}" ${c.isActive ? "reactivated" : "deactivated"}.`,
    onSuccess: () => setToggleId(null),
  });

  const exportRows = (list: AdminCategoryResponse[]) =>
    downloadCsv(
      `categories-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(list, [
        { header: "Category ID", value: (c) => c.categoryId },
        { header: "Code", value: (c) => c.code },
        { header: "Name", value: (c) => c.name },
        { header: "Path", value: (c) => categoryPath(c.categoryId, byId) || c.name },
        { header: "Slug", value: (c) => c.slug },
        { header: "Parent ID", value: (c) => c.parentCategoryId },
        { header: "Parent", value: (c) => c.parentCategoryName },
        { header: "Display order", value: (c) => c.displayOrder },
        { header: "Description", value: (c) => c.description },
        { header: "Status", value: (c) => statusValue(c.isActive) },
        { header: "Requires physical inspection", value: (c) => (c.requiresPhysicalInspection ? "Yes" : "No") },
        { header: "Version", value: (c) => c.version },
        { header: "Updated (UTC)", value: (c) => c.updatedAtUtc ?? c.createdAtUtc },
      ]),
    );

  const columns = React.useMemo<ColumnDef<AdminCategoryResponse, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Category",
        accessorFn: (c) => c.name,
        cell: ({ row }) => <EntityCell icon={<FoldersIcon />} title={row.original.name} subtitle={`${row.original.code} · /${row.original.slug}`} />,
      },
      {
        id: "parent",
        header: "Parent",
        accessorFn: (c) => c.parentCategoryName ?? "",
        cell: ({ row }) => {
          const c = row.original;
          if (!c.parentCategoryId) return <span className="text-muted-foreground">Top level</span>;
          const path = categoryPath(c.parentCategoryId, byId);
          return (
            <span className="block max-w-[260px] truncate" title={path || undefined}>
              {c.parentCategoryName ?? byId.get(c.parentCategoryId)?.name ?? "—"}
            </span>
          );
        },
      },
      {
        id: "inspection",
        header: "Inspection",
        accessorFn: (c) => (c.requiresPhysicalInspection ? 1 : 0),
        cell: ({ row }) =>
          row.original.requiresPhysicalInspection ? (
            <Badge tone="info" title="New listings in this category need a physical inspection">
              Required
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "children",
        header: "Subcategories",
        accessorFn: (c) => children.get(c.categoryId)?.total ?? 0,
        cell: ({ row }) => {
          const count = children.get(row.original.categoryId);
          return count ? `${formatNumber(count.total)} (${formatNumber(count.active)} active)` : "0";
        },
      },
      { id: "order", header: "Order", accessorFn: (c) => c.displayOrder },
      { id: "status", header: "Status", accessorFn: (c) => statusValue(c.isActive), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "updated", header: "Last updated", accessorFn: (c) => c.updatedAtUtc ?? c.createdAtUtc, cell: ({ getValue }) => formatDateTime(getValue() as string) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <EntityRowActions
              name={c.name}
              isActive={c.isActive}
              canEdit={can(CT.categoriesUpdate)}
              canDeactivate={can(CT.categoriesDeactivate)}
              canReactivate={can(CT.categoriesReactivate)}
              onEdit={() => setForm({ id: c.categoryId, parentId: null })}
              onToggle={() => setToggleId(c.categoryId)}
            >
              {c.isActive && can(CT.categoriesCreate) && (
                <RowAction label={`Add subcategory to ${c.name}`} onClick={() => setForm({ id: null, parentId: c.categoryId })}>
                  <FolderPlusIcon />
                </RowAction>
              )}
            </EntityRowActions>
          );
        },
      },
    ],
    [can, byId, children],
  );

  const loadingAll = allQuery.isLoading;
  const allUnavailable = statUnavailable(true, allQuery.error);
  const activeTemplates = templatesQuery.data?.filter((t) => t.isActive).length;
  const parentChoices = React.useMemo(() => sortedByPath(all), [all]);

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Categories"
        description="The product taxonomy: category tree and the attributes, brands, conditions and units each category allows."
        actions={
          <>
            <ExportButton onExport={() => exportRows(rows)} disabled={!rows.length} />
            {can(CT.categoriesCreate) && <CreateButton onClick={() => setForm({ id: null, parentId: null })}>Create category</CreateButton>}
          </>
        }
      />
      <StatCards
        className="mb-4"
        items={[
          {
            label: "Categories",
            value: formatNumber(all.length),
            hint: `${formatNumber(all.filter((c) => !c.parentCategoryId).length)} top level`,
            icon: <TreeStructureIcon />,
            loading: loadingAll,
            unavailable: allUnavailable,
          },
          {
            label: "Active categories",
            value: formatNumber(all.filter((c) => c.isActive).length),
            hint: "Available for listings",
            hintTone: "success",
            icon: <CheckCircleIcon />,
            loading: loadingAll,
            unavailable: allUnavailable,
          },
          {
            label: "Attributes",
            value: formatNumber(attributesQuery.data?.filter((a) => a.isActive).length),
            hint: `${formatNumber(attributesQuery.data?.length)} defined in total`,
            icon: <SlidersHorizontalIcon />,
            loading: canAttributes && attributesQuery.isLoading,
            unavailable: statUnavailable(canAttributes, attributesQuery.error),
          },
          {
            label: "Active templates",
            value: formatNumber(activeTemplates),
            hint: "Inspection checklists in use",
            icon: <ClipboardTextIcon />,
            loading: canTemplates && templatesQuery.isLoading,
            unavailable: statUnavailable(canTemplates, templatesQuery.error),
          },
        ]}
      />
      <SectionCard>
        <Toolbar
          left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search name, code or slug..." />}
          right={
            <>
              <NativeSelect className="h-[38px] w-56" value={state.parent} onChange={(e) => setState({ parent: e.target.value })} aria-label="Parent category">
                <option value="">All levels</option>
                <option value={ROOTS}>Top level only</option>
                {parentChoices.map(({ category: c, path }) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    Children of {path}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="h-[38px] w-40" value={state.status} onChange={(e) => setState({ status: e.target.value })} aria-label="Status">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </NativeSelect>
              <RefreshButton
                onClick={() => {
                  void allQuery.refetch();
                  if (hasServerFilter) void filteredQuery.refetch();
                }}
                spinning={listQuery.isFetching}
              />
            </>
          }
        />
        <DataTable
          caption="Categories"
          columns={columns}
          data={rows}
          getRowId={(c) => c.categoryId}
          isLoading={listQuery.isLoading}
          isFetching={listQuery.isFetching && !listQuery.isLoading}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={(c) => navigate(`/catalog/categories/${encodeURIComponent(c.categoryId)}`)}
          emptyTitle={all.length ? "No categories match these filters" : "No categories yet"}
          emptyDescription={all.length ? "Clear the search or filters." : "Create the first top-level category to start the taxonomy."}
        />
        <p className="mt-3 text-xs text-muted-foreground">Select a row to manage its attributes, brands, conditions and units.</p>
      </SectionCard>

      <CategoryFormDialog
        open={form !== null && (form.id === null || editing !== null)}
        category={editing}
        defaultParentId={form?.parentId ?? null}
        allCategories={all}
        categoriesAvailable={!allQuery.error && !allQuery.isLoading}
        onOpenChange={(o) => !o && setForm(null)}
      />
      <ToggleActiveDialog
        target={toggleTarget}
        entity="category"
        loading={toggle.isPending}
        onClose={() => setToggleId(null)}
        onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)}
        deactivateNote="This is blocked while the category has active subcategories."
      />
    </>
  );
}

export default function CategoriesPage() {
  return (
    <RequirePermission permission={CT.categoriesView}>
      <CategoriesContent />
    </RequirePermission>
  );
}
