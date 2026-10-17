import * as React from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { FormError, FormField } from "@/components/forms/form-field";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { humanize } from "@/lib/utils/format";
import { notificationTemplatesService } from "@/services/notification-templates.service";
import type { NotificationTemplateChannel, NotificationTemplateDataType, NotificationTemplateParameterDto, NotificationTemplatePurpose, NotificationTemplateVersionResponse } from "@/api/types/notification-templates";
import { templateKeys } from "./queries";
import { CHANNEL_LABEL, CHANNEL_RULES, CHANNELS, channelContentIssues, DATA_TYPES, PARAM_NAME_RE, placeholderIssue, PURPOSES, templateErrorCode, templateErrorMessage, usedPlaceholders, type ContentField } from "./template-rules";

const paramSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").regex(PARAM_NAME_RE, "Start with a letter; letters, digits and _ only."),
  dataType: z.enum(DATA_TYPES as [NotificationTemplateDataType, ...NotificationTemplateDataType[]]),
  isRequired: z.boolean(),
  description: z.string(),
});

const schema = z
  .object({
    templateCode: z.string().trim().max(150, "At most 150 characters."),
    channel: z.enum(CHANNELS as [NotificationTemplateChannel, ...NotificationTemplateChannel[]]),
    purpose: z.enum(["TRANSACTIONAL", "SECURITY", "SYSTEM", "MARKETING"]),
    subject: z.string(),
    title: z.string(),
    bodyText: z.string(),
    bodyHtml: z.string(),
    parameters: z.array(paramSchema),
    isCreate: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.isCreate && !v.templateCode.trim()) ctx.addIssue({ code: "custom", path: ["templateCode"], message: "Template code is required." });
    const issues = channelContentIssues(v.channel, v);
    for (const [field, message] of Object.entries(issues)) ctx.addIssue({ code: "custom", path: [field], message });
    const seen = new Set<string>();
    v.parameters.forEach((p, i) => {
      const key = p.name.trim().toLowerCase();
      if (key && seen.has(key)) ctx.addIssue({ code: "custom", path: ["parameters", i, "name"], message: "Parameter names must be unique (case-insensitive)." });
      seen.add(key);
    });
    const ph = placeholderIssue(v, v.parameters.map((p) => p.name.trim()));
    if (ph) ctx.addIssue({ code: "custom", path: ["bodyText"], message: ph });
  });
type Values = z.infer<typeof schema>;

export type TemplateFormTarget =
  | { mode: "create" }
  | { mode: "edit"; templateCode: string; channel: NotificationTemplateChannel; purpose: NotificationTemplatePurpose; version: NotificationTemplateVersionResponse };

const nullIfBlank = (s: string) => (s.trim() ? s : null);

const FIELD_LABEL: Record<ContentField, string> = { subject: "Subject", title: "Title", bodyText: "Text body", bodyHtml: "HTML body" };

