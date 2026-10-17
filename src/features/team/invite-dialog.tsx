import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError, FormField } from "@/components/forms/form-field";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { applyApiErrorToForm } from "@/lib/api/form-errors";
import { platformService } from "@/services/platform.service";
import { teamKeys, useAssignableRolesQuery } from "./queries";
import { RoleChecklist } from "./role-picker";
import { formatUtcDateTime } from "./utc";
import { userOrgErrorCode, userOrgErrorMessage } from "./errors";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required.").pipe(z.email("Enter a valid email address.")),
  roleCodes: z.array(z.string()).min(1, "Select at least one role."),
});
type Values = z.infer<typeof schema>;

/** POST /platform/users/invitations. Roles come from /platform/roles/assignable (requires platform-users.invite). */
export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const roles = useAssignableRolesQuery(open);
  const [formError, setFormError] = React.useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", roleCodes: [] } });

  React.useEffect(() => {
    if (open) {
      form.reset({ email: "", roleCodes: [] });
      setFormError(null);
    }
  }, [open, form]);

  const invite = useApiMutation({
    mutationFn: (v: Values) => platformService.invite({ email: v.email, roleCodes: v.roleCodes }),
    invalidate: [teamKeys.invitationsAll],
    toastOnError: false,
    successMessage: (inv) => `Invitation sent to ${inv.email}. It expires ${formatUtcDateTime(inv.expiresAtUtc)}.`,
    onSuccess: () => onOpenChange(false),
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    invite.mutate(values, {
      onError: (error) => {
        if (userOrgErrorCode(error) === "INVITATION_ALREADY_PENDING") {
          form.setError("email", { type: "server", message: userOrgErrorMessage(error) });
          return;
        }
        const unmatched = applyApiErrorToForm(error, form.setError, ["email", "roleCodes"]);
        if (unmatched) setFormError(userOrgErrorCode(error) ? userOrgErrorMessage(error) : unmatched);
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !invite.isPending && onOpenChange(o)}>
      <DialogContent
        title="Invite user"
        description="The invitee receives an email with a link to join the admin console. Invitations expire after the configured period (72 hours by default)."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" loading={invite.isPending} disabled={!roles.data}>
              Send invitation
            </Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError message={formError} />
          <FormField label="Email" htmlFor="invite-email" required error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="off" placeholder="name@company.com" {...form.register("email")} />
          </FormField>
          <fieldset className="space-y-1.5">
            <legend className="text-sm text-body">
              Roles<span className="ml-0.5 text-danger" aria-hidden>*</span>
            </legend>
            {roles.isLoading ? (
              <TableSkeleton rows={3} columns={2} />
            ) : roles.error ? (
              <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
            ) : (
              <Controller
                control={form.control}
                name="roleCodes"
                render={({ field, fieldState }) => (
                  <RoleChecklist idPrefix="invite-role" roles={roles.data ?? []} value={field.value} onChange={field.onChange} invalid={Boolean(fieldState.error)} describedBy="invite-roles-hint" />
                )}
              />
            )}
            {form.formState.errors.roleCodes?.message ? (
              <p id="invite-roles-hint" role="alert" className="text-xs text-danger-soft-foreground">
                {form.formState.errors.roleCodes.message}
              </p>
            ) : (
              <p id="invite-roles-hint" className="text-xs text-muted-foreground">
                Only roles you are allowed to assign are listed. System roles (PlatformAdmin, PlatformSuperAdmin) are not offered here — use Platform admins after the user joins.
              </p>
            )}
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
