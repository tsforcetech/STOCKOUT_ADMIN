import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowCounterClockwiseIcon, GearSixIcon, LockSimpleIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { EntityCell } from "@/components/common/entity-cell";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import { PERMISSIONS as P, type PlatformSettingResponse } from "@/api/types/user-organization";
import { userOrgErrorCode, userOrgErrorMessage } from "@/features/team/errors";
import { formatUtcDateTime } from "@/features/team/utc";
import { settingsKeys, useSettingsQuery } from "./queries";
import { SettingEditDialog } from "./setting-edit-dialog";
import { VALUE_TYPE_LABEL } from "./setting-value";

function ValueCell({ s }: { s: PlatformSettingResponse }) {
  return (
    <span className="flex items-center gap-2">
      <span className="max-w-[220px] truncate font-mono text-sm" title={s.effectiveValue}>
        {s.valueType === "STRING" && s.effectiveValue === "" ? <span className="text-muted-foreground">(empty)</span> : s.effectiveValue}
      </span>
      {s.currentValue === null ? <Badge>Default</Badge> : <Badge tone="primary">Overridden</Badge>}
    </span>
  );
}

export function PlatformSettingsPanel() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const canUpdate = can(P.SETTINGS_UPDATE);
  const [state, setState] = useUrlState({ sq: "", category: "" });
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [resetting, setResetting] = React.useState<PlatformSettingResponse | null>(null);
  const query = useSettingsQuery();
  const settings = React.useMemo(() => query.data ?? [], [query.data]);
  const categories = React.useMemo(() => [...new Set(settings.map((s) => s.category))].sort(), [settings]);
  const editing = settings.find((s) => s.key === editingKey) ?? null;

  const filtered = React.useMemo(() => {
    const q = state.sq.trim().toLowerCase();
    return settings.filter((s) => (!state.category || s.category === state.category) && (!q || s.key.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)));
  }, [settings, state.sq, state.category]);

  const reset = useApiMutation({
    mutationFn: (s: PlatformSettingResponse) => platformService.resetSetting(s.key, s.version),
    invalidate: [settingsKeys.settings],
    toastOnError: false,
    successMessage: (d) => `"${d.name}" reset to its default (${d.defaultValue}).`,
    onSuccess: () => setResetting(null),
  });

  const columns = React.useMemo<ColumnDef<PlatformSettingResponse, unknown>[]>(
    () => [
      { id: "name", header: "Setting", accessorFn: (s) => s.name, cell: ({ row }) => <EntityCell icon={<GearSixIcon />} title={row.original.name} subtitle={<span className="font-mono">{row.original.key}</span>} /> },
      { id: "category", header: "Category", accessorFn: (s) => s.category },
      { id: "type", header: "Type", accessorFn: (s) => s.valueType, cell: ({ row }) => VALUE_TYPE_LABEL[row.original.valueType] ?? row.original.valueType },
      { id: "value", header: "Value", accessorFn: (s) => s.effectiveValue, cell: ({ row }) => <ValueCell s={row.original} /> },
      { id: "default", header: "Default", accessorFn: (s) => s.defaultValue, cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.defaultValue || "(empty)"}</span> },
      { id: "updated", header: "Updated", accessorFn: (s) => s.updatedAtUtc ?? "", cell: ({ row }) => formatUtcDateTime(row.original.updatedAtUtc) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original;
          if (!s.isEditable)
            return (
              <span className="flex justify-end text-muted-foreground" title="Read-only setting">
                <LockSimpleIcon className="size-4" aria-label="Read-only setting" />
              </span>
            );
          if (!canUpdate) return null;
          return (
            <div className="flex justify-end gap-1.5">
              <RowAction label="Edit value" onClick={() => setEditingKey(s.key)}>
                <PencilSimpleIcon />
              </RowAction>
              {s.currentValue !== null && (
                <RowAction label="Reset to default" tone="danger" onClick={() => setResetting(s)}>
                  <ArrowCounterClockwiseIcon />
                </RowAction>
              )}
            </div>
          );
        },
      },
    ],
    [canUpdate],
  );

  return (
    <>
      <Toolbar
        left={<SearchInput value={state.sq} onChange={(sq) => setState({ sq })} placeholder="Search settings…" />}
        right={
          <>
            <NativeSelect className="h-[38px] w-44" value={state.category} onChange={(e) => setState({ category: e.target.value })} aria-label="Category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
            <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
          </>
        }
      />
      <DataTable
        caption="Platform settings"
        columns={columns}
        data={filtered}
        getRowId={(s) => s.platformSettingId}
        isLoading={query.isLoading}
        isFetching={query.isFetching && !query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        onRowClick={canUpdate ? (s) => s.isEditable && setEditingKey(s.key) : undefined}
        emptyTitle={settings.length ? "No settings match these filters" : "No platform settings"}
      />
      <p className="mt-3 text-xs text-muted-foreground">Ranges mentioned in descriptions are guidance only — the API validates the value type, not the range.</p>

      <SettingEditDialog setting={editing} onOpenChange={(o) => !o && setEditingKey(null)} />
      <ConfirmDialog
        open={resetting !== null}
        onOpenChange={(o) => !o && setResetting(null)}
        title="Reset to default?"
        description={`"${resetting?.name ?? ""}" will change from ${resetting?.effectiveValue ?? ""} back to its default value ${resetting?.defaultValue ?? ""}.`}
        confirmLabel="Reset"
        loading={reset.isPending}
        onConfirm={() =>
          resetting &&
          reset.mutate(resetting, {
            onError: (e) => {
              toast.error(userOrgErrorMessage(e));
              if (userOrgErrorCode(e) === "VERSION_CONFLICT") {
                setResetting(null);
                void queryClient.invalidateQueries({ queryKey: settingsKeys.settings });
              }
            },
          })
        }
      />
    </>
  );
}
