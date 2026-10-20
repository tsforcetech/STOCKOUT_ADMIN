import type * as React from "react";
import type { Icon } from "@phosphor-icons/react";
import { Switch } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";

/** Card used by every Search tab — same header language as the Settings cards (ink icon tile + heading). */
export function SearchCard({
  icon: CardIcon,
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  icon: Icon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-xl bg-surface", className)} aria-label={title}>
      <header className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink text-ink-foreground">
            <CardIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold leading-6 text-foreground">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Switch + label used as a list filter ("Active only"). */
export function FilterSwitch({ id, label, checked, onCheckedChange }: { id: string; label: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <label htmlFor={id} className="cursor-pointer text-sm text-foreground">
        {label}
      </label>
    </div>
  );
}
