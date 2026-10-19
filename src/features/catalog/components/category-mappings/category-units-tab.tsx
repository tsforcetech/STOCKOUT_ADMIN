import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { DetailList } from "@/components/common/page-header";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useAccess } from "@/lib/auth/use-access";
import { newId } from "@/lib/utils/id";
import { formatNumber } from "@/lib/utils/format";
import {
  CATALOG_TAXONOMY_PERMISSIONS as CT,
  INHERITANCE_MODES,
  UNIT_LIMITS,
  type AdminCategoryResponse,
  type AdminCategoryUnitItem,
  type AdminCategoryUnitsResponse,
  type DirectCategoryUnitRequest,
  type InheritanceMode,
  type UnitResponse,
} from "@/api/types/catalog-taxonomy";
import { catalogService } from "@/services/catalog.service";
import { catalogKeys, useUnitsQuery } from "../../lib/queries";
import { hasErrorCode } from "../../lib/errors";
import { useCatalogMutation } from "../../lib/use-catalog-mutation";
import { FormDialogContent } from "../form-dialog";
import { MutationError, Notice } from "../shared";
import { INT_RE, MappingSection, NUM_RE, RemoveRowButton, SimpleTable, SourceCategory, tdClass, thClass } from "./mapping-ui";

type Row = { key: string; unitId: string; order: string; min: string; max: string; precision: string };

const BROKEN_PUT_NOTICE =
  "Known backend defect: saving a non-empty unit list currently fails with 404 UNIT_NOT_FOUND (the service sends PascalCase JSON keys the database procedure cannot read). Only an empty list works today — it clears direct units and saves the inheritance mode and default unit.";

function validateRows(rows: Row[]): string | null {
  if (rows.some((r) => !r.unitId)) return "Choose a unit for every row, or remove empty rows.";
  if (new Set(rows.map((r) => r.unitId)).size !== rows.length) return "Each unit can only be assigned once.";
  for (const r of rows) {
    if (!INT_RE.test(r.order.trim())) return "Display order must be a whole number.";
    const min = r.min.trim();
    const max = r.max.trim();
    if (min && (!NUM_RE.test(min) || Number(min) <= UNIT_LIMITS.minQuantityExclusiveMin)) return "Minimum quantity must be a number greater than 0.";
    if (max && !NUM_RE.test(max)) return "Maximum quantity must be a number.";
    if (min && max && Number(max) < Number(min)) return "Maximum quantity must be at least the minimum.";
    const p = r.precision.trim();
    if (p && (!INT_RE.test(p) || Number(p) < UNIT_LIMITS.quantityDecimalPrecisionMin || Number(p) > UNIT_LIMITS.quantityDecimalPrecisionMax))
      return `Quantity decimals must be a whole number from ${UNIT_LIMITS.quantityDecimalPrecisionMin} to ${UNIT_LIMITS.quantityDecimalPrecisionMax}.`;
  }
  return null;
}

