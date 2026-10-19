import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowCounterClockwiseIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge, Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import type { PlatformSettingResponse } from "@/api/types/user-organization";
import { userOrgErrorCode, userOrgErrorMessage } from "@/features/team/errors";
import { formatUtcDateTime } from "@/features/team/utc";
import { cn } from "@/lib/utils/cn";
import { settingsKeys } from "./queries";
import { unitFor, validateSettingValue } from "./setting-value";

/**
 * One platform setting edited in place: switches save immediately, text and numbers show Save / Cancel once changed.
 * PUT /platform/settings/{key} carries expectedVersion; on VERSION_CONFLICT the list is refetched and the draft is kept,
 * so the next Save uses the new version.
 */
export function SettingRow({ setting: s, canUpdate }: { setting: PlatformSettingResponse; canUpdate: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const id = `setting-${s.platformSettingId}`;
  const editable = s.isEditable && canUpdate;
  const overridden = s.currentValue !== null;
  const value = draft ?? s.effectiveValue;
  const dirty = draft !== null && draft !== s.effectiveValue;
  const validation = dirty ? validateSettingValue(s.valueType, draft) : null;
  const unit = unitFor(s.key);

  const onError = (err: unknown) => {
    setError(userOrgErrorMessage(err));
    const code = userOrgErrorCode(err);
    if (code === "VERSION_CONFLICT" || code === "SETTING_NOT_EDITABLE" || code === "SETTING_NOT_FOUND") void queryClient.invalidateQueries({ queryKey: settingsKeys.settings });
  };

  const save = useApiMutation({
    mutationFn: (v: string) => platformService.updateSetting(s.key, { value: v, expectedVersion: s.version }),
    invalidate: [settingsKeys.settings],
    toastOnError: false,
    successMessage: (d) => `"${d.name}" saved.`,
    onSuccess: () => {
      setDraft(null);
      setError(null);
    },
  });
  const reset = useApiMutation({
    mutationFn: () => platformService.resetSetting(s.key, s.version),
    invalidate: [settingsKeys.settings],
    toastOnError: false,
    successMessage: (d) => `"${d.name}" reset to its default.`,
    onSuccess: () => {
      setConfirmReset(false);
      setDraft(null);
      setError(null);
    },
  });

  const commit = () => {
    if (!dirty || validation || save.isPending) return;
    setError(null);
    save.mutate(draft, { onError });
  };
  const cancel = () => {
    setDraft(null);
    setError(null);
  };

  let control: React.ReactNode;
  if (!editable) {
    control = (
      <span className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface-muted px-3 py-2 font-mono text-sm text-foreground">
        <span className="truncate" title={s.effectiveValue}>
          {display(s, s.effectiveValue)}
        </span>
        {unit && <span className="font-sans text-xs text-muted-foreground">{unit}</span>}
      </span>
    );
  } else if (s.valueType === "BOOLEAN") {
    const on = value === "true";
    control = (
      <span className="inline-flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{on ? "On" : "Off"}</span>
        <Switch
          id={id}
          checked={on}
          disabled={save.isPending}
          onCheckedChange={(v) => {
            setError(null);
            save.mutate(v ? "true" : "false", { onError });
          }}
        />
      </span>
    );
  } else {
    const long = s.valueType === "STRING" && (value.length > 60 || s.defaultValue.length > 60);
    const field = long ? (
      <Textarea id={id} rows={3} maxLength={1000} value={value} onChange={(e) => setDraft(e.target.value)} aria-invalid={!!validation} className="w-full" />
    ) : (
      <Input
        id={id}
        value={value}
        inputMode={s.valueType === "INTEGER" ? "numeric" : s.valueType === "DECIMAL" ? "decimal" : undefined}
        maxLength={s.valueType === "STRING" ? 1000 : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape" && dirty) {
            e.preventDefault();
            cancel();
          }
        }}
        aria-invalid={!!validation}
        className={cn("h-10", s.valueType === "STRING" ? "w-full" : "w-32 text-right font-mono")}
      />
    );
    control = (
      <div className={cn("flex flex-wrap items-center gap-2", s.valueType === "STRING" ? "w-full md:w-[320px]" : "md:justify-end")}>
        {field}
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        {dirty && (
          <span className="flex gap-1.5">
            <Button size="sm" variant="action" onClick={commit} loading={save.isPending} disabled={!!validation}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={save.isPending}>
              Cancel
            </Button>
          </span>
        )}
      </div>
    );
  }

  return (
    <li className={cn("grid gap-3 px-5 py-4 transition-colors md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-6", dirty && "bg-action-soft/40")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={editable ? id : undefined} className="font-medium text-foreground">
            {s.name}
          </label>
          {overridden && <Badge tone="primary">Changed</Badge>}
          {!s.isEditable && (
            <Badge>
              <LockSimpleIcon className="size-3" aria-hidden /> Read-only
            </Badge>
          )}
        </div>
        {s.description && <p className="mt-1 max-w-[65ch] text-sm leading-5 text-muted-foreground">{s.description}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">{s.key}</code>
          <span>
            Default {display(s, s.defaultValue)}
            {unit ? ` ${unit}` : ""}
          </span>
          {s.updatedAtUtc && <span>· Updated {formatUtcDateTime(s.updatedAtUtc)}</span>}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 md:items-end">
        {control}
        {(validation || error) && (
          <p role="alert" className="text-xs text-danger-soft-foreground md:text-right">
            {validation ?? error}
          </p>
        )}
        {editable && overridden && !dirty && (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowCounterClockwiseIcon className="size-3.5" /> Reset to default
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to default?"
        description={`"${s.name}" will change from ${display(s, s.effectiveValue)} back to its default ${display(s, s.defaultValue)}.`}
        confirmLabel="Reset"
        loading={reset.isPending}
        onConfirm={() =>
          reset.mutate(undefined, {
            onError: (err) => {
              setConfirmReset(false);
              onError(err);
            },
          })
        }
      />
    </li>
  );
}

function display(s: PlatformSettingResponse, v: string) {
  if (s.valueType === "BOOLEAN") return v === "true" ? "On" : "Off";
  if (s.valueType === "STRING" && v === "") return "(empty)";
  return v;
}
