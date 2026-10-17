import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { FormField } from "@/components/forms/form-field";
import type { ChecklistTemplateDto } from "@/api/types/catalog-moderation";
import type { AdminCategoryResponse } from "@/api/types/catalog-taxonomy";
import { inspectionTemplatesService } from "@/services/inspection-templates.service";
import { catalogKeys } from "../lib/queries";
import { sortedByPath } from "../lib/category-tree";
import { optionalText, requiredText, toOptText } from "../lib/form-utils";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { FormDialogContent } from "./form-dialog";
import { MutationError, Notice } from "./shared";

/** Column sizes from the template schema (contract §5). */
export const TEMPLATE_LIMITS = { codeMaxLength: 50, nameMaxLength: 150, descriptionMaxLength: 500, itemCodeMaxLength: 50, itemLabelMaxLength: 255 } as const;

const schema = z.object({
  code: requiredText("Code", TEMPLATE_LIMITS.codeMaxLength),
  name: requiredText("Name", TEMPLATE_LIMITS.nameMaxLength),
  description: optionalText("Description", TEMPLATE_LIMITS.descriptionMaxLength),
  categoryId: z.string(),
  isActive: z.boolean(),
});
type Values = z.infer<typeof schema>;

function Body({
  template,
  categories,
  categoriesState,
  onDone,
}: {
  template: ChecklistTemplateDto | null;
  categories: AdminCategoryResponse[];
  categoriesState: "ok" | "loading" | "unavailable" | "forbidden";
  onDone: (saved: ChecklistTemplateDto) => void;
}) {
  const isEdit = template !== null;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { code: template?.code ?? "", name: template?.name ?? "", description: template?.description ?? "", categoryId: template?.categoryId ?? "", isActive: true },
  });
  const { errors } = form.formState;
  const mutation = useCatalogMutation({
    mutationFn: (v: Values) =>
      template
        ? inspectionTemplatesService.update(template.inspectionChecklistTemplateId, { name: v.name, description: toOptText(v.description), expectedRowVersion: template.rowVersion })
        : inspectionTemplatesService.create({ code: v.code, name: v.name, description: toOptText(v.description), categoryId: v.categoryId || null, isActive: v.isActive }),
    invalidate: [catalogKeys.templates],
    successMessage: (t) => `Template "${t.name}" ${isEdit ? "updated" : "created"}.`,
    toastOnError: false,
    onSuccess: (t) => onDone(t),
  });

  return (
    <FormDialogContent
      formId="template-form"
      title={isEdit ? "Edit template" : "Create inspection template"}
      description={isEdit ? "Code and category scope cannot be changed." : "Add checklist items after creating the template."}
      submitLabel={isEdit ? "Save changes" : "Create template"}
      submitting={mutation.isPending}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.templates]} onReloaded={() => mutation.reset()} />
      <FormField label="Code" htmlFor="tpl-code" required={!isEdit} error={errors.code?.message} hint={isEdit ? "Immutable after creation." : "Globally unique."}>
        <Input {...form.register("code")} maxLength={TEMPLATE_LIMITS.codeMaxLength} disabled={isEdit} autoComplete="off" spellCheck={false} />
      </FormField>
      <FormField label="Name" htmlFor="tpl-name" required error={errors.name?.message}>
        <Input {...form.register("name")} maxLength={TEMPLATE_LIMITS.nameMaxLength} autoComplete="off" />
      </FormField>
      <FormField label="Description" htmlFor="tpl-description" error={errors.description?.message} hint={`Up to ${TEMPLATE_LIMITS.descriptionMaxLength} characters.`}>
        <Textarea {...form.register("description")} rows={3} maxLength={TEMPLATE_LIMITS.descriptionMaxLength} />
      </FormField>
      {!isEdit && (
        <>
          <FormField
            label="Category scope"
            htmlFor="tpl-category"
            error={errors.categoryId?.message}
            hint="One active template per category, plus one active global default used when a category has none."
          >
            <NativeSelect {...form.register("categoryId")} disabled={categoriesState === "loading"}>
              <option value="">Global default (all categories)</option>
              {sortedByPath(categories).map(({ category: c, path }) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {path}
                  {c.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {categoriesState === "forbidden" && <Notice>Category-specific templates need the catalog.categories.view permission to choose a category. Only a global template can be created.</Notice>}
          {categoriesState === "unavailable" && <Notice tone="warning">Categories could not be loaded, so only a global template can be created right now.</Notice>}
          <div className="flex items-center gap-3">
            <Controller control={form.control} name="isActive" render={({ field }) => <Switch id="tpl-active" checked={field.value} onCheckedChange={field.onChange} />} />
            <Label htmlFor="tpl-active">Activate immediately</Label>
          </div>
        </>
      )}
    </FormDialogContent>
  );
}

export function TemplateFormDialog({
  open,
  template,
  categories,
  categoriesState,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  template: ChecklistTemplateDto | null;
  categories: AdminCategoryResponse[];
  categoriesState: "ok" | "loading" | "unavailable" | "forbidden";
  onOpenChange: (open: boolean) => void;
  onCreated?: (saved: ChecklistTemplateDto) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <Body
          template={template}
          categories={categories}
          categoriesState={categoriesState}
          onDone={(saved) => {
            onOpenChange(false);
            if (!template) onCreated?.(saved);
          }}
        />
      )}
    </Dialog>
  );
}
