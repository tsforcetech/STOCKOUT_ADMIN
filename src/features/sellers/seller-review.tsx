import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircleIcon, CheckIcon, FileTextIcon, ProhibitIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { DetailList } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { useAccess } from "@/lib/auth/use-access";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { sellersService } from "@/services/sellers.service";
import { PERMISSIONS as P, type MarketplaceSellerDto } from "@/api/types/user-organization";
import { formatDate, formatDateTime, humanize } from "@/lib/utils/format";
import { Badge, Skeleton } from "@/components/ui/misc";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import type { AdminSellerDocumentResponse } from "@/api/types/user-organization";
import { DocumentReviewDialog, docLabel } from "./document-review";
import { kycErrorMessage } from "./kyc-messages";
import { GENERIC_VAT_TYPE, categoryOf, kycChecklist, licenceProblem, signatoryParts } from "./kyc";
import { toast } from "sonner";
import { ApiErrorNotice, SignedFileLink, ageSince } from "@/features/listings/shared";

/** verify/reject are allowed only while PENDING and SUBMITTED/UNDER_REVIEW (backend state machine). */
export const canReviewKyc = (s: MarketplaceSellerDto) => s.verificationStatus === "PENDING" && (s.onboardingStatus === "SUBMITTED" || s.onboardingStatus === "UNDER_REVIEW");

export type SellerActionKind = "APPROVE" | "REJECT" | "SUSPEND";
type PendingAction = { kind: SellerActionKind; seller: MarketplaceSellerDto } | null;

export const sellersKeys = { all: ["sellers"] as const };

/**
 * KYC review for one seller, shared by the Sellers page and the Approvals queue: a review panel with everything
 * the admin API returns, plus approve / reject / suspend behind a confirmation.
 */
export function useSellerReview() {
  const { can } = useAccess();
  const [viewing, setViewing] = React.useState<MarketplaceSellerDto | null>(null);
  const [pending, setPending] = React.useState<PendingAction>(null);

  const action = useApiMutation({
    toastOnError: false,
    mutationFn: (a: NonNullable<PendingAction> & { reason?: string }) =>
      a.kind === "SUSPEND" ? sellersService.suspend(a.seller.sellerId, a.seller.rowVersion) : sellersService.review(a.seller.sellerId, a.kind, a.seller.rowVersion, a.reason),
    invalidate: [sellersKeys.all],
    successMessage: (_d, a) => `${a.seller.displayName ?? "Seller"} ${a.kind === "APPROVE" ? "verified" : a.kind === "REJECT" ? "rejected" : "suspended"}.`,
    onSuccess: () => {
      setPending(null);
      setViewing(null);
    },
  });

  const allowed = React.useCallback(
    (kind: SellerActionKind, s: MarketplaceSellerDto) =>
      kind === "APPROVE" ? can(P.SELLERS_VERIFY) && canReviewKyc(s) : kind === "REJECT" ? can(P.SELLERS_REJECT) && canReviewKyc(s) : can(P.SELLERS_SUSPEND) && s.status === "ACTIVE",
    [can],
  );

  const act = React.useCallback((kind: SellerActionKind, seller: MarketplaceSellerDto) => setPending({ kind, seller }), []);

  const name = pending?.seller.displayName || "This seller";
  const element = (
    <>
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        {viewing && (
          <DialogContent
            size="lg"
            title={viewing.displayName || "Unnamed seller"}
            description={`${humanize(viewing.organizationType)} seller · KYC review`}
            footer={
              <>
                {allowed("SUSPEND", viewing) && (
                  <Button variant="secondary" className="mr-auto" onClick={() => act("SUSPEND", viewing)}>
                    <ProhibitIcon /> Suspend
                  </Button>
                )}
                {allowed("REJECT", viewing) && (
                  <Button variant="danger" onClick={() => act("REJECT", viewing)}>
                    <XIcon /> Reject KYC
                  </Button>
                )}
                {allowed("APPROVE", viewing) && (
                  <Button onClick={() => act("APPROVE", viewing)}>
                    <CheckIcon /> Approve KYC
                  </Button>
                )}
                {!allowed("APPROVE", viewing) && !allowed("REJECT", viewing) && !allowed("SUSPEND", viewing) && (
                  <Button variant="secondary" onClick={() => setViewing(null)}>
                    Close
                  </Button>
                )}
              </>
            }
          >
            <SellerReviewBody seller={viewing} canDecide={can(P.SELLERS_VERIFY) || can(P.SELLERS_REJECT)} />
          </DialogContent>
        )}
      </Dialog>
      <ReasonDialog
        open={pending?.kind === "REJECT"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Reject seller KYC?"
        description={`${name} will be marked rejected and returned to draft so they can fix their details and resubmit. The reason is shown to the seller.`}
        reasonLabel="Reason for the seller"
        confirmLabel="Reject"
        loading={action.isPending}
        onConfirm={(reason) => pending && action.mutate({ ...pending, reason }, { onError: (e) => toast.error(kycErrorMessage(e)) })}
      />
      <ConfirmDialog
        open={pending !== null && pending.kind !== "REJECT"}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === "APPROVE" ? "Approve seller KYC?" : pending?.kind === "REJECT" ? "Reject seller KYC?" : "Suspend seller?"}
        description={
          pending?.kind === "APPROVE"
            ? `${name} will be marked verified and onboarding completed. They can then publish listings.`
            : pending?.kind === "REJECT"
              ? `${name} will be marked rejected and returned to draft so they can fix their details and resubmit.`
              : `${name} will be suspended. There is currently no API to reinstate a suspended seller.`
        }
        confirmLabel={pending?.kind === "APPROVE" ? "Approve" : pending?.kind === "REJECT" ? "Reject" : "Suspend"}
        tone={pending?.kind === "APPROVE" ? "primary" : "danger"}
        loading={action.isPending}
        onConfirm={() => pending && action.mutate(pending, { onError: (e) => toast.error(kycErrorMessage(e)) })}
      />
    </>
  );

  return { openReview: setViewing, act, allowed, element };
}

