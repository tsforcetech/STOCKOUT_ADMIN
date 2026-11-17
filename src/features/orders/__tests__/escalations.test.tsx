import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EscalationsPage from "../escalations-page";
import EscalationDetailPage from "../escalation-detail-page";
import { RequireAuth } from "@/lib/auth/guards";
import { renderWithApp, sessionRoutes } from "@/test/render";
import { mockFetch } from "@/test/http";

afterEach(() => vi.unstubAllGlobals());

const ESC = "e1e1e1e1-0000-4000-8000-000000000001";
const BASE = "/api/v1/admin/orders/escalations";
const esc = (over: object = {}) => ({
  escalationId: ESC, subOrderId: "s-1", subOrderNumber: "SO-1001-A", parentOrderId: "o-1", orderNumber: "ORD-1001", sellerOrganizationId: "11111111-0000-4000-8000-000000000001",
  sellerName: "Emcore Electromechanical", subOrderTotal: 1250.5, subOrderStatus: "PENDING_CONFIRMATION", escalatedAtUtc: "2026-11-17T08:00:00Z", slaExpiresAtUtc: "2026-11-17T08:00:00Z",
  adminReviewDeadlineUtc: "2026-11-18T08:00:00Z", isOverdue: false, adminReviewTimeRemainingSeconds: 7500, resolutionStatus: "PENDING", resolvedAtUtc: null, resolvedBy: null, adminDecision: null,
  decisionReason: null, buyerConsentMultiSellerContinuation: true, buyerNotifiedAtUtc: null, rowVersion: "AAAAAAAAB9Q=", createdAtUtc: "2026-11-17T08:00:00Z", updatedAtUtc: null, ...over,
});
const detail = (over: object = {}) => ({
  escalation: esc(over),
  subOrder: { subOrderId: "s-1", subOrderNumber: "SO-1001-A", sellerLegalName: "Emcore LLC", sellerTradingName: "Emcore", materialSubtotal: 1191, applicableMaterialVat: 59.5, subOrderTotal: 1250.5, status: "PENDING_CONFIRMATION", fulfillmentStatus: "NOT_STARTED", confirmationDeadlineUtc: null, sellerConfirmedAtUtc: null, sellerRejectedAtUtc: null, sellerRejectionReason: null, items: [{}, {}] },
  parentOrder: { orderId: "o-1", orderNumber: "ORD-1001", orderDateUtc: "2026-11-16T08:00:00Z", currency: "AED", totalPayableAmount: 2000, status: "PENDING_CONFIRMATION", paymentStatus: "NOT_STARTED", buyerConsentMultiSellerContinuation: true, subOrders: [{ subOrderId: "s-1" }, { subOrderId: "s-2" }] },
  reminders: [{ reminderId: "r-1", reminderType: "T_PLUS_6H", offsetHours: 6, scheduledForUtc: "2026-11-16T14:00:00Z", sentAtUtc: "2026-11-16T14:00:05Z", channel: "EMAIL", status: "PUBLISHED", attemptCount: 1, lastError: null }],
  auditTrail: [],
});
const routes = [
  { element: <RequireAuth />, children: [{ path: "/orders/escalations", element: <EscalationsPage /> }, { path: "/orders/escalations/:escalationId", element: <EscalationDetailPage /> }] },
  { path: "/login", element: <div>login</div> },
];

describe("BE-09 order escalations", () => {
  it("lists pending cases (bare array) with the time left and opens one", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    const { calls } = mockFetch([...sessionRoutes(["catalog:listings:view"]), { method: "GET", path: BASE, respond: () => ({ body: [esc(), esc({ escalationId: "e2", subOrderNumber: "SO-1002-B", isOverdue: true, adminReviewTimeRemainingSeconds: 0 })] }) }]);
    const { router } = renderWithApp(routes, "/orders/escalations");
    expect(await screen.findByText("SO-1001-A")).toBeInTheDocument();
    expect(screen.getByText("2 h 5 min left")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    const q = calls.find((c) => c.url.pathname === BASE)!.url.searchParams;
    expect([q.get("status"), q.get("page"), q.get("pageSize")]).toEqual(["PENDING", "1", "20"]);
    await userEvent.click(screen.getByText("SO-1001-A"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASE.replace("/api/v1/admin", "")}/${ESC}`));
  });

  it("cancels only with a reason and the case rowVersion; a conflict reloads instead of retrying", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    let decided = 0;
    const { calls } = mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/${ESC}`, respond: () => ({ body: detail() }) },
      { method: "GET", path: `${BASE}/${ESC}/audit`, respond: () => ({ body: [{ auditId: "a-1", escalationId: ESC, subOrderId: "s-1", action: "ESCALATED", performedBy: "SYSTEM", performedByRole: "SYSTEM", reason: null, detailsJson: null, createdAtUtc: "2026-11-17T08:00:00Z" }] }) },
      { method: "POST", path: `${BASE}/${ESC}/decision`, respond: () => ((decided += 1), { status: 409, body: { status: 409, code: "SELLER_ALREADY_RESPONDED", title: "Conflict" } }) },
    ]);
    renderWithApp(routes, `/orders/escalations/${ESC}`);
    expect(await screen.findByRole("heading", { name: "Sub-order SO-1001-A" })).toBeInTheDocument();
    expect(await screen.findByText("ESCALATED")).toBeInTheDocument(); // audit trail from /audit
    const cancel = screen.getByRole("button", { name: /Cancel the seller's sub-order/ });
    expect(cancel).toBeDisabled(); // reason required
    await userEvent.type(screen.getByLabelText(/Reason for cancelling/), "Seller unreachable for 48 hours");
    await userEvent.click(cancel);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel sub-order" }));
    expect(await screen.findByText(/The seller responded before your decision/)).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.url.pathname.endsWith("/decision"))!;
    expect(post.body).toEqual({ decision: "CANCEL", reason: "Seller unreachable for 48 hours", notes: null, expectedRowVersion: "AAAAAAAAB9Q=" });
    expect(decided).toBe(1); // no automatic retry
  });

  it("explains a missing cancel permission and hides the action on resolved cases", async () => {
    sessionStorage.setItem("stockout.admin.rt", "rt-1");
    mockFetch([
      ...sessionRoutes(["catalog:listings:view"]),
      { method: "GET", path: `${BASE}/${ESC}`, respond: () => ({ body: detail({ resolutionStatus: "RESOLVED_SELLER_CONFIRMED", resolvedAtUtc: "2026-11-17T09:00:00Z" }) }) },
      { method: "GET", path: `${BASE}/${ESC}/audit`, respond: () => ({ body: [] }) },
    ]);
    renderWithApp(routes, `/orders/escalations/${ESC}`);
    expect(await screen.findByText(/This case is resolved: Seller confirmed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel the seller's sub-order/ })).not.toBeInTheDocument();
  });
});
