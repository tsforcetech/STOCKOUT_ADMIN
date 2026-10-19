import * as React from "react";
import {
  BellIcon,
  CreditCardIcon,
  FlagIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  StorefrontIcon,
  type Icon,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { RefreshButton } from "@/components/common/section-card";
import { EmptyState, ErrorState, PermissionDenied } from "@/components/feedback/states";
import { Skeleton } from "@/components/ui/misc";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { PERMISSIONS as P, type PlatformFeatureFlagResponse, type PlatformSettingResponse } from "@/api/types/user-organization";
import { humanize } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { useFeatureFlagsQuery, useSettingsQuery } from "./queries";
import { SettingRow } from "./setting-row";
import { FlagRow } from "./flag-row";

const FLAGS = "feature-flags";

function categoryIcon(category: string): Icon {
  const c = category.toLowerCase();
  if (/inventory|listing|catalog|stock/.test(c)) return PackageIcon;
  if (/seller|marketplace/.test(c)) return StorefrontIcon;
  if (/security|auth|identity|session/.test(c)) return ShieldCheckIcon;
  if (/notif|email|sms/.test(c)) return BellIcon;
  if (/payment|order|billing|subscription/.test(c)) return CreditCardIcon;
  if (/search/.test(c)) return MagnifyingGlassIcon;
  return GearSixIcon;
}

const matches = (q: string, ...fields: (string | null)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q));

export default function SettingsPage() {
  const { can } = useAccess();
  const canSettings = can(P.SETTINGS_VIEW);
  const canFlags = can(P.FEATURE_FLAGS_VIEW);
  const [state, setState] = useUrlState({ section: "", q: "" });
  const settingsQ = useSettingsQuery(canSettings);
  const flagsQ = useFeatureFlagsQuery(canFlags);
  const q = state.q.trim().toLowerCase();

  const groups = React.useMemo(() => {
    const map = new Map<string, PlatformSettingResponse[]>();
    for (const s of settingsQ.data ?? []) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => ({ category, items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [settingsQ.data]);
  const flags = React.useMemo(() => [...(flagsQ.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [flagsQ.data]);

  if (!canSettings && !canFlags) {
    return (
      <>
        <PageHeader eyebrow="StockOut administration" title="Settings" />
        <PermissionDenied />
      </>
    );
  }

  const nav = [
    { value: "", label: "All settings", icon: SquaresFourIcon, count: (settingsQ.data?.length ?? 0) + flags.length },
    ...groups.map((g) => ({ value: g.category, label: humanize(g.category), icon: categoryIcon(g.category), count: g.items.length })),
    ...(canFlags ? [{ value: FLAGS, label: "Feature flags", icon: FlagIcon, count: flags.length }] : []),
  ];
  const section = nav.some((n) => n.value === state.section) ? state.section : "";

  const visibleGroups = groups
    .filter((g) => !section || section === g.category)
    .map((g) => ({ ...g, items: g.items.filter((s) => matches(q, s.name, s.key, s.description, g.category)) }))
    .filter((g) => g.items.length > 0);
  const showFlags = canFlags && (!section || section === FLAGS);
  const visibleFlags = showFlags ? flags.filter((f) => matches(q, f.name, f.key, f.description)) : [];

  const loading = (canSettings && settingsQ.isLoading) || (canFlags && flagsQ.isLoading);
  const nothing = !loading && visibleGroups.length === 0 && visibleFlags.length === 0 && !settingsQ.error && !flagsQ.error;

  return (
    <>
      <PageHeader
        eyebrow="StockOut administration"
        title="Settings"
        description="Configure how the StockOut platform behaves. Changes apply to every user straight away."
        actions={
          <RefreshButton
            onClick={() => {
              if (canSettings) void settingsQ.refetch();
              if (canFlags) void flagsQ.refetch();
            }}
            spinning={settingsQ.isFetching || flagsQ.isFetching}
          />
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit min-w-0 space-y-3 lg:sticky lg:top-24">
          <label className="relative block">
            <span className="sr-only">Search settings</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={state.q}
              onChange={(e) => setState({ q: e.target.value })}
              placeholder="Search settings…"
              className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground"
            />
          </label>
          <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:rounded-xl lg:bg-surface lg:p-2">
            {nav.map((n) => {
              const active = section === n.value;
              const NavIcon = n.icon;
              return (
                <button
                  key={n.value || "all"}
                  type="button"
                  onClick={() => setState({ section: n.value })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-ink font-medium text-ink-foreground" : "text-foreground hover:bg-surface-muted max-lg:bg-surface",
                  )}
                >
                  <NavIcon className="size-[18px] shrink-0" weight={active ? "fill" : "regular"} aria-hidden />
                  <span className="flex-1 truncate">{n.label}</span>
                  <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "text-ink-foreground/80" : "text-muted-foreground")}>{n.count}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-6">
          {loading && <SettingsSkeleton />}
          {canSettings && settingsQ.error && (!section || section !== FLAGS) && <ErrorState error={settingsQ.error} onRetry={() => settingsQ.refetch()} title="Couldn't load platform settings" />}
          {canFlags && flagsQ.error && showFlags && <ErrorState error={flagsQ.error} onRetry={() => flagsQ.refetch()} title="Couldn't load feature flags" />}

          {visibleGroups.map((g) => (
            <SettingsCard key={g.category} icon={categoryIcon(g.category)} title={humanize(g.category)} items={g.items}>
              {g.items.map((s) => (
                <SettingRow key={s.platformSettingId} setting={s} canUpdate={can(P.SETTINGS_UPDATE)} />
              ))}
            </SettingsCard>
          ))}

          {visibleFlags.length > 0 && (
            <SettingsCard icon={FlagIcon} title="Feature flags" description="Turn platform features on or off for everyone." flags={visibleFlags}>
              {visibleFlags.map((f) => (
                <FlagRow key={f.platformFeatureFlagId} flag={f} canUpdate={can(P.FEATURE_FLAGS_UPDATE)} />
              ))}
            </SettingsCard>
          )}

          {nothing && (
            <div className="rounded-xl bg-surface">
              <EmptyState icon={<MagnifyingGlassIcon />} title={q ? "No settings match your search" : "Nothing to configure here yet"} description={q ? "Try a different word, or clear the search." : undefined} />
            </div>
          )}

          {visibleGroups.length > 0 && <p className="px-1 text-xs text-muted-foreground">Ranges mentioned in descriptions are guidance only. The server checks the value type, not the range.</p>}
        </div>
      </div>
    </>
  );
}

function SettingsCard({
  icon: CardIcon,
  title,
  description,
  items,
  flags,
  children,
}: {
  icon: Icon;
  title: string;
  description?: string;
  items?: PlatformSettingResponse[];
  flags?: PlatformFeatureFlagResponse[];
  children: React.ReactNode;
}) {
  const total = items?.length ?? flags?.length ?? 0;
  const changed = items ? items.filter((s) => s.currentValue !== null).length : (flags ?? []).filter((f) => f.isEnabled !== f.defaultEnabled).length;
  return (
    <section className="overflow-hidden rounded-xl bg-surface" aria-label={title}>
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink text-ink-foreground">
          <CardIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold leading-6 text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {description ? `${description} · ` : ""}
            {total} {total === 1 ? "item" : "items"}
            {changed > 0 ? ` · ${changed} changed from default` : ""}
          </p>
        </div>
      </header>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4 rounded-xl bg-surface p-5" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <Skeleton className="h-5 w-40" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-6 border-t border-border pt-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
      ))}
    </div>
  );
}
