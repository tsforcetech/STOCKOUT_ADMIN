import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, IdentificationCardIcon, ProhibitIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { DetailList } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { Badge, Skeleton } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import { useAccess } from "@/lib/auth/use-access";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { buyersService } from "@/services/buyers.service";
import { BUYER_ID_DOCUMENT_TYPES, PERMISSIONS as P, type AdminBuyerDocumentResponse, type AdminBuyerListItemDto, type AdminBuyerProfileDto } from "@/api/types/user-organization";
import { formatDate, formatDateTime, humanize } from "@/lib/utils/format";
import { ApiErrorNotice, SignedFileLink, ageSince } from "@/features/listings/shared";

export const buyersKeys = {
  all: ["buyers"] as const,
  detail: (id: string) => ["buyers", "detail", id] as const,
  documents: (id: string) => ["buyers", "documents", id] as const,
  history: (id: string) => ["buyers", "history", id] as const,
};

type BuyerLike = Pick<AdminBuyerListItemDto, "verificationStatus" | "orgStatus" | "requiresReverification">;

/** Handoff 2026-11-09 §5 labels for reviewSlaStatus (server-calculated; never computed here). */
const SLA: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  WITHIN_TARGET: { label: "Within review target", tone: "success" },
  OVERDUE: { label: "Review overdue", tone: "danger" },
  COMPLETED_WITHIN_TARGET: { label: "Reviewed within target", tone: "success" },
  COMPLETED_OVERDUE: { label: "Reviewed after target", tone: "warning" },
  CALENDAR_COVERAGE_MISSING: { label: "Review deadline unavailable", tone: "warning" },
};
export function slaInfo(b: { reviewSlaStatus?: string | null; isOverdue?: boolean }): { label: string; tone: "success" | "warning" | "danger" | "neutral" } | null {
  if (b.isOverdue && b.reviewSlaStatus !== "COMPLETED_OVERDUE") return SLA.OVERDUE;
  if (!b.reviewSlaStatus) return { label: "Status unavailable", tone: "neutral" };
  if (b.reviewSlaStatus === "NOT_APPLICABLE") return null;
  return SLA[b.reviewSlaStatus] ?? { label: "Status unavailable", tone: "neutral" };
}
export function SlaBadge({ b }: { b: { reviewSlaStatus?: string | null; isOverdue?: boolean } }) {
  const i = slaInfo(b);
  if (!i) return null;
  return (
    <Badge tone={i.tone} dot>
      {i.label}
    </Badge>
  );
}

export const buyerName = (b: { fullName?: string | null; legalName?: string | null; tradingName?: string | null }) => b.fullName?.trim() || b.legalName?.trim() || b.tradingName?.trim() || "Unnamed buyer";

/** PR_BUYER_ADMIN_VERIFY / _REJECT: allowed while SUBMITTED or UNDER_REVIEW, or whenever re-verification is required (migration 039). */
export const canDecideBuyer = (b: BuyerLike) => b.orgStatus !== "SUSPENDED" && (b.verificationStatus === "SUBMITTED" || b.verificationStatus === "UNDER_REVIEW" || b.requiresReverification);
/** PR_BUYER_ADMIN_SUSPEND: from VERIFIED, SUBMITTED or UNDER_REVIEW. */
export const canSuspendBuyer = (b: BuyerLike) => b.orgStatus !== "SUSPENDED" && ["VERIFIED", "SUBMITTED", "UNDER_REVIEW"].includes(b.verificationStatus);

const ID_TYPES = new Set<string>([...BUYER_ID_DOCUMENT_TYPES, "GOVERNMENT_ID", "OTHER_GOVERNMENT_ID"]);
export const isIdentityDocument = (d: { documentType: string }) => ID_TYPES.has(d.documentType.toUpperCase());
const docTypeLabel = (t: string | null | undefined) => (t ? ({ EMIRATES_ID: "Emirates ID", PASSPORT: "Passport", NATIONAL_ID: "National ID", GOVERNMENT_ID: "Government ID", OTHER_GOVERNMENT_ID: "Government ID" }[t.toUpperCase()] ?? humanize(t)) : "—");

