/**
 * Where an admin notification opens (handoff 26 Nov §5). navigationTarget is trusted only as a plain relative path;
 * the server's /admin/... targets map onto this console's routes. Unknown → null (stay in the inbox).
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || /^\/[^/?#]*:/.test(v) || v.length > 500) return null;
  return v;
}

const MAP: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/admin\/financial\/orders\/([0-9a-f-]{36})(\/.*)?$/i, (m) => `/orders/${m[1]}`],
  [/^\/admin\/orders\/escalations\/([0-9a-f-]{36})$/i, (m) => `/orders/escalations/${m[1]}`],
  [/^\/admin\/orders\/claims(\/.*)?$/i, () => "/orders/claims"],
  [/^\/admin\/orders\/([0-9a-f-]{36})$/i, (m) => `/orders/${m[1]}`],
  [/^\/admin\/orders\/?$/i, () => "/orders"],
];

export function inboxHref(n: { navigationTarget: string | null; relatedEntityType: string | null; relatedEntityId: string | null }): string | null {
  const path = safeInternalPath(n.navigationTarget);
  if (path) {
    for (const [re, to] of MAP) {
      const m = path.match(re);
      if (m) return to(m);
    }
    // Buyer/seller site paths don't exist in the console.
    if (!/^\/(buyer|seller|account)(\/|$)/.test(path)) return path.replace(/^\/admin(?=\/)/, "");
  }
  const type = (n.relatedEntityType ?? "").toUpperCase();
  const id = n.relatedEntityId && GUID.test(n.relatedEntityId) ? n.relatedEntityId : null;
  if (type === "ORDER" && id) return `/orders/${id}`;
  if (type === "ESCALATION" && id) return `/orders/escalations/${id}`;
  if (type === "CLAIM") return "/orders/claims";
  return null;
}

export const badgeText = (n: number | null | undefined) => (!n || n <= 0 ? null : n > 99 ? "99+" : String(n));