function SellerReviewBody({ seller: s, canDecide }: { seller: MarketplaceSellerDto; canDecide: boolean }) {
  const reviewable = canReviewKyc(s);
  return (
    <div className="space-y-6">
      {reviewable ? (
        <p className="rounded-md border border-action-border/50 bg-action-soft px-3 py-2 text-sm text-foreground">
          Submitted for verification {ageSince(s.submittedAtUtc)} ago.{canDecide ? " Approve to let them sell, or reject to send them back to draft." : ""}
        </p>
      ) : (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
          {s.verificationStatus === "VERIFIED"
            ? "This seller is already verified."
            : s.verificationStatus === "REJECTED"
              ? "KYC was rejected. The seller can resubmit from their seller portal."
              : "This seller hasn't submitted onboarding yet, so there is nothing to decide."}
        </p>
      )}
      <SellerProfile seller={s} />
      <KycReadiness seller={s} />
      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Status</h3>
        <DetailList
          columns={3}
          items={[
            { label: "KYC", value: <StatusBadge value={s.verificationStatus} /> },
            { label: "Onboarding", value: <StatusBadge value={s.onboardingStatus} /> },
            { label: "Account", value: <StatusBadge value={s.status} /> },
            { label: "Submitted", value: formatDateTime(s.submittedAtUtc) },
            { label: "Verified", value: formatDateTime(s.verifiedAtUtc) },
            { label: "Rejected", value: formatDateTime(s.rejectedAtUtc) },
            ...(s.suspendedAtUtc ? [{ label: "Suspended", value: formatDateTime(s.suspendedAtUtc) }] : []),
          ]}
        />
      </section>
      <SellerDocuments sellerId={s.sellerId} canReview={canDecide} />
      <SellerHistory sellerId={s.sellerId} />
    </div>
  );
}

