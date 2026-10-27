import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilSimpleIcon, SealCheckIcon } from "@phosphor-icons/react";
import { PageHeader, DetailList } from "@/components/common/page-header";
import { RefreshButton, SectionCard, Toolbar } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox, Skeleton, Switch } from "@/components/ui/misc";
import { FormError, FormField } from "@/components/forms/form-field";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { organizationsService } from "@/services/organizations.service";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type { CalendarConfigurationDto, PublicHolidayDto } from "@/api/types/organizations";
import { ApiErrorNotice } from "@/features/listings/shared";
import { formatGst, orgAdminErrorMessage } from "./shared";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekendText = (s: string) =>
  s
    .split(",")
    .map((d) => DAYS[Number(d.trim())])
    .filter(Boolean)
    .join(" & ") || "—";
const keys = { config: ["calendar", "config"] as const, holidays: (y: number) => ["calendar", "holidays", y] as const };
const dateOnly = (v: string) => v.slice(0, 10);

/**
 * PA-1B.2 UAE business calendar: weekend days, approved coverage and public holidays used to calculate business-change
 * deadlines. Provisional (e.g. Eid) dates are confirmed only with official evidence — nothing is hard-coded here.
 */
function CalendarContent() {
  const { can } = useAccess();
  const config = useQuery({ queryKey: keys.config, queryFn: ({ signal }) => organizationsService.calendarConfig(signal) });
  const [year, setYear] = React.useState(() => new Date().getFullYear());
  const holidays = useQuery({ queryKey: keys.holidays(year), queryFn: ({ signal }) => organizationsService.holidays(year, signal) });
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState<PublicHolidayDto | null>(null);
  const c = config.data;
  const years = c ? Array.from({ length: Math.max(1, c.maxSupportedYear - 2025) }, (_, i) => 2026 + i) : [year];

  const columns = React.useMemo<ColumnDef<PublicHolidayDto>[]>(
    () => [
      { id: "date", header: "Date", accessorFn: (h) => h.holidayDate, cell: ({ getValue }) => formatGst(getValue() as string, false) },
      { id: "name", header: "Holiday", accessorFn: (h) => h.holidayName },
      { id: "status", header: "Status", accessorFn: (h) => h.approvalStatus, cell: ({ getValue }) => <StatusBadge value={String(getValue())} /> },
      {
        id: "source",
        header: "Source",
        accessorFn: (h) => h.sourceAuthority || h.sourceReference || "",
        cell: ({ row: { original: h } }) => (
          <span className="text-xs text-muted-foreground">{[h.sourceAuthority, h.publicationReferenceNumber].filter(Boolean).join(" · ") || h.sourceReference || "—"}</span>
        ),
      },
      ...(can(P.CALENDAR_HOLIDAYS_CONFIRM)
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              cell: ({ row: { original: h } }: { row: { original: PublicHolidayDto } }) =>
                h.isOfficiallyConfirmed ? null : (
                  <Button size="sm" variant="secondary" onClick={() => setConfirming(h)}>
                    <SealCheckIcon /> Confirm
                  </Button>
                ),
            } satisfies ColumnDef<PublicHolidayDto>,
          ]
        : []),
    ],
    [can],
  );

  return (
    <>
      <PageHeader title="UAE business calendar" description="Weekends and public holidays used to calculate the 4-business-day deadline for reporting business changes." />
      <div className="space-y-4">
        <SectionCard>
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="font-heading text-lg font-bold text-foreground">Configuration</h2>
            {c && can(P.CALENDAR_MANAGE) && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <PencilSimpleIcon /> Edit
              </Button>
            )}
          </div>
          {config.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : config.error || !c ? (
            <ApiErrorNotice error={config.error} />
          ) : (
            <DetailList
              columns={3}
              items={[
                { label: "Calendar", value: `${c.calendarName} (${c.calendarCode})` },
                { label: "Weekend", value: weekendText(c.weekendDays) },
                { label: "Active", value: c.isActive ? "Yes" : "No" },
                { label: "Approved through", value: String(c.maxApprovedYear) },
                { label: "Supported through", value: String(c.maxSupportedYear) },
                { label: "Last updated", value: formatGst(c.updatedAtUtc) },
              ]}
            />
          )}
        </SectionCard>
        <SectionCard>
          <Toolbar
            left={
              <NativeSelect aria-label="Year" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="w-32">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </NativeSelect>
            }
            right={<RefreshButton onClick={() => void holidays.refetch()} spinning={holidays.isFetching} />}
          />
          {holidays.error ? (
            <ApiErrorNotice error={holidays.error} />
          ) : (
            <DataTable
              caption={`Public holidays ${year}`}
              columns={columns}
              data={holidays.data ?? []}
              isLoading={holidays.isLoading}
              getRowId={(h) => h.publicHolidayId}
              emptyTitle={`No holidays for ${year}`}
            />
          )}
          <p className="mt-3 text-xs text-muted-foreground">Provisional dates (e.g. Eid) count as holidays only after they're confirmed with the official publication.</p>
        </SectionCard>
      </div>
      {c && <ConfigDialog config={c} open={editing} onOpenChange={setEditing} />}
      <ConfirmHolidayDialog holiday={confirming} onClose={() => setConfirming(null)} />
    </>
  );
}

