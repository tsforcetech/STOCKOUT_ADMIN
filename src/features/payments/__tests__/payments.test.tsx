import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentsPage from "../payments-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const ORDER = "0a0a0a0a-0000-4000-8000-000000000001";
const SUB = "0b0b0b0b-0000-4000-8000-000000000002";
const BASE = "/api/v1/admin/financial";
const routes = [{ element: <RequireAuth />, children: [{ path: "/payments", element: <PaymentsPage /> }] }, { path: "/login", element: <div>login</div> }];
const commission = {
  orderId: ORDER, orderNumber: "ORD-2001", currency: "AED", aggregateMaterialAmount: 1000, aggregateMaterialVat: 50, aggregateDeliveryAmount: 100, aggregateDeliveryVat: 5, totalBuyerPayable: 1155,
  totalPlatformServiceCharge: 50, totalCommissionVat: 2.5, totalPlatformRetainedRevenue: 52.5, totalSellerPayoutAllocation: 997.5, roundingResidual: 0,
  subOrders: [{ subOrderId: SUB, sellerOrganizationId: "s", subOrderNumber: "SO-2001-A", materialSubtotal: 1000, applicableMaterialVat: 50, subOrderTotal: 1050, sellerFundedDiscount: 0, netMaterialValueBase: 1000, platformServiceCharge: 50, commissionVatAmount: 2.5, totalPlatformDeduction: 52.5, netSellerPayoutAllocation: 997.5 }],
};

describe("Payments & Payouts finance checks", () => {
  it("looks up an order: commission, capture readiness and a refund evaluation (nothing executed)", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/orders/${ORDER}/commission-breakdown`, respond: () => ({ body: commission }) },
      { method: "GET", path: `${BASE}/orders/${ORDER}/capture-readiness`, respond: () => ({ body: { orderId: ORDER, orderNumber: "ORD-2001", currentPaymentStatus: "AUTHORIZED", canCapture: false, requiresReconciliation: false, code: "SELLER_CONFIRMATION_PENDING", description: "Waiting for seller confirmation.", isProviderExecutionGated: true, evaluatedAtUtc: "2026-11-18T06:00:00Z" } }) },
      { method: "POST", path: `${BASE}/orders/${ORDER}/evaluate-refund`, respond: () => ({ body: { orderId: ORDER, orderNumber: "ORD-2001", canRefund: true, isPreCaptureCancellation: true, code: "PRE_CAPTURE_VOID", description: "Void the authorization.", eligibleRefundAmount: 200, commissionReversalAmount: 10, commissionVatReversalAmount: 0.5, isProviderExecutionGated: true, evaluatedAtUtc: "2026-11-18T06:00:00Z" } }) },
    ]);
    renderWithApp(routes, "/payments");
    await userEvent.type(await screen.findByRole("textbox", { name: "Order ID" }), ORDER);
    await userEvent.click(screen.getAllByRole("button", { name: /Check/ })[0]);
    expect(await screen.findByText("Commission breakdown · ORD-2001")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Sub-order commission" })).getByText("SO-2001-A")).toBeInTheDocument();
    expect(await screen.findByText("Not ready to capture")).toBeInTheDocument();
    expect(screen.getAllByText("Live execution off").length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText(/Amount \(AED\)/), "200");
    await userEvent.type(screen.getByLabelText("Reason"), "Damaged on arrival");
    await userEvent.click(screen.getByRole("button", { name: "Evaluate" }));
    expect(await screen.findByText(/Refund possible/)).toBeInTheDocument();
    expect(screen.getByText("Pre-capture cancellation (void)")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/evaluate-refund"))!;
    expect(post.body).toEqual({ orderId: ORDER, requestedRefundAmount: 200, reason: "Damaged on arrival", subOrderId: null });
  });

  it("shows the seller settlement checklist and an unknown order clearly", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/suborders/${SUB}/settlement-eligibility`, respond: () => ({ body: { subOrderId: SUB, subOrderNumber: "SO-2001-A", sellerOrganizationId: "s", isEligible: false, payoutEligibilityStatus: "NOT_ELIGIBLE", netPayableAmount: 997.5, deductedCommission: 50, deductedCommissionVat: 2.5, settlementCurrency: "AED", isTransferExecutionGated: true, passingChecks: ["Seller payouts enabled"], failingChecks: ["Delivery not confirmed"], summary: "1 check not met.", evaluatedAtUtc: "2026-11-18T06:00:00Z" } }) },
      { method: "GET", path: /\/orders\/[^/]+\/(commission-breakdown|capture-readiness)$/, respond: () => ({ status: 404, body: { status: 404, code: "ORDER_NOT_FOUND", title: "Not Found" } }) },
    ]);
    renderWithApp(routes, `/payments?subOrder=${SUB}&order=${ORDER}`);
    expect(await screen.findByText("Not eligible yet")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Failing checks" })).getByText(/Delivery not confirmed/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("No order with that ID.").length).toBe(2));
  });
});
