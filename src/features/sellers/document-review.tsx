import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { FormError, FormField } from "@/components/forms/form-field";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAccess } from "@/lib/auth/use-access";
import { sellersService } from "@/services/sellers.service";
import { PERMISSIONS as P, type AdminSellerDocumentResponse } from "@/api/types/user-organization";
import { cn } from "@/lib/utils/cn";
import {
  BANK_TYPES,
  COMBINED_TYPES,
  GENERIC_VAT_TYPE,
  SIGNATORY_AUTHORITY_TYPES,
  SIGNATORY_COMBINED_TYPES,
  SIGNATORY_ID_TYPES,
  TRADE_LICENSE_TYPES,
  VAT_DECLARATION_TYPES,
  VAT_REGISTERED_TYPES,
  categoryOf,
  kycTypeLabel,
  signatoryParts,
} from "./kyc";
import { kycErrorMessage } from "./kyc-messages";

const RECLASSIFY_OPTIONS = [...TRADE_LICENSE_TYPES, ...VAT_REGISTERED_TYPES, ...VAT_DECLARATION_TYPES, ...SIGNATORY_ID_TYPES, ...SIGNATORY_AUTHORITY_TYPES, ...SIGNATORY_COMBINED_TYPES, ...BANK_TYPES];

export const docLabel = (type: string) => kycTypeLabel(type) ?? type;

/**
 * PA-1B.1-R2 per-document review. Signatory evidence is confirmed by the reviewer (never taken from the applicant's
 * declaration); generic VAT uploads must be reclassified to an explicit type before they can count.
 */
export function DocumentReviewDialog({ sellerId, doc, onClose }: { sellerId: string; doc: AdminSellerDocumentResponse | null; onClose: () => void }) {
  const { can } = useAccess();
  const qc = useQueryClient();
  const canVerify = can(P.SELLERS_VERIFY);
  const canReject = can(P.SELLERS_REJECT);
  const [action, setAction] = React.useState<"VERIFY" | "REJECT">("VERIFY");
  const [remark, setRemark] = React.useState("");
  const [reclassify, setReclassify] = React.useState("");
  const [confirmId, setConfirmId] = React.useState(false);
  const [confirmAuthority, setConfirmAuthority] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!doc) return;
    setAction(canVerify ? "VERIFY" : "REJECT");
    setRemark("");
    setReclassify("");
    setError(null);
    // Standalone ID / authority types imply their element; combined and other files start unconfirmed.
    const t = doc.documentType.toUpperCase();
    const implied = COMBINED_TYPES.has(t) || categoryOf(t) !== "SIGNATORY" ? { id: false, authority: false } : signatoryParts({ documentType: t, containsSignatoryId: null, containsSignatoryAuthorityProof: null });
    setConfirmId(doc.verifiedSignatoryId ?? implied.id);
    setConfirmAuthority(doc.verifiedSignatoryAuthorityProof ?? implied.authority);
  }, [doc, canVerify]);

  const effectiveType = (reclassify || doc?.documentType || "").toUpperCase();
  const signatory = categoryOf(effectiveType) === "SIGNATORY" || effectiveType === "OTHER";
  const generic = doc?.documentType.toUpperCase() === GENERIC_VAT_TYPE;
  // Free-text types from before the checklist don't count towards any category until reclassified.
  const legacy = !!doc && !categoryOf(doc.documentType) && doc.documentType.toUpperCase() !== "OTHER";

  const review = useApiMutation({
    toastOnError: false,
    mutationFn: () =>
      sellersService.reviewDocument(sellerId, doc!.sellerDocumentId, {
        action,
        reviewRemark: remark.trim() || null,
        ...(action === "VERIFY" && signatory ? { verifiedSignatoryId: confirmId, verifiedSignatoryAuthorityProof: confirmAuthority } : {}),
        ...(reclassify ? { reclassifiedDocumentType: reclassify } : {}),
      }),
    successMessage: () => (action === "VERIFY" ? "Document verified." : "Document rejected."),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sellers"] });
      onClose();
    },
  });

  const submit = () => {
    setError(null);
    if (action === "REJECT" && !remark.trim()) return setError("Add a note explaining why — the seller sees it.");
    if (action === "VERIFY" && generic && !reclassify) return setError("Choose the exact document type before verifying a general VAT upload.");
    review.mutate(undefined, { onError: (e) => setError(kycErrorMessage(e)) });
  };

  const declared = doc ? signatoryParts(doc) : null;
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && !review.isPending && onClose()}>
      {doc && (
        <DialogContent
          title="Review document"
          description={`${docLabel(doc.documentType)}${doc.documentNumber ? ` · No. ${doc.documentNumber}` : ""}`}
          footer={
            <>
              <Button variant="secondary" onClick={onClose} disabled={review.isPending}>
                Cancel
              </Button>
              <Button variant={action === "REJECT" ? "danger" : "primary"} onClick={submit} loading={review.isPending}>
                {action === "REJECT" ? "Reject document" : "Verify document"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <FormError message={error} />
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Decision">
              {(["VERIFY", "REJECT"] as const).map((a) => {
                const disabled = a === "VERIFY" ? !canVerify : !canReject;
                return (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={action === a}
                    disabled={disabled}
                    onClick={() => setAction(a)}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      action === a ? (a === "VERIFY" ? "border-success bg-success-soft text-success-soft-foreground" : "border-danger bg-danger-soft text-danger-soft-foreground") : "border-border hover:bg-surface-muted",
                    )}
                  >
                    {a === "VERIFY" ? "Verify" : "Reject"}
                  </button>
                );
              })}
            </div>

            <FormField
              label="Document type"
              htmlFor="reclassify"
              hint={
                generic
                  ? "Uploaded as a general VAT document — pick the exact type to verify it."
                  : legacy
                    ? "Uploaded with a free-text type, so it doesn't count towards a requirement — pick the matching type."
                    : "Change only if the seller chose the wrong type."
              }
            >
              <NativeSelect id="reclassify" value={reclassify} onChange={(e) => setReclassify(e.target.value)}>
                <option value="">{generic ? "Choose the exact type…" : `Keep: ${docLabel(doc.documentType)}`}</option>
                {RECLASSIFY_OPTIONS.filter((o) => o.value !== doc.documentType.toUpperCase()).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            {action === "VERIFY" && signatory && (
              <fieldset className="space-y-2 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-medium text-foreground">Signatory evidence you confirmed</legend>
                {declared && (declared.id || declared.authority) && (
                  <p className="text-xs text-muted-foreground">
                    Seller declared: {[declared.id && "identity", declared.authority && "authority proof"].filter(Boolean).join(" and ")}.
                  </p>
                )}
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                  <Checkbox className="mt-0.5" checked={confirmId} onCheckedChange={(v) => setConfirmId(v === true)} />
                  Signatory identity (Emirates ID or passport)
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
                  <Checkbox className="mt-0.5" checked={confirmAuthority} onCheckedChange={(v) => setConfirmAuthority(v === true)} />
                  Authority to act for the company (POA, MOA or board resolution)
                </label>
              </fieldset>
            )}

            <FormField label="Reviewer note" htmlFor="review-remark" required={action === "REJECT"} hint={action === "REJECT" ? "Shown to the seller so they can fix it." : "Optional, e.g. what you checked it against."}>
              <Textarea id="review-remark" rows={3} maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </FormField>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
