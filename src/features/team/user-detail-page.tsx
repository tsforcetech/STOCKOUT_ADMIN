import * as React from "react";
import { Link, useParams } from "react-router";
import { ArrowLeftIcon, ProhibitIcon, UserCheckIcon } from "@phosphor-icons/react";
import { SectionCard } from "@/components/common/section-card";
import { DetailList } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { ErrorState, PageSkeleton, TableSkeleton } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { Avatar, Badge } from "@/components/ui/misc";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { useAdminRolesQuery, useUserQuery } from "./queries";
import { UserAccessDialogs, type UserAccessAction } from "./user-access-dialogs";
import { UserRolesDialog } from "./user-roles-dialog";
import { IdentityStatusCard } from "./identity-status-card";

function UserDetailContent() {
  const { userId = "" } = useParams();
  const { can, isSuperAdmin } = useAccess();
  const user = useUserQuery(userId);
  const realRoles = useAdminRolesQuery(userId, isSuperAdmin);
  const [action, setAction] = React.useState<UserAccessAction>(null);
  const [rolesOpen, setRolesOpen] = React.useState(false);

  const knownCodes = React.useMemo(() => (isSuperAdmin && realRoles.data ? realRoles.data.roles.map((r) => r.code) : null), [isSuperAdmin, realRoles.data]);

  if (user.isLoading) return <PageSkeleton />;
  if (user.error || !user.data) {
    return (
      <SectionCard>
        <ErrorState error={user.error} onRetry={() => user.refetch()} title={undefined} />
        <div className="text-center">
          <Link to="/team/users" className="text-sm underline underline-offset-4">
            Back to users
          </Link>
        </div>
      </SectionCard>
    );
  }

  const u = user.data;
  const name = u.displayName || u.email || "Unnamed user";
  const canEditRoles = can({ allOf: [P.PLATFORM_USERS_UPDATE, P.ROLES_ASSIGN, P.ROLES_VIEW] });

  return (
    <div className="space-y-4">
      <Link to="/team/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> All users
      </Link>

      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={name} className="size-14 text-base" />
            <div className="min-w-0">
              <h2 className="truncate font-heading text-2xl font-bold text-foreground">{name}</h2>
              <p className="truncate text-sm text-muted-foreground">{u.email || "No email on record"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {u.isEnabled && can(P.PLATFORM_USERS_DISABLE) && (
              <Button variant="danger" onClick={() => setAction({ kind: "disable", user: u })}>
                <ProhibitIcon /> Disable access
              </Button>
            )}
            {!u.isEnabled && can(P.PLATFORM_USERS_ENABLE) && (
              <Button onClick={() => setAction({ kind: "enable", user: u })}>
                <UserCheckIcon /> Enable access
              </Button>
            )}
          </div>
        </div>
        <div className="mt-6">
          <DetailList
            columns={3}
            items={[
              { label: "Platform access", value: <StatusBadge value={u.isEnabled ? "ENABLED" : "DISABLED"} /> },
              { label: "Roles assigned", value: u.roles.length },
              { label: "User ID", value: <IdText value={u.userId} /> },
            ]}
          />
        </div>
      </SectionCard>

      <SectionCard>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">Roles</h3>
            <p className="text-sm text-muted-foreground">Roles grant the user's platform permissions.</p>
          </div>
          {canEditRoles && (
            <Button variant="secondary" onClick={() => setRolesOpen(true)} disabled={isSuperAdmin && realRoles.isLoading}>
              Replace roles
            </Button>
          )}
        </div>
        {isSuperAdmin ? (
          realRoles.isLoading ? (
            <TableSkeleton rows={2} columns={2} />
          ) : realRoles.error ? (
            <ErrorState error={realRoles.error} onRetry={() => realRoles.refetch()} />
          ) : realRoles.data?.roles.length ? (
            <ul className="flex flex-wrap gap-2">
              {realRoles.data.roles.map((r) => (
                <li key={r.code}>
                  <Badge tone="primary">
                    {r.name || r.code} <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">This user has no platform roles.</p>
          )
        ) : (
          <p role="note" className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
            This user has {u.roles.length} role{u.roles.length === 1 ? "" : "s"}. Role names can't be shown: the users API returns empty role codes (known backend defect), and the
            endpoint that returns real role codes is restricted to PlatformSuperAdmin.
          </p>
        )}
      </SectionCard>

      {can(P.PLATFORM_USERS_DISABLE) && (
        <SectionCard>
          <h3 className="font-heading text-lg font-bold text-foreground">Identity account status</h3>
          <p className="mb-4 text-sm text-muted-foreground">Controls whether the user can sign in at all (independent of platform access above).</p>
          <IdentityStatusCard userId={u.userId} userName={name} />
        </SectionCard>
      )}

      <UserAccessDialogs action={action} onClose={() => setAction(null)} />
      {canEditRoles && <UserRolesDialog open={rolesOpen} onOpenChange={setRolesOpen} userId={u.userId} userName={name} knownCodes={knownCodes} />}
    </div>
  );
}

export default function UserDetailPage() {
  return (
    <RequirePermission permission={P.PLATFORM_USERS_VIEW}>
      <UserDetailContent />
    </RequirePermission>
  );
}
