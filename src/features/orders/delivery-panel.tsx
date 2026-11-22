import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircleIcon, TruckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/forms/form-field";
import { isApiError } from "@/lib/api/errors";
import type { FulfillmentTarget } from "@/api/types/admin-delivery";
import type { AdminSubOrderDto } from "@/api/types/admin-orders";
import { adminDeliveryKeys, adminDeliveryService } from "@/services/admin-delivery.service";
import { adminOrderKeys } from "@/services/admin-orders.service";
import { fmtUtc } from "@/features/listings/shared";

const norm = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const is = (v: string | null | undefined, name: string) => norm(v) === norm(name);

const MESSAGES: Record<string, string> = {
  CONCURRENCY_CONFLICT: "This part of the order changed since the page loaded. It has been reloaded; check it and try again.",
  INVALID_SUB_ORDER_STATE: "Delivery can be updated only after the seller confirms, and not after the order is finished or cancelled.",
  INVALID_STATUS: "That delivery step isn't accepted for this order.",
  INVALID_ROW_VERSION: "This order needs reloading. It has been refreshed; try again.",
  INVALID_EVIDENCE: "Enter the proof reference (for example the delivery note or waybill number).",
  FORBIDDEN: "Updating deliveries needs Platform Admin authority.",
  LIFECYCLE_ERROR: "The delivery update was refused. Reload the order and check its current step.",
};
const message = (e: unknown) => (isApiError(e) && e.code && MESSAGES[e.code]) || (isApiError(e) ? e.message : "Something went wrong.");

const STEP: Record<FulfillmentTarget, { label: string; text: string; proof: "required" | "optional" }> = {
  PREPARING: { label: "Mark preparing", text: "The seller is getting the goods ready for collection by the freight team.", proof: "optional" },
  IN_TRANSIT: { label: "Mark in transit", text: "The freight has collected the goods and is on the way to the buyer's site.", proof: "optional" },
  DELIVERED: { label: "Mark delivered", text: "The goods reached the buyer's site. The buyer's 5-day window to accept or report a problem starts now.", proof: "required" },
};

/** Freight steps StockOut records (PREPARING → IN_TRANSIT → DELIVERED); the server validates every transition. */
export function nextDeliverySteps(so: Pick<AdminSubOrderDto, "status" | "fulfillmentStatus" | "fulfillmentMethod">): FulfillmentTarget[] {
  if (!(is(so.status, "CONFIRMED") || is(so.status, "IN_FULFILLMENT"))) return [];
  // Collection orders (older, before freight-only) are not moved by StockOut freight.
  if (["BUYER_PICKUP", "SELF_COLLECTION", "PICKUP"].some((m) => is(so.fulfillmentMethod, m))) return [];
  const f = so.fulfillmentStatus;
  if (!f || is(f, "NOT_STARTED")) return ["PREPARING", "IN_TRANSIT"];
  if (is(f, "PREPARING")) return ["IN_TRANSIT"];
  if (is(f, "IN_TRANSIT")) return ["DELIVERED"];
  return [];
}

/**
 * StockOut operations: move a seller's part of an order along the freight steps, with a proof reference (recorded by
 * the server as verified delivery proof) and remarks. Sends the sub-order rowVersion; a conflict reloads the order.
 */
