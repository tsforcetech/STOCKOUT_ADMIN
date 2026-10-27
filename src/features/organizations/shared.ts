import { getErrorMessage, isApiError } from "@/lib/api/errors";
import { humanize } from "@/lib/utils/format";

/** UAE local time (GST, UTC+4). Server timestamps without a zone are UTC. */
export function formatGst(value: string | null | undefined, withTime = true): string {
  if (!value) return "—";
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric" };
  return `${new Intl.DateTimeFormat("en-GB", opts).format(d)}${withTime ? " GST" : ""}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  TRADE_LICENCE: "Trade licence",
  VAT_TRN: "VAT / TRN",
  BANK_ACCOUNT: "Bank account",
  AUTHORISED_SIGNATORY: "Authorised signatory",
  LEGAL_OWNERSHIP: "Legal name / ownership",
  REGISTERED_COMPANY_DETAILS: "Address & contact details",
};
export const categoryLabel = (v: string) => CATEGORY_LABELS[v] ?? humanize(v);

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "You don't have permission for this.",
  REJECTION_REASON_REQUIRED: "Enter a reason — the company sees it.",
  INVALID_STATUS_FOR_REVIEW: "This request isn't waiting for review any more. Refresh the list.",
  CHANGE_REQUEST_NOT_FOUND: "This request no longer exists.",
  ATTESTATION_REQUIRED: "Tick the attestation to confirm you verified the official source.",
  INVALID_WEEKEND_DAYS: "Weekend days must be day numbers 0–6 separated by commas (0 = Sunday, 6 = Saturday).",
  CHANGE_REASON_REQUIRED: "Give a reason for the change (at least 5 characters).",
};
export function orgAdminErrorMessage(error: unknown): string {
  if (isApiError(error) && error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return getErrorMessage(error);
}
