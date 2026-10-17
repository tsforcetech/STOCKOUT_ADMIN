import * as React from "react";
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { PlusIcon, ShieldStarIcon, XIcon } from "@phosphor-icons/react";
import { SectionCard, Toolbar, RefreshButton } from "@/components/common/section-card";
import { EntityCell } from "@/components/common/entity-cell";
import { IdText } from "@/components/common/copy-button";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { NativeSelect } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { FormError, FormField } from "@/components/forms/form-field";
import { RequirePermission } from "@/lib/auth/guards";
import { useUrlState } from "@/hooks/use-url-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import { SYSTEM_ROLES, type PlatformAdminResponse, type SystemPlatformRoleCode } from "@/api/types/user-organization";
import { teamKeys, useAdminsQuery, useUsersQuery } from "./queries";
import { userOrgErrorMessage } from "./errors";

const ROLE_CODES: SystemPlatformRoleCode[] = [SYSTEM_ROLES.PlatformAdmin, SYSTEM_ROLES.PlatformSuperAdmin];
const LAST_SUPER_HELP = "At least one PlatformSuperAdmin must remain assigned. Grant PlatformSuperAdmin to another user before revoking it from this one.";

function revokeErrorMessage(error: unknown): string {
  const msg = userOrgErrorMessage(error);
  return /PlatformSuperAdmin must remain/i.test(msg) || (error instanceof Error && /must remain/i.test(error.message)) ? LAST_SUPER_HELP : msg;
}

