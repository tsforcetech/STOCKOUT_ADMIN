import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { UNIT_LIMITS, UNIT_TYPES, type UnitResponse, type UnitType } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { humanize } from "@/lib/utils/format";
import { catalogKeys } from "../lib/queries";
import { intString, lowerCodeHint, optionalText, requiredText, toInt, toOptText } from "../lib/form-utils";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { FormDialogContent } from "./form-dialog";
import { MutationError } from "./shared";

const schema = z.object({
  code: requiredText("Code", UNIT_LIMITS.codeMaxLength),
  name: requiredText("Name", UNIT_LIMITS.nameMaxLength),
  symbol: requiredText("Symbol", UNIT_LIMITS.symbolMaxLength),
  description: optionalText("Description", UNIT_LIMITS.descriptionMaxLength),
  unitType: z.enum(UNIT_TYPES, { message: "Select a unit type." }),
  decimalPrecision: intString("Decimal precision", { min: UNIT_LIMITS.decimalPrecisionMin, max: UNIT_LIMITS.decimalPrecisionMax }),
});
type Values = z.infer<typeof schema>;

function Body({ unit, onDone }: { unit: UnitResponse | null; onDone: () => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: unit?.code ?? "",
      name: unit?.name ?? "",
      symbol: unit?.symbol ?? "",
      description: unit?.description ?? "",
      unitType: (unit?.unitType ?? "COUNT") as UnitType,
      decimalPrecision: String(unit?.decimalPrecision ?? 0),
    },
  });
  const { errors } = form.formState;
  const mutation = useCatalogMutation({
    mutationFn: (v: Values) => {
      const common = { name: v.name, symbol: v.symbol, description: toOptText(v.description), decimalPrecision: toInt(v.decimalPrecision) };
      return unit ? catalogService.updateUnit(unit.unitId, { ...common, expectedVersion: unit.version }) : catalogService.createUnit({ ...common, code: v.code, unitType: v.unitType });
    },
    invalidate: [catalogKeys.units, catalogKeys.categories],
    successMessage: (u) => `Unit "${u.name}" ${unit ? "updated" : "created"}.`,
    toastOnError: false,
    onSuccess: onDone,
  });

  return (
    <FormDialogContent
      formId="unit-form"
      title={unit ? "Edit unit" : "Create unit"}
      description={unit ? "Code and unit type cannot be changed." : undefined}
      submitLabel={unit ? "Save changes" : "Create unit"}
      submitting={mutation.isPending}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.units]} onReloaded={() => mutation.reset()} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Code" htmlFor="unit-code" required={!unit} error={errors.code?.message} hint={unit ? "Immutable after creation." : lowerCodeHint}>
          <Input {...form.register("code")} maxLength={UNIT_LIMITS.codeMaxLength} disabled={Boolean(unit)} autoComplete="off" />
        </FormField>
        <FormField label="Unit type" htmlFor="unit-type" required={!unit} error={errors.unitType?.message} hint={unit ? "Immutable after creation." : undefined}>
          <NativeSelect {...form.register("unitType")} disabled={Boolean(unit)}>
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Name" htmlFor="unit-name" required error={errors.name?.message}>
          <Input {...form.register("name")} maxLength={UNIT_LIMITS.nameMaxLength} autoComplete="off" />
        </FormField>
        <FormField label="Symbol" htmlFor="unit-symbol" required error={errors.symbol?.message} hint="For example kg, m, pcs.">
          <Input {...form.register("symbol")} maxLength={UNIT_LIMITS.symbolMaxLength} autoComplete="off" />
        </FormField>
        <FormField
          label="Decimal precision"
          htmlFor="unit-precision"
          required
          error={errors.decimalPrecision?.message}
          hint={`${UNIT_LIMITS.decimalPrecisionMin}–${UNIT_LIMITS.decimalPrecisionMax} decimal places for quantities.`}
        >
          <Input {...form.register("decimalPrecision")} inputMode="numeric" className="w-32" />
        </FormField>
      </div>
      <FormField label="Description" htmlFor="unit-description" error={errors.description?.message} hint={`Up to ${UNIT_LIMITS.descriptionMaxLength} characters.`}>
        <Textarea {...form.register("description")} rows={3} maxLength={UNIT_LIMITS.descriptionMaxLength} />
      </FormField>
    </FormDialogContent>
  );
}

export function UnitFormDialog({ open, unit, onOpenChange }: { open: boolean; unit: UnitResponse | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Body unit={unit} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
