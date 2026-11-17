import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircleIcon, CircleIcon, CircleNotchIcon, MinusCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/api/errors";
import { moderationService } from "@/services/moderation.service";
import { cn } from "@/lib/utils/cn";
import { listingKeys } from "./queries";
import { errorHint } from "./shared";

/**
 * Fast approval / publication for many listings. The backend has no bulk endpoint, so each listing goes through the
 * same single-listing calls the review page uses, one at a time: read the version (fresh rowVersion + status),
 * then decide / publish. Every server rule still applies per listing (inspection policy, publication gates,
 * concurrency); a listing that changed or fails is reported and skipped, the rest continue.
 */
export interface BulkTarget {
  listingId: string;
  versionId: string;
  title: string;
  requiresPhysicalInspection: boolean;
}

type Mode = "approve" | "publish";
type RowState = { status: "waiting" | "running" | "done" | "skipped" | "failed"; text?: string };

async function approveOne(t: BulkTarget, alsoPublish: boolean): Promise<RowState> {
  const detail = await moderationService.detail(t.listingId, t.versionId);
  const c = detail.candidateVersion;
  if (c.versionStatus !== "UNDER_REVIEW") return { status: "skipped", text: `No longer under review (${c.versionStatus.toLowerCase().replace(/_/g, " ")}).` };
  // Same body as "Approve" with the default inspection policy on the review page: no override, no waiver.
  const r = await moderationService.decide(t.listingId, t.versionId, {
    decision: "APPROVE",
    reasonCode: null,
    sellerNotes: null,
    internalNotes: null,
    requiresInspectionOverride: null,
    expectedRowVersion: c.listingRowVersion,
  });
  if (r.versionStatus === "INSPECTION_REQUIRED") return { status: "done", text: `Approved, sent for inspection${r.inspectionNo ? ` (${r.inspectionNo})` : ""}.` };
  if (r.versionStatus !== "APPROVED" || !alsoPublish) return { status: "done", text: "Approved, ready to publish." };
  const elig = await moderationService.eligibility(t.listingId, t.versionId);
  if (!elig.isEligible) return { status: "done", text: `Approved, not published: ${elig.blockers[0] ?? "a publication check failed"}.` };
  await moderationService.publish(t.listingId, t.versionId, r.rowVersion);
  return { status: "done", text: "Approved and published." };
}

async function publishOne(t: BulkTarget): Promise<RowState> {
  const detail = await moderationService.detail(t.listingId, t.versionId);
  const c = detail.candidateVersion;
  if (c.versionStatus !== "APPROVED") return { status: "skipped", text: `Not ready to publish (${c.versionStatus.toLowerCase().replace(/_/g, " ")}).` };
  const elig = await moderationService.eligibility(t.listingId, t.versionId);
  if (!elig.isEligible) return { status: "skipped", text: elig.blockers[0] ?? "A publication check failed." };
  await moderationService.publish(t.listingId, t.versionId, c.listingRowVersion);
  return { status: "done", text: "Published." };
}

