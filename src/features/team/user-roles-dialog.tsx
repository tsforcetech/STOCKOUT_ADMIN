import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { FormError } from "@/components/forms/form-field";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAccess } from "@/lib/auth/use-access";
import { platformService } from "@/services/platform.service";
import { teamKeys, useRolesQuery } from "./queries";
import { RoleChecklist } from "./role-picker";
import { userOrgErrorMessage } from "./errors";

/**
 * PUT /platform/users/{id}/roles — a FULL REPLACE of the user's role set.
 * `knownCodes` is the user's real role set when it could be read (super admins via
 * /platform/admins/{id}/roles); otherwise null and the editor starts empty with an explicit warning.
 */
export function UserRolesDialog({ open, onOpenChange, userId, userName, knownCodes }: { open: boolean; onOpenChange: (open: boolean) => void; userId: string; userName: string; knownCodes: string[] | null }) {
  const { isSuperAdmin } = useAccess();
  const roles = useRolesQuery(open);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSelected(knownCodes ?? []);
      setAcknowledged(false);
      setError(null);
    }
  }, [open, knownCodes]);

  const mutation = useApiMutation({
    mutationFn: (codes: string[]) => platformService.setUserRoles(userId, { roleCodes: codes }),
    invalidate: [teamKeys.users, teamKeys.user(userId), teamKeys.adminRoles(userId), teamKeys.admins, teamKeys.roles],
    toastOnError: false,
    successMessage: `Roles updated for ${userName}.`,
    onSuccess: () => onOpenChange(false),
  });

  const activeRoles = (roles.data ?? []).filter((r) => r.isActive);
  const needsAck = knownCodes === null || selected.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent
        size="lg"
        title="Replace roles"
        description={`Saving replaces ${userName}'s entire platform role set with the roles selected below.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              disabled={!roles.data || (needsAck && !acknowledged)}
              onClick={() => {
                setError(null);
                mutation.mutate(selected, { onError: (e) => { setError(userOrgErrorMessage(e)); toast.error(userOrgErrorMessage(e)); } });
              }}
            >
              Replace role set
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />
          {knownCodes === null && (
            <div role="note" className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              The user's current roles cannot be read reliably (the users API returns empty role codes — backend defect), so nothing is pre-selected. Select <strong>every</strong> role this user should have; any role not selected will be removed.
            </div>
          )}
          {roles.isLoading ? (
            <TableSkeleton rows={4} columns={2} />
          ) : roles.error ? (
            <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
          ) : (
            <fieldset>
              <legend className="mb-1.5 text-sm text-body">Active roles</legend>
              <RoleChecklist
                idPrefix="user-role"
                roles={activeRoles}
                value={selected}
                onChange={setSelected}
                isDisabled={(r) => (r.isSystemRole && !isSuperAdmin && !selected.includes(r.code) ? "System roles can only be granted by a PlatformSuperAdmin." : false)}
              />
            </fieldset>
          )}
          {needsAck && (
            <label className="flex items-start gap-2 text-sm text-foreground">
              <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} className="mt-0.5" />
              <span>{selected.length === 0 ? "I understand this removes all platform roles from this user." : "I understand any role not selected above will be removed from this user."}</span>
            </label>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
