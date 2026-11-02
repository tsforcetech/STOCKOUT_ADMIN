import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowCounterClockwiseIcon, CheckCircleIcon, InfoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { Skeleton } from "@/components/ui/misc";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { isApiError } from "@/lib/api/errors";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { sellersService } from "@/services/sellers.service";
import type { AdminSellerDocumentResponse, MarketplaceSellerDto } from "@/api/types/user-organization";
import { ApiErrorNotice } from "@/features/listings/shared";
import { categoryOf, licenceProblem } from "./kyc";
import { kycErrorMessage } from "./kyc-messages";

export const REINSTATE_REASON_MAX = 1000;
const REASON_MIN = 10;

/** Trade-licence document types the reinstatement procedure (migration 037) accepts. Approval accepts more. */
const REINSTATE_LICENCE_TYPES = new Set(["TRADE_LICENSE", "TRADE_LICENCE", "COMMERCIAL_LICENSE"]);

/** Codes after which the seller must be re-read before trying again. */
const REFRESH_CODES = new Set(["MARKETPLACE_SELLER_VERSION_CONFLICT", "INVALID_ROW_VERSION", "MARKETPLACE_SELLER_TRANSITION_INVALID"]);

/** Reinstatement wording; anything else falls back to the shared seller messages. */
const MESSAGES: Record<string, string> = {
  SELLER_LICENCE_EXPIRED: "Can't reinstate: the seller's trade licence has expired or has no expiry date. The licence must be renewed first.",
  MANDATORY_KYC_DOCUMENTS_INCOMPLETE: "Can't reinstate: one of the mandatory KYC documents is missing, not verified or expired.",
  MARKETPLACE_SELLER_TRANSITION_INVALID: "This seller can't be reinstated in their current state (they must be suspended, KYC verified and onboarding completed).",
  MARKETPLACE_SELLER_VERSION_CONFLICT: "Someone else changed this seller while you were working.",
  INVALID_ROW_VERSION: "The seller record you had was out of date.",
  FORBIDDEN: "You don't have permission to reinstate sellers (sellers.reinstate).",
  REINSTATEMENT_REASON_REQUIRED: "Enter a meaningful reason.",
};
const message = (e: unknown) => (isApiError(e) && e.code && MESSAGES[e.code]) || kycErrorMessage(e);

export interface Check {
  ok: boolean;
  text: string;
}

const live = (d: AdminSellerDocumentResponse, now: number) => d.verificationStatus === "VERIFIED" && (!d.expiresAt || new Date(d.expiresAt).getTime() > now);

/** Mirrors the gates in PR_SELLER_ADMIN_REINSTATE so the admin sees what will block before submitting. */
export function reinstateChecks(s: MarketplaceSellerDto, docs: AdminSellerDocumentResponse[], now = Date.now()): Check[] {
  const ok = docs.filter((d) => live(d, now));
  const has = (pred: (d: AdminSellerDocumentResponse) => boolean) => ok.some(pred);
  const licenceDocOk = has((d) => REINSTATE_LICENCE_TYPES.has(d.documentType.toUpperCase()));
  const licenceDocOther = !licenceDocOk && has((d) => categoryOf(d.documentType) === "TRADE_LICENSE");
  return [
    { ok: s.status === "SUSPENDED", text: s.status === "SUSPENDED" ? "Account is suspended" : `Account is ${s.status}, not suspended` },
    { ok: s.verificationStatus === "VERIFIED", text: `KYC status ${s.verificationStatus === "VERIFIED" ? "is Verified" : `is ${s.verificationStatus} (must be Verified)`}` },
    { ok: s.onboardingStatus === "COMPLETED", text: `Onboarding ${s.onboardingStatus === "COMPLETED" ? "is completed" : `is ${s.onboardingStatus} (must be Completed)`}` },
    {
      ok: !licenceProblem(s),
      text: licenceProblem(s) ? "Trade licence expiry date is missing or in the past" : `Trade licence valid until ${formatDate(s.tradeLicenseExpiresAtUtc ?? null)}`,
    },
    {
      ok: licenceDocOk,
      text: licenceDocOk
        ? "Trade licence document verified and not expired"
        : licenceDocOther
          ? "Trade licence document is a type reinstatement doesn't accept (commercial licence/register)"
          : "No verified, unexpired trade licence document",
    },
    {
      ok: has((d) => categoryOf(d.documentType) === "VAT"),
      text: `${s.isVatRegistered ? "VAT certificate" : "VAT non-registration declaration"}: ${has((d) => categoryOf(d.documentType) === "VAT") ? "verified" : "no verified, unexpired document"}`,
    },
    { ok: has((d) => d.verifiedSignatoryId === true), text: "Signatory identity verified and not expired" },
    { ok: has((d) => d.verifiedSignatoryAuthorityProof === true), text: "Signatory authority verified and not expired" },
    { ok: has((d) => categoryOf(d.documentType) === "BANK"), text: `Bank letter: ${has((d) => categoryOf(d.documentType) === "BANK") ? "verified" : "no verified, unexpired document"}` },
  ];
}

