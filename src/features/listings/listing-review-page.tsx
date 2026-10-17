import * as React from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { PageHeader, DetailList } from "@/components/common/page-header";
import { SectionCard, RefreshButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/feedback/states";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type { ModerationDecisionResponse } from "@/api/types/catalog-moderation";
import { moderationService } from "@/services/moderation.service";
import { listingKeys } from "./queries";
import { Notice, PersonText, fmtUtc, isGuid, shortId, useSellerNames } from "./shared";
import { VersionComparison, AttributesComparison, MediaList } from "./review/version-comparison";
import { DecisionPanel } from "./review/decision-panel";
import { EligibilityGates, PublicationActions } from "./review/publication-panel";
import { ModerationHistory, PublicationHistory } from "./review/history-tables";

function ReviewContent({ listingId, versionId }: { listingId: string; versionId: string }) {
  const { can } = useAccess();
  const sellerNames = useSellerNames();
  const canView = can(P.CATALOG_LISTINGS_VIEW);
  const [lastDecision, setLastDecision] = React.useState<ModerationDecisionResponse | null>(null);

  const detail = useQuery({ queryKey: listingKeys.detail(listingId, versionId), queryFn: ({ signal }) => moderationService.detail(listingId, versionId, signal) });
  const eligibility = useQuery({
    queryKey: listingKeys.eligibility(listingId, versionId),
    queryFn: ({ signal }) => moderationService.eligibility(listingId, versionId, signal),
    enabled: canView && Boolean(detail.data),
  });
  const history = useQuery({ queryKey: listingKeys.history(listingId), queryFn: ({ signal }) => moderationService.publicationHistory(listingId, signal), enabled: canView });

  if (detail.isLoading) return <PageSkeleton />;
  if (detail.error || !detail.data) {
    return (
      <SectionCard>
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} title={detail.error ? undefined : "Listing version not found"} />
      </SectionCard>
    );
  }

  const d = detail.data;
  const c = d.candidateVersion;
  const canDecide = c.versionStatus === "UNDER_REVIEW" && can(P.CATALOG_LISTINGS_APPROVE);

  return (
    <>
      <div className="mb-2 px-0 sm:px-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/listings">
            <ArrowLeftIcon /> Moderation queue
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow={`Listing LST-${shortId(c.listingId)} · version ${c.versionNumber}`}
        title={c.title || "Untitled listing"}
        actions={
          <RefreshButton
            onClick={() => {
              void detail.refetch();
              if (canView) {
                void eligibility.refetch();
                void history.refetch();
              }
            }}
            spinning={detail.isFetching}
          />
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Version</span> <StatusBadge value={c.versionStatus} />
          <span className="ml-2 text-muted-foreground">Listing</span> <StatusBadge value={c.listingAggregateStatus} />
        </div>
      </PageHeader>

      {lastDecision && (
        <Notice tone="info" className="mb-4" title={`Decision recorded: ${lastDecision.decision.replace(/_/g, " ").toLowerCase()} → ${lastDecision.versionStatus.replace(/_/g, " ").toLowerCase()}`}>
          {lastDecision.inspectionId ? (
            <>
              Inspection {lastDecision.inspectionNo} was created.{" "}
              {can(P.INSPECTIONS_VIEW) && (
                <Link className="underline underline-offset-4" to={`/inspections/${lastDecision.inspectionId}`}>
                  Open inspection
                </Link>
              )}
            </>
          ) : (
            `Reviewed ${fmtUtc(lastDecision.reviewedAtUtc)}.`
          )}
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <SectionCard>
            <DetailList
              columns={3}
              items={[
                { label: "Seller", value: <PersonText id={c.sellerId} names={sellerNames} /> },
                { label: "Listing ID", value: <IdText value={c.listingId} /> },
                { label: "Version ID", value: <IdText value={c.listingVersionId} /> },
                { label: "Category", value: c.categoryName },
                { label: "Physical inspection", value: c.categoryRequiresPhysicalInspection ? "Required by category" : "Not required by category" },
                {
                  label: "Published version",
                  value: c.publishedVersionId ? (
                    c.publishedVersionId === c.listingVersionId ? (
                      "This version"
                    ) : (
                      <Link className="underline underline-offset-4" to={`/listings/${c.listingId}/versions/${c.publishedVersionId}`}>
                        {shortId(c.publishedVersionId)}
                      </Link>
                    )
                  ) : (
                    "None"
                  ),
                },
              ]}
            />
          </SectionCard>
          <VersionComparison detail={d} />
          <AttributesComparison detail={d} />
          <MediaList detail={d} />
          <ModerationHistory history={d.history} currentVersionId={c.listingVersionId} />
          <PublicationHistory listingId={listingId} query={history} allowed={canView} />
        </div>
        <aside className="min-w-0 space-y-4" aria-label="Review actions">
          {canDecide && <DecisionPanel candidate={c} onDecided={setLastDecision} />}
          {c.versionStatus === "UNDER_REVIEW" && !can(P.CATALOG_LISTINGS_APPROVE) && <Notice>Recording a decision requires the catalog:listings:approve permission.</Notice>}
          <PublicationActions detail={d} eligibility={eligibility.data} history={history.data} historyAllowed={canView} />
          <EligibilityGates query={eligibility} allowed={canView} />
        </aside>
      </div>
    </>
  );
}

function ListingReviewRoute() {
  const { listingId = "", versionId = "" } = useParams();
  if (!isGuid(listingId) || !isGuid(versionId)) {
    return (
      <SectionCard>
        <EmptyState title="Listing version not found" description="The link does not contain a valid listing and version ID." />
      </SectionCard>
    );
  }
  return <ReviewContent key={`${listingId}/${versionId}`} listingId={listingId.toLowerCase()} versionId={versionId.toLowerCase()} />;
}

export default function ListingReviewPage() {
  return (
    <RequirePermission permission={P.CATALOG_LISTINGS_REVIEW}>
      <ListingReviewRoute />
    </RequirePermission>
  );
}
