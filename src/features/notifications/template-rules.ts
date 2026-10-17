import { getErrorMessage, isApiError } from "@/lib/api/errors";
import type { NotificationTemplateChannel, NotificationTemplateDataType, NotificationTemplateErrorCode, NotificationTemplatePurpose, NotificationTemplateStatus } from "@/api/types/notification-templates";

export const CHANNELS: NotificationTemplateChannel[] = ["EMAIL", "SMS", "PUSH", "IN_APP", "WHATSAPP"];
export const PURPOSES: NotificationTemplatePurpose[] = ["TRANSACTIONAL", "SECURITY", "SYSTEM", "MARKETING"];
export const STATUSES: NotificationTemplateStatus[] = ["DRAFT", "ACTIVE", "RETIRED"];
export const DATA_TYPES: NotificationTemplateDataType[] = ["STRING", "NUMBER", "DATETIME", "URL"];

export const CHANNEL_LABEL: Record<NotificationTemplateChannel, string> = { EMAIL: "Email", SMS: "SMS", PUSH: "Push", IN_APP: "In-app", WHATSAPP: "WhatsApp" };

export type ContentField = "subject" | "title" | "bodyText" | "bodyHtml";

/** NotificationTemplateValidator.ValidateChannelContent: which fields are required / forbidden per channel. */
export const CHANNEL_RULES: Record<NotificationTemplateChannel, { required: ContentField[]; forbidden: ContentField[]; note: string }> = {
  EMAIL: { required: ["subject"], forbidden: ["title"], note: "Email needs a subject and a text and/or HTML body. Title is not allowed." },
  SMS: { required: ["bodyText"], forbidden: ["subject", "title", "bodyHtml"], note: "SMS supports a plain-text body only." },
  PUSH: { required: ["title", "bodyText"], forbidden: [], note: "Push needs a title and a text body." },
  IN_APP: { required: ["title", "bodyText"], forbidden: [], note: "In-app needs a title and a text body." },
  WHATSAPP: { required: ["bodyText"], forbidden: [], note: "WhatsApp needs a text body." },
};

export const PARAM_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

export interface ContentValues {
  subject: string;
  title: string;
  bodyText: string;
  bodyHtml: string;
}

const blank = (s: string | null | undefined) => !s || !s.trim();

/** Mirrors ValidateChannelContent. Returns field → message. */
export function channelContentIssues(channel: NotificationTemplateChannel, v: ContentValues): Partial<Record<ContentField, string>> {
  const issues: Partial<Record<ContentField, string>> = {};
  const rule = CHANNEL_RULES[channel];
  for (const f of rule.required) if (blank(v[f])) issues[f] = "Required for this channel.";
  for (const f of rule.forbidden) if (!blank(v[f])) issues[f] = "Not allowed for this channel.";
  if (channel === "EMAIL" && blank(v.bodyText) && blank(v.bodyHtml)) issues.bodyText = "Provide a text body, an HTML body, or both.";
  return issues;
}

/** Mirrors ValidatePlaceholders: every {{name}} must be a valid, declared parameter; no stray braces. */
export function placeholderIssue(v: ContentValues, declared: string[]): string | null {
  const all = `${v.subject} ${v.title} ${v.bodyText} ${v.bodyHtml}`;
  const names = new Set(declared.map((d) => d.toLowerCase()));
  const re = /\{\{([^}]*)\}\}/g;
  for (const m of all.matchAll(re)) {
    const content = m[1];
    if (!PARAM_NAME_RE.test(content)) return `"{{${content}}}" is not a valid placeholder. Use {{name}} with letters, digits and underscores, no spaces.`;
    if (!names.has(content.toLowerCase())) return `Placeholder {{${content}}} is not declared as a parameter.`;
  }
  const remaining = all.replace(re, "");
  if (remaining.includes("{{") || remaining.includes("}}")) return "Content contains unmatched {{ or }}.";
  return null;
}

/** Extracts {{names}} used in content, for "add missing parameters" convenience. */
export function usedPlaceholders(v: ContentValues): string[] {
  const all = `${v.subject} ${v.title} ${v.bodyText} ${v.bodyHtml}`;
  const out = new Map<string, string>();
  for (const m of all.matchAll(/\{\{([^}]*)\}\}/g)) if (PARAM_NAME_RE.test(m[1])) out.set(m[1].toLowerCase(), m[1]);
  return [...out.values()];
}

const MESSAGES: Record<NotificationTemplateErrorCode, string> = {
  FORBIDDEN: "You don't have permission to perform this action (or the permission service is unavailable).",
  NOTIFICATION_TEMPLATE_NOT_FOUND: "This template no longer exists.",
  TEMPLATE_CODE_EXISTS: "A template with this code already exists for this channel.",
  TEMPLATE_VERSION_NOT_FOUND: "This template version was not found. Refresh and try again.",
  TEMPLATE_DRAFT_ALREADY_EXISTS: "This template already has a draft. Edit or activate the existing draft first.",
  TEMPLATE_NOT_EDITABLE: "Only draft versions can be edited.",
  TEMPLATE_VERSION_CONFLICT: "This version was changed by someone else. The latest data has been reloaded — review it and try again.",
  TEMPLATE_INVALID_STATE: "This version is not in a state that allows this action. Refresh and try again.",
  TEMPLATE_CONTENT_INVALID: "The content is not valid for this channel (check required fields and {{placeholders}}).",
  TEMPLATE_PARAMETER_INVALID: "One or more parameters are invalid (name format, data type, order, or duplicate names).",
  TEMPLATE_PLACEHOLDER_UNDECLARED: "The content uses a {{placeholder}} that is not declared as a parameter.",
};

export function templateErrorCode(error: unknown): string | undefined {
  return isApiError(error) ? error.code : undefined;
}

export function templateErrorMessage(error: unknown): string {
  const code = templateErrorCode(error);
  if (code && code in MESSAGES) return MESSAGES[code as NotificationTemplateErrorCode];
  return getErrorMessage(error);
}
