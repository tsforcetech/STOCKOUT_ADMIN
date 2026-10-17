import type * as React from "react";
import { Tooltip } from "@/components/ui/misc";
import { formatNumber } from "@/lib/utils/format";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Optional icon shown next to the label (status charts: identity never by color alone). */
  icon?: React.ReactNode;
  onSelect?: () => void;
}

/**
 * Figma "Marketplace Performance" column style: single-hue lime columns with a dark 2px cap,
 * values labelled directly (few bars), recessive baseline, hover tooltip. One series → no legend.
 */
export function ColumnChart({ data, label, height = 220 }: { data: BarDatum[]; label: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="w-full" aria-label={label}>
      <div className="flex items-end gap-2 border-b border-border sm:gap-4" style={{ height }} role="list">
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          const bar = (
            <button
              type="button"
              onClick={d.onSelect}
              disabled={!d.onSelect}
              aria-label={`${d.label}: ${formatNumber(d.value)}`}
              className="group flex h-full w-full cursor-pointer flex-col items-center justify-end gap-1 rounded-t-sm px-1 disabled:cursor-default"
            >
              <span className="text-xs font-medium text-foreground">{formatNumber(d.value)}</span>
              <span
                className="w-full max-w-[56px] rounded-t-[4px] border-t-2 border-foreground bg-action-soft-strong transition-colors group-hover:bg-action group-focus-visible:bg-action"
                style={{ height: `max(${pct}%, 2px)` }}
              />
            </button>
          );
          return (
            <div key={d.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" role="listitem">
              <Tooltip content={`${d.label}: ${formatNumber(d.value)}`}>{bar}</Tooltip>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-4" aria-hidden>
        {data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground" title={d.label}>
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Horizontal magnitude bars with icon + label + value (status breakdowns). */
export function BarList({ data, label }: { data: BarDatum[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ul className="space-y-3" aria-label={label}>
      {data.map((d) => (
        <li key={d.key}>
          <button type="button" onClick={d.onSelect} disabled={!d.onSelect} className="group w-full cursor-pointer text-left disabled:cursor-default">
            <div className="mb-1 flex items-center gap-2 text-sm text-foreground">
              {d.icon && <span className="[&_svg]:size-4">{d.icon}</span>}
              <span className="flex-1 truncate">{d.label}</span>
              <span className="font-medium tabular-nums">{formatNumber(d.value)}</span>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{total ? Math.round((d.value / total) * 100) : 0}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-action-border/80 transition-colors group-hover:bg-action-border" style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value ? 4 : 0 }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
