import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Badge, Checkbox, Switch } from "@/components/ui/misc";
import { DetailList } from "@/components/common/page-header";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useAccess } from "@/lib/auth/use-access";
import { newId } from "@/lib/utils/id";
import {
  CATALOG_TAXONOMY_PERMISSIONS as CT,
  CONDITION_LIMITS,
  INHERITANCE_MODES,
  type AdminCategoryConditionDto,
  type AdminCategoryConditionsResponse,
  type AdminCategoryResponse,
  type ConditionResponse,
  type InheritanceMode,
} from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { catalogKeys, useConditionsQuery } from "../../lib/queries";
import { useCatalogMutation } from "../../lib/use-catalog-mutation";
import { FormDialogContent } from "../form-dialog";
import { MutationError, Notice } from "../shared";
import { INT_RE, MappingSection, NameCode, RemoveRowButton, SimpleTable, SourceCategory, YesNo, tdClass, thClass } from "./mapping-ui";

type Row = { key: string; conditionId: string; order: string; isGradeRequired: boolean };

function Editor({ category, data, conditions, onDone }: { category: AdminCategoryResponse; data: AdminCategoryConditionsResponse; conditions: ConditionResponse[]; onDone: () => void }) {
  const [mode, setMode] = React.useState<InheritanceMode>(data.inheritanceMode);
  const [required, setRequired] = React.useState(data.isConditionRequired);
  const [rows, setRows] = React.useState<Row[]>(() =>
    data.directAssignments.map((c) => ({ key: c.conditionId, conditionId: c.conditionId, order: String(c.displayOrder), isGradeRequired: c.isGradeRequired })),
  );
  const [validation, setValidation] = React.useState<string | null>(null);

  const mutation = useCatalogMutation({
    mutationFn: (body: Array<{ conditionId: string; displayOrder: number; isGradeRequired: boolean }>) =>
      catalogService.updateCategoryConditions(category.categoryId, { expectedCategoryVersion: data.categoryVersion, inheritanceMode: mode, isConditionRequired: required, conditions: body }),
    invalidate: [catalogKeys.category(category.categoryId), catalogKeys.categories],
    successMessage: `Conditions of "${category.name}" updated.`,
    toastOnError: false,
    onSuccess: onDone,
  });

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidation(null);
    if (rows.length > CONDITION_LIMITS.categoryConditionsMaxItems) return setValidation(`At most ${CONDITION_LIMITS.categoryConditionsMaxItems} conditions can be assigned.`);
    if (rows.some((r) => !r.conditionId)) return setValidation("Choose a condition for every row, or remove empty rows.");
    if (new Set(rows.map((r) => r.conditionId)).size !== rows.length) return setValidation("Each condition can only be assigned once.");
    if (rows.some((r) => !INT_RE.test(r.order.trim()))) return setValidation("Display order must be a whole number.");
    mutation.mutate(rows.map((r) => ({ conditionId: r.conditionId, displayOrder: Number.parseInt(r.order, 10), isGradeRequired: r.isGradeRequired })));
  };

  return (
    <FormDialogContent
      formId="category-conditions-form"
      title="Edit condition rules"
      description={`Replaces the condition configuration and direct conditions of "${category.name}".`}
      size="xl"
      submitLabel="Save conditions"
      submitting={mutation.isPending}
      onSubmit={submit}
    >
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.category(category.categoryId)]} onReloaded={onDone} />
      {validation && (
        <p role="alert" className="text-sm text-danger-soft-foreground">
          {validation}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cc-mode">
            Inheritance mode<span className="ml-0.5 text-danger" aria-hidden>*</span>
          </Label>
          <NativeSelect id="cc-mode" value={mode} onChange={(e) => setMode(e.target.value as InheritanceMode)} aria-describedby="cc-mode-hint">
            {INHERITANCE_MODES.map((m) => (
              <option key={m} value={m}>
                {m === "INHERIT" ? "Inherit (add to ancestors' conditions)" : "Override (ignore ancestors' conditions)"}
              </option>
            ))}
          </NativeSelect>
          <p id="cc-mode-hint" className="text-xs text-muted-foreground">
            OVERRIDE stops inheritance from categories above.
          </p>
        </div>
        <div className="flex items-center gap-3 sm:pt-7">
          <Switch id="cc-required" checked={required} onCheckedChange={setRequired} />
          <Label htmlFor="cc-required">Sellers must pick a condition</Label>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">Direct conditions</caption>
          <thead className="bg-surface-muted">
            <tr>
              <th scope="col" className={thClass}>
                Condition
              </th>
              <th scope="col" className={thClass}>
                Grade required
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
                  No direct conditions.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className={tdClass}>
                  <NativeSelect className="w-64" value={r.conditionId} onChange={(e) => update(r.key, { conditionId: e.target.value })} aria-label={`Condition for row ${i + 1}`}>
                    <option value="">Select condition…</option>
                    {conditions.map((c) => (
                      <option key={c.conditionId} value={c.conditionId} disabled={!c.isActive && c.conditionId !== r.conditionId}>
                        {c.name}
                        {c.isActive ? "" : " — inactive"}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className={tdClass}>
                  <Checkbox className="mt-3" checked={r.isGradeRequired} onCheckedChange={(v) => update(r.key, { isGradeRequired: v === true })} aria-label={`Grade required for row ${i + 1}`} />
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
      <Button
        variant="secondary"
        size="sm"
        disabled={rows.length >= CONDITION_LIMITS.categoryConditionsMaxItems}
        onClick={() => setRows((prev) => [...prev, { key: newId(), conditionId: "", order: String(prev.length), isGradeRequired: false }])}
      >
        <PlusIcon /> Add condition
      </Button>
      <p className="text-xs text-muted-foreground">
        Up to {CONDITION_LIMITS.categoryConditionsMaxItems} conditions. "Grade required" fails if the condition has no active grades.
      </p>
    </FormDialogContent>
  );
}

export function CategoryConditionsTab({ category, nameOf }: { category: AdminCategoryResponse; nameOf: (id: string) => string | undefined }) {
  const { can } = useAccess();
  const id = category.categoryId;
  const query = useQuery({ queryKey: catalogKeys.categoryConditions(id), queryFn: ({ signal }) => catalogService.categoryConditions(id, signal) });
  const canEdit = can(CT.categoryConditionsManage) && can(CT.conditionsView);
  const [open, setOpen] = React.useState(false);
  const conditionsQuery = useConditionsQuery(canEdit && open);

  if (query.isLoading) return <TableSkeleton rows={4} columns={4} />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;

  const columns = [
    { header: "Condition", cell: (c: AdminCategoryConditionDto) => <NameCode name={c.name} code={c.code} /> },
    { header: "Grade required", cell: (c: AdminCategoryConditionDto) => <YesNo value={c.isGradeRequired} /> },
    { header: "Order", cell: (c: AdminCategoryConditionDto) => c.displayOrder },
    { header: "Source", cell: (c: AdminCategoryConditionDto) => (c.isInherited ? <SourceCategory id={c.sourceCategoryId} nameOf={nameOf} /> : <Badge tone="primary">Direct</Badge>) },
  ];

  return (
    <div className="space-y-6">
      <MappingSection
        title="Condition rules"
        actions={
          canEdit &&
          category.isActive && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <PencilSimpleIcon /> Edit conditions
            </Button>
          )
        }
      >
        <DetailList
          columns={3}
          items={[
            { label: "Inheritance mode", value: data.inheritanceMode === "OVERRIDE" ? "Override ancestors" : "Inherit from ancestors" },
            { label: "Condition required", value: data.isConditionRequired ? "Yes" : "No" },
            { label: "Direct / inherited", value: `${data.directAssignments.length} / ${data.inheritedAssignments.length}` },
          ]}
        />
      </MappingSection>
      <MappingSection title="Effective conditions" description="What sellers can choose in this category.">
        <SimpleTable rows={data.effectiveConditions} columns={columns} getKey={(c) => c.conditionId} caption="Effective conditions" emptyTitle="No conditions apply" />
      </MappingSection>
      <Notice>The API only returns effective (active) assignments here, and its per-row active flag is always false due to a backend defect, so it is not shown.</Notice>

      <Dialog open={open} onOpenChange={setOpen}>
        {open &&
          (conditionsQuery.isLoading || conditionsQuery.error ? (
            <FormDialogContent formId="category-conditions-loading" title="Edit condition rules" submitting={false} submitDisabled onSubmit={(e) => e.preventDefault()}>
              {conditionsQuery.error ? <ErrorState error={conditionsQuery.error} onRetry={() => conditionsQuery.refetch()} /> : <TableSkeleton rows={3} columns={3} />}
            </FormDialogContent>
          ) : (
            <Editor category={category} data={data} conditions={conditionsQuery.data ?? []} onDone={() => setOpen(false)} />
          ))}
      </Dialog>
    </div>
  );
}
