import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DetailList } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import { platformService } from "@/services/platform.service";
import type { PlatformInvitationResponse } from "@/api/types/user-organization";
import { teamKeys } from "./queries";
import { RoleCodeBadges } from "./role-picker";
import { formatUtcDateTime } from "./utc";

/**
 * GET /platform/users/invitations/{id}. The list and detail endpoints fill different fields:
 * the list has `invitedBy` (name) but no inviter id / revokedAt; the detail has the inviter id and
 * revokedAt but `invitedBy` is "". We merge both so nothing available is hidden.
 */
export function InvitationDetailDialog({ invitation, onOpenChange }: { invitation: PlatformInvitationResponse | null; onOpenChange: (open: boolean) => void }) {
  const id = invitation?.invitationId ?? "";
  const detail = useQuery({ queryKey: teamKeys.invitation(id), queryFn: ({ signal }) => platformService.invitation(id, signal), enabled: Boolean(id) });
  const d = detail.data;
  return (
    <Dialog open={invitation !== null} onOpenChange={onOpenChange}>
      <DialogContent title="Invitation" description={invitation?.email} size="lg">
        {detail.isLoading ? (
          <TableSkeleton rows={4} columns={2} />
        ) : detail.error ? (
          <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
        ) : (
          <DetailList
            items={[
              { label: "Email", value: d?.email ?? invitation?.email },
              { label: "Status", value: <StatusBadge value={d?.status ?? invitation?.status} /> },
              { label: "Roles", value: <RoleCodeBadges codes={d?.roles ?? invitation?.roles ?? []} />, full: true },
              { label: "Invited", value: formatUtcDateTime(d?.invitedAtUtc ?? invitation?.invitedAtUtc) },
              { label: "Expires", value: formatUtcDateTime(d?.expiresAtUtc ?? invitation?.expiresAtUtc) },
              { label: "Accepted", value: formatUtcDateTime(d?.acceptedAtUtc ?? invitation?.acceptedAtUtc) },
              { label: "Revoked", value: formatUtcDateTime(d?.revokedAtUtc) },
              { label: "Invited by", value: invitation?.invitedBy || d?.invitedBy || "—" },
              { label: "Inviter user ID", value: <IdText value={d?.invitedByUserId ?? invitation?.invitedByUserId} /> },
              { label: "Invitation ID", value: <IdText value={id} /> },
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