/** KYC documents with reviewer download links (F2-E) and per-document review (PA-1B.1-R2). */
function SellerDocuments({ sellerId, canReview }: { sellerId: string; canReview: boolean }) {
  const { can } = useAccess();
  const allowed = can(P.SELLERS_VIEW);
  const docs = useSellerDocuments(sellerId, allowed);
  const [reviewing, setReviewing] = React.useState<AdminSellerDocumentResponse | null>(null);
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">KYC documents</h3>
      {!allowed ? (
        <p className="text-sm text-muted-foreground">Viewing seller documents needs the sellers.view permission.</p>
      ) : docs.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : docs.error ? (
        <ApiErrorNotice error={docs.error} />
      ) : !docs.data?.length ? (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">The seller hasn&apos;t uploaded any documents.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {docs.data.map((d) => {
            const sig = categoryOf(d.documentType) === "SIGNATORY" ? signatoryParts(d) : null;
            const expired = !!d.expiresAt && new Date(d.expiresAt).getTime() < Date.now();
            return (
              <li key={d.sellerDocumentId} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted [&_svg]:size-5">
                  <FileTextIcon />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium text-foreground">{d.documentType ? docLabel(d.documentType) : "Document"}</p>
                    {!categoryOf(d.documentType) && d.documentType.toUpperCase() !== "OTHER" && <Badge tone="warning">Free-text type</Badge>}
                    {d.documentType.toUpperCase() === GENERIC_VAT_TYPE && <Badge tone="warning">Needs classification</Badge>}
                    {expired && <Badge tone="danger">Expired</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[d.documentNumber && `No. ${d.documentNumber}`, d.expiresAt && `Expires ${formatDate(d.expiresAt)}`, `Uploaded ${formatDateTime(d.createdAtUtc)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {sig && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Declared: {[sig.id && "identity", sig.authority && "authority"].filter(Boolean).join(" + ") || "nothing"}
                      {d.verificationStatus === "VERIFIED" &&
                        ` · Confirmed: ${[d.verifiedSignatoryId && "identity", d.verifiedSignatoryAuthorityProof && "authority"].filter(Boolean).join(" + ") || "nothing"}`}
                    </p>
                  )}
                  {d.reviewRemark && (
                    <p className="mt-1 text-xs text-body">
                      Note: {d.reviewRemark}
                      {d.reviewedAtUtc ? ` (${formatDateTime(d.reviewedAtUtc)})` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge value={d.verificationStatus} />
                  <SignedFileLink url={d.downloadUrl} expiresAtUtc={d.expiresAtUtc} refresh={() => sellersService.documentDownloadUrl(sellerId, d.sellerDocumentId)} label="Open" />
                  {canReview && (
                    <Button size="sm" variant={d.verificationStatus === "UNVERIFIED" ? "primary" : "secondary"} onClick={() => setReviewing(d)}>
                      {d.verificationStatus === "UNVERIFIED" ? "Review" : "Change"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <DocumentReviewDialog sellerId={sellerId} doc={reviewing} onClose={() => setReviewing(null)} />
    </section>
  );
}

function useSellerDetail(sellerId: string, enabled: boolean) {
  return useQuery({ queryKey: [...sellersKeys.all, "detail", sellerId], queryFn: ({ signal }) => sellersService.detail(sellerId, signal), enabled, staleTime: 60_000 });
}

function useSellerDocuments(sellerId: string, enabled: boolean) {
  return useQuery({ queryKey: [...sellersKeys.all, "documents", sellerId], queryFn: ({ signal }) => sellersService.documents(sellerId, signal), enabled, staleTime: 60_000 });
}

/** Business details from the admin seller detail endpoint (L16); the list row only carries status fields. */
function SellerProfile({ seller: s }: { seller: MarketplaceSellerDto }) {
  const { can } = useAccess();
  const detail = useSellerDetail(s.sellerId, can(P.SELLERS_VIEW));
  const d = detail.data;
  const text = (v: string | null | undefined) => (v && v.trim() ? v : "—");
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Seller</h3>
      {detail.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <>
          {detail.error && <ApiErrorNotice error={detail.error} className="mb-3" />}
          <DetailList
            items={[
              { label: "Display name", value: text(d?.displayName ?? s.displayName) },
              { label: "Legal name", value: text(d?.legalName) },
              { label: "Type", value: humanize(d?.organizationType || s.organizationType) },
              { label: "Trade licence no.", value: text(d?.tradeLicenseNumber ?? d?.registrationNo) },
              { label: "Issuing authority", value: text(d?.issuingAuthority) },
              {
                label: "Licence validity",
                value: d?.tradeLicenseExpiresAtUtc ? (
                  <span className={new Date(d.tradeLicenseExpiresAtUtc).getTime() <= Date.now() ? "font-medium text-danger" : undefined}>
                    {d.tradeLicenseIssuedAtUtc ? `${formatDate(d.tradeLicenseIssuedAtUtc)} – ` : "Until "}
                    {formatDate(d.tradeLicenseExpiresAtUtc)}
                  </span>
                ) : (
                  <span className="text-danger">Expiry not set</span>
                ),
              },
              {
                label: "VAT",
                value: d?.isVatRegistered ? `Registered · TRN ${text(d.taxRegistrationNumber)}` : d?.hasVatDeclaration ? "Not registered (declaration confirmed)" : "—",
              },
              { label: "Signatory", value: text([d?.signatoryName, d?.signatoryAuthorityRole].filter(Boolean).join(" · ")) },
              { label: "Signatory contact", value: text([d?.signatoryEmail, d?.signatoryPhone].filter(Boolean).join(" · ")) },
              { label: "Business contact", value: text([d?.businessContactEmail, d?.businessContactPhone].filter(Boolean).join(" · ")) },
              {
                label: "Address",
                value: text([d?.addressLine1, d?.addressLine2, d?.city, d?.stateOrEmirate, d?.postalCode].filter(Boolean).join(", ")),
                full: true,
              },
              { label: "Bank", value: text([d?.bankBeneficiaryName, d?.bankName].filter(Boolean).join(" · ")) },
              { label: "IBAN / SWIFT", value: text([d?.bankIban, d?.bankSwiftCode].filter(Boolean).join(" · ")) },
              { label: "Country / currency", value: text([d?.countryCode, d?.defaultCurrency].filter(Boolean).join(" · ")) },
              { label: "Seller since", value: formatDateTime(d?.createdAtUtc ?? null) },
              ...(d?.rejectionReason ? [{ label: "Last rejection reason", value: d.rejectionReason, full: true }] : []),
              { label: "Seller ID", value: <IdText value={s.sellerId} />, full: true },
            ]}
          />
        </>
      )}
    </section>
  );
}

/**
 * What approval will check (PA-1B.1-R2 / R4): licence expiry, each category with a VERIFIED document,
 * reviewer-confirmed signatory identity and authority, no unclassified VAT upload, and accepted policies.
 * Shown as guidance only — the server makes the final decision.
 */
function KycReadiness({ seller: s }: { seller: MarketplaceSellerDto }) {
  const { can } = useAccess();
  const allowed = can(P.SELLERS_VIEW);
  const detail = useSellerDetail(s.sellerId, allowed);
  const docs = useSellerDocuments(s.sellerId, allowed);
  if (!allowed || !detail.data || !docs.data) return null;
  const d = detail.data;
  const list = docs.data;
  const verified = list.filter((x) => x.verificationStatus === "VERIFIED");
  const rows = kycChecklist(d, list);
  const label = (k: string) => rows.find((r) => r.key === k)?.title ?? k;
  const checks: Array<{ ok: boolean; text: string }> = [
    { ok: !licenceProblem(d), text: licenceProblem(d) ? "Trade licence expiry is missing or past" : "Trade licence valid" },
    ...(["TRADE_LICENSE", "VAT", "BANK"] as const).map((k) => {
      const ok = rows.find((r) => r.key === k)?.verified ?? false;
      return { ok, text: `${label(k)}: ${ok ? "verified" : "no verified document"}` };
    }),
    { ok: verified.some((x) => x.verifiedSignatoryId === true), text: "Signatory identity confirmed by a reviewer" },
    { ok: verified.some((x) => x.verifiedSignatoryAuthorityProof === true), text: "Signatory authority confirmed by a reviewer" },
    ...(list.some((x) => x.documentType.toUpperCase() === GENERIC_VAT_TYPE && x.verificationStatus !== "REJECTED")
      ? [{ ok: false, text: "A general VAT upload still needs classification" }]
      : []),
    ...(d.pendingPolicies && d.pendingPolicies.length ? [{ ok: false, text: `Policies not yet accepted: ${d.pendingPolicies.join(", ")}` }] : []),
  ];
  const ready = checks.every((c) => c.ok);
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Approval checks</h3>
      <ul className={`space-y-1.5 rounded-lg border px-4 py-3 text-sm ${ready ? "border-success/40 bg-success-soft/40" : "border-border"}`} aria-label="Approval checks">
        {checks.map((c) => (
          <li key={c.text} className="flex items-start gap-2">
            {c.ok ? <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-success" weight="fill" aria-hidden /> : <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
            <span className={c.ok ? "text-foreground" : "text-body"}>
              <span className="sr-only">{c.ok ? "Done: " : "Open: "}</span>
              {c.text}
            </span>
          </li>
        ))}
      </ul>
      {!ready && <p className="mt-2 text-xs text-muted-foreground">Review each document below first. Approval will be refused until every check passes.</p>}
    </section>
  );
}

/** Verification status changes (GET …/history). */
function SellerHistory({ sellerId }: { sellerId: string }) {
  const { can } = useAccess();
  const allowed = can(P.SELLERS_VIEW);
  const history = useQuery({ queryKey: [...sellersKeys.all, "history", sellerId], queryFn: ({ signal }) => sellersService.history(sellerId, signal), enabled: allowed, staleTime: 60_000 });
  if (!allowed) return null;
  const list = [...(history.data ?? [])].sort((a, b) => b.changedAtUtc.localeCompare(a.changedAtUtc));
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">Verification history</h3>
      {history.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : history.error ? (
        <ApiErrorNotice error={history.error} />
      ) : !list.length ? (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">No status changes recorded yet.</p>
      ) : (
        <ol className="space-y-3 border-l border-border pl-4" aria-label="Verification history">
          {list.map((h) => (
            <li key={h.historyId} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-border-strong" aria-hidden />
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge value={h.fromStatus} />
                <span className="text-muted-foreground" aria-label="to">→</span>
                <StatusBadge value={h.toStatus} />
                <span className="text-xs text-muted-foreground">{formatDateTime(h.changedAtUtc)}</span>
              </div>
              {(h.reason || h.comments) && <p className="mt-1 text-body">{[h.reason, h.comments].filter(Boolean).join(" — ")}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">
                By <IdText value={h.changedByUserId} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
