import { Badge, Checkbox } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import type { PlatformRoleListResponse } from "@/api/types/user-organization";

/** Checkbox list of platform roles (by code). */
export function RoleChecklist({
  roles,
  value,
  onChange,
  idPrefix,
  isDisabled,
  invalid,
  describedBy,
}: {
  roles: PlatformRoleListResponse[];
  value: string[];
  onChange: (codes: string[]) => void;
  idPrefix: string;
  isDisabled?: (role: PlatformRoleListResponse) => string | false;
  invalid?: boolean;
  describedBy?: string;
}) {
  const toggle = (code: string, checked: boolean) => onChange(checked ? [...value, code] : value.filter((c) => c !== code));
  if (!roles.length) return <p className="text-sm text-muted-foreground">No active roles are available.</p>;
  return (
    <ul className={cn("max-h-64 divide-y divide-border overflow-y-auto rounded-md border", invalid ? "border-danger" : "border-border")} aria-describedby={describedBy}>
      {roles.map((role) => {
        const id = `${idPrefix}-${role.platformRoleId}`;
        const disabledReason = isDisabled?.(role) || false;
        return (
          <li key={role.platformRoleId} className="flex items-start gap-3 px-3 py-2.5">
            <Checkbox id={id} className="mt-0.5" checked={value.includes(role.code)} disabled={Boolean(disabledReason)} onCheckedChange={(v) => toggle(role.code, v === true)} />
            <label htmlFor={id} className={cn("min-w-0 flex-1 cursor-pointer", disabledReason && "cursor-not-allowed opacity-60")}>
              <span className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                {role.name}
                <span className="font-mono text-xs text-muted-foreground">{role.code}</span>
                {role.isSystemRole && <Badge tone="info">System</Badge>}
              </span>
              {role.description && <span className="block text-xs text-muted-foreground">{role.description}</span>}
              {disabledReason && <span className="block text-xs text-muted-foreground">{disabledReason}</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact role toggles used in dense rows (batch invite). */
export function RoleChips({ roles, value, onChange, label }: { roles: PlatformRoleListResponse[]; value: string[]; onChange: (codes: string[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {roles.map((role) => {
        const on = value.includes(role.code);
        return (
          <button
            key={role.platformRoleId}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((c) => c !== role.code) : [...value, role.code])}
            className={cn(
              "h-7 cursor-pointer rounded-sm border px-2 text-xs transition-colors",
              on ? "border-action-border bg-action text-action-foreground" : "border-secondary-border bg-surface text-foreground hover:bg-surface-muted",
            )}
            title={role.description ?? role.name}
          >
            {role.name}
          </button>
        );
      })}
    </div>
  );
}

/** Role codes as small badges. */
export function RoleCodeBadges({ codes, empty = "—" }: { codes: string[]; empty?: string }) {
  if (!codes.length) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <Badge key={c} tone="neutral">
          {c}
        </Badge>
      ))}
    </span>
  );
}
