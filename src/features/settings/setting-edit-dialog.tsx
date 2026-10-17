import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { FormError, FormField } from "@/components/forms/form-field";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import type { PlatformSettingResponse } from "@/api/types/user-organization";
import { userOrgErrorCode, userOrgErrorMessage } from "@/features/team/errors";
import { settingsKeys } from "./queries";
import { validateSettingValue, VALUE_TYPE_LABEL } from "./setting-value";

/**
 * PUT /platform/settings/{key} with expectedVersion. `setting` is always the latest cached row, so
 * after a VERSION_CONFLICT refetch the next save uses the new version while the draft is kept.
 */
export function SettingEditDialog({ setting, onOpenChange }: { setting: PlatformSettingResponse | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const openKey = setting?.key ?? null;

  React.useEffect(() => {
    if (openKey && setting) {
      setDraft(setting.effectiveValue ?? "");
      setTouched(false);
      setError(null);
    }
    // Reset only when a different setting is opened, not when its data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  const save = useApiMutation({
    mutationFn: (s: { key: string; value: string; version: number }) => platformService.updateSetting(s.key, { value: s.value, expectedVersion: s.version }),
    invalidate: [settingsKeys.settings],
    toastOnError: false,
    successMessage: (d) => `"${d.name}" updated.`,
    onSuccess: () => onOpenChange(false),
  });

  if (!setting) return null;
  const type = setting.valueType;
  const validation = validateSettingValue(type, draft);
  const unchanged = draft === setting.effectiveValue;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (validation || unchanged) return;
    save.mutate(
      { key: setting.key, value: draft, version: setting.version },
      {
        onError: (err) => {
          setError(userOrgErrorMessage(err));
          const code = userOrgErrorCode(err);
          if (code === "VERSION_CONFLICT" || code === "SETTING_NOT_EDITABLE" || code === "SETTING_NOT_FOUND") void queryClient.invalidateQueries({ queryKey: settingsKeys.settings });
        },
      },
    );
  };

  const id = "setting-value";
  return (
    <Dialog open onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent
        title={`Edit ${setting.name}`}
        description={<span className="font-mono">{setting.key}</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="setting-form" loading={save.isPending} disabled={!setting.isEditable || unchanged}>
              Save
            </Button>
          </>
        }
      >
        <form id="setting-form" noValidate onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          {setting.description && <p className="text-sm text-muted-foreground">{setting.description}</p>}
          {type === "BOOLEAN" ? (
            <div className="flex items-center gap-3">
              <Switch id={id} checked={draft === "true"} onCheckedChange={(v) => setDraft(v ? "true" : "false")} disabled={!setting.isEditable} />
              <label htmlFor={id} className="text-sm text-foreground">
                {draft === "true" ? "Enabled (true)" : "Disabled (false)"}
              </label>
            </div>
          ) : (
            <FormField
              label={`Value (${VALUE_TYPE_LABEL[type]})`}
              htmlFor={id}
              required={type !== "STRING"}
              error={touched ? (validation ?? undefined) : undefined}
              hint={type === "STRING" ? `${draft.length}/1000` : `Default: ${setting.defaultValue}`}
            >
              {type === "STRING" ? (
                <Textarea rows={3} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!setting.isEditable} />
              ) : (
                <Input inputMode={type === "INTEGER" ? "numeric" : "decimal"} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!setting.isEditable} />
              )}
            </FormField>
          )}
          <p className="text-xs text-muted-foreground">
            Server value: <span className="font-mono">{setting.currentValue ?? `(default) ${setting.defaultValue}`}</span> · version {setting.version}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
