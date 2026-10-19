import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge, Checkbox } from "@/components/ui/misc";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useAccess } from "@/lib/auth/use-access";
import { newId } from "@/lib/utils/id";
import { humanize } from "@/lib/utils/format";
import {
  ATTRIBUTE_LIMITS,
  CATALOG_TAXONOMY_PERMISSIONS as CT,
  type AdminAttributeDefinitionResponse,
  type AdminCategoryAttributeResponse,
  type AdminCategoryAttributesResultResponse,
  type AdminCategoryResponse,
} from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { catalogKeys, useAttributesQuery } from "../../lib/queries";
import { hasErrorCode } from "../../lib/errors";
import { useCatalogMutation } from "../../lib/use-catalog-mutation";
import { FormDialogContent } from "../form-dialog";
import { MutationError, Notice } from "../shared";
import { INT_RE, MappingSection, NameCode, RemoveRowButton, SimpleTable, SourceCategory, YesNo, tdClass, thClass } from "./mapping-ui";

type Row = { key: string; attributeDefinitionId: string; isRequired: boolean; order: string };

function Editor({
  category,
  data,
  attributes,
  onDone,
}: {
  category: AdminCategoryResponse;
  data: AdminCategoryAttributesResultResponse;
  attributes: AdminAttributeDefinitionResponse[];
  onDone: () => void;
}) {
  const [rows, setRows] = React.useState<Row[]>(() =>
    data.directAssignments.filter((a) => a.isActive).map((a) => ({ key: a.attributeDefinitionId, attributeDefinitionId: a.attributeDefinitionId, isRequired: a.isRequired, order: String(a.displayOrder) })),
  );
  const [validation, setValidation] = React.useState<string | null>(null);
  const inherited = new Set(data.inheritedAssignments.filter((a) => a.isActive).map((a) => a.attributeDefinitionId));
  const choices = attributes.filter((a) => !inherited.has(a.attributeDefinitionId));

  const mutation = useCatalogMutation({
    mutationFn: (body: Array<{ attributeDefinitionId: string; isRequired: boolean; displayOrder: number }>) =>
      catalogService.replaceCategoryAttributes(category.categoryId, { expectedCategoryVersion: data.categoryVersion, attributes: body }),
    invalidate: [catalogKeys.category(category.categoryId), catalogKeys.categories],
    successMessage: `Attributes of "${category.name}" updated.`,
    toastOnError: false,
    onSuccess: onDone,
  });

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidation(null);
    if (rows.some((r) => !r.attributeDefinitionId)) return setValidation("Choose an attribute for every row, or remove empty rows.");
    if (new Set(rows.map((r) => r.attributeDefinitionId)).size !== rows.length) return setValidation("Each attribute can only be assigned once.");
    if (rows.some((r) => !INT_RE.test(r.order.trim()) || Number(r.order) < ATTRIBUTE_LIMITS.categoryAttributeDisplayOrderMin))
      return setValidation("Display order must be a whole number of 0 or more.");
    mutation.mutate(rows.map((r) => ({ attributeDefinitionId: r.attributeDefinitionId, isRequired: r.isRequired, displayOrder: Number.parseInt(r.order, 10) })));
  };

  return (
    <FormDialogContent
      formId="category-attributes-form"
      title="Edit direct attributes"
      description={`Replaces every attribute assigned directly to "${category.name}". Inherited attributes are managed on the ancestor.`}
      size="xl"
      submitLabel="Save attributes"
      submitting={mutation.isPending}
      onSubmit={submit}
    >
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.category(category.categoryId)]} onReloaded={onDone} />
      {validation && (
        <p role="alert" className="text-sm text-danger-soft-foreground">
          {validation}
        </p>
      )}
      <div className="relative overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">Direct attribute assignments</caption>
          <thead className="bg-surface-muted">
            <tr>
              <th scope="col" className={thClass}>
                Attribute
              </th>
              <th scope="col" className={thClass}>
                Required
              </th>
              <th scope="col" className={thClass}>
                Display order
              </th>
              <th scope="col" className={thClass}>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No direct attributes. Saving an empty list removes all direct assignments.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className={tdClass}>
                  <NativeSelect className="w-72" value={r.attributeDefinitionId} onChange={(e) => update(r.key, { attributeDefinitionId: e.target.value })} aria-label={`Attribute for row ${i + 1}`}>
                    <option value="">Select attribute…</option>
                    {choices.map((a) => (
                      <option key={a.attributeDefinitionId} value={a.attributeDefinitionId} disabled={!a.isActive && a.attributeDefinitionId !== r.attributeDefinitionId}>
                        {a.name} ({humanize(a.dataType)}){a.isActive ? "" : " — inactive"}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className={tdClass}>
                  <Checkbox className="mt-3" checked={r.isRequired} onCheckedChange={(v) => update(r.key, { isRequired: v === true })} aria-label={`Required for row ${i + 1}`} />
                </td>
                <td className={tdClass}>
                  <Input className="w-24" inputMode="numeric" value={r.order} onChange={(e) => update(r.key, { order: e.target.value })} aria-label={`Display order for row ${i + 1}`} />
                </td>
                <td className={tdClass}>
                  <div className="pt-1.5">
                    <RemoveRowButton label={`Remove row ${i + 1}`} onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" size="sm" onClick={() => setRows((prev) => [...prev, { key: newId(), attributeDefinitionId: "", isRequired: false, order: String(prev.length) }])}>
        <PlusIcon /> Add attribute
      </Button>
      <p className="text-xs text-muted-foreground">
        Attributes already active on an ancestor are not offered (409 CATEGORY_ATTRIBUTE_ALREADY_ASSIGNED). Select attributes need at least one active option.
      </p>
    </FormDialogContent>
  );
}

export function CategoryAttributesTab({ category, nameOf }: { category: AdminCategoryResponse; nameOf: (id: string) => string | undefined }) {
  const { can } = useAccess();
  const id = category.categoryId;
  const query = useQuery({ queryKey: catalogKeys.categoryAttributes(id), queryFn: ({ signal }) => catalogService.categoryAttributes(id, signal), retry: (n, e) => !hasErrorCode(e, "CATEGORY_INACTIVE") && n < 2 });
  const canEdit = can(CT.categoryAttributesManage) && can(CT.attributesView);
  const [open, setOpen] = React.useState(false);
  const attributesQuery = useAttributesQuery(canEdit && open);

  if (query.isLoading) return <TableSkeleton rows={4} columns={4} />;
  if (hasErrorCode(query.error, "CATEGORY_INACTIVE"))
    return (
      <Notice tone="warning" title="Attribute assignments are unavailable for inactive categories">
        The API returns 409 CATEGORY_INACTIVE when reading the attributes of an inactive category, so they cannot be viewed or edited here. Reactivate the category to manage its attributes.
      </Notice>
    );
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const data = query.data;
  const direct = data.directAssignments.filter((a) => a.isActive);
  const inherited = data.inheritedAssignments.filter((a) => a.isActive);
  const removed = data.directAssignments.length - direct.length + data.inheritedAssignments.length - inherited.length;
  const base = [
    { header: "Attribute", cell: (a: AdminCategoryAttributeResponse) => <NameCode name={a.name} code={a.code} /> },
    { header: "Data type", cell: (a: AdminCategoryAttributeResponse) => <Badge tone="outline">{humanize(a.dataType)}</Badge> },
    { header: "Required", cell: (a: AdminCategoryAttributeResponse) => <YesNo value={a.isRequired} /> },
    { header: "Order", cell: (a: AdminCategoryAttributeResponse) => a.displayOrder },
  ];

  return (
    <div className="space-y-6">
      <MappingSection
        title="Direct attributes"
        description="Assigned on this category and inherited by its subcategories."
        actions={
          canEdit &&
          category.isActive && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <PencilSimpleIcon /> Edit attributes
            </Button>
          )
        }
      >
        <SimpleTable rows={direct} columns={base} getKey={(a) => a.categoryAttributeId} caption="Direct attributes" emptyTitle="No direct attributes" />
      </MappingSection>
      <MappingSection title="Inherited attributes" description="From ancestor categories, root first.">
        <SimpleTable
          rows={inherited}
          columns={[...base, { header: "From", cell: (a) => <SourceCategory id={a.sourceCategoryId} nameOf={nameOf} /> }]}
          getKey={(a) => a.categoryAttributeId}
          caption="Inherited attributes"
          emptyTitle="No inherited attributes"
        />
      </MappingSection>
      {removed > 0 && <p className="text-xs text-muted-foreground">{removed} removed assignment(s) returned by the API are hidden.</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        {open &&
          (attributesQuery.isLoading ? (
            <FormDialogContent formId="category-attributes-loading" title="Edit direct attributes" submitting={false} submitDisabled onSubmit={(e) => e.preventDefault()}>
              <TableSkeleton rows={3} columns={3} />
            </FormDialogContent>
          ) : attributesQuery.error ? (
            <FormDialogContent formId="category-attributes-error" title="Edit direct attributes" submitting={false} submitDisabled onSubmit={(e) => e.preventDefault()}>
              <ErrorState error={attributesQuery.error} onRetry={() => attributesQuery.refetch()} />
            </FormDialogContent>
          ) : (
            <Editor category={category} data={data} attributes={attributesQuery.data ?? []} onDone={() => setOpen(false)} />
          ))}
      </Dialog>
    </div>
  );
}
