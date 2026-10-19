import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { Badge, Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import type { PlatformFeatureFlagResponse } from "@/api/types/user-organization";
import { userOrgErrorCode, userOrgErrorMessage } from "@/features/team/errors";
import { formatUtcDateTime } from "@/features/team/utc";
import { settingsKeys } from "./queries";

/** A feature flag switches behaviour for every user, so each change is confirmed first. */
export function FlagRow({ flag: f, canUpdate }: { flag: PlatformFeatureFlagResponse; canUpdate: boolean }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<"toggle" | "reset" | null>(null);
  const id = `flag-${f.platformFeatureFlagId}`;
  const changed = f.isEnabled !== f.defaultEnabled;

  const mutation = useApiMutation({
    mutationFn: (kind: "toggle" | "reset") =>
      kind === "toggle" ? platformService.updateFeatureFlag(f.key, { isEnabled: !f.isEnabled, expectedVersion: f.version }) : platformService.resetFeatureFlag(f.key, f.version),
    invalidate: [settingsKeys.featureFlags],
    toastOnError: false,
    successMessage: (d, kind) => (kind === "reset" ? `"${d.name}" reset to its default (${d.isEnabled ? "on" : "off"}).` : `"${d.name}" turned ${d.isEnabled ? "on" : "off"}.`),
    onSuccess: () => setPending(null),
  });

  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="font-medium text-foreground">
            {f.name}
          </label>
          {changed && <Badge tone="primary">Changed</Badge>}
        </div>
        {f.description && <p className="mt-1 max-w-[65ch] text-sm leading-5 text-muted-foreground">{f.description}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">{f.key}</code>
          <span>Default {f.defaultEnabled ? "on" : "off"}</span>
          {f.updatedAtUtc && <span>· Updated {formatUtcDateTime(f.updatedAtUtc)}</span>}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 md:items-end">
        <span className="inline-flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{f.isEnabled ? "On" : "Off"}</span>
          <Switch id={id} checked={f.isEnabled} disabled={!canUpdate || mutation.isPending} onCheckedChange={() => setPending("toggle")} />
        </span>
        {canUpdate && changed && (
          <button
            type="button"
            onClick={() => setPending("reset")}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowCounterClockwiseIcon className="size-3.5" /> Reset to default
          </button>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending === "reset" ? "Reset feature flag?" : `Turn ${f.isEnabled ? "off" : "on"} "${f.name}"?`}
        description={pending === "reset" ? `"${f.name}" will return to its default (${f.defaultEnabled ? "on" : "off"}).` : "This changes platform behaviour for every user as soon as services pick up the new configuration."}
        confirmLabel={pending === "reset" ? "Reset" : f.isEnabled ? "Turn off" : "Turn on"}
        tone={pending === "toggle" && !f.isEnabled ? "primary" : "danger"}
        loading={mutation.isPending}
        onConfirm={() =>
          pending &&
          mutation.mutate(pending, {
            onError: (e) => {
              toast.error(userOrgErrorMessage(e));
              if (userOrgErrorCode(e) === "VERSION_CONFLICT") {
                setPending(null);
                void queryClient.invalidateQueries({ queryKey: settingsKeys.featureFlags });
              }
            },
          })
        }
      />
    </li>
  );
}
