import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { ArrowClockwiseIcon, EnvelopeSimpleIcon, PlusIcon, ProhibitIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { SectionCard, Toolbar, RefreshButton, RowAction } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityCell } from "@/components/common/entity-cell";
import { DataTable } from "@/components/tables/data-table";
import { SearchInput } from "@/components/tables/table-toolbar";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { PERMISSIONS as P, type PlatformInvitationResponse, type PlatformInvitationStatus } from "@/api/types/user-organization";
import { teamKeys, useInvitationsQuery } from "./queries";
import { InviteDialog } from "./invite-dialog";
import { BatchInviteDialog } from "./batch-invite-dialog";
import { InvitationDetailDialog } from "./invitation-detail-dialog";
import { RoleCodeBadges } from "./role-picker";
import { userOrgErrorMessage } from "./errors";
import { formatUtcDateTime } from "./utc";

const STATUSES: PlatformInvitationStatus[] = ["Pending", "Accepted", "Revoked", "Expired"];
type PendingAction = { kind: "resend" | "revoke"; invitation: PlatformInvitationResponse } | null;

const isOpen = (i: PlatformInvitationResponse) => i.status === "Pending" || i.status === "Expired";

function InvitationsContent() {
  const { can } = useAccess();
  const [state, setState] = useUrlState({ status: "", email: "", invite: "" });
  const [pending, setPending] = React.useState<PendingAction>(null);
  const [detail, setDetail] = React.useState<PlatformInvitationResponse | null>(null);
  const [batchOpen, setBatchOpen] = React.useState(false);

  const filters = React.useMemo(
    () => ({ status: (state.status || undefined) as PlatformInvitationStatus | undefined, email: state.email.trim() || undefined }),
    [state.status, state.email],
  );
  const query = useInvitationsQuery(filters);
  const rows = React.useMemo(() => query.data ?? [], [query.data]);

  const action = useApiMutation({
    mutationFn: (a: NonNullable<PendingAction>) => (a.kind === "resend" ? platformService.resendInvitation(a.invitation.invitationId) : platformService.revokeInvitation(a.invitation.invitationId)),
    invalidate: [teamKeys.invitationsAll],
    toastOnError: false,
    successMessage: (_d, a) => (a.kind === "resend" ? `Invitation resent to ${a.invitation.email} with a new expiry.` : `Invitation for ${a.invitation.email} revoked.`),
    onSuccess: () => setPending(null),
  });

  const canInvite = can(P.PLATFORM_USERS_INVITE);
  const canRevoke = can(P.PLATFORM_USERS_UPDATE);

  const columns = React.useMemo<ColumnDef<PlatformInvitationResponse, unknown>[]>(
    () => [
      { id: "email", header: "Email", accessorFn: (i) => i.email, cell: ({ row }) => <EntityCell icon={<EnvelopeSimpleIcon />} title={row.original.email} subtitle={row.original.invitedBy ? `Invited by ${row.original.invitedBy}` : undefined} /> },
      { id: "roles", header: "Roles", enableSorting: false, cell: ({ row }) => <RoleCodeBadges codes={row.original.roles} /> },
      { id: "status", header: "Status", accessorFn: (i) => i.status, cell: ({ getValue }) => <StatusBadge value={getValue() as string} /> },
      { id: "invited", header: "Invited", accessorFn: (i) => i.invitedAtUtc, cell: ({ row }) => formatUtcDateTime(row.original.invitedAtUtc) },
      { id: "expires", header: "Expires", accessorFn: (i) => i.expiresAtUtc, cell: ({ row }) => formatUtcDateTime(row.original.expiresAtUtc) },
      { id: "accepted", header: "Accepted", accessorFn: (i) => i.acceptedAtUtc ?? "", cell: ({ row }) => formatUtcDateTime(row.original.acceptedAtUtc) },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const i = row.original;
          return (
            <div className="flex justify-end gap-1.5">
              {canInvite && isOpen(i) && (
                <RowAction label="Resend invitation" onClick={() => setPending({ kind: "resend", invitation: i })}>
                  <ArrowClockwiseIcon />
                </RowAction>
              )}
              {canRevoke && isOpen(i) && (
                <RowAction label="Revoke invitation" tone="danger" onClick={() => setPending({ kind: "revoke", invitation: i })}>
                  <ProhibitIcon />
                </RowAction>
              )}
            </div>
          );
        },
      },
    ],
    [canInvite, canRevoke],
  );

  const exportRows = () =>
    downloadCsv(
      `invitations-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows, [
        { header: "Invitation ID", value: (i) => i.invitationId },
        { header: "Email", value: (i) => i.email },
        { header: "Status", value: (i) => i.status },
        { header: "Roles", value: (i) => i.roles.join(" ") },
        { header: "Invited by", value: (i) => i.invitedBy },
        { header: "Invited (UTC)", value: (i) => i.invitedAtUtc },
        { header: "Expires (UTC)", value: (i) => i.expiresAtUtc },
        { header: "Accepted (UTC)", value: (i) => i.acceptedAtUtc },
      ]),
    );

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">Invitations</h2>
          <p className="text-sm text-muted-foreground">Invite people to the admin console and track their invitations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportRows} disabled={!rows.length}>
            Export CSV
          </Button>
          {canInvite && (
            <>
              <Button variant="secondary" onClick={() => setBatchOpen(true)}>
                <UsersThreeIcon /> Batch invite
              </Button>
              <Button variant="action" onClick={() => setState({ invite: "1" })}>
                Invite user <PlusIcon />
              </Button>
            </>
          )}
        </div>
      </div>
      <Toolbar
        left={<SearchInput value={state.email} onChange={(email) => setState({ email })} placeholder="Exact email address…" label="Filter by exact email" />}
        right={
          <>
            <NativeSelect className="h-[38px] w-40" value={state.status} onChange={(e) => setState({ status: e.target.value })} aria-label="Invitation status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
            <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} />
          </>
        }
      />
      <DataTable
        caption="Platform invitations"
        columns={columns}
        data={rows}
        getRowId={(i) => i.invitationId}
        isLoading={query.isLoading}
        isFetching={query.isFetching && !query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        onRowClick={setDetail}
        emptyTitle={filters.status || filters.email ? "No invitations match these filters" : "No invitations yet"}
        emptyDescription={filters.email ? "The email filter is an exact match (case-insensitive) — partial matches are not supported by the API." : canInvite ? "Invite a teammate to get started." : undefined}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        "Expired" is a pending invitation past its expiry; resending issues a new link and expiry. The list shows the inviter's name; the inviter's ID and revocation time are only returned on the detail view.
      </p>

      <InviteDialog open={state.invite === "1"} onOpenChange={(o) => setState({ invite: o ? "1" : "" })} />
      <BatchInviteDialog open={batchOpen} onOpenChange={setBatchOpen} />
      <InvitationDetailDialog invitation={detail} onOpenChange={(o) => !o && setDetail(null)} />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === "resend" ? "Resend invitation?" : "Revoke invitation?"}
        description={
          pending?.kind === "resend"
            ? `A new invitation link with a new expiry will be emailed to ${pending.invitation.email}. The previous link stops working.`
            : `${pending?.invitation.email ?? "The invitee"} will no longer be able to accept this invitation. Revoked invitations cannot be resent.`
        }
        confirmLabel={pending?.kind === "resend" ? "Resend" : "Revoke"}
        tone={pending?.kind === "resend" ? "primary" : "danger"}
        loading={action.isPending}
        onConfirm={() => pending && action.mutate(pending, { onError: (e) => toast.error(userOrgErrorMessage(e)) })}
      />
    </SectionCard>
  );
}

export default function InvitationsPage() {
  return (
    <RequirePermission permission={P.PLATFORM_USERS_VIEW}>
      <InvitationsContent />
    </RequirePermission>
  );
}
