import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useAccess } from "@/lib/auth/use-access";
import { CATALOG_TAXONOMY_PERMISSIONS as CT, type AdminCategoryBrandResponse, type AdminCategoryResponse, type BrandResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { catalogKeys, useBrandsQuery } from "../../lib/queries";
import { useCatalogMutation } from "../../lib/use-catalog-mutation";
import { FormDialogContent } from "../form-dialog";
import { MutationError } from "../shared";
import { MappingSection, NameCode, SimpleTable, SourceCategory } from "./mapping-ui";

function Editor({ category, current, brands, onDone }: { category: AdminCategoryResponse; current: AdminCategoryBrandResponse[]; brands: BrandResponse[]; onDone: () => void }) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(current.filter((b) => b.isActive && !b.isInherited).map((b) => b.brandId)));
  const [q, setQ] = React.useState("");
  const inherited = new Map(current.filter((b) => b.isActive && b.isInherited).map((b) => [b.brandId, b]));
  const visible = brands.filter((b) => !q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase()) || b.code.toLowerCase().includes(q.trim().toLowerCase()));

  const mutation = useCatalogMutation({
    // CB1 has no categoryVersion: the category's own version (C2) is the expected version.
    mutationFn: (brandIds: string[]) => catalogService.replaceCategoryBrands(category.categoryId, { expectedCategoryVersion: category.version, brandIds }),
    invalidate: [catalogKeys.category(category.categoryId), catalogKeys.categories],
    successMessage: `Brands of "${category.name}" updated.`,
    toastOnError: false,
    onSuccess: onDone,
  });

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <FormDialogContent
      formId="category-brands-form"
      title="Edit direct brands"
      description={`Replaces every brand assigned directly to "${category.name}".`}
      size="lg"
      submitLabel="Save brands"
      submitting={mutation.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate([...selected]);
      }}
    >
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.category(category.categoryId)]} onReloaded={onDone} />
      <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter brands..." aria-label="Filter brands" />
      {visible.length === 0 ? (
        <EmptyState className="py-8" title={brands.length ? "No brands match" : "No brands defined"} />
      ) : (
        <ul className="max-h-[45dvh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {visible.map((b) => {
            const fromAncestor = inherited.get(b.brandId);
            const checked = selected.has(b.brandId);
            const disabled = Boolean(fromAncestor) || (!b.isActive && !checked);
            return (
              <li key={b.brandId} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Checkbox id={`brand-pick-${b.brandId}`} checked={checked || Boolean(fromAncestor)} disabled={disabled} onCheckedChange={(v) => toggle(b.brandId, v === true)} />
                <label htmlFor={`brand-pick-${b.brandId}`} className="min-w-0 flex-1">
                  <NameCode name={b.name} code={b.code} />
                </label>
                {fromAncestor ? <span className="text-xs text-muted-foreground">Inherited</span> : !b.isActive ? <span className="text-xs text-muted-foreground">Inactive</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{selected.size} direct brand(s) selected. Inactive brands and brands inherited from an ancestor cannot be added.</p>
    </FormDialogContent>
  );
}

export function CategoryBrandsTab({ category, nameOf }: { category: AdminCategoryResponse; nameOf: (id: string) => string | undefined }) {
  const { can } = useAccess();
  const id = category.categoryId;
  const query = useQuery({ queryKey: catalogKeys.categoryBrands(id), queryFn: ({ signal }) => catalogService.categoryBrands(id, signal) });
  const canEdit = can(CT.categoryBrandsManage) && can(CT.brandsView);
  const [open, setOpen] = React.useState(false);
  const brandsQuery = useBrandsQuery(canEdit && open);

  if (query.isLoading) return <TableSkeleton rows={4} columns={3} />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const active = query.data.filter((b) => b.isActive);
  const direct = active.filter((b) => !b.isInherited);
  const inherited = active.filter((b) => b.isInherited);
  const base = [
    { header: "Brand", cell: (b: AdminCategoryBrandResponse) => <NameCode name={b.name} code={b.code} /> },
    { header: "Description", cell: (b: AdminCategoryBrandResponse) => <span className="block max-w-[360px] truncate text-muted-foreground">{b.description || "—"}</span> },
  ];

  return (
    <div className="space-y-6">
      <MappingSection
        title="Direct brands"
        actions={
          canEdit &&
          category.isActive && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <PencilSimpleIcon /> Edit brands
            </Button>
          )
        }
      >
        <SimpleTable rows={direct} columns={base} getKey={(b) => b.categoryBrandId} caption="Direct brands" emptyTitle="No direct brands" />
      </MappingSection>
      <MappingSection title="Inherited brands" description="From ancestor categories.">
        <SimpleTable
          rows={inherited}
          columns={[...base, { header: "From", cell: (b) => <SourceCategory id={b.sourceCategoryId} nameOf={nameOf} /> }]}
          getKey={(b) => b.categoryBrandId}
          caption="Inherited brands"
          emptyTitle="No inherited brands"
        />
      </MappingSection>

      <Dialog open={open} onOpenChange={setOpen}>
        {open &&
          (brandsQuery.isLoading || brandsQuery.error ? (
            <FormDialogContent formId="category-brands-loading" title="Edit direct brands" submitting={false} submitDisabled onSubmit={(e) => e.preventDefault()}>
              {brandsQuery.error ? <ErrorState error={brandsQuery.error} onRetry={() => brandsQuery.refetch()} /> : <TableSkeleton rows={4} columns={2} />}
            </FormDialogContent>
          ) : (
            <Editor category={category} current={query.data} brands={brandsQuery.data ?? []} onDone={() => setOpen(false)} />
          ))}
      </Dialog>
    </div>
  );
}