export function ReinstateDialog({ seller, open, onClose, onDone }: { seller: MarketplaceSellerDto | null; open: boolean; onClose: () => void; onDone: (s: MarketplaceSellerDto) => void }) {
  const qc = useQueryClient();
  const id = seller?.sellerId ?? "";
  // Always read the current seller when the dialog opens: the rowVersion must not come from an older response.
  const detail = useQuery({ queryKey: ["sellers", "detail", id], queryFn: ({ signal }) => sellersService.detail(id, signal), enabled: open && !!id, staleTime: 0, refetchOnMount: "always" });
  const docs = useQuery({ queryKey: ["sellers", "documents", id], queryFn: ({ signal }) => sellersService.documents(id, signal), enabled: open && !!id, staleTime: 0, refetchOnMount: "always" });
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const mutation = useApiMutation({
    toastOnError: false,
    mutationFn: async () => {
      const fresh = await qc.fetchQuery({ queryKey: ["sellers", "detail", id], queryFn: ({ signal }) => sellersService.detail(id, signal), staleTime: 0 });
      try {
        return await sellersService.reinstate(id, fresh.rowVersion, reason);
      } catch (e) {
        // Re-read the authoritative seller; the typed reason stays in the box.
        if (isApiError(e) && e.code && REFRESH_CODES.has(e.code)) void qc.invalidateQueries({ queryKey: ["sellers"] });
        throw e;
      }
    },
    onSuccess: (dto) => {
      void qc.invalidateQueries({ queryKey: ["sellers"] });
      toast.success(`${dto.displayName ?? "Seller"} reinstated (${dto.status}). Their eligible published listings return to buyer search shortly; this can take a few minutes.`);
      setReason("");
      setTouched(false);
      onDone(dto);
    },
  });

  React.useEffect(() => {
    if (open) mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const s = detail.data ?? seller;
  const checks = detail.data && docs.data ? reinstateChecks(detail.data, docs.data) : null;
  const blocked = checks?.some((c) => !c.ok) ?? false;
  const short = reason.trim().length < REASON_MIN;
  const busy = mutation.isPending;
  const code = isApiError(mutation.error) ? mutation.error.code : undefined;

  const submit = () => {
    setTouched(true);
    if (!short && !busy) mutation.mutate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        size="lg"
        title="Reinstate seller?"
        description={s ? `${s.displayName || "Unnamed seller"}${s.legalName && s.legalName !== s.displayName ? ` · ${s.legalName}` : ""}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={busy || detail.isLoading}>
              <ArrowCounterClockwiseIcon /> Reinstate seller
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {s && (
            <section className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm">
              <p>
                <span className="text-muted-foreground">Suspended:</span> {formatDateTime(s.suspendedAtUtc)}
              </p>
              <p className="mt-1">
                <span className="text-muted-foreground">Suspension reason:</span> {s.suspensionReason?.trim() || "Not recorded"}
              </p>
              {s.registrationNo && (
                <p className="mt-1">
                  <span className="text-muted-foreground">Trade licence no.:</span> {s.tradeLicenseNumber ?? s.registrationNo}
                </p>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Compliance checks</h3>
            {detail.error || docs.error ? (
              <ApiErrorNotice error={detail.error ?? docs.error} />
            ) : !checks ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-3/5" />
              </div>
            ) : (
              <ul className="space-y-1.5 rounded-lg border border-border px-4 py-3 text-sm" aria-label="Compliance checks">
                {checks.map((c) => (
                  <li key={c.text} className="flex items-start gap-2">
                    {c.ok ? <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-success" weight="fill" aria-hidden /> : <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
                    <span>
                      <span className="sr-only">{c.ok ? "Passes: " : "Fails: "}</span>
                      {c.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {blocked && <p className="mt-2 text-xs text-muted-foreground">The server will refuse reinstatement until every check passes. Review the seller&apos;s documents first.</p>}
          </section>

          <p className="flex items-start gap-2 rounded-lg border border-action-border/50 bg-action-soft px-3 py-2 text-sm text-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            The seller becomes Active again. Only listings that are currently published and still eligible go back into buyer search, and that happens in the background, so it can take a few minutes.
          </p>

          <FormField
            label="Reason (recorded in the audit history)"
            htmlFor="reinstate-reason"
            required
            error={touched && short ? `Enter at least ${REASON_MIN} characters explaining what was rechecked.` : undefined}
            hint={`${reason.length}/${REINSTATE_REASON_MAX}`}
          >
            <Textarea rows={3} maxLength={REINSTATE_REASON_MAX} disabled={busy} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Trade licence and all mandatory KYC documents rechecked and compliant." />
          </FormField>

          {mutation.error ? (
            <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
              {message(mutation.error)}
              {code && REFRESH_CODES.has(code) && <span className="mt-1 block">The seller has been reloaded. Check the details above, then try again.</span>}
              {(code === "SELLER_LICENCE_EXPIRED" || code === "MANDATORY_KYC_DOCUMENTS_INCOMPLETE") && <span className="mt-1 block">Fix this in the seller&apos;s documents and profile first; retrying now will fail again.</span>}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