export function DeliveryUpdate({ orderId, so }: { orderId: string; so: AdminSubOrderDto }) {
  const qc = useQueryClient();
  const steps = nextDeliverySteps(so);
  const [target, setTarget] = React.useState<FulfillmentTarget | null>(null);
  const [proof, setProof] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  if (!steps.length) return null;
  const step = target ? STEP[target] : null;
  const needsProof = step?.proof === "required";
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: adminOrderKeys.detail(orderId) }),
      qc.invalidateQueries({ queryKey: adminOrderKeys.timeline(orderId) }),
      qc.invalidateQueries({ queryKey: adminDeliveryKeys.evidence(so.subOrderId) }),
    ]);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeliveryService.updateFulfillment(so.subOrderId, { status: target, proofReference: proof.trim() || null, remarks: remarks.trim() || null, expectedRowVersion: so.rowVersion, timestampUtc: null });
      setDone(`${STEP[target].label.replace("Mark ", "Marked ")}.`);
      setTarget(null);
      setProof("");
      setRemarks("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
      <TruckIcon className="size-4 text-muted-foreground" aria-hidden />
      <span className="mr-auto text-sm text-muted-foreground">Freight by StockOut</span>
      {done && (
        <span className="flex items-center gap-1 text-sm text-success" role="status">
          <CheckCircleIcon weight="fill" className="size-4" aria-hidden /> {done}
        </span>
      )}
      {steps.map((s) => (
        <Button key={s} size="sm" variant={s === steps.at(-1) ? "primary" : "secondary"} onClick={() => (setError(null), setDone(null), setTarget(s))}>
          {STEP[s].label}
        </Button>
      ))}
      <Dialog open={!!target} onOpenChange={(o) => !busy && !o && setTarget(null)}>
        {step && (
          <DialogContent
            title={`${step.label}: ${so.subOrderNumber}`}
            description={step.text}
            footer={
              <>
                <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={() => void submit()} loading={busy} disabled={needsProof && !proof.trim()}>
                  {step.label}
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              {error && (
                <p role="alert" className="rounded-sm bg-danger-soft p-3 text-sm text-danger-soft-foreground">
                  {error}
                </p>
              )}
              <FormField label="Proof reference" htmlFor="dl-proof" required={needsProof} hint="Delivery note, waybill or POD number. Saved as verified delivery proof.">
                <Input id="dl-proof" value={proof} maxLength={200} onChange={(e) => setProof(e.target.value)} />
              </FormField>
              <FormField label="Remarks" htmlFor="dl-remarks" hint="Staff only.">
                <Textarea id="dl-remarks" rows={2} value={remarks} maxLength={1000} onChange={(e) => setRemarks(e.target.value)} />
              </FormField>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** Delivery proof recorded for a seller's part, and adding a proof reference after the fact. */
export function DeliveryProof({ so }: { so: AdminSubOrderDto }) {
  const qc = useQueryClient();
  const show = !(is(so.status, "PENDING_CONFIRMATION") || is(so.status, "REJECTED") || is(so.status, "CANCELLED"));
  const q = useQuery({ queryKey: adminDeliveryKeys.evidence(so.subOrderId), queryFn: ({ signal }) => adminDeliveryService.evidence(so.subOrderId, signal), enabled: show, retry: false });
  const [ref, setRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!show) return null;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminDeliveryService.recordEvidence(so.subOrderId, { evidenceType: "STOCKOUT_DELIVERY_PROOF", fileAssetId: null, documentReference: ref.trim(), notes: notes.trim() || null });
      setRef("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: adminDeliveryKeys.evidence(so.subOrderId) });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const items = q.data ?? [];
  return (
    <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">Delivery proof</p>
      {q.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-danger">{message(q.error)}</p>
      ) : items.length ? (
        <ul className="space-y-1" aria-label={`Delivery proof for ${so.subOrderNumber}`}>
          {items.map((e) => (
            <li key={e.evidenceId} className="flex flex-wrap gap-x-2">
              <span className="font-mono text-xs">{e.documentReference}</span>
              <span className="text-xs text-muted-foreground">
                {e.evidenceType.replace(/_/g, " ").toLowerCase()} · {e.verificationStatus.toLowerCase()} · {fmtUtc(e.recordedAtUtc)}
              </span>
              {e.notes && <span className="w-full text-xs text-muted-foreground">{e.notes}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No proof recorded yet.</p>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (ref.trim()) void add();
        }}
      >
        <Input aria-label="New proof reference" placeholder="Proof reference (POD, waybill)" value={ref} maxLength={200} onChange={(e) => setRef(e.target.value)} />
        <Input aria-label="Proof notes" placeholder="Notes (optional)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        <Button type="submit" variant="secondary" size="sm" loading={busy} disabled={!ref.trim()}>
          Add proof
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
