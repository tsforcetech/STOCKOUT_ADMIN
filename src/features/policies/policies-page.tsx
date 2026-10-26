import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PaperPlaneTiltIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { RefreshButton, RowAction, SectionCard, Toolbar } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge, Skeleton } from "@/components/ui/misc";
import { FormError, FormField } from "@/components/forms/form-field";
import { RequirePermission } from "@/lib/auth/guards";
import { useAccess } from "@/lib/auth/use-access";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { policiesService } from "@/services/policies.service";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type { PolicyDetailResponse, PolicySummaryResponse } from "@/api/types/policies";
import { ApiErrorNotice } from "@/features/listings/shared";
import { PolicyMarkdown } from "./policy-markdown";

/**
 * PA-1A policy administration. Lists the published revisions (GET /policies), shows their text, creates draft
 * revisions (policies.manage) and publishes them (policies.publish). The API has no "list drafts" endpoint, so drafts
 * created from this browser are remembered locally until they're published or removed.
 */
const LANGS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;
const DRAFTS_KEY = "stockout.admin.policy-drafts";
const keys = { list: (lang: string) => ["policies", "list", lang] as const, detail: (code: string, lang: string) => ["policies", "detail", code, lang] as const };

interface DraftRevision {
  policyRevisionId: string;
  policyCode: string;
  revisionCode: string;
  languageCode: string;
  effectiveFromUtc: string;
  title: string;
  contentHash: string;
  createdAtUtc: string;
}

function readDrafts(): DraftRevision[] {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as DraftRevision[]).filter((d) => typeof d?.policyRevisionId === "string") : [];
  } catch {
    return [];
  }
}

function useDrafts() {
  const [drafts, setDrafts] = React.useState<DraftRevision[]>(readDrafts);
  const save = React.useCallback((next: DraftRevision[]) => {
    setDrafts(next);
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: keep in memory */
    }
  }, []);
  return {
    drafts,
    add: (d: DraftRevision) => save([d, ...readDrafts().filter((x) => x.policyRevisionId !== d.policyRevisionId)]),
    remove: (id: string) => save(readDrafts().filter((x) => x.policyRevisionId !== id)),
  };
}

