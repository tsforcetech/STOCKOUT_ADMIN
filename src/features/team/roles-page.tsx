import * as React from "react";
import { useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { ArrowCounterClockwiseIcon, EyeIcon, PencilSimpleIcon, PlusIcon, ProhibitIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import { formatNumber } from "@/lib/utils/format";
import { PERMISSIONS as P, type PlatformRoleListResponse } from "@/api/types/user-organization";
import { teamKeys, useRolesQuery } from "./queries";
import { RoleFormDialog } from "./role-form-dialog";
import { userOrgErrorMessage } from "./errors";

function RolesContent() {
  const { can } = useAccess();
  const navigate = useNavigate();
  const [state, setState] = useUrlState({ q: "", status: "" });
  const [formRole, setFormRole] = React.useState<PlatformRoleListResponse | "new" | null>(null);
  const [deactivating, setDeactivating] = React.useState<PlatformRoleListResponse | null>(null);
  const [reactivating, setReactivating] = React.useState<PlatformRoleListResponse | null>(null);
  const query = useRolesQuery();
  const roles = React.useMemo(() => query.data ?? [], [query.data]);

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return roles.filter(
      (r) =>
        (!state.status || (state.status === "active" ? r.isActive : state.status === "inactive" ? !r.isActive : r.isSystemRole)) &&
        (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q)),
    );
  }, [roles, state.q, state.status]);

  const deactivate = useApiMutation({
    mutationFn: (r: PlatformRoleListResponse) => platformService.deactivateRole(r.platformRoleId),
    invalidate: (_d, r) => [teamKeys.roles, teamKeys.role(r.platformRoleId)],
    toastOnError: false,
    successMessage: (_d, r) => `Role "${r.name}" deactivated.`,
    onSuccess: () => setDeactivating(null),
  });

  const reactivate = useApiMutation({
    mutationFn: (r: PlatformRoleListResponse) => platformService.reactivateRole(r.platformRoleId),
    invalidate: (_d, r) => [teamKeys.roles, teamKeys.role(r.platformRoleId)],
    toastOnError: false,
    successMessage: (_d, r) => `Role "${r.name}" reactivated.`,
    onSuccess: () => setReactivating(null),
  });

  const canUpdate = can(P.ROLES_UPDATE);
  const canDeactivate = can(P.ROLES_DEACTIVATE);
  const canReactivate = can(P.ROLES_ACTIVATE) || canUpdate;

  const columns = React.useMemo<ColumnDef<PlatformRoleListResponse, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Role",
        accessorFn: (r) => r.name,
        cell: ({ row }) => <EntityCell icon={<ShieldCheckIcon />} title={row.original.name} subtitle={<span className="font-mono">{row.original.code}</span>} />,
      },
      { id: "description", header: "Description", accessorFn: (r) => r.description ?? "", cell: ({ row }) => <span className="block max-w-[280px] truncate text-muted-foreground">{row.original.description || "—"}</span> },
      { id: "type", header: "Type", accessorFn: (r) => (r.isSystemRole ? "System" : "Custom"), cell: ({ row }) => (row.original.isSystemRole ? <Badge tone="info">System</Badge> : <Badge>Custom</Badge>) },
      { id: "users", header: "Users", accessorFn: (r) => r.userCount, cell: ({ row }) => formatNumber(row.original.userCount) },
      { id: "permissions", header: "Permissions", accessorFn: (r) => r.permissionCount, cell: ({ row }) => (row.original.code === "PlatformSuperAdmin" ? "All (implicit)" : formatNumber(row.original.permissionCount)) },
      { id: "status", header: "Status", accessorFn: (r) => (r.isActive ? "ACTIVE" : "INACTIVE"), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex justify-end gap-1.5">
              <RowAction label="View role" onClick={() => navigate(`/team/roles/${r.platformRoleId}`)}>
                <EyeIcon />
              </RowAction>
              {canUpdate && (
                <RowAction label="Edit role" onClick={() => setFormRole(r)}>
                  <PencilSimpleIcon />
                </RowAction>
              )}
              {canDeactivate && r.isActive && !r.isSystemRole && (
                <RowAction label="Deactivate role" tone="danger" onClick={() => setDeactivating(r)}>
                  <ProhibitIcon />
                </RowAction>
              )}
              {canReactivate && !r.isActive && !r.isSystemRole && (
                <RowAction label="Reactivate role" onClick={() => setReactivating(r)}>
                  <ArrowCounterClockwiseIcon />
                </RowAction>
              )}
            </div>
          );
        },
      },
    ],
    [canUpdate, canDeactivate, canReactivate, navigate],
  );

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">Roles</h2>
          <p className="text-sm text-muted-foreground">Bundle permissions into roles and assign them to users.</p>
        </div>
        {can(P.ROLES_CREATE) && (
          <Button variant="action" onClick={() => setFormRole("new")}>
            Create role <PlusIcon />
          </Button>
        )}
      </div>
      <Toolbar
        left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search roles…" />}
        right={
          <>
            <NativeSelect className="h-[38px] w-40" value={state.status} onChange={(e) => setState({ status: e.target.value })} aria-label="Role filter">
              <option value="">All roles</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="system">System</option>
            </NativeSelect>
            <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
          </>
        }
      />
      <DataTable
        caption="Platform roles"
        columns={columns}
        data={filtered}
        getRowId={(r) => r.platformRoleId}
        isLoading={query.isLoading}
        isFetching={query.isFetching && !query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        onRowClick={(r) => navigate(`/team/roles/${r.platformRoleId}`)}
        emptyTitle={roles.length ? "No roles match these filters" : "No roles yet"}
      />
      <p className="mt-3 text-xs text-muted-foreground">System roles cannot be deactivated or reactivated. PlatformSuperAdmin implicitly holds every permission.</p>

      <RoleFormDialog open={formRole !== null} onOpenChange={(o) => !o && setFormRole(null)} role={formRole === "new" ? null : formRole} />
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title="Deactivate role?"
        description={`"${deactivating?.name ?? ""}" will stop granting its permissions to its ${formatNumber(deactivating?.userCount)} user(s) and can no longer be assigned until it is reactivated.`}
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate(deactivating, { onError: (e) => toast.error(userOrgErrorMessage(e)) })}
      />
      <ConfirmDialog
        open={reactivating !== null}
        onOpenChange={(o) => !o && setReactivating(null)}
        tone="primary"
        title="Reactivate role?"
        description={`"${reactivating?.name ?? ""}" will grant its permissions again to anyone who still holds it, and can be assigned again.`}
        confirmLabel="Reactivate"
        loading={reactivate.isPending}
        onConfirm={() => reactivating && reactivate.mutate(reactivating, { onError: (e) => toast.error(userOrgErrorMessage(e)) })}
      />
    </SectionCard>
  );
}

export default function RolesPage() {
  return (
    <RequirePermission permission={P.ROLES_VIEW}>
      <RolesContent />
    </RequirePermission>
  );
}
