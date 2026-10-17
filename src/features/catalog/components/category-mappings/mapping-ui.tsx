import type * as React from "react";
import { Link } from "react-router";
import { TrashIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/feedback/states";
import { Badge } from "@/components/ui/misc";
import { RowAction } from "@/components/common/section-card";

export interface SimpleColumn<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

/** Small read-only table for mapping lists (no paging needed: a category has few assignments). */
export function SimpleTable<T>({ rows, columns, getKey, caption, emptyTitle, emptyDescription }: { rows: T[]; columns: SimpleColumn<T>[]; getKey: (row: T) => string; caption: string; emptyTitle: string; emptyDescription?: string }) {
  if (!rows.length) return <EmptyState className="py-8" title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className="h-10 whitespace-nowrap px-3 text-left font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={getKey(r)}>
              {columns.map((c) => (
                <td key={c.header} className={c.className ?? "whitespace-nowrap px-3 py-2"}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MappingSection({ title, description, actions, children }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-heading text-base font-medium">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function NameCode({ name, code }: { name: string; code: string }) {
  return (
    <span className="block">
      <span className="block">{name}</span>
      <span className="block text-xs text-muted-foreground">{code}</span>
    </span>
  );
}

/** Links to the category an inherited assignment comes from. */
export function SourceCategory({ id, nameOf }: { id: string | null; nameOf: (id: string) => string | undefined }) {
  if (!id) return <span className="text-muted-foreground">—</span>;
  return (
    <Link to={`/catalog/categories/${encodeURIComponent(id)}`} className="underline underline-offset-4 hover:text-muted-foreground">
      {nameOf(id) ?? `${id.slice(0, 8)}…`}
    </Link>
  );
}

export function YesNo({ value }: { value: boolean }) {
  return value ? <Badge tone="primary">Yes</Badge> : <span className="text-muted-foreground">No</span>;
}

export function RemoveRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <RowAction label={label} tone="danger" onClick={onClick}>
      <TrashIcon />
    </RowAction>
  );
}

export const INT_RE = /^-?\d+$/;
export const NUM_RE = /^-?(\d+(\.\d*)?|\.\d+)$/;

export const thClass = "h-10 whitespace-nowrap px-3 text-left font-medium";
export const tdClass = "px-3 py-2 align-top";