function PoliciesContent() {
  const { can } = useAccess();
  const qc = useQueryClient();
  const [lang, setLang] = React.useState("en");
  const list = useQuery({ queryKey: keys.list(lang), queryFn: ({ signal }) => policiesService.list(lang, signal) });
  const [viewing, setViewing] = React.useState<PolicySummaryResponse | null>(null);
  const [creating, setCreating] = React.useState<PolicySummaryResponse | "new" | null>(null);
  const [publishing, setPublishing] = React.useState<DraftRevision | null>(null);
  const { drafts, add, remove } = useDrafts();
  const canManage = can(P.POLICIES_MANAGE);
  const canPublish = can(P.POLICIES_PUBLISH);

  const publish = useApiMutation({
    toastOnError: false,
    mutationFn: (d: DraftRevision) => policiesService.publishRevision(d.policyRevisionId),
    onSuccess: (_r, d) => {
      remove(d.policyRevisionId);
      setPublishing(null);
      toast.success(`${d.policyCode} ${d.revisionCode} published. Users will be asked to accept it.`);
      void qc.invalidateQueries({ queryKey: ["policies"] });
    },
  });

  const columns = React.useMemo<ColumnDef<PolicySummaryResponse>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        accessorFn: (p) => p.name,
        cell: ({ row: { original: p } }) => (
          <div className="min-w-0">
            <p className="font-medium text-foreground">{p.name}</p>
            <p className="text-xs text-muted-foreground">{p.policyCode}</p>
          </div>
        ),
      },
      { id: "audience", header: "Audience", accessorFn: (p) => p.audience, cell: ({ getValue }) => <Badge tone="neutral">{String(getValue())}</Badge> },
      { id: "mandatory", header: "Mandatory", accessorFn: (p) => (p.isMandatory ? "Yes" : "No") },
      { id: "revision", header: "Revision", accessorFn: (p) => p.revisionCode },
      { id: "effective", header: "Effective", accessorFn: (p) => p.effectiveFromUtc, cell: ({ getValue }) => formatDate(getValue() as string) },
      { id: "status", header: "Status", accessorFn: (p) => p.status, cell: ({ getValue }) => <StatusBadge value={String(getValue())} /> },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              cell: ({ row: { original: p } }: { row: { original: PolicySummaryResponse } }) => (
                <RowAction label={`New revision of ${p.name}`} onClick={() => setCreating(p)}>
                  <PlusIcon />
                </RowAction>
              ),
            } satisfies ColumnDef<PolicySummaryResponse>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <>
      <PageHeader
        title="Policies"
        description="Published legal policies users accept. New revisions start as drafts and apply once published."
        actions={
          canManage && (
            <Button onClick={() => setCreating("new")}>
              <PlusIcon /> New revision
            </Button>
          )
        }
      />
      <div className="space-y-4">
        {drafts.length > 0 && (
          <SectionCard>
            <h2 className="font-heading text-lg font-bold text-foreground">Draft revisions</h2>
            <p className="mb-3 text-sm text-muted-foreground">Created from this browser and not yet published. The API doesn&apos;t list drafts, so other admins won&apos;t see these here.</p>
            <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Draft revisions">
              {drafts.map((d) => (
                <li key={d.policyRevisionId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {d.title} <span className="text-muted-foreground">· {d.revisionCode}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.policyCode} · {d.languageCode.toUpperCase()} · Effective {formatDateTime(d.effectiveFromUtc)} · Created {formatDateTime(d.createdAtUtc)}
                    </p>
                  </div>
                  <StatusBadge value="DRAFT" />
                  {canPublish && (
                    <Button size="sm" onClick={() => setPublishing(d)}>
                      <PaperPlaneTiltIcon /> Publish
                    </Button>
                  )}
                  <RowAction label="Remove from this list" tone="danger" onClick={() => remove(d.policyRevisionId)}>
                    <TrashIcon />
                  </RowAction>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        <SectionCard>
          <Toolbar
            left={
              <NativeSelect aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="w-40">
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </NativeSelect>
            }
            right={<RefreshButton onClick={() => void list.refetch()} spinning={list.isFetching} />}
          />
          {list.error ? (
            <ApiErrorNotice error={list.error} />
          ) : (
            <DataTable
              columns={columns}
              data={list.data ?? []}
              isLoading={list.isLoading}
              caption="Published policies"
              getRowId={(p) => p.policyRevisionId}
              onRowClick={(p) => setViewing(p)}
              emptyTitle={lang === "ar" ? "No Arabic revisions published" : "No policies published"}
              emptyDescription={lang === "ar" ? "Create an Arabic revision with an approved translation to publish one." : undefined}
            />
          )}
        </SectionCard>
      </div>

      <PolicyViewDialog policy={viewing} lang={lang} onClose={() => setViewing(null)} />
      <CreateRevisionDialog
        open={creating !== null}
        base={creating === "new" ? null : creating}
        policies={list.data ?? []}
        lang={lang}
        onClose={() => setCreating(null)}
        onCreated={(d) => {
          add({
            policyRevisionId: d.policyRevisionId,
            policyCode: d.policyCode,
            revisionCode: d.revisionCode,
            languageCode: d.languageCode,
            effectiveFromUtc: d.effectiveFromUtc,
            title: d.title,
            contentHash: d.contentHash,
            createdAtUtc: new Date().toISOString(),
          });
          setCreating(null);
        }}
      />
      <ConfirmDialog
        open={publishing !== null}
        onOpenChange={(o) => !o && setPublishing(null)}
        tone="primary"
        title="Publish this revision?"
        description={
          publishing
            ? `${publishing.policyCode} ${publishing.revisionCode} replaces the current revision from ${formatDateTime(publishing.effectiveFromUtc)}. Every affected user will be asked to accept it before continuing.`
            : ""
        }
        confirmLabel="Publish"
        loading={publish.isPending}
        onConfirm={() =>
          publishing &&
          publish.mutate(publishing, {
            onError: (e) => {
              if (isApiError(e) && (e.code === "REVISION_NOT_IN_DRAFT_STATUS" || e.code === "REVISION_NOT_FOUND")) {
                remove(publishing.policyRevisionId);
                setPublishing(null);
                toast.error("This revision is no longer a draft (already published or removed), so it was taken off the list.");
              } else toast.error(getErrorMessage(e));
            },
          })
        }
      />
    </>
  );
}

function PolicyViewDialog({ policy, lang, onClose }: { policy: PolicySummaryResponse | null; lang: string; onClose: () => void }) {
  const detail = useQuery({
    queryKey: keys.detail(policy?.policyCode ?? "", lang),
    queryFn: ({ signal }) => policiesService.detail(policy!.policyCode, lang, signal),
    enabled: !!policy,
  });
  return (
    <Dialog open={!!policy} onOpenChange={(o) => !o && onClose()}>
      {policy && (
        <DialogContent size="xl" title={policy.title} description={`${policy.policyCode} · ${policy.revisionCode} · Effective ${formatDate(policy.effectiveFromUtc)}`}>
          {detail.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : detail.error || !detail.data ? (
            <ApiErrorNotice error={detail.error} />
          ) : (
            <>
              <PolicyMarkdown content={detail.data.content} />
              <p className="mt-6 break-all border-t border-border pt-3 text-xs text-muted-foreground">SHA-256: {detail.data.contentHash}</p>
            </>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

const nextRevision = (code: string) => {
  const m = /^(.*?)(\d+)$/.exec(code.trim());
  return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, "0")}` : "";
};

function CreateRevisionDialog({
  open,
  base,
  policies,
  lang,
  onClose,
  onCreated,
}: {
  open: boolean;
  base: PolicySummaryResponse | null;
  policies: PolicySummaryResponse[];
  lang: string;
  onClose: () => void;
  onCreated: (d: PolicyDetailResponse) => void;
}) {
  const [code, setCode] = React.useState("");
  const [revisionCode, setRevisionCode] = React.useState("");
  const [language, setLanguage] = React.useState(lang);
  const [effective, setEffective] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [preview, setPreview] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingText, setLoadingText] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCode(base?.policyCode ?? "");
    setRevisionCode(base ? nextRevision(base.revisionCode) : "");
    setLanguage(lang);
    setEffective("");
    setTitle(base?.title ?? "");
    setContent("");
    setPreview(false);
    setError(null);
  }, [open, base, lang]);

  const startFromCurrent = async () => {
    if (!code) return;
    setLoadingText(true);
    try {
      const current = await policiesService.detail(code, language);
      setContent(current.content);
      if (!title) setTitle(current.title);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoadingText(false);
    }
  };

  const create = useApiMutation({
    toastOnError: false,
    mutationFn: () =>
      policiesService.createRevision({
        policyCode: code,
        revisionCode: revisionCode.trim(),
        languageCode: language,
        effectiveFromUtc: new Date(effective).toISOString(),
        title: title.trim(),
        content,
      }),
    successMessage: "Draft revision created. Publish it when it's approved.",
    onSuccess: onCreated,
  });

  const submit = () => {
    setError(null);
    if (!code || !revisionCode.trim() || !effective || !title.trim() || !content.trim()) return setError("Fill in every field.");
    create.mutate(undefined, { onError: (e) => setError(getErrorMessage(e)) });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent
        size="xl"
        title={base ? `New revision · ${base.name}` : "New policy revision"}
        description="Creates a draft. Nothing changes for users until it's published."
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={create.isPending}>
              Create draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Policy" htmlFor="policy-code" required>
              <NativeSelect id="policy-code" value={code} onChange={(e) => setCode(e.target.value)}>
                <option value="">Choose…</option>
                {policies.map((p) => (
                  <option key={p.policyCode} value={p.policyCode}>
                    {p.name} ({p.policyCode})
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Revision" htmlFor="revision-code" required hint="For example Rev. 01">
              <Input id="revision-code" maxLength={50} value={revisionCode} onChange={(e) => setRevisionCode(e.target.value)} />
            </FormField>
            <FormField label="Language" htmlFor="policy-lang" required hint="Only publish an Arabic text that has been approved.">
              <NativeSelect id="policy-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Effective from" htmlFor="policy-effective" required hint="Your local time.">
              <Input id="policy-effective" type="datetime-local" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </FormField>
            <FormField label="Title" htmlFor="policy-title" required className="sm:col-span-2">
              <Input id="policy-title" maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
          </div>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="policy-content" className="text-sm text-body">
                Content (Markdown) <span className="text-danger" aria-hidden>*</span>
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void startFromCurrent()} disabled={!code} loading={loadingText}>
                  Start from published text
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)} disabled={!content.trim()}>
                  {preview ? "Edit" : "Preview"}
                </Button>
              </div>
            </div>
            {preview ? (
              <div className="max-h-[50dvh] overflow-y-auto rounded-md border border-border p-4">
                <PolicyMarkdown content={content} />
              </div>
            ) : (
              <Textarea id="policy-content" rows={16} className="font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PoliciesPage() {
  return (
    <RequirePermission permission={{ anyOf: [P.POLICIES_VIEW, P.POLICIES_MANAGE, P.POLICIES_PUBLISH] }}>
      <PoliciesContent />
    </RequirePermission>
  );
}
