import * as React from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { FormError } from "@/components/forms/form-field";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { getErrorMessage } from "@/lib/api/errors";
import { platformService } from "@/services/platform.service";
import type { BatchInvitePlatformUsersResponseData } from "@/api/types/user-organization";
import { teamKeys, useAssignableRolesQuery } from "./queries";
import { RoleChips } from "./role-picker";
import { BATCH_ITEM_ERRORS } from "./errors";
import { formatUtcDateTime } from "./utc";

const MAX_ROWS = 100;

const schema = z
  .object({
    invitations: z
      .array(
        z.object({
          email: z.string().trim().min(1, "Email is required.").pipe(z.email("Enter a valid email address.")),
          roleCodes: z.array(z.string()).min(1, "Select at least one role."),
        }),
      )
      .min(1, "Add at least one invitation.")
      .max(MAX_ROWS, `A batch can contain at most ${MAX_ROWS} invitations.`),
  })
  .superRefine((v, ctx) => {
    const seen = new Map<string, number>();
    v.invitations.forEach((row, i) => {
      const key = row.email.trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["invitations", i, "email"], message: "This email is already in the batch." });
      else seen.set(key, i);
    });
  });
type Values = z.infer<typeof schema>;

const EMAIL_SPLIT = /[\s,;]+/;

