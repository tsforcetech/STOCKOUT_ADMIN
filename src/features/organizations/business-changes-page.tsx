import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { PageHeader, DetailList } from "@/components/common/page-header";
import { RefreshButton, SectionCard, Toolbar } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Badge, Checkbox } from "@/components/ui/misc";
import { FormError, FormField } from "@/components/forms/form-field";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { humanize } from "@/lib/utils/format";
import { organizationsService } from "@/services/organizations.service";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { SENSITIVE_CHANGE_CATEGORIES, type BusinessChangeRequestResponse } from "@/api/types/organizations";
import { ApiErrorNotice } from "@/features/listings/shared";
import { CATEGORY_LABELS, categoryLabel, formatGst, orgAdminErrorMessage } from "./shared";

const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "DRAFT"];
const keys = { list: (q: object) => ["organizations", "business-changes", q] as const };

/** PA-1B.2 admin review queue for material business changes (organizations.business_changes.*). */
function BusinessChangesContent() {
  const [status, setStatus] = React.useState("SUBMITTED");
  const [category, setCategory] = React.useState("");
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const q = { status, changeCategory: category, overdueOnly };
  const list = useQuery({ queryKey: keys.list(q), queryFn: ({ signal }) => organizationsService.businessChanges({ ...q, pageNumber: 1, pageSize: 100 }, signal) });
  const [open, setOpen] = React.useState<BusinessChangeRequestResponse | null>(null);

  const columns = React.useMemo<ColumnDef<BusinessChangeRequestResponse>[]>(
    () => [
      {
        id: "company",
        header: "Company",
        accessorFn: (r) => r.organizationLegalName || r.organizationName,
        cell: ({ row: { original: r } }) => (
          <div className="min-w-0">
            <p className="font-medium text-foreground">{r.organizationLegalName || r.organizationName}</p>
            {r.organizationLegalName && r.organizationName !== r.organizationLegalName && <p className="text-xs text-muted-foreground">{r.organizationName}</p>}
          </div>
        ),
      },
      { id: "category", header: "Change", accessorFn: (r) => categoryLabel(r.changeCategory) },
      { id: "status", header: "Status", accessorFn: (r) => r.status, cell: ({ getValue }) => <StatusBadge value={String(getValue())} /> },
      { id: "effective", header: "Effective", accessorFn: (r) => r.effectiveDate, cell: ({ getValue }) => formatGst(getValue() as string, false) },
      {
        id: "deadline",
        header: "Report by",
        accessorFn: (r) => r.reportingDeadlineUtc,
        cell: ({ row: { original: r } }) => (
          <span className="inline-flex items-center gap-1.5">
            {formatGst(r.reportingDeadlineUtc)}
            {r.isOverdue && <Badge tone="danger">Overdue</Badge>}
          </span>
        ),
      },
      { id: "submitted", header: "Submitted", accessorFn: (r) => r.submittedAtUtc ?? "", cell: ({ getValue }) => formatGst((getValue() as string) || null) },
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Business changes" description="Companies' reports of changes to licence, VAT, bank, signatory, ownership or address. Deadlines use the UAE business calendar." />
      <SectionCard>
        <Toolbar
          left={
            <div className="flex flex-wrap items-center gap-2">
              <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect aria-label="Change type" value={category} onChange={(e) => setCategory(e.target.value)} className="w-56">
                <option value="">All change types</option>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
                <Checkbox checked={overdueOnly} onCheckedChange={(v) => setOverdueOnly(v === true)} /> Overdue only
              </label>
            </div>
          }
          right={<RefreshButton onClick={() => void list.refetch()} spinning={list.isFetching} />}
        />
        {list.error ? (
          <ApiErrorNotice error={list.error} />
        ) : (
          <DataTable
            caption="Business change requests"
            columns={columns}
            data={list.data?.items ?? []}
            isLoading={list.isLoading}
            getRowId={(r) => r.requestId}
            onRowClick={setOpen}
            emptyTitle="Nothing to review"
            emptyDescription="Change requests appear here once companies submit them."
          />
        )}
      </SectionCard>
      <ReviewDialog request={open} onClose={() => setOpen(null)} />
    </>
  );
}

function ReviewDialog({ request: r, onClose }: { request: BusinessChangeRequestResponse | null; onClose: () => void }) {
  const { can } = useAccess();
  const qc = useQueryClient();
  const [mode, setMode] = React.useState<"view" | "approve" | "reject">("view");
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setMode("view");
    setText("");
    setError(null);
  }, [r]);
  const reviewable = !!r && ["SUBMITTED", "UNDER_REVIEW"].includes(r.status.toUpperCase());
  const decide = useApiMutation({
    toastOnError: false,
    mutationFn: () =>
      mode === "approve"
        ? organizationsService.approveBusinessChange(r!.requestId, { reviewNotes: text.trim() || null })
        : organizationsService.rejectBusinessChange(r!.requestId, { rejectionReason: text.trim() }),
    successMessage: () => (mode === "approve" ? "Change approved and applied." : "Change rejected."),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["organizations", "business-changes"] });
      onClose();
    },
  });
  const go = () => {
    setError(null);
    if (mode === "reject" && text.trim().length < 3) return setError("Enter a reason — the company sees it.");
    decide.mutate(undefined, { onError: (e) => setError(orgAdminErrorMessage(e)) });
  };
  const values = (v: unknown) =>
    v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== "").map(([k, x]) => `${humanize(k)}: ${String(x)}`).join(" · ") || "—" : "—";
  const sensitive = !!r && SENSITIVE_CHANGE_CATEGORIES.includes(r.changeCategory.toUpperCase());
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && !decide.isPending && onClose()}>
      {r && (
        <DialogContent
          size="lg"
          title={`${categoryLabel(r.changeCategory)} · ${r.organizationLegalName || r.organizationName}`}
          description={`Submitted ${formatGst(r.submittedAtUtc)}`}
          footer={
            mode === "view" ? (
              <>
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
                {reviewable && can(P.ORG_BUSINESS_CHANGES_REJECT) && (
                  <Button variant="danger" onClick={() => setMode("reject")}>
                    <XIcon /> Reject
                  </Button>
                )}
                {reviewable && can(P.ORG_BUSINESS_CHANGES_APPROVE) && (
                  <Button onClick={() => setMode("approve")}>
                    <CheckIcon /> Approve
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setMode("view")} disabled={decide.isPending}>
                  Back
                </Button>
                <Button variant={mode === "reject" ? "danger" : "primary"} onClick={go} loading={decide.isPending}>
                  {mode === "reject" ? "Reject change" : "Approve and apply"}
                </Button>
              </>
            )
          }
        >
          <div className="space-y-5">
            <FormError message={error} />
            {sensitive && reviewable && (
              <p role="note" className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
                <WarningIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
                Approving applies the new values and sends the company back to KYC: buyer status becomes Under review and seller status Submitted until it's
                re-verified.
              </p>
            )}
            {mode === "view" ? (
              <>
                <DetailList
                  items={[
                    { label: "Status", value: <StatusBadge value={r.status} /> },
                    { label: "Effective", value: formatGst(r.effectiveDate, false) },
                    { label: "Report by", value: <span className="inline-flex items-center gap-1.5">{formatGst(r.reportingDeadlineUtc)}{r.isOverdue && <Badge tone="danger">Overdue</Badge>}</span> },
                    { label: "Reviewed", value: formatGst(r.reviewedAtUtc) },
                    { label: "Current values", value: values(r.previousValues), full: true },
                    { label: "Proposed values", value: values(r.proposedValues), full: true },
                    { label: "Reason", value: r.reason, full: true },
                    ...(r.reviewNotes ? [{ label: "Review notes", value: r.reviewNotes, full: true }] : []),
                  ]}
                />
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Evidence</h3>
                  {r.documents?.length ? (
                    <ul className="space-y-1 text-sm">
                      {r.documents.map((d) => (
                        <li key={d.documentId}>
                          {d.fileName} <span className="text-xs text-muted-foreground">· {humanize(d.documentType)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No documents attached.</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">The API doesn't provide a reviewer download link for these files yet.</p>
                </section>
              </>
            ) : (
              <FormField
                label={mode === "approve" ? "Review notes (optional)" : "Reason for rejection"}
                htmlFor="bc-text"
                required={mode === "reject"}
                hint={mode === "reject" ? "Shown to the company." : "For example how you verified the evidence."}
              >
                <Textarea id="bc-text" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
              </FormField>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export default function BusinessChangesPage() {
  return (
    <RequirePermission permission={P.ORG_BUSINESS_CHANGES_VIEW}>
      <BusinessChangesContent />
    </RequirePermission>
  );
}
