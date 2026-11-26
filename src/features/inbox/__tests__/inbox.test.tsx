import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";
import { inboxHref } from "../inbox-target";
import InboxPage from "../inbox-page";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const ORD = "7856fffe-b325-4810-998f-ebe873fbd7c8";

describe("admin inbox links (handoff 26 Nov §5)", () => {
  it("maps the server's admin targets onto console routes and refuses unsafe ones", () => {
    expect(inboxHref({ navigationTarget: `/admin/orders/${ORD}`, relatedEntityType: "ORDER", relatedEntityId: ORD })).toBe(`/orders/${ORD}`);
    expect(inboxHref({ navigationTarget: `/admin/financial/orders/${ORD}/reconciliation`, relatedEntityType: "ORDER", relatedEntityId: ORD })).toBe(`/orders/${ORD}`);
    expect(inboxHref({ navigationTarget: null, relatedEntityType: "ORDER", relatedEntityId: ORD })).toBe(`/orders/${ORD}`);
    expect(inboxHref({ navigationTarget: `/buyer/orders/${ORD}`, relatedEntityType: null, relatedEntityId: null })).toBeNull();
    expect(inboxHref({ navigationTarget: "https://evil.example", relatedEntityType: null, relatedEntityId: null })).toBeNull();
    expect(inboxHref({ navigationTarget: "javascript:alert(1)", relatedEntityType: null, relatedEntityId: null })).toBeNull();
  });
});

describe("admin inbox page", () => {
  it("lists the admin's notifications, marks one read and opens the order", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const n = { notificationId: "n1", recipientOrganizationId: null, notificationType: "ADMIN_NEW_ORDER_PLACED", title: "New order SO-10000003", message: "A buyer placed an order.", relatedEntityType: "ORDER", relatedEntityId: ORD, navigationTarget: `/admin/orders/${ORD}`, scope: "PERSONAL", channel: "IN_APP", deliveryStatus: "DELIVERED", isRead: false, readAtUtc: null, createdAtUtc: "2026-11-26T15:01:40Z" };
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: "/api/v1/notifications", respond: () => ({ body: { success: true, data: { items: [n], page: 1, pageSize: 20, totalCount: 1, unreadCount: 1 } } }) },
      { method: "POST", path: "/api/v1/notifications/n1/read", respond: () => ({ body: { success: true, data: { notificationId: "n1", isRead: true, wasAlreadyRead: false } } }) },
      { method: "GET", path: `/api/v1/admin/orders/${ORD}`, respond: () => ({ status: 404, body: {} }) },
    ]);
    const { router } = renderWithApp([{ path: "/inbox", element: <InboxPage /> }, { path: "/orders/:id", element: <p>order page</p> }], "/inbox");
    await userEvent.click(await screen.findByRole("button", { name: /Unread: New order SO-10000003/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/orders/${ORD}`));
    expect(calls.some((c) => c.method === "POST" && c.url.pathname === "/api/v1/notifications/n1/read")).toBe(true);
  });
});
