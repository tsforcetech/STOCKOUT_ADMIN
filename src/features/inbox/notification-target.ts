import type { UserNotificationDto } from "@/api/types/notifications";

/**
 * Where a notification opens in the admin console. navigationTarget is only trusted when it is a plain relative path;
 * backend canonical /admin/... paths (handoff 26 Nov 2026 §5) are mapped to this console's routes. Otherwise the
 * (notificationType, relatedEntityType, relatedEntityId) triple decides; otherwise null (the item stays in the inbox).
 * Absolute or protocol-relative URLs from a payload are never followed. Screens re-check permissions server-side.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || /^\/[^/?#]*:/.test(v) || v.length > 500) return null;
  return v;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const safeId = (v: string | null | undefined) => (v && SAFE_ID.test(v) ? v : null);

function toAppPath(path: string): string | null {
  const [pathname] = path.split(/[?#]/);
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "notifications") return "/inbox";
  if (seg[0] !== "admin") return null; // buyer / seller screens are not part of this console
  const [, section, id, sub] = seg;
  if (section === "orders") {
    if (id === "escalations") return sub && safeId(sub) ? `/orders/escalations/${sub}` : "/orders/escalations";
    if (id === "claims") return "/orders/claims";
    return id && safeId(id) ? `/orders/${id}` : "/orders";
  }
  // /admin/financial/orders/{id}/reconciliation: reconciliation is shown on the order detail.
  if (section === "financial" && id === "orders") return sub && safeId(sub) ? `/orders/${sub}` : "/orders";
  if (section === "escalations") return id && safeId(id) ? `/orders/escalations/${id}` : "/orders/escalations";
  if (section === "claims") return "/orders/claims";
  return null;
}

function entityPath(n: Partial<Pick<UserNotificationDto, "notificationType" | "relatedEntityType" | "relatedEntityId">>): string | null {
  const type = (n.notificationType ?? "").toUpperCase();
  const entity = (n.relatedEntityType ?? "").toUpperCase();
  const id = safeId(n.relatedEntityId);
  switch (entity) {
    case "ORDER":
      // ADMIN_* → order monitoring; FINANCE_* → the same order, whose detail carries the reconciliation state.
      return type.startsWith("ADMIN_") || type.startsWith("FINANCE_") ? (id ? `/orders/${id}` : "/orders") : null;
    case "ESCALATION":
      return id ? `/orders/escalations/${id}` : "/orders/escalations";
    case "CLAIM":
      return "/orders/claims";
    default:
      return null;
  }
}

export function notificationHref(
  n: Pick<UserNotificationDto, "navigationTarget" | "relatedEntityType"> & Partial<Pick<UserNotificationDto, "notificationType" | "relatedEntityId">>,
): string | null {
  const target = safeInternalPath(n.navigationTarget);
  return (target ? toAppPath(target) : null) ?? entityPath(n);
}

/** Bell badge text: hidden at zero, capped at 99+. */
export const badgeText = (n: number | null | undefined) => (!n || n <= 0 ? null : n > 99 ? "99+" : String(n));