export function TemplateFormDialog({ target, onOpenChange, onCreated }: { target: TemplateFormTarget | null; onOpenChange: (open: boolean) => void; onCreated?: (code: string, channel: NotificationTemplateChannel) => void }) {
  const [formError, setFormError] = React.useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { templateCode: "", channel: "EMAIL", purpose: "TRANSACTIONAL", subject: "", title: "", bodyText: "", bodyHtml: "", parameters: [], isCreate: true },
  });
  const params = useFieldArray({ control: form.control, name: "parameters" });

  React.useEffect(() => {
    if (!target) return;
    setFormError(null);
    if (target.mode === "create") {
      form.reset({ templateCode: "", channel: "EMAIL", purpose: "TRANSACTIONAL", subject: "", title: "", bodyText: "", bodyHtml: "", parameters: [], isCreate: true });
    } else {
      const v = target.version;
      form.reset({
        templateCode: target.templateCode,
        channel: target.channel,
        purpose: target.purpose,
        subject: v.subject ?? "",
        title: v.title ?? "",
        bodyText: v.bodyText ?? "",
        bodyHtml: v.bodyHtml ?? "",
        parameters: [...v.parameters].sort((a, b) => a.displayOrder - b.displayOrder).map((p) => ({ name: p.name, dataType: p.dataType, isRequired: p.isRequired, description: p.description ?? "" })),
        isCreate: false,
      });
    }
  }, [target, form]);

  const save = useApiMutation({
    mutationFn: async (v: Values) => {
      const parameters: NotificationTemplateParameterDto[] = v.parameters.map((p, i) => ({ name: p.name.trim(), dataType: p.dataType, isRequired: p.isRequired, description: p.description.trim() || null, displayOrder: i }));
      const forbidden = CHANNEL_RULES[v.channel].forbidden;
      const content = {
        subject: forbidden.includes("subject") ? null : nullIfBlank(v.subject),
        title: forbidden.includes("title") ? null : nullIfBlank(v.title),
        bodyText: nullIfBlank(v.bodyText),
        bodyHtml: forbidden.includes("bodyHtml") ? null : nullIfBlank(v.bodyHtml),
      };
      if (target?.mode === "edit") {
        return notificationTemplatesService.updateDraft(target.templateCode, target.channel, target.version.versionId, { expectedVersion: target.version.concurrencyVersion, ...content, parameters });
      }
      return notificationTemplatesService.create({ templateCode: v.templateCode.trim(), channel: v.channel, purpose: v.purpose, ...content, parameters });
    },
    invalidate: [templateKeys.all],
    toastOnError: false,
    successMessage: target?.mode === "edit" ? "Draft saved." : "Template created as a draft (version 1). Activate it to start sending.",
    onSuccess: (_d, v) => {
      onOpenChange(false);
      if (target?.mode === "create") onCreated?.(v.templateCode.trim(), v.channel);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    save.mutate(values, {
      onError: (e) => {
        if (templateErrorCode(e) === "TEMPLATE_CODE_EXISTS") form.setError("templateCode", { type: "server", message: templateErrorMessage(e) });
        else setFormError(templateErrorMessage(e));
      },
    });
  });

  const channel = form.watch("channel");
  const rule = CHANNEL_RULES[channel];
  const errors = form.formState.errors;
  const editing = target?.mode === "edit";

  const addMissing = () => {
    const v = form.getValues();
    const declared = new Set(v.parameters.map((p) => p.name.trim().toLowerCase()));
    usedPlaceholders(v)
      .filter((n) => !declared.has(n.toLowerCase()))
      .forEach((name) => params.append({ name, dataType: "STRING", isRequired: true, description: "" }));
  };

  const contentField = (field: ContentField, multiline: boolean) => {
    if (rule.forbidden.includes(field)) return null;
    const required = rule.required.includes(field);
    return (
      <FormField key={field} label={`${FIELD_LABEL[field]}${required ? "" : " (optional)"}`} htmlFor={`tpl-${field}`} required={required} error={errors[field]?.message}>
        {multiline ? <Textarea rows={field === "bodyHtml" ? 6 : 4} className="font-mono text-xs" {...form.register(field)} /> : <Input {...form.register(field)} />}
      </FormField>
    );
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent
        size="xl"
        title={editing ? `Edit draft v${target.version.versionNumber}` : "Create notification template"}
        description={editing ? `${target.templateCode} · ${CHANNEL_LABEL[target.channel]} — saving replaces the draft's content and parameters.` : "The template is created with version 1 as a draft."}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="template-form" loading={save.isPending}>
              {editing ? "Save draft" : "Create template"}
            </Button>
          </>
        }
      >
        <form id="template-form" onSubmit={onSubmit} noValidate className="space-y-5">
          <FormError message={formError} />
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Template code" htmlFor="tpl-code" required={!editing} error={errors.templateCode?.message} hint="Unique per channel. Max 150.">
              <Input className="font-mono" maxLength={150} disabled={editing} autoComplete="off" {...form.register("templateCode")} />
            </FormField>
            <FormField label="Channel" htmlFor="tpl-channel" required>
              <NativeSelect disabled={editing} {...form.register("channel")}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Purpose" htmlFor="tpl-purpose" required>
              <NativeSelect disabled={editing} {...form.register("purpose")}>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {humanize(p)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-muted-foreground">{rule.note} Use {"{{parameterName}}"} placeholders; each must be declared below.</p>
          <div className="space-y-4">
            {contentField("subject", false)}
            {contentField("title", false)}
            {contentField("bodyText", true)}
            {contentField("bodyHtml", true)}
          </div>

          <fieldset className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="font-heading text-base font-medium text-foreground">Parameters</legend>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={addMissing}>
                  Add from placeholders
                </Button>
                <Button variant="secondary" size="sm" onClick={() => params.append({ name: "", dataType: "STRING", isRequired: true, description: "" })}>
                  <PlusIcon /> Add parameter
                </Button>
              </div>
            </div>
            {params.fields.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground">No parameters. Content cannot contain placeholders.</p>
            ) : (
              <ol className="space-y-2">
                {params.fields.map((field, i) => {
                  const err = errors.parameters?.[i];
                  return (
                    <li key={field.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_140px_1.4fr_auto] sm:items-start">
                      <div>
                        <Label htmlFor={`tpl-param-${i}-name`} className="text-xs">
                          Name
                        </Label>
                        <Input id={`tpl-param-${i}-name`} className="font-mono" aria-invalid={err?.name ? true : undefined} {...form.register(`parameters.${i}.name`)} />
                        {err?.name && (
                          <p role="alert" className="mt-1 text-xs text-danger-soft-foreground">
                            {err.name.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor={`tpl-param-${i}-type`} className="text-xs">
                          Data type
                        </Label>
                        <NativeSelect id={`tpl-param-${i}-type`} {...form.register(`parameters.${i}.dataType`)}>
                          {DATA_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <div>
                        <Label htmlFor={`tpl-param-${i}-desc`} className="text-xs">
                          Description
                        </Label>
                        <Input id={`tpl-param-${i}-desc`} {...form.register(`parameters.${i}.description`)} />
                        <Controller
                          control={form.control}
                          name={`parameters.${i}.isRequired`}
                          render={({ field: f }) => (
                            <label className="mt-2 flex items-center gap-2 text-xs text-foreground">
                              <Checkbox checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} /> Required
                            </label>
                          )}
                        />
                      </div>
                      <div className="flex gap-1 sm:pt-5">
                        <Button variant="ghost" size="icon-sm" aria-label={`Move parameter ${i + 1} up`} disabled={i === 0} onClick={() => params.move(i, i - 1)}>
                          <ArrowUpIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Move parameter ${i + 1} down`} disabled={i === params.fields.length - 1} onClick={() => params.move(i, i + 1)}>
                          <ArrowDownIcon />
                        </Button>
                        <Button variant="danger-ghost" size="icon-sm" aria-label={`Remove parameter ${i + 1}`} onClick={() => params.remove(i)}>
                          <TrashIcon />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="text-xs text-muted-foreground">Display order follows the list order.</p>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