function Editor({ category, data, units, onDone }: { category: AdminCategoryResponse; data: AdminCategoryUnitsResponse; units: UnitResponse[]; onDone: () => void }) {
  const [mode, setMode] = React.useState<InheritanceMode>(data.inheritanceMode);
  const [defaultUnitId, setDefaultUnitId] = React.useState(data.defaultUnitId ?? "");
  const [rows, setRows] = React.useState<Row[]>(() =>
    data.directAssignments.map((u) => ({
      key: u.unitId,
      unitId: u.unitId,
      order: String(u.displayOrder),
      min: u.minQuantity === null ? "" : String(u.minQuantity),
      max: u.maxQuantity === null ? "" : String(u.maxQuantity),
      precision: u.quantityDecimalPrecision === null ? "" : String(u.quantityDecimalPrecision),
    })),
  );
  const [validation, setValidation] = React.useState<string | null>(null);

  // Default must be effective: inherited units (only while inheriting) plus the direct rows.
  const defaultChoices = React.useMemo(() => {
    const ids = new Set<string>(rows.map((r) => r.unitId).filter(Boolean));
    if (mode === "INHERIT") data.inheritedAssignments.forEach((u) => ids.add(u.unitId));
    if (data.defaultUnitId) ids.add(data.defaultUnitId);
    const byId = new Map(units.map((u) => [u.unitId, u]));
    return [...ids].map((id) => ({ id, label: byId.get(id)?.name ?? data.effectiveUnits.find((u) => u.unitId === id)?.name ?? id }));
  }, [rows, mode, data, units]);

  const mutation = useCatalogMutation({
    mutationFn: (body: DirectCategoryUnitRequest[]) =>
      catalogService.updateCategoryUnits(category.categoryId, { expectedCategoryVersion: data.categoryVersion, inheritanceMode: mode, defaultUnitId: defaultUnitId || null, units: body }),
    invalidate: [catalogKeys.category(category.categoryId), catalogKeys.categories],
    successMessage: `Units of "${category.name}" updated.`,
    toastOnError: false,
    onSuccess: onDone,
  });

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateRows(rows);
    setValidation(problem);
    if (problem) return;
    mutation.mutate(
      rows.map((r) => ({
        unitId: r.unitId,
        displayOrder: Number.parseInt(r.order, 10),
        minQuantity: r.min.trim() ? Number(r.min) : null,
        maxQuantity: r.max.trim() ? Number(r.max) : null,
        quantityDecimalPrecision: r.precision.trim() ? Number.parseInt(r.precision, 10) : null,
      })),
    );
  };
  const brokenFailure = hasErrorCode(mutation.error, "UNIT_NOT_FOUND") && rows.length > 0;

  return (
    <FormDialogContent
      formId="category-units-form"
      title="Edit unit rules"
      description={`Replaces the unit configuration and direct units of "${category.name}".`}
      size="xl"
      submitLabel="Save units"
      submitting={mutation.isPending}
      onSubmit={submit}
    >
      <Notice tone="warning">{BROKEN_PUT_NOTICE}</Notice>
      {brokenFailure ? (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
          The server answered 404 UNIT_NOT_FOUND. This is the known backend defect above, not a problem with the units you picked. Remove all unit rows to save only the inheritance mode and default
          unit.
        </div>
      ) : (
        <MutationError error={mutation.error} reloadKeys={[catalogKeys.category(category.categoryId)]} onReloaded={onDone} />
      )}
      {validation && (
        <p role="alert" className="text-sm text-danger-soft-foreground">
          {validation}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cu-mode">
            Inheritance mode<span className="ml-0.5 text-danger" aria-hidden>*</span>
          </Label>
          <NativeSelect id="cu-mode" value={mode} onChange={(e) => setMode(e.target.value as InheritanceMode)}>
            {INHERITANCE_MODES.map((m) => (
              <option key={m} value={m}>
                {m === "INHERIT" ? "Inherit (add to ancestors' units)" : "Override (ignore ancestors' units)"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cu-default">Default unit</Label>
          <NativeSelect id="cu-default" value={defaultUnitId} onChange={(e) => setDefaultUnitId(e.target.value)} aria-describedby="cu-default-hint">
            <option value="">No default</option>
            {defaultChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
          <p id="cu-default-hint" className="text-xs text-muted-foreground">
            Must be one of the category's effective units.
          </p>
        </div>
      </div>
      <div className="relative overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">Direct units</caption>
          <thead className="bg-surface-muted">
            <tr>
              <th scope="col" className={thClass}>
                Unit
              </th>
              <th scope="col" className={thClass}>
                Order
              </th>
              <th scope="col" className={thClass}>
                Min qty
              </th>
              <th scope="col" className={thClass}>
                Max qty
              </th>
              <th scope="col" className={thClass}>
                Decimals
              </th>
              <th scope="col" className={thClass}>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No direct units.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className={tdClass}>
                  <NativeSelect className="w-56" value={r.unitId} onChange={(e) => update(r.key, { unitId: e.target.value })} aria-label={`Unit for row ${i + 1}`}>
                    <option value="">Select unit…</option>
                    {units.map((u) => (
                      <option key={u.unitId} value={u.unitId} disabled={!u.isActive && u.unitId !== r.unitId}>
                        {u.name} ({u.symbol}){u.isActive ? "" : " — inactive"}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className={tdClass}>
                  <Input className="w-20" inputMode="numeric" value={r.order} onChange={(e) => update(r.key, { order: e.target.value })} aria-label={`Display order for row ${i + 1}`} />
                </td>
                <td className={tdClass}>
                  <Input className="w-24" inputMode="decimal" value={r.min} onChange={(e) => update(r.key, { min: e.target.value })} aria-label={`Minimum quantity for row ${i + 1}`} />
                </td>
                <td className={tdClass}>
                  <Input className="w-24" inputMode="decimal" value={r.max} onChange={(e) => update(r.key, { max: e.target.value })} aria-label={`Maximum quantity for row ${i + 1}`} />
                </td>
                <td className={tdClass}>
                  <Input className="w-20" inputMode="numeric" value={r.precision} onChange={(e) => update(r.key, { precision: e.target.value })} aria-label={`Quantity decimals for row ${i + 1}`} />
                </td>
                <td className={tdClass}>
                  <div className="pt-1.5">
                    <RemoveRowButton label={`Remove row ${i + 1}`} onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" size="sm" onClick={() => setRows((prev) => [...prev, { key: newId(), unitId: "", order: String(prev.length), min: "", max: "", precision: "" }])}>
        <PlusIcon /> Add unit
      </Button>
    </FormDialogContent>
  );
}

export function CategoryUnitsTab({ category, nameOf }: { category: AdminCategoryResponse; nameOf: (id: string) => string | undefined }) {
  const { can } = useAccess();
  const id = category.categoryId;
  const query = useQuery({ queryKey: catalogKeys.categoryUnits(id), queryFn: ({ signal }) => catalogService.categoryUnits(id, signal) });
  const canEdit = can(CT.categoryUnitsManage) && can(CT.unitsView);
  const [open, setOpen] = React.useState(false);
  const unitsQuery = useUnitsQuery(canEdit && open);

  if (query.isLoading) return <TableSkeleton rows={4} columns={5} />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  const defaultUnit = data.effectiveUnits.find((u) => u.unitId === data.defaultUnitId);

  const columns = [
    { header: "Unit", cell: (u: AdminCategoryUnitItem) => <span>{u.name} <span className="text-xs text-muted-foreground">({u.symbol})</span></span> },
    { header: "Min qty", cell: (u: AdminCategoryUnitItem) => formatNumber(u.minQuantity) },
    { header: "Max qty", cell: (u: AdminCategoryUnitItem) => formatNumber(u.maxQuantity) },
    { header: "Decimals", cell: (u: AdminCategoryUnitItem) => formatNumber(u.quantityDecimalPrecision) },
    { header: "Source", cell: (u: AdminCategoryUnitItem) => (u.isInherited ? <SourceCategory id={u.sourceCategoryId} nameOf={nameOf} /> : <Badge tone="primary">Direct</Badge>) },
  ];

  return (
    <div className="space-y-6">
      <MappingSection
        title="Unit rules"
        actions={
          canEdit &&
          category.isActive && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <PencilSimpleIcon /> Edit units
            </Button>
          )
        }
      >
        <DetailList
          columns={3}
          items={[
            { label: "Inheritance mode", value: data.inheritanceMode === "OVERRIDE" ? "Override ancestors" : "Inherit from ancestors" },
            { label: "Default unit (configured here)", value: data.defaultUnitId ? (defaultUnit?.name ?? data.defaultUnitId) : "None" },
            { label: "Direct / inherited", value: `${data.directAssignments.length} / ${data.inheritedAssignments.length}` },
          ]}
        />
      </MappingSection>
      <MappingSection title="Effective units" description="What sellers can use for quantities in this category.">
        <SimpleTable rows={data.effectiveUnits} columns={columns} getKey={(u) => `${u.unitId}:${u.sourceCategoryId}`} caption="Effective units" emptyTitle="No units apply" />
      </MappingSection>
      {canEdit && <Notice tone="warning">{BROKEN_PUT_NOTICE}</Notice>}

      <Dialog open={open} onOpenChange={setOpen}>
        {open &&
          (unitsQuery.isLoading || unitsQuery.error ? (
            <FormDialogContent formId="category-units-loading" title="Edit unit rules" submitting={false} submitDisabled onSubmit={(e) => e.preventDefault()}>
              {unitsQuery.error ? <ErrorState error={unitsQuery.error} onRetry={() => unitsQuery.refetch()} /> : <TableSkeleton rows={3} columns={4} />}
            </FormDialogContent>
          ) : (
            <Editor category={category} data={data} units={unitsQuery.data ?? []} onDone={() => setOpen(false)} />
          ))}
      </Dialog>
    </div>
  );
}
