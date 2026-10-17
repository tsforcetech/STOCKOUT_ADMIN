import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircleIcon, CopySimpleIcon, PencilSimpleIcon, ProhibitIcon } from "@phosphor-icons/react";
import { Dialog, DialogContent, ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { DetailList } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { IdText } from "@/components/common/copy-button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback/states";
import { useAccess } from "@/lib/auth/use-access";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { cn } from "@/lib/utils/cn";
import { humanize } from "@/lib/utils/format";
import { notificationTemplatesService } from "@/services/notification-templates.service";
import type { NotificationTemplateSummaryResponse, NotificationTemplateVersionResponse } from "@/api/types/notification-templates";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { formatUtcDateTime } from "@/features/team/utc";
import { templateKeys, useTemplateVersionsQuery } from "./queries";
import { CHANNEL_LABEL, templateErrorCode, templateErrorMessage } from "./template-rules";
import { TemplateFormDialog, type TemplateFormTarget } from "./template-form-dialog";

type Transition = { kind: "activate" | "retire"; version: NotificationTemplateVersionResponse } | null;

function ContentBlock({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (value === null || value === "") return null;
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <pre className={cn("max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-sm text-foreground", mono ? "font-mono text-xs" : "font-sans")}>{value}</pre>
    </div>
  );
}

/** Version history + lifecycle actions for one (templateCode, channel). */
export function TemplateDetailDialog({ template, onOpenChange }: { template: NotificationTemplateSummaryResponse | null; onOpenChange: (open: boolean) => void }) {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const code = template?.templateCode ?? "";
  const channel = template?.channel ?? "";
  const versions = useTemplateVersionsQuery(code, channel, template !== null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [transition, setTransition] = React.useState<Transition>(null);
  const [formTarget, setFormTarget] = React.useState<TemplateFormTarget | null>(null);

  React.useEffect(() => setSelectedId(null), [code, channel]);

  const list = React.useMemo(() => versions.data ?? [], [versions.data]);
  const selected = list.find((v) => v.versionId === selectedId) ?? list[0] ?? null;
  const draft = list.find((v) => v.status === "DRAFT");

  const refresh = () => queryClient.invalidateQueries({ queryKey: templateKeys.all });
  const onError = (e: unknown) => {
    toast.error(templateErrorMessage(e));
    const c = templateErrorCode(e);
    if (c === "TEMPLATE_VERSION_CONFLICT" || c === "TEMPLATE_INVALID_STATE" || c === "TEMPLATE_DRAFT_ALREADY_EXISTS" || c === "TEMPLATE_VERSION_NOT_FOUND") void refresh();
  };

  const newDraft = useApiMutation({
    mutationFn: () => notificationTemplatesService.createDraft(code, channel),
    invalidate: [templateKeys.all],
    toastOnError: false,
    successMessage: "New draft created from the current version.",
    onSuccess: (d) => setSelectedId(d.versionId),
  });

  const change = useApiMutation({
    mutationFn: (t: NonNullable<Transition>) =>
      t.kind === "activate"
        ? notificationTemplatesService.activate(code, channel, t.version.versionId, t.version.concurrencyVersion)
        : notificationTemplatesService.retire(code, channel, t.version.versionId, t.version.concurrencyVersion),
    invalidate: [templateKeys.all],
    toastOnError: false,
    successMessage: (_d, t) => (t.kind === "activate" ? `Version ${t.version.versionNumber} is now active.` : `Version ${t.version.versionNumber} retired. This template has no active version.`),
    onSuccess: () => setTransition(null),
  });

  const activeVersion = list.find((v) => v.status === "ACTIVE");

  return (
    <>
      <Dialog open={template !== null} onOpenChange={onOpenChange}>
        <DialogContent
          size="xl"
          title={<span className="font-mono">{code}</span>}
          description={template ? `${CHANNEL_LABEL[template.channel] ?? template.channel} · ${humanize(template.purpose)} · created ${formatUtcDateTime(template.createdAtUtc)}` : undefined}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {can(P.NOTIFICATION_TEMPLATES_CREATE) && (
              <Button
                variant="secondary"
                size="sm"
                loading={newDraft.isPending}
                disabled={Boolean(draft) || !list.length}
                title={draft ? "A draft already exists (one draft per template)." : undefined}
                onClick={() => newDraft.mutate(undefined, { onError })}
              >
                <CopySimpleIcon /> New draft version
              </Button>
            )}
            {draft && <span className="self-center text-xs text-muted-foreground">Draft v{draft.versionNumber} exists — edit or activate it.</span>}
          </div>
          {versions.isLoading ? (
            <TableSkeleton rows={4} columns={3} />
          ) : versions.error ? (
            <ErrorState error={versions.error} onRetry={() => versions.refetch()} />
          ) : !list.length ? (
            <EmptyState title="No versions" />
          ) : (
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <nav aria-label="Versions">
                <ul className="space-y-1">
                  {list.map((v) => (
                    <li key={v.versionId}>
                      <button
                        type="button"
                        aria-current={selected?.versionId === v.versionId ? "true" : undefined}
                        onClick={() => setSelectedId(v.versionId)}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          selected?.versionId === v.versionId ? "border-action-border bg-action-soft" : "border-border hover:bg-surface-muted",
                        )}
                      >
                        <span>
                          <span className="block font-medium">Version {v.versionNumber}</span>
                          <span className="block text-xs text-muted-foreground">{formatUtcDateTime(v.updatedAtUtc ?? v.createdAtUtc)}</span>
                        </span>
                        <StatusBadge value={v.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              {selected && (
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "DRAFT" && can(P.NOTIFICATION_TEMPLATES_UPDATE) && template && (
                      <Button variant="secondary" size="sm" onClick={() => setFormTarget({ mode: "edit", templateCode: code, channel: template.channel, purpose: template.purpose, version: selected })}>
                        <PencilSimpleIcon /> Edit draft
                      </Button>
                    )}
                    {selected.status === "DRAFT" && can(P.NOTIFICATION_TEMPLATES_ACTIVATE) && (
                      <Button size="sm" onClick={() => setTransition({ kind: "activate", version: selected })}>
                        <CheckCircleIcon /> Activate
                      </Button>
                    )}
                    {selected.status === "ACTIVE" && can(P.NOTIFICATION_TEMPLATES_DEACTIVATE) && (
                      <Button variant="danger" size="sm" onClick={() => setTransition({ kind: "retire", version: selected })}>
                        <ProhibitIcon /> Retire
                      </Button>
                    )}
                  </div>
                  <ContentBlock label="Subject" value={selected.subject} />
                  <ContentBlock label="Title" value={selected.title} />
                  <ContentBlock label="Text body" value={selected.bodyText} />
                  <ContentBlock label="HTML body (source)" value={selected.bodyHtml} mono />
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Parameters</p>
                    {selected.parameters.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {[...selected.parameters]
                          .sort((a, b) => a.displayOrder - b.displayOrder)
                          .map((p) => (
                            <li key={p.parameterId}>
                              <Badge tone={p.isRequired ? "primary" : "neutral"} title={p.description ?? undefined}>
                                <span className="font-mono">{p.name}</span> · {p.dataType}
                                {p.isRequired ? " · required" : ""}
                              </Badge>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">None</p>
                    )}
                  </div>
                  <DetailList
                    columns={3}
                    items={[
                      { label: "Created", value: formatUtcDateTime(selected.createdAtUtc) },
                      { label: "Updated", value: formatUtcDateTime(selected.updatedAtUtc) },
                      { label: "Activated", value: formatUtcDateTime(selected.activatedAtUtc) },
                      { label: "Retired", value: formatUtcDateTime(selected.retiredAtUtc) },
                      { label: "Concurrency version", value: selected.concurrencyVersion },
                      { label: "Version ID", value: <IdText value={selected.versionId} /> },
                    ]}
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TemplateFormDialog target={formTarget} onOpenChange={(o) => !o && setFormTarget(null)} />
      <ConfirmDialog
        open={transition !== null}
        onOpenChange={(o) => !o && setTransition(null)}
        title={transition?.kind === "activate" ? `Activate version ${transition.version.versionNumber}?` : `Retire version ${transition?.version.versionNumber ?? ""}?`}
        description={
          transition?.kind === "activate"
            ? activeVersion
              ? `It replaces active version ${activeVersion.versionNumber}, which will be retired. New notifications use this content immediately.`
              : "New notifications use this content immediately."
            : "The template will have no active version, so notifications that rely on it cannot be rendered until another version is activated."
        }
        confirmLabel={transition?.kind === "activate" ? "Activate" : "Retire"}
        tone={transition?.kind === "activate" ? "primary" : "danger"}
        loading={change.isPending}
        onConfirm={() => transition && change.mutate(transition, { onError: (e) => { onError(e); setTransition(null); } })}
      />
    </>
  );
}
