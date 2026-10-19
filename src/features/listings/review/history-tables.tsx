import * as React from "react";
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { UseQueryResult } from "@tanstack/react-query";
import { SectionCard, RefreshButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { PermissionDenied } from "@/components/feedback/states";
import { humanize } from "@/lib/utils/format";
import type {
  ListingPublicationHistoryDto,
  ModerationHistoryDto,
} from "@/api/types/catalog-moderation";
import {
  PanelTitle,
  PersonText,
  fmtUtc,
  shortId,
  useUserNames,
} from "../shared";

const decisionTone: Record<string, string> = {
  APPROVE: "APPROVED",
  REQUEST_CHANGES: "CHANGES_REQUIRED",
  REJECT: "REJECTED",
};

export function ModerationHistory({
  history,
  currentVersionId,
}: {
  history: ModerationHistoryDto[];
  currentVersionId: string;
}) {
  const names = useUserNames();
  const columns = React.useMemo<ColumnDef<ModerationHistoryDto, unknown>[]>(
    () => [
      {
        id: "at",
        header: "Reviewed",
        cell: ({ row }) => fmtUtc(row.original.reviewedAtUtc),
      },
      {
        id: "decision",
        header: "Decision",
        cell: ({ row }) => (
          <StatusBadge
            value={decisionTone[row.original.decision] ?? row.original.decision}
            label={humanize(row.original.decision)}
          />
        ),
      },
      {
        id: "version",
        header: "Version",
        cell: ({ row }) =>
          row.original.listingVersionId === currentVersionId ? (
            "This version"
          ) : (
            <Link
              className="underline underline-offset-4"
              to={`/listings/${row.original.listingId}/versions/${row.original.listingVersionId}`}
            >
              {shortId(row.original.listingVersionId)}
            </Link>
          ),
      },
      {
        id: "reason",
        header: "Reason code",
        cell: ({ row }) => row.original.reasonCode ?? "—",
      },
      {
        id: "seller",
        header: "Seller notes",
        cell: ({ row }) => (
          <span className="block max-w-[260px] whitespace-normal">
            {row.original.sellerNotes ?? "—"}
          </span>
        ),
      },
      {
        id: "internal",
        header: "Internal notes",
        cell: ({ row }) => (
          <span className="block max-w-[260px] whitespace-normal">
            {row.original.internalNotes ?? "—"}
          </span>
        ),
      },
      {
        id: "by",
        header: "Reviewer",
        cell: ({ row }) => (
          <PersonText id={row.original.reviewedByUserId} names={names} />
        ),
      },
    ],
    [currentVersionId, names],
  );
  return (
    <SectionCard>
      <PanelTitle
        title="Moderation history"
        description="All moderation decisions on this listing, newest first."
      />
      <DataTable
        caption="Moderation history"
        columns={columns}
        data={history}
        getRowId={(h) => h.moderationId}
        clientSorting={false}
        emptyTitle="No decisions yet"
        emptyDescription="Decisions appear here once a moderator reviews a version."
      />
    </SectionCard>
  );
}

export function PublicationHistory({
  listingId,
  query,
  allowed,
}: {
  listingId: string;
  query: UseQueryResult<ListingPublicationHistoryDto[]>;
  allowed: boolean;
}) {
  const names = useUserNames();
  const versionLink = (id: string | null) =>
    id ? (
      <Link
        className="font-mono text-xs underline underline-offset-4"
        to={`/listings/${listingId}/versions/${id}`}
        title={id}
      >
        {shortId(id)}
      </Link>
    ) : (
      "—"
    );
  const columns = React.useMemo<
    ColumnDef<ListingPublicationHistoryDto, unknown>[]
  >(
    () => [
      {
        id: "at",
        header: "When",
        cell: ({ row }) => fmtUtc(row.original.publishedAtUtc),
      },
      {
        id: "action",
        header: "Action",
        cell: ({ row }) => humanize(row.original.action),
      },
      {
        id: "version",
        header: "Published version",
        cell: ({ row }) => versionLink(row.original.listingVersionId),
      },
      {
        id: "previous",
        header: "Previous version",
        cell: ({ row }) => versionLink(row.original.previousPublishedVersionId),
      },
      {
        id: "reason",
        header: "Reason",
        cell: ({ row }) => row.original.reasonCode ?? "—",
      },
      {
        id: "remarks",
        header: "Remarks",
        cell: ({ row }) => (
          <span className="block max-w-[260px] whitespace-normal">
            {row.original.remarks ?? "—"}
          </span>
        ),
      },
      {
        id: "by",
        header: "By",
        cell: ({ row }) => (
          <PersonText id={row.original.publishedByUserId} names={names} />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listingId, names],
  );
  return (
    <SectionCard>
      <PanelTitle
        title="Publication history"
        description="Publish, version update, republish and rollback events, newest first. Suspensions are not recorded here."
        actions={
          allowed ? (
            <RefreshButton
              onClick={() => query.refetch()}
              spinning={query.isFetching}
            />
          ) : undefined
        }
      />
      {!allowed ? (
        <PermissionDenied description="Viewing publication history requires the catalog:listings:view permission." />
      ) : (
        <DataTable
          caption="Publication history"
          columns={columns}
          data={query.data}
          getRowId={(h) => h.publicationHistoryId}
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          clientSorting={false}
          emptyTitle="Never published"
          emptyDescription="This listing has no publication events yet."
        />
      )}
    </SectionCard>
  );
}