/** POST /platform/users/invitations/batch (1–100 items). Per-item failures are reported in the results. */
export function BatchInviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const roles = useAssignableRolesQuery(open);
  const [paste, setPaste] = React.useState("");
  const [pasteRoles, setPasteRoles] = React.useState<string[]>([]);
  const [result, setResult] = React.useState<BatchInvitePlatformUsersResponseData | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { invitations: [] } });
  const rows = useFieldArray({ control: form.control, name: "invitations" });

  React.useEffect(() => {
    if (open) {
      form.reset({ invitations: [] });
      setPaste("");
      setPasteRoles([]);
      setResult(null);
      setFormError(null);
    }
  }, [open, form]);

  const batch = useApiMutation({
    mutationFn: (v: Values) => platformService.inviteBatch({ invitations: v.invitations.map((r) => ({ email: r.email, roleCodes: r.roleCodes })) }),
    invalidate: [teamKeys.invitationsAll],
    toastOnError: false,
    successMessage: (d) => `${d.created} of ${d.total} invitations created${d.failed ? `, ${d.failed} failed` : ""}.`,
    onSuccess: (d) => setResult(d),
  });

  const addPasted = () => {
    const existing = new Set(form.getValues("invitations").map((r) => r.email.trim().toLowerCase()));
    const emails = paste
      .split(EMAIL_SPLIT)
      .map((e) => e.trim())
      .filter((e) => e && !existing.has(e.toLowerCase()) && (existing.add(e.toLowerCase()), true));
    const room = MAX_ROWS - rows.fields.length;
    rows.append(emails.slice(0, room).map((email) => ({ email, roleCodes: [...pasteRoles] })));
    setPaste(emails.length > room ? emails.slice(room).join("\n") : "");
    if (emails.length > room) setFormError(`Only ${MAX_ROWS} invitations fit in one batch; the remaining emails were left in the paste box.`);
  };

  const keepFailed = () => {
    if (!result) return;
    const failedEmails = new Set(result.results.filter((r) => !r.success).map((r) => r.email.trim().toLowerCase()));
    const kept = form.getValues("invitations").filter((r) => failedEmails.has(r.email.trim().toLowerCase()));
    form.reset({ invitations: kept });
    setResult(null);
  };

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    batch.mutate(values, { onError: (e) => setFormError(getErrorMessage(e)) });
  });

  const rowErrors = form.formState.errors.invitations;

  return (
    <Dialog open={open} onOpenChange={(o) => !batch.isPending && onOpenChange(o)}>
      <DialogContent
        size="xl"
        title={result ? "Batch invitation results" : "Batch invite users"}
        description={result ? `${result.created} created · ${result.failed} failed · ${result.total} total` : `Invite up to ${MAX_ROWS} people at once. Each row needs an email and at least one role.`}
        footer={
          result ? (
            <>
              {result.failed > 0 && (
                <Button variant="secondary" onClick={keepFailed}>
                  Edit failed rows
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={batch.isPending}>
                Cancel
              </Button>
              <Button type="submit" form="batch-invite-form" loading={batch.isPending} disabled={!rows.fields.length}>
                Send {rows.fields.length || ""} invitation{rows.fields.length === 1 ? "" : "s"}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">Batch invitation results</caption>
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className="h-10 px-4 text-left font-medium">Email</th>
                  <th scope="col" className="h-10 px-4 text-left font-medium">Result</th>
                  <th scope="col" className="h-10 px-4 text-left font-medium">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.results.map((r, i) => (
                  <tr key={`${r.email}-${i}`}>
                    <td className="px-4 py-2.5">{r.email}</td>
                    <td className="px-4 py-2.5">
                      {r.success ? (
                        <Badge tone="success" dot>
                          Invited
                        </Badge>
                      ) : (
                        <Badge tone="danger" dot>
                          {r.error ? BATCH_ITEM_ERRORS[r.error] ?? r.error : "Failed"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.success ? formatUtcDateTime(r.expiresAtUtc) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : roles.isLoading ? (
          <TableSkeleton rows={4} columns={3} />
        ) : roles.error ? (
          <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
        ) : (
          <form id="batch-invite-form" onSubmit={onSubmit} noValidate className="space-y-5">
            <FormError message={formError ?? (typeof rowErrors?.message === "string" ? rowErrors.message : rowErrors?.root?.message)} />
            <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
              <div className="space-y-1.5">
                <Label htmlFor="batch-paste">Paste emails</Label>
                <Textarea id="batch-paste" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="one@company.com, two@company.com" aria-describedby="batch-paste-hint" />
                <p id="batch-paste-hint" className="text-xs text-muted-foreground">
                  Separate with commas, spaces or new lines. Duplicates are skipped.
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm text-body">Roles for pasted emails</p>
                <RoleChips roles={roles.data ?? []} value={pasteRoles} onChange={setPasteRoles} label="Roles for pasted emails" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={addPasted} disabled={!paste.trim() || rows.fields.length >= MAX_ROWS}>
                  Add to list
                </Button>
                <Button variant="ghost" size="sm" onClick={() => rows.append({ email: "", roleCodes: [...pasteRoles] })} disabled={rows.fields.length >= MAX_ROWS}>
                  <PlusIcon /> Add empty row
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                {rows.fields.length} / {MAX_ROWS} rows
              </p>
              {rows.fields.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No invitations yet. Paste emails above or add a row.</p>
              ) : (
                <ol className="space-y-2">
                  {rows.fields.map((field, index) => {
                    const err = rowErrors?.[index];
                    return (
                      <li key={field.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start">
                        <div className="sm:w-72">
                          <Label htmlFor={`batch-email-${index}`} className="sr-only">
                            Email {index + 1}
                          </Label>
                          <Input
                            id={`batch-email-${index}`}
                            type="email"
                            placeholder="name@company.com"
                            aria-invalid={err?.email ? true : undefined}
                            aria-describedby={err?.email ? `batch-email-${index}-error` : undefined}
                            {...form.register(`invitations.${index}.email`)}
                          />
                          {err?.email && (
                            <p id={`batch-email-${index}-error`} role="alert" className="mt-1 text-xs text-danger-soft-foreground">
                              {err.email.message}
                            </p>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Controller
                            control={form.control}
                            name={`invitations.${index}.roleCodes`}
                            render={({ field: f }) => <RoleChips roles={roles.data ?? []} value={f.value} onChange={f.onChange} label={`Roles for row ${index + 1}`} />}
                          />
                          {err?.roleCodes && (
                            <p role="alert" className="mt-1 text-xs text-danger-soft-foreground">
                              {err.roleCodes.message}
                            </p>
                          )}
                        </div>
                        <Button variant="danger-ghost" size="icon-sm" aria-label={`Remove row ${index + 1}`} onClick={() => rows.remove(index)}>
                          <TrashIcon />
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
