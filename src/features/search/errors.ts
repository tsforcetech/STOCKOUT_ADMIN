import { getErrorMessage, isApiError } from "@/lib/api/errors";
import type { SearchAdminErrorSymbol } from "@/api/types/search-admin";

/**
 * search-discovery sends a numeric `errorCode` and the symbol in `errorSymbol`/`title`, so the shared parser
 * leaves ApiError.code empty. Read the symbol from the raw body instead.
 */
export function searchErrorSymbol(error: unknown): string | undefined {
  if (!isApiError(error) || typeof error.body !== "object" || error.body === null) return undefined;
  const body = error.body as Record<string, unknown>;
  const symbol = typeof body.errorSymbol === "string" ? body.errorSymbol : typeof body.title === "string" ? body.title : undefined;
  return symbol && /^[A-Z0-9_]+$/.test(symbol) ? symbol : undefined;
}

const FALLBACKS: Partial<Record<SearchAdminErrorSymbol, string>> = {
  MARKETPLACE_SEARCH_ADMIN_FORBIDDEN: "You don't have permission to manage search. The catalog:search:admin permission is required.",
  MARKETPLACE_SEARCH_REINDEX_IN_PROGRESS: "A search index rebuild is already running. Wait for it to finish before starting another.",
  MARKETPLACE_SEARCH_PIN_DUPLICATE: "That slot or listing is already pinned for this keyword.",
  MARKETPLACE_SEARCH_SYNONYM_INVALID: "The synonym rule is not valid.",
  MARKETPLACE_SEARCH_FILTER_INVALID: "The server rejected the values as invalid.",
};

/**
 * User-facing message. 4xx details from search-discovery are written for operators (e.g. "Slot position 3 is already
 * occupied by listing '…' for keyword 'cement'"), so they are shown as-is; 403 always gets a clear permission message.
 */
export function searchErrorMessage(error: unknown): string {
  const symbol = searchErrorSymbol(error) as SearchAdminErrorSymbol | undefined;
  if (isApiError(error) && error.status === 403) return FALLBACKS.MARKETPLACE_SEARCH_ADMIN_FORBIDDEN!;
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    const raw = (error.body as { detail?: unknown } | null | undefined)?.detail;
    const detail = typeof raw === "string" ? raw.trim() : undefined;
    return detail || (symbol && FALLBACKS[symbol]) || getErrorMessage(error);
  }
  return getErrorMessage(error);
}
