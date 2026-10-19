import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowCounterClockwiseIcon, PencilSimpleIcon, PlusIcon, ProhibitIcon } from "@phosphor-icons/react";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useAccess } from "@/lib/auth/use-access";
import { ATTRIBUTE_LIMITS as L, CATALOG_TAXONOMY_PERMISSIONS as CT, type AdminAttributeDefinitionResponse, type AttributeOptionResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { humanize } from "@/lib/utils/format";
import { catalogKeys, useAttributeOptionsQuery } from "../lib/queries";
import { intString, requiredText, toInt } from "../lib/form-utils";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { MutationError, statusValue } from "./shared";

const schema = z.object({
  value: requiredText("Value", L.optionValueMaxLength),
  displayOrder: intString("Display order", { min: L.optionDisplayOrderMin, max: 2147483647 }),
});
type Values = z.infer<typeof schema>;

function OptionForm({ attributeId, option, nextOrder, onDone }: { attributeId: string; option: AttributeOptionResponse | null; nextOrder: number; onDone: () => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { value: option?.value ?? "", displayOrder: String(option?.displayOrder ?? nextOrder) } });
  const { errors } = form.formState;
  const optionsKey = catalogKeys.attributeOptions(attributeId);
  const mutation = useCatalogMutation({
    mutationFn: (v: Values) =>
      option
        ? catalogService.updateAttributeOption(attributeId, option.attributeOptionId, { value: v.value, displayOrder: toInt(v.displayOrder), expectedVersion: option.version })
        : catalogService.createAttributeOption(attributeId, { value: v.value, displayOrder: toInt(v.displayOrder) }),
    invalidate: [optionsKey, catalogKeys.categories],
    successMessage: (o) => `Option "${o.value}" ${option ? "updated" : "added"}.`,
    toastOnError: false,
    onSuccess: () => {
      form.reset({ value: "", displayOrder: String(nextOrder + 1) });
      onDone();
    },
  });
  const prefix = option ? `opt-edit-${option.attributeOptionId}` : "opt-new";

  return (
    <form noValidate onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-3 rounded-lg border border-border bg-surface-muted p-4" aria-label={option ? "Edit option" : "Add option"}>
      <p className="text-sm font-medium">{option ? `Edit option "${option.value}"` : "Add option"}</p>
      <MutationError error={mutation.error} reloadKeys={[optionsKey]} onReloaded={() => mutation.reset()} />
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-start">
        <FormField label="Value" htmlFor={`${prefix}-value`} required error={errors.value?.message}>
          <Input {...form.register("value")} maxLength={L.optionValueMaxLength} autoComplete="off" />
        </FormField>
        <FormField label="Display order" htmlFor={`${prefix}-order`} required error={errors.displayOrder?.message}>
          <Input {...form.register("displayOrder")} inputMode="numeric" />
        </FormField>
        <div className="flex gap-2 sm:pt-6">
          {option && (
            <Button variant="secondary" onClick={onDone} disabled={mutation.isPending}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={mutation.isPending}>
            {option ? "Save" : (
              <>
                Add <PlusIcon />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Body({ attribute }: { attribute: AdminAttributeDefinitionResponse }) {
  const { can } = useAccess();
  const id = attribute.attributeDefinitionId;
  const query = useAttributeOptionsQuery(id);
  const options = React.useMemo(() => query.data ?? [], [query.data]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);
  const editing = editingId ? (options.find((o) => o.attributeOptionId === editingId) ?? null) : null;
  const toggleTarget = toggleId ? (options.find((o) => o.attributeOptionId === toggleId) ?? null) : null;
  const nextOrder = options.reduce((max, o) => Math.max(max, o.displayOrder + 1), 0);

  const toggle = useCatalogMutation({
    mutationFn: (o: AttributeOptionResponse) =>
      o.isActive ? catalogService.deactivateAttributeOption(id, o.attributeOptionId, o.version) : catalogService.reactivateAttributeOption(id, o.attributeOptionId, o.version),
    invalidate: [catalogKeys.attributeOptions(id), catalogKeys.categories],
    refetchOnConflict: [catalogKeys.attributeOptions(id)],
    successMessage: (o) => `Option "${o.value}" ${o.isActive ? "reactivated" : "deactivated"}.`,
    onSuccess: () => setToggleId(null),
  });

  const showForm = editing ? can(CT.attributesUpdate) : can(CT.attributesCreate);

  return (
    <DialogContent
      title={`Options · ${attribute.name}`}
      description={`${humanize(attribute.dataType)} attribute "${attribute.code}". Values must be unique per attribute.`}
      size="lg"
      onInteractOutside={(e) => e.preventDefault()}
    >
      <div className="space-y-4">
        {showForm && <OptionForm key={editing?.attributeOptionId ?? "new"} attributeId={id} option={editing} nextOrder={nextOrder} onDone={() => setEditingId(null)} />}
        {query.isLoading ? (
          <TableSkeleton rows={4} columns={4} />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : options.length === 0 ? (
          <EmptyState title="No options yet" description="Add the values sellers can choose for this attribute." />
        ) : (
          <div className="relative overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">Options for {attribute.name}</caption>
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className="h-10 px-3 text-left font-medium">
                    Value
                  </th>
                  <th scope="col" className="px-3 text-left font-medium">
                    Order
                  </th>
                  <th scope="col" className="px-3 text-left font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {options.map((o) => (
                  <tr key={o.attributeOptionId} className={editingId === o.attributeOptionId ? "bg-action-soft/60" : undefined}>
                    <td className="px-3 py-2">{o.value}</td>
                    <td className="px-3 py-2">{o.displayOrder}</td>
                    <td className="px-3 py-2">
                      <StatusBadge value={statusValue(o.isActive)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {can(CT.attributesUpdate) && (
                          <RowAction label={`Edit ${o.value}`} onClick={() => setEditingId(o.attributeOptionId)}>
                            <PencilSimpleIcon />
                          </RowAction>
                        )}
                        {o.isActive && can(CT.attributesDeactivate) && (
                          <RowAction label={`Deactivate ${o.value}`} tone="danger" onClick={() => setToggleId(o.attributeOptionId)}>
                            <ProhibitIcon />
                          </RowAction>
                        )}
                        {!o.isActive && can(CT.attributesReactivate) && (
                          <RowAction label={`Reactivate ${o.value}`} tone="success" onClick={() => setToggleId(o.attributeOptionId)}>
                            <ArrowCounterClockwiseIcon />
                          </RowAction>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={toggleTarget !== null}
        onOpenChange={(o) => !o && setToggleId(null)}
        title={toggleTarget?.isActive ? "Deactivate option?" : "Reactivate option?"}
        description={
          toggleTarget?.isActive
            ? `"${toggleTarget.value}" will no longer be offered. The last active option of an attribute assigned to a category cannot be deactivated.`
            : `"${toggleTarget?.value ?? ""}" will be offered again.`
        }
        confirmLabel={toggleTarget?.isActive ? "Deactivate" : "Reactivate"}
        tone={toggleTarget?.isActive ? "danger" : "primary"}
        loading={toggle.isPending}
        onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)}
      />
    </DialogContent>
  );
}

export function AttributeOptionsDialog({ attribute, onOpenChange }: { attribute: AdminAttributeDefinitionResponse | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={attribute !== null} onOpenChange={onOpenChange}>
      {attribute && <Body attribute={attribute} />}
    </Dialog>
  );
}
