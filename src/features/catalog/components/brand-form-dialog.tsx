import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { BRAND_LIMITS, type BrandResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { catalogKeys } from "../lib/queries";
import { optionalText, requiredText, toOptText } from "../lib/form-utils";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { FormDialogContent } from "./form-dialog";
import { MutationError } from "./shared";

const schema = z.object({
  code: requiredText("Code", BRAND_LIMITS.codeMaxLength),
  name: requiredText("Name", BRAND_LIMITS.nameMaxLength),
  description: optionalText("Description", BRAND_LIMITS.descriptionMaxLength),
});
type Values = z.infer<typeof schema>;

function BrandFormBody({ brand, onDone }: { brand: BrandResponse | null; onDone: () => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { code: brand?.code ?? "", name: brand?.name ?? "", description: brand?.description ?? "" },
  });
  const { errors } = form.formState;
  const mutation = useCatalogMutation({
    mutationFn: (v: Values) =>
      brand
        ? catalogService.updateBrand(brand.brandId, { name: v.name, description: toOptText(v.description), expectedVersion: brand.version })
        : catalogService.createBrand({ code: v.code, name: v.name, description: toOptText(v.description) }),
    invalidate: [catalogKeys.brands, catalogKeys.categories],
    successMessage: (b) => (brand ? `Brand "${b.name}" updated.` : `Brand "${b.name}" created.`),
    toastOnError: false,
    onSuccess: onDone,
  });

  return (
    <FormDialogContent
      formId="brand-form"
      title={brand ? "Edit brand" : "Create brand"}
      description={brand ? "The brand code cannot be changed." : "Brands can be assigned to categories once created."}
      submitLabel={brand ? "Save changes" : "Create brand"}
      submitting={mutation.isPending}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.brands]} onReloaded={() => mutation.reset()} />
      <FormField label="Code" htmlFor="brand-code" required={!brand} error={errors.code?.message} hint={brand ? "Immutable after creation." : "Case is preserved. Cannot be changed later."}>
        <Input {...form.register("code")} maxLength={BRAND_LIMITS.codeMaxLength} disabled={Boolean(brand)} autoComplete="off" />
      </FormField>
      <FormField label="Name" htmlFor="brand-name" required error={errors.name?.message}>
        <Input {...form.register("name")} maxLength={BRAND_LIMITS.nameMaxLength} autoComplete="off" />
      </FormField>
      <FormField label="Description" htmlFor="brand-description" error={errors.description?.message} hint={`Up to ${BRAND_LIMITS.descriptionMaxLength} characters.`}>
        <Textarea {...form.register("description")} rows={3} maxLength={BRAND_LIMITS.descriptionMaxLength} />
      </FormField>
    </FormDialogContent>
  );
}

export function BrandFormDialog({ open, brand, onOpenChange }: { open: boolean; brand: BrandResponse | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <BrandFormBody brand={brand} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
