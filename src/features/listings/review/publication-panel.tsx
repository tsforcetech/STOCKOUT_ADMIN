import * as React from "react";
import { Link, useNavigate } from "react-router";
import { useQueries, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { CheckCircleIcon, XCircleIcon, ArrowCounterClockwiseIcon, PauseCircleIcon, PlayCircleIcon, RocketLaunchIcon, ClipboardTextIcon } from "@phosphor-icons/react";
import { SectionCard, RefreshButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/feedback/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAccess } from "@/lib/auth/use-access";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type {
  ListingModerationDetailResponse,
  ListingPublicationHistoryDto,
  PublicationEligibilityResponse,
  PublicationGatesDto,
  SuspensionReasonCode,
} from "@/api/types/catalog-moderation";
import { moderationService } from "@/services/moderation.service";
import { inspectionsService } from "@/services/inspections.service";
import { inspectionKeys } from "@/features/inspections/queries";
import { humanize } from "@/lib/utils/format";
import { isApiError } from "@/lib/api/errors";
import { listingKeys } from "../queries";
import { ApiErrorNotice, Notice, PanelTitle, fmtUtc, isConflict, shortId } from "../shared";

const GATES: Array<{ key: keyof PublicationGatesDto; label: string }> = [
  { key: "sellerStanding", label: "Seller standing" },
  { key: "versionModeration", label: "Version approved" },
  { key: "inspectionCompliance", label: "Inspection compliance" },
  { key: "catalogCompleteness", label: "Catalog completeness" },
  { key: "inventoryAvailability", label: "Inventory available" },
  { key: "mediaAvailability", label: "Primary media valid" },
  { key: "aggregateState", label: "Listing state" },
];

const SUSPENSION_REASONS: SuspensionReasonCode[] = [
  "POLICY_VIOLATION",
  "COUNTERFEIT_INVESTIGATION",
  "ADMINISTRATIVE_SUSPENSION",
  "ADMINISTRATIVE_HOLD",
  "SELLER_ACCOUNT_SUSPENDED",
  "SELLER_REQUESTED_PAUSE",
];

const MEDIA_DEFECT_NOTE =
  "Known backend issue: the media gate checks the primary image against the seller organisation id rather than the uploading user, so publish, republish and rollback are likely to fail with “not ready for publication” even when other gates pass.";

export function EligibilityGates({ query, allowed }: { query: UseQueryResult<PublicationEligibilityResponse>; allowed: boolean }) {
  return (
    <SectionCard>
      <PanelTitle
        title="Publication readiness"
        description="Gates checked by the server before publishing this version."
        actions={allowed ? <RefreshButton onClick={() => query.refetch()} spinning={query.isFetching} label="Re-check eligibility" /> : undefined}
      />
      {!allowed ? (
        <Notice>Checking publication gates requires the catalog:listings:view permission.</Notice>
      ) : query.isLoading ? (
        <div className="space-y-2">
          {GATES.map((g) => (
            <Skeleton key={g.key} className="h-9 w-full" />
          ))}
        </div>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} className="py-6" />
      ) : query.data ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <StatusBadge value={query.data.isEligible ? "PASS" : "FAIL"} label={query.data.isEligible ? "Eligible to publish" : "Not eligible"} />
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {GATES.map((g) => {
              const gate = query.data.gates[g.key];
              return (
                <li key={g.key} className="flex gap-2.5 px-3 py-2.5 text-sm">
                  {gate.passed ? <CheckCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <XCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
                  <div className="min-w-0">
                    <p>
                      {g.label} <span className="sr-only">{gate.passed ? "passed" : "failed"}</span>
                    </p>
                    {gate.details && <p className="text-xs text-muted-foreground">{gate.details}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          {query.data.blockers.length > 0 && (
            <Notice tone="danger" title="Blockers">
              <ul className="list-disc space-y-0.5 pl-4">
                {query.data.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}

type Dialogs = "publish" | "republish" | "suspend" | "rollback" | "inspection" | null;

/** Lifecycle actions driven by the documented state machines (version + listing aggregate). */
export function PublicationActions({
  detail,
  eligibility,
  history,
  historyAllowed,
}: {
  detail: ListingModerationDetailResponse;
  eligibility: PublicationEligibilityResponse | undefined;
  history: ListingPublicationHistoryDto[] | undefined;
  historyAllowed: boolean;
}) {
  const { can } = useAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const c = detail.candidateVersion;
  const [open, setOpen] = React.useState<Dialogs>(null);

  const refreshOnConflict = async (error: unknown) => {
    if (isConflict(error) || (isApiError(error) && error.code === "MARKETPLACE_LISTING_TRANSITION_INVALID")) {
      await queryClient.invalidateQueries({ queryKey: listingKeys.listing(c.listingId) });
    }
  };
  const invalidate = [listingKeys.listing(c.listingId), listingKeys.queueAll];
  const close = () => setOpen(null);

  const publish = useApiMutation({
    mutationFn: async () => {
      try {
        return await moderationService.publish(c.listingId, c.listingVersionId, c.listingRowVersion);
      } catch (e) {
        await refreshOnConflict(e);
        throw e;
      }
    },
    toastOnError: false,
    invalidate,
    successMessage: "Version published.",
    onSuccess: close,
  });
  const republish = useApiMutation({
    mutationFn: async () => {
      try {
        return await moderationService.republish(c.listingId, c.listingRowVersion);
      } catch (e) {
        await refreshOnConflict(e);
        throw e;
      }
    },
    toastOnError: false,
    invalidate,
    successMessage: "Listing republished.",
    onSuccess: close,
  });
  const createInspection = useApiMutation({
    mutationFn: () => inspectionsService.create({ listingId: c.listingId, listingVersionId: c.listingVersionId }),
    toastOnError: false,
    invalidate: [inspectionKeys.queueAll],
    successMessage: (r) => `Inspection ${r.inspectionNo} created.`,
    onSuccess: (r) => navigate(`/inspections/${r.inspectionId}`),
  });

  // Rollback candidates: every version that appears in publication history except the current one.
  const rollbackCandidates = React.useMemo(() => {
    const ids = new Set<string>();
    (history ?? []).forEach((h) => {
      ids.add(h.listingVersionId);
      if (h.previousPublishedVersionId) ids.add(h.previousPublishedVersionId);
    });
    if (c.publishedVersionId) ids.delete(c.publishedVersionId);
    return [...ids];
  }, [history, c.publishedVersionId]);

  const status = c.listingAggregateStatus;
  const showPublish = c.versionStatus === "APPROVED" && can(P.CATALOG_LISTINGS_PUBLISH);
  const showSuspend = status === "PUBLISHED" && can(P.CATALOG_LISTINGS_SUSPEND);
  const showRepublish = status === "SUSPENDED" && Boolean(c.publishedVersionId) && can(P.CATALOG_LISTINGS_PUBLISH);
  const showRollback = (status === "PUBLISHED" || status === "SUSPENDED") && Boolean(c.publishedVersionId) && can(P.CATALOG_LISTINGS_PUBLISH) && rollbackCandidates.length > 0;
  const showCreateInspection = c.versionStatus === "INSPECTION_REQUIRED" && can(P.INSPECTIONS_OVERRIDE);
  const notEligible = eligibility ? !eligibility.isEligible : false;
  const nothing = !showPublish && !showSuspend && !showRepublish && !showRollback && !showCreateInspection;

  return (
    <SectionCard>
      <PanelTitle title="Listing actions" description={<span className="inline-flex items-center gap-2">Listing status <StatusBadge value={status} /></span>} />
      <div className="space-y-3">
        {showPublish && (
          <div className="space-y-2">
            <Button variant="action" className="w-full" onClick={() => { publish.reset(); setOpen("publish"); }} disabled={notEligible}>
              <RocketLaunchIcon /> Publish this version
            </Button>
            {notEligible && <p className="text-xs text-muted-foreground">Publishing is disabled until every publication gate passes.</p>}
          </div>
        )}
        {showRepublish && (
          <Button variant="action" className="w-full" onClick={() => { republish.reset(); setOpen("republish"); }}>
            <PlayCircleIcon /> Republish listing
          </Button>
        )}
        {showSuspend && (
          <Button variant="secondary" className="w-full" onClick={() => setOpen("suspend")}>
            <PauseCircleIcon /> Suspend listing
          </Button>
        )}
        {showRollback && (
          <Button variant="secondary" className="w-full" onClick={() => setOpen("rollback")}>
            <ArrowCounterClockwiseIcon /> Roll back to an earlier version
          </Button>
        )}
        {showCreateInspection && (
          <Button variant="secondary" className="w-full" onClick={() => { createInspection.reset(); setOpen("inspection"); }}>
            <ClipboardTextIcon /> Create inspection
          </Button>
        )}
        {(showPublish || showRepublish || showRollback) && <Notice tone="warning">{MEDIA_DEFECT_NOTE}</Notice>}
        {(status === "PUBLISHED" || status === "SUSPENDED") && !historyAllowed && can(P.CATALOG_LISTINGS_PUBLISH) && (
          <Notice>Rollback targets come from publication history, which requires catalog:listings:view.</Notice>
        )}
        {(status === "PUBLISHED" || status === "SUSPENDED") && (
          <p className="text-xs text-muted-foreground">The moderation API does not expose the listing expiry date; the server rejects suspend/republish on an expired listing.</p>
        )}
        {c.versionStatus === "INSPECTION_REQUIRED" && (
          <Notice>
            This version is waiting for a PASS inspection.{" "}
            {can(P.INSPECTIONS_VIEW) && (
              <Link className="underline underline-offset-4" to={`/inspections?seller=${c.sellerId}`}>
                Find this seller's inspections
              </Link>
            )}
          </Notice>
        )}
        {nothing && c.versionStatus !== "INSPECTION_REQUIRED" && <p className="text-sm text-muted-foreground">No publication actions are available for this version and listing status with your permissions.</p>}
      </div>

      <ConfirmDialog
        open={open === "publish"}
        onOpenChange={(o) => !o && close()}
        title={`Publish version v${c.versionNumber}?`}
        description={c.publishedVersionId ? "This version replaces the currently published version, which becomes superseded." : "The listing becomes publicly visible."}
        confirmLabel="Publish"
        tone="primary"
        loading={publish.isPending}
        onConfirm={() => publish.mutate()}
      >
        <ApiErrorNotice error={publish.error} />
      </ConfirmDialog>

      <ConfirmDialog
        open={open === "republish"}
        onOpenChange={(o) => !o && close()}
        title="Republish listing?"
        description="The suspended listing becomes publicly visible again with its current published version."
        confirmLabel="Republish"
        tone="primary"
        loading={republish.isPending}
        onConfirm={() => republish.mutate()}
      >
        <ApiErrorNotice error={republish.error} />
      </ConfirmDialog>

      <ConfirmDialog
        open={open === "inspection"}
        onOpenChange={(o) => !o && close()}
        title="Create inspection?"
        description={`A new pending inspection is created for version v${c.versionNumber} using the active checklist template for its category.`}
        confirmLabel="Create inspection"
        tone="primary"
        loading={createInspection.isPending}
        onConfirm={() => createInspection.mutate()}
      >
        <ApiErrorNotice error={createInspection.error} />
      </ConfirmDialog>

      <SuspendDialog open={open === "suspend"} onClose={close} listingId={c.listingId} rowVersion={c.listingRowVersion} onConflict={refreshOnConflict} />
      <RollbackDialog
        open={open === "rollback"}
        onClose={close}
        listingId={c.listingId}
        rowVersion={c.listingRowVersion}
        candidates={rollbackCandidates}
        history={history ?? []}
        onConflict={refreshOnConflict}
      />
    </SectionCard>
  );
}

function SuspendDialog({ open, onClose, listingId, rowVersion, onConflict }: { open: boolean; onClose: () => void; listingId: string; rowVersion: string; onConflict: (e: unknown) => Promise<void> }) {
  const [reason, setReason] = React.useState<string>("POLICY_VIOLATION");
  const [custom, setCustom] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const mutation = useApiMutation({
    mutationFn: async () => {
      try {
        return await moderationService.suspend(listingId, { reasonCode: reason === "OTHER" ? custom.trim() : reason, remarks: remarks.trim() || null, expectedRowVersion: rowVersion });
      } catch (e) {
        await onConflict(e);
        throw e;
      }
    },
    toastOnError: false,
    invalidate: [listingKeys.listing(listingId), listingKeys.queueAll],
    successMessage: "Listing suspended.",
    onSuccess: () => {
      setReason("POLICY_VIOLATION");
      setCustom("");
      setRemarks("");
      setTouched(false);
      onClose();
    },
  });
  const customMissing = reason === "OTHER" && !custom.trim();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent
        title="Suspend listing"
        description="The listing is hidden from buyers until it is republished or rolled back."
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={mutation.isPending}
              onClick={() => {
                setTouched(true);
                if (!customMissing) mutation.mutate();
              }}
            >
              Suspend
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Reason" htmlFor="suspend-reason" required>
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
              {SUSPENSION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
              <option value="OTHER">Other (enter a code)</option>
            </NativeSelect>
          </FormField>
          {reason === "OTHER" && (
            <FormField label="Reason code" htmlFor="suspend-custom" required error={touched && customMissing ? "Enter a reason code." : undefined}>
              <Input value={custom} maxLength={100} onChange={(e) => setCustom(e.target.value)} />
            </FormField>
          )}
          <FormField label="Remarks" htmlFor="suspend-remarks" hint="Optional context recorded with the suspension.">
            <Textarea rows={3} maxLength={1000} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </FormField>
          <ApiErrorNotice error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RollbackDialog({
  open,
  onClose,
  listingId,
  rowVersion,
  candidates,
  history,
  onConflict,
}: {
  open: boolean;
  onClose: () => void;
  listingId: string;
  rowVersion: string;
  candidates: string[];
  history: ListingPublicationHistoryDto[];
  onConflict: (e: unknown) => Promise<void>;
}) {
  const [target, setTarget] = React.useState("");
  const [reasonCode, setReasonCode] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  // Version status is only available from the moderation detail, which works for any version.
  const details = useQueries({
    queries: candidates.map((versionId) => ({
      queryKey: listingKeys.detail(listingId, versionId),
      queryFn: ({ signal }: { signal: AbortSignal }) => moderationService.detail(listingId, versionId, signal),
      enabled: open,
      staleTime: 30_000,
    })),
  });
  const loading = details.some((d) => d.isLoading);
  const options = candidates
    .map((id, i) => ({ id, data: details[i]?.data, error: details[i]?.error }))
    .filter((o) => o.data?.candidateVersion.versionStatus === "SUPERSEDED");
  const lastPublished = (id: string) => history.find((h) => h.listingVersionId === id)?.publishedAtUtc;

  const mutation = useApiMutation({
    mutationFn: async () => {
      try {
        return await moderationService.rollback(listingId, { targetRollbackVersionId: target, reasonCode: reasonCode.trim(), remarks: remarks.trim() || null, expectedRowVersion: rowVersion });
      } catch (e) {
        await onConflict(e);
        throw e;
      }
    },
    toastOnError: false,
    invalidate: [listingKeys.listing(listingId), listingKeys.queueAll],
    successMessage: "Listing rolled back.",
    onSuccess: () => {
      setTarget("");
      setReasonCode("");
      setRemarks("");
      setTouched(false);
      onClose();
    },
  });
  const invalid = !target || !reasonCode.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent
        title="Roll back listing"
        description="Re-publishes an earlier superseded version. The current version becomes superseded and the listing becomes published (also if suspended)."
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={mutation.isPending}
              disabled={loading}
              onClick={() => {
                setTouched(true);
                if (!invalid) mutation.mutate();
              }}
            >
              Roll back
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField
            label="Target version"
            htmlFor="rollback-target"
            required
            error={touched && !target ? "Choose a version." : undefined}
            hint={loading ? "Checking which earlier versions are superseded…" : options.length === 0 ? "No superseded version was found in this listing's publication history." : "Only superseded versions from publication history are listed."}
          >
            <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} disabled={loading || options.length === 0}>
              <option value="">Select a version</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  v{o.data?.candidateVersion.versionNumber} · {o.data?.candidateVersion.title} · {shortId(o.id)}
                  {lastPublished(o.id) ? ` · last published ${fmtUtc(lastPublished(o.id))}` : ""}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Reason code" htmlFor="rollback-reason" required error={touched && !reasonCode.trim() ? "A reason code is required." : undefined}>
            <Input value={reasonCode} maxLength={100} onChange={(e) => setReasonCode(e.target.value)} />
          </FormField>
          <FormField label="Remarks" htmlFor="rollback-remarks">
            <Textarea rows={3} maxLength={1000} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </FormField>
          <Notice tone="warning">{MEDIA_DEFECT_NOTE}</Notice>
          <ApiErrorNotice error={mutation.error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
