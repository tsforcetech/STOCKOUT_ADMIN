import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, FileTextIcon, ProhibitIcon, XIcon } from "@phosphor-icons/react";
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
import { Skeleton } from "@/components/ui/misc";
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
    mutationFn: (a: NonNullable<PendingAction>) =>
      a.kind === "SUSPEND" ? sellersService.suspend(a.seller.sellerId, a.seller.rowVersion) : sellersService.review(a.seller.sellerId, a.kind, a.seller.rowVersion),
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
      <ConfirmDialog
        open={pending !== null}
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
        onConfirm={() => pending && action.mutate(pending)}
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
      <SellerDocuments sellerId={s.sellerId} />
    </div>
  );
}

/** KYC documents with reviewer download links (F2-E, sellers.view). */
function SellerDocuments({ sellerId }: { sellerId: string }) {
  const { can } = useAccess();
  const allowed = can(P.SELLERS_VIEW);
  const docs = useQuery({
    queryKey: [...sellersKeys.all, "documents", sellerId],
    queryFn: ({ signal }) => sellersService.documents(sellerId, signal),
    enabled: allowed,
    staleTime: 60_000,
  });
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
          {docs.data.map((d) => (
            <li key={d.sellerDocumentId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted [&_svg]:size-5">
                <FileTextIcon />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-foreground">{d.documentType || "Document"}</p>
                <p className="text-xs text-muted-foreground">
                  {[d.documentNumber && `No. ${d.documentNumber}`, d.expiresAt && `Expires ${formatDate(d.expiresAt)}`, `Uploaded ${formatDateTime(d.createdAtUtc)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <StatusBadge value={d.verificationStatus} />
              <SignedFileLink url={d.downloadUrl} expiresAtUtc={d.expiresAtUtc} refresh={() => sellersService.documentDownloadUrl(sellerId, d.sellerDocumentId)} label="Open" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Business details from the admin seller detail endpoint (L16); the list row only carries status fields. */
function SellerProfile({ seller: s }: { seller: MarketplaceSellerDto }) {
  const { can } = useAccess();
  const detail = useQuery({
    queryKey: [...sellersKeys.all, "detail", s.sellerId],
    queryFn: ({ signal }) => sellersService.detail(s.sellerId, signal),
    enabled: can(P.SELLERS_VIEW),
    staleTime: 60_000,
  });
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
              { label: s.organizationType === "BUSINESS" ? "Trade licence / registration no." : "Registration no.", value: text(d?.registrationNo) },
              { label: "Type", value: humanize(d?.organizationType || s.organizationType) },
              { label: "Country", value: text(d?.countryCode) },
              { label: "Currency", value: text(d?.defaultCurrency) },
              { label: "Email", value: text(d?.email) },
              { label: "Seller since", value: formatDateTime(d?.createdAtUtc ?? null) },
              { label: "Seller ID", value: <IdText value={s.sellerId} />, full: true },
            ]}
          />
        </>
      )}
    </section>
  );
}
