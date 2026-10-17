import { Controller, useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { FormField } from "@/components/forms/form-field";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import type { ChecklistResponseType, ChecklistTemplateDto, TemplateItemInput } from "@/api/types/catalog-moderation";
import { inspectionTemplatesService } from "@/services/inspection-templates.service";
import { humanize } from "@/lib/utils/format";
import { catalogKeys, useTemplateQuery } from "../lib/queries";
import { requiredText, toOptText } from "../lib/form-utils";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { FormDialogContent } from "./form-dialog";
import { MutationError, Notice } from "./shared";
import { TEMPLATE_LIMITS } from "./template-form-dialog";

/** INSPECTION_CHECKLIST_TEMPLATE_ITEM.ResponseType CHECK constraint values. */
const RESPONSE_TYPES = ["PASS_FAIL", "YES_NO", "TEXT", "NUMBER", "SINGLE_SELECT", "MULTI_SELECT"] as const satisfies readonly ChecklistResponseType[];
const SELECT_TYPES: readonly ChecklistResponseType[] = ["SINGLE_SELECT", "MULTI_SELECT"];

const itemSchema = z.object({
  itemId: z.string(),
  itemCode: requiredText("Item code", TEMPLATE_LIMITS.itemCodeMaxLength),
  label: requiredText("Label", TEMPLATE_LIMITS.itemLabelMaxLength),
  description: z.string(),
  responseType: z.enum(RESPONSE_TYPES, { message: "Select a response type." }),
  isRequired: z.boolean(),
  requiresEvidence: z.boolean(),
  allowedOptionsJson: z.string(),
});
const schema = z.object({ items: z.array(itemSchema) }).superRefine((v, ctx) => {
  // Duplicate item codes surface as a 500 from the server, so block them here.
  const seen = new Map<string, number>();
  v.items.forEach((item, i) => {
    const code = item.itemCode.trim().toLowerCase();
    if (!code) return;
    if (seen.has(code)) ctx.addIssue({ code: "custom", path: ["items", i, "itemCode"], message: "Item codes must be unique within the template." });
    else seen.set(code, i);
  });
});
type Values = z.infer<typeof schema>;
type ItemValues = Values["items"][number];

const emptyItem = (): ItemValues => ({ itemId: "", itemCode: "", label: "", description: "", responseType: "PASS_FAIL", isRequired: true, requiresEvidence: false, allowedOptionsJson: "" });

function OptionsField({ control, index, register }: { control: Control<Values>; index: number; register: ReturnType<typeof useForm<Values>>["register"] }) {
  const type = useWatch({ control, name: `items.${index}.responseType` });
  if (!SELECT_TYPES.includes(type)) return null;
  return (
    <FormField label="Allowed options (raw)" htmlFor={`item-${index}-options`} hint="Stored verbatim — the backend does not define or validate this structure.">
      <Textarea {...register(`items.${index}.allowedOptionsJson`)} rows={2} className="font-mono text-xs" spellCheck={false} />
    </FormField>
  );
}

function Editor({ template, onDone }: { template: ChecklistTemplateDto; onDone: () => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      items: template.items.map((it) => ({
        itemId: it.inspectionChecklistTemplateItemId,
        itemCode: it.itemCode,
        label: it.label,
        description: it.description ?? "",
        responseType: it.responseType,
        isRequired: it.isRequired,
        requiresEvidence: it.requiresEvidence,
        allowedOptionsJson: it.allowedOptionsJson ?? "",
      })),
    },
  });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "items", keyName: "fieldKey" });
  const errors = form.formState.errors.items;
  const id = template.inspectionChecklistTemplateId;

  const mutation = useCatalogMutation({
    mutationFn: (v: Values) => {
      const items: TemplateItemInput[] = v.items.map((it, i) => ({
        itemId: it.itemId || null,
        itemCode: it.itemCode,
        label: it.label,
        description: toOptText(it.description),
        responseType: it.responseType,
        isRequired: it.isRequired,
        requiresEvidence: it.requiresEvidence,
        // Order follows the rows as arranged here.
        displayOrder: i + 1,
        allowedOptionsJson: SELECT_TYPES.includes(it.responseType) ? toOptText(it.allowedOptionsJson) : null,
      }));
      return inspectionTemplatesService.replaceItems(id, { items });
    },
    invalidate: [catalogKeys.template(id), catalogKeys.templates],
    successMessage: (saved) => `Saved ${saved.length} checklist item(s) for "${template.name}".`,
    toastOnError: false,
    onSuccess: onDone,
  });

  return (
    <FormDialogContent
      formId="template-items-form"
      title={`Checklist items · ${template.name}`}
      description="Saving replaces every item. Inspections already created keep their own snapshot."
      size="xl"
      submitLabel="Save items"
      submitting={mutation.isPending}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.template(id)]} onReloaded={onDone} />
      {fields.length === 0 && <Notice>This template has no items. Inspections created from it will have an empty checklist.</Notice>}
      <ol className="space-y-3">
        {fields.map((field, i) => {
          const e = errors?.[i];
          return (
            <li key={field.fieldKey} className="rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Item {i + 1}</p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move item ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button variant="danger-ghost" size="icon-sm" aria-label={`Remove item ${i + 1}`} onClick={() => remove(i)}>
                    <TrashIcon />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
                <FormField label="Item code" htmlFor={`item-${i}-code`} required error={e?.itemCode?.message}>
                  <Input {...form.register(`items.${i}.itemCode`)} maxLength={TEMPLATE_LIMITS.itemCodeMaxLength} autoComplete="off" spellCheck={false} />
                </FormField>
                <FormField label="Label" htmlFor={`item-${i}-label`} required error={e?.label?.message}>
                  <Input {...form.register(`items.${i}.label`)} maxLength={TEMPLATE_LIMITS.itemLabelMaxLength} autoComplete="off" />
                </FormField>
                <FormField label="Response type" htmlFor={`item-${i}-type`} required error={e?.responseType?.message}>
                  <NativeSelect {...form.register(`items.${i}.responseType`)}>
                    {RESPONSE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {humanize(t)}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </div>
              <div className="mt-3 grid gap-3">
                <FormField label="Description" htmlFor={`item-${i}-description`}>
                  <Textarea {...form.register(`items.${i}.description`)} rows={2} />
                </FormField>
                <OptionsField control={form.control} index={i} register={form.register} />
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <Controller
                      control={form.control}
                      name={`items.${i}.isRequired`}
                      render={({ field: f }) => <Checkbox id={`item-${i}-required`} checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} />}
                    />
                    <Label htmlFor={`item-${i}-required`}>Answer required</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Controller
                      control={form.control}
                      name={`items.${i}.requiresEvidence`}
                      render={({ field: f }) => <Checkbox id={`item-${i}-evidence`} checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} />}
                    />
                    <Label htmlFor={`item-${i}-evidence`}>Evidence required</Label>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" size="sm" onClick={() => append(emptyItem())}>
        <PlusIcon /> Add item
      </Button>
    </FormDialogContent>
  );
}

function Body({ templateId, title, onDone }: { templateId: string; title: string; onDone: () => void }) {
  // The list endpoint always returns items: [] — the detail GET is the only source of items.
  const query = useTemplateQuery(templateId);
  if (query.isLoading || query.error || !query.data) {
    return (
      <FormDialogContent formId="template-items-loading" title={`Checklist items · ${title}`} size="xl" submitting={false} submitDisabled onSubmit={(e) => e.preventDefault()}>
        {query.isLoading ? <TableSkeleton rows={4} columns={3} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      </FormDialogContent>
    );
  }
  return <Editor template={query.data} onDone={onDone} />;
}

export function TemplateItemsDialog({ template, onOpenChange }: { template: ChecklistTemplateDto | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={template !== null} onOpenChange={onOpenChange}>
      {template && <Body templateId={template.inspectionChecklistTemplateId} title={template.name} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