export function BulkModerationDialog({
  mode,
  targets,
  open,
  onOpenChange,
  canPublish,
  onFinished,
}: {
  mode: Mode;
  targets: BulkTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** catalog:listings:publish — offered as "also publish" after approval. */
  canPublish: boolean;
  onFinished: () => void;
}) {
  const qc = useQueryClient();
  const [alsoPublish, setAlsoPublish] = React.useState(canPublish);
  const [rows, setRows] = React.useState<Record<string, RowState>>({});
  const [phase, setPhase] = React.useState<"confirm" | "running" | "finished">("confirm");
  const stop = React.useRef(false);
  // The selection behind `targets` is cleared when the run ends; keep the list this dialog was opened with.
  const [list, setList] = React.useState<BulkTarget[]>(targets);

  React.useEffect(() => {
    if (!open) return;
    setList(targets);
    setRows({});
    setPhase("confirm");
    setAlsoPublish(canPublish);
    stop.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot only when the dialog opens
  }, [open, canPublish]);

  const inspection = list.filter((t) => t.requiresPhysicalInspection).length;

  const run = async () => {
    setPhase("running");
    stop.current = false;
    for (const t of list) {
      if (stop.current) {
        setRows((r) => ({ ...r, [t.versionId]: { status: "skipped", text: "Stopped before this one." } }));
        continue;
      }
      setRows((r) => ({ ...r, [t.versionId]: { status: "running" } }));
      let result: RowState;
      try {
        result = mode === "approve" ? await approveOne(t, alsoPublish && canPublish) : await publishOne(t);
      } catch (e) {
        result = { status: "failed", text: errorHint(e) ?? getErrorMessage(e) };
      }
      setRows((r) => ({ ...r, [t.versionId]: result }));
    }
    await qc.invalidateQueries({ queryKey: listingKeys.all });
    await qc.invalidateQueries({ queryKey: ["inspections"] });
    setPhase("finished");
    onFinished();
  };

  const done = Object.values(rows).filter((r) => r.status === "done").length;
  const failed = Object.values(rows).filter((r) => r.status === "failed").length;
  const skipped = Object.values(rows).filter((r) => r.status === "skipped").length;
  const verb = mode === "approve" ? "Approve" : "Publish";

  return (
    <Dialog open={open} onOpenChange={(o) => phase !== "running" && onOpenChange(o)}>
      <DialogContent
        size="lg"
        title={`${verb} ${list.length} listing${list.length === 1 ? "" : "s"}`}
        description={
          mode === "approve"
            ? "Each listing is approved with the normal inspection policy, one at a time. Listings in categories that need inspection are sent for inspection, not published."
            : "Each listing is checked against the publication gates and published, one at a time. Listings that fail a check are skipped and listed below."
        }
        footer={
          phase === "confirm" ? (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void run()} disabled={!list.length}>
                {verb} {list.length}
              </Button>
            </>
          ) : phase === "running" ? (
            <Button variant="secondary" onClick={() => (stop.current = true)}>
              Stop after the current listing
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )
        }
      >
        {phase === "confirm" && (
          <div className="space-y-3 text-sm">
            {mode === "approve" && inspection > 0 && (
              <p className="rounded-sm border border-border bg-surface-muted p-3">
                {inspection} of these {inspection === 1 ? "is in a category that needs" : "are in categories that need"} a physical inspection. {inspection === 1 ? "It" : "They"} will be sent for inspection. To waive an inspection, open the listing and decide it on its own.
              </p>
            )}
            {mode === "approve" && canPublish && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 size-4" checked={alsoPublish} onChange={(e) => setAlsoPublish(e.target.checked)} />
                <span>Also publish each listing that's approved without inspection (it must still pass the publication checks).</span>
              </label>
            )}
          </div>
        )}

        {phase !== "confirm" && (
          <p className="mb-3 text-sm text-foreground" role="status" aria-live="polite">
            {phase === "running" ? `Working… ${done + failed + skipped} of ${list.length}` : `Finished: ${done} done${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} failed` : ""}.`}
          </p>
        )}

        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-sm border border-border text-sm" aria-label="Listings">
          {list.map((t) => {
            const r = rows[t.versionId] ?? { status: "waiting" };
            const Icon = r.status === "running" ? CircleNotchIcon : r.status === "done" ? CheckCircleIcon : r.status === "failed" ? WarningCircleIcon : r.status === "skipped" ? MinusCircleIcon : CircleIcon;
            return (
              <li key={t.versionId} className="flex items-start gap-2 px-3 py-2">
                <Icon
                  weight={r.status === "done" || r.status === "failed" ? "fill" : "regular"}
                  className={cn("mt-0.5 size-4 shrink-0", r.status === "running" && "animate-spin", r.status === "done" && "text-success", r.status === "failed" && "text-danger", (r.status === "waiting" || r.status === "skipped") && "text-muted-foreground")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{t.title || "Untitled listing"}</span>
                  {r.text && <span className={cn("block text-xs", r.status === "failed" ? "text-danger" : "text-muted-foreground")}>{r.text}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
