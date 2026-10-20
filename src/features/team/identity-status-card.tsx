import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormError, FormField } from "@/components/forms/form-field";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { getErrorMessage } from "@/lib/api/errors";
import { ACCOUNT_STATUSES, identityAdminService } from "@/services/identity-admin.service";
import type { AccountStatus } from "@/api/types/identity";
import { humanize } from "@/lib/utils/format";
import { isApiError } from "@/lib/api/errors";
import { useAccess } from "@/lib/auth/use-access";
import { PERMISSIONS as P } from "@/api/types/user-organization";

const REVOKING: AccountStatus[] = ["Locked", "Suspended", "Closed"];

/**
 * Which statuses the signed-in admin may set — mirrors the server check (identity AdminController.cs:96-113):
 * Active needs enable or update; Locked/Suspended/Closed need disable or update; anything else needs update.
 */
export function useSettableAccountStatuses(): AccountStatus[] {
  const { can } = useAccess();
  const update = can(P.PLATFORM_USERS_UPDATE);
  return ACCOUNT_STATUSES.filter((s) => (s === "Active" ? update || can(P.PLATFORM_USERS_ENABLE) : REVOKING.includes(s) ? update || can(P.PLATFORM_USERS_DISABLE) : update));
}

/** Identity account status (login-level), separate from platform access. The identity service enforces the permissions server-side. */
export function IdentityStatusCard({ userId, userName }: { userId: string; userName: string }) {
  const settable = useSettableAccountStatuses();
  const [status, setStatus] = React.useState<AccountStatus | "">("");
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useApiMutation({
    mutationFn: (vars: { status: AccountStatus; reason: string }) => identityAdminService.updateUserStatus(userId, vars.status, vars.reason),
    toastOnError: false,
    successMessage: (res) => res.message || "Account status updated.",
    onSuccess: () => {
      setConfirming(false);
      setStatus("");
      setReason("");
      setTouched(false);
    },
  });

  const statusError = touched && !status ? "Select a status." : undefined;
  const reasonError = touched && !reason.trim() ? "A reason is required." : undefined;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Changes whether this person can sign in at all. The current account status of another user isn't available from the API, so pick the status you want to set.
      </p>
      <FormError message={error} />
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (status && reason.trim()) setConfirming(true);
        }}
      >
        <FormField label="New account status" htmlFor="identity-status" required error={statusError}>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as AccountStatus | "")}>
            <option value="">Select status…</option>
            {settable.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Reason" htmlFor="identity-reason" required error={reasonError} className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary">
            Change account status
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Set account status to ${status ? humanize(status) : ""}?`}
        description={
          status && REVOKING.includes(status)
            ? `${userName} will be signed out of every session immediately and will not be able to sign in while the account is ${humanize(status).toLowerCase()}.`
            : `${userName}'s identity account status will be changed. Failed-login lockout counters are not reset by this action.`
        }
        confirmLabel="Change status"
        tone={status && REVOKING.includes(status) ? "danger" : "primary"}
        loading={mutation.isPending}
        onConfirm={() =>
          status &&
          mutation.mutate(
            { status, reason: reason.trim() },
            {
              onError: (e) => {
                const message = isApiError(e) && e.status === 403 ? `You don't have permission to set an account to ${humanize(status).toLowerCase()}.` : getErrorMessage(e);
                setError(message);
                toast.error(message);
                setConfirming(false);
              },
            },
          )
        }
      />
    </div>
  );
}
