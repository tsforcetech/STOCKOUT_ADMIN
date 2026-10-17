import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { CONDITION_LIMITS, GRADE_LIMITS, type ConditionResponse, type GradeResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { catalogKeys } from "../lib/queries";
import { intString, lowerCodeHint, optionalText, requiredText, toInt, toOptText } from "../lib/form-utils";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { FormDialogContent } from "./form-dialog";
import { MutationError } from "./shared";

type Kind = "condition" | "grade";
type Entity = ConditionResponse | GradeResponse;

const limitsFor = (kind: Kind) => (kind === "condition" ? CONDITION_LIMITS : GRADE_LIMITS);

const makeSchema = (kind: Kind) => {
  const l = limitsFor(kind);
  return z.object({
    code: requiredText("Code", l.codeMaxLength),
    name: requiredText("Name", l.nameMaxLength),
    description: optionalText("Description", l.descriptionMaxLength),
    displayOrder: intString("Display order", { min: -2147483648, max: 2147483647 }),
  });
};
type Values = z.infer<ReturnType<typeof makeSchema>>;

const idOf = (e: Entity) => ("conditionId" in e ? e.conditionId : e.gradeId);

function Body({ kind, entity, onDone }: { kind: Kind; entity: Entity | null; onDone: () => void }) {
  const l = limitsFor(kind);
  const label = kind === "condition" ? "Condition" : "Grade";
  const listKey = kind === "condition" ? catalogKeys.conditions : catalogKeys.grades;
  const form = useForm<Values>({
    resolver: zodResolver(makeSchema(kind)),
    defaultValues: { code: entity?.code ?? "", name: entity?.name ?? "", description: entity?.description ?? "", displayOrder: String(entity?.displayOrder ?? 0) },
  });
  const { errors } = form.formState;

  const mutation = useCatalogMutation({
    mutationFn: async (v: Values): Promise<Entity> => {
      const common = { name: v.name, description: toOptText(v.description), displayOrder: toInt(v.displayOrder) };
      if (kind === "condition") {
        return entity
          ? catalogService.updateCondition(idOf(entity), { ...common, expectedVersion: entity.version })
          : catalogService.createCondition({ ...common, code: v.code });
      }
      return entity ? catalogService.updateGrade(idOf(entity), { ...common, expectedVersion: entity.version }) : catalogService.createGrade({ ...common, code: v.code });
    },
    invalidate: [listKey, catalogKeys.conditions, catalogKeys.categories],
    successMessage: (d) => `${label} "${d.name}" ${entity ? "updated" : "created"}.`,
    toastOnError: false,
    onSuccess: onDone,
  });

  return (
    <FormDialogContent
      formId={`${kind}-form`}
      title={entity ? `Edit ${kind}` : `Create ${kind}`}
      description={entity ? `The ${kind} code cannot be changed.` : undefined}
      submitLabel={entity ? "Save changes" : `Create ${kind}`}
      submitting={mutation.isPending}
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <MutationError error={mutation.error} reloadKeys={[listKey]} onReloaded={() => mutation.reset()} />
      <FormField label="Code" htmlFor={`${kind}-code`} required={!entity} error={errors.code?.message} hint={entity ? "Immutable after creation." : lowerCodeHint}>
        <Input {...form.register("code")} maxLength={l.codeMaxLength} disabled={Boolean(entity)} autoComplete="off" />
      </FormField>
      <FormField label="Name" htmlFor={`${kind}-name`} required error={errors.name?.message}>
        <Input {...form.register("name")} maxLength={l.nameMaxLength} autoComplete="off" />
      </FormField>
      <FormField label="Description" htmlFor={`${kind}-description`} error={errors.description?.message} hint={`Up to ${l.descriptionMaxLength} characters.`}>
        <Textarea {...form.register("description")} rows={3} maxLength={l.descriptionMaxLength} />
      </FormField>
      <FormField label="Display order" htmlFor={`${kind}-order`} required error={errors.displayOrder?.message} hint="Lists are sorted by display order, then name.">
        <Input {...form.register("displayOrder")} inputMode="numeric" className="w-32" />
      </FormField>
    </FormDialogContent>
  );
}

export function ConditionGradeFormDialog({ kind, open, entity, onOpenChange }: { kind: Kind; open: boolean; entity: Entity | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Body kind={kind} entity={entity} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
