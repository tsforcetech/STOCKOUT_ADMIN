import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import {
  ATTRIBUTE_DATA_TYPES,
  ATTRIBUTE_LIMITS as L,
  type AdminAttributeDefinitionResponse,
  type AttributeDataType,
  type CreateAttributeDefinitionRequest,
} from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { humanize } from "@/lib/utils/format";
import { catalogKeys } from "../lib/queries";
import { numToString, optionalText, requiredText, toOptInt, toOptNum, toOptText } from "../lib/form-utils";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { FormDialogContent } from "./form-dialog";
import { MutationError, Notice } from "./shared";

const INT_RE = /^-?\d+$/;
const NUM_RE = /^-?(\d+(\.\d*)?|\.\d+)$/;

const makeSchema = (isEdit: boolean) =>
  z
    .object({
      code: z.string(),
      name: requiredText("Name", L.nameMaxLength),
      description: optionalText("Description", L.descriptionMaxLength),
      dataType: z.enum(ATTRIBUTE_DATA_TYPES, { message: "Select a data type." }),
      minLength: z.string(),
      maxLength: z.string(),
      minValue: z.string(),
      maxValue: z.string(),
      decimalPrecision: z.string(),
      regexPattern: z.string(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!isEdit) {
        // The server checks the pattern BEFORE trimming/lowercasing, so the raw value must match.
        if (v.code === "") issue("code", "Code is required.");
        else if (!L.codePattern.test(v.code)) issue("code", "Use only lowercase letters, digits and underscores (no spaces).");
        else if (v.code.length > L.codeMaxLength) issue("code", `Code must be at most ${L.codeMaxLength} characters.`);
      }
      const int = (field: "minLength" | "maxLength" | "minValue" | "maxValue" | "decimalPrecision", label: string, min?: number, max?: number) => {
        const raw = v[field].trim();
        if (raw === "") return null;
        if (!INT_RE.test(raw)) {
          issue(field, `${label} must be a whole number.`);
          return null;
        }
        const n = Number(raw);
        if (min !== undefined && n < min) issue(field, `${label} must be at least ${min}.`);
        if (max !== undefined && n > max) issue(field, `${label} must be at most ${max}.`);
        return n;
      };
      const num = (field: "minValue" | "maxValue", label: string) => {
        const raw = v[field].trim();
        if (raw === "") return null;
        if (!NUM_RE.test(raw)) {
          issue(field, `${label} must be a number.`);
          return null;
        }
        return Number(raw);
      };
      if (v.dataType === "TEXT") {
        const min = int("minLength", "Min length", 0);
        const max = int("maxLength", "Max length", 0);
        if (min !== null && max !== null && max < min) issue("maxLength", "Max length must be at least the min length.");
        if (v.regexPattern.length > L.regexPatternMaxLength) issue("regexPattern", `Pattern must be at most ${L.regexPatternMaxLength} characters.`);
        else if (v.regexPattern !== "") {
          try {
            new RegExp(v.regexPattern);
          } catch {
            issue("regexPattern", "This is not a valid regular expression.");
          }
        }
      } else if (v.dataType === "INTEGER") {
        const min = int("minValue", "Min value");
        const max = int("maxValue", "Max value");
        if (min !== null && max !== null && max < min) issue("maxValue", "Max value must be at least the min value.");
      } else if (v.dataType === "DECIMAL") {
        const min = num("minValue", "Min value");
        const max = num("maxValue", "Max value");
        if (min !== null && max !== null && max < min) issue("maxValue", "Max value must be at least the min value.");
        int("decimalPrecision", "Decimal precision", L.decimalPrecisionMin, L.decimalPrecisionMax);
      }
    });
type Values = z.infer<ReturnType<typeof makeSchema>>;

type Constraints = Pick<CreateAttributeDefinitionRequest, "minLength" | "maxLength" | "minValue" | "maxValue" | "decimalPrecision" | "regexPattern">;

/** Only the constraints valid for the data type are sent; all others must be null (contract §2.1). */
function constraintsFor(dataType: AttributeDataType, v: Values): Constraints {
  const none: Constraints = { minLength: null, maxLength: null, minValue: null, maxValue: null, decimalPrecision: null, regexPattern: null };
  switch (dataType) {
    case "TEXT":
      return { ...none, minLength: toOptInt(v.minLength), maxLength: toOptInt(v.maxLength), regexPattern: v.regexPattern === "" ? null : v.regexPattern };
    case "INTEGER":
      return { ...none, minValue: toOptInt(v.minValue), maxValue: toOptInt(v.maxValue) };
    case "DECIMAL":
      return { ...none, minValue: toOptNum(v.minValue), maxValue: toOptNum(v.maxValue), decimalPrecision: toOptInt(v.decimalPrecision) };
    default:
      return none;
  }
}

