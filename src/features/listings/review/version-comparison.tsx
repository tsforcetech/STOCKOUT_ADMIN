import * as React from "react";
import { Link } from "react-router";
import { ImageIcon, StarIcon } from "@phosphor-icons/react";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { Badge } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { formatMoney, humanize } from "@/lib/utils/format";
import type {
  CandidateAttributeDto,
  ListingModerationDetailResponse,
} from "@/api/types/catalog-moderation";
import { FileLink, PanelTitle, fmtUtc, fmtUtcDate } from "../shared";

interface Row {
  label: string;
  candidate: React.ReactNode;
  published: React.ReactNode;
  /** Raw comparable values to flag changes. */
  a: unknown;
  b: unknown;
}

const dash = <span className="text-muted-foreground">—</span>;
const idOrDash = (v: string | null) => (v ? <IdText value={v} /> : dash);

/** Candidate version vs currently published version, side by side with changed rows flagged. */
export function VersionComparison({
  detail,
}: {
  detail: ListingModerationDetailResponse;
}) {
  const c = detail.candidateVersion;
  const p = detail.publishedVersion;
  const sameAsPublished = p?.listingVersionId === c.listingVersionId;

  const rows: Row[] = [
    {
      label: "Title",
      candidate: c.title,
      published: p?.title ?? dash,
      a: c.title,
      b: p?.title,
    },
    {
      label: "Description",
      candidate: c.description ? (
        <span className="whitespace-pre-wrap">{c.description}</span>
      ) : (
        dash
      ),
      published: p?.description ? (
        <span className="whitespace-pre-wrap">{p.description}</span>
      ) : (
        dash
      ),
      a: c.description,
      b: p?.description,
    },
    {
      label: "Pricing mode",
      candidate: humanize(c.pricingMode),
      published: p ? humanize(p.pricingMode) : dash,
      a: c.pricingMode,
      b: p?.pricingMode,
    },
    {
      label: "Base price",
      candidate: formatMoney(c.basePrice, c.currency),
      published: p ? formatMoney(p.basePrice, p.currency) : dash,
      a: `${c.basePrice} ${c.currency}`,
      b: p ? `${p.basePrice} ${p.currency}` : undefined,
    },
    {
      label: "Category",
      candidate: (
        <span className="inline-flex flex-col gap-1">
          <span>{c.categoryName}</span>
          {c.categoryRequiresPhysicalInspection && (
            <Badge tone="info" className="w-fit">
              Requires physical inspection
            </Badge>
          )}
        </span>
      ),
      published: p ? (
        p.categoryId === c.categoryId ? (
          c.categoryName
        ) : (
          <IdText value={p.categoryId} />
        )
      ) : (
        dash
      ),
      a: c.categoryId,
      b: p?.categoryId,
    },
    {
      label: "Brand",
      candidate: idOrDash(c.brandId),
      published: p ? idOrDash(p.brandId) : dash,
      a: c.brandId,
      b: p?.brandId,
    },
    {
      label: "Condition",
      candidate: idOrDash(c.conditionId),
      published: p ? idOrDash(p.conditionId) : dash,
      a: c.conditionId,
      b: p?.conditionId,
    },
    {
      label: "Grade",
      candidate: idOrDash(c.gradeId),
      published: p ? idOrDash(p.gradeId) : dash,
      a: c.gradeId,
      b: p?.gradeId,
    },
    {
      label: "Quantity unit",
      candidate: idOrDash(c.quantityUnitId),
      published: p ? idOrDash(p.quantityUnitId) : dash,
      a: c.quantityUnitId,
      b: p?.quantityUnitId,
    },
    {
      label: "Created",
      candidate: fmtUtc(c.createdAtUtc),
      published: p ? fmtUtc(p.createdAtUtc) : dash,
      a: null,
      b: null,
    },
    {
      label: "Last updated",
      candidate: fmtUtc(c.updatedAtUtc),
      published: p ? fmtUtc(p.updatedAtUtc) : dash,
      a: null,
      b: null,
    },
  ];
  const changed = (r: Row) =>
    Boolean(p) && !sameAsPublished && (r.a ?? null) !== (r.b ?? null);
  const changeCount = rows.filter(changed).length;

  return (
    <SectionCard>
      <PanelTitle
        title="Version details"
        description={
          !p
            ? "This listing has never been published, so there is nothing to compare against."
            : sameAsPublished
              ? "This is the currently published version."
              : `Compared with the published version v${p.versionNumber}. ${changeCount ? `${changeCount} field${changeCount === 1 ? "" : "s"} changed.` : "No field changes."}`
        }
      />
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            Candidate version compared with the published version
          </caption>
          <thead className="bg-surface-muted">
            <tr>
              <th
                scope="col"
                className="w-36 border-b border-border px-4 py-2.5 text-left font-medium"
              >
                Field
              </th>
              <th
                scope="col"
                className="border-b border-border px-4 py-2.5 text-left font-medium"
              >
                <span className="inline-flex items-center gap-2">
                  This version v{c.versionNumber}{" "}
                  <StatusBadge value={c.versionStatus} />
                </span>
              </th>
              {p && !sameAsPublished && (
                <th
                  scope="col"
                  className="border-b border-border px-4 py-2.5 text-left font-medium"
                >
                  <span className="inline-flex items-center gap-2">
                    Published v{p.versionNumber}
                    <Link
                      to={`/listings/${c.listingId}/versions/${p.listingVersionId}`}
                      className="text-xs font-normal underline underline-offset-4"
                    >
                      Open
                    </Link>
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr
                key={r.label}
                className={cn(changed(r) && "bg-warning-soft/50")}
              >
                <th
                  scope="row"
                  className="px-4 py-2.5 text-left align-top font-normal text-muted-foreground"
                >
                  {r.label}
                  {changed(r) && <span className="sr-only"> (changed)</span>}
                </th>
                <td className="px-4 py-2.5 align-top">{r.candidate}</td>
                {p && !sameAsPublished && (
                  <td className="px-4 py-2.5 align-top text-muted-foreground">
                    {r.published}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function attributeValue(a: CandidateAttributeDto | undefined): string | null {
  if (!a) return null;
  if (a.textValue !== null) return a.textValue;
  if (a.integerValue !== null) return String(a.integerValue);
  if (a.decimalValue !== null) return String(a.decimalValue);
  if (a.booleanValue !== null) return a.booleanValue ? "Yes" : "No";
  if (a.dateValue !== null) return fmtUtcDate(a.dateValue);
  return null;
}

export function AttributesComparison({
  detail,
}: {
  detail: ListingModerationDetailResponse;
}) {
  const hasPublished =
    Boolean(detail.publishedVersion) &&
    detail.publishedVersion?.listingVersionId !==
      detail.candidateVersion.listingVersionId;
  const ids = React.useMemo(() => {
    const set = new Set<string>();
    detail.candidateAttributes.forEach((a) => set.add(a.attributeDefinitionId));
    if (hasPublished)
      detail.publishedAttributes.forEach((a) =>
        set.add(a.attributeDefinitionId),
      );
    return [...set];
  }, [detail, hasPublished]);
  const cand = new Map(
    detail.candidateAttributes.map((a) => [a.attributeDefinitionId, a]),
  );
  const pub = new Map(
    detail.publishedAttributes.map((a) => [a.attributeDefinitionId, a]),
  );

  return (
    <SectionCard>
      <PanelTitle
        title="Attributes"
        description="Attribute definitions are identified by ID; the moderation API does not return attribute names."
      />
      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No attribute values on this version.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <caption className="sr-only">Attribute values</caption>
            <thead className="bg-surface-muted">
              <tr>
                <th
                  scope="col"
                  className="border-b border-border px-4 py-2.5 text-left font-medium"
                >
                  Attribute
                </th>
                <th
                  scope="col"
                  className="border-b border-border px-4 py-2.5 text-left font-medium"
                >
                  This version
                </th>
                {hasPublished && (
                  <th
                    scope="col"
                    className="border-b border-border px-4 py-2.5 text-left font-medium"
                  >
                    Published
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ids.map((id) => {
                const a = attributeValue(cand.get(id));
                const b = attributeValue(pub.get(id));
                const diff = hasPublished && a !== b;
                return (
                  <tr key={id} className={cn(diff && "bg-warning-soft/50")}>
                    <td className="px-4 py-2.5">
                      <IdText value={id} />
                    </td>
                    <td className="px-4 py-2.5">{a ?? dash}</td>
                    {hasPublished && (
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {b ?? dash}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export function MediaList({
  detail,
}: {
  detail: ListingModerationDetailResponse;
}) {
  const media = [...detail.mediaAssets].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  return (
    <SectionCard>
      <PanelTitle
        title="Media"
        description="Media files belong to the seller; admins usually cannot download them because files are owner-scoped."
      />
      {media.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No media attached. Publication requires a valid primary image.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {media.map((m) => (
            <li
              key={m.listingMediaAssetId}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-surface-muted [&_svg]:size-5">
                <ImageIcon />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>#{m.displayOrder}</span>
                  {m.isPrimary && (
                    <Badge tone="primary">
                      <StarIcon className="size-3" weight="fill" /> Primary
                    </Badge>
                  )}
                </div>
                <IdText value={m.fileAssetId} />
              </div>
              <FileLink fileId={m.fileAssetId} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
