import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowCounterClockwiseIcon, FlagIcon } from "@phosphor-icons/react";
import { Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { EntityCell } from "@/components/common/entity-cell";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import { PERMISSIONS as P, type PlatformFeatureFlagResponse } from "@/api/types/user-organization";
import { userOrgErrorCode, userOrgErrorMessage } from "@/features/team/errors";
import { formatUtcDateTime } from "@/features/team/utc";
import { settingsKeys, useFeatureFlagsQuery } from "./queries";

type Pending = { kind: "toggle" | "reset"; flag: PlatformFeatureFlagResponse } | null;

export function FeatureFlagsPanel() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const canUpdate = can(P.FEATURE_FLAGS_UPDATE);
  const [state, setState] = useUrlState({ fq: "" });
  const [pending, setPending] = React.useState<Pending>(null);
  const query = useFeatureFlagsQuery();
  const flags = React.useMemo(() => query.data ?? [], [query.data]);

  const filtered = React.useMemo(() => {
    const q = state.fq.trim().toLowerCase();
    return flags.filter((f) => !q || f.key.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q));
  }, [flags, state.fq]);

  const mutation = useApiMutation({
    mutationFn: (p: NonNullable<Pending>) =>
      p.kind === "toggle"
        ? platformService.updateFeatureFlag(p.flag.key, { isEnabled: !p.flag.isEnabled, expectedVersion: p.flag.version })
        : platformService.resetFeatureFlag(p.flag.key, p.flag.version),
    invalidate: [settingsKeys.featureFlags],
    toastOnError: false,
    successMessage: (d, p) => (p.kind === "reset" ? `"${d.name}" reset to its default (${d.isEnabled ? "on" : "off"}).` : `"${d.name}" turned ${d.isEnabled ? "on" : "off"}.`),
    onSuccess: () => setPending(null),
  });

  const columns = React.useMemo<ColumnDef<PlatformFeatureFlagResponse, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Feature flag",
        accessorFn: (f) => f.name,
        cell: ({ row }) => (
          <div>
            <EntityCell icon={<FlagIcon />} title={row.original.name} subtitle={<span className="font-mono">{row.original.key}</span>} />
            {row.original.description && <p className="mt-1 max-w-[420px] whitespace-normal pl-11 text-xs text-muted-foreground">{row.original.description}</p>}
          </div>
        ),
      },
      {
        id: "enabled",
        header: "State",
        accessorFn: (f) => (f.isEnabled ? 1 : 0),
        cell: ({ row }) => {
          const f = row.original;
          return (
            <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Switch checked={f.isEnabled} disabled={!canUpdate} aria-label={`${f.name}: ${f.isEnabled ? "on" : "off"}`} onCheckedChange={() => setPending({ kind: "toggle", flag: f })} />
              <span className="text-sm">{f.isEnabled ? "On" : "Off"}</span>
            </span>
          );
        },
      },
      { id: "default", header: "Default", accessorFn: (f) => (f.defaultEnabled ? "ENABLED" : "DISABLED"), cell: ({ row }) => <StatusBadge value={row.original.defaultEnabled ? "ENABLED" : "DISABLED"} label={row.original.defaultEnabled ? "On" : "Off"} /> },
      { id: "updated", header: "Updated", accessorFn: (f) => f.updatedAtUtc ?? "", cell: ({ row }) => formatUtcDateTime(row.original.updatedAtUtc) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) =>
          canUpdate && row.original.isEnabled !== row.original.defaultEnabled ? (
            <div className="flex justify-end">
              <RowAction label="Reset to default" tone="danger" onClick={() => setPending({ kind: "reset", flag: row.original })}>
                <ArrowCounterClockwiseIcon />
              </RowAction>
            </div>
          ) : null,
      },
    ],
    [canUpdate],
  );

  const f = pending?.flag;
  return (
    <>
      <Toolbar left={<SearchInput value={state.fq} onChange={(fq) => setState({ fq })} placeholder="Search feature flags…" />} right={<RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />} />
      <DataTable
        caption="Feature flags"
        columns={columns}
        data={filtered}
        getRowId={(x) => x.platformFeatureFlagId}
        isLoading={query.isLoading}
        isFetching={query.isFetching && !query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        emptyTitle={flags.length ? "No feature flags match the search" : "No feature flags"}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === "reset" ? "Reset feature flag?" : `Turn ${f?.isEnabled ? "off" : "on"} "${f?.name ?? ""}"?`}
        description={
          pending?.kind === "reset"
            ? `"${f?.name ?? ""}" will return to its default (${f?.defaultEnabled ? "on" : "off"}).`
            : `This changes platform behaviour for every user as soon as services pick up the new configuration.`
        }
        confirmLabel={pending?.kind === "reset" ? "Reset" : f?.isEnabled ? "Turn off" : "Turn on"}
        tone={pending?.kind === "toggle" && !f?.isEnabled ? "primary" : "danger"}
        loading={mutation.isPending}
        onConfirm={() =>
          pending &&
          mutation.mutate(pending, {
            onError: (e) => {
              toast.error(userOrgErrorMessage(e));
              if (userOrgErrorCode(e) === "VERSION_CONFLICT") {
                setPending(null);
                void queryClient.invalidateQueries({ queryKey: settingsKeys.featureFlags });
              }
            },
          })
        }
      />
    </>
  );
}
