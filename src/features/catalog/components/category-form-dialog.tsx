import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Switch } from "@/components/ui/misc";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { CATEGORY_LIMITS as L, normalizeCategorySlug, type AdminCategoryResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { catalogKeys } from "../lib/queries";
import { descendantIds, sortedByPath } from "../lib/category-tree";
import { intString, requiredText, toInt } from "../lib/form-utils";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { FormDialogContent } from "./form-dialog";
import { MutationError, Notice } from "./shared";

const schema = z.object({
  name: requiredText("Name", L.nameMaxLength),
  code: requiredText("Code", L.codeMaxLength),
  slug: z
    .string()
    .max(L.slugMaxLength, `Slug must be at most ${L.slugMaxLength} characters.`)
    .refine((s) => normalizeCategorySlug(s) !== "", "Slug must contain at least one letter or digit."),
  // Description is effectively required by the API (non-nullable string => implicit [Required]).
  description: requiredText("Description", L.descriptionMaxLength),
  displayOrder: intString("Display order", { min: -2147483648, max: 2147483647 }),
  parentCategoryId: z.string(),
  requiresPhysicalInspection: z.boolean(),
});
type Values = z.infer<typeof schema>;

function Body({
  category,
  defaultParentId,
  allCategories,
  categoriesAvailable,
  onDone,
}: {
  category: AdminCategoryResponse | null;
  defaultParentId: string | null;
  allCategories: AdminCategoryResponse[];
  categoriesAvailable: boolean;
  onDone: (saved: AdminCategoryResponse) => void;
}) {
  const isEdit = category !== null;
  const [slugTouched, setSlugTouched] = React.useState(isEdit);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? "",
      code: category?.code ?? "",
      slug: category?.slug ?? "",
      description: category?.description ?? "",
      displayOrder: String(category?.displayOrder ?? 0),
      parentCategoryId: category ? (category.parentCategoryId ?? "") : (defaultParentId ?? ""),
      requiresPhysicalInspection: category?.requiresPhysicalInspection ?? false,
    },
  });
  const { errors } = form.formState;
  // Always keep the starting parent selectable so an unloaded/filtered list can never silently move the category to the root.
  const initialParentId = category ? category.parentCategoryId : defaultParentId;
  const slug = useWatch({ control: form.control, name: "slug" });
  const normalized = normalizeCategorySlug(slug);

  const parentOptions = React.useMemo(() => {
    const excluded = category ? descendantIds(category.categoryId, allCategories) : new Set<string>();
    if (category) excluded.add(category.categoryId);
    // The API requires an active parent; keep the current parent listed so editing other fields works.
    return sortedByPath(allCategories).filter(({ category: c }) => !excluded.has(c.categoryId) && (c.isActive || c.categoryId === category?.parentCategoryId));
  }, [allCategories, category]);

  const mutation = useCatalogMutation({
    mutationFn: (v: Values) => {
      const body = {
        name: v.name,
        slug: normalizeCategorySlug(v.slug),
        description: v.description,
        displayOrder: toInt(v.displayOrder),
        parentCategoryId: v.parentCategoryId || null,
        requiresPhysicalInspection: v.requiresPhysicalInspection,
      };
      return category ? catalogService.updateCategory(category.categoryId, { ...body, expectedVersion: category.version }) : catalogService.createCategory({ ...body, code: v.code });
    },
    invalidate: [catalogKeys.categories, catalogKeys.templates],
    successMessage: (c) => `Category "${c.name}" ${isEdit ? "updated" : "created"}.`,
    toastOnError: false,
    onSuccess: (saved) => onDone(saved),
  });

  const nameField = form.register("name", {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!slugTouched) form.setValue("slug", normalizeCategorySlug(e.target.value), { shouldValidate: form.formState.isSubmitted });
    },
  });
  const slugField = form.register("slug", { onChange: () => setSlugTouched(true) });

  return (
    <FormDialogContent
      formId="category-form"
      title={isEdit ? "Edit category" : "Create category"}
      description={isEdit ? "The category code cannot be changed." : "Create a top-level category or a child of an existing one."}
      size="lg"
      submitLabel={isEdit ? "Save changes" : "Create category"}
      submitting={mutation.isPending}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <MutationError
        error={mutation.error}
        reloadKeys={category ? [catalogKeys.categories, catalogKeys.category(category.categoryId)] : [catalogKeys.categories]}
        onReloaded={() => mutation.reset()}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="cat-name" required error={errors.name?.message}>
          <Input {...nameField} maxLength={L.nameMaxLength} autoComplete="off" />
        </FormField>
        <FormField label="Code" htmlFor="cat-code" required={!isEdit} error={errors.code?.message} hint={isEdit ? "Immutable after creation." : "Unique; case is preserved. Cannot be changed later."}>
          <Input {...form.register("code")} maxLength={L.codeMaxLength} disabled={isEdit} autoComplete="off" spellCheck={false} />
        </FormField>
        <FormField
          label="Slug"
          htmlFor="cat-slug"
          required
          error={errors.slug?.message}
          hint={normalized ? `Saved as: ${normalized}` : "Lowercase letters, digits and dashes."}
        >
          <Input {...slugField} maxLength={L.slugMaxLength} autoComplete="off" spellCheck={false} />
        </FormField>
        <FormField label="Display order" htmlFor="cat-order" required error={errors.displayOrder?.message} hint="Siblings are sorted by display order, then name.">
          <Input {...form.register("displayOrder")} inputMode="numeric" />
        </FormField>
      </div>
      <FormField label="Parent category" htmlFor="cat-parent" error={errors.parentCategoryId?.message} hint="Only active categories can be parents.">
        <NativeSelect {...form.register("parentCategoryId")} disabled={!categoriesAvailable}>
          <option value="">— Top level (no parent) —</option>
          {initialParentId && !parentOptions.some(({ category: c }) => c.categoryId === initialParentId) && (
            <option value={initialParentId}>{category?.parentCategoryName ?? initialParentId}</option>
          )}
          {parentOptions.map(({ category: c, path }) => (
            <option key={c.categoryId} value={c.categoryId}>
              {path}
              {c.isActive ? "" : " (inactive)"}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {!categoriesAvailable && <Notice tone="warning">The category list is not available yet (still loading or failed), so the parent cannot be changed right now.</Notice>}
      <FormField label="Description" htmlFor="cat-description" required error={errors.description?.message} hint={`Required by the API. Up to ${L.descriptionMaxLength} characters.`}>
        <Textarea {...form.register("description")} rows={3} maxLength={L.descriptionMaxLength} />
      </FormField>
      <Controller
        control={form.control}
        name="requiresPhysicalInspection"
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="min-w-0">
              <label htmlFor="cat-inspection" className="text-sm font-medium text-foreground">
                Requires physical inspection
              </label>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                New listings in this category need an inspector's visit before they can go live. Applies to this exact category only — subcategories don't inherit it, so
                switch it on for each subcategory sellers list in. Listings already submitted keep their current setting.
              </p>
            </div>
            <Switch id="cat-inspection" checked={field.value} onCheckedChange={field.onChange} />
          </div>
        )}
      />
    </FormDialogContent>
  );
}

export function CategoryFormDialog({
  open,
  category,
  defaultParentId = null,
  allCategories,
  categoriesAvailable = true,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  category: AdminCategoryResponse | null;
  defaultParentId?: string | null;
  allCategories: AdminCategoryResponse[];
  categoriesAvailable?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (saved: AdminCategoryResponse) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <Body
          category={category}
          defaultParentId={defaultParentId}
          allCategories={allCategories}
          categoriesAvailable={categoriesAvailable}
          onDone={(saved) => {
            onOpenChange(false);
            onSaved?.(saved);
          }}
        />
      )}
    </Dialog>
  );
}