function ConfigDialog({ config, open, onOpenChange }: { config: CalendarConfigurationDto; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [weekend, setWeekend] = React.useState<number[]>([]);
  const [approved, setApproved] = React.useState(config.maxApprovedYear);
  const [active, setActive] = React.useState(config.isActive);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setWeekend(config.weekendDays.split(",").map((d) => Number(d.trim())).filter((n) => n >= 0 && n <= 6));
    setApproved(config.maxApprovedYear);
    setActive(config.isActive);
    setReason("");
    setError(null);
  }, [open, config]);
  const save = useApiMutation({
    toastOnError: false,
    mutationFn: () => organizationsService.updateCalendarConfig({ weekendDays: weekend.join(","), maxApprovedYear: approved, isActive: active, changeReason: reason.trim() }),
    successMessage: "Calendar updated.",
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      onOpenChange(false);
    },
  });
  const submit = () => {
    setError(null);
    if (!weekend.length) return setError("Choose at least one weekend day.");
    if (reason.trim().length < 5) return setError("Give a reason for the change (at least 5 characters).");
    save.mutate(undefined, { onError: (e) => setError(orgAdminErrorMessage(e)) });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent
        title="Edit calendar"
        description="Changes are audited and affect every new business-change deadline."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />
          <fieldset>
            <legend className="mb-2 text-sm text-body">Weekend days</legend>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d, i) => (
                <label key={d} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={weekend.includes(i)} onCheckedChange={(v) => setWeekend((w) => (v === true ? [...w, i].sort() : w.filter((x) => x !== i)))} />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <FormField label="Holidays approved through (year)" htmlFor="cal-approved" hint={`Up to ${config.maxSupportedYear}. Deadlines past this year are refused until approved.`}>
            <Input id="cal-approved" type="number" min={2026} max={config.maxSupportedYear} value={approved} onChange={(e) => setApproved(Number(e.target.value))} />
          </FormField>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="cal-active" className="text-sm text-foreground">
              Calendar active
            </label>
            <Switch id="cal-active" checked={active} onCheckedChange={(v) => setActive(v === true)} />
          </div>
          <FormField label="Reason" htmlFor="cal-reason" required>
            <Textarea id="cal-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PLACEHOLDER_HOSTS = /(^|\.)(example\.com|test\.com|placeholder\.com|localhost)$/i;

function ConfirmHolidayDialog({ holiday: h, onClose }: { holiday: PublicHolidayDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const empty = { sourceAuthority: "", sourceDocumentTitle: "", publicationReferenceNumber: "", publicationDate: "", officialPublicationUrl: "", verificationRemarks: "" };
  const [f, setF] = React.useState(empty);
  const [attest, setAttest] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setF(empty);
    setAttest(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when a different holiday opens
  }, [h]);
  const confirm = useApiMutation({
    toastOnError: false,
    mutationFn: () =>
      organizationsService.confirmHoliday(h!.publicHolidayId, {
        sourceAuthority: f.sourceAuthority.trim(),
        sourceDocumentTitle: f.sourceDocumentTitle.trim(),
        publicationReferenceNumber: f.publicationReferenceNumber.trim(),
        publicationDate: f.publicationDate,
        verificationRemarks: f.verificationRemarks.trim(),
        attestationConfirmed: true,
        officialPublicationUrl: f.officialPublicationUrl.trim() || null,
        evidenceMediaAssetId: null,
      }),
    successMessage: "Holiday confirmed.",
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar", "holidays"] });
      onClose();
    },
  });
  const submit = () => {
    setError(null);
    if (f.sourceAuthority.trim().length < 3) return setError("Enter the issuing authority, e.g. UAE Cabinet or FAHR.");
    if (f.sourceDocumentTitle.trim().length < 5) return setError("Enter the title of the official decree or announcement.");
    if (f.publicationReferenceNumber.trim().length < 3) return setError("Enter the official reference or gazette number.");
    if (!f.publicationDate || f.publicationDate > new Date().toISOString().slice(0, 10)) return setError("Enter the publication date (not in the future).");
    if (f.verificationRemarks.trim().length < 10) return setError("Describe how you verified it (at least 10 characters).");
    if (f.officialPublicationUrl.trim()) {
      try {
        const u = new URL(f.officialPublicationUrl.trim());
        if (!/^https?:$/.test(u.protocol) || PLACEHOLDER_HOSTS.test(u.hostname)) return setError("Enter the real official publication URL.");
      } catch {
        return setError("Enter a valid URL starting with https://.");
      }
    }
    if (!attest) return setError("Tick the attestation to confirm you verified the official source.");
    confirm.mutate(undefined, { onError: (e) => setError(orgAdminErrorMessage(e)) });
  };
  const field = (k: keyof typeof empty, label: string, type = "text", hint?: string) => (
    <FormField label={label} htmlFor={`hol-${k}`} required={k !== "officialPublicationUrl"} hint={hint}>
      {k === "verificationRemarks" ? (
        <Textarea id={`hol-${k}`} rows={2} maxLength={1000} value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} />
      ) : (
        <Input id={`hol-${k}`} type={type} max={type === "date" ? new Date().toISOString().slice(0, 10) : undefined} value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} />
      )}
    </FormField>
  );
  return (
    <Dialog open={!!h} onOpenChange={(o) => !o && !confirm.isPending && onClose()}>
      {h && (
        <DialogContent
          size="lg"
          title={`Confirm ${h.holidayName}`}
          description={`${dateOnly(h.holidayDate)} · Record the official publication that confirms this date.`}
          footer={
            <>
              <Button variant="secondary" onClick={onClose} disabled={confirm.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} loading={confirm.isPending}>
                <SealCheckIcon /> Confirm holiday
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <FormError message={error} />
            <div className="grid gap-4 sm:grid-cols-2">
              {field("sourceAuthority", "Issuing authority", "text", "e.g. UAE Cabinet, FAHR, MOHRE")}
              {field("publicationReferenceNumber", "Reference / gazette no.")}
              {field("sourceDocumentTitle", "Decree or announcement title")}
              {field("publicationDate", "Publication date", "date")}
            </div>
            {field("officialPublicationUrl", "Official publication URL", "url")}
            {field("verificationRemarks", "How you verified it")}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
              <Checkbox className="mt-0.5" checked={attest} onCheckedChange={(v) => setAttest(v === true)} />I confirm I checked this date against the official publication above.
            </label>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export default function CalendarPage() {
  return (
    <RequirePermission permission={P.CALENDAR_VIEW}>
      <CalendarContent />
    </RequirePermission>
  );
}
