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

const REVOKING: AccountStatus[] = ["Locked", "Suspended", "Closed"];

/** Identity account status (login-level), separate from platform access. Gated by platform-users.disable in the UI only. */
export function IdentityStatusCard({ userId, userName }: { userId: string; userName: string }) {
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
      <div role="note" className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
        Security note: the identity service does not authorise this endpoint server-side — any signed-in user could call it. Access here is restricted in the console to holders of <span className="font-mono">platform-users.disable</span>. The current account status of another user is not exposed by an admin API.
      </div>
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
            {ACCOUNT_STATUSES.map((s) => (
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
                setError(getErrorMessage(e));
                toast.error(getErrorMessage(e));
                setConfirming(false);
              },
            },
          )
        }
      />
    </div>
  );
}
