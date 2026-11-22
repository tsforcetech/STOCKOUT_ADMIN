import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderDetailPage from "../order-detail-page";
import ClaimsPage from "../claims-page";
import { nextDeliverySteps } from "../delivery-panel";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const ORD = "7856fffe-b325-4810-998f-ebe873fbd7c8";
const SUB = "f22d15b9-dd34-47dd-8441-4d8f06bcc118";
const BASE = "/api/v1/admin/orders";
const sub = (over: object = {}) => ({
  subOrderId: SUB, subOrderNumber: "SO-10000002-S1", sellerOrganizationId: "416b15de", sellerLegalName: "Shalom Technicals Services LLC", sellerTradingName: null, materialSubtotal: 15.42, applicableMaterialVat: 0.77, subOrderTotal: 16.19,
  status: "CONFIRMED", fulfillmentStatus: "PREPARING", fulfillmentMethod: "STOCKOUT_DELIVERY", claimStatus: "NONE", payoutEligibility: "NOT_ELIGIBLE", deliveredAtUtc: null, sellerConfirmedAtUtc: "2026-11-22T19:48:00Z",
  sellerRejectedAtUtc: null, sellerRejectionReason: null, confirmationDeadlineUtc: null, isEscalated: false, isOverdue: false, timeRemainingSeconds: null, rowVersion: "AAAAAAAAC1A=",
  items: [{ orderLineId: "l-1", listingId: "x", titleSnapshot: 'U-Bolt 3"', thumbnailUrlSnapshot: null, quantity: 1, unitPrice: 6.46, currency: "AED", taxAmount: 0.32, lineSubtotal: 6.46, lineTotal: 6.78, isWholeLot: false }],
  ...over,
});
const detail = (s: object = {}) => ({
  order: { orderId: ORD, orderNumber: "SO-10000002", buyerUserId: "b", buyerOrganizationId: null, orderDateUtc: "2026-11-22T11:47:00Z", currency: "AED", aggregateMaterialAmount: 15.42, applicableMaterialVat: 0.77, deliveryAmount: 0, deliveryVatAmount: 0, totalPayableAmount: 16.19, status: "IN_FULFILLMENT", paymentStatus: "AUTHORIZED", paymentReference: "pi_1", rowVersion: "AAAAAAAACzw=", subOrders: [sub(s)] },
  buyer: { buyerUserId: "b", buyerOrganizationId: null, buyerAccountType: "BUSINESS", displayName: "Sharaco", email: null },
  payment: { attemptId: "a-1", paymentIntentId: "pi_1", paymentProvider: "STRIPE", captureMethod: "manual", orderPaymentStatus: "AUTHORIZED", providerStatus: "requires_capture", internalStatus: "AUTHORIZED", recoveryStatus: "NONE", reservationStatus: "HELD_POST_AUTH", authorizedAmount: 16.19, capturableAmount: 16.19, capturedAmount: 0, refundedAmount: 0, currency: "AED", isProviderVerified: true, isPaymentCaptured: false, requiresReconciliation: false, paymentAuthorizedAtUtc: null, authorizationExpiresAtUtc: null, failureCode: null, failureMessage: null },
  inventoryReservations: [], deliveryEvidence: [], claims: [], escalations: [], acceptanceEvents: [],
});
const timeline = { orderId: ORD, orderNumber: "SO-10000002", currentOrderStatus: "IN_FULFILLMENT", currentPaymentStatus: "AUTHORIZED", events: [] };
const routes = [
  { element: <RequireAuth />, children: [{ path: "/orders/claims", element: <ClaimsPage /> }, { path: "/orders/:orderId", element: <OrderDetailPage /> }] },
  { path: "/login", element: <div>login</div> },
];