function AssignDialog({ open, onOpenChange, admins }: { open: boolean; onOpenChange: (o: boolean) => void; admins: PlatformAdminResponse[] }) {
  const users = useUsersQuery(open);
  const [userId, setUserId] = React.useState("");
  const [roleCode, setRoleCode] = React.useState<SystemPlatformRoleCode>(SYSTEM_ROLES.PlatformAdmin);
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setUserId("");
      setRoleCode(SYSTEM_ROLES.PlatformAdmin);
      setTouched(false);
      setError(null);
    }
  }, [open]);

  const assign = useApiMutation({
    mutationFn: () => platformService.assignAdminRole(userId, { roleCode }),
    invalidate: [teamKeys.admins, teamKeys.adminRoles(userId), teamKeys.users, teamKeys.roles],
    toastOnError: false,
    successMessage: (d) => (d.assigned ? `${d.roleCode} assigned.` : d.message || "The user already had this role."),
    onSuccess: () => onOpenChange(false),
  });

  const holds = admins.find((a) => a.userId === userId)?.roles ?? [];
  const sorted = React.useMemo(() => [...(users.data ?? [])].sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)), [users.data]);

  return (
    <Dialog open={open} onOpenChange={(o) => !assign.isPending && onOpenChange(o)}>
      <DialogContent
        title="Assign admin role"
        description="Grant a system role to an existing platform user. To add someone new, invite them first."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={assign.isPending}>
              Cancel
            </Button>
            <Button
              loading={assign.isPending}
              onClick={() => {
                setTouched(true);
                setError(null);
                if (userId) assign.mutate(undefined, { onError: (e) => setError(userOrgErrorMessage(e)) });
              }}
            >
              Assign role
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error ?? (users.error ? `Users could not be loaded: ${userOrgErrorMessage(users.error)}` : null)} />
          <FormField label="User" htmlFor="admin-user" required error={touched && !userId ? "Select a user." : undefined} hint={holds.length ? `Currently holds: ${holds.join(", ")}` : undefined}>
            <NativeSelect value={userId} onChange={(e) => setUserId(e.target.value)} disabled={users.isLoading}>
              <option value="">{users.isLoading ? "Loading users…" : "Select a user…"}</option>
              {sorted.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {(u.displayName || "No display name") + (u.email ? ` — ${u.email}` : "")}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Role" htmlFor="admin-role" required>
            <NativeSelect value={roleCode} onChange={(e) => setRoleCode(e.target.value as SystemPlatformRoleCode)}>
              {ROLE_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {roleCode === SYSTEM_ROLES.PlatformSuperAdmin && (
            <p role="note" className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              PlatformSuperAdmin grants every permission, including managing other admins.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminsContent() {
  const [state, setState] = useUrlState({ q: "" });
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<{ admin: PlatformAdminResponse; roleCode: SystemPlatformRoleCode } | null>(null);
  const query = useAdminsQuery();
  const admins = React.useMemo(() => query.data ?? [], [query.data]);
  const superCount = admins.filter((a) => a.roles.includes(SYSTEM_ROLES.PlatformSuperAdmin)).length;

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return admins.filter((a) => !q || (a.displayName ?? "").toLowerCase().includes(q) || a.userId.toLowerCase().includes(q));
  }, [admins, state.q]);

  const revoke = useApiMutation({
    mutationFn: (v: { admin: PlatformAdminResponse; roleCode: SystemPlatformRoleCode }) => platformService.revokeAdminRole(v.admin.userId, v.roleCode),
    invalidate: (_d, v) => [teamKeys.admins, teamKeys.adminRoles(v.admin.userId), teamKeys.users, teamKeys.roles],
    toastOnError: false,
    successMessage: (_d, v) => `${v.roleCode} revoked from ${v.admin.displayName || "user"}.`,
    onSuccess: () => setRevoking(null),
  });

  const columns = React.useMemo<ColumnDef<PlatformAdminResponse, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Admin",
        accessorFn: (a) => a.displayName ?? "",
        cell: ({ row }) => (
          <Link to={`/team/users/${row.original.userId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            <EntityCell icon={<ShieldStarIcon />} title={row.original.displayName || "No display name"} />
          </Link>
        ),
      },
      {
        id: "roles",
        header: "System roles",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.roles.map((code) => (
              <Badge key={code} tone={code === SYSTEM_ROLES.PlatformSuperAdmin ? "primary" : "neutral"}>
                {code}
                <button
                  type="button"
                  className="-mr-1 cursor-pointer rounded-sm p-0.5 hover:bg-danger-soft hover:text-danger"
                  aria-label={`Revoke ${code} from ${row.original.displayName || "user"}`}
                  onClick={() => setRevoking({ admin: row.original, roleCode: code })}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ),
      },
      { id: "id", header: "User ID", enableSorting: false, cell: ({ row }) => <IdText value={row.original.userId} /> },
    ],
    [],
  );

  const lastSuper = revoking?.roleCode === SYSTEM_ROLES.PlatformSuperAdmin && superCount <= 1;

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">Platform admins</h2>
          <p className="text-sm text-muted-foreground">Users holding PlatformAdmin or PlatformSuperAdmin. Only PlatformSuperAdmins can manage this list.</p>
        </div>
        <Button variant="action" onClick={() => setAssignOpen(true)}>
          Assign admin role <PlusIcon />
        </Button>
      </div>
      <Toolbar left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search admins…" />} right={<RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />} />
      <DataTable
        caption="Platform admins"
        columns={columns}
        data={filtered}
        getRowId={(a) => a.userId}
        isLoading={query.isLoading}
        isFetching={query.isFetching && !query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        emptyTitle={admins.length ? "No admins match the search" : "No platform admins"}
      />
      <p className="mt-3 text-xs text-muted-foreground">{superCount} PlatformSuperAdmin{superCount === 1 ? "" : "s"}. The last PlatformSuperAdmin cannot be revoked.</p>

      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} admins={admins} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke ${revoking?.roleCode ?? "role"}?`}
        description={lastSuper ? LAST_SUPER_HELP : `${revoking?.admin.displayName || "This user"} will lose the ${revoking?.roleCode ?? ""} role and its permissions immediately.`}
        confirmLabel="Revoke"
        loading={revoke.isPending}
        onConfirm={() => {
          if (!revoking) return;
          if (lastSuper) {
            setRevoking(null);
            return;
          }
          revoke.mutate(revoking, { onError: (e) => toast.error(revokeErrorMessage(e)) });
        }}
      />
    </SectionCard>
  );
}

export default function AdminsPage() {
  return (
    <RequirePermission permission={{ role: SYSTEM_ROLES.PlatformSuperAdmin }}>
      <AdminsContent />
    </RequirePermission>
  );
}