function Body({ attribute, onDone }: { attribute: AdminAttributeDefinitionResponse | null; onDone: () => void }) {
  const isEdit = attribute !== null;
  const form = useForm<Values>({
    resolver: zodResolver(makeSchema(isEdit)),
    defaultValues: {
      code: attribute?.code ?? "",
      name: attribute?.name ?? "",
      description: attribute?.description ?? "",
      dataType: attribute?.dataType ?? "TEXT",
      minLength: numToString(attribute?.minLength),
      maxLength: numToString(attribute?.maxLength),
      minValue: numToString(attribute?.minValue),
      maxValue: numToString(attribute?.maxValue),
      decimalPrecision: numToString(attribute?.decimalPrecision),
      regexPattern: attribute?.regexPattern ?? "",
    },
  });
  const { errors } = form.formState;
  const dataType = useWatch({ control: form.control, name: "dataType" });

  const mutation = useCatalogMutation({
    mutationFn: (v: Values) => {
      const constraints = constraintsFor(v.dataType, v);
      return attribute
        ? catalogService.updateAttribute(attribute.attributeDefinitionId, { name: v.name, description: toOptText(v.description), ...constraints, expectedVersion: attribute.version })
        : catalogService.createAttribute({ code: v.code, name: v.name, description: toOptText(v.description), dataType: v.dataType, ...constraints });
    },
    invalidate: [catalogKeys.attributes, catalogKeys.categories],
    successMessage: (a) => `Attribute "${a.name}" ${attribute ? "updated" : "created"}.`,
    toastOnError: false,
    onSuccess: onDone,
  });

  return (
    <FormDialogContent
      formId="attribute-form"
      title={isEdit ? "Edit attribute" : "Create attribute"}
      description={isEdit ? "Code and data type cannot be changed." : "Attributes describe listings and are assigned per category."}
      size="lg"
      submitLabel={isEdit ? "Save changes" : "Create attribute"}
      submitting={mutation.isPending}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.attributes]} onReloaded={() => mutation.reset()} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Code"
          htmlFor="attr-code"
          required={!isEdit}
          error={errors.code?.message}
          hint={isEdit ? "Immutable after creation." : "Lowercase letters, digits and underscores, e.g. screen_size."}
        >
          <Input {...form.register("code")} maxLength={L.codeMaxLength} disabled={isEdit} autoComplete="off" spellCheck={false} />
        </FormField>
        <FormField label="Data type" htmlFor="attr-type" required={!isEdit} error={errors.dataType?.message} hint={isEdit ? "Immutable after creation." : undefined}>
          <NativeSelect {...form.register("dataType")} disabled={isEdit}>
            {ATTRIBUTE_DATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField label="Name" htmlFor="attr-name" required error={errors.name?.message}>
        <Input {...form.register("name")} maxLength={L.nameMaxLength} autoComplete="off" />
      </FormField>
      <FormField label="Description" htmlFor="attr-description" error={errors.description?.message} hint={`Up to ${L.descriptionMaxLength} characters.`}>
        <Textarea {...form.register("description")} rows={3} maxLength={L.descriptionMaxLength} />
      </FormField>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Validation rules</legend>
        {dataType === "TEXT" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Min length" htmlFor="attr-minlen" error={errors.minLength?.message}>
                <Input {...form.register("minLength")} inputMode="numeric" />
              </FormField>
              <FormField label="Max length" htmlFor="attr-maxlen" error={errors.maxLength?.message}>
                <Input {...form.register("maxLength")} inputMode="numeric" />
              </FormField>
            </div>
            <FormField label="Regex pattern" htmlFor="attr-regex" error={errors.regexPattern?.message} hint="Must also compile as a .NET regular expression on the server.">
              <Input {...form.register("regexPattern")} maxLength={L.regexPatternMaxLength} className="font-mono" spellCheck={false} autoComplete="off" />
            </FormField>
          </>
        )}
        {(dataType === "INTEGER" || dataType === "DECIMAL") && (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Min value" htmlFor="attr-minval" error={errors.minValue?.message} hint={dataType === "DECIMAL" ? "Stored with 4 decimals." : "Whole number."}>
              <Input {...form.register("minValue")} inputMode={dataType === "DECIMAL" ? "decimal" : "numeric"} />
            </FormField>
            <FormField label="Max value" htmlFor="attr-maxval" error={errors.maxValue?.message}>
              <Input {...form.register("maxValue")} inputMode={dataType === "DECIMAL" ? "decimal" : "numeric"} />
            </FormField>
            {dataType === "DECIMAL" && (
              <FormField label="Decimal precision" htmlFor="attr-precision" error={errors.decimalPrecision?.message} hint={`${L.decimalPrecisionMin}–${L.decimalPrecisionMax}`}>
                <Input {...form.register("decimalPrecision")} inputMode="numeric" />
              </FormField>
            )}
          </div>
        )}
        {(dataType === "BOOLEAN" || dataType === "DATE") && <p className="text-sm text-muted-foreground">This data type has no configurable validation rules.</p>}
        {(dataType === "SINGLE_SELECT" || dataType === "MULTI_SELECT") && (
          <Notice>Select attributes have no validation rules. Manage their options from the attribute list after saving.</Notice>
        )}
      </fieldset>
    </FormDialogContent>
  );
}

export function AttributeFormDialog({ open, attribute, onOpenChange }: { open: boolean; attribute: AdminAttributeDefinitionResponse | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Body attribute={attribute} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
