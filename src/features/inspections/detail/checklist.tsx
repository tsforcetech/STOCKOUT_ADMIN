import * as React from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAccess } from "@/lib/auth/use-access";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type { InspectionDetailDto, InspectionItemResult, InspectionResponseDto, SaveInspectionResponseItem } from "@/api/types/catalog-moderation";
import { inspectionsService } from "@/services/inspections.service";
import { ApiErrorNotice, Notice, PanelTitle, fmtUtc, isConflict } from "@/features/listings/shared";
import { inspectionKeys } from "../queries";

/* allowedOptionsJson has no backend-defined structure. Accept the common shapes; otherwise free text. */
export function parseOptions(json: string | null | undefined): string[] | null {
  if (!json) return null;
  try {
    const raw: unknown = JSON.parse(json);
    const list: unknown = Array.isArray(raw) ? raw : typeof raw === "object" && raw !== null && "options" in raw ? (raw as { options: unknown }).options : null;
    if (!Array.isArray(list)) return null;
    const values = list
      .map((o: unknown) => {
        if (typeof o === "string" || typeof o === "number") return String(o);
        if (typeof o === "object" && o !== null) {
          const r = o as Record<string, unknown>;
          const v = r.value ?? r.code ?? r.label ?? r.name;
          return typeof v === "string" || typeof v === "number" ? String(v) : null;
        }
        return null;
      })
      .filter((v): v is string => v !== null && v !== "");
    return values.length ? values : null;
  } catch {
    return null;
  }
}

