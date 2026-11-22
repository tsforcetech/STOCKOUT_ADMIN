import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircleIcon, MagnifyingGlassIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { PageHeader, DetailList } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Input, Textarea } from "@/components/ui/input";
import { ErrorState } from "@/components/feedback/states";
import { useUrlState } from "@/hooks/use-url-state";
import { isApiError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { PaymentRefundEvaluationDto } from "@/api/types/financial";
import { financialKeys, financialService } from "@/services/financial.service";
import { Notice, PanelTitle, fmtUtc, isGuid } from "@/features/listings/shared";

const MESSAGES: Record<string, string> = {
  ORDER_NOT_FOUND: "No order with that ID.",
  SUBORDER_NOT_FOUND: "No seller sub-order with that ID.",
  ORDER_EMPTY: "This order has no seller sub-orders to evaluate.",
  INVALID_REFUND_REQUEST: "Enter a refund amount greater than zero.",
  FORBIDDEN: "Finance checks need Platform Admin authority.",
};
const message = (e: unknown) => (isApiError(e) && e.code && MESSAGES[e.code]) || null;

function Gated({ gated }: { gated: boolean }) {
  return gated ? <Badge tone="neutral">Live execution off</Badge> : <Badge tone="warning">Live execution on</Badge>;
}

function Lookup({ label, value, onSubmit, placeholder }: { label: string; value: string; onSubmit: (v: string) => void; placeholder: string }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  const ok = isGuid(v);
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(v.trim().toLowerCase());
      }}
    >
      <label className="min-w-0 flex-1 space-y-1 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <Input className="font-mono text-xs" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} aria-label={label} />
      </label>
      <Button type="submit" variant="secondary" disabled={!ok}>
        <MagnifyingGlassIcon /> Check
      </Button>
    </form>
  );
}

function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const m = message(error);
  return m ? <Notice tone="warning">{m}</Notice> : <ErrorState error={error} onRetry={onRetry} />;
}

