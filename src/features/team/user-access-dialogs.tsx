import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import type { PlatformUserListResponse } from "@/api/types/user-organization";
import { teamKeys } from "./queries";
import { userOrgErrorMessage } from "./errors";

export type UserAccessAction = { kind: "disable" | "enable"; user: Pick<PlatformUserListResponse, "userId" | "displayName" | "email"> } | null;

const nameOf = (u: Pick<PlatformUserListResponse, "displayName" | "email">) => u.displayName || u.email || "This user";

/** Disable (reason required, max 500) / enable platform access. Dialogs stay open on failure. */
export function UserAccessDialogs({ action, onClose }: { action: UserAccessAction; onClose: () => void }) {
  const mutation = useApiMutation({
    mutationFn: (vars: { action: NonNullable<UserAccessAction>; reason?: string }) =>
      vars.action.kind === "disable" ? platformService.disableUser(vars.action.user.userId, { reason: vars.reason ?? "" }) : platformService.enableUser(vars.action.user.userId),
    invalidate: (_d, vars) => [teamKeys.users, teamKeys.user(vars.action.user.userId)],
    toastOnError: false,
    successMessage: (_d, vars) => `${nameOf(vars.action.user)} ${vars.action.kind === "disable" ? "disabled" : "enabled"}.`,
    onSuccess: onClose,
  });
  const onError = (e: unknown) => toast.error(userOrgErrorMessage(e));

  return (
    <>
      <ReasonDialog
        open={action?.kind === "disable"}
        onOpenChange={(o) => !o && onClose()}
        title="Disable platform access?"
        description={`${action ? nameOf(action.user) : "This user"} will lose every platform permission immediately. Their roles are kept and restored if access is re-enabled.`}
        confirmLabel="Disable user"
        loading={mutation.isPending}
        onConfirm={(reason) => action && mutation.mutate({ action, reason }, { onError })}
      />
      <ConfirmDialog
        open={action?.kind === "enable"}
        onOpenChange={(o) => !o && onClose()}
        title="Enable platform access?"
        description={`${action ? nameOf(action.user) : "This user"} will regain the permissions of their assigned roles.`}
        confirmLabel="Enable user"
        tone="primary"
        loading={mutation.isPending}
        onConfirm={() => action && mutation.mutate({ action }, { onError })}
      />
    </>
  );
}
