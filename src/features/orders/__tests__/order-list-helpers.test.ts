import { describe, expect, it } from "vitest";
import type { AdminOrderListItemDto } from "@/api/types/admin-orders";
import { confirmBy, friendlyDate, orderFulfilment, ordersCsv, rangeBounds } from "../order-list-helpers";

const seller = (status: string, fulfillmentStatus = "NOT_STARTED", extra: Partial<AdminOrderListItemDto["sellers"][number]> = {}) =>
  ({ subOrderId: "s", subOrderNumber: "SO-1-S1", sellerOrganizationId: "org", sellerLegalName: null, sellerTradingName: "XYZ", subOrderTotal: 10, status, fulfillmentStatus, fulfillmentMethod: "STOCKOUT_DELIVERY", confirmationDeadlineUtc: null, isEscalated: false, isOverdue: false, ...extra }) as AdminOrderListItemDto["sellers"][number];

describe("orderFulfilment (from seller parts, not the stale parent status)", () => {
  it("reads each step", () => {
    expect(orderFulfilment([seller("PENDING_CONFIRMATION")]).label).toBe("Awaiting seller");
    expect(orderFulfilment([seller("CONFIRMED")]).label).toBe("Confirmed");
    expect(orderFulfilment([seller("IN_FULFILLMENT", "IN_TRANSIT")]).label).toBe("In transit");
    expect(orderFulfilment([seller("CONFIRMED", "DELIVERED")]).label).toBe("Delivered");
    expect(orderFulfilment([seller("ACCEPTED", "DELIVERED")]).label).toBe("Accepted");
    expect(orderFulfilment([seller("REJECTED")]).label).toBe("Rejected");
  });
  it("multi-seller shows the least advanced part and how many are delivered", () => {
    const f = orderFulfilment([seller("CONFIRMED", "DELIVERED"), seller("IN_FULFILLMENT", "PREPARING")]);
    expect(f).toMatchObject({ label: "Preparing", detail: "1 of 2 delivered" });
    expect(orderFulfilment([seller("REJECTED"), seller("CONFIRMED")]).detail).toBe("1 of 2 sellers out");
  });
});

describe("dates and clocks", () => {
  const now = new Date("2026-11-22T15:00:00");
  it("friendly dates", () => {
    expect(friendlyDate(new Date("2026-11-22T06:55:00").toISOString(), now)).toMatch(/^Today at 6:55/);
    expect(friendlyDate(new Date("2026-11-21T23:55:00").toISOString(), now)).toMatch(/^Yesterday at 11:55/);
    expect(friendlyDate(new Date("2025-03-02T10:00:00").toISOString(), now)).toBe("2 Mar 2025");
  });
  it("confirm-by countdown only while a seller is pending", () => {
    const o = { sellers: [seller("PENDING_CONFIRMATION")], earliestConfirmationDeadlineUtc: new Date(now.getTime() + 5 * 3600_000 + 20 * 60_000).toISOString() };
    expect(confirmBy(o, now)).toEqual({ text: "Confirm in 5h 20m", overdue: false });
    expect(confirmBy({ ...o, earliestConfirmationDeadlineUtc: new Date(now.getTime() - 2 * 3600_000).toISOString() }, now)).toEqual({ text: "Overdue 2h 00m", overdue: true });
    expect(confirmBy({ ...o, sellers: [seller("CONFIRMED")] }, now)).toBeNull();
  });
  it("period bounds", () => {
    expect(rangeBounds("", "", "", now)).toEqual({});
    expect(new Date(rangeBounds("today", "", "", now).fromUtc!).getHours()).toBe(0);
    const c = rangeBounds("custom", "2026-11-01", "2026-11-10", now);
    expect(new Date(c.fromUtc!).getDate()).toBe(1);
    expect(new Date(c.toUtc!).getDate()).toBe(10);
    expect(rangeBounds("custom", "bad", "", now)).toEqual({ fromUtc: undefined, toUtc: undefined });
  });
});

describe("ordersCsv", () => {
  it("one row per order, quoted, formula-safe, with fulfilment and payment wording", () => {
    const csv = ordersCsv([
      { orderId: "o", orderNumber: "SO-1", buyerUserId: "u", buyerOrganizationId: null, buyerDisplayName: '=HYPERLINK("x")', buyerEmail: "b@x.ae", buyerAccountType: "BUSINESS", sellers: [seller("CONFIRMED", "IN_TRANSIT")], totalPayableAmount: 41.35, currency: "AED", orderStatus: "PENDING_CONFIRMATION", paymentStatus: "AUTHORIZED", paymentReference: "pi_1", paymentPreAuthAttemptId: null, preAuthInternalStatus: null, preAuthRecoveryStatus: null, authorizedAmount: 41.35, capturedAmount: 0, isPaymentCaptured: false, requiresPaymentReconciliation: false, createdAtUtc: "2026-11-21T19:51:48Z", earliestConfirmationDeadlineUtc: null },
    ]);
    const [head, line] = csv.split("\r\n");
    expect(head).toContain('"Fulfilment","Payment"');
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line).toContain('"In transit"');
    expect(line).toContain('"41.35"');
    expect(line).not.toMatch(/"Captured"/);
  });
});
