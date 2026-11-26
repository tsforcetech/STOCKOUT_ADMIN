import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";
import { RequireAuth } from "@/lib/auth/guards";
import InboxPage from "../inbox-page";
import { NotificationBell } from "../notification-bell";
import { badgeText, notificationHref, safeInternalPath } from "../notification-target";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const signIn = () => {
  sessionStorage.setItem("stockout.admin.rt", "rt-1");
  localStorage.setItem("stockout.admin.rt", "rt-1");
};
const env = (data: unknown) => ({ body: { success: true, data } });
const ORDER = "7856fffe-b325-4810-998f-ebe873fbd7c8";
const n = (id: string, over: object = {}) => ({
  notificationId: id, recipientOrganizationId: null, notificationType: "ADMIN_NEW_ORDER_PLACED", title: `Note ${id}`, message: "Order ORD-000123 was placed.",
  relatedEntityType: "ORDER", relatedEntityId: ORDER, navigationTarget: null, scope: "PERSONAL", channel: "IN_APP", deliveryStatus: "DELIVERED",
  isRead: false, readAtUtc: null, createdAtUtc: "2026-11-25T10:00:00Z", ...over,
});
const routes = [
  {
    element: <RequireAuth />,
    children: [
      { path: "/inbox", element: <><NotificationBell /><InboxPage /></> },
      { path: `/orders/${ORDER}`, element: <div>order monitoring page</div> },
    ],
  },
  { path: "/login", element: <div>login</div> },
];

describe("admin inbox", () => {
  it("badges the bell, opens an order alert on the monitoring screen and marks it read once", async () => {
    signIn();
    let unread = 1;
    const { calls } = mockFetch([
      ...sessionRoutes(["orders.escalations.view"]),
      { method: "GET", path: "/api/v1/notifications/unread-count", respond: () => env({ unreadCount: unread }) },
      { method: "GET", path: "/api/v1/notifications", respond: () => env({ items: [n("a1")], page: 1, pageSize: 20, totalCount: 1, unreadCount: unread }) },
      { method: "POST", path: "/api/v1/notifications/a1/read", respond: () => ((unread = 0), env({ notificationId: "a1", isRead: true, wasAlreadyRead: false })) },
    ]);
    renderWithApp(routes, "/inbox");
    expect(await screen.findByRole("link", { name: "Notifications, 1 unread" })).toHaveAttribute("href", "/inbox");
    const list = await screen.findByRole("list", { name: "Notifications" });
    await userEvent.click(within(list).getByRole("button", { name: /Unread: Note a1/ }));
    expect(await screen.findByText("order monitoring page")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST" && c.url.pathname.endsWith("/read"))).toHaveLength(1);
    // Identity comes from the token only: no user id is ever sent.
    expect(calls.every((c) => !c.url.search.includes("userId"))).toBe(true);
  });

  it("shows an empty inbox", async () => {
    signIn();
    mockFetch([
      ...sessionRoutes(["orders.escalations.view"]),
      { method: "GET", path: "/api/v1/notifications/unread-count", respond: () => env({ unreadCount: 0 }) },
      { method: "GET", path: "/api/v1/notifications", respond: () => env({ items: [], page: 1, pageSize: 20, totalCount: 0, unreadCount: 0 }) },
    ]);
    renderWithApp(routes, "/inbox");
    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
  });
});

describe("admin notification routing", () => {
  const h = (notificationType: string, relatedEntityType: string, relatedEntityId: string | null = ORDER, navigationTarget: string | null = null) =>
    notificationHref({ notificationType, relatedEntityType, relatedEntityId, navigationTarget });

  it("routes by type and entity", () => {
    expect(h("ADMIN_NEW_ORDER_PLACED", "ORDER")).toBe(`/orders/${ORDER}`);
    expect(h("ADMIN_ORDER_SELLER_REJECTED", "ORDER")).toBe(`/orders/${ORDER}`);
    expect(h("FINANCE_RECONCILIATION_APPROVAL_REQUIRED", "ORDER")).toBe(`/orders/${ORDER}`);
    expect(h("ADMIN_SELLER_CONFIRMATION_ESCALATED", "ESCALATION", "e-1")).toBe("/orders/escalations/e-1");
    expect(h("ADMIN_ORDER_CLAIM_AWAITING_REVIEW", "CLAIM", "c-1")).toBe("/orders/claims");
    // Buyer/seller types have no screen in the console; unknown types stay in the inbox.
    expect(h("BUYER_ORDER_DELIVERED", "ORDER")).toBeNull();
    expect(h("SELLER_NEW_ORDER_RECEIVED", "SUB_ORDER")).toBeNull();
    expect(h("SOMETHING_NEW", "SOMETHING_NEW")).toBeNull();
    expect(h("ADMIN_NEW_ORDER_PLACED", "ORDER", "../team")).toBe("/orders");
  });

  it("maps backend canonical paths and rejects unsafe ones", () => {
    expect(h("ADMIN_NEW_ORDER_PLACED", "ORDER", null, "/admin/orders/o-1")).toBe("/orders/o-1");
    expect(h("FINANCE_RECONCILIATION_APPROVAL_REQUIRED", "ORDER", null, "/admin/financial/orders/o-1/reconciliation")).toBe("/orders/o-1");
    expect(h("BUYER_ORDER_DELIVERED", "ORDER", null, "/buyer/orders/o-1")).toBeNull();
    expect(h("ADMIN_NEW_ORDER_PLACED", "ORDER", "o-2", "https://evil.example")).toBe("/orders/o-2");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "/x:y", ""]) expect(safeInternalPath(bad)).toBeNull();
  });

  it("caps the badge", () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(250)).toBe("99+");
  });
});
