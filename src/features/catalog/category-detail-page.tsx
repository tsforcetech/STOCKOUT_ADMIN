import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowCounterClockwiseIcon, ArrowLeftIcon, FolderPlusIcon, PencilSimpleIcon, ProhibitIcon } from "@phosphor-icons/react";
import { PageHeader, DetailList } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { ErrorState, PageSkeleton, PermissionDenied } from "@/components/feedback/states";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { CATALOG_TAXONOMY_PERMISSIONS as CT, type AdminCategoryResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { formatDateTime } from "@/lib/utils/format";
import { catalogKeys, useCategoriesQuery, useCategoryQuery } from "./lib/queries";
import { categoryPath, childCounts, indexCategories } from "./lib/category-tree";
import { useCatalogMutation } from "./lib/use-catalog-mutation";
import { ToggleActiveDialog, statusValue } from "./components/shared";
import { CategoryFormDialog } from "./components/category-form-dialog";
import { CategoryAttributesTab } from "./components/category-mappings/category-attributes-tab";
import { CategoryBrandsTab } from "./components/category-mappings/category-brands-tab";
import { CategoryConditionsTab } from "./components/category-mappings/category-conditions-tab";
import { CategoryUnitsTab } from "./components/category-mappings/category-units-tab";

const MAPPING_TABS = [
  { value: "attributes", label: "Attributes", permission: CT.categoryAttributesView },
  { value: "brands", label: "Brands", permission: CT.categoryBrandsView },
  { value: "conditions", label: "Conditions", permission: CT.categoryConditionsView },
  { value: "units", label: "Units", permission: CT.categoryUnitsView },
] as const;

function Detail({ category, all, allLoaded }: { category: AdminCategoryResponse; all: AdminCategoryResponse[]; allLoaded: boolean }) {
  const { can } = useAccess();
  const navigate = useNavigate();
  const byId = React.useMemo(() => indexCategories(all), [all]);
  const nameOf = React.useCallback((id: string) => byId.get(id)?.name, [byId]);
  const tabs = MAPPING_TABS.filter((t) => can(t.permission));
  const [state, setState] = useUrlState({ tab: "" });
  const tab = tabs.some((t) => t.value === state.tab) ? state.tab : (tabs[0]?.value ?? "");
  const [form, setForm] = React.useState<"edit" | "child" | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const children = childCounts(all).get(category.categoryId);
  const parentPath = category.parentCategoryId ? categoryPath(category.parentCategoryId, byId) : "";

  const toggle = useCatalogMutation({
    mutationFn: (c: AdminCategoryResponse) => (c.isActive ? catalogService.deactivateCategory(c.categoryId, c.version) : catalogService.reactivateCategory(c.categoryId, c.version)),
    invalidate: [catalogKeys.categories],
    refetchOnConflict: [catalogKeys.categories],
    successMessage: (c) => `Category "${c.name}" ${c.isActive ? "reactivated" : "deactivated"}.`,
    onSuccess: () => setConfirming(false),
  });

  const canToggle = category.isActive ? can(CT.categoriesDeactivate) : can(CT.categoriesReactivate);

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title={category.name}
        description={categoryPath(category.categoryId, byId) || category.name}
        actions={
          <>
            <Button variant="secondary" size="lg" className="h-12 text-base" asChild>
              <Link to="/catalog/categories">
                <ArrowLeftIcon /> All categories
              </Link>
            </Button>
            {category.isActive && can(CT.categoriesCreate) && (
              <Button variant="secondary" size="lg" className="h-12 text-base" onClick={() => setForm("child")}>
                Add subcategory <FolderPlusIcon />
              </Button>
            )}
            {canToggle && (
              <Button variant={category.isActive ? "danger-ghost" : "secondary"} size="lg" className="h-12 text-base" onClick={() => setConfirming(true)}>
                {category.isActive ? (
                  <>
                    Deactivate <ProhibitIcon />
                  </>
                ) : (
                  <>
                    Reactivate <ArrowCounterClockwiseIcon />
                  </>
                )}
              </Button>
            )}
            {can(CT.categoriesUpdate) && (
              <Button variant="action" size="lg" className="h-12 text-base" onClick={() => setForm("edit")}>
                Edit Category <PencilSimpleIcon />
              </Button>
            )}
          </>
        }
      />

      <SectionCard className="mb-4">
        <DetailList
          columns={3}
          items={[
            { label: "Status", value: <StatusBadge value={statusValue(category.isActive)} /> },
            { label: "Code", value: <span className="font-mono text-xs">{category.code}</span> },
            { label: "Slug", value: <span className="font-mono text-xs">/{category.slug}</span> },
            {
              label: "Parent",
              value: category.parentCategoryId ? (
                <Link className="underline underline-offset-4" to={`/catalog/categories/${encodeURIComponent(category.parentCategoryId)}`}>
                  {parentPath || category.parentCategoryName || category.parentCategoryId}
                </Link>
              ) : (
                "Top level"
              ),
            },
            { label: "Subcategories", value: children ? `${children.total} (${children.active} active)` : "0" },
            { label: "Display order", value: category.displayOrder },
            { label: "Category ID", value: <IdText value={category.categoryId} /> },
            { label: "Version", value: category.version },
            { label: "Last updated", value: formatDateTime(category.updatedAtUtc ?? category.createdAtUtc) },
            { label: "Description", value: category.description || "—", full: true },
          ]}
        />
      </SectionCard>

      <SectionCard>
        {tabs.length === 0 ? (
          <PermissionDenied description="You don't have permission to view this category's attribute, brand, condition or unit assignments." />
        ) : (
          <Tabs value={tab} onValueChange={(t) => setState({ tab: t })}>
            <TabsList aria-label="Category assignments">
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {!category.isActive && <p className="pt-3 text-xs text-muted-foreground">This category is inactive: assignments cannot be changed until it is reactivated.</p>}
            <TabsContent value="attributes">{tab === "attributes" && <CategoryAttributesTab category={category} nameOf={nameOf} />}</TabsContent>
            <TabsContent value="brands">{tab === "brands" && <CategoryBrandsTab category={category} nameOf={nameOf} />}</TabsContent>
            <TabsContent value="conditions">{tab === "conditions" && <CategoryConditionsTab category={category} nameOf={nameOf} />}</TabsContent>
            <TabsContent value="units">{tab === "units" && <CategoryUnitsTab category={category} nameOf={nameOf} />}</TabsContent>
          </Tabs>
        )}
      </SectionCard>

      <CategoryFormDialog
        open={form !== null}
        category={form === "edit" ? category : null}
        defaultParentId={form === "child" ? category.categoryId : null}
        allCategories={all}
        categoriesAvailable={allLoaded}
        onOpenChange={(o) => !o && setForm(null)}
        onSaved={(saved) => {
          if (form === "child") navigate(`/catalog/categories/${encodeURIComponent(saved.categoryId)}`);
        }}
      />
      <ToggleActiveDialog
        target={confirming ? category : null}
        entity="category"
        loading={toggle.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => toggle.mutate(category)}
        deactivateNote="This is blocked while the category has active subcategories."
      />
    </>
  );
}

function CategoryDetailContent() {
  const { categoryId = "" } = useParams();
  const query = useCategoryQuery(categoryId);
  const allQuery = useCategoriesQuery({});
  if (query.isLoading) return <PageSkeleton />;
  if (query.error || !query.data) {
    return (
      <SectionCard>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
        <div className="flex justify-center pb-6">
          <Button variant="secondary" asChild>
            <Link to="/catalog/categories">
              <ArrowLeftIcon /> Back to categories
            </Link>
          </Button>
        </div>
      </SectionCard>
    );
  }
  return <Detail category={query.data} all={allQuery.data ?? []} allLoaded={Boolean(allQuery.data)} />;
}

export default function CategoryDetailPage() {
  return (
    <RequirePermission permission={CT.categoriesView}>
      <CategoryDetailContent />
    </RequirePermission>
  );
}
