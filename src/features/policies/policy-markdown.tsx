import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Renders the Markdown subset the policy documents use (headings, paragraphs, **bold**, *italic*, `code`,
 * pipe tables, - / * / 1. lists, hard breaks). Builds React elements directly — no HTML is injected.
 * Table rows in the source are separated by blank lines, so consecutive "|" lines are grouped across blanks.
 */
type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] };

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
const cellsOf = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const listItem = (l: string) => /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);

export function parsePolicyMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }
    if (isTableLine(line)) {
      const rows: string[][] = [];
      while (i < lines.length && (isTableLine(lines[i]) || (!lines[i].trim() && i + 1 < lines.length && isTableLine(lines[i + 1])))) {
        if (lines[i].trim()) rows.push(cellsOf(lines[i]));
        i++;
      }
      const hasHeader = rows.length > 1 && isDivider(rows[1]);
      blocks.push({ kind: "table", header: hasHeader ? rows[0] : [], rows: (hasHeader ? rows.slice(2) : rows).filter((r) => !isDivider(r)) });
      continue;
    }
    const first = listItem(line);
    if (first && /^\s*[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && listItem(lines[i]) && /^\s*[-*•]\s/.test(lines[i])) items.push(listItem(lines[i++])![1]);
      blocks.push({ kind: "list", ordered: false, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i].trim()) && !isTableLine(lines[i])) para.push(lines[i++]);
    blocks.push({ kind: "paragraph", lines: para });
  }
  return blocks;
}

/** **bold**, *italic* / _italic_, `code`. Anything else stays literal text. */
export function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*|(?<![\w])_([^_]+)_(?![\w]))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={k++} className="font-semibold text-foreground">{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<code key={k++} className="break-all rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.85em]">{m[3]}</code>);
    else out.push(<em key={k++}>{m[4] ?? m[5]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*`_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-2xl",
  2: "text-xl",
  3: "text-xl",
  4: "text-base",
  5: "text-sm",
  6: "text-sm",
};

export function PolicyMarkdown({ content, className }: { content: string; className?: string }) {
  const blocks = React.useMemo(() => parsePolicyMarkdown(content), [content]);
  return (
    <div className={cn("space-y-3 text-sm leading-6 text-body", className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading": {
            const Tag = `h${Math.min(6, b.level + 1)}` as "h2";
            return (
              <Tag key={i} id={slugify(b.text)} className={cn("scroll-mt-24 pt-3 font-heading font-bold text-foreground", HEADING_CLASS[b.level])}>
                {renderInline(b.text)}
              </Tag>
            );
          }
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={i} className={cn("space-y-1 pl-5", b.ordered ? "list-decimal" : "list-disc")}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[480px] border-collapse text-left text-[13px] leading-5">
                  {b.header.length > 0 && (
                    <thead className="bg-surface-muted">
                      <tr>
                        {b.header.map((h, j) => (
                          <th key={j} scope="col" className="border-b border-border px-3 py-2 font-semibold text-foreground">
                            {renderInline(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-border last:border-0 align-top">
                        {r.map((c, n) => (
                          <td key={n} className="px-3 py-2">
                            {renderInline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && (/\s{2}$/.test(b.lines[j - 1]) ? <br /> : " ")}
                    {renderInline(l.trim())}
                  </React.Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

/** Headings worth listing in a table of contents (the numbered sections). */
export function policyOutline(content: string): Array<{ id: string; text: string }> {
  return parsePolicyMarkdown(content)
    .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading" && b.level === 4 && /^\d+\./.test(b.text))
    .map((b) => ({ id: slugify(b.text), text: b.text.replace(/[*`]/g, "") }));
}