const MESSAGES: Record<string, string> = {
  MANDATORY_KYC_DOCUMENTS_INCOMPLETE: "Can't approve: verify the buyer's identity document first. Exactly one qualifying ID must be reviewed as verified.",
  BUYER_IDENTITY_DETAILS_INCOMPLETE: "Can't approve: the buyer's identity details (name, nationality, document number, issuing country, expiry, mobile, address) are incomplete.",
  BUYER_DOCUMENT_REVIEWED_IMMUTABLE: "This document has already been reviewed and is kept on record.",
  DOCUMENT_EXPIRED: "This document has expired, so it can't be verified. Reject it with a note asking for a valid document.",
  MARKETPLACE_BUYER_DOCUMENT_FILE_INVALID: "The identity file is missing or still uploading, so it can't be verified. Reject it with a note asking the buyer to upload it again.",
  REJECTION_REASON_REQUIRED: "Add a reason. The buyer sees it.",
  SUSPENSION_REASON_REQUIRED: "Add a reason for suspending this buyer.",
  POLICY_ACCEPTANCE_REQUIRED: "Can't approve: the buyer hasn't accepted the current mandatory policies.",
  POLICY_CONFIGURATION_ERROR: "Can't approve: a mandatory policy has no published revision. Publish it under Policies first.",
  MARKETPLACE_BUYER_VERSION_CONFLICT: "The buyer changed since you opened it. It has been reloaded; check it and try again.",
  INVALID_ROW_VERSION: "The buyer record was out of date. It has been reloaded; try again.",
  MARKETPLACE_BUYER_TRANSITION_INVALID: "That decision isn't possible in the buyer's current state.",
  MARKETPLACE_BUYER_NOT_FOUND: "This buyer no longer exists.",
  MARKETPLACE_BUYER_DOCUMENT_NOT_FOUND: "That document no longer exists.",
  INVALID_ACTION: "Choose verify or reject.",
  FORBIDDEN: "You don't have permission for this decision.",
};
export const buyerErrorMessage = (e: unknown) => (isApiError(e) && e.code && MESSAGES[e.code]) || getErrorMessage(e);
const RELOAD_CODES = new Set(["MARKETPLACE_BUYER_VERSION_CONFLICT", "INVALID_ROW_VERSION", "MARKETPLACE_BUYER_TRANSITION_INVALID"]);

type Decision = "APPROVE" | "REJECT" | "SUSPEND";
type DocDecision = { doc: AdminBuyerDocumentResponse; action: "VERIFY" | "REJECT" } | null;

/** Review dialog for one buyer: identity details (Q4), the private ID document with per-document review, decision and history. */
export function useBuyerReview() {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const element = <BuyerReviewDialog buyerId={openId} onClose={() => setOpenId(null)} />;
  return { openReview: (b: { buyerId: string }) => setOpenId(b.buyerId), element };
}

