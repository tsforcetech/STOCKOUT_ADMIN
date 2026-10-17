import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ArrowLeftIcon, PencilSimpleIcon, ProhibitIcon } from "@phosphor-icons/react";
import { SectionCard } from "@/components/common/section-card";
import { DetailList } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { ErrorState, PageSkeleton, TableSkeleton } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { teamKeys, usePermissionsQuery, useRoleQuery } from "./queries";
import { RoleFormDialog } from "./role-form-dialog";
import { PermissionMatrix } from "./permission-matrix";
import { userOrgErrorMessage } from "./errors";

function RoleDetailContent() {
  const { roleId = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAccess();
  const role = useRoleQuery(roleId);
  const canEditPerms = can(P.ROLES_UPDATE) && can(P.PERMISSIONS_VIEW);
  const catalog = usePermissionsQuery(canEditPerms);
  const [editing, setEditing] = React.useState(false);
  const [deactivating, setDeactivating] = React.useState(false);

  const deactivate = useApiMutation({
    mutationFn: () => platformService.deactivateRole(roleId),
    invalidate: [teamKeys.roles, teamKeys.role(roleId)],
    toastOnError: false,
    successMessage: "Role deactivated.",
    onSuccess: () => setDeactivating(false),
  });

  if (role.isLoading) return <PageSkeleton />;
  if (role.error || !role.data) {
    return (
      <SectionCard>
        <ErrorState error={role.error} onRetry={() => role.refetch()} />
        <div className="text-center">
          <Link to="/team/roles" className="text-sm underline underline-offset-4">
            Back to roles
          </Link>
        </div>
      </SectionCard>
    );
  }

  const r = role.data;
  const isSuper = r.code === "PlatformSuperAdmin";
  const readOnly = isSuper || !canEditPerms || !r.isActive;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigate("/team/roles")} className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> All roles
      </button>

      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-2xl font-bold text-foreground">{r.name}</h2>
              {r.isSystemRole && <Badge tone="info">System</Badge>}
              <StatusBadge value={r.isActive ? "ACTIVE" : "INACTIVE"} />
            </div>
            <p className="font-mono text-sm text-muted-foreground">{r.code}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(P.ROLES_UPDATE) && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <PencilSimpleIcon /> Edit details
              </Button>
            )}
            {can(P.ROLES_DEACTIVATE) && r.isActive && !r.isSystemRole && (
              <Button variant="danger" onClick={() => setDeactivating(true)}>
                <ProhibitIcon /> Deactivate
              </Button>
            )}
          </div>
        </div>
        <div className="mt-6">
          <DetailList
            columns={3}
            items={[
              { label: "Description", value: r.description || "—", full: true },
              { label: "Permissions", value: isSuper ? "All active permissions (implicit)" : r.permissions.length },
              { label: "Role ID", value: <IdText value={r.platformRoleId} /> },
            ]}
          />
        </div>
      </SectionCard>

      <SectionCard>
        <h3 className="font-heading text-lg font-bold text-foreground">Permissions</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {isSuper
            ? "PlatformSuperAdmin implicitly holds every active permission; its permission set is protected and cannot be edited."
            : !r.isActive
              ? "This role is inactive, so its permissions are not granted to anyone."
              : !canEditPerms
                ? "Read-only: editing requires roles.update and permissions.view."
                : "Grouped by module. Saving replaces the role's full permission set."}
        </p>
        {!readOnly && catalog.isLoading ? (
          <TableSkeleton rows={6} columns={3} />
        ) : !readOnly && catalog.error ? (
          <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />
        ) : (
          <PermissionMatrix roleId={r.platformRoleId} roleName={r.name} current={r.permissions} catalog={readOnly ? null : (catalog.data ?? null)} readOnly={readOnly} />
        )}
      </SectionCard>

      <RoleFormDialog open={editing} onOpenChange={setEditing} role={r} />
      <ConfirmDialog
        open={deactivating}
        onOpenChange={setDeactivating}
        title="Deactivate role?"
        description={`"${r.name}" will stop granting its permissions and can no longer be assigned. There is no reactivate endpoint.`}
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={() => deactivate.mutate(undefined, { onError: (e) => toast.error(userOrgErrorMessage(e)) })}
      />
    </div>
  );
}

export default function RoleDetailPage() {
  return (
    <RequirePermission permission={P.ROLES_VIEW}>
      <RoleDetailContent />
    </RequirePermission>
  );
}
