import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrdersPage from "../orders-page";
import OrderDetailPage from "../order-detail-page";
import PaymentAuthorizationsPage from "../payment-authorizations-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const ORD = "7856fffe-b325-4810-998f-ebe873fbd7c8";
const BASE = "/api/v1/admin/orders";
const PAY = "/api/v1/admin/payment-authorizations";
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
const summary = { ordersPlacedToday: 1, totalOrdersInPeriod: 3, awaitingSellerConfirmation: 1, sellerConfirmationOverdue: 1, inFulfillment: 1, completedOrders: 0, cancelledOrders: 1, paymentReconciliationRequired: 0, evaluatedAtUtc: "2026-11-21T12:25:00Z", fromUtc: null, toUtc: null };
const seller = { subOrderId: "s-1", subOrderNumber: "SO-10000001-S1", sellerOrganizationId: "416b15de-d308-49d5-a61a-c8274cc0ee08", sellerLegalName: "Test Seller LLC", sellerTradingName: "Test Seller", subOrderTotal: 41.35, status: "CONFIRMED", fulfillmentStatus: "NOT_STARTED", fulfillmentMethod: "SELF_COLLECTION", confirmationDeadlineUtc: "2026-11-22T11:40:00Z", isEscalated: false, isOverdue: false };
const row = (over: object = {}) => ({
  orderId: ORD, orderNumber: "SO-10000001", buyerUserId: "7cb13120-769d-4a34-ae96-84bca1606807", buyerOrganizationId: null, buyerDisplayName: "Hakeem", buyerEmail: null, buyerAccountType: "INDIVIDUAL",
  sellers: [seller], totalPayableAmount: 41.35, currency: "AED", orderStatus: "PENDING_CONFIRMATION", paymentStatus: "AUTHORIZED", paymentReference: "pi_1", paymentPreAuthAttemptId: "a-1",
  preAuthInternalStatus: "AUTHORIZED", preAuthRecoveryStatus: "NONE", authorizedAmount: 41.35, capturedAmount: 0, isPaymentCaptured: false, requiresPaymentReconciliation: false, createdAtUtc: "2026-11-21T11:45:00Z", earliestConfirmationDeadlineUtc: null, ...over,
});
const detail = (order: object = {}, payment: object = {}) => ({
  order: {
    orderId: ORD, orderNumber: "SO-10000001", buyerUserId: "7cb13120-769d-4a34-ae96-84bca1606807", buyerOrganizationId: null, orderDateUtc: "2026-11-21T11:45:00Z", currency: "AED", aggregateMaterialAmount: 39.38, applicableMaterialVat: 1.97,
    deliveryAmount: 0, deliveryVatAmount: 0, totalPayableAmount: 41.35, status: "PENDING_CONFIRMATION", paymentStatus: "AUTHORIZED", paymentReference: "pi_1", paymentAuthorizedAtUtc: null, rowVersion: "AAAAAAAACzw=", createdAtUtc: "2026-11-21T11:45:00Z", updatedAtUtc: null,
    subOrders: [{ ...seller, parentOrderId: ORD, materialSubtotal: 39.38, applicableMaterialVat: 1.97, claimStatus: "NONE", payoutEligibility: "NOT_ELIGIBLE", deliveredAtUtc: null, sellerConfirmedAtUtc: "2026-11-21T11:54:44Z", sellerRejectedAtUtc: null, sellerRejectionReason: null, timeRemainingSeconds: 82500, items: [{ orderLineId: "l-1", listingId: "x", titleSnapshot: "Industrial Steel Pipe Lot", thumbnailUrlSnapshot: "/api/v1/files/f1f1f1f1-0000-4000-8000-000000000001/download", quantity: 1, unitPrice: 39.38, currency: "AED", taxAmount: 1.97, lineSubtotal: 39.38, lineTotal: 41.35, isWholeLot: true }] }],
    ...order,
  },
  buyer: { buyerUserId: "7cb13120", buyerOrganizationId: null, buyerAccountType: "INDIVIDUAL", displayName: "Hakeem", email: null },
  payment: { attemptId: "a-1", paymentIntentId: "pi_3UeCgg", paymentProvider: "STRIPE", captureMethod: "manual", orderPaymentStatus: "AUTHORIZED", providerStatus: "requires_capture", internalStatus: "AUTHORIZED", recoveryStatus: "NONE", reservationStatus: "HELD_POST_AUTH", authorizedAmount: 41.35, capturableAmount: 41.35, capturedAmount: 0, refundedAmount: 0, currency: "AED", isProviderVerified: true, isPaymentCaptured: false, requiresReconciliation: false, paymentAuthorizedAtUtc: null, authorizationExpiresAtUtc: "2026-11-28T11:40:00Z", failureCode: null, failureMessage: null, ...payment },
  inventoryReservations: [], deliveryEvidence: [], claims: [], escalations: [], acceptanceEvents: [],
});
const timeline = { orderId: ORD, orderNumber: "SO-10000001", currentOrderStatus: "PENDING_CONFIRMATION", currentPaymentStatus: "AUTHORIZED", events: [{ eventId: "e1", eventType: "ORDER_PLACED", category: "ORDER_LIFECYCLE", description: "Order created.", actor: "u", source: "x", occurredAtUtc: "2026-11-21T11:45:00Z", subOrderNumber: null, fromStatus: "DRAFT", toStatus: "PENDING_CONFIRMATION", referenceId: null }] };

