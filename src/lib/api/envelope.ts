import { ApiError } from "./errors";

/**
 * Response adapters. Services do not share one wrapper:
 *  - identity-access returns DTOs directly;
 *  - user-organization, catalog-listing, inventory-media wrap them as { success, data }.
 * Each service module picks the adapter matching its contract — nothing guesses at runtime
 * except `unwrapData`, which tolerates the documented `{ success, data }` shape only.
 */
export interface Envelope<T> {
  success: boolean;
  data: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Unwraps `{ success, data }` (user-organization, catalog taxonomy, notification templates) and
 * `{ data }` (inventory-media files). Throws if the backend reports success=false with a 2xx status.
 */
export function unwrapData<T>(body: unknown): T {
  if (isRecord(body) && "data" in body && Object.keys(body).every((k) => k === "success" || k === "data" || k === "message")) {
    if (body.success === false) {
      throw new ApiError({
        kind: "http",
        status: 200,
        message: typeof body.message === "string" ? body.message : "The request was not successful.",
        body,
      });
    }
    return body.data as T;
  }
  return body as T;
}

/** Normalised page used by every table in the app. */
export interface Page<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  /** False when the endpoint is not paginated server-side (the whole list is returned). */
  serverPaginated: boolean;
}

export function arrayPage<T>(items: T[] | null | undefined): Page<T> {
  const list = items ?? [];
  return { items: list, totalCount: list.length, page: 1, pageSize: list.length || 1, serverPaginated: false };
}
