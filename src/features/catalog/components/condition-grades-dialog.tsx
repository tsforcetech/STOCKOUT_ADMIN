import * as React from "react";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useAccess } from "@/lib/auth/use-access";
import { CATALOG_TAXONOMY_PERMISSIONS as CT, CONDITION_LIMITS, type ConditionGradeResponse, type ConditionResponse, type GradeResponse } from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { catalogKeys, useConditionGradesQuery, useGradesQuery } from "../lib/queries";
import { useCatalogMutation } from "../lib/use-catalog-mutation";
import { MutationError, Notice, statusValue } from "./shared";

type Row = { selected: boolean; order: string };
const EMPTY_ROW: Row = { selected: false, order: "0" };

function GradeEditor({ condition, mapped, grades, onDone }: { condition: ConditionResponse; mapped: ConditionGradeResponse[]; grades: GradeResponse[]; onDone: () => void }) {
  const [rows, setRows] = React.useState<Record<string, Row>>(() => {
    const init: Record<string, Row> = {};
    for (const g of grades) init[g.gradeId] = { selected: false, order: "0" };
    for (const m of mapped) if (m.isActive) init[m.gradeId] = { selected: true, order: String(m.displayOrder) };
    return init;
  });
  const [validation, setValidation] = React.useState<string | null>(null);

  const mutation = useCatalogMutation({
    mutationFn: (items: Array<{ gradeId: string; displayOrder: number }>) => catalogService.replaceConditionGrades(condition.conditionId, { expectedVersion: condition.version, grades: items }),
    invalidate: [catalogKeys.conditions, catalogKeys.conditionGrades(condition.conditionId), catalogKeys.categories],
    successMessage: `Grades for "${condition.name}" updated.`,
    toastOnError: false,
    onSuccess: onDone,
  });

  const selected = Object.entries(rows).filter(([, r]) => r.selected);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidation(null);
    if (selected.length > CONDITION_LIMITS.conditionGradesMaxItems) {
      setValidation(`A condition can have at most ${CONDITION_LIMITS.conditionGradesMaxItems} grades.`);
      return;
    }
    const bad = selected.find(([, r]) => !/^-?\d+$/.test(r.order.trim()));
    if (bad) {
      setValidation("Every selected grade needs a whole-number display order.");
      return;
    }
    mutation.mutate(selected.map(([gradeId, r]) => ({ gradeId, displayOrder: Number.parseInt(r.order, 10) })));
  };

  const update = (id: string, patch: Partial<Row>) => setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_ROW), ...patch } }));

  return (
    <form id="condition-grades-form" onSubmit={submit} noValidate className="space-y-4">
      <MutationError error={mutation.error} reloadKeys={[catalogKeys.conditions, catalogKeys.conditionGrades(condition.conditionId)]} onReloaded={() => mutation.reset()} />
      {validation && (
        <p role="alert" className="text-sm text-danger-soft-foreground">
          {validation}
        </p>
      )}
      {grades.length === 0 ? (
        <EmptyState title="No grades defined" description="Create grades on the Grades tab first." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-max text-sm">
            <caption className="sr-only">Grades for {condition.name}</caption>
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="h-10 px-3 text-left font-medium">
                  Include
                </th>
                <th scope="col" className="px-3 text-left font-medium">
                  Grade
                </th>
                <th scope="col" className="px-3 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 text-left font-medium">
                  Display order
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {grades.map((g) => {
                const row = rows[g.gradeId] ?? EMPTY_ROW;
                const disabled = !g.isActive && !row.selected;
                return (
                  <tr key={g.gradeId}>
                    <td className="px-3 py-2">
                      <Checkbox
                        id={`grade-${g.gradeId}`}
                        checked={row.selected}
                        disabled={disabled}
                        onCheckedChange={(v) => update(g.gradeId, { selected: v === true })}
                        aria-label={`Include ${g.name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label htmlFor={`grade-${g.gradeId}`} className="block">
                        <span className="block">{g.name}</span>
                        <span className="block text-xs text-muted-foreground">{g.code}</span>
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge value={statusValue(g.isActive)} />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-8 w-24"
                        inputMode="numeric"
                        value={row.order}
                        disabled={!row.selected}
                        onChange={(e) => update(g.gradeId, { order: e.target.value })}
                        aria-label={`Display order for ${g.name}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {selected.length} selected. Saving replaces the full grade list. Inactive grades cannot be added (409 GRADE_ALREADY_INACTIVE); an empty list is rejected while a category requires grades for this
        condition.
      </p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <DialogClose asChild>
          <Button variant="secondary" disabled={mutation.isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" loading={mutation.isPending}>
          Save grades
        </Button>
      </div>
    </form>
  );
}

function ReadOnlyList({ mapped }: { mapped: ConditionGradeResponse[] }) {
  const active = mapped.filter((m) => m.isActive);
  if (!active.length) return <EmptyState title="No grades mapped" description="This condition has no active grade mappings." />;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {active.map((m) => (
        <li key={m.gradeId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span>
            {m.name} <span className="text-xs text-muted-foreground">{m.code}</span>
          </span>
          <span className="text-xs text-muted-foreground">Order {m.displayOrder}</span>
        </li>
      ))}
    </ul>
  );
}

function Body({ condition, onDone }: { condition: ConditionResponse; onDone: () => void }) {
  const { can } = useAccess();
  const canEdit = can(CT.conditionsUpdate);
  const canGrades = can(CT.gradesView);
  const mappedQuery = useConditionGradesQuery(condition.conditionId);
  const gradesQuery = useGradesQuery(canEdit && canGrades);
  const loading = mappedQuery.isLoading || (canEdit && canGrades && gradesQuery.isLoading);
  const error = mappedQuery.error ?? (canEdit && canGrades ? gradesQuery.error : null);

  return (
    <DialogContent title={`Grades · ${condition.name}`} description="Grades a seller can pick when listing an item in this condition." size="lg" onInteractOutside={(e) => e.preventDefault()}>
      {loading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void mappedQuery.refetch();
            if (canEdit && canGrades) void gradesQuery.refetch();
          }}
        />
      ) : canEdit && canGrades ? (
        <GradeEditor condition={condition} mapped={mappedQuery.data ?? []} grades={gradesQuery.data ?? []} onDone={onDone} />
      ) : (
        <div className="space-y-3">
          {canEdit && !canGrades && <Notice>Editing grade mappings needs the catalog.grades.view permission to list available grades.</Notice>}
          <ReadOnlyList mapped={mappedQuery.data ?? []} />
        </div>
      )}
    </DialogContent>
  );
}

export function ConditionGradesDialog({ condition, onOpenChange }: { condition: ConditionResponse | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={condition !== null} onOpenChange={onOpenChange}>
      {condition && <Body condition={condition} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