function parseMulti(json: string | null): string[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

interface ItemValues {
  id: string;
  passFail: string;
  yesNo: "" | "true" | "false";
  text: string;
  number: string;
  single: string;
  multi: string[];
  multiText: string;
  notes: string;
  itemResult: "" | InspectionItemResult;
}
interface FormValues {
  items: ItemValues[];
}

const toValues = (r: InspectionResponseDto): ItemValues => ({
  id: r.inspectionResponseId,
  passFail: r.passFailValue ?? "",
  yesNo: r.yesNoValue === null ? "" : r.yesNoValue ? "true" : "false",
  text: r.textValue ?? "",
  number: r.numberValue === null ? "" : String(r.numberValue),
  single: r.singleSelectValue ?? "",
  multi: parseMulti(r.multiSelectValueJson),
  multiText: parseMulti(r.multiSelectValueJson).join(", "),
  notes: r.inspectorNotes ?? "",
  itemResult: r.itemResult ?? "",
});

function toPayload(r: InspectionResponseDto, v: ItemValues, options: string[] | null): SaveInspectionResponseItem {
  const base: SaveInspectionResponseItem = { inspectionResponseId: r.inspectionResponseId, inspectorNotes: v.notes.trim() || null, itemResult: v.itemResult || null };
  switch (r.responseTypeSnapshot) {
    case "PASS_FAIL":
      return { ...base, passFailValue: v.passFail || null };
    case "YES_NO":
      return { ...base, yesNoValue: v.yesNo === "" ? null : v.yesNo === "true" };
    case "TEXT":
      return { ...base, textValue: v.text.trim() || null };
    case "NUMBER":
      return { ...base, numberValue: v.number.trim() === "" ? null : Number(v.number) };
    case "SINGLE_SELECT":
      return { ...base, singleSelectValue: v.single || null };
    case "MULTI_SELECT": {
      const list = options ? v.multi : v.multiText.split(",").map((s) => s.trim()).filter(Boolean);
      return { ...base, multiSelectValueJson: list.length ? JSON.stringify(list) : null };
    }
  }
}

/** Did the server's returned row reflect what we sent? */
function reflects(sent: SaveInspectionResponseItem, got: InspectionResponseDto | undefined): boolean {
  if (!got) return false;
  return (
    (sent.itemResult ?? null) === got.itemResult &&
    (sent.inspectorNotes ?? null) === got.inspectorNotes &&
    (sent.passFailValue === undefined || sent.passFailValue === got.passFailValue) &&
    (sent.yesNoValue === undefined || sent.yesNoValue === got.yesNoValue) &&
    (sent.textValue === undefined || sent.textValue === got.textValue) &&
    (sent.numberValue === undefined || sent.numberValue === got.numberValue) &&
    (sent.singleSelectValue === undefined || sent.singleSelectValue === got.singleSelectValue) &&
    (sent.multiSelectValueJson === undefined || JSON.stringify(parseMulti(sent.multiSelectValueJson)) === JSON.stringify(parseMulti(got.multiSelectValueJson)))
  );
}

function answerText(r: InspectionResponseDto): string {
  switch (r.responseTypeSnapshot) {
    case "PASS_FAIL":
      return r.passFailValue ?? "—";
    case "YES_NO":
      return r.yesNoValue === null ? "—" : r.yesNoValue ? "Yes" : "No";
    case "TEXT":
      return r.textValue ?? "—";
    case "NUMBER":
      return r.numberValue === null ? "—" : String(r.numberValue);
    case "SINGLE_SELECT":
      return r.singleSelectValue ?? "—";
    case "MULTI_SELECT": {
      const l = parseMulti(r.multiSelectValueJson);
      return l.length ? l.join(", ") : "—";
    }
  }
}

function ItemHeader({ r }: { r: InspectionResponseDto }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {r.itemLabelSnapshot}
          {r.isRequiredSnapshot && (
            <span className="ml-1 text-danger" aria-label="required">
              *
            </span>
          )}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{r.itemCodeSnapshot}</p>
        {r.itemDescriptionSnapshot && <p className="mt-1 text-sm text-muted-foreground">{r.itemDescriptionSnapshot}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="outline">{r.responseTypeSnapshot.replace(/_/g, " ")}</Badge>
        {r.requiresEvidenceSnapshot && <Badge tone="info">Evidence required</Badge>}
      </div>
    </div>
  );
}

function AnswerInput({ r, i, options, register, numberError }: { r: InspectionResponseDto; i: number; options: string[] | null; register: UseFormRegister<FormValues>; numberError?: string }) {
  const id = `answer-${r.inspectionResponseId}`;
  switch (r.responseTypeSnapshot) {
    case "PASS_FAIL":
      return (
        <FormField label="Answer" htmlFor={id}>
          <NativeSelect {...register(`items.${i}.passFail`)}>
            <option value="">Not answered</option>
            <option value="PASS">Pass</option>
            <option value="FAIL">Fail</option>
          </NativeSelect>
        </FormField>
      );
    case "YES_NO":
      return (
        <FormField label="Answer" htmlFor={id}>
          <NativeSelect {...register(`items.${i}.yesNo`)}>
            <option value="">Not answered</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </NativeSelect>
        </FormField>
      );
    case "TEXT":
      return (
        <FormField label="Answer" htmlFor={id}>
          <Textarea rows={2} maxLength={2000} {...register(`items.${i}.text`)} />
        </FormField>
      );
    case "NUMBER":
      return (
        <FormField label="Answer" htmlFor={id} error={numberError}>
          <Input type="number" step="any" inputMode="decimal" {...register(`items.${i}.number`)} />
        </FormField>
      );
    case "SINGLE_SELECT":
      return options ? (
        <FormField label="Answer" htmlFor={id}>
          <NativeSelect {...register(`items.${i}.single`)}>
            <option value="">Not answered</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : (
        <FormField label="Answer" htmlFor={id} hint="Allowed options are not available; enter the value.">
          <Input {...register(`items.${i}.single`)} />
        </FormField>
      );
    case "MULTI_SELECT":
      return options ? (
        <fieldset>
          <legend className="mb-1.5 text-sm text-body">Answer</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {options.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" value={o} {...register(`items.${i}.multi`)} />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <FormField label="Answer" htmlFor={id} hint="Comma-separated values (allowed options are not available).">
          <Input {...register(`items.${i}.multiText`)} />
        </FormField>
      );
  }
}

export function ChecklistPanel({ inspection, editable }: { inspection: InspectionDetailDto; editable: boolean }) {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const responses = React.useMemo(() => [...inspection.responses].sort((a, b) => a.displayOrderSnapshot - b.displayOrderSnapshot), [inspection.responses]);
  const canReadTemplate = can(P.INSPECTIONS_TEMPLATES_MANAGE);
  const template = useQuery({
    queryKey: inspectionKeys.template(inspection.inspectionChecklistTemplateId),
    queryFn: ({ signal }) => inspectionsService.template(inspection.inspectionChecklistTemplateId, signal),
    enabled: editable && canReadTemplate,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const optionsFor = React.useCallback(
    (r: InspectionResponseDto) => parseOptions(template.data?.items.find((t) => t.inspectionChecklistTemplateItemId === r.sourceTemplateItemId)?.allowedOptionsJson),
    [template.data],
  );

  // Initialised once per inspection: refetches never overwrite what the inspector has typed.
  const form = useForm<FormValues>({ defaultValues: { items: responses.map(toValues) } });
  const [notPersisted, setNotPersisted] = React.useState<number | null>(null);

  const save = useApiMutation({
    mutationFn: async (values: FormValues) => {
      const payload = responses.map((r, i) => toPayload(r, values.items[i], optionsFor(r)));
      try {
        const result = await inspectionsService.saveResponses(inspection.inspectionId, { expectedRowVersion: inspection.rowVersion, responses: payload });
        const byId = new Map(result.responses.map((x) => [x.inspectionResponseId, x]));
        return payload.filter((p) => !reflects(p, byId.get(p.inspectionResponseId))).length;
      } catch (e) {
        if (isConflict(e)) await queryClient.invalidateQueries({ queryKey: inspectionKeys.detail(inspection.inspectionId) });
        throw e;
      }
    },
    toastOnError: false,
    // The rowVersion advances even when nothing is stored, so always reload the detail.
    invalidate: [inspectionKeys.detail(inspection.inspectionId)],
    onSuccess: (missing) => {
      setNotPersisted(missing);
      if (missing === 0) toast.success("Checklist responses saved.");
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    let ok = true;
    responses.forEach((r, i) => {
      if (r.responseTypeSnapshot === "NUMBER" && values.items[i].number.trim() !== "" && !Number.isFinite(Number(values.items[i].number))) {
        form.setError(`items.${i}.number`, { message: "Enter a number." });
        ok = false;
      }
    });
    if (ok) {
      setNotPersisted(null);
      save.mutate(values);
    }
  });

  const answeredRequired = responses.filter((r) => r.isRequiredSnapshot && r.itemResult).length;
  const required = responses.filter((r) => r.isRequiredSnapshot).length;

  return (
    <SectionCard>
      <PanelTitle
        title="Checklist"
        description={`${responses.length} item${responses.length === 1 ? "" : "s"} snapshotted from the template · ${answeredRequired}/${required} required items have a stored result.`}
      />
      {responses.length === 0 ? (
        <p className="text-sm text-muted-foreground">This inspection has no checklist items.</p>
      ) : editable ? (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {editable && canReadTemplate && template.error ? <Notice>Allowed options for select items could not be loaded; enter values as text.</Notice> : null}
          {editable && !canReadTemplate && responses.some((r) => r.responseTypeSnapshot.endsWith("SELECT")) && (
            <Notice>Select options come from the checklist template, which requires inspections.templates.manage. Enter select values as text.</Notice>
          )}
          <ol className="space-y-3">
            {responses.map((r, i) => (
              <li key={r.inspectionResponseId} className="space-y-3 rounded-lg border border-border p-4">
                <ItemHeader r={r} />
                <div className="grid gap-3 md:grid-cols-2">
                  <AnswerInput r={r} i={i} options={optionsFor(r)} register={form.register} numberError={form.formState.errors.items?.[i]?.number?.message} />
                  <FormField label="Item result" htmlFor={`result-${r.inspectionResponseId}`} required={r.isRequiredSnapshot}>
                    <NativeSelect {...form.register(`items.${i}.itemResult`)}>
                      <option value="">No result</option>
                      <option value="PASS">Pass</option>
                      <option value="FAIL">Fail</option>
                      <option value="NOT_APPLICABLE">Not applicable</option>
                    </NativeSelect>
                  </FormField>
                  <FormField label="Inspector notes" htmlFor={`notes-${r.inspectionResponseId}`} className="md:col-span-2">
                    <Textarea rows={2} maxLength={2000} {...form.register(`items.${i}.notes`)} />
                  </FormField>
                </div>
              </li>
            ))}
          </ol>
          {notPersisted !== null && notPersisted > 0 && (
            <Notice tone="danger" title="The server did not store your answers">
              The save call succeeded, but {notPersisted} of {responses.length} item{responses.length === 1 ? "" : "s"} came back unchanged. Your input is kept on this page; refresh
              the inspection and save again, and report it if it keeps happening.
            </Notice>
          )}
          <ApiErrorNotice error={save.error} />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save responses
            </Button>
          </div>
        </form>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {responses.map((r) => (
            <li key={r.inspectionResponseId} className="space-y-2 p-4">
              <ItemHeader r={r} />
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-xs text-muted-foreground">Answer</span>
                  <p>{answerText(r)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Item result</span>
                  <p>{r.itemResult ? <StatusBadge value={r.itemResult} /> : "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Answered</span>
                  <p>{fmtUtc(r.answeredAtUtc)}</p>
                </div>
                {r.inspectorNotes && <p className="whitespace-pre-wrap sm:col-span-3">{r.inspectorNotes}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