describe("admin freight delivery (OJ: StockOut delivery steps)", () => {
  it("offers only the next freight step, and never for collection orders or unconfirmed parts", () => {
    expect(nextDeliverySteps({ status: "CONFIRMED", fulfillmentStatus: "NOT_STARTED", fulfillmentMethod: "STOCKOUT_DELIVERY" })).toEqual(["PREPARING", "IN_TRANSIT"]);
    expect(nextDeliverySteps({ status: "IN_FULFILLMENT", fulfillmentStatus: "IN_TRANSIT", fulfillmentMethod: "STOCKOUT_DELIVERY" })).toEqual(["DELIVERED"]);
    expect(nextDeliverySteps({ status: "IN_FULFILLMENT", fulfillmentStatus: "DELIVERED", fulfillmentMethod: "STOCKOUT_DELIVERY" })).toEqual([]);
    expect(nextDeliverySteps({ status: "PENDING_CONFIRMATION", fulfillmentStatus: "NOT_STARTED", fulfillmentMethod: "STOCKOUT_DELIVERY" })).toEqual([]);
    expect(nextDeliverySteps({ status: "CONFIRMED", fulfillmentStatus: "NOT_STARTED", fulfillmentMethod: "SELF_COLLECTION" })).toEqual([]);
  });

  it("marks in transit with the sub-order rowVersion, then delivered only with a proof reference; proof is listed", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let state = "PREPARING";
    const evidence: unknown[] = [];
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/${ORD}`, respond: () => ({ body: detail({ fulfillmentStatus: state }) }) },
      { method: "GET", path: `${BASE}/${ORD}/timeline`, respond: () => ({ body: timeline }) },
      { method: "GET", path: `${BASE}/suborders/${SUB}/evidence`, respond: () => ({ body: evidence }) },
      {
        method: "POST",
        path: `${BASE}/suborders/${SUB}/fulfillment`,
        respond: ({ body }) => {
          const b = body as { status: string; proofReference: string | null };
          state = b.status;
          if (b.proofReference) evidence.push({ evidenceId: "ev-1", subOrderId: SUB, orderId: ORD, evidenceType: "STOCKOUT_DELIVERY_PROOF", fileAssetId: null, documentReference: b.proofReference, recordedBy: "admin", recordedAtUtc: "2026-11-23T09:00:00Z", verificationStatus: "VERIFIED", verifiedBy: "admin", verifiedAtUtc: "2026-11-23T09:00:00Z", notes: null });
          return { body: sub({ fulfillmentStatus: state }) };
        },
      },
    ]);
    renderWithApp(routes, `/orders/${ORD}`);
    await userEvent.click(await screen.findByRole("button", { name: "Mark in transit" }));
    const dlg = await screen.findByRole("dialog");
    await userEvent.click(within(dlg).getByRole("button", { name: "Mark in transit" }));
    expect(await screen.findByText("Marked in transit.")).toBeInTheDocument();
    const first = calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/fulfillment"))!;
    expect(first.body).toEqual({ status: "IN_TRANSIT", proofReference: null, remarks: null, expectedRowVersion: "AAAAAAAAC1A=", timestampUtc: null });

    await userEvent.click(await screen.findByRole("button", { name: "Mark delivered" }));
    const dlg2 = await screen.findByRole("dialog");
    expect(within(dlg2).getByRole("button", { name: "Mark delivered" })).toBeDisabled(); // proof required
    await userEvent.type(within(dlg2).getByLabelText(/Proof reference/), "POD-55120");
    await userEvent.click(within(dlg2).getByRole("button", { name: "Mark delivered" }));
    expect(await screen.findByText("POD-55120")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Mark / })).not.toBeInTheDocument());
  });

  it("explains a concurrency conflict instead of retrying", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let posts = 0;
    mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/${ORD}`, respond: () => ({ body: detail() }) },
      { method: "GET", path: `${BASE}/${ORD}/timeline`, respond: () => ({ body: timeline }) },
      { method: "GET", path: `${BASE}/suborders/${SUB}/evidence`, respond: () => ({ body: [] }) },
      { method: "POST", path: `${BASE}/suborders/${SUB}/fulfillment`, respond: () => ((posts += 1), { status: 409, body: { status: 409, code: "CONCURRENCY_CONFLICT", title: "Conflict" } }) },
    ]);
    renderWithApp(routes, `/orders/${ORD}`);
    await userEvent.click(await screen.findByRole("button", { name: "Mark in transit" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Mark in transit" }));
    expect(await screen.findByText(/changed since the page loaded/)).toBeInTheDocument();
    expect(posts).toBe(1);
  });

  it("lists buyer claims (bare array) with a link to the order", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/claims`, respond: () => ({ body: [{ claimId: "c-1", subOrderId: SUB, orderId: ORD, buyerUserId: "b", sellerOrganizationId: "s", orderLineId: "l-1", claimReason: "Two U-bolts arrived bent", affectedQuantity: 2, evidenceReference: "IMG-2", status: "FILED", createdAtUtc: "2026-11-24T08:00:00Z", updatedAtUtc: null, resolvedAtUtc: null, resolvedBy: null, resolutionNotes: null }] }) },
    ]);
    renderWithApp(routes, "/orders/claims?status=FILED");
    expect(await screen.findByText("Two U-bolts arrived bent")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open order" })).toHaveAttribute("href", `/orders/${ORD}`);
    expect(calls.find((c) => c.url.pathname === `${BASE}/claims`)!.url.searchParams.get("status")).toBe("FILED");
    expect(screen.getByText(/not yet resolved in StockOut/)).toBeInTheDocument();
  });
});
