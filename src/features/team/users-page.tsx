import * as React from "react";
import { useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { EyeIcon, PlusIcon, ProhibitIcon, UserCheckIcon, UserIcon } from "@phosphor-icons/react";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { PERMISSIONS as P, type PlatformUserListResponse } from "@/api/types/user-organization";
import { useUsersQuery } from "./queries";
import { InviteDialog } from "./invite-dialog";
import { UserAccessDialogs, type UserAccessAction } from "./user-access-dialogs";

function UsersContent() {
  const { can } = useAccess();
  const navigate = useNavigate();
  const [state, setState] = useUrlState({ q: "", status: "" });
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [action, setAction] = React.useState<UserAccessAction>(null);
  const query = useUsersQuery();
  const users = React.useMemo(() => query.data ?? [], [query.data]);

  const filtered = React.useMemo(() => {
    const q = state.q.trim().toLowerCase();
    return users.filter(
      (u) =>
        (!state.status || (state.status === "enabled" ? u.isEnabled : !u.isEnabled)) &&
        (!q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q)),
    );
  }, [users, state.q, state.status]);

  const canDisable = can(P.PLATFORM_USERS_DISABLE);
  const canEnable = can(P.PLATFORM_USERS_ENABLE);

  const columns = React.useMemo<ColumnDef<PlatformUserListResponse, unknown>[]>(
    () => [
      {
        id: "name",
        header: "User",
        accessorFn: (u) => u.displayName || u.email,
        cell: ({ row }) => <EntityCell icon={<UserIcon />} title={row.original.displayName || "No display name"} subtitle={row.original.email || "No email on record"} />,
      },
      { id: "status", header: "Platform access", accessorFn: (u) => (u.isEnabled ? "ENABLED" : "DISABLED"), cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      {
        id: "roles",
        header: "Roles",
        accessorFn: (u) => u.roles.length,
        cell: ({ row }) => <span title="Role names are not returned by this endpoint (backend defect); open the user for details.">{row.original.roles.length} role{row.original.roles.length === 1 ? "" : "s"}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex justify-end gap-1.5">
              <RowAction label="View user" onClick={() => navigate(`/team/users/${u.userId}`)}>
                <EyeIcon />
              </RowAction>
              {u.isEnabled && canDisable && (
                <RowAction label="Disable user" tone="danger" onClick={() => setAction({ kind: "disable", user: u })}>
                  <ProhibitIcon />
                </RowAction>
              )}
              {!u.isEnabled && canEnable && (
                <RowAction label="Enable user" tone="success" onClick={() => setAction({ kind: "enable", user: u })}>
                  <UserCheckIcon />
                </RowAction>
              )}
            </div>
          );
        },
      },
    ],
    [canDisable, canEnable, navigate],
  );

  const exportRows = () =>
    downloadCsv(
      `platform-users-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered, [
        { header: "User ID", value: (u) => u.userId },
        { header: "Display name", value: (u) => u.displayName },
        { header: "Email", value: (u) => u.email },
        { header: "Enabled", value: (u) => (u.isEnabled ? "yes" : "no") },
        { header: "Role count", value: (u) => u.roles.length },
      ]),
    );

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">Users</h2>
          <p className="text-sm text-muted-foreground">Everyone with a platform role or platform access record.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportRows} disabled={!filtered.length}>
            Export CSV
          </Button>
          {can(P.PLATFORM_USERS_INVITE) && (
            <Button variant="action" onClick={() => setInviteOpen(true)}>
              Invite user <PlusIcon />
            </Button>
          )}
        </div>
      </div>
      <Toolbar
        left={<SearchInput value={state.q} onChange={(q) => setState({ q })} placeholder="Search by name, email or ID…" />}
        right={
          <>
            <NativeSelect className="h-[38px] w-40" value={state.status} onChange={(e) => setState({ status: e.target.value })} aria-label="Platform access">
              <option value="">All users</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </NativeSelect>
            <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
          </>
        }
      />
      <DataTable
        caption="Platform users"
        columns={columns}
        data={filtered}
        getRowId={(u) => u.userId}
        isLoading={query.isLoading}
        isFetching={query.isFetching && !query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        onRowClick={(u) => navigate(`/team/users/${u.userId}`)}
        emptyTitle={users.length ? "No users match these filters" : "No platform users yet"}
        emptyDescription={users.length ? "Clear the search or status filter." : "Invite a teammate to give them access to the admin console."}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        The users API currently returns role entries without codes or names (known backend defect), so only the number of roles is shown here.
      </p>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <UserAccessDialogs action={action} onClose={() => setAction(null)} />
    </SectionCard>
  );
}

export default function UsersPage() {
  return (
    <RequirePermission permission={P.PLATFORM_USERS_VIEW}>
      <UsersContent />
    </RequirePermission>
  );
}