const routes = [
  { element: <RequireAuth />, children: [{ path: "/orders", element: <OrdersPage /> }, { path: "/orders/payments", element: <PaymentAuthorizationsPage /> }, { path: "/orders/:orderId", element: <OrderDetailPage /> }] },
  { path: "/login", element: <div>login</div> },
];

describe("BE-25 admin order monitoring", () => {
  it("shows the summary and the list; an authorised hold is never shown as captured", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/summary`, respond: () => ({ body: summary }) },
      { method: "GET", path: BASE, respond: () => ({ body: page([row(), row({ orderId: "o-2", orderNumber: "SO-10000002", paymentStatus: "CAPTURED", isPaymentCaptured: true, capturedAmount: 41.35, orderStatus: "COMPLETED" })]) }) },
    ]);
    const { router } = renderWithApp(routes, "/orders");
    expect(await screen.findByText("SO-10000001")).toBeInTheDocument();
    expect(screen.getByText("1 overdue")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Authorised hold · not captured")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Captured")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Awaiting seller/ }));
    await waitFor(() => expect(calls.filter((c) => c.url.pathname === BASE).at(-1)!.url.searchParams.get("status")).toBe("PENDING_CONFIRMATION"));
    await userEvent.click(await screen.findByText("SO-10000001"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/orders/${ORD}`));
  });

  it("cancels an order only with a reason, the order rowVersion and one idempotency key; no automatic retry", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let posts = 0;
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/${ORD}`, respond: () => ({ body: detail() }) },
      { method: "GET", path: `${BASE}/${ORD}/timeline`, respond: () => ({ body: timeline }) },
      { method: "POST", path: `${BASE}/${ORD}/cancel`, respond: () => ((posts += 1), { status: 409, body: { status: 409, code: "ORDER_FULFILLMENT_IN_PROGRESS", title: "Conflict" } }) },
    ]);
    renderWithApp(routes, `/orders/${ORD}`);
    expect(await screen.findByRole("heading", { name: "SO-10000001" })).toBeInTheDocument();
    expect(screen.getByText("Industrial Steel Pipe Lot")).toBeInTheDocument();
    expect(await screen.findByText("Order placed")).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been charged yet/)).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancel order" });
    expect(cancel).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Reason for cancelling/), "Buyer asked to cancel");
    await userEvent.click(cancel);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel order" }));
    expect(await screen.findByText(/already started fulfilling/)).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/cancel"))!.body as Record<string, string>;
    expect(post.reason).toBe("Buyer asked to cancel");
    expect(post.expectedRowVersion).toBe("AAAAAAAACzw=");
    expect(post.idempotencyKey).toMatch(/^admin_ord_cancel_/);
    expect(posts).toBe(1);
  });

  it("hides order cancel once the payment is captured", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/${ORD}`, respond: () => ({ body: detail({ status: "CONFIRMED", paymentStatus: "CAPTURED" }, { isPaymentCaptured: true, capturedAmount: 41.35 }) }) },
      { method: "GET", path: `${BASE}/${ORD}/timeline`, respond: () => ({ body: timeline }) },
    ]);
    renderWithApp(routes, `/orders/${ORD}`);
    expect(await screen.findByText(/payment is captured, so this order can't be cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

  it("cancels a stuck hold with a reason; holds tied to an order link to the order instead", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const stuck = { attemptId: "30d0148e-863a-4ae6-b687-cde8d3045e3f", checkoutCorrelationId: null, cartId: null, orderId: null, orderNumber: null, buyerUserId: "u", buyerOrganizationId: null, buyerAccountType: "INDIVIDUAL", paymentProvider: "STRIPE", paymentIntentId: "pi_stuck", authorizedAmount: 8349.09, capturableAmount: 8349.09, currency: "AED", providerStatus: "requires_capture", internalStatus: "RECONCILIATION_REQUIRED", recoveryStatus: "POST_AUTH_HOLD_FAILED", reservationStatus: "CONFLICT_OR_FAILED", isProviderVerified: true, failureCode: "POST_AUTH_HOLD_TRANSITION_FAILED", failureMessage: null, paymentAuthorizedAtUtc: null, authorizationExpiresAtUtc: null, cancelledAtUtc: null, createdAtUtc: "2026-11-21T11:24:42Z", updatedAtUtc: null };
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: PAY, respond: () => ({ body: page([stuck, { ...stuck, attemptId: "a-2", orderId: ORD, orderNumber: "SO-10000001", paymentIntentId: "pi_ord" }]) }) },
      { method: "POST", path: `${PAY}/${stuck.attemptId}/cancel`, respond: () => ({ body: { cancelled: true, isIdempotentReplay: false, code: "PAYMENT_PREAUTH_CANCELLED", message: "Payment pre-authorization cancelled." } }) },
    ]);
    renderWithApp(routes, "/orders/payments");
    expect(await screen.findByText("pi_stuck")).toBeInTheDocument();
    expect(calls.find((c) => c.url.pathname === PAY)!.url.searchParams.get("status")).toBe("RECONCILIATION_REQUIRED");
    expect(screen.getByRole("link", { name: "SO-10000001" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel hold" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel payment hold" }));
    expect(await within(dialog).findByText("Write the reason for cancelling.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/cancel"))).toBe(false);
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Orphaned hold after hold failure");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel payment hold" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/cancel"))!.body as Record<string, string>;
    expect(post.reason).toBe("Orphaned hold after hold failure");
    expect(post.idempotencyKey).toMatch(/^admin_pay_cancel_/);
  });

  it("explains a 403 instead of showing an empty list", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const forbidden = () => ({ status: 403, body: { status: 403, code: "FORBIDDEN", title: "Forbidden", detail: "Platform administrator authorization is required." } });
    mockFetch([...sessionRoutes(["catalog:listings:view"]), { method: "GET", path: `${BASE}/summary`, respond: forbidden }, { method: "GET", path: BASE, respond: forbidden }]);
    renderWithApp(routes, "/orders");
    expect(await screen.findByText("Your admin account can't see orders yet")).toBeInTheDocument();
  });

  it("resolves the order's relative photo route against the API host", async () => {
    const { orderAssetUrl } = await import("../order-detail-page");
    const { env } = await import("@/config/env");
    expect(orderAssetUrl("/api/v1/files/f1/download")).toBe(`${env.apiBaseUrl}/api/v1/files/f1/download`);
    expect(orderAssetUrl("api/v1/files/f1/download")).toBe(`${env.apiBaseUrl}/api/v1/files/f1/download`);
    expect(orderAssetUrl("https://cdn.example/x.jpg")).toBe("https://cdn.example/x.jpg");
    expect(orderAssetUrl(null)).toBeNull();
  });
});
