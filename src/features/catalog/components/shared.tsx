import * as React from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, InfoIcon, PencilSimpleIcon, PlusIcon, ProhibitIcon, WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { RowAction } from "@/components/common/section-card";
import { cn } from "@/lib/utils/cn";
import { catalogErrorMessage, isConcurrencyConflict } from "../lib/errors";

/** Figma header CTA: lime "Create …" button. */
export function CreateButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button variant="action" size="lg" className="h-12 text-base" onClick={onClick}>
      {children} <PlusIcon />
    </Button>
  );
}

/** Inline notice used to surface documented backend limitations honestly. */
export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warning"; title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div
      role={tone === "warning" ? "alert" : "note"}
      className={cn(
        "flex gap-3 rounded-md border px-3 py-2.5 text-sm [overflow-wrap:anywhere]",
        tone === "warning" ? "border-warning/40 bg-warning-soft text-warning-soft-foreground" : "border-border bg-surface-muted text-foreground",
        className,
      )}
    >
      {tone === "warning" ? <WarningIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> : <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * Form-level API error. For 409 concurrency conflicts it offers a reload that refetches the given
 * queries (and optionally closes the dialog) so the user can re-apply their change.
 */
export function MutationError({ error, reloadKeys, onReloaded }: { error: unknown; reloadKeys?: QueryKey[]; onReloaded?: () => void }) {
  const queryClient = useQueryClient();
  const [reloading, setReloading] = React.useState(false);
  if (!error) return null;
  const conflict = isConcurrencyConflict(error);
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>{catalogErrorMessage(error)}</span>
      {conflict && reloadKeys && (
        <Button
          variant="secondary"
          size="sm"
          loading={reloading}
          onClick={async () => {
            setReloading(true);
            try {
              await Promise.all(reloadKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
              onReloaded?.();
            } finally {
              setReloading(false);
            }
          }}
        >
          <ArrowClockwiseIcon /> Reload latest
        </Button>
      )}
    </div>
  );
}

export function StatusFilter({ value, onChange, label = "Status" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <NativeSelect className="h-[38px] w-40" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">All statuses</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </NativeSelect>
  );
}

export function matchesStatus(isActive: boolean, filter: string): boolean {
  if (filter === "active") return isActive;
  if (filter === "inactive") return !isActive;
  return true;
}

export const statusValue = (isActive: boolean) => (isActive ? "ACTIVE" : "INACTIVE");

/** Edit / deactivate / reactivate row buttons, each shown only when permitted. */
export function EntityRowActions({
  name,
  isActive,
  canEdit,
  canDeactivate,
  canReactivate,
  onEdit,
  onToggle,
  children,
}: {
  name: string;
  isActive: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
  onEdit: () => void;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-end gap-1.5">
      {children}
      {canEdit && (
        <RowAction label={`Edit ${name}`} onClick={onEdit}>
          <PencilSimpleIcon />
        </RowAction>
      )}
      {isActive && canDeactivate && (
        <RowAction label={`Deactivate ${name}`} tone="danger" onClick={onToggle}>
          <ProhibitIcon />
        </RowAction>
      )}
      {!isActive && canReactivate && (
        <RowAction label={`Reactivate ${name}`} tone="success" onClick={onToggle}>
          <ArrowCounterClockwiseIcon />
        </RowAction>
      )}
    </div>
  );
}

/** Confirmation for deactivate (destructive) and reactivate. */
export function ToggleActiveDialog({
  target,
  entity,
  onClose,
  onConfirm,
  loading,
  deactivateNote,
}: {
  target: { name: string; isActive: boolean } | null;
  entity: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  deactivateNote?: string;
}) {
  const deactivating = target?.isActive ?? true;
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={deactivating ? `Deactivate ${entity}?` : `Reactivate ${entity}?`}
      description={
        deactivating
          ? `"${target?.name ?? ""}" will be marked inactive.${deactivateNote ? ` ${deactivateNote}` : ""}`
          : `"${target?.name ?? ""}" will be marked active again.`
      }
      confirmLabel={deactivating ? "Deactivate" : "Reactivate"}
      tone={deactivating ? "danger" : "primary"}
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}

/** "unavailable" text for stat cards: not permitted vs failed. */
export function statUnavailable(permitted: boolean, error: unknown): string | undefined {
  if (!permitted) return "Not permitted";
  if (error) return "Unavailable";
  return undefined;
}