function BuyerReviewDialog({ buyerId, onClose }: { buyerId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAccess();
  const id = buyerId ?? "";
  const open = !!buyerId;
  // Always re-read: decisions need the current rowVersion.
  const detail = useQuery({ queryKey: buyersKeys.detail(id), queryFn: ({ signal }) => buyersService.detail(id, signal), enabled: open, staleTime: 0, refetchOnMount: "always" });
  const docs = useQuery({ queryKey: buyersKeys.documents(id), queryFn: ({ signal }) => buyersService.documents(id, signal), enabled: open, staleTime: 0 });
  const history = useQuery({ queryKey: buyersKeys.history(id), queryFn: ({ signal }) => buyersService.history(id, signal), enabled: open });
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const [docDecision, setDocDecision] = React.useState<DocDecision>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: buyersKeys.all });
  };
  const onError = (e: unknown) => {
    toast.error(buyerErrorMessage(e));
    if (isApiError(e) && e.code && RELOAD_CODES.has(e.code)) refresh();
  };

  const decide = useApiMutation({
    toastOnError: false,
    mutationFn: async ({ kind, reason }: { kind: Decision; reason?: string }) => {
      const fresh = await buyersService.detail(id);
      if (kind === "APPROVE") return buyersService.verify(id, fresh.rowVersion);
      if (kind === "REJECT") return buyersService.reject(id, fresh.rowVersion, reason ?? "");
      return buyersService.suspend(id, fresh.rowVersion, reason ?? "");
    },
    successMessage: (dto, v) => `${buyerName(dto)} ${v.kind === "APPROVE" ? "verified. They can now purchase." : v.kind === "REJECT" ? "rejected. They can replace the document and resubmit." : "suspended. Purchasing is blocked."}`,
    onSuccess: () => {
      setDecision(null);
      refresh();
    },
  });

  const reviewDoc = useApiMutation({
    toastOnError: false,
    mutationFn: ({ doc, action, remark }: { doc: AdminBuyerDocumentResponse; action: "VERIFY" | "REJECT"; remark?: string }) =>
      buyersService.reviewDocument(id, doc.buyerDocumentId, { action, reviewRemark: remark?.trim() || null }),
    successMessage: (_d, v) => (v.action === "VERIFY" ? "Identity document verified. You can now approve the buyer." : "Identity document rejected."),
    onSuccess: () => {
      setDocDecision(null);
      refresh();
    },
  });

  const b = detail.data;
  const documents = docs.data ?? [];
  // Historical documents (earlier verifications) are kept for audit but never count toward a new approval.
  const idDocs = documents.filter((d) => isIdentityDocument(d) && !d.isHistorical);
  const hasVerifiedId = idDocs.some((d) => d.verificationStatus === "VERIFIED");
  const decidable = !!b && canDecideBuyer(b);
  const mayApprove = decidable && can(P.BUYERS_VERIFY);
  const mayReject = decidable && can(P.BUYERS_REJECT);
  const maySuspend = !!b && canSuspendBuyer(b) && can(P.BUYERS_SUSPEND);
  const name = b ? buyerName(b) : "This buyer";

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && !decide.isPending && onClose()}>
        {open && (
          <DialogContent
            size="lg"
            title={b ? buyerName(b) : "Buyer"}
            description={b ? `${humanize(b.organizationType)} buyer · identity verification` : undefined}
            footer={
              <>
                {maySuspend && (
                  <Button variant="secondary" className="mr-auto" onClick={() => setDecision("SUSPEND")}>
                    <ProhibitIcon /> Suspend
                  </Button>
                )}
                {mayReject && (
                  <Button variant="danger" onClick={() => setDecision("REJECT")}>
                    <XIcon /> Reject buyer
                  </Button>
                )}
                {mayApprove && (
                  <Button onClick={() => setDecision("APPROVE")} disabled={!hasVerifiedId} title={hasVerifiedId ? undefined : "Verify the identity document first"}>
                    <CheckIcon /> Approve buyer
                  </Button>
                )}
                {!mayApprove && !mayReject && !maySuspend && (
                  <Button variant="secondary" onClick={onClose}>
                    Close
                  </Button>
                )}
              </>
            }
          >
            {detail.error ? (
              <ApiErrorNotice error={detail.error} />
            ) : !b ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="space-y-6">
                <Banner b={b} decidable={decidable} hasVerifiedId={hasVerifiedId} />
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Identity details</h3>
                  <DetailList
                    columns={2}
                    items={[
                      { label: "Full name", value: b.fullName },
                      { label: "Nationality", value: b.nationality },
                      { label: "ID type", value: docTypeLabel(b.documentType) },
                      { label: "Document number", value: b.documentNumber },
                      { label: "Issuing country", value: b.issuingCountry },
                      {
                        label: "Document expiry",
                        value: b.documentExpiresAtUtc ? (
                          <span>
                            {formatDate(b.documentExpiresAtUtc)}{" "}
                            {new Date(b.documentExpiresAtUtc).getTime() < Date.now() && (
                              <Badge tone="warning" className="ml-1">
                                Expired
                              </Badge>
                            )}
                          </span>
                        ) : null,
                      },
                      { label: "Mobile", value: b.mobileNumber },
                      { label: "Residential address", value: b.residentialAddress, full: true },
                      { label: "Account holder (user)", value: b.accountHolderUserId ? <IdText value={b.accountHolderUserId} /> : null },
                      { label: "Buyer type", value: humanize(b.organizationType) },
                      ...(b.legalName || b.tradingName ? [{ label: "Company (invoicing)", value: [b.legalName, b.tradingName && b.tradingName !== b.legalName ? `trading as ${b.tradingName}` : null].filter(Boolean).join(" · ") }] : []),
                      ...(b.taxRegistrationNumber ? [{ label: "TRN", value: b.taxRegistrationNumber }] : []),
                    ]}
                  />
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Identity document</h3>
                  {docs.error ? (
                    <ApiErrorNotice error={docs.error} />
                  ) : docs.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : documents.length === 0 ? (
                    <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">No identity document uploaded yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {documents.map((d) => (
                        <DocumentRow
                          key={d.buyerDocumentId}
                          doc={d}
                          buyerId={id}
                          canVerify={can(P.BUYERS_VERIFY) && decidable}
                          canReject={can(P.BUYERS_REJECT) && decidable}
                          onVerify={() => setDocDecision({ doc: d, action: "VERIFY" })}
                          onReject={() => setDocDecision({ doc: d, action: "REJECT" })}
                        />
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Status</h3>
                  <DetailList
                    columns={3}
                    items={[
                      { label: "Verification", value: <StatusBadge value={b.verificationStatus} /> },
                      { label: "Account", value: <StatusBadge value={b.orgStatus} /> },
                      { label: "Can purchase", value: b.canPurchase ? "Yes" : "No" },
                      { label: "Submitted", value: formatDateTime(b.submittedAtUtc) },
                      { label: "Review deadline", value: b.reviewDeadlineUtc ? formatDateTime(b.reviewDeadlineUtc) : b.reviewSlaStatus === "CALENDAR_COVERAGE_MISSING" ? "Unavailable (calendar)" : "—" },
                      { label: "Review SLA", value: <SlaBadge b={b} /> },
                      { label: "Verified", value: formatDateTime(b.verifiedAtUtc) },
                      { label: "Rejected", value: formatDateTime(b.rejectedAtUtc) },
                      ...(b.rejectionReason ? [{ label: "Rejection reason", value: b.rejectionReason, full: true }] : []),
                      ...(b.suspendedAtUtc ? [{ label: "Suspended", value: formatDateTime(b.suspendedAtUtc) }] : []),
                      ...(b.suspensionReason ? [{ label: "Suspension reason", value: b.suspensionReason, full: true }] : []),
                      ...(b.pendingPolicies.length ? [{ label: "Policies not yet accepted", value: b.pendingPolicies.join(", "), full: true }] : []),
                    ]}
                  />
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">History</h3>
                  {history.error ? (
                    <ApiErrorNotice error={history.error} />
                  ) : history.isLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : (history.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No status changes yet.</p>
                  ) : (
                    <ol className="space-y-2 border-l border-border pl-4" aria-label="Verification history">
                      {(history.data ?? []).map((h) => (
                        <li key={h.historyId} className="text-sm">
                          <p className="text-foreground">
                            <StatusBadge value={h.fromStatus || "NEW"} /> → <StatusBadge value={h.toStatus} />
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDateTime(h.changedAtUtc)} · by <IdText value={h.changedByUserId} />
                            {h.reason && ` · ${h.reason}`}
                            {h.comments && ` · ${h.comments}`}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={decision === "APPROVE"}
        onOpenChange={(o) => !o && setDecision(null)}
        title="Approve buyer?"
        description={`${name} will be verified and can purchase on StockOut (subject to their account and policy checks).`}
        confirmLabel="Approve"
        tone="primary"
        loading={decide.isPending}
        onConfirm={() => decide.mutate({ kind: "APPROVE" }, { onError })}
      />
      <ReasonDialog
        open={decision === "REJECT"}
        onOpenChange={(o) => !o && setDecision(null)}
        title="Reject buyer verification?"
        description={`${name} will be told why and can replace the document and resubmit.`}
        reasonLabel="Reason for the buyer"
        confirmLabel="Reject"
        loading={decide.isPending}
        onConfirm={(reason) => decide.mutate({ kind: "REJECT", reason }, { onError })}
      />
      <ReasonDialog
        open={decision === "SUSPEND"}
        onOpenChange={(o) => !o && setDecision(null)}
        title="Suspend buyer?"
        description={`${name} will immediately lose the ability to purchase. Use this to revoke a verified buyer (for example, after their ID expires).`}
        reasonLabel="Reason (recorded on the buyer)"
        confirmLabel="Suspend"
        loading={decide.isPending}
        onConfirm={(reason) => decide.mutate({ kind: "SUSPEND", reason }, { onError })}
      />
      <ConfirmDialog
        open={docDecision?.action === "VERIFY"}
        onOpenChange={(o) => !o && setDocDecision(null)}
        title="Verify identity document?"
        description="Confirm you opened the file and it is a clear, valid ID for the account holder, matching the identity details shown."
        confirmLabel="Verify document"
        tone="primary"
        loading={reviewDoc.isPending}
        onConfirm={() => docDecision && reviewDoc.mutate({ doc: docDecision.doc, action: "VERIFY" }, { onError })}
      />
      <ReasonDialog
        open={docDecision?.action === "REJECT"}
        onOpenChange={(o) => !o && setDocDecision(null)}
        title="Reject identity document?"
        description="The buyer sees your note and can upload a replacement."
        reasonLabel="Note for the buyer"
        confirmLabel="Reject document"
        loading={reviewDoc.isPending}
        onConfirm={(remark) => docDecision && reviewDoc.mutate({ doc: docDecision.doc, action: "REJECT", remark }, { onError })}
      />
    </>
  );
}

function Banner({ b, decidable, hasVerifiedId }: { b: AdminBuyerProfileDto; decidable: boolean; hasVerifiedId: boolean }) {
  if (b.orgStatus === "SUSPENDED")
    return <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">This buyer is suspended and can't purchase.</p>;
  if (decidable)
    return (
      <div className="rounded-md border border-action-border/50 bg-action-soft px-3 py-2 text-sm text-foreground">
        {b.requiresReverification && (
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <WarningCircleIcon className="size-4" aria-hidden /> Re-verification required{b.reverificationRequiredAtUtc ? ` since ${formatDate(b.reverificationRequiredAtUtc)}` : ""}
            {b.reverificationReason ? `: ${b.reverificationReason}` : ""}
          </p>
        )}
        <p>
          {b.submittedAtUtc ? `Submitted ${ageSince(b.submittedAtUtc)} ago. ` : ""}
          {b.reviewDeadlineUtc
            ? `Review deadline: ${formatDateTime(b.reviewDeadlineUtc)} (2 UAE business days). `
            : b.reviewSlaStatus === "CALENDAR_COVERAGE_MISSING"
              ? "Review deadline unavailable: the UAE calendar has no working days configured for this period (check UAE calendar). "
              : "Review target: within 2 business days. "}
          {hasVerifiedId ? "The identity document is verified; you can approve the buyer." : "Open and verify the identity document, then approve the buyer."}
        </p>
      </div>
    );
  return (
    <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
      {b.verificationStatus === "VERIFIED"
        ? "This buyer is verified. Their status stays verified after the ID expires unless you suspend them."
        : b.verificationStatus === "REJECTED"
          ? "Verification was rejected. The buyer can replace the document and resubmit."
          : "This buyer hasn't submitted their identity for review yet."}
    </p>
  );
}

function DocumentRow({
  doc,
  buyerId,
  canVerify,
  canReject,
  onVerify,
  onReject,
}: {
  doc: AdminBuyerDocumentResponse;
  buyerId: string;
  canVerify: boolean;
  canReject: boolean;
  onVerify: () => void;
  onReject: () => void;
}) {
  const pending = !doc.isHistorical && !["VERIFIED", "REJECTED"].includes(doc.verificationStatus.toUpperCase());
  const expired = !!doc.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now();
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start gap-3">
        <IdentificationCardIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {docTypeLabel(doc.documentType)}
            {!isIdentityDocument(doc) && <span className="ml-2 text-xs text-warning">Not an accepted ID type</span>}
            {doc.isHistorical && (
              <Badge tone="neutral" className="ml-2">
                Previous verification
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {doc.documentNumber ? `No. ${doc.documentNumber} · ` : ""}
            {doc.expiresAt ? `Expires ${formatDate(doc.expiresAt)}` : "No expiry date"}
            {expired && " (expired)"} · Uploaded {formatDateTime(doc.createdAtUtc)}
          </p>
          {doc.reviewRemark && <p className="mt-1 text-xs text-foreground">Review note: {doc.reviewRemark}</p>}
          {doc.reviewedAtUtc && <p className="mt-0.5 text-xs text-muted-foreground">Reviewed {formatDateTime(doc.reviewedAtUtc)}</p>}
        </div>
        <StatusBadge value={doc.verificationStatus} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SignedFileLink
          url={doc.downloadUrl}
          expiresAtUtc={doc.expiresAtUtc}
          label="Open document"
          refresh={async () => ({ downloadUrl: (await buyersService.documentDownloadUrl(buyerId, doc.buyerDocumentId)).downloadUrl })}
        />
        {pending && canReject && (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={onReject}>
            <XIcon /> Reject document
          </Button>
        )}
        {pending && canVerify && (
          <Button size="sm" onClick={onVerify} disabled={expired} title={expired ? "Expired documents can't be verified" : undefined} className={canReject ? undefined : "ml-auto"}>
            <CheckIcon /> Verify document
          </Button>
        )}
      </div>
    </li>
  );
}
