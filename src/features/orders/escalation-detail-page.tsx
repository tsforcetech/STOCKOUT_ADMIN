import * as React from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { PageHeader, DetailList } from "@/components/common/page-header";
import { SectionCard, RefreshButton } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState, PageSkeleton } from "@/components/feedback/states";
import { isApiError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/utils/format";
import type { SellerSubOrderEscalationDetailDto } from "@/api/types/order-escalations";
import { escalationKeys, orderEscalationsService } from "@/services/order-escalations.service";
import { Notice, PanelTitle, fmtUtc } from "@/features/listings/shared";
import { remaining, resolutionLabel } from "./escalations-page";

const MESSAGES: Record<string, string> = {
  CONCURRENCY_CONFLICT: "This case changed since you opened it (the seller or another admin acted). It has been reloaded; check it before deciding again.",
  ALREADY_RESOLVED: "This case has already been resolved. It has been reloaded.",
  SELLER_ALREADY_RESPONDED: "The seller responded before your decision, so nothing was cancelled. The case has been reloaded.",
  MANDATORY_DECISION_REASON: "Write the reason for cancelling.",
  PROCEDURE_NOT_APPROVED: "Only cancellation is approved for escalated orders.",
  FORBIDDEN: "Cancelling needs the orders.escalations.cancel permission and Platform Admin authority. Ask a super admin to grant it.",
  INVALID_ROW_VERSION: "This case needs reloading. It has been refreshed; try again.",
};
const message = (e: unknown) => (isApiError(e) && e.code && MESSAGES[e.code]) || (isApiError(e) ? e.message : "Something went wrong.");

/** Cancel the seller's sub-order: explicit, reasoned, with the case's current rowVersion. Never automatic, never retried blindly. */
function CancelCase({ d }: { d: SellerSubOrderEscalationDetailDto }) {
  const qc = useQueryClient();
  const e = d.escalation;
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [done, setDone] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await orderEscalationsService.decide(e.escalationId, { decision: "CANCEL", reason: reason.trim(), notes: notes.trim() || null, expectedRowVersion: e.rowVersion });
      setDone(true);
      setConfirm(false);
    } catch (err) {
      setError(err);
      setConfirm(false);
    } finally {
      setBusy(false);
      // Success or a conflict / already-resolved answer: show the case as the server now has it (never retry blindly).
      await qc.invalidateQueries({ queryKey: escalationKeys.all });
    }
  };

  if (done) return <Notice title="Sub-order cancelled">The seller&apos;s part of this order was cancelled and the case is resolved.</Notice>;
  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{message(error)}</Notice> : null}
      <FormField label="Reason for cancelling" htmlFor="esc-reason" required hint="Recorded in the audit trail.">
        <Textarea id="esc-reason" rows={3} value={reason} maxLength={1000} onChange={(ev) => setReason(ev.target.value)} />
      </FormField>
      <FormField label="Notes" htmlFor="esc-notes" hint="Optional, staff only.">
        <Textarea id="esc-notes" rows={2} value={notes} maxLength={2000} onChange={(ev) => setNotes(ev.target.value)} />
      </FormField>
      <Button variant="danger" disabled={!reason.trim() || busy} onClick={() => setConfirm(true)}>
        Cancel the seller&apos;s sub-order
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Cancel sub-order ${e.subOrderNumber}?`}
        description="The seller's part of this order is cancelled. This can't be undone from here."
        confirmLabel="Cancel sub-order"
        loading={busy}
        onConfirm={() => void submit()}
      />
    </div>
  );
}

export default function EscalationDetailPage() {
  const { escalationId = "" } = useParams();
  const q = useQuery({ queryKey: escalationKeys.detail(escalationId), queryFn: ({ signal }) => orderEscalationsService.detail(escalationId, signal) });
  const audit = useQuery({ queryKey: escalationKeys.audit(escalationId), queryFn: ({ signal }) => orderEscalationsService.audit(escalationId, signal), enabled: !!q.data });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) {
    const notFound = isApiError(q.error) && q.error.status === 404 && q.error.code !== "unmatched_gateway_route";
    return notFound ? (
      <Notice tone="warning" title="Escalation not found">
        It may have been removed, or the link is wrong.{" "}
        <Link to="/orders/escalations" className="underline underline-offset-4">
          Back to escalations
        </Link>
      </Notice>
    ) : (
      <ErrorState error={q.error} onRetry={() => void q.refetch()} />
    );
  }
  const d = q.data;
  const e = d.escalation;
  const so = d.subOrder;
  const po = d.parentOrder;
  const cur = po.currency || "AED";
  const pending = e.resolutionStatus === "PENDING";
  const trail = audit.data ?? d.auditTrail;

  return (
    <>
      <Link to="/orders/escalations" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Order escalations
      </Link>
      <PageHeader
        eyebrow="Order escalation"
        title={`Sub-order ${e.subOrderNumber}`}
        description={`Order ${e.orderNumber} · ${e.sellerName ?? "Seller"}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge value={pending ? "PENDING" : e.resolutionStatus === "RESOLVED_ADMIN_CANCELLED" ? "REJECTED" : "APPROVED"} label={resolutionLabel(e.resolutionStatus)} />
            {pending && e.isOverdue && <Badge tone="danger">Overdue</Badge>}
            <RefreshButton onClick={() => (void q.refetch(), void audit.refetch())} spinning={q.isFetching} />
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4">
          <SectionCard>
            <PanelTitle title="Case" />
            <DetailList
              items={[
                { label: "Escalated", value: fmtUtc(e.escalatedAtUtc) },
                { label: "Seller confirmation was due", value: fmtUtc(e.slaExpiresAtUtc) },
                { label: "Admin decision due", value: `${fmtUtc(e.adminReviewDeadlineUtc)}${pending ? ` · ${remaining(e)}` : ""}` },
                { label: "Buyer agreed to continue with other sellers", value: e.buyerConsentMultiSellerContinuation ? "Yes" : "No" },
                ...(e.resolvedAtUtc ? [{ label: "Resolved", value: `${fmtUtc(e.resolvedAtUtc)}${e.resolvedBy ? ` · ${e.resolvedBy}` : ""}` }] : []),
                ...(e.decisionReason ? [{ label: "Decision reason", value: e.decisionReason, full: true }] : []),
              ]}
            />
          </SectionCard>
          <SectionCard>
            <PanelTitle title="Seller sub-order" />
            <DetailList
              items={[
                { label: "Seller", value: so.sellerTradingName || so.sellerLegalName || e.sellerName || "—" },
                { label: "Status", value: `${so.status} · ${so.fulfillmentStatus}` },
                { label: "Material subtotal", value: formatMoney(so.materialSubtotal, cur) },
                { label: "VAT", value: formatMoney(so.applicableMaterialVat, cur) },
                { label: "Sub-order total", value: formatMoney(so.subOrderTotal, cur) },
                { label: "Items", value: String(so.items?.length ?? 0) },
                ...(so.sellerRejectionReason ? [{ label: "Seller rejection reason", value: so.sellerRejectionReason, full: true }] : []),
              ]}
            />
          </SectionCard>
          <SectionCard>
            <PanelTitle
              title="Order"
              actions={
                <Link to={`/payments?order=${po.orderId}&subOrder=${so.subOrderId}`} className="text-sm underline underline-offset-4">
                  Finance checks
                </Link>
              }
            />
            <DetailList
              items={[
                { label: "Order", value: po.orderNumber },
                { label: "Placed", value: fmtUtc(po.orderDateUtc) },
                { label: "Order status", value: po.status },
                { label: "Payment", value: po.paymentStatus },
                { label: "Order total", value: formatMoney(po.totalPayableAmount, cur) },
                { label: "Sellers in this order", value: String(po.subOrders?.length ?? 1) },
              ]}
            />
          </SectionCard>
          <SectionCard>
            <PanelTitle title="Reminders sent to the seller" />
            {d.reminders.length ? (
              <ul className="divide-y divide-border text-sm">
                {d.reminders.map((r) => (
                  <li key={r.reminderId} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {r.reminderType.replace(/_/g, " ")} · {r.channel}
                    </span>
                    <span className="text-muted-foreground">
                      {r.status} · {fmtUtc(r.sentAtUtc ?? r.scheduledForUtc)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No reminders recorded.</p>
            )}
          </SectionCard>
          <SectionCard>
            <PanelTitle title="Audit trail" />
            {trail.length ? (
              <ol className="space-y-3 text-sm" aria-label="Audit trail">
                {trail.map((a) => (
                  <li key={a.auditId} className="border-l-2 border-border pl-3">
                    <p className="font-medium text-foreground">{a.action.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtUtc(a.createdAtUtc)} · {a.performedBy} ({a.performedByRole})
                    </p>
                    {a.reason && <p className="mt-1 text-body">{a.reason}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No audit entries yet.</p>
            )}
          </SectionCard>
        </div>
        <SectionCard className="lg:sticky lg:top-4">
          <PanelTitle title="Decision" description={pending ? "Cancelling the seller's sub-order is the only approved action. The seller can still confirm until you decide." : undefined} />
          {pending ? <CancelCase key={e.rowVersion} d={d} /> : <Notice>This case is resolved: {resolutionLabel(e.resolutionStatus)}.</Notice>}
        </SectionCard>
      </div>
    </>
  );
}