function OrderChecks({ orderId }: { orderId: string }) {
  const commission = useQuery({ queryKey: financialKeys.commission(orderId), queryFn: ({ signal }) => financialService.commission(orderId, signal), retry: false });
  const capture = useQuery({ queryKey: financialKeys.capture(orderId), queryFn: ({ signal }) => financialService.captureReadiness(orderId, signal), retry: false });
  const c = commission.data;
  const cur = c?.currency ?? "AED";
  const money = (n: number) => formatMoney(n, cur);

  return (
    <div className="space-y-4">
      <SectionCard>
        <PanelTitle title={`Commission breakdown${c ? ` · ${c.orderNumber}` : ""}`} description="What the buyer pays, what StockOut keeps and what each seller is allocated." />
        {commission.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : commission.error || !c ? (
          <Failure error={commission.error} onRetry={() => void commission.refetch()} />
        ) : (
          <>
            <DetailList
              columns={3}
              items={[
                { label: "Buyer pays", value: money(c.totalBuyerPayable) },
                { label: "Materials (excl. VAT)", value: money(c.aggregateMaterialAmount) },
                { label: "Materials VAT", value: money(c.aggregateMaterialVat) },
                { label: "Delivery", value: `${money(c.aggregateDeliveryAmount)} + VAT ${money(c.aggregateDeliveryVat)}` },
                { label: "Platform service charge", value: `${money(c.totalPlatformServiceCharge)} + VAT ${money(c.totalCommissionVat)}` },
                { label: "Platform keeps", value: money(c.totalPlatformRetainedRevenue) },
                { label: "Sellers allocated", value: money(c.totalSellerPayoutAllocation) },
                ...(c.roundingResidual ? [{ label: "Rounding residual", value: money(c.roundingResidual) }] : []),
              ]}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" aria-label="Sub-order commission">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Sub-order</th>
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                    <th className="py-2 pr-3 text-right font-medium">Seller discount</th>
                    <th className="py-2 pr-3 text-right font-medium">Service charge</th>
                    <th className="py-2 pr-3 text-right font-medium">Charge VAT</th>
                    <th className="py-2 text-right font-medium">Seller gets</th>
                  </tr>
                </thead>
                <tbody>
                  {c.subOrders.map((s) => (
                    <tr key={s.subOrderId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{s.subOrderNumber}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(s.subOrderTotal)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(s.sellerFundedDiscount)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(s.platformServiceCharge)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(s.commissionVatAmount)}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{money(s.netSellerPayoutAllocation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard>
        <PanelTitle title="Payment capture readiness" description="Whether the held card payment could be captured now." actions={capture.data ? <Gated gated={capture.data.isProviderExecutionGated} /> : undefined} />
        {capture.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : capture.error || !capture.data ? (
          <Failure error={capture.error} onRetry={() => void capture.refetch()} />
        ) : (
          <div className="space-y-2 text-sm">
            <p className={cn("flex items-center gap-2 font-medium", capture.data.canCapture ? "text-success" : "text-foreground")}>
              {capture.data.canCapture ? <CheckCircleIcon weight="fill" className="size-5" /> : <XCircleIcon weight="fill" className="size-5 text-muted-foreground" />}
              {capture.data.canCapture ? "Ready to capture" : "Not ready to capture"}
              {capture.data.requiresReconciliation && <Badge tone="warning">Needs reconciliation</Badge>}
            </p>
            <p className="text-body">{capture.data.description}</p>
            <p className="text-xs text-muted-foreground">
              Payment status {capture.data.currentPaymentStatus} · {capture.data.code} · checked {fmtUtc(capture.data.evaluatedAtUtc)}
            </p>
          </div>
        )}
      </SectionCard>

      <RefundCheck orderId={orderId} currency={cur} />
    </div>
  );
}

function RefundCheck({ orderId, currency }: { orderId: string; currency: string }) {
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<PaymentRefundEvaluationDto | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && /^\d+(\.\d{1,2})?$/.test(amount.trim());
  React.useEffect(() => {
    setResult(null);
    setError(null);
  }, [orderId]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await financialService.evaluateRefund(orderId, { orderId, requestedRefundAmount: value, reason: reason.trim(), subOrderId: null }));
    } catch (e) {
      setResult(null);
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard>
      <PanelTitle title="Refund check" description="Evaluates a refund: eligibility, whether it would be a pre-capture cancellation, and the commission that would be reversed. No refund is made." />
      <form
        className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void run();
        }}
      >
        <FormField label={`Amount (${currency})`} htmlFor="ref-amount" required>
          <Input id="ref-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </FormField>
        <FormField label="Reason" htmlFor="ref-reason">
          <Textarea id="ref-reason" rows={1} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <Button type="submit" variant="secondary" disabled={!valid} loading={busy}>
          Evaluate
        </Button>
      </form>
      {error ? <div className="mt-3">{message(error) ? <Notice tone="warning">{message(error)}</Notice> : <ErrorState error={error} onRetry={() => void run()} />}</div> : null}
      {result && (
        <div className="mt-4 space-y-2 rounded-lg border border-border p-4 text-sm" role="status">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {result.canRefund ? <CheckCircleIcon weight="fill" className="size-5 text-success" /> : <WarningCircleIcon weight="fill" className="size-5 text-warning" />}
            {result.canRefund ? `Refund possible: ${formatMoney(result.eligibleRefundAmount, currency)}` : "Refund not possible"}
            {result.isPreCaptureCancellation && <Badge tone="info">Pre-capture cancellation (void)</Badge>}
            <Gated gated={result.isProviderExecutionGated} />
          </p>
          <p className="text-body">{result.description}</p>
          <p className="text-xs text-muted-foreground">
            Commission reversed {formatMoney(result.commissionReversalAmount, currency)} + VAT {formatMoney(result.commissionVatReversalAmount, currency)} · {result.code} · checked {fmtUtc(result.evaluatedAtUtc)}
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function SettlementCheck({ subOrderId, asOf }: { subOrderId: string; asOf: string }) {
  const asOfUtc = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf}T23:59:59Z` : undefined;
  const q = useQuery({ queryKey: financialKeys.settlement(subOrderId, asOf), queryFn: ({ signal }) => financialService.settlement(subOrderId, asOfUtc, signal), retry: false });
  const s = q.data;
  return (
    <SectionCard>
      <PanelTitle title={`Seller settlement eligibility${s ? ` · ${s.subOrderNumber}` : ""}`} description="The settlement checklist for one seller sub-order. No payout is made." actions={s ? <Gated gated={s.isTransferExecutionGated} /> : undefined} />
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.error || !s ? (
        <Failure error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4 text-sm">
          <p className={cn("flex items-center gap-2 font-medium", s.isEligible ? "text-success" : "text-foreground")}>
            {s.isEligible ? <CheckCircleIcon weight="fill" className="size-5" /> : <XCircleIcon weight="fill" className="size-5 text-muted-foreground" />}
            {s.isEligible ? "Eligible for settlement" : "Not eligible yet"} <Badge tone="neutral">{s.payoutEligibilityStatus}</Badge>
          </p>
          <p className="text-body">{s.summary}</p>
          <DetailList
            columns={3}
            items={[
              { label: "Net payable to seller", value: formatMoney(s.netPayableAmount, s.settlementCurrency) },
              { label: "Commission deducted", value: formatMoney(s.deductedCommission, s.settlementCurrency) },
              { label: "Commission VAT deducted", value: formatMoney(s.deductedCommissionVat, s.settlementCurrency) },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Not met ({s.failingChecks.length})</p>
              <ul className="space-y-1" aria-label="Failing checks">
                {s.failingChecks.map((c) => (
                  <li key={c} className="flex items-start gap-2">
                    <XCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> {c}
                  </li>
                ))}
                {!s.failingChecks.length && <li className="text-muted-foreground">None</li>}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Met ({s.passingChecks.length})</p>
              <ul className="space-y-1" aria-label="Passing checks">
                {s.passingChecks.map((c) => (
                  <li key={c} className="flex items-start gap-2">
                    <CheckCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Checked {fmtUtc(s.evaluatedAtUtc)}</p>
        </div>
      )}
    </SectionCard>
  );
}

const DEFAULTS = { order: "", subOrder: "", asOf: "" };

/**
 * /payments: Platform Admin finance checks for one order or seller sub-order (commission, capture readiness, refund
 * evaluation, settlement eligibility). The backend has no order list or money-movement endpoints yet; open an order
 * ID from an escalation or a buyer report.
 */
export default function PaymentsPage() {
  const [s, set] = useUrlState(DEFAULTS);
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Payments & Payouts"
        description="Finance checks for an order or a seller's part of an order. These are evaluations only: nothing is captured, refunded or paid out from here."
      />
      <Notice className="mb-4">Live card captures, refunds and seller transfers are switched off on the platform. Results show what would happen once they're enabled.</Notice>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard>
          <Lookup label="Order ID" placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6" value={s.order} onSubmit={(order) => set({ order })} />
        </SectionCard>
        <SectionCard className="space-y-3">
          <Lookup label="Seller sub-order ID" placeholder="Sub-order ID" value={s.subOrder} onSubmit={(subOrder) => set({ subOrder })} />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">As of (optional)</span>
            <Input type="date" className="h-9 w-44" value={s.asOf} onChange={(e) => set({ asOf: e.target.value })} aria-label="Evaluate as of date" />
          </label>
        </SectionCard>
      </div>
      <div className="mt-4 space-y-4">
        {isGuid(s.order) && <OrderChecks key={s.order} orderId={s.order} />}
        {isGuid(s.subOrder) && <SettlementCheck key={`${s.subOrder}-${s.asOf}`} subOrderId={s.subOrder} asOf={s.asOf} />}
        {!isGuid(s.order) && !isGuid(s.subOrder) && <p className="text-sm text-muted-foreground">Enter an order ID or a seller sub-order ID to run the checks.</p>}
      </div>
    </>
  );
}
