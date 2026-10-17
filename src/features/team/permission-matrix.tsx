import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormError } from "@/components/forms/form-field";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { platformService } from "@/services/platform.service";
import type { PlatformPermissionResponse } from "@/api/types/user-organization";
import { teamKeys } from "./queries";
import { userOrgErrorMessage } from "./errors";

function groupByModule(perms: PlatformPermissionResponse[]): Array<[string, PlatformPermissionResponse[]]> {
  const groups = new Map<string, PlatformPermissionResponse[]>();
  for (const p of perms) {
    const key = p.module || "Other";
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

const lower = (s: string) => s.toLowerCase();

/**
 * Permission editor grouped by `module`. Saving is a FULL REPLACE (PUT roles/{id}/permissions).
 * `catalog` = GET /platform/permissions (active only). When `readOnly`, only the role's current
 * permissions are shown.
 */
export function PermissionMatrix({
  roleId,
  roleName,
  current,
  catalog,
  readOnly,
}: {
  roleId: string;
  roleName: string;
  current: PlatformPermissionResponse[];
  catalog: PlatformPermissionResponse[] | null;
  readOnly: boolean;
}) {
  const initial = React.useMemo(() => new Set(current.map((p) => lower(p.code))), [current]);
  const [selected, setSelected] = React.useState<Set<string>>(initial);
  const [filter, setFilter] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setSelected(new Set(initial)), [initial]);

  const source = readOnly || !catalog ? current : catalog;
  const groups = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const visible = q ? source.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.module ?? "").toLowerCase().includes(q)) : source;
    return groupByModule(visible);
  }, [source, filter]);

  // Permissions the role holds that are not in the active catalog (inactive) are not re-sent; the server only accepts active codes.
  const catalogCodes = React.useMemo(() => new Set((catalog ?? []).map((p) => lower(p.code))), [catalog]);
  const added = [...selected].filter((c) => !initial.has(c)).length;
  const removed = [...initial].filter((c) => !selected.has(c)).length;
  const dirty = added + removed > 0;

  const save = useApiMutation({
    mutationFn: (codes: string[]) => platformService.setRolePermissions(roleId, { permissionCodes: codes }),
    invalidate: [teamKeys.role(roleId), teamKeys.roles],
    toastOnError: false,
    successMessage: `Permissions saved for "${roleName}".`,
    onSuccess: () => setConfirming(false),
  });

  const toggle = (code: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(lower(code));
      else next.delete(lower(code));
      return next;
    });

  const submit = () => {
    setError(null);
    const codes = (catalog ?? []).filter((p) => selected.has(lower(p.code))).map((p) => p.code);
    save.mutate(codes, {
      onError: (e) => {
        setError(userOrgErrorMessage(e));
        toast.error(userOrgErrorMessage(e));
        setConfirming(false);
      },
    });
  };

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter permissions…" aria-label="Filter permissions" className="sm:w-72" />
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {added} added · {removed} removed
              </span>
            )}
            <Button variant="secondary" onClick={() => setSelected(new Set(initial))} disabled={!dirty || save.isPending}>
              Discard
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!dirty} loading={save.isPending}>
              Save permissions
            </Button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{source.length ? "No permissions match the filter." : "This role has no permissions."}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map(([module, perms]) => {
            const on = perms.filter((p) => selected.has(lower(p.code))).length;
            const groupId = `perm-group-${module.replace(/\W+/g, "-")}`;
            return (
              <fieldset key={module} className="rounded-lg border border-border">
                <legend className="sr-only">{module}</legend>
                <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-2.5">
                  {!readOnly && (
                    <Checkbox
                      id={groupId}
                      aria-label={`Select all ${module} permissions`}
                      checked={on === perms.length ? true : on > 0 ? "indeterminate" : false}
                      onCheckedChange={(v) => perms.forEach((p) => toggle(p.code, v === true))}
                    />
                  )}
                  <span className="flex-1 font-heading text-sm font-medium text-foreground">{module}</span>
                  <span className="text-xs text-muted-foreground">
                    {on}/{perms.length}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {perms.map((p) => {
                    const id = `perm-${p.platformPermissionId}`;
                    const inactive = Boolean(catalog) && !catalogCodes.has(lower(p.code));
                    return (
                      <li key={p.platformPermissionId} className="flex items-start gap-3 px-4 py-2">
                        {!readOnly && <Checkbox id={id} className="mt-0.5" checked={selected.has(lower(p.code))} onCheckedChange={(v) => toggle(p.code, v === true)} />}
                        <label htmlFor={readOnly ? undefined : id} className="min-w-0 flex-1 cursor-pointer">
                          <span className="block text-sm text-foreground">{p.name}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{p.code}</span>
                          {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
                          {inactive && <span className="block text-xs text-warning-soft-foreground">Inactive — will be dropped on save</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Replace role permissions?"
        description={`"${roleName}" will have exactly the ${(catalog ?? []).filter((p) => selected.has(lower(p.code))).length} selected permission(s) (${added} added, ${removed} removed). Every user with this role is affected immediately.`}
        confirmLabel="Save permissions"
        tone="primary"
        loading={save.isPending}
        onConfirm={submit}
      />
    </div>
  );
}
